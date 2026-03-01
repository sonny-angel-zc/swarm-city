import { create } from 'zustand';
import {
  Agent, AgentRole, AgentStatus, Task, SubTask, Vehicle, Notification,
  LogEntry, BUILDING_CONFIGS, Particle, OverlayMode,
  TokenEconomy, AgentBudget, Transaction, TransactionType, EconomyHistoryPoint,
} from './types';
import {
  ModelCandidate,
  ProviderHealth,
  DEFAULT_MODEL_CHAIN,
  createInitialProviderHealth,
  pickFallbackModel,
  onProviderFailure,
  onProviderRateLimited,
  onProviderRequestStart,
  onProviderSuccess,
  recoverProviderHealth,
} from './fallbackPolicy';
import { ProviderId, RateLimitManager, DEFAULT_RATE_LIMITS } from './rateLimiter';

// ─── Types ────────────────────────────────────────────────────────────────────

type SSEEvent =
  | { type: 'task_created'; task: Task }
  | { type: 'decomposition_start'; taskId: string }
  | { type: 'decomposition_complete'; taskId: string; subtasks: SubTask[] }
  | { type: 'agent_assigned'; taskId: string; subtask: SubTask; role: AgentRole }
  | { type: 'agent_output'; taskId: string; role: AgentRole; output: string }
  | { type: 'agent_tool_use'; taskId: string; role: AgentRole; tool: string }
  | { type: 'agent_done'; taskId: string; role: AgentRole; output: string }
  | { type: 'agent_error'; taskId: string; role: AgentRole; error: string }
  | { type: 'task_complete'; taskId: string };

type SwarmStore = {
  // Agents
  agents: Record<AgentRole, Agent>;
  // Tasks
  tasks: Task[];
  currentTask: Task | null;
  currentTaskId: string | null;
  // Vehicles (messages between agents)
  vehicles: Vehicle[];
  // Particles
  particles: Particle[];
  // Notifications
  notifications: Notification[];
  // UI
  selectedAgent: AgentRole | null;
  activityLog: LogEntry[];
  // Camera
  cameraX: number;
  cameraY: number;
  zoom: number;
  // Overlay
  overlayMode: OverlayMode;
  // SSE
  eventSource: EventSource | null;
  // Economy
  economy: TokenEconomy;
  budgetPanelOpen: boolean;
  // Ops layer
  rateLimiter: RateLimitManager;
  modelCandidates: ModelCandidate[];
  providerHealth: Record<ProviderId, ProviderHealth>;
  activeModel: ModelCandidate | null;
  lastFallbackReason: string | null;

  // Actions
  selectAgent: (role: AgentRole | null) => void;
  setOverlayMode: (mode: OverlayMode) => void;
  submitTask: (title: string) => void;
  tick: (dt: number) => void;
  sendMessage: (agentRole: AgentRole, message: string) => void;
  setCameraPos: (x: number, y: number) => void;
  setZoom: (z: number) => void;
  dismissNotification: (id: string) => void;
  processSSEEvent: (event: SSEEvent) => void;
  spendTokens: (role: AgentRole, amount: number, type: TransactionType) => void;
  setAgentBudget: (role: AgentRole, budget: number) => void;
  setBudgetPanelOpen: (open: boolean) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createAgents(): Record<AgentRole, Agent> {
  const agents: Partial<Record<AgentRole, Agent>> = {};
  for (const cfg of BUILDING_CONFIGS) {
    agents[cfg.role] = {
      id: cfg.role,
      role: cfg.role,
      status: 'idle',
      currentTask: null,
      progress: 0,
      log: [],
      building: cfg,
      contextUsed: 0,
      contextMax: 128000,
      contextWarning: false,
    };
  }
  return agents as Record<AgentRole, Agent>;
}

let vehicleIdCounter = 0;
let notifIdCounter = 0;
let transactionIdCounter = 0;
let lastHistoryTime = 0;

function createInitialEconomy(): TokenEconomy {
  const agentBudgets: Partial<Record<AgentRole, AgentBudget>> = {};
  for (const cfg of BUILDING_CONFIGS) {
    agentBudgets[cfg.role] = {
      tokenBudget: 5000,
      tokensSpent: 0,
      costPerCall: cfg.role === 'engineer' ? 200 : cfg.role === 'researcher' ? 150 : 100,
    };
  }
  return {
    totalBudget: 50000,
    spent: 0,
    income: 0,
    expenses: 0,
    transactions: [],
    history: [],
    agentBudgets: agentBudgets as Record<AgentRole, AgentBudget>,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSwarmStore = create<SwarmStore>((set, get) => ({
  agents: createAgents(),
  tasks: [],
  currentTask: null,
  currentTaskId: null,
  vehicles: [],
  particles: [],
  notifications: [],
  selectedAgent: null,
  activityLog: [],
  cameraX: 0,
  cameraY: 0,
  zoom: 1,
  overlayMode: 'activity',
  eventSource: null,
  economy: createInitialEconomy(),
  budgetPanelOpen: false,
  rateLimiter: new RateLimitManager(DEFAULT_RATE_LIMITS),
  modelCandidates: DEFAULT_MODEL_CHAIN,
  providerHealth: createInitialProviderHealth(['anthropic', 'openai', 'google']),
  activeModel: null,
  lastFallbackReason: null,

  selectAgent: (role) => set({ selectedAgent: role }),
  setOverlayMode: (mode) => set({ overlayMode: mode }),
  setBudgetPanelOpen: (open) => set({ budgetPanelOpen: open }),

  setAgentBudget: (role, budget) => {
    const economy = { ...get().economy };
    economy.agentBudgets = {
      ...economy.agentBudgets,
      [role]: { ...economy.agentBudgets[role], tokenBudget: budget },
    };
    set({ economy });
  },

  spendTokens: (role, amount, type) => {
    const state = get();
    const economy = { ...state.economy };
    const tx: Transaction = {
      id: `tx-${transactionIdCounter++}`,
      agentRole: role,
      amount,
      type,
      timestamp: Date.now(),
    };
    economy.spent += amount;
    economy.expenses += amount;
    economy.transactions = [...economy.transactions.slice(-200), tx];
    economy.agentBudgets = {
      ...economy.agentBudgets,
      [role]: {
        ...economy.agentBudgets[role],
        tokensSpent: economy.agentBudgets[role].tokensSpent + amount,
      },
    };

    // Spawn coin particles from the agent's building
    const agent = state.agents[role];
    const b = agent.building;
    const cx = (b.gridX - b.gridY) * 32;
    const cy = (b.gridX + b.gridY) * 19;
    const coinParticles: Particle[] = [];
    const count = amount > 300 ? 4 : amount > 100 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      coinParticles.push({
        x: cx + (Math.random() - 0.5) * 16,
        y: cy - b.height + Math.random() * 10,
        vx: (Math.random() - 0.5) * 12,
        vy: -20 - Math.random() * 15,
        life: 1.5,
        maxLife: 1.5,
        color: amount > 300 ? '#FFD700' : amount > 100 ? '#FFC107' : '#CD7F32',
        size: amount > 300 ? 5 : amount > 100 ? 3.5 : 2.5,
        type: 'coin',
      });
    }

    set({
      economy,
      particles: [...state.particles, ...coinParticles],
    });
  },

  submitTask: async (title: string) => {
    // Close any existing SSE connection
    const prev = get().eventSource;
    if (prev) prev.close();

    // Reset agents and economy
    set({ agents: createAgents(), economy: createInitialEconomy() });
    lastHistoryTime = 0;

    try {
      const state = get();
      const limiter = state.rateLimiter;
      const tried = new Set<string>();
      let providerHealth = recoverProviderHealth(state.providerHealth);
      let taskId: string | null = null;
      let lastError = '';
      let selectedModel: ModelCandidate | null = null;

      while (tried.size < state.modelCandidates.length) {
        const remainingCandidates = state.modelCandidates.filter((candidate) => {
          const key = `${candidate.provider}:${candidate.model}`;
          return !tried.has(key);
        });

        const decision = pickFallbackModel({
          candidates: remainingCandidates,
          providerHealth,
          limiter,
        });

        if (!decision.selected) {
          lastError = decision.reason;
          set({
            providerHealth,
            activeModel: null,
            lastFallbackReason: decision.reason,
            activityLog: [
              ...get().activityLog,
              { timestamp: Date.now(), message: decision.reason, type: 'error' } as LogEntry,
            ].slice(-100),
          });
          break;
        }

        selectedModel = decision.selected;
        tried.add(`${selectedModel.provider}:${selectedModel.model}`);
        providerHealth = onProviderRequestStart(providerHealth, selectedModel.provider);
        limiter.recordRequest(selectedModel.provider, selectedModel.model);

        set({
          providerHealth,
          activeModel: selectedModel,
          lastFallbackReason: decision.reason,
        });

        try {
          const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              provider: selectedModel.provider,
              model: selectedModel.model,
            }),
          });

          if (res.status === 429) {
            const retryAfterRaw = res.headers.get('Retry-After');
            const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : 0;
            const retryAfterMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
              ? retryAfterSec * 1000
              : 10_000;

            limiter.recordRateLimited(selectedModel.provider, selectedModel.model, retryAfterMs);
            providerHealth = onProviderRateLimited(providerHealth, selectedModel.provider, retryAfterMs);

            const rateLimitMsg =
              `${selectedModel.label} was rate limited; switching to fallback model.`;
            set({
              providerHealth,
              lastFallbackReason: rateLimitMsg,
              activityLog: [
                ...get().activityLog,
                { timestamp: Date.now(), message: rateLimitMsg, type: 'error' } as LogEntry,
              ].slice(-100),
            });
            continue;
          }

          if (!res.ok) {
            const errMsg = `${selectedModel.label} failed with ${res.status}; trying fallback.`;
            providerHealth = onProviderFailure(providerHealth, selectedModel.provider, errMsg);
            set({
              providerHealth,
              lastFallbackReason: errMsg,
              activityLog: [
                ...get().activityLog,
                { timestamp: Date.now(), message: errMsg, type: 'error' } as LogEntry,
              ].slice(-100),
            });
            continue;
          }

          const data = await res.json() as { taskId?: string };
          if (!data.taskId) {
            const errMsg = `${selectedModel.label} returned no task id; trying fallback.`;
            providerHealth = onProviderFailure(providerHealth, selectedModel.provider, errMsg);
            set({
              providerHealth,
              lastFallbackReason: errMsg,
              activityLog: [
                ...get().activityLog,
                { timestamp: Date.now(), message: errMsg, type: 'error' } as LogEntry,
              ].slice(-100),
            });
            continue;
          }

          providerHealth = onProviderSuccess(providerHealth, selectedModel.provider);
          set({ providerHealth });
          taskId = data.taskId;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          lastError = msg;
          providerHealth = onProviderFailure(
            providerHealth,
            selectedModel.provider,
            `${selectedModel.label} error: ${msg}`,
          );
          set({
            providerHealth,
            lastFallbackReason: `${selectedModel.label} error; trying fallback.`,
            activityLog: [
              ...get().activityLog,
              {
                timestamp: Date.now(),
                message: `${selectedModel.label} request failed: ${msg}`,
                type: 'error',
              } as LogEntry,
            ].slice(-100),
          });
        }
      }

      if (!taskId) {
        throw new Error(lastError || 'No provider available for task submission.');
      }

      // Open SSE connection
      const es = new EventSource(`/api/tasks/${taskId}/events`);

      es.onmessage = (e) => {
        try {
          const event: SSEEvent = JSON.parse(e.data);
          get().processSSEEvent(event);
        } catch {}
      };

      es.onerror = () => {
        // Connection lost — could be task complete
        console.warn('[SSE] connection error or closed');
      };

      set({
        currentTaskId: taskId,
        eventSource: es,
        activityLog: [
          ...get().activityLog,
          { timestamp: Date.now(), message: `Task submitted: "${title}"`, type: 'info' },
        ],
      });
    } catch (err) {
      console.error('[submitTask] Failed:', err);
      set({
        activityLog: [
          ...get().activityLog,
          { timestamp: Date.now(), message: `Failed to submit task: ${err}`, type: 'error' } as LogEntry,
        ].slice(-100),
      });
    }
  },

  processSSEEvent: (event: SSEEvent) => {
    const state = get();
    const agents = { ...state.agents };
    const log = [...state.activityLog];
    const notifications = [...state.notifications];
    const vehicles = [...state.vehicles];

    switch (event.type) {
      case 'task_created': {
        const task = event.task;
        // PM starts working
        agents.pm = {
          ...agents.pm,
          status: 'working',
          currentTask: `Decomposing: ${task.title}`,
          progress: 0,
          log: [
            ...agents.pm.log,
            { timestamp: Date.now(), message: `Received task: "${task.title}"`, type: 'info' },
            { timestamp: Date.now(), message: 'Decomposing into subtasks...', type: 'info' },
          ],
        };
        log.push({ timestamp: Date.now(), message: `PM is decomposing: "${task.title}"`, type: 'info' });
        set({ currentTask: task, agents, activityLog: log.slice(-100) });
        break;
      }

      case 'decomposition_complete': {
        const currentTask = state.currentTask;
        if (!currentTask) break;
        const updatedTask = { ...currentTask, subtasks: event.subtasks, status: 'in_progress' as const };
        agents.pm = {
          ...agents.pm,
          status: 'working',
          currentTask: `Coordinating: ${currentTask.title}`,
          progress: 0.1,
          log: [
            ...agents.pm.log,
            { timestamp: Date.now(), message: `Decomposed into ${event.subtasks.length} subtasks`, type: 'output' },
          ],
        };
        log.push({ timestamp: Date.now(), message: `PM decomposed task into ${event.subtasks.length} subtasks`, type: 'info' });
        notifications.push({
          id: `notif-${notifIdCounter++}`,
          agentRole: 'pm',
          message: `Decomposition complete — ${event.subtasks.length} subtasks`,
          type: 'info',
          timestamp: Date.now(),
          read: false,
        });
        set({ currentTask: updatedTask, agents, activityLog: log.slice(-100), notifications });
        break;
      }

      case 'agent_assigned': {
        const role = event.role;
        const subtask = event.subtask;
        agents[role] = {
          ...agents[role],
          status: 'working',
          currentTask: subtask.title,
          progress: 0,
          log: [
            ...agents[role].log,
            { timestamp: Date.now(), message: `Assigned: ${subtask.title}`, type: 'info' },
          ],
        };

        // Spawn vehicle from PM to this agent
        vehicles.push({
          id: `v-${vehicleIdCounter++}`,
          fromAgent: 'pm',
          toAgent: role,
          progress: 0,
          speed: 0.4 + Math.random() * 0.3,
          color: agents[role].building.color,
          message: `Task: ${subtask.title}`,
        });

        log.push({ timestamp: Date.now(), message: `PM assigned "${subtask.title}" to ${agents[role].building.name}`, type: 'info' });

        // Update subtask status in current task
        const task1 = state.currentTask;
        if (task1) {
          const updatedSubtasks = task1.subtasks.map(st =>
            st.id === subtask.id ? { ...st, status: 'in_progress' as const } : st
          );
          set({
            currentTask: { ...task1, subtasks: updatedSubtasks },
            agents,
            vehicles,
            activityLog: log.slice(-100),
          });
        } else {
          set({ agents, vehicles, activityLog: log.slice(-100) });
        }
        break;
      }

      case 'agent_output': {
        const role = event.role;
        // Append to agent log (truncate to last line for readability)
        const lines = event.output.split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1] || event.output.slice(0, 100);
        agents[role] = {
          ...agents[role],
          log: [
            ...agents[role].log,
            { timestamp: Date.now(), message: lastLine.slice(0, 200), type: 'output' },
          ].slice(-20) as LogEntry[], // Keep log manageable
          // Increment progress slightly on each output chunk
          progress: Math.min(0.95, agents[role].progress + 0.05),
        };

        // Simulate token cost: 50-200
        const outputCost = 50 + Math.floor(Math.random() * 150);
        get().spendTokens(role, outputCost, 'api_call');

        // Update subtask progress
        const task2 = state.currentTask;
        if (task2) {
          const updatedSubtasks = task2.subtasks.map(st =>
            st.assignedTo === role && st.status === 'in_progress'
              ? { ...st, progress: Math.min(0.95, st.progress + 0.05) }
              : st
          );
          set({ currentTask: { ...task2, subtasks: updatedSubtasks }, agents });
        } else {
          set({ agents });
        }
        break;
      }

      case 'agent_tool_use': {
        const role = event.role;
        agents[role] = {
          ...agents[role],
          log: [
            ...agents[role].log,
            { timestamp: Date.now(), message: `🔧 Using tool: ${event.tool}`, type: 'info' },
          ].slice(-20) as LogEntry[],
          progress: Math.min(0.9, agents[role].progress + 0.08),
        };

        // Simulate token cost: 100-500
        const toolCost = 100 + Math.floor(Math.random() * 400);
        get().spendTokens(role, toolCost, 'tool_use');

        // Random inter-agent vehicle on tool use
        if (Math.random() < 0.3) {
          const otherRoles = Object.keys(agents).filter(r => r !== role && agents[r as AgentRole].status === 'working') as AgentRole[];
          if (otherRoles.length > 0) {
            const target = otherRoles[Math.floor(Math.random() * otherRoles.length)] || 'pm';
            vehicles.push({
              id: `v-${vehicleIdCounter++}`,
              fromAgent: role,
              toAgent: target,
              progress: 0,
              speed: 0.3 + Math.random() * 0.4,
              color: agents[role].building.accent,
              message: `Syncing: ${event.tool}`,
            });
          }
        }

        set({ agents, vehicles });
        break;
      }

      case 'agent_done': {
        const role = event.role;
        agents[role] = {
          ...agents[role],
          status: 'done',
          progress: 1,
          log: [
            ...agents[role].log,
            { timestamp: Date.now(), message: `✅ Completed task`, type: 'output' },
          ].slice(-20) as LogEntry[],
        };

        // Income bonus for completing
        const economy = { ...get().economy };
        economy.income += 100;
        const completionTx: Transaction = {
          id: `tx-${transactionIdCounter++}`,
          agentRole: role,
          amount: -100,
          type: 'completion',
          timestamp: Date.now(),
        };
        economy.transactions = [...economy.transactions.slice(-200), completionTx];
        set({ economy });

        // Vehicle back to PM
        vehicles.push({
          id: `v-${vehicleIdCounter++}`,
          fromAgent: role,
          toAgent: 'pm',
          progress: 0,
          speed: 0.5,
          color: '#4CAF50',
          message: `Done`,
        });

        log.push({ timestamp: Date.now(), message: `${agents[role].building.name} completed their task`, type: 'info' });

        // Update subtask
        const task3 = state.currentTask;
        if (task3) {
          const updatedSubtasks = task3.subtasks.map(st =>
            st.assignedTo === role && st.status === 'in_progress'
              ? { ...st, status: 'done' as const, progress: 1 }
              : st
          );
          // Update PM progress
          const doneCount = updatedSubtasks.filter(s => s.status === 'done').length;
          agents.pm = {
            ...agents.pm,
            progress: doneCount / updatedSubtasks.length,
          };
          set({
            currentTask: { ...task3, subtasks: updatedSubtasks },
            agents,
            vehicles,
            activityLog: log.slice(-100),
          });
        } else {
          set({ agents, vehicles, activityLog: log.slice(-100) });
        }
        break;
      }

      case 'agent_error': {
        const role = event.role;
        agents[role] = {
          ...agents[role],
          status: 'blocked',
          log: [
            ...agents[role].log,
            { timestamp: Date.now(), message: `❌ Error: ${event.error}`, type: 'error' },
          ].slice(-20) as LogEntry[],
        };
        notifications.push({
          id: `notif-${notifIdCounter++}`,
          agentRole: role,
          message: `${agents[role].building.name} encountered an error!`,
          type: 'warning',
          timestamp: Date.now(),
          read: false,
        });
        log.push({ timestamp: Date.now(), message: `${agents[role].building.name} errored: ${event.error}`, type: 'error' });
        set({ agents, notifications, activityLog: log.slice(-100) });
        break;
      }

      case 'task_complete': {
        const task4 = state.currentTask;
        if (task4) {
          set({ currentTask: { ...task4, status: 'done' } });
        }
        agents.pm = {
          ...agents.pm,
          status: 'done',
          progress: 1,
          log: [
            ...agents.pm.log,
            { timestamp: Date.now(), message: `🎉 All agents completed! Task done.`, type: 'output' },
          ],
        };
        notifications.push({
          id: `notif-${notifIdCounter++}`,
          agentRole: 'pm',
          message: `Task complete! 🎉`,
          type: 'info',
          timestamp: Date.now(),
          read: false,
        });
        log.push({ timestamp: Date.now(), message: `Task complete! All agents finished.`, type: 'info' });

        // Close SSE
        const es = state.eventSource;
        if (es) es.close();

        set({ agents, notifications, activityLog: log.slice(-100), eventSource: null });
        break;
      }
    }
  },

  sendMessage: async (agentRole: AgentRole, message: string) => {
    const state = get();
    const agents = { ...state.agents };
    const agent = { ...agents[agentRole] };
    agent.log = [
      ...agent.log,
      { timestamp: Date.now(), message: `Human: ${message}`, type: 'info' },
    ];
    agents[agentRole] = agent;
    set({ agents });

    // Send to backend
    const taskId = state.currentTaskId;
    if (taskId) {
      try {
        await fetch(`/api/agents/${agentRole}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, message }),
        });
      } catch (err) {
        console.error('[sendMessage] Failed:', err);
      }
    }
  },

  setCameraPos: (x, y) => set({ cameraX: x, cameraY: y }),
  setZoom: (z) => set({ zoom: Math.max(0.3, Math.min(2.5, z)) }),
  dismissNotification: (id) =>
    set({ notifications: get().notifications.map(n => n.id === id ? { ...n, read: true } : n) }),

  // tick() — ANIMATION ONLY. No fake progress.
  tick: (dt: number) => {
    const state = get();

    // Update vehicles
    const activeVehicles = state.vehicles
      .map(v => ({ ...v, progress: v.progress + dt * v.speed }))
      .filter(v => v.progress < 1);

    // Spawn particles for working agents
    const newParticles: Particle[] = [];
    // Context simulation: fill while working, reset on idle/done
    const agents = { ...state.agents };
    let agentsChanged = false;
    for (const role of Object.keys(agents) as AgentRole[]) {
      const a = agents[role];
      if (a.status === 'working') {
        // Context slowly fills while working (reaches 1.0 in ~60s)
        const newContext = Math.min(1, a.contextUsed + dt * 0.016);
        const newWarning = newContext > 0.9;
        if (newContext !== a.contextUsed || newWarning !== a.contextWarning) {
          agents[role] = { ...a, contextUsed: newContext, contextWarning: newWarning };
          agentsChanged = true;
        }
      } else if ((a.status === 'idle' || a.status === 'done') && a.contextUsed > 0) {
        // Context resets when idle or done
        agents[role] = { ...a, contextUsed: 0, contextWarning: false };
        agentsChanged = true;
      }

      if (a.status === 'working' && Math.random() < dt * 3) {
        const b = a.building;
        const cx = (b.gridX - b.gridY) * 32;
        const cy = (b.gridX + b.gridY) * 19;
        newParticles.push({
          x: cx + (Math.random() - 0.5) * 20,
          y: cy - b.height + Math.random() * 10,
          vx: (Math.random() - 0.5) * 20,
          vy: -15 - Math.random() * 25,
          life: 1,
          maxLife: 1,
          color: b.accent,
          size: 2 + Math.random() * 3,
        });
      }
    }

    const updatedParticles = [...state.particles, ...newParticles]
      .map(p => ({
        ...p,
        x: p.x + p.vx * dt,
        y: p.y + p.vy * dt,
        life: p.life - dt,
        size: p.type === 'coin' ? p.size : p.size * (1 - dt * 0.5),
      }))
      .filter(p => p.life > 0);

    // Economy history tracking — push a point every 3 seconds during active tasks
    const now = Date.now();
    const hasWorkingAgent = Object.values(state.agents).some(a => a.status === 'working');
    let economy = state.economy;
    if (hasWorkingAgent && now - lastHistoryTime > 3000) {
      lastHistoryTime = now;
      const agentSpend: Record<string, number> = {};
      for (const role of Object.keys(state.agents) as AgentRole[]) {
        agentSpend[role] = economy.agentBudgets[role].tokensSpent;
      }
      economy = {
        ...economy,
        history: [
          ...economy.history.slice(-100),
          { timestamp: now, totalSpent: economy.spent, agentSpend: agentSpend as Record<AgentRole, number> },
        ],
      };
    }

    const providerHealth = recoverProviderHealth(state.providerHealth, now);
    const providerHealthChanged = providerHealth !== state.providerHealth;

    set({
      vehicles: activeVehicles,
      particles: updatedParticles,
      economy,
      ...(providerHealthChanged ? { providerHealth } : {}),
      ...(agentsChanged ? { agents } : {}),
    });
  },
}));
