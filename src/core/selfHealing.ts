import { execFile } from 'child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { LINEAR_TEAM_ID, listLinearIssues, updateIssueStateByType } from './linearServer';

const LOCAL_HEALTH_URL = process.env.SWARM_LOCAL_HEALTH_URL ?? 'http://127.0.0.1:3000/api/autonomous/health';
const STUCK_THRESHOLD_MS = 10 * 60 * 1000;
const RESTART_SIGNAL_DIR = path.join(process.cwd(), '.swarm-supervisor');
const RESTART_SIGNAL_FILE = path.join(RESTART_SIGNAL_DIR, 'restart-request.json');

type WorktreeEntry = {
  worktreePath: string;
  branch: string | null;
};

function execFileText(cmd: string, args: string[], cwd = process.cwd()): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timed out')), Math.max(1, timeoutMs));
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    );
  });
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

async function listWorktrees(repoRoot: string): Promise<WorktreeEntry[]> {
  const raw = await execFileText('git', ['worktree', 'list', '--porcelain'], repoRoot);
  if (!raw) return [];

  const blocks = raw.split('\n\n').map((block) => block.trim()).filter(Boolean);
  const entries: WorktreeEntry[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    let worktreePath = '';
    let branch: string | null = null;
    for (const line of lines) {
      if (line.startsWith('worktree ')) worktreePath = line.slice('worktree '.length).trim();
      if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim();
        branch = ref.replace(/^refs\/heads\//, '');
      }
    }
    if (worktreePath) {
      entries.push({ worktreePath, branch });
    }
  }

  return entries;
}

export async function isLocalServerHealthy(timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await withTimeout(
      fetch(LOCAL_HEALTH_URL, {
        cache: 'no-store',
      }),
      timeoutMs,
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestDevServerRestart(reason: string): Promise<void> {
  await mkdir(RESTART_SIGNAL_DIR, { recursive: true });
  const payload = {
    reason,
    requestedAt: new Date().toISOString(),
    pid: process.pid,
  };
  await writeFile(RESTART_SIGNAL_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function hasActiveCodexProcess(): Promise<boolean> {
  try {
    const output = await execFileText('ps', ['-axo', 'pid=,command=']);
    const codexBin = path.basename(process.env.SWARM_CODEX_BIN ?? 'codex').toLowerCase();
    return output
      .split('\n')
      .some((line) => {
        const text = line.trim().toLowerCase();
        if (!text) return false;
        if (text.includes('grep codex')) return false;
        return text.includes(' codex exec')
          || text.includes(`${codexBin} exec`)
          || text.endsWith(`/${codexBin}`);
      });
  } catch {
    return false;
  }
}

export async function recoverStuckStartedIssues(teamId = LINEAR_TEAM_ID): Promise<{ reset: number; skipped: number }> {
  const codexActive = await hasActiveCodexProcess();
  if (codexActive) {
    return { reset: 0, skipped: 0 };
  }

  const issues = await listLinearIssues(teamId);
  const now = Date.now();
  const stale = issues.filter((issue) => {
    if ((issue.state?.type ?? '').toLowerCase() !== 'started') return false;
    const updatedAt = new Date(issue.updatedAt).getTime();
    if (!Number.isFinite(updatedAt)) return false;
    return (now - updatedAt) > STUCK_THRESHOLD_MS;
  });

  let reset = 0;
  for (const issue of stale) {
    const ok = await updateIssueStateByType(issue.id, 'unstarted', teamId);
    if (ok) reset += 1;
  }

  return { reset, skipped: stale.length - reset };
}

export async function pruneOrphanedWorktrees(teamId = LINEAR_TEAM_ID): Promise<{ worktreesRemoved: number; branchesRemoved: number }> {
  const repoRoot = process.cwd();
  const entries = await listWorktrees(repoRoot);
  const main = path.resolve(repoRoot);
  const issues = await listLinearIssues(teamId);
  const terminalByIdentifier = new Map(
    issues
      .filter((issue) => {
        const type = (issue.state?.type ?? '').toLowerCase();
        return type === 'completed' || type === 'canceled';
      })
      .map((issue) => [issue.identifier.toLowerCase(), true] as const),
  );

  let worktreesRemoved = 0;
  let branchesRemoved = 0;
  const candidateBranches = new Set<string>();

  for (const entry of entries) {
    const resolvedPath = path.resolve(entry.worktreePath);
    if (resolvedPath === main) continue;

    const runInfoPath = path.join(resolvedPath, '.swarm-run.json');
    let ownerPid: number | null = null;
    let issueIdentifier: string | null = null;

    try {
      await stat(runInfoPath);
      const raw = await readFile(runInfoPath, 'utf8');
      const parsed = JSON.parse(raw) as { ownerPid?: number; issueIdentifier?: string };
      ownerPid = Number(parsed.ownerPid);
      issueIdentifier = typeof parsed.issueIdentifier === 'string' ? parsed.issueIdentifier : null;
    } catch {
      continue;
    }

    if (ownerPid && isPidActive(ownerPid)) {
      continue;
    }

    await execFileText('git', ['worktree', 'remove', '--force', resolvedPath], repoRoot);
    worktreesRemoved += 1;

    if (!entry.branch || !issueIdentifier) continue;
    const key = issueIdentifier.toLowerCase();
    const safeToDelete = terminalByIdentifier.has(key) && entry.branch.toLowerCase().includes(key);
    if (safeToDelete) {
      candidateBranches.add(entry.branch);
    }

    try {
      await rm(runInfoPath, { force: true });
    } catch {
      // Ignore cleanup failures after worktree removal.
    }
  }

  if (candidateBranches.size > 0) {
    const currentBranch = await execFileText('git', ['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot).catch(() => '');
    for (const branch of candidateBranches) {
      if (branch === currentBranch) continue;
      try {
        await execFileText('git', ['branch', '-D', branch], repoRoot);
        branchesRemoved += 1;
      } catch {
        // Ignore branch deletion failures.
      }
    }
  }

  await execFileText('git', ['worktree', 'prune'], repoRoot).catch(() => '');
  return { worktreesRemoved, branchesRemoved };
}
