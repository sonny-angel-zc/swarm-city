import path from 'path';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { createLinearIssueServer, getTopTodoIssue, LINEAR_TEAM_ID, listLinearIssues, updateIssueStateByType } from './linearServer';
import { detectRetryKind, executeAutonomousTaskWithCodex, runCodexExec } from './orchestrator';

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
  bootstrapped: boolean;
  timer: NodeJS.Timeout | null;
  state: AutonomousState;
  eventId: number;
  lock: boolean;
  consecutiveErrors: number;
};

const DEFAULT_INTERVAL_MS = Number(process.env.SWARM_AUTONOMOUS_INTERVAL_MS ?? '60000');
const DEFAULT_COOLDOWN_MS = Number(process.env.SWARM_AUTONOMOUS_COOLDOWN_MS ?? '90000');
const ERROR_COOLDOWN_MS = 120_000;
const STUCK_STARTED_MS = 10 * 60_000;
const DEFAULT_ENABLED = (process.env.SWARM_AUTONOMOUS_DEFAULT_ON ?? 'true').toLowerCase() !== 'false';
const PROJECT_ROOT = path.resolve(process.cwd());
const DEV_HEALTH_URL = process.env.SWARM_DEV_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
const DEV_RESTART_SIGNAL = process.env.SWARM_DEV_RESTART_SIGNAL ?? '/tmp/swarm-city-dev-restart.signal';

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
    bootstrapped: false,
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

function parseLines(cmd: string): string[] {
  try {
    const out = execSync(cmd, { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return out.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function hasActiveCodexProcess(): boolean {
  const commands = parseLines('ps -ax -o command=');
  return commands.some((command) => {
    const normalized = command.toLowerCase();
    return normalized.includes('codex') && normalized.includes(' exec');
  });
}

async function recoverStuckStartedIssues() {
  const issues = await listLinearIssues(LINEAR_TEAM_ID);
  const started = issues.filter((issue) => (issue.state?.type ?? '') === 'started');
  if (started.length === 0) return;
  if (hasActiveCodexProcess()) {
    addEvent(`Skipped stuck-task recovery (${started.length} started issue(s), active Codex process detected).`);
    return;
  }

  const now = Date.now();
  let resetCount = 0;
  for (const issue of started) {
    const ageMs = now - new Date(issue.updatedAt).getTime();
    if (ageMs < STUCK_STARTED_MS) continue;
    const reset = await updateIssueStateByType(issue.id, 'unstarted', LINEAR_TEAM_ID);
    if (reset) resetCount += 1;
  }
  if (resetCount > 0) {
    addEvent(`Recovered ${resetCount} stuck started issue(s) back to unstarted.`);
  }
}

function parseWorktreeList(): Array<{ path: string; branch: string | null }> {
  const raw = parseLines('git worktree list --porcelain');
  const out: Array<{ path: string; branch: string | null }> = [];
  let current: { path: string; branch: string | null } | null = null;
  for (const line of raw) {
    if (line.startsWith('worktree ')) {
      if (current) out.push(current);
      current = { path: line.replace(/^worktree\s+/, '').trim(), branch: null };
      continue;
    }
    if (line.startsWith('branch ') && current) {
      current.branch = line.replace(/^branch\s+refs\/heads\//, '').trim();
    }
  }
  if (current) out.push(current);
  return out;
}

function hasProcessInPath(targetPath: string): boolean {
  const commands = parseLines('ps -ax -o command=');
  return commands.some((command) => command.includes(targetPath));
}

async function cleanupOrphanedWorktreesAndBranches() {
  try {
    execSync('git worktree prune', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  } catch {
    // continue best-effort cleanup
  }

  const worktrees = parseWorktreeList();
  const rootPath = path.resolve(PROJECT_ROOT);
  let removedWorktrees = 0;
  for (const wt of worktrees) {
    const wtPath = path.resolve(wt.path);
    if (wtPath === rootPath) continue;
    if (hasProcessInPath(wtPath)) continue;
    try {
      execSync(`git worktree remove --force "${wtPath}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
      removedWorktrees += 1;
    } catch {
      // leave it if remove fails
    }
  }
  if (removedWorktrees > 0) {
    addEvent(`Pruned ${removedWorktrees} orphaned worktree(s).`);
  }

  const issues = await listLinearIssues(LINEAR_TEAM_ID);
  const doneIssues = issues.filter((issue) => {
    const stateType = issue.state?.type ?? '';
    return stateType === 'completed' || stateType === 'canceled' || stateType === 'cancelled';
  });
  if (doneIssues.length === 0) return;

  const branches = new Set(parseLines('git for-each-ref --format="%(refname:short)" refs/heads'));
  const currentBranch = parseLines('git branch --show-current')[0] ?? '';
  let deletedBranches = 0;

  for (const issue of doneIssues) {
    const key = issue.identifier.toLowerCase();
    const candidates = new Set([
      key,
      issue.identifier,
      `swarm/${key}`,
      `swarm/${issue.identifier}`,
      `linear/${key}`,
      `linear/${issue.identifier}`,
      `issue/${key}`,
      `issue/${issue.identifier}`,
    ]);
    for (const branch of candidates) {
      if (!branches.has(branch) || branch === currentBranch) continue;
      try {
        execSync(`git branch -D "${branch}"`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
        branches.delete(branch);
        deletedBranches += 1;
      } catch {
        // keep branch if delete fails
      }
    }
  }
  if (deletedBranches > 0) {
    addEvent(`Cleaned up ${deletedBranches} completed/canceled branch(es).`);
  }
}

async function requestDevServerRestart(): Promise<boolean> {
  try {
    writeFileSync(DEV_RESTART_SIGNAL, String(Date.now()), 'utf8');
  } catch {
    return false;
  }
  await new Promise((resolve) => setTimeout(resolve, 4000));
  try {
    const res = await fetch(DEV_HEALTH_URL, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureDevServerHealthy(): Promise<boolean> {
  try {
    const res = await fetch(DEV_HEALTH_URL, { cache: 'no-store' });
    if (res.ok) return true;
  } catch {
    // retry via restart signal below
  }
  addEvent('Dev server health check failed. Attempting supervised restart.', 'warning');
  const restarted = await requestDevServerRestart();
  if (!restarted) {
    addEvent('Dev server restart attempt failed; skipping task tick.', 'error');
  } else {
    addEvent('Dev server recovered after supervised restart.');
  }
  return restarted;
}

async function bootstrapSelfHealing() {
  const rt = runtime();
  if (rt.bootstrapped) return;
  rt.bootstrapped = true;
  await cleanupOrphanedWorktreesAndBranches();
  await recoverStuckStartedIssues();
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
  let tickFailed = false;

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
    if (!(await ensureDevServerHealthy())) {
      return;
    }

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
  } catch (err) {
    tickFailed = true;
    rt.consecutiveErrors += 1;
    addEvent(`Autonomous loop error: ${String(err)}`, 'error');
    if (rt.consecutiveErrors >= 3) {
      rt.state.paused = true;
      rt.state.cooldownUntil = Date.now() + ERROR_COOLDOWN_MS;
      rt.state.pauseReason = 'Too many consecutive autonomous loop errors.';
      addEvent('Paused autonomous loop for 120s after 3 consecutive errors.', 'warning');
      rt.consecutiveErrors = 0;
    }
  } finally {
    if (!tickFailed) {
      rt.consecutiveErrors = 0;
    }
    rt.state.running = false;
    rt.lock = false;
  }
}

export function startAutonomousLoop() {
  const rt = runtime();
  if (rt.started) return;
  rt.started = true;
  addEvent('Autonomous loop booted.');
  void bootstrapSelfHealing().catch((err) => {
    addEvent(`Self-healing bootstrap error: ${String(err)}`, 'error');
  });

  if (!rt.state.enabled) return;
  void tickLoop();
  rt.timer = setInterval(() => { void tickLoop(); }, rt.state.intervalMs);
}

function restartTimer() {
  const rt = runtime();
  if (rt.timer) {
    clearInterval(rt.timer);
    rt.timer = null;
  }
  if (!rt.state.enabled) return;
  rt.timer = setInterval(() => { void tickLoop(); }, rt.state.intervalMs);
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
    void tickLoop();
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
