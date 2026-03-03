# SWA-67 Subtask 1/5: Research Constraints for Linear Strategic Layer

## Goal
Audit current architecture for integrating Linear projects as the strategic district layer (progress tracking + backlog organization) and define implementation-ready constraints for SWA-67 follow-up subtasks.

## Code-Verified Baseline (Current)
1. Strategic district UI is active in `src/components/BacklogPanel.tsx`.
   - District tabs are sourced from `linear.projects`.
   - Backlog filtering is keyed by `projectId` (`all`, concrete project id, or `__no_project__`).
   - Progress/status metadata is exposed via deterministic attributes (`data-district-progress-source`, `data-district-status`, `data-backlog-filter-project-id`).

2. Canonical mapping logic exists in `src/core/linearProject.ts`.
   - `mapLinearProjectContract` is the canonical projector for district contract shape, progress fallback, status, and unassigned handling.
   - Unknown/missing issue states intentionally collapse into `todo` via `toIssueBreakdownBucket`.

3. Client sync already prefers server-provided contracts.
   - `app/api/linear/route.ts` returns `contracts.projects`.
   - `src/core/linearSync.ts` parses and prefers `contracts.projects`, then falls back to local derivation when contracts are absent.

4. The same domain is still fetched through two server stacks.
   - App route stack: `app/api/linear/route.ts`.
   - Autonomous/server stack: `src/core/linearServer.ts`.

## Hard Constraints
1. Dataset truncation is built in at multiple layers.
   - `issues(first: 100)` and `projects(first: 100)` in both server query stacks.
   - Nested project issues are capped with `issues(first: 250)`.
   - `src/core/store.ts` truncates merged backlog to 100 items in `syncBacklog`.
   - Constraint impact: district progress/backlog visibility is incomplete for larger teams.

2. Team scope is statically pinned.
   - `TEAM_ID` in `src/core/linearSync.ts` and `LINEAR_TEAM_ID` default in `src/core/linearServer.ts` are hardcoded.
   - Constraint impact: multi-team or workspace switching is blocked without explicit refactor.

3. State catalog caching has no invalidation strategy.
   - `cachedStates` in `src/core/linearSync.ts` is process-lifetime.
   - Constraint impact: state-id resolution can become stale until reload/restart.

4. Progress semantics are not uniform across endpoints.
   - Strategic contract (`LinearProjectContract`) preserves `progress` and `progressSource` (`linear` vs `issues_fallback`).
   - `app/api/projects/route.ts` recomputes progress percentage from done/total only and does not surface `progressSource`.
   - Constraint impact: different UI/reporting surfaces can show conflicting progress for the same project.

5. Contract parsing is strict and drops malformed projects silently.
   - `parseProjectsFromApiContract` in `src/core/linearSync.ts` excludes entries that fail required fields.
   - Constraint impact: upstream contract drift can silently reduce visible strategic districts unless additional telemetry/logging is added.

6. District display ids are name-derived slugs, not guaranteed unique.
   - `districtId` is derived from `project.name`; filtering still uses stable `project.id`.
   - Constraint impact: analytics/test-id semantics keyed by district slug can collide when names normalize to the same slug.

## Validation Coverage Status
Covered now:
- Mapper invariants: `tests/linear-project-contract.spec.ts`.
- Client contract preference/fallback: `tests/linear-sync-contract.spec.ts`.
- Strategic district UI render/filter/progress attributes: `tests/linear-integration.spec.ts`.
- Server project normalization path: `tests/linear-server-projects.spec.ts`.

Gaps still open:
- No pagination tests for >100 issues/projects or >250 project issues.
- No contract parity tests ensuring `app/api/linear` and `src/core/linearServer` produce equivalent strategic outputs.
- No explicit collision test for duplicate normalized district slugs.

## Actionable Implementation Guidance (Ordered)
1. Subtask 2/5: Define and lock cross-surface strategic contract semantics.
   - Treat `LinearProjectContract` as the single strategic contract.
   - Decide whether `/api/projects` should also surface `progressSource` (recommended) or be deprecated for strategic surfaces.

2. Subtask 3/5: Eliminate silent truncation risk.
   - Add cursor pagination (`pageInfo { hasNextPage endCursor }`) to both `app/api/linear/route.ts` and `src/core/linearServer.ts` query paths.
   - Implement bounded pagination guards (max pages + timeout budget) and explicit truncation telemetry when limits are hit.

3. Subtask 3/5: Remove dual-stack drift risk.
   - Extract shared GraphQL fragments/query builders and shared project mapping adaptor in `src/core`.
   - Consume shared primitives from both server stacks to keep project rollups identical.

4. Subtask 4/5: Make district UI logic selector-driven.
   - Extract sorting/filtering/grouping from `BacklogPanel` into reusable selectors (e.g. `src/core/linearSelectors.ts`).
   - Keep project-id as filtering identity; treat district slug as display metadata only.

5. Subtask 5/5: Expand targeted verification.
   - Add pagination contract tests (multi-page fixtures).
   - Add cross-stack parity tests (`/api/linear` mapper output vs `linearServer` output).
   - Add a duplicate-slug scenario test to ensure tab/test-id strategy remains deterministic.

## Definition of Done Signals for SWA-67
- Strategic districts remain contract-driven from `LinearProjectContract` without endpoint-specific semantic drift.
- Progress reporting explicitly conveys source (`linear` vs `issues_fallback`) everywhere strategic progress is shown.
- Sync paths handle datasets larger than current single-page limits without silent loss.
- District filtering remains keyed by stable project identity and is proven by targeted tests.
