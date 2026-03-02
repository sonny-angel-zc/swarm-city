import { AgentRole } from './types';

export type ServerAgentStatus = 'idle' | 'working' | 'reviewing' | 'blocked';

export type ServerAgentState = {
  status: ServerAgentStatus;
  currentTask: string | null;
  lastOutput: string | null;
  updatedAt: number;
  tokensUsed: number;
  taskStartedAt: number | null;
};

type AgentRegistry = Map<AgentRole, ServerAgentState>;

const ALL_ROLES: AgentRole[] = ['pm', 'engineer', 'designer', 'qa', 'devils_advocate', 'reviewer', 'researcher'];

const globalRegistry = globalThis as unknown as { __swarmAgentRegistry?: AgentRegistry };

function createInitialRegistry(): AgentRegistry {
  const now = Date.now();
  const registry = new Map<AgentRole, ServerAgentState>();
  for (const role of ALL_ROLES) {
    registry.set(role, {
      status: 'idle',
      currentTask: null,
      lastOutput: null,
      updatedAt: now,
      tokensUsed: 0,
      taskStartedAt: null,
    });
  }
  return registry;
}

if (!globalRegistry.__swarmAgentRegistry) {
  globalRegistry.__swarmAgentRegistry = createInitialRegistry();
}

function registry(): AgentRegistry {
  return globalRegistry.__swarmAgentRegistry as AgentRegistry;
}

export function getAgentStatus(role: AgentRole): ServerAgentState {
  return { ...(registry().get(role) ?? { status: 'idle', currentTask: null, lastOutput: null, updatedAt: Date.now() }) };
}

export function setAgentStatus(role: AgentRole, status: ServerAgentStatus, task: string | null): void {
  const existing = registry().get(role);
  const now = Date.now();
  registry().set(role, {
    status,
    currentTask: task,
    lastOutput: existing?.lastOutput ?? null,
    updatedAt: now,
    tokensUsed: status === 'working' && task !== existing?.currentTask ? 0 : (existing?.tokensUsed ?? 0),
    taskStartedAt: status === 'working' ? (existing?.taskStartedAt ?? now) : null,
  });
}

export function addAgentTokens(role: AgentRole, tokens: number): void {
  const existing = registry().get(role);
  if (!existing) return;
  registry().set(role, {
    ...existing,
    tokensUsed: existing.tokensUsed + tokens,
    updatedAt: Date.now(),
  });
}

export function setAgentLastOutput(role: AgentRole, output: string | null): void {
  const existing = registry().get(role) ?? {
    status: 'idle' as const,
    currentTask: null,
    lastOutput: null,
    updatedAt: Date.now(),
  };
  registry().set(role, {
    ...existing,
    lastOutput: output,
    updatedAt: Date.now(),
  });
}

export function getAllAgentStatuses(): Record<AgentRole, ServerAgentState> {
  const out = {} as Record<AgentRole, ServerAgentState>;
  for (const role of ALL_ROLES) {
    out[role] = getAgentStatus(role);
  }
  return out;
}

export function clearAllStatuses(): void {
  const now = Date.now();
  for (const role of ALL_ROLES) {
    registry().set(role, {
      status: 'idle',
      currentTask: null,
      lastOutput: null,
      updatedAt: now,
      tokensUsed: 0,
      taskStartedAt: null,
    });
  }
}

export function getAgentStatusesForClient(): Record<AgentRole, ServerAgentState> {
  return getAllAgentStatuses();
}
