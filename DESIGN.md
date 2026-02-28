# Swarm City — Visual Harness for Claude Code Agent Teams

## Vision
An isometric city web UI that serves as a **visual harness/skin for Claude Code**. Each building represents an agent with a specific role. The city visualizes work happening in real-time across a team of Claude Code agents coordinated through a job queue with a central coordinator.

**Core principle (from OpenAI's harness engineering):** Humans steer, agents execute. The UI makes agent work legible at a glance.

## Architecture

### Runtime Model
- **Claude Code** is the execution engine — all agents run as Claude Code instances
- **Swarm City** is the harness — coordinates, visualizes, and provides human input
- **Job queue** with coordinator pattern — coordinator decomposes tasks, workers pull from queue
- **Agent-to-agent review** — agents can review each other's work (QA tests engineer's code, devil's advocate challenges PM's plan)

### 1. Agent Roles (Building Types)
Each agent role maps to a distinct building type in the isometric city:

| Role | Building | Color | Function |
|------|----------|-------|----------|
| **PM (Coordinator)** | City Hall / HQ | Gold | Decomposes tasks, manages queue, tracks progress |
| **Engineer** | Factory / Workshop | Blue | Writes code, implements features |
| **Designer** | Art Studio | Purple | UI/UX decisions, design specs, architecture |
| **QA / Tester** | Lab / Testing Facility | Green | Tests implementations, runs test suites |
| **Devil's Advocate** | Dark Tower | Red | Challenges assumptions, finds flaws, stress-tests |
| **Reviewer** | Courthouse | Teal | Code review, approves/rejects PRs |

### 2. City = Project State (Visual Mapping)
- **Buildings** = agents (animated when working, dark when idle)
- **Roads** = task dependencies / communication channels
- **Vehicles on roads** = messages flowing between agents
- **Construction cranes** = tasks in progress
- **Completed/lit buildings** = finished work
- **Pulsing red glow** = agent needs human input
- **Smoke/particles** = agent actively processing
- **Building size** = scales with amount of work completed

### 3. Job Queue Flow
```
User types task in text input
    → Coordinator (PM) decomposes into subtask queue
    → Workers (Claude Code agents) claim tasks from queue
    → On completion: QA agent auto-tests
    → Devil's Advocate reviews critically
    → Reviewer approves or sends back to queue
    → Coordinator reports completion
    → Human reviews only when flagged (pulsing building)
```

### 4. Claude Code Integration
- Each agent = a Claude Code process with role-specific system prompt
- Agents work in the same repo (shared workspace)
- Coordinator uses Claude Code's native sub-agent/task features
- Agent communication via:
  - Shared task board (JSON/SQLite)
  - File system (agents read each other's output)
  - Coordinator relays messages between agents

### 5. Interaction Model
- **Text input bar** (bottom) → submit tasks, respond to agent questions
- **Click a building** → see agent's current task, live log stream, status
- **Overview mode** → see all tasks, queue depth, completion %
- **Notification badges** → when agents need human input
- **Simple, glanceable** → you should understand project state in 2 seconds

### 6. Technical Stack
- **Frontend**: Fork of isometric-city (Next.js + TypeScript + Canvas)
- **Backend**: Node.js server managing Claude Code processes
- **Agent Runtime**: Claude Code CLI (`claude` command) with `--print` or interactive mode
- **State**: SQLite for task queue + WebSocket for real-time UI updates
- **Communication**: File-based task board + WebSocket bridge to UI

### 7. Backend API
```
POST /api/tasks              — submit a new high-level task
GET  /api/tasks              — list all tasks + status
GET  /api/tasks/:id          — task detail + subtask tree
POST /api/tasks/:id/input    — human provides input for a blocked task
GET  /api/agents             — list all active agents + status  
GET  /api/agents/:id/logs    — stream agent's live output
POST /api/agents/:id/msg     — send message to specific agent
WS   /api/ws                 — real-time agent activity stream
```

### 8. MVP Scope (Overnight Build)

**Phase 1 — Visualization (2-3 hours)**
1. Fork isometric-city into swarm-city
2. Strip game mechanics (economy, zoning, save/load)
3. Replace with fixed agent-role buildings on a pre-built city layout
4. Add status overlays on buildings (task name, progress bar, role label)
5. Building animation states: idle, working, blocked, complete
6. Click-to-inspect panel: shows agent detail + log stream

**Phase 2 — Agent Backend (2-3 hours)**
1. Task queue system (SQLite: tasks table with status, assignee, parent_task)
2. Coordinator agent: takes high-level task → produces subtask queue
3. Agent manager: spawns Claude Code processes per role
4. Worker loop: agents claim tasks, execute, report back
5. Agent-to-agent handoff: engineer → QA → reviewer pipeline

**Phase 3 — Wire Together (1-2 hours)**
1. WebSocket bridge: agent state changes → city UI updates
2. Text input bar for human task submission + responses
3. Notification system for human-needed reviews
4. Live log streaming in inspect panel

### 9. File Structure
```
swarm-city/
├── src/
│   ├── app/
│   │   ├── page.tsx                 — main city view
│   │   └── api/
│   │       ├── tasks/route.ts       — task CRUD + submission
│   │       ├── agents/route.ts      — agent status + management
│   │       └── ws/route.ts          — websocket for real-time updates
│   ├── components/
│   │   ├── city/                    — isometric rendering (from isometric-city)
│   │   │   ├── AgentBuilding.ts     — building renderer per role
│   │   │   ├── CityLayout.ts        — fixed layout of agent buildings
│   │   │   ├── StatusOverlay.ts     — task/progress overlay on buildings
│   │   │   └── VehicleSystem.ts     — messages flowing as vehicles
│   │   ├── panels/
│   │   │   ├── AgentInspector.tsx   — detail panel when clicking a building
│   │   │   ├── TaskQueue.tsx        — queue overview panel
│   │   │   └── LogStream.tsx        — live agent output
│   │   ├── TaskInput.tsx            — text input bar (bottom)
│   │   └── ui/                      — shared UI components
│   ├── server/
│   │   ├── orchestrator.ts          — coordinator/PM logic
│   │   ├── agent-manager.ts         — spawn/manage Claude Code processes
│   │   ├── task-queue.ts            — SQLite-backed job queue
│   │   ├── ws-bridge.ts             — WebSocket event bridge
│   │   └── types.ts                 — shared types
│   └── agents/
│       ├── prompts/                 — role-specific system prompts
│       │   ├── coordinator.md       — PM: task decomposition + orchestration
│       │   ├── engineer.md          — code implementation
│       │   ├── designer.md          — architecture + UI design
│       │   ├── qa.md                — testing + validation
│       │   ├── devils-advocate.md   — critical review + edge cases
│       │   └── reviewer.md          — code review + approval
│       └── roles.ts                 — role configs (model, thinking level, etc)
├── package.json
├── DESIGN.md
└── AGENTS.md                        — for Claude Code agents working in this repo
```

## Key Design Decisions

### Why Claude Code as the runtime?
- Native tool use (file read/write, shell, etc.)
- Battle-tested for coding tasks
- Sub-agent support built in
- Jonah already has it set up

### Why job queue over swarm?
- Predictable, debuggable, visible
- Coordinator can make smart decomposition decisions
- Easy to add human checkpoints
- Clear ownership of tasks

### Why isometric city?
- Intuitive spatial metaphor for parallel work
- Beautiful and engaging — you actually want to watch it
- Buildings = agents is immediately legible
- Activity (vehicles, construction) shows the system is alive

## Inspiration
- **OpenAI Harness Engineering**: Humans steer, agents execute. Make everything legible. Agent-to-agent review loops. Repository knowledge as system of record.
- **Isometric City**: Canvas-based isometric rendering, vehicle/pedestrian simulation, interactive grid.
