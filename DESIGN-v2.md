# Swarm City v2 — Game Mechanics as Agent Management

## Core Concept
Every real constraint in multi-agent orchestration maps to a game mechanic. The city isn't just a visualization — it's the actual management interface.

---

## 🪙 Economy = Token Usage

**Gold/Credits = API tokens consumed**

- Each agent building has a visible gold counter (spent this session)
- Token cost appears as gold coins flowing out when agents work
- A **treasury** (bank building) shows total budget remaining
- When budget is low, buildings dim / city gets darker
- Can set per-agent budgets (rate limiting) like tax policy
- Historical spend shown as a bar chart in the bank building's inspect panel
- Vehicles carrying messages show their token cost as cargo size (bigger = more expensive)

**Visual cues:**
- Cheap operations = small bronze coins
- Expensive operations (long outputs, tool use) = large gold bars
- Budget warnings = red glow on treasury, alarm bells

---

## 🏗️ Infrastructure = Context Window

**Roads & Power Grid = Context/memory capacity**

- Each agent has a **context meter** (like a power bar on their building)
- As context fills up, the building's lights flicker / power brownout effect
- Context window is literally the city's **power grid** — shared resource
- When approaching limits, street lights dim, roads get darker
- **Library building** (researcher) can offload context to long-term storage (files) — shown as warehouse/archive buildings
- Context summarization = "recycling plant" that compresses old context

**Visual cues:**
- Full context = power lines glowing bright, building overheating
- Near limit = smoke, sparks, brownout effect
- Context reset = building goes dark briefly, then reboots

---

## 🏭 Buildings = Agent Capabilities

**Replace plain boxes with distinct architectural sprites:**

| Agent | Building Style | Visual Details |
|-------|---------------|----------------|
| PM / City Hall | Grand civic building with clock tower | Clock shows elapsed time, flag on top |
| Engineer / Workshop | Industrial factory with chimney | Smoke when working, conveyor belt animation |
| Designer / Studio | Art deco building with neon | Color-shifting facade, paint splashes |
| QA / Testing Lab | Scientific facility with antenna | Scanning beams, test tubes bubbling |
| Devil's Advocate / Dark Tower | Gothic spire | Lightning, red windows, ominous glow |
| Reviewer / Courthouse | Classical columns | Gavel animation, scales of justice |
| Researcher / Library | University/library | Books floating, telescope on roof |

**Building upgrades based on completed work:**
- More tasks completed = building grows taller / more detailed
- Building "level" shown as floors added
- Idle too long = building gets dusty / cobwebs

---

## 🚗 Vehicles = Messages & Data Flow

**Different vehicle types for different message types:**

| Message Type | Vehicle | Visual |
|-------------|---------|--------|
| Task assignment | Delivery truck | Carries a package |
| Code output | Data packet (glowing orb) | Trails light particles |
| Review request | Courier (fast motorcycle) | Quick, urgent feeling |
| Error/bug report | Ambulance | Red + siren |
| Human input | Golden chariot | Special, rare |

---

## ⚡ Resources to Manage (Game Mechanics)

### 1. **Gold** (Tokens/API Cost)
- Earned: task completions, efficient solutions
- Spent: every API call, tool use, long outputs
- Management: budget allocation per agent, cost caps

### 2. **Power** (Context Window)
- Generated: context resets, summarization
- Consumed: every message, tool output, file reads
- Management: when to summarize, when to reset, what to keep

### 3. **Population** (Active Agents)
- More agents = more parallel work but more overhead
- Can "hire" (spawn) new agents or "fire" (terminate) idle ones
- Agent specialization matters — wrong agent for wrong task wastes resources

### 4. **Reputation** (Quality Score)
- Tasks completed successfully = reputation up
- Errors, rework, bugs = reputation down
- High reputation agents get priority tasks
- Shown as stars above buildings

### 5. **Time** (Wall Clock / SLA)
- Task deadlines shown as countdown timers
- Day/night cycle reflects actual time
- Rush jobs cost more gold (higher thinking levels)

---

## 🗺️ City Layout Improvements

### Zones
- **Government District** (center): City Hall (PM), Courthouse (Reviewer)
- **Industrial Zone** (west): Workshop (Engineer), Testing Lab (QA)
- **Creative District** (east): Studio (Designer), Library (Researcher)
- **Outskirts**: Dark Tower (Devil's Advocate) — literally on the edge

### Infrastructure
- **Roads** connect buildings — thicker = more traffic
- **Power lines** visible between buildings — glow with context usage
- **Park/plaza** in center — where agents "meet" for sync discussions
- **Train station** — for external API calls (leaving the city)
- **Warehouse district** — file system / persistent storage

---

## 📊 Dashboard Overlays (Toggle)

1. **Economy view**: Heat map of token spend per agent
2. **Context view**: Power grid visualization, context fill levels
3. **Activity view**: Default — vehicles, particles, building states
4. **Quality view**: Reputation stars, error rates, rework %

---

## 🎮 Interactions

- **Click building** → inspect panel with live logs, stats, budget
- **Click vehicle** → see message content, token cost
- **Drag gold** → manually allocate budget to agent
- **Click treasury** → overall spend dashboard
- **Tap power plant** → context usage overview
- **Long press building** → agent controls (restart, pause, boost)

---

## Implementation Priority

### Phase 1: Visual Upgrade (Buildings & Assets)
- [ ] Replace box buildings with detailed isometric sprites (canvas-drawn, not images)
- [ ] Unique architectural style per agent role
- [ ] Window animations, smoke, particles per building type
- [ ] Day/night cycle based on actual time

### Phase 2: Economy System
- [ ] Token tracking per agent (mock data first, real API later)
- [ ] Treasury/bank building with budget display
- [ ] Gold coin animations on API calls
- [ ] Budget warnings and limits

### Phase 3: Context Infrastructure
- [ ] Context meter per agent building
- [ ] Power grid visual connecting buildings
- [ ] Brownout effects when context is high
- [ ] Summarization/reset animations

### Phase 4: Real Agent Integration
- [ ] Wire to actual OpenClaw/Claude Code sessions
- [ ] Real token usage from API responses
- [ ] Real context window tracking
- [ ] Live task orchestration
