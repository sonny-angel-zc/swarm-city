# Swarm City

Swarm City is a Next.js control plane for a multi-agent software swarm. It renders a real-time city UI, runs agent workflows through local CLI backends (Codex and optional Claude), and syncs backlog/work status with Linear.

## Prerequisites

- Node.js 20+
- npm 10+
- Git
- Linear API key (required for backlog sync)
- `codex` CLI in `PATH` (default runtime)
- Optional: `claude` CLI in `PATH` (fallback runtime)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.local .env.local.bak 2>/dev/null || true
cat > .env.local <<'ENV'
LINEAR_API_KEY=lin_api_xxx
ENV
```

3. Start development server:

```bash
npm run dev
```

4. Open:

```text
http://localhost:3000
```

## Environment Variables

### Required

- `LINEAR_API_KEY`: Linear API key used by server routes (`/api/linear`) and autonomous backlog processing.

### Optional Runtime + Limits

- `SWARM_PLAN` (default: `local-cli`): plan label surfaced by `GET /api/limits`.
- `SWARM_TOKENS_PER_MIN` (default: `50000`): displayed token budget.
- `SWARM_REQUESTS_PER_MIN` (default: `300`): displayed request budget.
- `SWARM_CONTEXT_WINDOW` (default: `200000`): displayed context window.

### Optional Codex/Claude CLI Settings

- `SWARM_CODEX_BIN` (default: `codex`): Codex executable name/path.
- `SWARM_CLAUDE_BIN` (default: `claude`): Claude executable name/path.
- `SWARM_CODEX_ISOLATED_CONTEXT` (default: `true`): isolates Codex runs per task.

### Optional Codex Agent-ID Mapping

Resolution order:

1. `SWARM_CODEX_AGENT_ID_<ROLE>` (`PM`, `RESEARCHER`, `DESIGNER`, `ENGINEER`, `QA`, `DEVILS_ADVOCATE`, `REVIEWER`)
2. `SWARM_CODEX_AGENT_MAP` JSON (role key)
3. `SWARM_CODEX_AGENT_MAP.default`
4. `SWARM_CODEX_AGENT_ID`
5. `OPENCLAW_CODEX_AGENT_ID` (legacy)

Example:

```bash
SWARM_CODEX_AGENT_MAP='{"default":"agent-default","engineer":"agent-eng","qa":"agent-qa"}'
```

### Optional Autonomous Mode Settings

- `SWARM_AUTONOMOUS_DEFAULT_ON` (default: `true`)
- `SWARM_AUTONOMOUS_INTERVAL_MS` (default: `60000`)
- `SWARM_AUTONOMOUS_COOLDOWN_MS` (default: `90000`)
- `SWARM_EXPECTED_TOKENS_PER_TURN` (default: `250000`)
- `SWARM_AUTONOMOUS_MODEL` (default: `gpt-5.3-codex`)
- `SWARM_AUTONOMOUS_MAX_RETRIES` (default: `3`)
- `SWARM_AGENT_MAX_RETRIES` (default: `4`)

## Scripts

- `npm run dev`: start Next.js dev server on port `3000` with Turbopack.
- `npm run build`: production build.
- `npm run start`: run production server.
- `npm run validate:docs-registry`: verify docs registry metadata and markdown file paths in `src/core/planRegistry.ts`.
- `npm run validate:next-router-roots`: ensure `app`/`pages` roots are not split between project root and `src` (prevents Next.js typegen path breakage).
- `npm run test:e2e`: run Playwright suite.
- `npm run test:smoke:preflight`: enforce smoke preflight contract (tooling, Node version, clean git worktree, dependencies, config validity, and mode-based server readiness for `SMOKE_PREFLIGHT_MODE=listen|check|skip`).
- `npm run test:smoke`: run smoke test only (local quick run) after preflight checks. Supports `SMOKE_HOST`/`SMOKE_PORT` (defaults: `127.0.0.1`/`3000`).
- `npm run test:smoke:ci`: run smoke test with CI semantics (single worker, zero retries) after preflight checks. Supports `SMOKE_HOST`/`SMOKE_PORT` (defaults: `127.0.0.1`/`3000`).

Smoke docs: [`docs/testing/smoke-tests.md`](docs/testing/smoke-tests.md)

## High-Level Architecture

### Frontend (App + UI)

- `app/page.tsx`: main control-plane shell and bootstrap flow.
- `src/components/*`: city canvas, task input, sidebar, backlog, budget, telemetry panels.
- `src/core/store.ts`: Zustand state hub for UI state, SSE events, tasks, budgets, and backlog sync actions.

### API Layer (Next.js Route Handlers)

- `POST /api/tasks`: create a swarm task and pick provider/model defaults.
- `GET /api/tasks/:id/events`: stream task events over Server-Sent Events.
- `POST /api/agents/:role/message`: inject human feedback to a running task.
- `GET /api/limits`: expose provider availability and budget limits.
- `POST /api/linear`: Linear GraphQL proxy actions (`list`, `create`, `updateStatus`, `states`).
- `GET/POST /api/autonomous`: inspect/toggle autonomous loop.
- `POST /api/autonomous/seed`: seed default backlog items into Linear.

### Core Runtime

- `src/core/orchestrator.ts`: creates tasks, sequences role execution, runs CLI agents, emits SSE, and applies retry/backoff logic.
- `src/core/autonomousLoop.ts`: periodic loop that seeds backlog, picks TODO issues, executes them, and updates Linear states.
- `src/core/codexAdapter.ts`: Codex agent-id mapping and startup warnings.
- `src/core/linearServer.ts`: server-side Linear GraphQL client and issue/state helpers.

### Startup Behavior

- `instrumentation.ts` runs in Node runtime, applies Codex adapter config, warns on mapping issues, and starts autonomous loop.

## Validation Checklist

After setup:

1. Run `npm run dev` and load `/`.
2. Confirm `GET /api/limits` returns JSON.
3. Confirm `LINEAR_API_KEY` is valid by syncing backlog in UI or posting to `/api/linear`.
4. (Optional) run smoke test once Playwright is installed.

For command reference and troubleshooting, see [`docs/testing/smoke-tests.md`](docs/testing/smoke-tests.md).
