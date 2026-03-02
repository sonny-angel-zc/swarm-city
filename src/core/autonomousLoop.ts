import { execFileSync, execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
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

export type AutonomousHealth = {
  ok: boolean;
  started: boolean;
  enabled: boolean;
  running: boolean;
  paused: boolean;
  pauseReason: string | null;
  lastTickAt: number | null;
  consecutiveErrors: number;
  bootRecoveryDone: boolean;
  serverHealthy: boolean;
  checkedAt: number;
};

type Runtime = {
  started: boolean;
  timer: NodeJS.Timeout | null;
  state: AutonomousState;
  eventId: number;
  lock: boolean;
  consecutiveErrors: number;
  bootRecoveryDone: boolean;
  bootRecoveryStarted: boolean;
};

type SwarmRunMeta = {
  ownerPid: number;
  issueIdentifier: string;
  runDir: string;
};

const DEFAULT_INTERVAL_MS = Number(process.env.SWARM_AUTONOMOUS_INTERVAL_MS ?? '60000');
const DEFAULT_COOLDOWN_MS = Number(process.env.SWARM_AUTONOMOUS_COOLDOWN_MS ?? '90000');
const DEFAULT_ENABLED = (process.env.SWARM_AUTONOMOUS_DEFAULT_ON ?? 'true').toLowerCase() !== 'false';
const PROJECT_ROOT = path.resolve(process.cwd());
const STUCK_TASK_THRESHOLD_MS = 10 * 60 * 1000;
const ERROR_PAUSE_MS = 2 * 60 * 1000;
const ERROR_PAUSE_THRESHOLD = 3;
const HEALTHCHECK_URL = process.env.SWARM_HEALTHCHECK_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
const HEALTHCHECK_TIMEOUT_MS = Number(process.env.SWARM_HEALTHCHECK_TIMEOUT_MS ?? '5000');
const SUPERVISOR_RESTART_SIGNAL = path.join(PROJECT_ROOT, '.swarm-supervisor-restart');

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
    bootRecoveryDone: false,
    bootRecoveryStarted: false,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function parsePsLines(args: string[]): string[] {
  try {
    const out = execFileSync('ps', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function readRunMetadata(runDir: string): SwarmRunMeta | null {
  const runJson = path.join(runDir, '.swarm-run.json');
  if (!existsSync(runJson)) return null;

  try {
    const raw = JSON.parse(readFileSync(runJson, 'utf8')) as { ownerPid?: unknown; issueIdentifier?: unknown };
    const ownerPid = Number(raw.ownerPid);
    const issueIdentifier = String(raw.issueIdentifier ?? '').trim();
    if (!Number.isFinite(ownerPid) || ownerPid <= 0 || !issueIdentifier) return null;
    return { ownerPid, issueIdentifier, runDir };
  } catch {
    return null;
  }
}

function getWorktreeRoot(): string | null {
  const normalized = PROJECT_ROOT.replace(/\\/g, '/');
  const marker = '/swarm-worktrees/';
  const idx = normalized.indexOf(marker);
  if (idx < 0) return null;
  return normalized.slice(0, idx + marker.length - 1);
}

function listSwarmRunMetadata(): SwarmRunMeta[] {
  const root = getWorktreeRoot();
  if (!root || !existsSync(root)) return [];

  const out: SwarmRunMeta[] = [];
  const issueDirs = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  for (const issueDir of issueDirs) {
    const issuePath = path.join(root, issueDir.name);
    const runDirs = readdirSync(issuePath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const runDir of runDirs) {
      const runPath = path.join(issuePath, runDir.name);
      const meta = readRunMetadata(runPath);
      if (meta) out.push(meta);
    }
  }

  return out;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getCommandForPid(pid: number): string {
  const lines = parsePsLines(['-p', String(pid), '-o', 'command=']);
  return lines[0] ?? '';
}

function getActiveCodexIssueIdentifiers(): Set<string> {
  const active = new Set<string>();
  const metas = listSwarmRunMetadata();

  for (const meta of metas) {
    if (!isPidAlive(meta.ownerPid)) continue;
    const command = getCommandForPid(meta.ownerPid).toLowerCase();
    if (command.includes('codex')) {
      active.add(meta.issueIdentifier.toLowerCase());
    }
  }

  return active;
}

function hasCodexProcessForIssue(identifier: string, cachedPsLines?: string[]): boolean {
  const lowerIdentifier = identifier.trim().toLowerCase();
  if (!lowerIdentifier) return false;

  const fromRuns = getActiveCodexIssueIdentifiers();
  if (fromRuns.has(lowerIdentifier)) return true;

  const lines = cachedPsLines ?? parsePsLines(['-axo', 'command=']);
  return lines.some((line) => {
    const lower = line.toLowerCase();
    return lower.includes('codex') && lower.includes(lowerIdentifier);
  });
}

function getGitWorktreePaths(): string[] {
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return output
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function hasAnyProcessReferencingPath(targetPath: string, cachedPsLines?: string[]): boolean {
  const target = targetPath.toLowerCase();
  const lines = cachedPsLines ?? parsePsLines(['-axo', 'command=']);
  return lines.some((line) => line.toLowerCase().includes(target));
}

function pruneOrphanedWorktrees(): { pruned: number; failed: number } {
  const root = getWorktreeRoot();
  if (!root) return { pruned: 0, failed: 0 };

  const runs = listSwarmRunMetadata();
  const worktreeSet = new Set(getGitWorktreePaths());
  const psLines = parsePsLines(['-axo', 'command=']);

  let pruned = 0;
  let failed = 0;

  for (const meta of runs) {
    const pidAlive = isPidAlive(meta.ownerPid);
    if (pidAlive) continue;
    if (hasAnyProcessReferencingPath(meta.runDir, psLines)) continue;

    if (worktreeSet.has(meta.runDir)) {
      try {
        execFileSync('git', ['worktree', 'remove', '--force', meta.runDir], {
          cwd: PROJECT_ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        pruned += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return { pruned, failed };
}

function branchMatchesIssueIdentifier(branch: string, identifier: string): boolean {
  const id = identifier.trim().toLowerCase();
  const name = branch.trim().toLowerCase();
  if (!id || !name) return false;

  if (name === id) return true;
  if (name.startsWith(`${id}/`)) return true;

  return [`issue/${id}`, `linear/${id}`, `swarm/${id}`].some((prefix) => name.startsWith(prefix));
}

function cleanupBranchesForResolvedIssues(resolvedIdentifiers: string[]): { deleted: number; failed: number } {
  if (resolvedIdentifiers.length === 0) return { deleted: 0, failed: 0 };

  let currentBranch = '';
  try {
    currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return { deleted: 0, failed: 0 };
  }

  let branches: string[] = [];
  try {
    const output = execFileSync('git', ['branch', '--format=%(refname:short)'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    branches = output.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch {
    return { deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;

  for (const branch of branches) {
    if (branch === currentBranch) continue;

    const matches = resolvedIdentifiers.some((identifier) => branchMatchesIssueIdentifier(branch, identifier));
    if (!matches) continue;

    try {
      execFileSync('git', ['branch', '-D', branch], {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  return { deleted, failed };
}

async function recoverStuckStartedIssues(): Promise<{ reset: number }> {
  const issues = await listLinearIssues(LINEAR_TEAM_ID);
  const now = Date.now();
  const psLines = parsePsLines(['-axo', 'command=']);

  let reset = 0;
  for (const issue of issues) {
    const stateType = issue.state?.type ?? 'unstarted';
    if (stateType !== 'started') continue;

    const ageMs = now - new Date(issue.updatedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < STUCK_TASK_THRESHOLD_MS) continue;

    const active = hasCodexProcessForIssue(issue.identifier, psLines);
    if (active) continue;

    const reverted = await updateIssueStateByType(issue.id, 'unstarted', LINEAR_TEAM_ID);
    if (reverted) {
      reset += 1;
      addEvent(`Recovered stuck issue ${issue.identifier} back to unstarted.`, 'warning');
    }
  }

  return { reset };
}

async function runBootRecovery() {
  const rt = runtime();
  if (rt.bootRecoveryDone || rt.bootRecoveryStarted) return;
  rt.bootRecoveryStarted = true;

  try {
    const stuck = await recoverStuckStartedIssues();
    const worktrees = pruneOrphanedWorktrees();

    const issues = await listLinearIssues(LINEAR_TEAM_ID);
    const resolvedIdentifiers = issues
      .filter((issue) => {
        const state = issue.state?.type ?? 'unstarted';
        return state === 'completed' || state === 'canceled';
      })
      .map((issue) => issue.identifier);
    const branches = cleanupBranchesForResolvedIssues(resolvedIdentifiers);

    addEvent(
      `Boot recovery complete (stuck reset: ${stuck.reset}, worktrees pruned: ${worktrees.pruned}, branches cleaned: ${branches.deleted}).`,
    );
    if (worktrees.failed > 0 || branches.failed > 0) {
      addEvent(`Boot recovery partial failures (worktrees: ${worktrees.failed}, branches: ${branches.failed}).`, 'warning');
    }
  } catch (err) {
    addEvent(`Boot recovery failed: ${String(err)}`, 'error');
  } finally {
    rt.bootRecoveryDone = true;
  }
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

async function probeServerHealth(): Promise<{ ok: boolean; status: number | null; latencyMs: number; error?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTHCHECK_TIMEOUT_MS);

  try {
    const res = await fetch(HEALTHCHECK_URL, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      error: String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function requestSupervisorRestart(reason: string) {
  try {
    writeFileSync(SUPERVISOR_RESTART_SIGNAL, JSON.stringify({ reason, requestedAt: new Date().toISOString() }));
    addEvent(`Requested dev server restart: ${reason}`, 'warning');
  } catch {
    try {
      execSync('npm run start:supervised >/dev/null 2>&1 &', { cwd: PROJECT_ROOT, stdio: 'ignore' });
      addEvent(`Started supervisor process for recovery: ${reason}`, 'warning');
    } catch {
      addEvent(`Failed to request supervisor restart: ${reason}`, 'error');
    }
  }
}

async function ensureServerHealthyBeforeTask(): Promise<boolean> {
  const initial = await probeServerHealth();
  if (initial.ok) return true;

  addEvent(
    `Health check failed before task (status: ${initial.status ?? 'n/a'}, error: ${initial.error ?? 'none'}).`,
    'warning',
  );
  requestSupervisorRestart('pre-task health check failed');
  await sleep(6000);

  const retry = await probeServerHealth();
  if (retry.ok) {
    addEvent('Dev server recovered after restart request.');
    return true;
  }

  addEvent('Dev server still unhealthy after restart attempt. Deferring task.', 'warning');
  return false;
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

    const issue = await getTopTodoIssue(LINEAR_TEAM_ID);
    if (!issue) {
      rt.state.currentTask = null;
      return;
    }

    const healthy = await ensureServerHealthyBeforeTask();
    if (!healthy) {
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
  try {
    await tickLoop();
    runtime().consecutiveErrors = 0;
  } catch (err) {
    const rt = runtime();
    rt.consecutiveErrors += 1;
    addEvent(`Autonomous tick error: ${String(err)}`, 'error');

    if (rt.consecutiveErrors >= ERROR_PAUSE_THRESHOLD) {
      rt.consecutiveErrors = 0;
      rt.state.paused = true;
      rt.state.cooldownUntil = Date.now() + ERROR_PAUSE_MS;
      rt.state.pauseReason = 'Too many consecutive autonomous loop failures.';
      addEvent(`Paused autonomous loop after ${ERROR_PAUSE_THRESHOLD} consecutive errors. Auto-resume in 120s.`, 'warning');
    }
  }
}

export function startAutonomousLoop() {
  const rt = runtime();
  if (rt.started) return;
  rt.started = true;
  addEvent('Autonomous loop booted.');
  void runBootRecovery();

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

export async function getAutonomousHealth(options?: { skipServerProbe?: boolean }): Promise<AutonomousHealth> {
  const rt = runtime();
  const serverProbe = options?.skipServerProbe
    ? { ok: true }
    : await probeServerHealth();
  return {
    ok: rt.started && (serverProbe.ok || rt.state.running),
    started: rt.started,
    enabled: rt.state.enabled,
    running: rt.state.running,
    paused: rt.state.paused,
    pauseReason: rt.state.pauseReason,
    lastTickAt: rt.state.lastTickAt,
    consecutiveErrors: rt.consecutiveErrors,
    bootRecoveryDone: rt.bootRecoveryDone,
    serverHealthy: serverProbe.ok,
    checkedAt: Date.now(),
  };
}
