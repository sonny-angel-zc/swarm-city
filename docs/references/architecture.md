# Architecture References

- `src/core/store.ts` is the client state hub.
- `src/core/orchestrator.ts` handles server-side task sequencing and SSE events.
- `src/components/Sidebar.tsx` aggregates operations controls.

## Runtime Backends

- Swarm City runs directly against local AI CLIs.
- OpenAI path uses `codex exec` (configurable via `SWARM_CODEX_BIN`).
- Anthropic path uses `claude -p` (optional fallback provider).
- No OpenClaw runtime dependency is required.

## Retry + Self-Restart

- Agent runs auto-retry on transient errors, rate limits, and token/context limit failures.
- Retry count is configurable with `SWARM_AGENT_MAX_RETRIES` (default `4`).
- Backoff respects parsed `retry-after` hints when present.
- Token-limit retries compact prompt context automatically before restarting the attempt.

## Budget Endpoint

- `GET /api/limits` now reports generic local-CLI runtime budget values.
- Optional env overrides:
  - `SWARM_TOKENS_PER_MIN`
  - `SWARM_REQUESTS_PER_MIN`
  - `SWARM_CONTEXT_WINDOW`
  - `SWARM_PLAN`
