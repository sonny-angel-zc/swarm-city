import { execFileSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { listLinearIssues, LINEAR_TEAM_ID, updateIssueStateByType } from './linearServer';

const RESTART_SIGNAL_FILE = '.swarm-dev-restart.json';
const STUCK_STARTED_MS = 10 * 60 * 1000;

export type DevHealthResult = {
  ok: boolean;
  status: number | null;
  error: string | null;
  checkedAt: number;
};

export type BootSelfHealingReport = {
  stuckResetCount: number;
  staleWorktreesPruned: number;
  branchesRemoved: number;
  errors: string[];
};

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isPidActive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function commandOutput(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function getSwarmWorktreesRoot(cwd = process.cwd()): string | null {
  const parts = cwd.split(path.sep);
  const idx = parts.lastIndexOf('swarm-worktrees');
  if (idx < 0) return null;
  const rootParts = parts.slice(0, idx + 1);
  if (rootParts.length === 0) return path.sep;
  return rootParts.join(path.sep) || path.sep;
}

export async function checkDevServerHealth(): Promise<DevHealthResult> {
  const checkedAt = Date.now();
  const url = process.env.SWARM_HEALTHCHECK_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
  const timeoutMs = Number(process.env.SWARM_HEALTHCHECK_TIMEOUT_MS ?? '3500');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));

  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return {
      ok: res.ok,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
      checkedAt,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
      checkedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function requestDevServerRestart(reason: string): string {
  const filePath = path.resolve(process.cwd(), RESTART_SIGNAL_FILE);
  const payload = {
    reason,
    requestedAt: new Date().toISOString(),
    pid: process.pid,
  };
  writeFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
  return filePath;
}

export function hasActiveCodexProcess(): boolean {
  try {
    const out = commandOutput('ps', ['-axo', 'pid=,command=']);
    const lines = out.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const firstSpace = trimmed.indexOf(' ');
      if (firstSpace <= 0) continue;
      const pidText = trimmed.slice(0, firstSpace).trim();
      const command = trimmed.slice(firstSpace + 1).toLowerCase();
      const pid = Number(pidText);
      if (!Number.isFinite(pid) || pid === process.pid) continue;
      if (command.includes('codex') && !command.includes('start-supervised')) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export async function recoverStuckStartedIssues(params?: {
  teamId?: string;
  now?: number;
  thresholdMs?: number;
}): Promise<number> {
  if (hasActiveCodexProcess()) return 0;

  const teamId = params?.teamId ?? LINEAR_TEAM_ID;
  const now = params?.now ?? Date.now();
  const thresholdMs = Math.max(60_000, params?.thresholdMs ?? STUCK_STARTED_MS);
  const issues = await listLinearIssues(teamId);
  let resetCount = 0;

  for (const issue of issues) {
    const stateType = issue.state?.type ?? '';
    if (stateType !== 'started') continue;
    const startedAtMs = parseIsoMs(issue.startedAt) ?? parseIsoMs(issue.updatedAt);
    if (startedAtMs === null) continue;
    if (now - startedAtMs <= thresholdMs) continue;
    const reset = await updateIssueStateByType(issue.id, 'unstarted', teamId);
    if (reset) resetCount += 1;
  }

  return resetCount;
}

export function pruneOrphanedWorktrees(): number {
  let pruned = 0;

  try {
    spawnSync('git', ['worktree', 'prune'], { cwd: process.cwd(), stdio: 'ignore' });
  } catch {
    // Ignore command-level failures; manual pruning below still runs.
  }

  const root = getSwarmWorktreesRoot(process.cwd());
  if (!root || !existsSync(root)) return pruned;

  let issueDirs: string[] = [];
  try {
    issueDirs = readdirSync(root)
      .map((name) => path.join(root, name))
      .filter((candidate) => {
        try {
          return statSync(candidate).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return pruned;
  }

  for (const issueDir of issueDirs) {
    let runDirs: string[] = [];
    try {
      runDirs = readdirSync(issueDir)
        .map((name) => path.join(issueDir, name))
        .filter((candidate) => {
          try {
            return statSync(candidate).isDirectory();
          } catch {
            return false;
          }
        });
    } catch {
      continue;
    }

    for (const runDir of runDirs) {
      if (path.resolve(runDir) === path.resolve(process.cwd())) continue;
      const marker = path.join(runDir, '.swarm-run.json');
      if (!existsSync(marker)) continue;

      try {
        const raw = readFileSync(marker, 'utf8');
        const parsed = JSON.parse(raw) as { ownerPid?: number };
        if (parsed.ownerPid && isPidActive(parsed.ownerPid)) continue;
      } catch {
        // If marker is malformed, treat as orphaned.
      }

      try {
        rmSync(runDir, { recursive: true, force: true });
        pruned += 1;
      } catch {
        // Ignore individual cleanup failures.
      }
    }
  }

  return pruned;
}

export function cleanupBranchesForClosedIssues(issueIdentifiers: string[]): number {
  const ids = new Set(issueIdentifiers.map((id) => id.trim().toLowerCase()).filter(Boolean));
  if (ids.size === 0) return 0;

  let currentBranch = '';
  let branches: string[] = [];
  try {
    currentBranch = commandOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    branches = commandOutput('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return 0;
  }

  let deleted = 0;
  for (const branch of branches) {
    if (branch === currentBranch) continue;
    const branchLower = branch.toLowerCase();
    const matchesIssue = [...ids].some((identifier) => branchLower.includes(identifier));
    if (!matchesIssue) continue;

    try {
      const removed = spawnSync('git', ['branch', '-D', branch], { stdio: 'ignore' });
      if (removed.status === 0) {
        deleted += 1;
      }
    } catch {
      // Ignore deletion failures.
    }
  }

  return deleted;
}

export async function performBootSelfHealing(
  onLog?: (message: string, type?: 'info' | 'warning' | 'error') => void,
): Promise<BootSelfHealingReport> {
  const report: BootSelfHealingReport = {
    stuckResetCount: 0,
    staleWorktreesPruned: 0,
    branchesRemoved: 0,
    errors: [],
  };

  try {
    report.stuckResetCount = await recoverStuckStartedIssues();
    if (report.stuckResetCount > 0) {
      onLog?.(`Recovered ${report.stuckResetCount} stuck started task(s) back to unstarted.`);
    }
  } catch (err) {
    const text = `Stuck task recovery failed: ${String(err)}`;
    report.errors.push(text);
    onLog?.(text, 'warning');
  }

  try {
    report.staleWorktreesPruned = pruneOrphanedWorktrees();
    if (report.staleWorktreesPruned > 0) {
      onLog?.(`Pruned ${report.staleWorktreesPruned} orphaned worktree(s).`);
    }
  } catch (err) {
    const text = `Worktree pruning failed: ${String(err)}`;
    report.errors.push(text);
    onLog?.(text, 'warning');
  }

  try {
    const issues = await listLinearIssues(LINEAR_TEAM_ID);
    const closedIssueIds = issues
      .filter((issue) => {
        const stateType = issue.state?.type ?? '';
        return stateType === 'completed' || stateType === 'canceled' || stateType === 'cancelled';
      })
      .map((issue) => issue.identifier);
    report.branchesRemoved = cleanupBranchesForClosedIssues(closedIssueIds);
    if (report.branchesRemoved > 0) {
      onLog?.(`Deleted ${report.branchesRemoved} branch(es) for completed/canceled issues.`);
    }
  } catch (err) {
    const text = `Branch cleanup failed: ${String(err)}`;
    report.errors.push(text);
    onLog?.(text, 'warning');
  }

  return report;
}
