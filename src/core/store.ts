import { create } from 'zustand';
import {
  Agent, AgentRole, AgentStatus, Task, SubTask, Vehicle, Notification,
  LogEntry, BUILDING_CONFIGS, Particle,
} from './types';

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
  // SSE
  eventSource: EventSource | null;

  // Actions
  selectAgent: (role: AgentRole | null) => void;
  submitTask: (title: string) => void;
  tick: (dt: number) => void;
  sendMessage: (agentRole: AgentRole, message: string) => void;
  setCameraPos: (x: number, y: number) => void;
  setZoom: (z: number) => void;
  dismissNotification: (id: string) => void;
  processSSEEvent: (event: SSEEvent) => void;
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
    };
  }
  return agents as Record<AgentRole, Agent>;
}

let vehicleIdCounter = 0;
let notifIdCounter = 0;

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
  eventSource: null,

  selectAgent: (role) => set({ selectedAgent: role }),

  submitTask: async (title: string) => {
    // Close any existing SSE connection
    const prev = get().eventSource;
    if (prev) prev.close();

    // Reset agents
    set({ agents: createAgents() });

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      const taskId = data.taskId;

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
          { timestamp: Date.now(), message: `Failed to submit task: ${err}`, type: 'error' },
        ],
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
    for (const role of Object.keys(state.agents) as AgentRole[]) {
      const a = state.agents[role];
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
        size: p.size * (1 - dt * 0.5),
      }))
      .filter(p => p.life > 0);

    set({
      vehicles: activeVehicles,
      particles: updatedParticles,
    });
  },
}));
