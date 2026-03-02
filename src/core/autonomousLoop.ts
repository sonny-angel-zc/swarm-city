import path from 'path';
import { createLinearIssueServer, getTopTodoIssue, LINEAR_TEAM_ID, listLinearIssues, updateIssueStateByType } from './linearServer';
import { detectRetryKind, executeAutonomousTaskWithCodex, runCodexExec } from './orchestrator';
import { checkDevServerHealth, performBootSelfHealing, requestDevServerRestart } from './selfHealing';

type AutonomousEventType = 'info' | 'error' | 'warning';

export type AutonomousEvent = {
  id: number;
  timestamp: number;
  type: AutonomousEventType;
  message: string;
};

export type AutonomousCompletedTask = {
  issueId: string;
  identifier: string;
  title: string;
  completedAt: number;
};

export type AutonomousState = {
  enabled: boolean;
  running: boolean;
  paused: boolean;
  pauseReason: string | null;
  cooldownUntil: number | null;
  intervalMs: number;
  currentTask: {
    issueId: string;
    identifier: string;
    title: string;
  } | null;
  completedTasks: AutonomousCompletedTask[];
  events: AutonomousEvent[];
  seeded: boolean;
  lastTickAt: number | null;
};

type Runtime = {
  started: boolean;
  bootRecoveryDone: boolean;
  timer: NodeJS.Timeout | null;
  state: AutonomousState;
  eventId: number;
  lock: boolean;
  consecutiveErrors: number;
};

const DEFAULT_INTERVAL_MS = Number(process.env.SWARM_AUTONOMOUS_INTERVAL_MS ?? '60000');
const DEFAULT_COOLDOWN_MS = Number(process.env.SWARM_AUTONOMOUS_COOLDOWN_MS ?? '90000');
const DEFAULT_ENABLED = (process.env.SWARM_AUTONOMOUS_DEFAULT_ON ?? 'true').toLowerCase() !== 'false';
const PROJECT_ROOT = path.resolve(process.cwd());

const SEED_TASKS: Array<{ title: string; description: string; priority: number }> = [
  {
    title: 'Add loading states and error boundaries to all components',
    description: 'Audit UI routes/components and add robust loading/error handling where missing.',
    priority: 3,
  },
  {
    title: 'Add keyboard shortcuts for common actions',
    description: 'Implement keyboard shortcuts for key dashboard actions and document the bindings.',
    priority: 3,
  },
  {
    title: 'Improve mobile responsiveness of the sidebar panels',
    description: 'Improve layout behavior for small screens and touch interaction.',
    priority: 3,
  },
  {
    title: 'Add a settings panel for configuring model preferences',
    description: 'Create a settings UI for model/provider preferences and persist selection.',
    priority: 3,
  },
  {
    title: 'Add real-time cost tracking with budget alerts',
    description: 'Add budget threshold alerts and better live cost visibility in the UI.',
    priority: 2,
  },
  {
    title: 'Write README.md with setup instructions for new users',
    description: 'Document setup, env vars, scripts, and the architecture at a high level.',
    priority: 3,
  },
];

const globalRuntime = globalThis as unknown as { __swarmAutonomousRuntime?: Runtime };

function createInitialState(): AutonomousState {
  return {
    enabled: DEFAULT_ENABLED,
    running: false,
    paused: false,
    pauseReason: null,
    cooldownUntil: null,
    intervalMs: Math.max(10_000, DEFAULT_INTERVAL_MS),
    currentTask: null,
    completedTasks: [],
    events: [],
    seeded: false,
    lastTickAt: null,
  };
}

if (!globalRuntime.__swarmAutonomousRuntime) {
  globalRuntime.__swarmAutonomousRuntime = {
    started: false,
    bootRecoveryDone: false,
    timer: null,
    state: createInitialState(),
    eventId: 0,
    lock: false,
    consecutiveErrors: 0,
  };
}

function runtime(): Runtime {
  return globalRuntime.__swarmAutonomousRuntime as Runtime;
}

function addEvent(message: string, type: AutonomousEventType = 'info') {
  const rt = runtime();
  rt.eventId += 1;
  rt.state.events = [
    ...rt.state.events,
    { id: rt.eventId, timestamp: Date.now(), type, message },
  ].slice(-300);
}

function toPriorityValue(priority: string): number {
  return priority === 'P2' ? 3 : 4;
}

function normalizePriority(raw: unknown): 'P2' | 'P3' {
  const text = String(raw ?? '').toUpperCase();
  return text.includes('P2') ? 'P2' : 'P3';
}

async function generateImprovements(summary: string): Promise<Array<{ title: string; description: string; priority: 'P2' | 'P3' }>> {
  const prompt = [
    'You are a reflection agent for a self-improving software system.',
    'Given the completed work summary below, propose up to 3 concrete improvement tasks.',
    'Return ONLY valid JSON array. No markdown.',
    'Each item must have:',
    '- title (string)',
    '- description (string)',
    '- priority ("P2" or "P3")',
    '',
    'Completed Work Summary:',
    summary.slice(-5000),
  ].join('\n');

  const res = await runCodexExec({
    prompt,
    workDir: PROJECT_ROOT,
    model: process.env.SWARM_AUTONOMOUS_MODEL ?? 'gpt-5.3-codex',
    sandbox: 'read-only',
  });

  if (res.code !== 0) return [];

  const match = res.text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as Array<{ title?: string; description?: string; priority?: string }>;
    return parsed
      .map((item) => ({
        title: item.title?.trim() ?? '',
        description: item.description?.trim() ?? '',
        priority: normalizePriority(item.priority),
      }))
      .filter((item) => item.title.length > 0 && item.description.length > 0)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function seedAutonomousBacklog(): Promise<{ created: number; skipped: number }> {
  const existing = await listLinearIssues(LINEAR_TEAM_ID);
  const existingTitles = new Set(existing.map((issue) => issue.title.trim().toLowerCase()));
  let created = 0;
  let skipped = 0;

  for (const task of SEED_TASKS) {
    if (existingTitles.has(task.title.trim().toLowerCase())) {
      skipped += 1;
      continue;
    }
    await createLinearIssueServer({
      title: task.title,
      description: task.description,
      priority: task.priority,
      stateType: 'unstarted',
      teamId: LINEAR_TEAM_ID,
    });
    created += 1;
  }

  return { created, skipped };
}

async function tickLoop() {
  const rt = runtime();
  if (!rt.state.enabled || rt.lock) return;

  const now = Date.now();
  rt.state.lastTickAt = now;

  if (rt.state.paused && rt.state.cooldownUntil && now < rt.state.cooldownUntil) {
    return;
  }
  if (rt.state.paused && rt.state.cooldownUntil && now >= rt.state.cooldownUntil) {
    rt.state.paused = false;
    rt.state.cooldownUntil = null;
    rt.state.pauseReason = null;
    addEvent('Autonomous mode resumed after cooldown.');
  }

  rt.lock = true;
  rt.state.running = true;

  try {
    if (!rt.state.seeded) {
      const seed = await seedAutonomousBacklog();
      rt.state.seeded = true;
      addEvent(`Backlog seed complete (${seed.created} created, ${seed.skipped} already existed).`);
    }

    const health = await checkDevServerHealth();
    if (!health.ok) {
      requestDevServerRestart(`autonomous pre-task health failed (${health.error ?? 'unhealthy'})`);
      addEvent(`Dev server health check failed (${health.error ?? 'unhealthy'}). Requested supervised restart.`, 'warning');
      return;
    }

    const issue = await getTopTodoIssue(LINEAR_TEAM_ID);
    if (!issue) {
      rt.state.currentTask = null;
      return;
    }

    rt.state.currentTask = {
      issueId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
    };
    addEvent(`Picked ${issue.identifier}: ${issue.title}`);

    const started = await updateIssueStateByType(issue.id, 'started', LINEAR_TEAM_ID);
    if (!started) {
      addEvent(`Failed to move ${issue.identifier} to started state.`, 'warning');
      return;
    }

    const execution = await executeAutonomousTaskWithCodex({
      title: issue.title,
      description: issue.description,
      workDir: PROJECT_ROOT,
      model: process.env.SWARM_AUTONOMOUS_MODEL ?? 'gpt-5.3-codex',
    });

    for (const restart of execution.restarts) {
      addEvent(`[restart] ${restart}`, 'warning');
    }

    if (!execution.ok) {
      const retryKind = detectRetryKind(execution.output);
      if (execution.rateLimited || retryKind === 'rate_limit') {
        const retryAfter = execution.retryAfterMs ?? DEFAULT_COOLDOWN_MS;
        rt.state.paused = true;
        rt.state.cooldownUntil = Date.now() + Math.max(30_000, retryAfter);
        rt.state.pauseReason = 'All providers are rate-limited. Waiting for cooldown.';
        addEvent(`Paused autonomous loop due to rate limits for ${Math.ceil((Math.max(30_000, retryAfter)) / 1000)}s.`, 'warning');
      } else {
        addEvent(`Execution failed for ${issue.identifier}: ${execution.output.slice(0, 240)}`, 'error');
      }
      await updateIssueStateByType(issue.id, 'unstarted', LINEAR_TEAM_ID);
      return;
    }

    const completed = await updateIssueStateByType(issue.id, 'completed', LINEAR_TEAM_ID);
    if (!completed) {
      addEvent(`Task executed but failed to mark ${issue.identifier} as completed.`, 'warning');
    }
    addEvent(`Completed ${issue.identifier}: ${issue.title}`);
    rt.state.completedTasks = [
      {
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        completedAt: Date.now(),
      },
      ...rt.state.completedTasks,
    ].slice(0, 50);

    const improvements = await generateImprovements(execution.output);
    if (improvements.length === 0) return;

    let generatedCount = 0;
    for (const task of improvements) {
      const created = await createLinearIssueServer({
        title: task.title,
        description: task.description,
        priority: toPriorityValue(task.priority),
        stateType: 'unstarted',
        labels: ['generated'],
        teamId: LINEAR_TEAM_ID,
      });
      if (created) generatedCount += 1;
    }
    if (generatedCount > 0) {
      addEvent(`Generated ${generatedCount} follow-up improvement task(s).`);
    }
  } finally {
    rt.state.running = false;
    rt.lock = false;
  }
}

async function safeTick() {
  const rt = runtime();
  try {
    await tickLoop();
    rt.consecutiveErrors = 0;
  } catch (err) {
    rt.consecutiveErrors += 1;
    addEvent(`Autonomous loop error: ${String(err)}`, 'error');
    if (rt.consecutiveErrors >= 3) {
      const cooldownMs = 2 * 60 * 1000;
      rt.state.paused = true;
      rt.state.cooldownUntil = Date.now() + cooldownMs;
      rt.state.pauseReason = 'Paused after 3 consecutive autonomous errors.';
      addEvent(`Autonomous loop paused for ${cooldownMs / 1000}s after 3 consecutive errors.`, 'warning');
      rt.consecutiveErrors = 0;
    }
  }
}

export function startAutonomousLoop() {
  const rt = runtime();
  if (rt.started) return;
  rt.started = true;
  addEvent('Autonomous loop booted.');
  if (!rt.bootRecoveryDone) {
    rt.bootRecoveryDone = true;
    void performBootSelfHealing((message, type = 'info') => addEvent(message, type));
  }

  if (!rt.state.enabled) return;
  void safeTick();
  rt.timer = setInterval(() => { void safeTick(); }, rt.state.intervalMs);
}

function restartTimer() {
  const rt = runtime();
  if (rt.timer) {
    clearInterval(rt.timer);
    rt.timer = null;
  }
  if (!rt.state.enabled) return;
  rt.timer = setInterval(() => { void safeTick(); }, rt.state.intervalMs);
}

export function setAutonomousEnabled(enabled: boolean) {
  const rt = runtime();
  rt.state.enabled = enabled;
  if (enabled) {
    addEvent('Autonomous mode enabled.');
    rt.state.paused = false;
    rt.state.cooldownUntil = null;
    rt.state.pauseReason = null;
    restartTimer();
    void safeTick();
  } else {
    addEvent('Autonomous mode paused by user.', 'warning');
    if (rt.timer) {
      clearInterval(rt.timer);
      rt.timer = null;
    }
  }
}

export function getAutonomousState(sinceEventId?: number): AutonomousState {
  const state = runtime().state;
  const events = sinceEventId
    ? state.events.filter((event) => event.id > sinceEventId)
    : state.events;
  return {
    ...state,
    events,
    completedTasks: [...state.completedTasks],
    currentTask: state.currentTask ? { ...state.currentTask } : null,
  };
}

export function getAutonomousHealth() {
  const rt = runtime();
  return {
    ok: rt.started,
    started: rt.started,
    enabled: rt.state.enabled,
    running: rt.state.running,
    paused: rt.state.paused,
    pauseReason: rt.state.pauseReason,
    consecutiveErrors: rt.consecutiveErrors,
    lastTickAt: rt.state.lastTickAt,
    timestamp: Date.now(),
    pid: process.pid,
    uptimeSec: Math.floor(process.uptime()),
  };
}
