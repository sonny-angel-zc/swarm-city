import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
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
const DEFAULT_ENABLED = (process.env.SWARM_AUTONOMOUS_DEFAULT_ON ?? 'true').toLowerCase() !== 'false';
const PROJECT_ROOT = path.resolve(process.cwd());
const STUCK_STARTED_MS = 10 * 60 * 1000;
const ERROR_BACKOFF_MS = 2 * 60 * 1000;
const DEV_HEALTH_URL = process.env.SWARM_DEV_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
const SUPERVISOR_REQUEST_FILE = path.join(PROJECT_ROOT, '.swarm-supervisor', 'restart-request.json');

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function toPriorityValue(priority: string): number {
  return priority === 'P2' ? 3 : 4;
}

function normalizePriority(raw: unknown): 'P2' | 'P3' {
  const text = String(raw ?? '').toUpperCase();
  return text.includes('P2') ? 'P2' : 'P3';
}

function processExists(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function hasActiveCodexProcess(): boolean {
  try {
    const output = execFileSync('ps', ['-axo', 'command='], { encoding: 'utf8' });
    return output
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .some((line) => line.includes('codex') && line.includes('exec'));
  } catch {
    return false;
  }
}

function findSwarmWorktreeRoot(): string | null {
  const marker = `${path.sep}swarm-worktrees${path.sep}`;
  const idx = PROJECT_ROOT.indexOf(marker);
  if (idx < 0) return null;
  return PROJECT_ROOT.slice(0, idx + marker.length - 1);
}

function getGitRoot(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function getBranchForWorktree(worktreePath: string): string | null {
  try {
    const branch = execFileSync('git', ['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    return branch.length > 0 ? branch : null;
  } catch {
    return null;
  }
}

function tryDeleteLocalBranch(gitRoot: string, branch: string) {
  if (!branch || branch === 'HEAD' || branch === 'main' || branch === 'master') return;
  try {
    execFileSync('git', ['branch', '-D', branch], { cwd: gitRoot, stdio: 'ignore' });
  } catch {
    // Best-effort cleanup only.
  }
}

function removeWorktree(gitRoot: string | null, worktreePath: string) {
  if (gitRoot) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: gitRoot, stdio: 'ignore' });
      return;
    } catch {
      // Fall through to filesystem delete.
    }
  }

  try {
    rmSync(worktreePath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

async function recoverStuckStartedIssues() {
  const issues = await listLinearIssues(LINEAR_TEAM_ID);
  const now = Date.now();
  const stuck = issues.filter((issue) => {
    const stateType = issue.state?.type ?? '';
    if (stateType !== 'started') return false;
    const startedAt = new Date(issue.updatedAt).getTime();
    return Number.isFinite(startedAt) && now - startedAt > STUCK_STARTED_MS;
  });

  if (stuck.length === 0) return;

  if (hasActiveCodexProcess()) {
    addEvent(`Found ${stuck.length} started issue(s) older than 10m, but Codex is active so recovery was skipped.`, 'warning');
    return;
  }

  let recovered = 0;
  for (const issue of stuck) {
    const ok = await updateIssueStateByType(issue.id, 'unstarted', LINEAR_TEAM_ID);
    if (ok) recovered += 1;
  }

  if (recovered > 0) {
    addEvent(`Recovered ${recovered} stuck started issue(s) to unstarted.`);
  }
}

type WorktreeRunMeta = {
  ownerPid?: number;
  issueIdentifier?: string;
};

function readRunMeta(runPath: string): WorktreeRunMeta | null {
  const metaPath = path.join(runPath, '.swarm-run.json');
  if (!existsSync(metaPath)) return null;

  try {
    return JSON.parse(readFileSync(metaPath, 'utf8')) as WorktreeRunMeta;
  } catch {
    return null;
  }
}

async function cleanupOrphanedWorktrees() {
  const worktreeRoot = findSwarmWorktreeRoot();
  if (!worktreeRoot || !existsSync(worktreeRoot)) return;

  const issues = await listLinearIssues(LINEAR_TEAM_ID);
  const statusByIdentifier = new Map<string, string>();
  for (const issue of issues) {
    statusByIdentifier.set(issue.identifier.toUpperCase(), issue.state?.type ?? '');
  }

  const gitRoot = getGitRoot();
  let pruned = 0;
  let branchesDeleted = 0;

  const issueDirs = readdirSync(worktreeRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const issueDir of issueDirs) {
    const issuePath = path.join(worktreeRoot, issueDir.name);
    const runDirs = readdirSync(issuePath, { withFileTypes: true }).filter((entry) => entry.isDirectory());

    for (const runDir of runDirs) {
      const runPath = path.join(issuePath, runDir.name);
      const meta = readRunMeta(runPath);
      if (!meta) continue;

      if (meta.ownerPid && processExists(meta.ownerPid)) {
        continue;
      }

      const issueStatus = statusByIdentifier.get(String(meta.issueIdentifier ?? '').toUpperCase()) ?? '';
      const shouldDeleteBranch = issueStatus === 'completed' || issueStatus === 'canceled';

      const branch = shouldDeleteBranch ? getBranchForWorktree(runPath) : null;
      removeWorktree(gitRoot, runPath);
      pruned += 1;

      if (shouldDeleteBranch && branch && gitRoot) {
        tryDeleteLocalBranch(gitRoot, branch);
        branchesDeleted += 1;
      }
    }
  }

  if (pruned > 0 || branchesDeleted > 0) {
    addEvent(`Worktree cleanup pruned ${pruned} stale run(s) and deleted ${branchesDeleted} completed/canceled branch(es).`);
  }
}

async function probeDevHealth(timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(DEV_HEALTH_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function requestDevServerRestart(reason: string) {
  const dir = path.dirname(SUPERVISOR_REQUEST_FILE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    SUPERVISOR_REQUEST_FILE,
    JSON.stringify({ requestedAt: new Date().toISOString(), reason }),
  );
}

async function ensureDevServerHealthy(): Promise<boolean> {
  if (await probeDevHealth()) return true;

  addEvent('Dev server health check failed before task start; requesting restart.', 'warning');
  requestDevServerRestart('autonomous pre-task health check failed');

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await delay(5_000);
    if (await probeDevHealth()) {
      addEvent('Dev server recovered after supervised restart.');
      return true;
    }
  }

  addEvent('Dev server did not recover within 90s; skipping task this tick.', 'error');
  return false;
}

async function bootRecovery() {
  const rt = runtime();
  if (rt.bootstrapped) return;
  rt.bootstrapped = true;

  try {
    await recoverStuckStartedIssues();
  } catch (err) {
    addEvent(`Failed stuck-task recovery: ${String(err)}`, 'error');
  }

  try {
    await cleanupOrphanedWorktrees();
  } catch (err) {
    addEvent(`Failed orphaned-worktree cleanup: ${String(err)}`, 'error');
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

async function tickLoopInner() {
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

    const issue = await getTopTodoIssue(LINEAR_TEAM_ID);
    if (!issue) {
      rt.state.currentTask = null;
      return;
    }

    const healthy = await ensureDevServerHealthy();
    if (!healthy) return;

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

async function tickLoop() {
  const rt = runtime();
  try {
    await tickLoopInner();
    rt.consecutiveErrors = 0;
  } catch (err) {
    rt.consecutiveErrors += 1;
    addEvent(`Autonomous loop error: ${String(err)}`, 'error');

    if (rt.consecutiveErrors >= 3) {
      rt.state.paused = true;
      rt.state.cooldownUntil = Date.now() + ERROR_BACKOFF_MS;
      rt.state.pauseReason = 'Too many consecutive loop errors. Cooling down before retry.';
      addEvent('Autonomous loop hit 3 consecutive errors; pausing for 120s before auto-resume.', 'warning');
      rt.consecutiveErrors = 0;
    }
  }
}

export function startAutonomousLoop() {
  const rt = runtime();
  if (rt.started) return;
  rt.started = true;
  addEvent('Autonomous loop booted.');

  void bootRecovery();

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

export function getAutonomousHealth() {
  const rt = runtime();
  return {
    ok: true,
    timestamp: Date.now(),
    started: rt.started,
    enabled: rt.state.enabled,
    running: rt.state.running,
    paused: rt.state.paused,
    pauseReason: rt.state.pauseReason,
    cooldownUntil: rt.state.cooldownUntil,
    lastTickAt: rt.state.lastTickAt,
    consecutiveErrors: rt.consecutiveErrors,
    activeTask: rt.state.currentTask,
  };
}
