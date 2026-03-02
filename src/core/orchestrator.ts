// Server-side only — do NOT import in client components
import { spawn, execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { AgentRole, SubTask, Task } from './types';

// ─── SSE Event Types ──────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: 'task_created'; task: Task }
  | { type: 'decomposition_start'; taskId: string }
  | { type: 'decomposition_complete'; taskId: string; subtasks: SubTask[] }
  | { type: 'agent_assigned'; taskId: string; subtask: SubTask; role: AgentRole }
  | { type: 'agent_output'; taskId: string; role: AgentRole; output: string }
  | { type: 'agent_tool_use'; taskId: string; role: AgentRole; tool: string }
  | { type: 'agent_done'; taskId: string; role: AgentRole; output: string }
  | { type: 'agent_usage'; taskId: string; role: AgentRole; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreateTokens: number; costUsd: number; model: string } }
  | { type: 'agent_error'; taskId: string; role: AgentRole; error: string }
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

function setupWorkDir(taskId: string, role: AgentRole): string {
  const dir = `/tmp/swarm-city-tasks/${taskId}/${role}`;
  mkdirSync(dir, { recursive: true });
  try {
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "agent@swarm.city"', { cwd: dir });
    execSync('git config user.name "Swarm Agent"', { cwd: dir });
  } catch { /* git already initialised or not needed */ }
  return dir;
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
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const chunks = parseCodexJsonLineText(obj);
          if (chunks.length > 0) parsedText += `${chunks.join('\n')}\n`;
        } catch {
          // non-json line, ignore here
        }
      }

      const text = parsedText.trim() || stdout.trim();
      if (stderr.trim()) {
        emitEvent(taskId, { type: 'agent_tool_use', taskId, role, tool: 'codex-cli' });
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
};

export async function runCodexExec(params: {
  prompt: string;
  workDir: string;
  model?: string;
  sandbox?: 'read-only' | 'workspace-write';
}): Promise<CodexExecResult> {
  return new Promise((resolve, reject) => {
    const codexBin = process.env.SWARM_CODEX_BIN ?? 'codex';
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
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const chunks = parseCodexJsonLineText(obj);
          if (chunks.length > 0) parsedText += `${chunks.join('\n')}\n`;
        } catch {
          // ignore non-json lines in JSON mode
        }
      }

      resolve({
        code,
        text: parsedText.trim() || stdout.trim(),
        stderr: stderr.trim(),
        stdout: stdout.trim(),
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
};

export async function executeAutonomousTaskWithCodex(params: {
  title: string;
  description?: string | null;
  workDir: string;
  model?: string;
}): Promise<AutonomousExecutionResult> {
  const model = params.model ?? 'gpt-5.3-codex';
  const maxAttempts = Number(process.env.SWARM_AUTONOMOUS_MAX_RETRIES ?? '3');
  const restarts: string[] = [];

  const basePrompt = [
    'You are an autonomous engineering agent working directly on the current repository.',
    'Implement the Linear issue described below end-to-end.',
    'Constraints:',
    '- Modify code directly in this repo.',
    '- Run any validation needed to ensure the implementation is coherent.',
    '- Commit your changes with a clear commit message.',
    '- Keep output concise: what changed, what was validated, and commit hash.',
    '',
    `Issue Title: ${params.title}`,
    `Issue Description: ${params.description ?? '(no description provided)'}`,
  ].join('\n');

  let prompt = basePrompt;

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
    const result = await runCodexExec({
      prompt,
      workDir: params.workDir,
      model,
      sandbox: 'workspace-write',
    });

    if (result.code === 0) {
      return {
        ok: true,
        output: result.text,
        restarts,
        rateLimited: false,
        retryAfterMs: null,
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
    };
  }

  return {
    ok: false,
    output: 'Autonomous execution failed after retry budget.',
    restarts,
    rateLimited: false,
    retryAfterMs: null,
  };
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
  const workDir = setupWorkDir(taskId, 'pm');
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
    rawOutput = await runAgent(taskId, 'pm', prompt, workDir, agentConfig);
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

      const workDir = setupWorkDir(taskId, role);

      // Build prompt — prepend prior context
      const priorContext = state.accumulatedContext.join('\n\n---\n\n');
      const humanMsgs = (state.humanMessages.get(role) ?? []).join('\n');
      const agentPrompt = [
        priorContext && `Context from prior agents:\n${priorContext}`,
        humanMsgs && `Human messages:\n${humanMsgs}`,
        `Your task: ${subtask.title}\n${subtask.description}`,
      ].filter(Boolean).join('\n\n---\n\n');

      try {
        const output = await runAgent(taskId, role, agentPrompt, workDir, state.agentConfig);
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
