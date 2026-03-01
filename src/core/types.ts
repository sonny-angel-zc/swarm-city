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
};

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
  type?: 'default' | 'coin';
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
  transactions: Transaction[];
  history: EconomyHistoryPoint[];
  agentBudgets: Record<AgentRole, AgentBudget>;
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
export const GRID_SIZE = 16;

// Building definitions
export const BUILDING_CONFIGS: BuildingConfig[] = [
  {
    role: 'pm',
    name: 'PM Agent',
    buildingName: 'City Hall',
    color: '#F5A623',
    accent: '#FDD835',
    dark: '#C17900',
    gridX: 7, gridY: 7,
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
    gridX: 3, gridY: 4,
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
    gridX: 11, gridY: 4,
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
    gridX: 3, gridY: 10,
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
    gridX: 11, gridY: 10,
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
    gridX: 5, gridY: 2,
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
    gridX: 9, gridY: 2,
    width: 2, height: 65,
    description: 'Gathers context, reads docs, researches solutions',
    icon: '📚',
  },
];
