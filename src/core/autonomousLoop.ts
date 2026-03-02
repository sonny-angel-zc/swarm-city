import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { createLinearIssueServer, getTopTodoIssue, LINEAR_TEAM_ID, listLinearIssues, updateIssueStateByType } from './linearServer';
import { detectRetryKind, executeAutonomousTaskWithCodex, hasActiveCodexProcess, runCodexExec } from './orchestrator';

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

export type AutonomousHealth = {
  ok: boolean;
  timestamp: number;
  uptimeSec: number;
  started: boolean;
  running: boolean;
  enabled: boolean;
  paused: boolean;
  pauseReason: string | null;
  lastTickAt: number | null;
  consecutiveErrors: number;
};

type Runtime = {
  started: boolean;
  timer: NodeJS.Timeout | null;
  state: AutonomousState;
  eventId: number;
  lock: boolean;
  consecutiveErrors: number;
  maintenanceRan: boolean;
};

const DEFAULT_INTERVAL_MS = Number(process.env.SWARM_AUTONOMOUS_INTERVAL_MS ?? '60000');
const DEFAULT_COOLDOWN_MS = Number(process.env.SWARM_AUTONOMOUS_COOLDOWN_MS ?? '90000');
const DEFAULT_ENABLED = (process.env.SWARM_AUTONOMOUS_DEFAULT_ON ?? 'true').toLowerCase() !== 'false';
const ERROR_STREAK_COOLDOWN_MS = 2 * 60 * 1000;
const STUCK_STARTED_MAX_AGE_MS = 10 * 60 * 1000;
const LOCAL_HEALTH_URL = process.env.SWARM_LOCAL_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
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
    timer: null,
    state: createInitialState(),
    eventId: 0,
    lock: false,
    consecutiveErrors: 0,
    maintenanceRan: false,
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

function parseBranchShortName(ref: string | null): string | null {
  if (!ref) return null;
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

function extractIssueIdentifier(value: string): string | null {
  const match = value.match(/[A-Z]+-\d+/i);
  return match ? match[0].toUpperCase() : null;
}

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { cache: 'no-store', signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

async function isLocalDevServerHealthy(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(LOCAL_HEALTH_URL, 4_000);
    return res.ok;
  } catch {
    return false;
  }
}

function requestProcessRestart(reason: string) {
  addEvent(`Requesting dev-server restart: ${reason}`, 'warning');
  setTimeout(() => {
    process.exit(1);
  }, 250);
}

async function ensureDevServerHealthBeforeTask(): Promise<boolean> {
  if (await isLocalDevServerHealthy()) return true;
  requestProcessRestart('localhost:3000 health check failed');
  return false;
}

async function recoverStuckStartedIssues(): Promise<number> {
  if (hasActiveCodexProcess()) return 0;
  const now = Date.now();
  const issues = await listLinearIssues(LINEAR_TEAM_ID);
  const started = issues.filter((issue) => (issue.state?.type ?? 'unstarted') === 'started');
  let recovered = 0;
  for (const issue of started) {
    const ageMs = now - new Date(issue.updatedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < STUCK_STARTED_MAX_AGE_MS) continue;
    const reset = await updateIssueStateByType(issue.id, 'unstarted', LINEAR_TEAM_ID);
    if (reset) {
      recovered += 1;
      addEvent(`Recovered stuck issue ${issue.identifier} to unstarted state.`, 'warning');
    }
  }
  return recovered;
}

function hasActiveProcessInPath(worktreePath: string): boolean {
  if (process.cwd().startsWith(worktreePath)) return true;
  const probe = spawnSync('lsof', ['-t', '+D', worktreePath], { encoding: 'utf8' });
  if (probe.status === 0 && (probe.stdout ?? '').trim().length > 0) return true;
  return false;
}

function listWorktrees(): Array<{ path: string; branch: string | null }> {
  const out = execSync('git worktree list --porcelain', { cwd: PROJECT_ROOT, encoding: 'utf8' });
  const blocks = out.split('\n\n').map((block) => block.trim()).filter(Boolean);
  const worktrees: Array<{ path: string; branch: string | null }> = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    let worktreePath = '';
    let branch: string | null = null;
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        worktreePath = line.slice('worktree '.length).trim();
      } else if (line.startsWith('branch ')) {
        branch = parseBranchShortName(line.slice('branch '.length).trim());
      }
    }
    if (worktreePath) {
      worktrees.push({ path: worktreePath, branch });
    }
  }
  return worktrees;
}

function pruneOrphanedWorktrees(): number {
  let removed = 0;
  const worktrees = listWorktrees();
  for (const wt of worktrees) {
    if (path.resolve(wt.path) === PROJECT_ROOT) continue;
    if (hasActiveProcessInPath(wt.path)) continue;
    const rm = spawnSync('git', ['worktree', 'remove', '--force', wt.path], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    if (rm.status === 0) removed += 1;
  }

  spawnSync('git', ['worktree', 'prune', '--expire', 'now'], { cwd: PROJECT_ROOT, encoding: 'utf8' });
  return removed;
}

async function cleanupBranchesForClosedIssues(): Promise<number> {
  const issues = await listLinearIssues(LINEAR_TEAM_ID);
  const closedIdentifiers = new Set(
    issues
      .filter((issue) => {
        const type = issue.state?.type ?? 'unstarted';
        return type === 'completed' || type === 'canceled';
      })
      .map((issue) => issue.identifier.toUpperCase()),
  );

  if (closedIdentifiers.size === 0) return 0;

  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  const branchOut = execSync('git for-each-ref refs/heads --format="%(refname:short)"', { cwd: PROJECT_ROOT, encoding: 'utf8' });
  const branches = branchOut
    .split('\n')
    .map((line) => line.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  const activeWorktreeBranches = new Set(
    listWorktrees()
      .map((wt) => wt.branch)
      .filter((branch): branch is string => typeof branch === 'string' && branch.length > 0),
  );

  let removed = 0;
  for (const branch of branches) {
    if (branch === currentBranch || activeWorktreeBranches.has(branch)) continue;
    const identifier = extractIssueIdentifier(branch);
    if (!identifier || !closedIdentifiers.has(identifier)) continue;
    const del = spawnSync('git', ['branch', '-D', branch], { cwd: PROJECT_ROOT, encoding: 'utf8' });
    if (del.status === 0) removed += 1;
  }
  return removed;
}

async function runBootMaintenance() {
  const rt = runtime();
  if (rt.maintenanceRan) return;
  rt.maintenanceRan = true;

  try {
    const [recovered, pruned, cleanedBranches] = await Promise.all([
      recoverStuckStartedIssues(),
      Promise.resolve(pruneOrphanedWorktrees()),
      cleanupBranchesForClosedIssues(),
    ]);
    if (recovered > 0) addEvent(`Boot recovery reset ${recovered} stuck started issue(s).`, 'warning');
    if (pruned > 0) addEvent(`Pruned ${pruned} orphaned worktree(s).`, 'warning');
    if (cleanedBranches > 0) addEvent(`Cleaned ${cleanedBranches} branch(es) for closed issues.`, 'info');
  } catch (err) {
    addEvent(`Boot maintenance failed: ${String(err)}`, 'error');
  }
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

async function runTickBody() {
  const rt = runtime();
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

  if (!(await ensureDevServerHealthBeforeTask())) return;

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
    await runTickBody();
    rt.consecutiveErrors = 0;
  } catch (err) {
    rt.consecutiveErrors += 1;
    addEvent(`Autonomous loop error: ${String(err)}`, 'error');
    if (rt.consecutiveErrors >= 3) {
      rt.state.paused = true;
      rt.state.cooldownUntil = Date.now() + ERROR_STREAK_COOLDOWN_MS;
      rt.state.pauseReason = 'Consecutive autonomous loop errors. Cooling down before retry.';
      addEvent('Autonomous loop paused for 120s after 3 consecutive errors.', 'warning');
      rt.consecutiveErrors = 0;
    }
  } finally {
    rt.state.running = false;
    rt.lock = false;
  }
}

function scheduleTick() {
  void tickLoop().catch((err) => {
    addEvent(`Unhandled tick failure: ${String(err)}`, 'error');
  });
}

export function startAutonomousLoop() {
  const rt = runtime();
  if (rt.started) return;
  rt.started = true;
  addEvent('Autonomous loop booted.');

  void runBootMaintenance();

  if (!rt.state.enabled) return;
  scheduleTick();
  rt.timer = setInterval(() => { scheduleTick(); }, rt.state.intervalMs);
}

function restartTimer() {
  const rt = runtime();
  if (rt.timer) {
    clearInterval(rt.timer);
    rt.timer = null;
  }
  if (!rt.state.enabled) return;
  rt.timer = setInterval(() => { scheduleTick(); }, rt.state.intervalMs);
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
    scheduleTick();
  } else {
    addEvent('Autonomous mode paused by user.', 'warning');
    if (rt.timer) {
      clearInterval(rt.timer);
      rt.timer = null;
    }
  }
}

export function getAutonomousHealth(): AutonomousHealth {
  const rt = runtime();
  return {
    ok: rt.started && rt.state.enabled && !rt.state.paused,
    timestamp: Date.now(),
    uptimeSec: Math.floor(process.uptime()),
    started: rt.started,
    running: rt.state.running,
    enabled: rt.state.enabled,
    paused: rt.state.paused,
    pauseReason: rt.state.pauseReason,
    lastTickAt: rt.state.lastTickAt,
    consecutiveErrors: rt.consecutiveErrors,
  };
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
