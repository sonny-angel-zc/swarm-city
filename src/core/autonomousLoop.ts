import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createLinearIssueServer, getTopTodoIssue, LINEAR_TEAM_ID, listLinearIssues, updateIssueStateByType, type LinearIssue } from './linearServer';
import {
  cleanupAutonomousBranchesForClosedIssues,
  cleanupStaleAutonomousWorktrees,
  detectRetryKind,
  executeAutonomousTaskWithCityHall,
  hasActiveCodexProcess,
  runAutonomousPreflight,
  runCodexExec,
} from './orchestrator';

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
  consecutiveErrors: number;
};

type Runtime = {
  started: boolean;
  timer: NodeJS.Timeout | null;
  state: AutonomousState;
  eventId: number;
  lock: boolean;
  bootRecoveryDone: boolean;
  consecutiveErrors: number;
};

const DEFAULT_INTERVAL_MS = Number(process.env.SWARM_AUTONOMOUS_INTERVAL_MS ?? '60000');
const DEFAULT_COOLDOWN_MS = Number(process.env.SWARM_AUTONOMOUS_COOLDOWN_MS ?? '90000');
const DEFAULT_ENABLED = (process.env.SWARM_AUTONOMOUS_DEFAULT_ON ?? 'true').toLowerCase() !== 'false';
const DEFAULT_EXPECTED_TOKENS_PER_TURN = Number(process.env.SWARM_EXPECTED_TOKENS_PER_TURN ?? '250000');
const ERROR_COOLDOWN_MS = 2 * 60_000;
const STUCK_STARTED_MAX_AGE_MS = 10 * 60_000;
const HEALTH_TIMEOUT_MS = Number(process.env.SWARM_DEV_HEALTH_TIMEOUT_MS ?? '3500');
const HEALTH_POLL_MS = Number(process.env.SWARM_DEV_HEALTH_POLL_MS ?? '3000');
const HEALTH_RECOVERY_WINDOW_MS = Number(process.env.SWARM_DEV_HEALTH_RECOVERY_WINDOW_MS ?? '45000');
const PROJECT_ROOT = path.resolve(process.cwd());
const RUNTIME_DIR = path.join(PROJECT_ROOT, process.env.SWARM_RUNTIME_DIR ?? '.swarm-runtime');
const DEV_SERVER_RESTART_SIGNAL = path.join(RUNTIME_DIR, process.env.SWARM_DEV_RESTART_SIGNAL ?? 'restart-dev-server.signal');
const DEV_SERVER_HEALTH_URL = process.env.SWARM_DEV_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';

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
    consecutiveErrors: 0,
  };
}

if (!globalRuntime.__swarmAutonomousRuntime) {
  globalRuntime.__swarmAutonomousRuntime = {
    started: false,
    timer: null,
    state: createInitialState(),
    eventId: 0,
    lock: false,
    bootRecoveryDone: false,
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function probeDevServerHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1_000, HEALTH_TIMEOUT_MS));
  try {
    const response = await fetch(DEV_SERVER_HEALTH_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function requestDevServerRestartSignal(reason: string): void {
  mkdirSync(RUNTIME_DIR, { recursive: true });
  writeFileSync(DEV_SERVER_RESTART_SIGNAL, `${Date.now()} ${reason}\n`, { encoding: 'utf8' });
}

async function ensureDevServerHealthyBeforeTask(): Promise<boolean> {
  if (await probeDevServerHealth()) return true;

  addEvent('Dev server health check failed before task; requesting supervised restart.', 'warning');
  requestDevServerRestartSignal('autonomous-loop-health-check');

  const deadline = Date.now() + Math.max(15_000, HEALTH_RECOVERY_WINDOW_MS);
  while (Date.now() < deadline) {
    await delay(Math.max(1_000, HEALTH_POLL_MS));
    if (await probeDevServerHealth()) {
      addEvent('Dev server recovered after supervised restart signal.');
      return true;
    }
  }

  addEvent('Dev server remained unhealthy after restart attempt; deferring task tick.', 'warning');
  return false;
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
    isolatedContext: true,
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

async function recoverStuckStartedIssues(issues: LinearIssue[]): Promise<void> {
  const cutoff = Date.now() - STUCK_STARTED_MAX_AGE_MS;
  const stuck = issues.filter((issue) => {
    if (issue.state?.type !== 'started') return false;
    const updatedAt = new Date(issue.updatedAt).getTime();
    return Number.isFinite(updatedAt) && updatedAt < cutoff;
  });
  if (stuck.length === 0) return;

  if (hasActiveCodexProcess()) {
    addEvent(`Skipped stuck-task recovery (${stuck.length} candidate issue(s)); Codex process is active.`);
    return;
  }

  let reset = 0;
  for (const issue of stuck) {
    const ok = await updateIssueStateByType(issue.id, 'unstarted', LINEAR_TEAM_ID);
    if (ok) reset += 1;
  }

  if (reset > 0) {
    addEvent(`Recovered ${reset} stuck started issue(s) back to unstarted.`);
  }
}

async function runBootRecoveryIfNeeded(): Promise<void> {
  const rt = runtime();
  if (rt.bootRecoveryDone) return;
  rt.bootRecoveryDone = true;

  addEvent('Running boot recovery checks.');

  const stale = cleanupStaleAutonomousWorktrees(PROJECT_ROOT);
  if (stale.removed > 0 || stale.errors > 0) {
    addEvent(
      `Worktree cleanup: removed=${stale.removed}, skipped=${stale.skipped}, errors=${stale.errors}.`,
      stale.errors > 0 ? 'warning' : 'info',
    );
  }

  const issues = await listLinearIssues(LINEAR_TEAM_ID);
  await recoverStuckStartedIssues(issues);

  const closedIssueIds = issues
    .filter((issue) => issue.state?.type === 'completed' || issue.state?.type === 'canceled')
    .map((issue) => issue.identifier);
  const branchCleanup = cleanupAutonomousBranchesForClosedIssues(closedIssueIds, PROJECT_ROOT);
  if (branchCleanup.deleted > 0 || branchCleanup.errors > 0) {
    addEvent(
      `Branch cleanup: deleted=${branchCleanup.deleted}, skipped=${branchCleanup.skipped}, errors=${branchCleanup.errors}.`,
      branchCleanup.errors > 0 ? 'warning' : 'info',
    );
  }
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
    await runBootRecoveryIfNeeded();

    if (!rt.state.seeded) {
      const seed = await seedAutonomousBacklog();
      rt.state.seeded = true;
      addEvent(`Backlog seed complete (${seed.created} created, ${seed.skipped} already existed).`);
    }

    const issue = await getTopTodoIssue(LINEAR_TEAM_ID);
    if (!issue) {
      rt.state.currentTask = null;
      return;
    }

    const healthOk = await ensureDevServerHealthyBeforeTask();
    if (!healthOk) {
      rt.state.currentTask = null;
      return;
    }

    rt.state.currentTask = {
      issueId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
    };
    addEvent(`Picked ${issue.identifier}: ${issue.title}`);

    const preflight = runAutonomousPreflight(PROJECT_ROOT);
    if (preflight.noCommitMode) {
      addEvent(
        `[preflight] Constraints detected; switching to no-commit mode: ${preflight.constraints.join(' | ')}`,
        'warning',
      );
    } else {
      addEvent('[preflight] Passed (.git writable and lockfile updates feasible).');
    }

    const started = await updateIssueStateByType(issue.id, 'started', LINEAR_TEAM_ID);
    if (!started) {
      addEvent(`Failed to move ${issue.identifier} to started state.`, 'warning');
      return;
    }

    const execution = await executeAutonomousTaskWithCityHall({
      title: issue.title,
      description: issue.description,
      issueIdentifier: issue.identifier,
      workDir: PROJECT_ROOT,
      model: process.env.SWARM_AUTONOMOUS_MODEL ?? 'gpt-5.3-codex',
      preflight,
    });

    const tokenSummary = `input=${execution.usage.inputTokens.toLocaleString()}, output=${execution.usage.outputTokens.toLocaleString()}, total=${execution.usage.totalTokens.toLocaleString()}`;
    addEvent(`[telemetry] City Hall orchestration for ${issue.identifier} (${execution.usage.model}); ${tokenSummary}`);
    if (execution.usage.totalTokens > Math.max(1, DEFAULT_EXPECTED_TOKENS_PER_TURN)) {
      addEvent(
        `[telemetry] Token usage exceeded expected turn budget (${execution.usage.totalTokens.toLocaleString()} > ${DEFAULT_EXPECTED_TOKENS_PER_TURN.toLocaleString()}).`,
        'warning',
      );
    }

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
    rt.state.currentTask = null;
    rt.lock = false;
  }
}

async function tickLoopSafe() {
  const rt = runtime();
  try {
    await tickLoop();
    if (rt.consecutiveErrors > 0) {
      rt.consecutiveErrors = 0;
      rt.state.consecutiveErrors = 0;
    }
  } catch (err) {
    rt.consecutiveErrors += 1;
    rt.state.consecutiveErrors = rt.consecutiveErrors;
    addEvent(`Autonomous loop error: ${String(err)}`, 'error');

    if (rt.consecutiveErrors >= 3) {
      rt.state.paused = true;
      rt.state.cooldownUntil = Date.now() + ERROR_COOLDOWN_MS;
      rt.state.pauseReason = 'Repeated loop failures; cooling down before automatic resume.';
      addEvent('Paused autonomous loop for 120s after 3 consecutive tick errors.', 'warning');
      rt.consecutiveErrors = 0;
      rt.state.consecutiveErrors = 0;
    }
  }
}

export function startAutonomousLoop() {
  const rt = runtime();
  if (rt.started) return;
  rt.started = true;
  addEvent('Autonomous loop booted.');

  if (!rt.state.enabled) return;
  void tickLoopSafe();
  rt.timer = setInterval(() => { void tickLoopSafe(); }, rt.state.intervalMs);
}

function restartTimer() {
  const rt = runtime();
  if (rt.timer) {
    clearInterval(rt.timer);
    rt.timer = null;
  }
  if (!rt.state.enabled) return;
  rt.timer = setInterval(() => { void tickLoopSafe(); }, rt.state.intervalMs);
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
    void tickLoopSafe();
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

export function getAutonomousHealth(): {
  ok: boolean;
  stale: boolean;
  now: number;
  lastTickAt: number | null;
  lastTickAgeMs: number | null;
  intervalMs: number;
  paused: boolean;
  enabled: boolean;
  running: boolean;
  consecutiveErrors: number;
} {
  const state = runtime().state;
  const now = Date.now();
  const lastTickAgeMs = state.lastTickAt ? Math.max(0, now - state.lastTickAt) : null;
  const stale = Boolean(
    state.enabled
      && !state.paused
      && lastTickAgeMs !== null
      && lastTickAgeMs > Math.max(30_000, state.intervalMs * 3),
  );

  return {
    ok: !stale,
    stale,
    now,
    lastTickAt: state.lastTickAt,
    lastTickAgeMs,
    intervalMs: state.intervalMs,
    paused: state.paused,
    enabled: state.enabled,
    running: state.running,
    consecutiveErrors: state.consecutiveErrors,
  };
}
