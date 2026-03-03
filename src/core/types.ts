// Agent roles and their building representations
export type AgentRole = 'pm' | 'engineer' | 'designer' | 'qa' | 'devils_advocate' | 'reviewer' | 'researcher';

export type AgentStatus = 'idle' | 'working' | 'needs_input' | 'done' | 'blocked';

export type BuildingConfig = {
  role: AgentRole;
  name: string;
  buildingName: string;
  color: string;       // Primary color
  accent: string;      // Secondary/accent
  dark: string;        // Shadow color
  gridX: number;
  gridY: number;
  width: number;       // Building width in tiles
  height: number;      // Building height (visual, pixels above base)
  description: string;
  icon: string;        // Emoji icon
};

export type Agent = {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  currentTask: string | null;
  progress: number;    // 0-1
  log: LogEntry[];
  building: BuildingConfig;
  contextUsed: number;    // 0-1, how full the context window is
  contextMax: number;     // max context tokens (visual only)
  contextWarning: boolean; // true when contextUsed > 0.9
};

export type OverlayMode = 'activity' | 'power' | 'economy';

export type LogEntry = {
  timestamp: number;
  message: string;
  type: 'info' | 'output' | 'error' | 'request';
};

export type SubTask = {
  id: string;
  title: string;
  assignedTo: AgentRole;
  status: 'pending' | 'in_progress' | 'review' | 'done';
  progress: number;
  description: string;
};

export type Task = {
  id: string;
  title: string;
  subtasks: SubTask[];
  status: 'decomposing' | 'in_progress' | 'review' | 'done';
  createdAt: number;
};

export type DecompositionStatus = {
  startedAt: number | null;
  elapsedMs: number;
  stallThresholdMs: number;
  stalled: boolean;
  stallReason: string | null;
  suggestedAction: string;
  warningLogged: boolean;
};

export type Vehicle = {
  id: string;
  fromAgent: AgentRole;
  toAgent: AgentRole;
  progress: number;    // 0-1 along path
  speed: number;
  color: string;
  message: string;
};

export type Pedestrian = {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  color: string;
  taskId: string;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type?: 'default' | 'coin' | 'water';
};

// ─── Economy Types ────────────────────────────────────────────────────────────

export type TransactionType = 'api_call' | 'tool_use' | 'completion';

export type Transaction = {
  id: string;
  agentRole: AgentRole;
  amount: number;
  type: TransactionType;
  timestamp: number;
};

export type EconomyHistoryPoint = {
  timestamp: number;
  totalSpent: number;
  agentSpend: Record<AgentRole, number>;
};

export type AgentBudget = {
  tokenBudget: number;
  tokensSpent: number;
  costPerCall: number;
};

export type TokenEconomy = {
  totalBudget: number;
  spent: number;
  income: number;    // earned from completed tasks
  expenses: number;  // tokens consumed
  budgetAlertThresholds: number[];
  triggeredBudgetAlerts: number[];
  transactions: Transaction[];
  history: EconomyHistoryPoint[];
  agentBudgets: Record<AgentRole, AgentBudget>;
};

// ─── Multi-Model Telemetry ───────────────────────────────────────────────────

export type ModelProvider = 'openai' | 'anthropic' | 'google';

export type ModelKind = 'reasoning' | 'analysis' | 'review';

export type TelemetryEvent = {
  id: string;
  timestamp: number;
  role: AgentRole;
  provider: ModelProvider;
  model: string;
  kind: ModelKind;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  transactionType: TransactionType;
};

export type ProviderSpend = {
  provider: ModelProvider;
  tokens: number;
  costUsd: number;
  events: number;
};

export type ModelSpend = {
  model: string;
  provider: ModelProvider;
  tokens: number;
  costUsd: number;
  events: number;
};

export type TelemetryState = {
  events: TelemetryEvent[];
  providerSpend: Record<ModelProvider, ProviderSpend>;
  modelSpend: Record<string, ModelSpend>;
  burnRatePerMinUsd: number;
  totalCostUsd: number;
};

// ─── Backlog / Linear Sync ───────────────────────────────────────────────────

export type BacklogPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type BacklogStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export type BacklogSource = 'local' | 'linear_stub' | 'linear';

export type StrategicProjectStatus = 'todo' | 'in_progress' | 'done';

// `linear` means progress came from Linear project.progress (normalized to 0-1).
// `issues_fallback` means progress was auto-derived from done/total issue ratio
// (with zero-issue guard -> 0) when Linear progress is unavailable.
export type ProjectProgressSource = 'linear' | 'issues_fallback';

export type ProjectIssueBreakdownBucket = 'todo' | 'in_progress' | 'done';

export type LinearProjectIssueBreakdown = {
  todo: number;
  in_progress: number;
  done: number;
};

export type LinearProjectDataContract = {
  id: string;
  name: string;
  description: string | null;
  progress: number; // 0-1
  issueBreakdown: LinearProjectIssueBreakdown;
};

export type LinearProjectContract = LinearProjectDataContract & {
  state: string | null; // raw Linear project state label when available
  issues: number;

  // Compatibility fields used by current UI/store. Keep in sync with canonical contract above.
  districtId: string;
  status: StrategicProjectStatus;
  progressSource: ProjectProgressSource;
  totalIssues: number;
  doneIssues: number;
  icon?: string | null;
  color?: string | null;
  isUnassigned: boolean;
};

export type BacklogItem = {
  id: string;
  title: string;
  ownerRole: AgentRole;
  status: BacklogStatus;
  priority: BacklogPriority;
  source: BacklogSource;
  linearId?: string;
  linearUrl?: string;
  ownerName?: string;
  statusLabel?: string;
  labels?: string[];
  projectId?: string;
  projectName?: string;
  projectDistrictId?: string;
  projectStatus?: StrategicProjectStatus;
  projectProgress?: number; // 0-1
  projectProgressSource?: ProjectProgressSource;
  updatedAt: number;
  swarmTaskId?: string;    // links to an active swarm orchestrator task
  isSwarmTarget?: boolean; // true when swarm is currently running on this item
};

export type LinearSyncState = {
  connected: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  error: string | null;
  projects: LinearProjectContract[];
};

// ─── Issue Inspection Contract ───────────────────────────────────────────────

/**
 * IssueInspectionContract — the canonical typed shape for all data displayed
 * when a task building is clicked in the city canvas (SWA-77).
 *
 * Source-of-truth rules:
 * - All fields are derived from existing store state at selection time.
 * - No new Linear API calls are triggered on selection.
 * - Missing data (null project, empty log) is handled with zero-state fallbacks.
 *
 * API mapping: every field traces to one of:
 *   (A) BacklogItem     — populated by linearSync.syncFromLinear() from Linear GraphQL
 *   (B) LinearProjectContract — populated by listLinearProjects() / mapLinearProjectContract()
 *   (C) Agent.log       — populated by store SSE event processing
 *   (D) AutonomousStatus — populated by /api/autonomous status polling
 *   (E) LinearSyncState  — populated by store.syncLinear()
 */
export type IssueInspectionContract = {
  // ── Linear issue identity (source: A) ────────────────────────────────────
  /** BacklogItem.id — Linear identifier string, e.g. "SWA-42". Primary key. */
  issueId: string;
  /** BacklogItem.linearId — Linear UUID (null for local/stub items). */
  linearId: string | null;
  /** BacklogItem.linearUrl — deep link into the Linear app (null for local/stub). */
  linearUrl: string | null;
  /** BacklogItem.title — issue title as synced from Linear. */
  title: string;
  /**
   * Display identifier shown in the panel header.
   * Resolution order: BacklogItem.id (Linear identifier like "SWA-42")
   * → BacklogItem.linearId?.slice(0, 8) → issueId.slice(0, 8).
   */
  identifier: string;

  // ── Issue status & priority (source: A) ──────────────────────────────────
  /** Normalized app status bucket. Maps from Linear state type via normalizeIssueState(). */
  status: BacklogStatus;
  /** Raw Linear state name (e.g. "In Review", "In Progress"). Null for local items. */
  statusLabel: string | null;
  /**
   * Normalized priority. Linear → app mapping:
   *   1 (urgent) → P0 | 2 (high) → P1 | 3 (medium) → P2 | 0/4 (none/low) → P3
   */
  priority: BacklogPriority;
  /** Data provenance: 'linear' for synced items, 'local'/'linear_stub' for offline. */
  source: BacklogSource;
  /** Label names from Linear issue labels.nodes[].name. Empty array when none. */
  labels: string[];

  // ── Ownership (source: A) ─────────────────────────────────────────────────
  /** Agent role assigned to this issue (round-robin from pickOwner() during sync). */
  ownerRole: AgentRole;
  /** Linear assignee display name. Null when unassigned or not synced. */
  ownerName: string | null;

  // ── Project context (source: B, resolved via TaskBuilding.districtId) ────
  /** LinearProjectContract.id. Null when issue is unassigned (districtId = 'unassigned'). */
  projectId: string | null;
  /** LinearProjectContract.name. 'No Project' for unassigned district. */
  projectName: string;
  /** Derived project status from issue breakdown counts (todo/in_progress/done). */
  projectStatus: StrategicProjectStatus;
  /**
   * Project completion ratio (0-1).
   * Source selected by progressSource field:
   *   'linear'           → Linear project.progress (normalized 0-1)
   *   'issues_fallback'  → doneIssues / totalIssues (0 when totalIssues = 0)
   */
  projectProgress: number;
  /** Indicates which progress calculation was used. */
  projectProgressSource: ProjectProgressSource;
  /** Per-bucket issue counts for the parent project. */
  projectIssueBreakdown: LinearProjectIssueBreakdown;
  /** LinearProjectContract.description. Null when absent or unassigned. */
  projectDescription: string | null;

  // ── Autonomous pipeline context (source: D) ────────────────────────────
  /** True when the autonomous loop is currently processing this issue. */
  isSwarmTarget: boolean;
  /** Orchestrator task ID when isSwarmTarget = true. Null otherwise. */
  swarmTaskId: string | null;
  /**
   * Timestamp (ms) when the autonomous loop last completed this issue.
   * Sourced from AutonomousStatus.completedTasks[].completedAt.
   * Null if the issue has not yet been completed by the loop.
   */
  autonomousCompletedAt: number | null;

  // ── Agent activity history (source: C) ────────────────────────────────
  /**
   * Last 8 log entries from agents[ownerRole].log, newest-first.
   * Empty array when isSwarmTarget = false or no log entries exist.
   * Each entry: { timestamp: number; message: string; type: 'info'|'output'|'error'|'request' }
   */
  agentLog: LogEntry[];

  // ── Sync metadata (source: E) ─────────────────────────────────────────
  /** Epoch ms of the last successful Linear sync. Null before first sync. */
  syncedAt: number | null;
  /** BacklogItem.updatedAt — epoch ms of last known update (from Linear updatedAt field). */
  updatedAt: number;
};

export type AutonomousEventType = 'info' | 'warning' | 'error';

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

export type AutonomousStatus = {
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

export type Notification = {
  id: string;
  agentRole: AgentRole;
  message: string;
  type: 'info' | 'warning' | 'review_needed';
  timestamp: number;
  read: boolean;
};

// Isometric constants
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 38; // ~0.6 ratio
export const GRID_SIZE = 24;

// Building definitions — positioned in the central government plaza (center of 24x24 grid)
export const BUILDING_CONFIGS: BuildingConfig[] = [
  {
    role: 'pm',
    name: 'PM Agent',
    buildingName: 'City Hall',
    color: '#F5A623',
    accent: '#FDD835',
    dark: '#C17900',
    gridX: 11, gridY: 11,
    width: 2, height: 90,
    description: 'Decomposes tasks, assigns work, tracks progress',
    icon: '🏛️',
  },
  {
    role: 'engineer',
    name: 'Engineer Agent',
    buildingName: 'Workshop',
    color: '#4A90D9',
    accent: '#64B5F6',
    dark: '#1565C0',
    gridX: 7, gridY: 8,
    width: 2, height: 75,
    description: 'Writes code, implements features',
    icon: '🏗️',
  },
  {
    role: 'designer',
    name: 'Designer Agent',
    buildingName: 'Studio',
    color: '#9C27B0',
    accent: '#CE93D8',
    dark: '#6A1B9A',
    gridX: 15, gridY: 8,
    width: 2, height: 70,
    description: 'UI/UX decisions, visual design specs',
    icon: '🎨',
  },
  {
    role: 'qa',
    name: 'QA Agent',
    buildingName: 'Testing Lab',
    color: '#4CAF50',
    accent: '#81C784',
    dark: '#2E7D32',
    gridX: 7, gridY: 14,
    width: 2, height: 65,
    description: 'Tests implementations, reports bugs',
    icon: '🔬',
  },
  {
    role: 'devils_advocate',
    name: "Devil's Advocate",
    buildingName: 'Dark Tower',
    color: '#E53935',
    accent: '#EF5350',
    dark: '#B71C1C',
    gridX: 15, gridY: 14,
    width: 1, height: 95,
    description: 'Challenges assumptions, finds flaws',
    icon: '🗼',
  },
  {
    role: 'reviewer',
    name: 'Reviewer Agent',
    buildingName: 'Courthouse',
    color: '#00897B',
    accent: '#4DB6AC',
    dark: '#00695C',
    gridX: 9, gridY: 6,
    width: 2, height: 70,
    description: 'Reviews PRs, approves/rejects work',
    icon: '⚖️',
  },
  {
    role: 'researcher',
    name: 'Researcher Agent',
    buildingName: 'Library',
    color: '#FF7043',
    accent: '#FFAB91',
    dark: '#D84315',
    gridX: 13, gridY: 6,
    width: 2, height: 65,
    description: 'Gathers context, reads docs, researches solutions',
    icon: '📚',
  },
];
