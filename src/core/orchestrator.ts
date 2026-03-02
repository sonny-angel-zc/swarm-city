// Server-side only — do NOT import in client components
import { spawn, execSync, spawnSync } from 'child_process';
import { accessSync, constants as fsConstants, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { AgentRole, SubTask, Task } from './types';

// ─── SSE Event Types ──────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: 'task_created'; task: Task }
  | { type: 'decomposition_start'; taskId: string }
  | { type: 'decomposition_complete'; taskId: string; subtasks: SubTask[] }
  | { type: 'agent_workspace'; taskId: string; role: AgentRole; worktreePath: string; branch: string; created: boolean }
  | { type: 'agent_assigned'; taskId: string; subtask: SubTask; role: AgentRole }
  | { type: 'agent_status'; taskId: string; role: AgentRole; status: 'idle' | 'working' | 'needs_input' | 'done' | 'blocked'; currentTask?: string | null; progress?: number; output?: string }
  | { type: 'agent_retry'; taskId: string; role: AgentRole; attempt: number; maxAttempts?: number; reason?: string; currentTask?: string; progress?: number }
  | { type: 'agent_output'; taskId: string; role: AgentRole; output: string }
  | { type: 'agent_tool_use'; taskId: string; role: AgentRole; tool: string }
  | { type: 'agent_done'; taskId: string; role: AgentRole; output: string }
  | { type: 'agent_usage'; taskId: string; role: AgentRole; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreateTokens: number; costUsd: number; model: string } }
  | { type: 'agent_error'; taskId: string; role: AgentRole; error: string }
  | { type: 'task_failed'; taskId: string; error: string; output?: string; role?: AgentRole }
  | { type: 'task_complete'; taskId: string };

export type SSEListener = (event: SSEEvent) => void;

// ─── Internals ────────────────────────────────────────────────────────────────

type TaskState = {
  task: Task;
  listeners: Set<SSEListener>;
  history: SSEEvent[];
  accumulatedContext: string[];
  humanMessages: Map<AgentRole, string[]>;
  agentConfig: {
    provider: 'anthropic' | 'openai';
    model: string;
  };
};

// Persist across hot reloads in dev mode by attaching to globalThis
const globalForTasks = globalThis as unknown as { __swarmTaskStates?: Map<string, TaskState> };
if (!globalForTasks.__swarmTaskStates) {
  globalForTasks.__swarmTaskStates = new Map<string, TaskState>();
}
const taskStates = globalForTasks.__swarmTaskStates;

// ─── Agent config ─────────────────────────────────────────────────────────────

// Sequential execution order (PM runs first for decomposition, then these in order)
const AGENT_ORDER: AgentRole[] = [
  'researcher',
  'designer',
  'engineer',
  'qa',
  'devils_advocate',
  'reviewer',
];

const AGENT_SYSTEM_PROMPTS: Record<AgentRole, string> = {
  pm: 'You are a PM. Decompose tasks and coordinate the team.',
  researcher: 'You are a Researcher. Gather context, find patterns, summarize.',
  designer: 'You are a UI/UX designer. Create design specs and component structures.',
  engineer: 'You are a Senior software engineer. Write clean production code.',
  qa: 'You are a QA engineer. Write tests, find bugs, validate.',
  devils_advocate: 'You challenge approaches, find flaws, suggest alternatives.',
  reviewer: 'You are a Code reviewer. Review quality, security, maintainability.',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emitEvent(taskId: string, event: SSEEvent) {
  const state = taskStates.get(taskId);
  if (!state) return;
  state.history.push(event);
  for (const listener of state.listeners) {
    try { listener(event); } catch {}
  }
}

function sanitizeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
}

function gitExec(repoRoot: string, args: string[]): string {
  const res = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr?.trim() || 'unknown error'}`);
  }
  return (res.stdout ?? '').trim();
}

function resolveRepoRoot(startDir = process.cwd()): string {
  const configured = process.env.SWARM_REPO_ROOT?.trim();
  if (configured) return path.resolve(configured);
  return execSync('git rev-parse --show-toplevel', { cwd: startDir, encoding: 'utf8' }).trim();
}

function resolveWorktreeRoot(repoRoot: string): string {
  const configured = process.env.SWARM_WORKTREE_ROOT?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(repoRoot, '..', 'swarm-city-worktrees');
}

type WorktreeInfo = {
  dir: string;
  branch: string;
  created: boolean;
};

type AutonomousWorktreeInfo = {
  repoRoot: string;
  worktreeDir: string;
  branch: string;
  issueIdentifier: string;
};

const AUTONOMOUS_RUN_META = '.swarm-run.json';

function resolveAutonomousRunMetaPath(worktreeDir: string): string {
  return path.join(worktreeDir, AUTONOMOUS_RUN_META);
}

function isPidRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureAgentWorktree(taskId: string, role: AgentRole): WorktreeInfo {
  const repoRoot = resolveRepoRoot();
  const worktreeRoot = resolveWorktreeRoot(repoRoot);
  const taskSegment = sanitizeSegment(taskId);
  const roleSegment = sanitizeSegment(role);
  const dir = path.join(worktreeRoot, taskSegment, roleSegment);
  const branch = `swarm/${taskSegment}/${roleSegment}`;
  const gitLink = path.join(dir, '.git');

  mkdirSync(path.dirname(dir), { recursive: true });

  if (existsSync(gitLink)) {
    return { dir, branch, created: false };
  }

  gitExec(repoRoot, ['worktree', 'add', '-f', '-B', branch, dir, 'HEAD']);
  gitExec(dir, ['config', 'user.email', 'agent@swarm.city']);
  gitExec(dir, ['config', 'user.name', 'Swarm Agent']);
  return { dir, branch, created: true };
}

function setupWorkDir(taskId: string, role: AgentRole): WorktreeInfo {
  return ensureAgentWorktree(taskId, role);
}

function resolveAutonomousWorktreeRoot(): string {
  const configured = process.env.SWARM_AUTONOMOUS_WORKTREE_ROOT?.trim();
  if (configured) return path.resolve(configured);
  return path.join(os.tmpdir(), 'swarm-worktrees');
}

function gitRefExists(repoRoot: string, ref: string): boolean {
  const res = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return res.status === 0;
}

function branchExists(repoRoot: string, branch: string): boolean {
  if (gitRefExists(repoRoot, `refs/heads/${branch}`)) return true;
  const remote = spawnSync('git', ['ls-remote', '--heads', 'origin', branch], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (remote.status === 0 && remote.stdout.trim().length > 0) return true;
  return false;
}

function resolveMainRef(repoRoot: string): string {
  if (gitRefExists(repoRoot, 'refs/heads/main')) return 'main';
  if (gitRefExists(repoRoot, 'refs/remotes/origin/main')) return 'origin/main';
  throw new Error('Cannot find main branch (expected local main or origin/main).');
}

function createAutonomousWorktree(workDir: string, issueIdentifier: string): AutonomousWorktreeInfo {
  const repoRoot = resolveRepoRoot(workDir);
  const worktreeRoot = resolveAutonomousWorktreeRoot();
  const issueSegment = sanitizeSegment(issueIdentifier || 'unknown-issue');
  const issueDir = path.join(worktreeRoot, issueSegment);

  mkdirSync(issueDir, { recursive: true });
  gitExec(repoRoot, ['worktree', 'prune']);

  let branch = `auto/${issueSegment}`;
  if (branchExists(repoRoot, branch)) {
    branch = `auto/${issueSegment}-${Date.now()}`;
  }

  const worktreeDir = mkdtempSync(path.join(issueDir, 'run-'));
  const mainRef = resolveMainRef(repoRoot);
  gitExec(repoRoot, ['worktree', 'add', '-f', '-B', branch, worktreeDir, mainRef]);
  gitExec(worktreeDir, ['config', 'user.email', 'agent@swarm.city']);
  gitExec(worktreeDir, ['config', 'user.name', 'Swarm Agent']);
  writeFileSync(
    resolveAutonomousRunMetaPath(worktreeDir),
    JSON.stringify({
      ownerPid: process.pid,
      issueIdentifier: issueIdentifier || 'AUTONOMOUS',
      startedAt: new Date().toISOString(),
    }),
    { encoding: 'utf8' },
  );

  return {
    repoRoot,
    worktreeDir,
    branch,
    issueIdentifier: issueIdentifier || 'AUTONOMOUS',
  };
}

function cleanupAutonomousWorktree(worktree: AutonomousWorktreeInfo): void {
  try {
    gitExec(worktree.repoRoot, ['worktree', 'remove', '--force', worktree.worktreeDir]);
  } catch {
    rmSync(worktree.worktreeDir, { recursive: true, force: true });
  }
  try {
    gitExec(worktree.repoRoot, ['worktree', 'prune']);
  } catch {
    // best-effort cleanup
  }
}

export function hasActiveCodexProcess(): boolean {
  const codex = spawnSync('pgrep', ['-f', 'codex'], { encoding: 'utf8' });
  if (codex.status === 0 && codex.stdout.trim().length > 0) return true;
  const openai = spawnSync('pgrep', ['-f', 'openclaw'], { encoding: 'utf8' });
  return openai.status === 0 && openai.stdout.trim().length > 0;
}

export function cleanupStaleAutonomousWorktrees(workDir = process.cwd()): {
  removed: number;
  skipped: number;
  errors: number;
} {
  const repoRoot = resolveRepoRoot(workDir);
  const worktreeRoot = resolveAutonomousWorktreeRoot();
  const summary = { removed: 0, skipped: 0, errors: 0 };

  if (!existsSync(worktreeRoot)) return summary;

  const issueDirs = readdirSync(worktreeRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const issueDir of issueDirs) {
    const issuePath = path.join(worktreeRoot, issueDir.name);
    const runs = readdirSync(issuePath, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory() && entry.name.startsWith('run-'),
    );

    for (const run of runs) {
      const runPath = path.join(issuePath, run.name);
      let ownerPid: number | null = null;
      try {
        const metaPath = resolveAutonomousRunMetaPath(runPath);
        if (existsSync(metaPath)) {
          const parsed = JSON.parse(readFileSync(metaPath, 'utf8')) as { ownerPid?: unknown };
          if (typeof parsed.ownerPid === 'number') ownerPid = parsed.ownerPid;
        }
      } catch {
        ownerPid = null;
      }

      if (ownerPid && isPidRunning(ownerPid)) {
        summary.skipped += 1;
        continue;
      }

      try {
        gitExec(repoRoot, ['worktree', 'remove', '--force', runPath]);
      } catch {
        try {
          rmSync(runPath, { recursive: true, force: true });
        } catch {
          summary.errors += 1;
          continue;
        }
      }
      summary.removed += 1;
    }
  }

  try {
    gitExec(repoRoot, ['worktree', 'prune']);
  } catch {
    summary.errors += 1;
  }

  return summary;
}

export function cleanupAutonomousBranchesForClosedIssues(
  issueIdentifiers: string[],
  workDir = process.cwd(),
): { deleted: number; skipped: number; errors: number } {
  const repoRoot = resolveRepoRoot(workDir);
  const summary = { deleted: 0, skipped: 0, errors: 0 };
  const normalized = Array.from(
    new Set(
      issueIdentifiers
        .map((value) => sanitizeSegment(value))
        .filter(Boolean),
    ),
  );
  if (normalized.length === 0) return summary;

  const currentBranch = gitExec(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branchListing = gitExec(repoRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/auto']);
  const branches = branchListing
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const branch of branches) {
    const match = normalized.some((id) => branch === `auto/${id}` || branch.startsWith(`auto/${id}-`));
    if (!match) continue;
    if (branch === currentBranch) {
      summary.skipped += 1;
      continue;
    }
    const deleted = spawnSync('git', ['branch', '-D', branch], { cwd: repoRoot, encoding: 'utf8' });
    if (deleted.status === 0) {
      summary.deleted += 1;
    } else {
      summary.errors += 1;
    }
  }

  return summary;
}

function ensureGhReady(workDir: string): void {
  const version = spawnSync('gh', ['--version'], { cwd: workDir, encoding: 'utf8' });
  if (version.status !== 0) {
    throw new Error('GitHub CLI (gh) is not available in PATH.');
  }
  const auth = spawnSync('gh', ['auth', 'status', '--hostname', 'github.com'], { cwd: workDir, encoding: 'utf8' });
  if (auth.status !== 0) {
    throw new Error(`GitHub CLI is not authenticated: ${(auth.stderr || auth.stdout || '').trim()}`);
  }
}

function hasTrackedOrUntrackedChanges(workDir: string): boolean {
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: workDir, encoding: 'utf8' });
  if (status.status !== 0) {
    throw new Error(`git status failed: ${(status.stderr ?? '').trim()}`);
  }
  return status.stdout.trim().length > 0;
}

function finalizeAutonomousBranch(params: {
  worktree: AutonomousWorktreeInfo;
  issueTitle: string;
  issueDescription?: string | null;
}): { commitSha: string; prUrl: string } | null {
  const { worktree } = params;
  if (!hasTrackedOrUntrackedChanges(worktree.worktreeDir)) {
    return null;
  }

  gitExec(worktree.worktreeDir, ['add', '-A']);
  const staged = spawnSync('git', ['diff', '--cached', '--name-only'], {
    cwd: worktree.worktreeDir,
    encoding: 'utf8',
  });
  if (staged.status !== 0) {
    throw new Error(`Unable to inspect staged files: ${(staged.stderr ?? '').trim()}`);
  }
  if (staged.stdout.trim().length === 0) {
    return null;
  }

  const commitTitle = `${worktree.issueIdentifier}: ${params.issueTitle}`.slice(0, 200);
  gitExec(worktree.worktreeDir, ['commit', '-m', commitTitle]);
  const commitSha = gitExec(worktree.worktreeDir, ['rev-parse', 'HEAD']);

  gitExec(worktree.worktreeDir, ['push', '--set-upstream', 'origin', worktree.branch]);
  ensureGhReady(worktree.worktreeDir);

  const prBody = [
    `Automated implementation for ${worktree.issueIdentifier}.`,
    '',
    params.issueDescription ? params.issueDescription.trim() : '(no issue description provided)',
  ].join('\n');
  const prCreate = spawnSync(
    'gh',
    [
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      worktree.branch,
      '--title',
      commitTitle,
      '--body',
      prBody,
    ],
    {
      cwd: worktree.worktreeDir,
      encoding: 'utf8',
    },
  );
  if (prCreate.status !== 0) {
    // PR creation may fail due to PAT permissions — log warning but don't fail the task
    const prErr = (prCreate.stderr || prCreate.stdout || '').trim();
    console.warn(`[orchestrator] gh pr create failed (non-fatal): ${prErr}`);
    return { commitSha, prUrl: `https://github.com/sonny-angel-zc/swarm-city/tree/${worktree.branch}` };
  }

  const prUrl = (prCreate.stdout || '').trim().split('\n').map((line) => line.trim()).filter(Boolean).pop() ?? '';
  return { commitSha, prUrl };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

type RetryKind = 'rate_limit' | 'token_limit' | 'transient' | 'none';

export function detectRetryKind(message: string): RetryKind {
  const text = message.toLowerCase();
  if (
    /context length|token limit|too many tokens|max(imum)? context|prompt too long/.test(text)
  ) {
    return 'token_limit';
  }
  if (
    /429|rate.?limit|too many requests|retry after|quota|overloaded|capacity/.test(text)
  ) {
    return 'rate_limit';
  }
  if (
    /etimedout|timeout|econnreset|temporar|try again|network/i.test(message)
  ) {
    return 'transient';
  }
  return 'none';
}

function parseRetryAfterMs(message: string): number | null {
  const sec = message.match(/retry[-\s]?after[:\s]+(\d+)\s*(s|sec|secs|second|seconds)\b/i);
  if (sec) return Number(sec[1]) * 1000;
  const ms = message.match(/retry[-\s]?after[:\s]+(\d+)\s*ms\b/i);
  if (ms) return Number(ms[1]);
  return null;
}

function backoffMs(attempt: number, message: string): number {
  const parsed = parseRetryAfterMs(message);
  if (parsed && Number.isFinite(parsed)) return Math.max(1_000, Math.min(120_000, parsed));
  const base = 2_000 * (2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 800);
  return Math.min(120_000, base + jitter);
}

function compactPromptForRetry(prompt: string, attempt: number): string {
  if (attempt <= 1) return prompt;
  const tailChars = Math.max(3_000, 12_000 - (attempt - 1) * 2_000);
  const tail = prompt.length > tailChars ? prompt.slice(-tailChars) : prompt;
  return [
    'A previous attempt exceeded context/token limits.',
    'Continue using only the most recent context below and keep output concise.',
    '',
    tail,
  ].join('\n');
}

function parseCodexJsonLineText(obj: unknown): string[] {
  const out: string[] = [];
  if (!obj || typeof obj !== 'object') return out;
  const node = obj as Record<string, unknown>;

  if (typeof node.text === 'string') out.push(node.text);
  if (typeof node.output_text === 'string') out.push(node.output_text);
  if (typeof node.delta === 'string') out.push(node.delta);
  if (typeof node.content === 'string') out.push(node.content);

  const content = node.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === 'object') {
        const p = part as Record<string, unknown>;
        if (typeof p.text === 'string') out.push(p.text);
        if (typeof p.output_text === 'string') out.push(p.output_text);
      }
    }
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      out.push(...parseCodexJsonLineText(value));
    }
  }
  return out.filter(Boolean);
}

type CodexUsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
};

function parseCodexUsage(obj: unknown): CodexUsageSummary | null {
  if (!obj || typeof obj !== 'object') return null;
  const node = obj as Record<string, unknown>;

  const input = node.input_tokens ?? node.inputTokens ?? null;
  const output = node.output_tokens ?? node.outputTokens ?? null;
  const total = node.total_tokens ?? node.totalTokens ?? null;
  const model = typeof node.model === 'string' ? node.model : '';

  const hasNumberish = [input, output, total].some((v) => typeof v === 'number');
  if (hasNumberish) {
    const inputTokens = typeof input === 'number' ? input : 0;
    const outputTokens = typeof output === 'number' ? output : 0;
    const totalTokens = typeof total === 'number' ? total : inputTokens + outputTokens;
    return { inputTokens, outputTokens, totalTokens, model };
  }

  if (node.usage && typeof node.usage === 'object') {
    return parseCodexUsage(node.usage);
  }
  return null;
}

function runAnthropicAgent(
  taskId: string,
  role: AgentRole,
  prompt: string,
  workDir: string,
  model: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fullPrompt = `${AGENT_SYSTEM_PROMPTS[role]}\n\n${prompt}`;

    const proc = spawn(
      'claude',
      ['-p', '--dangerously-skip-permissions', '--model', model, '--output-format', 'stream-json', '--verbose'],
      { cwd: workDir, env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    proc.stdin.write(fullPrompt);
    proc.stdin.end();

    let buffer = '';
    let resultText = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      // Parse NDJSON lines as they arrive
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          if (event.type === 'assistant') {
            // Extract text content from assistant messages for streaming
            const content = event.message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  emitEvent(taskId, { type: 'agent_output', taskId, role, output: block.text });
                } else if (block.type === 'tool_use') {
                  emitEvent(taskId, { type: 'agent_tool_use', taskId, role, tool: block.name ?? 'unknown' });
                }
              }
            }
          } else if (event.type === 'result') {
            // Final result — extract text and usage
            resultText = event.result ?? '';
            const usage = event.usage;
            const costUsd = event.total_cost_usd ?? 0;
            const modelKeys = event.modelUsage ? Object.keys(event.modelUsage) : [];
            const resultModel = modelKeys[0] ?? model;
            if (usage) {
              emitEvent(taskId, {
                type: 'agent_usage',
                taskId,
                role,
                usage: {
                  inputTokens: usage.input_tokens ?? 0,
                  outputTokens: usage.output_tokens ?? 0,
                  cacheReadTokens: usage.cache_read_input_tokens ?? 0,
                  cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
                  costUsd,
                  model: resultModel,
                },
              });
            }
          }
          // init and rate_limit_event are informational — skip for now
        } catch {
          // Not valid JSON line — ignore partial chunks
        }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (!text) return;
      const toolMatch = text.match(/tool[:\s]+(\w+)/i);
      if (toolMatch) {
        emitEvent(taskId, { type: 'agent_tool_use', taskId, role, tool: toolMatch[1] });
      }
    });

    proc.on('close', (code) => {
      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === 'result') {
            resultText = event.result ?? resultText;
          }
        } catch { /* ignore */ }
      }
      if (resultText || code === 0) {
        resolve(resultText);
      } else {
        reject(new Error(`claude exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

function runOpenAIAgent(
  taskId: string,
  role: AgentRole,
  prompt: string,
  workDir: string,
  model: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fullPrompt = `${AGENT_SYSTEM_PROMPTS[role]}\n\n${prompt}`;
    const codexBin = process.env.SWARM_CODEX_BIN ?? 'codex';
    const isolatedContext = (process.env.SWARM_CODEX_ISOLATED_CONTEXT ?? 'true').toLowerCase() !== 'false';
    const args = [
      'exec',
      '--json',
      '--color',
      'never',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '--model',
      model,
      fullPrompt,
    ];
    if (isolatedContext) args.splice(7, 0, '--ephemeral');

    const proc = spawn(codexBin, args, {
      cwd: workDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      let parsedText = '';
      let usage: CodexUsageSummary | null = null;
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const chunks = parseCodexJsonLineText(obj);
          if (chunks.length > 0) parsedText += `${chunks.join('\n')}\n`;
          const candidate = parseCodexUsage(obj);
          if (candidate) usage = candidate;
        } catch {
          // non-json line, ignore here
        }
      }

      const text = parsedText.trim() || stdout.trim();
      if (stderr.trim()) {
        emitEvent(taskId, { type: 'agent_tool_use', taskId, role, tool: 'codex-cli' });
      }
      if (usage) {
        emitEvent(taskId, {
          type: 'agent_usage',
          taskId,
          role,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: 0,
            cacheCreateTokens: 0,
            costUsd: 0,
            model: usage.model || model,
          },
        });
      }

      if (code === 0 && text) {
        emitEvent(taskId, { type: 'agent_output', taskId, role, output: text });
        resolve(text);
        return;
      }

      const combined = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
      if (code !== 0) {
        reject(new Error(`codex exited with code ${code}${combined ? `: ${combined}` : ''}`));
        return;
      }
      reject(new Error('codex completed with empty output'));
    });

    proc.on('error', (err) => {
      reject(new Error(`failed to launch codex CLI: ${String(err)}`));
    });
  });
}

type CodexExecResult = {
  code: number | null;
  text: string;
  stderr: string;
  stdout: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    model: string;
  };
};

export async function runCodexExec(params: {
  prompt: string;
  workDir: string;
  model?: string;
  sandbox?: 'read-only' | 'workspace-write';
  isolatedContext?: boolean;
}): Promise<CodexExecResult> {
  return new Promise((resolve, reject) => {
    const codexBin = process.env.SWARM_CODEX_BIN ?? 'codex';
    const isolatedContext = params.isolatedContext ?? (process.env.SWARM_CODEX_ISOLATED_CONTEXT ?? 'true').toLowerCase() !== 'false';
    const args = [
      'exec',
      '--json',
      '--color',
      'never',
      '--sandbox',
      params.sandbox ?? 'workspace-write',
      '--skip-git-repo-check',
      '--model',
      params.model ?? 'gpt-5.3-codex',
      params.prompt,
    ];
    if (isolatedContext) args.splice(7, 0, '--ephemeral');

    const proc = spawn(codexBin, args, {
      cwd: params.workDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(new Error(`failed to launch codex CLI: ${String(err)}`)));
    proc.on('close', (code) => {
      const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      let parsedText = '';
      let usage: CodexExecResult['usage'] = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        model: params.model ?? 'gpt-5.3-codex',
      };
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const chunks = parseCodexJsonLineText(obj);
          if (chunks.length > 0) parsedText += `${chunks.join('\n')}\n`;
          const candidate = parseCodexUsage(obj);
          if (candidate) {
            usage = {
              inputTokens: candidate.inputTokens,
              outputTokens: candidate.outputTokens,
              totalTokens: candidate.totalTokens,
              model: candidate.model || usage.model,
            };
          }
        } catch {
          // ignore non-json lines in JSON mode
        }
      }

      resolve({
        code,
        text: parsedText.trim() || stdout.trim(),
        stderr: stderr.trim(),
        stdout: stdout.trim(),
        usage,
      });
    });
  });
}

export type AutonomousExecutionResult = {
  ok: boolean;
  output: string;
  restarts: string[];
  rateLimited: boolean;
  retryAfterMs: number | null;
  preflight: AutonomousPreflightResult;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    model: string;
  };
};

export type AutonomousPreflightResult = {
  noCommitMode: boolean;
  constraints: string[];
};

const ISSUE_TITLE_PLACEHOLDERS = new Set([
  'hi',
  'hello',
  'hey',
  'test',
  'todo',
  'tbd',
  'wip',
  'fix',
  'issue',
]);

function normalizeIssueText(value?: string | null): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function isMissingIssueDescription(description?: string | null): boolean {
  const normalized = normalizeIssueText(description).toLowerCase();
  return !normalized || normalized === '(no description provided)';
}

function getIssueInputProblem(title: string, description?: string | null): string | null {
  const normalizedTitle = normalizeIssueText(title);
  const normalizedTitleLower = normalizedTitle.toLowerCase();
  const missingDescription = isMissingIssueDescription(description);

  if (!normalizedTitle) {
    return 'Issue title is empty. Add a specific title and description before running autonomous execution.';
  }

  if (missingDescription && (normalizedTitle.length < 8 || ISSUE_TITLE_PLACEHOLDERS.has(normalizedTitleLower))) {
    return `Issue "${normalizedTitle}" is under-specified (missing description). Add acceptance criteria or implementation details and retry.`;
  }

  return null;
}

export function runAutonomousPreflight(workDir: string): AutonomousPreflightResult {
  const constraints: string[] = [];

  const gitDir = path.join(workDir, '.git');
  if (!existsSync(gitDir)) {
    constraints.push('.git directory is missing; commits cannot be created.');
  } else {
    try {
      if (!statSync(gitDir).isDirectory()) {
        constraints.push('.git path exists but is not a directory; commits cannot be created.');
      } else {
        const probe = path.join(gitDir, `.swarm-preflight-${process.pid}-${Date.now()}.tmp`);
        writeFileSync(probe, 'preflight', { flag: 'wx' });
        unlinkSync(probe);
      }
    } catch (err) {
      constraints.push(`.git is not writable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const lockfileCandidates = [
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'npm-shrinkwrap.json',
  ];
  const existingLockfiles = lockfileCandidates.filter((file) => existsSync(path.join(workDir, file)));

  if (existingLockfiles.length > 0) {
    const blocked: string[] = [];
    for (const lockfile of existingLockfiles) {
      try {
        accessSync(path.join(workDir, lockfile), fsConstants.W_OK);
      } catch {
        blocked.push(lockfile);
      }
    }
    if (blocked.length > 0) {
      constraints.push(`Lockfile(s) not writable: ${blocked.join(', ')}`);
    }
  } else if (existsSync(path.join(workDir, 'package.json'))) {
    try {
      const probe = path.join(workDir, `.swarm-lockfile-preflight-${process.pid}-${Date.now()}.tmp`);
      writeFileSync(probe, 'preflight', { flag: 'wx' });
      unlinkSync(probe);
    } catch (err) {
      constraints.push(`Workspace does not allow lockfile updates: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    noCommitMode: constraints.length > 0,
    constraints,
  };
}

export async function executeAutonomousTaskWithCodex(params: {
  title: string;
  description?: string | null;
  issueIdentifier: string;
  workDir: string;
  model?: string;
  preflight?: AutonomousPreflightResult;
}): Promise<AutonomousExecutionResult> {
  const model = params.model ?? 'gpt-5.3-codex';
  const maxAttempts = Number(process.env.SWARM_AUTONOMOUS_MAX_RETRIES ?? '3');
  const restarts: string[] = [];
  const preflight = params.preflight ?? runAutonomousPreflight(params.workDir);
  const issueInputProblem = getIssueInputProblem(params.title, params.description);
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    model,
  };

  if (issueInputProblem) {
    return {
      ok: false,
      output: issueInputProblem,
      restarts,
      rateLimited: false,
      retryAfterMs: null,
      preflight,
      usage,
    };
  }

  const preflightLine = preflight.constraints.length > 0
    ? preflight.constraints.join(' | ')
    : 'none';

  const basePrompt = [
    'You are an autonomous engineering agent working directly on the current repository.',
    'Implement the Linear issue described below end-to-end.',
    'Constraints:',
    preflight.noCommitMode
      ? '- Preflight mode: no-commit (git/lockfile constraints detected).'
      : '- Preflight mode: normal (git/lockfile checks passed).',
    `- Preflight constraints: ${preflightLine}`,
    preflight.noCommitMode
      ? '- Do not run git add/commit or any git write operation.'
      : '- Commit is handled by the orchestrator after implementation.',
    '- Modify code directly in this repo.',
    '- Do not run git commit, git push, or gh pr create; the orchestrator will do this after your implementation.',
    '- Run any validation needed to ensure the implementation is coherent.',
    preflight.noCommitMode
      ? '- In your first output line, report the preflight constraints before describing changes.'
      : '- If no constraints are present, you may proceed with normal commit flow.',
    '- Keep output concise: what changed, what was validated, and commit hash.',
    '',
    `Issue Title: ${params.title}`,
    `Issue Description: ${params.description ?? '(no description provided)'}`,
  ].join('\n');

  let prompt = basePrompt;
  let worktree: AutonomousWorktreeInfo | null = null;

  try {
    worktree = createAutonomousWorktree(params.workDir, params.issueIdentifier);
    const activeWorktree = worktree;
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
      const result = await runCodexExec({
        prompt,
        workDir: activeWorktree.worktreeDir,
        model,
        sandbox: 'workspace-write',
        isolatedContext: true,
      });

      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      usage.totalTokens += result.usage.totalTokens;
      if (result.usage.model) usage.model = result.usage.model;

      if (result.code === 0) {
        const finalized = preflight.noCommitMode
          ? null
          : finalizeAutonomousBranch({
            worktree: activeWorktree,
            issueTitle: params.title,
            issueDescription: params.description,
          });

        const summaryLines = finalized
          ? [`Branch: ${activeWorktree.branch}`, `Commit: ${finalized.commitSha}`, `PR: ${finalized.prUrl || '(created; URL not returned)'}`]
          : preflight.noCommitMode
            ? ['No-commit mode enabled; skipped commit, push, and PR creation.']
            : ['No file changes detected; skipped commit, push, and PR creation.'];

        return {
          ok: true,
          output: `${result.text}\n\n${summaryLines.join('\n')}`.trim(),
          restarts,
          rateLimited: false,
          retryAfterMs: null,
          preflight,
          usage,
        };
      }

      const combined = [result.stderr, result.stdout].filter(Boolean).join('\n');
      const kind = detectRetryKind(combined || `exit code ${String(result.code)}`);
      const canRetry = attempt < Math.max(1, maxAttempts);

      if (kind === 'rate_limit') {
        return {
          ok: false,
          output: combined || `codex exited with code ${String(result.code)}`,
          restarts,
          rateLimited: true,
          retryAfterMs: parseRetryAfterMs(combined),
          preflight,
          usage,
        };
      }

      if (canRetry && (kind === 'token_limit' || kind === 'transient')) {
        const waitMs = backoffMs(attempt, combined);
        restarts.push(`Auto-restart due to ${kind} (attempt ${attempt + 1}/${maxAttempts})`);
        if (kind === 'token_limit') {
          prompt = compactPromptForRetry(basePrompt, attempt + 1);
        }
        await delay(waitMs);
        continue;
      }

      return {
        ok: false,
        output: combined || `codex exited with code ${String(result.code)}`,
        restarts,
        rateLimited: false,
        retryAfterMs: null,
        preflight,
        usage,
      };
    }

    return {
      ok: false,
      output: 'Autonomous execution failed after retry budget.',
      restarts,
      rateLimited: false,
      retryAfterMs: null,
      preflight,
      usage,
    };
  } catch (err) {
    return {
      ok: false,
      output: err instanceof Error ? err.message : String(err),
      restarts,
      rateLimited: false,
      retryAfterMs: null,
      preflight,
      usage,
    };
  } finally {
    if (worktree) cleanupAutonomousWorktree(worktree);
  }
}

async function runAgentWithRecovery(
  taskId: string,
  role: AgentRole,
  prompt: string,
  workDir: string,
  config: TaskState['agentConfig'],
): Promise<string> {
  const maxAttempts = Number(process.env.SWARM_AGENT_MAX_RETRIES ?? '4');
  let effectivePrompt = prompt;

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
    try {
      if (config.provider === 'openai') {
        return await runOpenAIAgent(taskId, role, effectivePrompt, workDir, config.model);
      }
      return await runAnthropicAgent(taskId, role, effectivePrompt, workDir, config.model);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const kind = detectRetryKind(message);
      const canRetry = kind !== 'none' && attempt < maxAttempts;

      if (!canRetry) throw err;

      const waitMs = backoffMs(attempt, message);
      if (kind === 'token_limit') {
        effectivePrompt = compactPromptForRetry(prompt, attempt + 1);
      }

      emitEvent(taskId, {
        type: 'agent_error',
        taskId,
        role,
        error: `Auto-restart (${kind}) in ${Math.ceil(waitMs / 1000)}s [attempt ${attempt + 1}/${maxAttempts}]`,
      });
      await delay(waitMs);
    }
  }

  throw new Error('agent failed after retry budget exhausted');
}

function runAgent(
  taskId: string,
  role: AgentRole,
  prompt: string,
  workDir: string,
  config: TaskState['agentConfig'],
): Promise<string> {
  return runAgentWithRecovery(taskId, role, prompt, workDir, config);
}

// ─── PM decomposition ─────────────────────────────────────────────────────────

async function runPMDecomposition(
  taskId: string,
  title: string,
  agentConfig: TaskState['agentConfig'],
): Promise<SubTask[]> {
  const worktree = setupWorkDir(taskId, 'pm');
  emitEvent(taskId, {
    type: 'agent_workspace',
    taskId,
    role: 'pm',
    worktreePath: worktree.dir,
    branch: worktree.branch,
    created: worktree.created,
  });
  emitEvent(taskId, { type: 'decomposition_start', taskId });

  const prompt =
    `You are a PM. Decompose this task into exactly 6 subtasks for a software team.\n` +
    `Task: "${title}"\n\n` +
    `Agents (use each EXACTLY once, in this order): researcher, designer, engineer, qa, devils_advocate, reviewer\n\n` +
    `Respond with ONLY a valid JSON array — no markdown, no prose:\n` +
    `[\n` +
    `  {"role":"researcher","title":"Research: <task>","description":"<detail>"},\n` +
    `  {"role":"designer","title":"Design: <task>","description":"<detail>"},\n` +
    `  {"role":"engineer","title":"Implement: <task>","description":"<detail>"},\n` +
    `  {"role":"qa","title":"Test: <task>","description":"<detail>"},\n` +
    `  {"role":"devils_advocate","title":"Challenge: <task>","description":"<detail>"},\n` +
    `  {"role":"reviewer","title":"Review: <task>","description":"<detail>"}\n` +
    `]`;

  let rawOutput = '';
  try {
    rawOutput = await runAgent(taskId, 'pm', prompt, worktree.dir, agentConfig);
  } catch (err) {
    console.error('[orchestrator] PM decomposition failed:', err);
  }

  // Parse JSON
  try {
    const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed: { role: AgentRole; title: string; description: string }[] = JSON.parse(jsonMatch[0]);
      return parsed.map((s, i) => ({
        id: `st-${taskId}-${i}`,
        title: s.title,
        assignedTo: s.role,
        status: 'pending' as const,
        progress: 0,
        description: s.description,
      }));
    }
  } catch { /* fall through to default */ }

  // Fallback: build default subtasks
  return AGENT_ORDER.map((role, i) => ({
    id: `st-${taskId}-${i}`,
    title: `${role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' ')}: ${title}`,
    assignedTo: role,
    status: 'pending' as const,
    progress: 0,
    description: AGENT_SYSTEM_PROMPTS[role],
  }));
}

// ─── Main orchestration loop ──────────────────────────────────────────────────

async function orchestrate(taskId: string) {
  const state = taskStates.get(taskId);
  if (!state) return;

  try {
    // Emit task_created — replay-safe, SSE clients may not be connected yet
    emitEvent(taskId, { type: 'task_created', task: state.task });

    // PM decomposition
    const subtasks = await runPMDecomposition(taskId, state.task.title, state.agentConfig);
    state.task = { ...state.task, subtasks, status: 'in_progress' };
    emitEvent(taskId, { type: 'decomposition_complete', taskId, subtasks });

    // Run agents sequentially
    for (const subtask of subtasks) {
      const role = subtask.assignedTo;

      subtask.status = 'in_progress';
      emitEvent(taskId, { type: 'agent_assigned', taskId, subtask: { ...subtask }, role });

      const worktree = setupWorkDir(taskId, role);
      emitEvent(taskId, {
        type: 'agent_workspace',
        taskId,
        role,
        worktreePath: worktree.dir,
        branch: worktree.branch,
        created: worktree.created,
      });

      // Build prompt — prepend prior context
      const priorContext = state.accumulatedContext.join('\n\n---\n\n');
      const humanMsgs = (state.humanMessages.get(role) ?? []).join('\n');
      const agentPrompt = [
        priorContext && `Context from prior agents:\n${priorContext}`,
        humanMsgs && `Human messages:\n${humanMsgs}`,
        `Your task: ${subtask.title}\n${subtask.description}`,
      ].filter(Boolean).join('\n\n---\n\n');

      try {
        const output = await runAgent(taskId, role, agentPrompt, worktree.dir, state.agentConfig);
        state.accumulatedContext.push(`## ${role.toUpperCase()}:\n${output}`);
        subtask.status = 'done';
        subtask.progress = 1;
        emitEvent(taskId, { type: 'agent_done', taskId, role, output });
      } catch (err) {
        subtask.status = 'done';
        emitEvent(taskId, { type: 'agent_error', taskId, role, error: String(err) });
      }
    }

    state.task.status = 'done';
    emitEvent(taskId, { type: 'task_complete', taskId });
  } catch (err) {
    console.error('[orchestrator] orchestration error for task', taskId, err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createTask(
  title: string,
  config?: { provider?: 'anthropic' | 'openai'; model?: string },
): Task {
  const taskId = `task-${Date.now()}`;
  const provider = config?.provider ?? 'openai';
  const model =
    config?.model ??
    (provider === 'openai' ? 'gpt-5.3-codex' : 'claude-sonnet-4');
  const task: Task = {
    id: taskId,
    title,
    subtasks: [],
    status: 'decomposing',
    createdAt: Date.now(),
  };

  taskStates.set(taskId, {
    task,
    listeners: new Set(),
    history: [],
    accumulatedContext: [],
    humanMessages: new Map(),
    agentConfig: { provider, model },
  });

  // Run orchestration async after a brief delay to let SSE clients connect
  setTimeout(() => orchestrate(taskId), 150);

  return task;
}

export function subscribeToTask(taskId: string, listener: SSEListener): () => void {
  const state = taskStates.get(taskId);
  if (!state) return () => {};

  // Replay history so late-connecting clients get all events
  for (const event of state.history) {
    try { listener(event); } catch {}
  }

  state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}

export function getTask(taskId: string): Task | undefined {
  return taskStates.get(taskId)?.task;
}

export function addHumanMessage(taskId: string, role: AgentRole, message: string) {
  const state = taskStates.get(taskId);
  if (!state) return;
  const msgs = state.humanMessages.get(role) ?? [];
  msgs.push(message);
  state.humanMessages.set(role, msgs);
}
