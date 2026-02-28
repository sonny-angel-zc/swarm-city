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
};

// Module-level singleton — shared across all requests in the same Node.js process
const taskStates = new Map<string, TaskState>();

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

function runClaudeAgent(
  taskId: string,
  role: AgentRole,
  prompt: string,
  workDir: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fullPrompt = `${AGENT_SYSTEM_PROMPTS[role]}\n\n${prompt}`;

    const proc = spawn(
      'claude',
      ['-p', '--dangerously-skip-permissions', '--model', 'sonnet', fullPrompt],
      { cwd: workDir, env: { ...process.env } },
    );

    let output = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      emitEvent(taskId, { type: 'agent_output', taskId, role, output: text });
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (!text) return;
      // claude CLI uses stderr for tool-use lines like "⎿ Ran tool: X"
      const toolMatch = text.match(/tool[:\s]+(\w+)/i);
      if (toolMatch) {
        emitEvent(taskId, { type: 'agent_tool_use', taskId, role, tool: toolMatch[1] });
      }
    });

    proc.on('close', (code) => {
      if (output || code === 0) {
        resolve(output);
      } else {
        reject(new Error(`claude exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

// ─── PM decomposition ─────────────────────────────────────────────────────────

async function runPMDecomposition(taskId: string, title: string): Promise<SubTask[]> {
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
    rawOutput = await runClaudeAgent(taskId, 'pm', prompt, workDir);
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
    const subtasks = await runPMDecomposition(taskId, state.task.title);
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
        const output = await runClaudeAgent(taskId, role, agentPrompt, workDir);
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

export function createTask(title: string): Task {
  const taskId = `task-${Date.now()}`;
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
