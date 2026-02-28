# Task: Build Token Economy System

## Goal
Add a game-like economy system where API token usage is represented as gold/money — with a treasury, per-agent budgets, and visual coin animations.

## Context
- This is a Next.js app at /tmp/swarm-economy/
- The original isometric-city has an economy system. Reference: /Users/sonny_angel/.openclaw/workspace/isometric-city/src/games/isocity/types/economy.ts
- Current store is in src/core/store.ts, types in src/core/types.ts
- The design doc is at /Users/sonny_angel/.openclaw/workspace/swarm-city/DESIGN-v2.md

## What to Do

### 1. Add Economy Types (src/core/types.ts)
Add to the existing types:
- TokenEconomy: { totalBudget, spent, income (tasks completed), expenses (tokens used) }
- Per-agent: tokenBudget, tokensSpent, costPerCall (mock values for now)
- HistoryPoint: { timestamp, totalSpent, agentSpend: Record<AgentRole, number> }
- Transaction: { id, agentRole, amount, type: 'api_call'|'tool_use'|'completion', timestamp }

### 2. Add Economy to Store (src/core/store.ts)
- Add economy state to SwarmStore
- Track token spending per agent during task execution
- In the SSE event handlers, simulate token costs:
  - agent_output: costs 50-200 tokens (random)
  - agent_tool_use: costs 100-500 tokens
  - agent_done: bonus of +100 income
- Add a spendTokens(role, amount, type) action
- Add history tracking (push a point every few seconds during active tasks)

### 3. Create Treasury Component (src/components/Treasury.tsx)
- A small overlay on the canvas showing:
  - Total budget remaining (gold coin icon + number)
  - Spend rate (tokens/min)
  - Color changes: green (healthy) → yellow (>50% spent) → red (>80% spent)
- Position it in the top-left of the canvas area

### 4. Add Gold Coin Animation to CityCanvas
- When tokens are spent, animate small gold circles floating up from the building
- Size proportional to cost: small bronze for cheap calls, larger gold for expensive ones
- Add these as a new particle type in the existing particle system

### 5. Per-Agent Budget Display
- In the Sidebar agent list, show each agent's token spend next to their name
- Small progress bar showing budget used vs allocated
- Color: green → yellow → red as budget fills

### 6. Create BudgetPanel Component (src/components/BudgetPanel.tsx)
- Modal/panel that opens when clicking the treasury
- Shows per-agent budget allocation with sliders (like original game's BudgetPanel)
- Shows spend history as a simple bar chart
- Reference: /Users/sonny_angel/.openclaw/workspace/isometric-city/src/components/game/panels/BudgetPanel.tsx

## Important
- Use mock/simulated data for now (not real API tracking yet)
- Keep all existing functionality working
- Make it look good with the existing dark theme
- Commit with clear message when done

When completely finished, run:
openclaw system event --text "Done: Token economy system with treasury, budgets, and coin animations" --mode now
