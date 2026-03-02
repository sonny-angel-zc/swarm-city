import { create } from 'zustand';
import {
  Agent, AgentRole, AgentStatus, Task, SubTask, Vehicle, Notification,
  LogEntry, BUILDING_CONFIGS, Particle, OverlayMode,
  TokenEconomy, AgentBudget, Transaction, TransactionType, EconomyHistoryPoint,
  TelemetryState, BacklogItem, LinearSyncState, DecompositionStatus, ModelProvider,
  AutonomousStatus,
} from './types';
import {
  ModelPreset,
  ModelCandidate,
  MODEL_PRESET_CHAINS,
  ProviderHealth,
  createInitialProviderHealth,
  pickFallbackModel,
  onProviderFailure,
  onProviderRateLimited,
  onProviderRequestStart,
  onProviderSuccess,
  recoverProviderHealth,
} from './fallbackPolicy';
import { ProviderId, RateLimitManager, DEFAULT_RATE_LIMITS } from './rateLimiter';
import {
  buildTelemetryEvent,
  createInitialTelemetryState,
  pickModelForRole,
  updateTelemetryState,
} from './telemetry';
import { syncFromLinear, createLinearIssue as createLinearIssueApi, updateLinearIssueStatus as updateLinearIssueStatusApi } from './linearSync';
import {
  DocCategory,
  DocumentMemoryItem,
  PlanDocument,
  extractMemoryCandidates,
  getDocumentById,
  getPlanRegistry,
} from './planRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

type SSEEvent =
  | { type: 'task_created'; task: Task }
  | { type: 'decomposition_start'; taskId: string }
  | { type: 'decomposition_stalled'; taskId: string; elapsedMs: number; thresholdMs: number; reason?: string; suggestedAction?: string }
  | { type: 'decomposition_complete'; taskId: string; subtasks: SubTask[] }
  | { type: 'agent_workspace'; taskId: string; role: AgentRole; worktreePath: string; branch: string; created: boolean }
  | { type: 'agent_pr_draft'; taskId: string; role: AgentRole; branch: string; title: string; draftPath: string; openCommand: string }
  | { type: 'agent_assigned'; taskId: string; subtask: SubTask; role: AgentRole }
  | { type: 'agent_output'; taskId: string; role: AgentRole; output: string }
  | { type: 'agent_tool_use'; taskId: string; role: AgentRole; tool: string }
  | { type: 'agent_done'; taskId: string; role: AgentRole; output: string }
  | { type: 'agent_usage'; taskId: string; role: AgentRole; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreateTokens: number; costUsd: number; model: string } }
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
  decompositionStatus: DecompositionStatus;
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
  modelPreset: ModelPreset;
  modelCandidates: ModelCandidate[];
  providerHealth: Record<ProviderId, ProviderHealth>;
  activeModel: ModelCandidate | null;
  lastFallbackReason: string | null;
  telemetry: TelemetryState;
  backlog: BacklogItem[];
  linear: LinearSyncState;
  autonomous: AutonomousStatus & { lastEventId: number };
// Docs
  docsRegistry: PlanDocument[];
  docsFilter: 'all' | DocCategory;
  docsQuery: string;
  selectedDocId: string | null;
  documentMemory: DocumentMemoryItem[];

  // Actions
  spawnParticles: (particles: Particle[]) => void;
  selectAgent: (role: AgentRole | null) => void;
  setOverlayMode: (mode: OverlayMode) => void;
  setModelPreset: (preset: ModelPreset) => void;
  submitTask: (title: string) => Promise<void>;
  deploySwarm: (backlogItemId: string) => Promise<void>;
  resumeTask: (taskId: string) => Promise<void>;
  tick: (dt: number) => void;
  sendMessage: (agentRole: AgentRole, message: string) => void;
  setCameraPos: (x: number, y: number) => void;
  panCamera: (dx: number, dy: number) => void;
  setZoom: (z: number) => void;
  dismissNotification: (id: string) => void;
  processSSEEvent: (event: SSEEvent) => void;
  spendTokens: (role: AgentRole, amount: number, type: TransactionType, metadata?: TokenSpendMetadata) => void;
  setAgentBudget: (role: AgentRole, budget: number) => void;
  setBudgetPanelOpen: (open: boolean) => void;
  fetchLimits: () => Promise<void>;
  syncBacklog: () => Promise<void>;
  syncLinear: () => Promise<void>;
  createLinearIssue: (title: string, description?: string, priority?: number) => Promise<void>;
  updateLinearIssueStatus: (issueId: string, newStatusType: string) => Promise<void>;
  setBacklogItemStatus: (id: string, status: BacklogItem['status']) => void;
  fetchAutonomousStatus: () => Promise<void>;
  fetchAgentStatuses: () => Promise<void>;
  setAutonomousEnabled: (enabled: boolean) => Promise<void>;
setDocsFilter: (filter: 'all' | DocCategory) => void;
  setDocsQuery: (query: string) => void;
  selectDocument: (docId: string | null) => void;
  indexDocuments: () => void;
  pinMemory: (item: DocumentMemoryItem) => void;
  unpinMemory: (id: string) => void;
  captureDocumentMemory: (docId: string) => void;
  clearDocumentMemory: () => void;
};

type ServerAgentStatus = 'idle' | 'working' | 'reviewing' | 'blocked';

type ServerAgentState = {
  status: ServerAgentStatus;
  currentTask: string | null;
  lastOutput: string | null;
  updatedAt: number;
};

type TokenSpendMetadata = {
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  provider?: ModelProvider;
  costUsd?: number;
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
let telemetryIdCounter = 0;
let lastHistoryTime = 0;
let memoryIdCounter = 0;
const DEFAULT_DECOMPOSITION_STALL_THRESHOLD_MS = 30_000;
const DEFAULT_BUDGET_ALERT_THRESHOLDS = [0.5, 0.75, 0.9, 1];

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
    budgetAlertThresholds: [...DEFAULT_BUDGET_ALERT_THRESHOLDS],
    triggeredBudgetAlerts: [],
    transactions: [],
    history: [],
    agentBudgets: agentBudgets as Record<AgentRole, AgentBudget>,
  };
}

function createInitialDecompositionStatus(): DecompositionStatus {
  return {
    startedAt: null,
    elapsedMs: 0,
    stallThresholdMs: DEFAULT_DECOMPOSITION_STALL_THRESHOLD_MS,
    stalled: false,
    stallReason: null,
    suggestedAction: 'Retry deploy. If it repeats, switch model preset to force provider fallback.',
    warningLogged: false,
  };
}

function resolveModelProvider(model: string | undefined): ModelProvider | null {
  if (!model) return null;
  if (model.startsWith('openai/')) return 'openai';
  if (model.startsWith('anthropic/')) return 'anthropic';
  if (model.startsWith('google/')) return 'google';
  return null;
}

function mapServerStatus(status: ServerAgentStatus): AgentStatus {
  if (status === 'idle') return 'idle';
  if (status === 'blocked') return 'blocked';
  return 'working';
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
  decompositionStatus: createInitialDecompositionStatus(),
  cameraX: 0,
  cameraY: 0,
  zoom: 1,
  overlayMode: 'activity',
  eventSource: null,
  economy: createInitialEconomy(),
  budgetPanelOpen: false,
rateLimiter: new RateLimitManager(DEFAULT_RATE_LIMITS),
  modelPreset: 'codex-first',
  modelCandidates: MODEL_PRESET_CHAINS['codex-first'],
  providerHealth: createInitialProviderHealth(['anthropic', 'openai']),
  activeModel: null,
  lastFallbackReason: null,
  telemetry: createInitialTelemetryState(),
  backlog: [],
  linear: {
    connected: false,
    syncing: false,
    lastSyncAt: null,
    error: null,
  },
  autonomous: {
    enabled: false,
    running: false,
    paused: false,
    pauseReason: null,
    cooldownUntil: null,
    intervalMs: 60000,
    currentTask: null,
    completedTasks: [],
    events: [],
    seeded: false,
    lastTickAt: null,
    lastEventId: 0,
  },
docsRegistry: getPlanRegistry(),
  docsFilter: 'all',
  docsQuery: '',
  selectedDocId: getPlanRegistry()[0]?.id ?? null,
  documentMemory: [],

  spawnParticles: (particles) => set(state => ({ particles: [...state.particles, ...particles] })),
  selectAgent: (role) => set({ selectedAgent: role }),
  setOverlayMode: (mode) => set({ overlayMode: mode }),
  setModelPreset: (preset) => set({
    modelPreset: preset,
    modelCandidates: MODEL_PRESET_CHAINS[preset],
    activeModel: null,
    lastFallbackReason: `Model preset: ${preset === 'claude-first' ? 'Claude-first' : 'Codex-first'}.`,
  }),
  setBudgetPanelOpen: (open) => set({ budgetPanelOpen: open }),
  setDocsFilter: (filter) => set({ docsFilter: filter }),
  setDocsQuery: (query) => set({ docsQuery: query }),
  selectDocument: (docId) => set({ selectedDocId: docId }),

  indexDocuments: () => {
    const docs = getPlanRegistry();
    const current = get().selectedDocId;
    const selectedStillExists = current ? docs.some((doc) => doc.id === current) : false;
    set({
      docsRegistry: docs,
      selectedDocId: selectedStillExists ? current : (docs[0]?.id ?? null),
    });
  },

  pinMemory: (item) => {
    const state = get();
    const alreadyPinned = state.documentMemory.some((entry) => entry.docId === item.docId && entry.snippet === item.snippet);
    if (alreadyPinned) return;
    const next: DocumentMemoryItem = {
      ...item,
      id: `${item.docId}-pin-${memoryIdCounter++}`,
      createdAt: Date.now(),
    };
    set({ documentMemory: [next, ...state.documentMemory].slice(0, 40) });
  },

  unpinMemory: (id) => {
    set({ documentMemory: get().documentMemory.filter((item) => item.id !== id) });
  },

  captureDocumentMemory: (docId) => {
    const state = get();
    const doc = getDocumentById(state.docsRegistry, docId);
    if (!doc) return;
    const candidates = extractMemoryCandidates(doc, 4);
    const merged = [...state.documentMemory];
    for (const candidate of candidates) {
      const exists = merged.some((entry) => entry.docId === candidate.docId && entry.snippet === candidate.snippet);
      if (!exists) {
        merged.unshift({
          ...candidate,
          id: `${candidate.docId}-capture-${memoryIdCounter++}`,
          createdAt: Date.now(),
        });
      }
    }
    set({ documentMemory: merged.slice(0, 40) });
  },

  clearDocumentMemory: () => set({ documentMemory: [] }),

  setAgentBudget: (role, budget) => {
    const economy = { ...get().economy };
    economy.agentBudgets = {
      ...economy.agentBudgets,
      [role]: { ...economy.agentBudgets[role], tokenBudget: budget },
    };
    set({ economy });
  },

  spendTokens: (role, amount, type, metadata) => {
    const state = get();
    const economy = { ...state.economy };
    const now = Date.now();
    const tx: Transaction = {
      id: `tx-${transactionIdCounter++}`,
      agentRole: role,
      amount,
      type,
      timestamp: now,
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

    const modelInfo = pickModelForRole(role, telemetryIdCounter);
    const outputTokens = Math.max(1, Math.round(metadata?.outputTokens ?? amount));
    const inputTokens = Math.max(1, Math.round(
      metadata?.inputTokens ?? (outputTokens * (type === 'tool_use' ? 0.7 : 0.45)),
    ));
    const resolvedProvider = metadata?.provider ?? resolveModelProvider(metadata?.model) ?? modelInfo.provider;
    const resolvedModel = metadata?.model ?? modelInfo.model;
    const telemetryEvent = buildTelemetryEvent({
      id: `te-${telemetryIdCounter++}`,
      role,
      provider: resolvedProvider,
      model: resolvedModel,
      kind: modelInfo.kind,
      timestamp: now,
      inputTokens,
      outputTokens,
      transactionType: type,
      estimatedCostUsd: metadata?.costUsd,
    });
    const telemetry = updateTelemetryState(state.telemetry, telemetryEvent);

    const spentPct = economy.totalBudget > 0 ? economy.spent / economy.totalBudget : 0;
    const crossedThresholds = economy.budgetAlertThresholds
      .filter(threshold => spentPct >= threshold && !economy.triggeredBudgetAlerts.includes(threshold))
      .sort((a, b) => a - b);
    if (crossedThresholds.length > 0) {
      economy.triggeredBudgetAlerts = [...economy.triggeredBudgetAlerts, ...crossedThresholds].sort((a, b) => a - b);
    }

    const budgetAlerts: Notification[] = crossedThresholds.map((threshold) => {
      const pct = Math.round(threshold * 100);
      const spent = economy.spent.toLocaleString();
      const total = economy.totalBudget.toLocaleString();
      const summary = threshold >= 1
        ? `Budget exhausted: ${spent}/${total} tokens used.`
        : `Budget alert: ${pct}% threshold reached (${spent}/${total} tokens).`;
      return {
        id: `notif-${notifIdCounter++}`,
        agentRole: 'pm',
        message: summary,
        type: 'warning',
        timestamp: now,
        read: false,
      };
    });

    const budgetLogEntries: LogEntry[] = crossedThresholds.map((threshold) => {
      const pct = Math.round(Math.min(100, threshold * 100));
      const msg = threshold >= 1
        ? 'Budget exhausted: token spend reached 100% of runtime limit.'
        : `Budget warning: token spend crossed ${pct}% of runtime limit.`;
      return {
        timestamp: now,
        message: msg,
        type: threshold >= 1 ? 'error' : 'info',
      };
    });

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
      telemetry,
      particles: [...state.particles, ...coinParticles],
      notifications: [...state.notifications, ...budgetAlerts],
      activityLog: [...state.activityLog, ...budgetLogEntries].slice(-100),
    });
  },

  submitTask: async (title: string) => {
    // Linear-first: create an urgent (P1) Linear issue and show it in the backlog.
    // Orchestration is triggered separately via deploySwarm().
    try {
      await get().createLinearIssue(title, undefined, 1);
      set(state => ({
        activityLog: [
          ...state.activityLog,
          { timestamp: Date.now(), message: `Task filed: "${title}" (P1 urgent)`, type: 'info' } as LogEntry,
        ].slice(-100),
      }));
    } catch (err) {
      console.error('[submitTask] Failed to create Linear issue:', err);
      set(state => ({
        activityLog: [
          ...state.activityLog,
          { timestamp: Date.now(), message: `Failed to create task: ${err}`, type: 'error' } as LogEntry,
        ].slice(-100),
      }));
      throw err instanceof Error ? err : new Error(String(err));
    }
  },

  deploySwarm: async (backlogItemId: string) => {
    const state = get();
    const backlogItem = state.backlog.find(item => item.id === backlogItemId);
    if (!backlogItem) {
      throw new Error(`Backlog item ${backlogItemId} not found.`);
    }

    // Close any existing SSE connection
    const prev = state.eventSource;
    if (prev) prev.close();

    // Reset run-specific agent/economy state, but preserve the fetched budget limit
    const currentBudget = get().economy.totalBudget;
    const freshEconomy = createInitialEconomy();
    freshEconomy.totalBudget = currentBudget;
    // Also preserve per-agent budgets proportionally
    const perAgent = Math.floor(currentBudget / 7);
    for (const role of Object.keys(freshEconomy.agentBudgets) as AgentRole[]) {
      freshEconomy.agentBudgets[role].tokenBudget = perAgent;
    }
    set({
      agents: createAgents(),
      economy: freshEconomy,
      telemetry: createInitialTelemetryState(),
      decompositionStatus: createInitialDecompositionStatus(),
    });
    lastHistoryTime = 0;

    // Mark this item as the swarm target, clear any previous target
    set(s => ({
      backlog: s.backlog.map(item =>
        item.id === backlogItemId
          ? { ...item, isSwarmTarget: true, updatedAt: Date.now() }
          : { ...item, isSwarmTarget: false }
      ),
    }));

    // Update Linear issue status to "started"
    if (backlogItem.linearId) {
      get().updateLinearIssueStatus(backlogItem.linearId, 'started');
    }

    try {
      const currentState = get();
      const limiter = currentState.rateLimiter;
      const tried = new Set<string>();
      let providerHealth = recoverProviderHealth(currentState.providerHealth);
      let taskId: string | null = null;
      let lastError = '';
      let selectedModel: ModelCandidate | null = null;

      while (tried.size < currentState.modelCandidates.length) {
        const remainingCandidates = currentState.modelCandidates.filter((candidate) => {
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
              title: backlogItem.title,
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

            const rateLimitMsg = `${selectedModel.label} was rate limited; switching to fallback model.`;
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
        // Clear swarm target on failure
        set(s => ({
          backlog: s.backlog.map(item =>
            item.id === backlogItemId ? { ...item, isSwarmTarget: false } : item
          ),
        }));
        throw new Error(lastError || 'No provider available for task submission.');
      }

      // Link swarmTaskId to the backlog item
      set(s => ({
        backlog: s.backlog.map(item =>
          item.id === backlogItemId
            ? { ...item, swarmTaskId: taskId as string }
            : item
        ),
      }));

      // Open SSE connection
      const es = new EventSource(`/api/tasks/${taskId}/events`);

      es.onmessage = (e) => {
        try {
          const event: SSEEvent = JSON.parse(e.data);
          get().processSSEEvent(event);
        } catch {}
      };

      es.onerror = () => {
        console.warn('[SSE] connection error or closed');
      };

      try { localStorage.setItem('swarm:lastTaskId', taskId); } catch {}

      set({
        currentTaskId: taskId,
        eventSource: es,
        activityLog: [
          ...get().activityLog,
          { timestamp: Date.now(), message: `Swarm deployed: "${backlogItem.title}"`, type: 'info' } as LogEntry,
        ].slice(-100),
      });
    } catch (err) {
      console.error('[deploySwarm] Failed:', err);
      set(state => ({
        activityLog: [
          ...state.activityLog,
          { timestamp: Date.now(), message: `Failed to deploy swarm: ${err}`, type: 'error' } as LogEntry,
        ].slice(-100),
      }));
      throw err instanceof Error ? err : new Error(String(err));
    }
  },

  resumeTask: async (taskId: string) => {
    if (!taskId) return;

    // Pre-check: verify task still exists before opening SSE
    try {
      const check = await fetch(`/api/tasks/${taskId}/events`, { method: 'HEAD' }).catch(() => null);
      // If HEAD isn't supported, try a GET and abort immediately
      if (!check || check.status === 404) {
        console.warn('[SSE] task no longer exists, clearing stale ID:', taskId);
        try { localStorage.removeItem('swarm:lastTaskId'); } catch {}
        return;
      }
    } catch {
      // Network error — proceed anyway, SSE will handle it
    }

    const prev = get().eventSource;
    if (prev) prev.close();

    const es = new EventSource(`/api/tasks/${taskId}/events`);

    es.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data);
        get().processSSEEvent(event);
      } catch {}
    };

    es.onerror = () => {
      console.warn('[SSE] failed to resume task stream');
      try { localStorage.removeItem('swarm:lastTaskId'); } catch {}
      es.close(); // Stop auto-retry
    };

    try { localStorage.setItem('swarm:lastTaskId', taskId); } catch {}

    set({
      currentTaskId: taskId,
      eventSource: es,
      activityLog: [
        ...get().activityLog,
        { timestamp: Date.now(), message: `Resumed task stream: ${taskId}`, type: 'info' } as LogEntry,
      ].slice(-100),
    });
  },

  processSSEEvent: (event: SSEEvent) => {
    const state = get();
    const agents = { ...state.agents };
    const log = [...state.activityLog];
    const notifications = [...state.notifications];
    const vehicles = [...state.vehicles];
    const now = Date.now();

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
            { timestamp: now, message: `Received task: "${task.title}"`, type: 'info' },
            { timestamp: now, message: 'Decomposing into subtasks...', type: 'info' },
          ],
        };
        log.push({ timestamp: now, message: `PM is decomposing: "${task.title}"`, type: 'info' });
        set({
          currentTask: task,
          agents,
          activityLog: log.slice(-100),
          decompositionStatus: {
            ...createInitialDecompositionStatus(),
            startedAt: task.createdAt || now,
          },
        });
        break;
      }

      case 'decomposition_start': {
        const current = state.decompositionStatus;
        set({
          decompositionStatus: {
            ...current,
            startedAt: now,
            elapsedMs: 0,
            stalled: false,
            stallReason: null,
            warningLogged: false,
          },
        });
        break;
      }

      case 'decomposition_stalled': {
        const prior = state.decompositionStatus;
        const reason = event.reason ?? state.lastFallbackReason ?? null;
        const suggestedAction = event.suggestedAction ?? prior.suggestedAction;
        if (!prior.warningLogged) {
          const reasonSuffix = reason ? ` Reason: ${reason}` : '';
          log.push({
            timestamp: now,
            message: `Decomposition stall detected after ${Math.max(1, Math.round(event.elapsedMs / 1000))}s (threshold ${Math.round(event.thresholdMs / 1000)}s).${reasonSuffix}`,
            type: 'error',
          });
        }
        set({
          activityLog: log.slice(-100),
          decompositionStatus: {
            ...prior,
            startedAt: prior.startedAt ?? now - event.elapsedMs,
            elapsedMs: event.elapsedMs,
            stallThresholdMs: event.thresholdMs,
            stalled: true,
            stallReason: reason,
            suggestedAction,
            warningLogged: true,
          },
        });
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
            { timestamp: now, message: `Decomposed into ${event.subtasks.length} subtasks`, type: 'output' },
          ],
        };
        log.push({ timestamp: now, message: `PM decomposed task into ${event.subtasks.length} subtasks`, type: 'info' });
        notifications.push({
          id: `notif-${notifIdCounter++}`,
          agentRole: 'pm',
          message: `Decomposition complete — ${event.subtasks.length} subtasks`,
          type: 'info',
          timestamp: now,
          read: false,
        });
        set({
          currentTask: updatedTask,
          agents,
          activityLog: log.slice(-100),
          notifications,
          decompositionStatus: createInitialDecompositionStatus(),
        });
        break;
      }

      case 'agent_workspace': {
        const mode = event.created ? 'created' : 'reused';
        log.push({
          timestamp: Date.now(),
          message: `${event.role} ${mode} worktree ${event.branch} @ ${event.worktreePath}`,
          type: 'info',
        });
        set({ activityLog: log.slice(-100) });
        break;
      }

      case 'agent_pr_draft': {
        log.push({
          timestamp: Date.now(),
          message: `${event.role} PR draft ready: ${event.title} (${event.draftPath})`,
          type: 'info',
        });
        log.push({
          timestamp: Date.now(),
          message: `PR command: ${event.openCommand}`,
          type: 'info',
        });
        set({ activityLog: log.slice(-100) });
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

        // Real token usage comes via agent_usage event; no simulated cost here

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

        // Real token usage comes via agent_usage event; no simulated cost here

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

      case 'agent_usage': {
        const role = event.role;
        const u = event.usage;
        // Only count new input + output tokens against budget (cache reads are essentially free)
        const totalTokens = u.inputTokens + u.outputTokens + u.cacheCreateTokens;

        // Update economy with real token usage
        get().spendTokens(role, totalTokens, 'api_call', {
          inputTokens: u.inputTokens + u.cacheCreateTokens,
          outputTokens: u.outputTokens,
          model: u.model,
          costUsd: u.costUsd,
        });

        // Log real cost
        const agents2 = { ...state.agents };
        agents2[role] = {
          ...agents2[role],
          log: [
            ...agents2[role].log,
            { timestamp: Date.now(), message: `💰 ${u.model}: ${totalTokens.toLocaleString()} tokens ($${u.costUsd.toFixed(4)})`, type: 'info' },
          ].slice(-20) as LogEntry[],
        };

        log.push({ timestamp: Date.now(), message: `${agents2[role].building.name}: ${totalTokens.toLocaleString()} tokens ($${u.costUsd.toFixed(4)})`, type: 'info' });
        set({ agents: agents2, activityLog: log.slice(-100) });
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
        const backlogItem: BacklogItem = {
          id: `BL-${Date.now()}-${role}`,
          title: `Investigate ${agents[role].building.buildingName} error`,
          ownerRole: role,
          status: 'todo',
          priority: 'P1',
          source: 'local',
          updatedAt: Date.now(),
        };
        set({
          agents,
          notifications,
          activityLog: log.slice(-100),
          backlog: [backlogItem, ...state.backlog].slice(0, 40),
        });
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

        // Update the swarm-target backlog item: mark done, clear swarm flags
        const swarmItem = state.backlog.find(item => item.isSwarmTarget);
        if (swarmItem?.linearId) {
          get().updateLinearIssueStatus(swarmItem.linearId, 'completed');
        }
        const updatedBacklog = state.backlog.map(item =>
          item.isSwarmTarget
            ? { ...item, isSwarmTarget: false, swarmTaskId: undefined, status: 'done' as const, updatedAt: Date.now() }
            : item
        );

        // Close SSE
        const es = state.eventSource;
        if (es) es.close();
        try { localStorage.removeItem('swarm:lastTaskId'); } catch {}

        set({
          agents,
          notifications,
          activityLog: log.slice(-100),
          eventSource: null,
          currentTaskId: null,
          backlog: updatedBacklog,
          decompositionStatus: createInitialDecompositionStatus(),
        });
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
        const res = await fetch(`/api/agents/${agentRole}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, message }),
        });
        if (!res.ok) {
          throw new Error(`Message send failed (${res.status})`);
        }
      } catch (err) {
        console.error('[sendMessage] Failed:', err);
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
  },

  setCameraPos: (x, y) => set({ cameraX: x, cameraY: y }),
  panCamera: (dx, dy) => set((s) => ({ cameraX: s.cameraX + dx, cameraY: s.cameraY + dy })),
  setZoom: (z) => set({ zoom: Math.max(0.3, Math.min(2.5, z)) }),
  dismissNotification: (id) =>
    set({ notifications: get().notifications.map(n => n.id === id ? { ...n, read: true } : n) }),
  fetchLimits: async () => {
    try {
      const res = await fetch('/api/limits');
      if (!res.ok) throw new Error(`Limits request failed (${res.status})`);
      const data = await res.json();
      const tokensPerMin = data.tokensPerMin ?? 50000;
      // Set total budget to tokens-per-minute (the rate limit ceiling)
      set(state => {
        const economy = {
          ...state.economy,
          totalBudget: tokensPerMin,
          triggeredBudgetAlerts: [],
          budgetAlertThresholds: [...DEFAULT_BUDGET_ALERT_THRESHOLDS],
        };
        // Also set per-agent budgets proportionally
        const perAgent = Math.floor(tokensPerMin / 7);
        const agentBudgets = { ...economy.agentBudgets };
        for (const role of Object.keys(agentBudgets) as AgentRole[]) {
          agentBudgets[role] = { ...agentBudgets[role], tokenBudget: perAgent };
        }
        economy.agentBudgets = agentBudgets;
        return {
          economy,
          activityLog: [
            ...state.activityLog,
            { timestamp: Date.now(), message: `${data.provider} ${data.plan}: ${tokensPerMin.toLocaleString()} tokens/min budget`, type: 'info' } as LogEntry,
          ].slice(-100),
        };
      });
    } catch (err) {
      console.error('[fetchLimits]', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  },
  syncBacklog: async () => {
    set(state => ({ linear: { ...state.linear, syncing: true, error: null } }));
    try {
      const fetched = await syncFromLinear();
      const local = get().backlog.filter(item => item.source === 'local');
      const merged = [...fetched, ...local]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 100);
      set({
        backlog: merged,
        linear: {
          connected: true,
          syncing: false,
          lastSyncAt: Date.now(),
          error: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set(state => ({
        linear: {
          ...state.linear,
          syncing: false,
          error: message,
        },
      }));
      throw err instanceof Error ? err : new Error(String(err));
    }
  },
  syncLinear: async () => {
    // Alias for syncBacklog
    await get().syncBacklog();
  },
  createLinearIssue: async (title: string, description?: string, priority?: number) => {
    try {
      const item = await createLinearIssueApi(title, description, priority);
      if (item) {
        set(state => ({
          backlog: [item, ...state.backlog],
        }));
      }
      // Re-sync to get server state
      await get().syncBacklog();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set(state => ({
        linear: { ...state.linear, error: message },
      }));
      throw err instanceof Error ? err : new Error(String(err));
    }
  },
  updateLinearIssueStatus: async (issueId: string, newStatusType: string) => {
    try {
      const success = await updateLinearIssueStatusApi(issueId, newStatusType);
      if (success) {
        // Re-sync to get updated state from Linear
        await get().syncBacklog();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set(state => ({
        linear: { ...state.linear, error: message },
      }));
      throw err instanceof Error ? err : new Error(String(err));
    }
  },
  setBacklogItemStatus: (id, status) => {
    set(state => ({
      backlog: state.backlog.map(item =>
        item.id === id
          ? { ...item, status, updatedAt: Date.now() }
          : item
      ),
    }));
  },
  fetchAutonomousStatus: async () => {
    try {
      const since = get().autonomous.lastEventId;
      const url = since > 0 ? `/api/autonomous?since=${since}` : '/api/autonomous';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Autonomous status request failed (${res.status})`);
      const data = await res.json() as AutonomousStatus;
      const incoming = Array.isArray(data.events) ? data.events : [];
      set(state => {
        const nextEventId = incoming.reduce(
          (max, event) => Math.max(max, event.id),
          state.autonomous.lastEventId,
        );
        const nextActivity = [
          ...state.activityLog,
          ...incoming.map(event => ({
            timestamp: event.timestamp,
            message: `[Autonomous] ${event.message}`,
            type: event.type === 'info' ? 'info' : 'error',
          } as LogEntry)),
        ].slice(-200);

        return {
          autonomous: {
            ...state.autonomous,
            ...data,
            events: [...state.autonomous.events, ...incoming].slice(-200),
            lastEventId: nextEventId,
          },
          activityLog: nextActivity,
        };
      });
    } catch (err) {
      console.error('[fetchAutonomousStatus]', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  },
  fetchAgentStatuses: async () => {
    try {
      const res = await fetch('/api/agents/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Agent status request failed (${res.status})`);
      const data = await res.json() as Partial<Record<AgentRole, ServerAgentState>>;
      set(state => {
        const nextAgents = { ...state.agents };
        for (const role of Object.keys(nextAgents) as AgentRole[]) {
          const remote = data[role];
          if (!remote) continue;
          const mappedStatus = mapServerStatus(remote.status);
          const currentTask = remote.currentTask && remote.currentTask.trim().length > 0
            ? remote.currentTask
            : null;
          nextAgents[role] = {
            ...nextAgents[role],
            status: mappedStatus,
            currentTask,
            progress: mappedStatus === 'idle' ? 0 : nextAgents[role].progress,
          };
        }
        return { agents: nextAgents };
      });
    } catch (err) {
      console.error('[fetchAgentStatuses]', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  },
  setAutonomousEnabled: async (enabled: boolean) => {
    try {
      const res = await fetch('/api/autonomous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(`Autonomous toggle failed (${res.status})`);
      set(state => ({
        autonomous: {
          ...state.autonomous,
          enabled,
        },
      }));
      await get().fetchAutonomousStatus();
    } catch (err) {
      console.error('[setAutonomousEnabled]', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  },

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
    const decompositionStatus = state.decompositionStatus;
    const isDecomposing = state.currentTask?.status === 'decomposing' && decompositionStatus.startedAt !== null;
    let nextDecompositionStatus = decompositionStatus;
    let nextActivityLog: LogEntry[] | null = null;

    if (isDecomposing && decompositionStatus.startedAt !== null) {
      const elapsedMs = Math.max(0, now - decompositionStatus.startedAt);
      const elapsedChanged = Math.floor(elapsedMs / 1000) !== Math.floor(decompositionStatus.elapsedMs / 1000);
      const crossedThreshold = elapsedMs >= decompositionStatus.stallThresholdMs;
      if (crossedThreshold && !decompositionStatus.stalled) {
        const reason = state.lastFallbackReason;
        const reasonSuffix = reason ? ` Reason: ${reason}` : '';
        nextActivityLog = [
          ...state.activityLog,
          {
            timestamp: now,
            message: `Decomposition stall detected after ${Math.round(elapsedMs / 1000)}s (threshold ${Math.round(decompositionStatus.stallThresholdMs / 1000)}s).${reasonSuffix}`,
            type: 'error',
          } as LogEntry,
        ].slice(-100);
        nextDecompositionStatus = {
          ...decompositionStatus,
          elapsedMs,
          stalled: true,
          stallReason: reason ?? decompositionStatus.stallReason,
          warningLogged: true,
        };
      } else if (elapsedChanged) {
        nextDecompositionStatus = {
          ...decompositionStatus,
          elapsedMs,
        };
      }
    }

    set({
      vehicles: activeVehicles,
      particles: updatedParticles,
      economy,
      ...(nextActivityLog ? { activityLog: nextActivityLog } : {}),
      ...(providerHealthChanged ? { providerHealth } : {}),
      ...(agentsChanged ? { agents } : {}),
      ...(nextDecompositionStatus !== decompositionStatus ? { decompositionStatus: nextDecompositionStatus } : {}),
    });
  },
}));
