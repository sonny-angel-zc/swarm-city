# Task: Make Swarm City Self-Driving & Self-Improving

## Goal
Swarm City should autonomously work through its Linear backlog, execute tasks using Codex CLI, and generate new improvement tasks as it discovers things to improve about itself. When Jonah wakes up, it should still be running and actively improving itself.

## Current Architecture (what exists)
- Next.js 15 app at `/Users/sonny_angel/.openclaw/workspace/swarm-city/`
- `src/core/orchestrator.ts` — spawns `codex` or `claude` CLI as subprocesses to execute tasks
  - Has PM decomposition (breaks task into subtasks for 6 agent roles)
  - Has retry/rate-limit/fallback logic built in
  - Currently ONLY runs when a human submits a task via the UI
- `src/core/linearSync.ts` — client-side Linear API wrapper (list/create/update issues)
- `src/app/api/linear/route.ts` — server-side Linear GraphQL proxy
- `src/app/api/tasks/route.ts` — creates tasks via POST
- Linear workspace: Swarm City team (id: `8687f779-d37c-49dc-82bf-3f2177df56a8`)
- LINEAR_API_KEY is in `.env.local`
- Codex CLI is installed and authenticated (`codex-cli 0.106.0`)
- Dev server runs on port 3000, exposed via Tailscale funnel at `https://sonny-angel.taild14522.ts.net:8443/`

## What Needs to Be Built

### 1. Autonomous Loop (`src/core/autonomousLoop.ts`)
A server-side loop that:
- Runs on a configurable interval (e.g., every 60 seconds)
- Checks Linear backlog for the highest-priority `todo` issue
- Picks it up, marks it `started` in Linear
- Passes it to the orchestrator to execute (using Codex as the agent)
- When done, marks the Linear issue `completed`
- Moves to the next issue
- **Key: The agents should work on the SWARM CITY codebase itself** — workDir should be the swarm-city project directory

### 2. Self-Improvement: Task Generation
After completing each task, the system should:
- Have a "reflection" agent (use Codex) analyze what was built and what could be improved
- Auto-create new Linear issues for improvements it identifies
- Priority should be P2/P3 for generated tasks (don't flood with urgent)
- Include a `[generated]` label so we can distinguish human vs auto tasks

### 3. Seed the Backlog
Create initial Linear issues to get the autonomous loop started. Good seed tasks:
- "Add loading states and error boundaries to all components"
- "Add keyboard shortcuts for common actions"  
- "Improve mobile responsiveness of the sidebar panels"
- "Add a settings panel for configuring model preferences"
- "Add real-time cost tracking with budget alerts"
- "Write README.md with setup instructions for new users"

### 4. Auto-Start on Server Boot
The autonomous loop should start when the Next.js dev server starts:
- Add a server-side initialization in the app (e.g., instrumentation.ts or a route that self-triggers)
- Include a pause/resume toggle in the UI
- Show the current autonomous task in the UI

### 5. Dashboard Updates
- Show "Autonomous Mode: ON/OFF" toggle in the top bar
- Show which task is currently being worked on autonomously
- Show a log of completed autonomous tasks
- Activity feed should show autonomous work in real-time

### 6. Self-Restart on Rate Limit / Token Exhaustion
The orchestrator already has retry logic. Enhance it:
- When ALL providers are rate-limited, pause the autonomous loop (don't burn retries)
- Resume automatically when cooldown expires
- If a task hits token limits, summarize context and restart with shorter prompt
- Log all restarts visually in the activity feed

## Important Constraints
- **No OpenClaw dependency** — this should work standalone with just Codex CLI auth
- **Use Codex (`codex exec`)** as the primary agent — Claude is rate-limited right now
- **Work directory for agents should be the swarm-city project itself** so they can actually modify the codebase
- **Commit changes** — agents should `git add && git commit` their work
- **Don't break the running server** — be careful with file changes that could crash Next.js
- The Linear API key is already in `.env.local` — use `process.env.LINEAR_API_KEY`
- The Linear team ID is `8687f779-d37c-49dc-82bf-3f2177df56a8`

## Testing
After building:
1. Verify the autonomous loop starts on server boot
2. Verify it picks up a task from Linear
3. Verify Codex actually executes and modifies files
4. Verify it marks the issue completed in Linear
5. Verify it generates new improvement tasks
6. Verify it moves to the next task automatically

## When Done
Run: `openclaw system event --text "Done: Autonomous self-driving loop is live and executing tasks from Linear backlog" --mode now`
