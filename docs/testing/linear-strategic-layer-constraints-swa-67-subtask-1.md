# SWA-67 Subtask 1/5: Research Constraints for Linear Strategic Layer

## Goal
Audit current architecture and constraints for integrating Linear projects as the strategic layer (city districts, progress tracking, backlog organization), then define implementation-ready guidance for SWA-67 follow-up subtasks.

## Code-Verified Baseline
1. Strategic district experience already exists in `src/components/BacklogPanel.tsx`.
   - District tabs are built from `linear.projects`.
   - Active backlog filter is keyed by stable `projectId` (`all`, concrete id, `__no_project__`).
   - E2E-stable attributes are present (`data-testid="strategic-districts"`, `data-district-status`, `data-district-progress-source`, `data-backlog-filter-project-id`).

2. Strategic project mapping has a canonical implementation in `src/core/linearProject.ts`.
   - `mapLinearProjectContract` controls progress normalization, progress-source selection, district id derivation, and unassigned project synthesis.
   - Unknown/missing issue states intentionally collapse to `todo` via `toIssueBreakdownBucket`.

3. Client sync prefers server-provided project contracts and falls back safely.
   - `app/api/linear/route.ts` returns `contracts.projects`.
   - `src/core/linearSync.ts` consumes `contracts.projects` first, else derives projects from raw issue/project nodes.

4. Two separate server query stacks still exist for the same project domain.
   - API route stack: `app/api/linear/route.ts`.
   - Core server stack: `src/core/linearServer.ts`.

## Hard Constraints (Current)
1. Query and store truncation are hard-coded.
   - `app/api/linear/route.ts` currently queries `issues(first: 50)`, `projects(first: 20)`, and nested `issues(first: 50)`.
   - `src/core/linearServer.ts` uses the same `50/20/50` caps.
   - `src/core/store.ts` truncates merged backlog to the most recent 100 items in `syncBacklog`.
   - Impact: district/project rollups and backlog view can silently omit work at larger scale.

2. Team scope is fixed to one hardcoded team id.
   - `TEAM_ID` in `src/core/linearSync.ts`.
   - `LINEAR_TEAM_ID` in `src/core/linearServer.ts`.
   - Impact: no workspace/team switch without code changes.

3. Linear state caching has no invalidation lifecycle.
   - `cachedStates` in `src/core/linearSync.ts` is process-lifetime.
   - Impact: status transitions can map against stale state ids after workflow changes.

4. Progress semantics drift across endpoints.
   - Strategic contract (`LinearProjectContract`) carries `progress` and `progressSource`.
   - `app/api/projects/route.ts` exposes only issue-derived `progressPercentage`, dropping `progressSource`.
   - Impact: different surfaces can show conflicting progress for the same project.

5. Contract ingestion is strict and silently drops malformed entries.
   - `parseProjectsFromApiContract` in `src/core/linearSync.ts` returns `[]` for entries with missing required fields.
   - Impact: upstream contract drift can hide districts without explicit operator signal.

6. District display ids are slugified from project name and are not uniqueness-safe.
   - `districtId` is derived from project name; backlog filtering still uses stable `project.id`.
   - Impact: selector/analytics collisions are possible when names normalize to the same slug.

7. Server/query contract drift already shows up in repository artifacts.
   - Existing tests/docs still assert older `100/100/250` query limits while runtime code is `50/20/50`.
   - Impact: SWA-67 work must include contract parity cleanup first to avoid false confidence.

## Validation Coverage Snapshot
Covered:
- Mapper rules: `tests/linear-project-contract.spec.ts`.
- Client contract preference/fallback: `tests/linear-sync-contract.spec.ts`.
- Strategic UI contract and filter behavior: `tests/linear-integration.spec.ts`.
- Server project normalization: `tests/linear-server-projects.spec.ts`.

Missing:
- Pagination behavior and truncation telemetry coverage.
- Cross-stack parity assertions (`/api/linear` mapper output vs `linearServer` output).
- Duplicate district slug collision coverage.
- Explicit stale-state-cache behavior coverage.

## Actionable Implementation Guidance (Ordered)
1. Subtask 2/5: Lock one strategic data contract.
   - Treat `LinearProjectContract` as the only strategic-layer contract.
   - Decide and document whether `/api/projects` is strategic (then add `progressSource`) or non-strategic (then de-scope from strategic UI).

2. Subtask 3/5: Remove query/aggregation drift between stacks before adding features.
   - Extract shared Linear query fragments and project rollup mapper into `src/core`.
   - Make `app/api/linear/route.ts` and `src/core/linearServer.ts` consume the same primitives.
   - Add parity tests that snapshot both outputs against one fixture.

3. Subtask 3/5: Add bounded pagination and explicit truncation signaling.
   - Implement cursor pagination with `pageInfo { hasNextPage endCursor }` for team issues, projects, and project issues.
   - Add hard guards (max pages + time budget) and return a truncation flag/telemetry when limits are reached.

4. Subtask 4/5: Extract strategic selectors from UI component code.
   - Move sorting/filtering/grouping from `BacklogPanel` into pure selectors (e.g., `src/core/linearSelectors.ts`).
   - Keep filtering keyed by `project.id`; use `districtId` only for display/test hooks.

5. Subtask 5/5: Expand deterministic verification.
   - Add tests for multi-page issue/project responses.
   - Add duplicate-slug district cases and enforce deterministic tab id strategy.
   - Add stale-state-cache test coverage for `fetchStates`/status updates.

## Definition of Done Signals for SWA-67
- Strategic layer reads one canonical project contract everywhere.
- Query limits no longer silently hide districts/issues (or truncation is explicit and test-covered).
- District filtering remains identity-safe (`projectId`) and E2E deterministic.
- Progress display semantics are consistent across strategic surfaces and expose source provenance.
