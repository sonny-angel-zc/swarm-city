# Swarm City v3 — Operational Control Layer

**Status:** In Progress
**Created:** 2026-03-01
**Source:** OpenAI "Harness Engineering" article + Jonah's requirements

## Goal
Add the operational backbone that turns Swarm City from a visualization into a real agent management system. Four tracks, built in parallel.

---

## Track 1: Rate-Limit Manager + Model Fallback

**Files:** `src/core/rateLimiter.ts`, `src/core/fallbackPolicy.ts`

### Rate Limiter
- Per-provider sliding window tracker (RPM, TPM, concurrency)
- Configurable limits via `swarm-city.config.ts`:
  ```ts
  providers: {
    anthropic: { rpm: 50, tpm: 100000, concurrent: 4 },
    "openai-codex": { rpm: 40, tpm: 80000, concurrent: 8 }
  }
  ```
- Preflight check before every agent call returns: `allow | delay(ms) | downgrade(model) | reject`
- Circuit breaker: after 3x 429s in 60s, pause provider for 30s
- Expose usage stats to UI via store

### Fallback Policy
- Ordered fallback chain per agent: `[opus, codex, haiku]`
- Auto-downgrade triggers: rate limit, circuit breaker, budget exhaustion
- Manual override: human can pin a model from UI
- Log all fallback events for postmortem

### UI Components
- `src/components/ProviderHealth.tsx` — top bar health strip
  - Per-provider: name, % RPM used, % TPM used, green/yellow/red light
  - "Predicted throttle in X min" warning
- Wire into existing `TopBar.tsx`

---

## Track 2: Multi-Model Token Telemetry

**Files:** `src/core/telemetry.ts`, update `src/core/store.ts`

### Telemetry Tracker
- Per-model metrics:
  - tokens_in, tokens_out, cached_tokens
  - request_count, error_count
  - avg_latency_ms
  - estimated_cost_usd
  - context_window_fill_pct
- Rolling windows: last 1m, 5m, 1h, 24h
- Persist to localStorage for session continuity

### UI: Upgrade Treasury → Model Treasury
- `src/components/Treasury.tsx` → one card per active model
- Stacked area chart: tokens over time by model (use canvas drawing, no chart lib)
- Throughput gauge: req/min + tokens/min
- Cost counter with running total

---

## Track 3: Plan Registry + Document Memory

**Files:** `src/core/planRegistry.ts`, `docs/` folder structure

### Folder Structure
```
swarm-city/
  docs/
    architecture.md          # system map
    plans/
      active/               # in-progress plans
      completed/            # done plans
    decisions/              # ADR-001-*.md
    runbooks/               # operational guides
```

### Plan Registry
- CRUD for plan files (create, read, update, complete)
- Plan metadata: `{ id, title, owner_agent, status, created, updated, related_tickets, commits }`
- Status: draft → active → review → completed
- Auto-capture: when an agent produces a plan-like output, offer to save it
- Index file: `docs/plans/INDEX.md` auto-generated

### UI: Docs Panel
- `src/components/DocsPanel.tsx` — sidebar tab
- List plans with status badges
- Click to view rendered markdown
- Search across plan titles/content

---

## Track 4: Linear Integration (Stub)

**Files:** `src/core/linearSync.ts`

### v1 Scope (stub/mock)
- Define the interface: `LinearIssue { id, title, status, assignee, labels, priority }`
- Mock data for UI development
- Issue ↔ plan file mapping
- Status sync: TODO / In Progress / In Review / Done

### UI: Backlog District
- `src/components/BacklogPanel.tsx`
- Issue cards with status, assignee, priority
- Linked plan file badge
- Placeholder for real Linear API integration later

---

## Implementation Notes
- Tracks 1-3 can be built in parallel (no dependencies)
- Track 4 is UI-only stub, can pair with Track 3
- All new core modules export to store for UI consumption
- No new npm dependencies — use canvas for charts, built-in fetch for future API calls
- Keep existing visual features intact (sprites, economy, day/night cycle, overlays)

## Agent Assignment
- Agent A: Track 1 (rate limiter + fallback + ProviderHealth UI)
- Agent B: Track 2 (telemetry + Treasury upgrade) + Track 4 (backlog stub)
- Agent C: Track 3 (plan registry + docs structure + DocsPanel UI)
