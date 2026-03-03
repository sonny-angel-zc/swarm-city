# SWA-67 Subtask 1/5: Research Constraints for Linear Strategic Layer

## Goal
Audit architecture and runtime constraints for integrating Linear projects as the strategic layer (city districts, progress tracking, backlog organization), and produce implementation-ready guidance for SWA-67 subtasks 2-5.

## Code-Verified Baseline

1. Strategic district UX is already wired in backlog UI.
- File: `src/components/BacklogPanel.tsx`
- `linear.projects` drives district tabs.
- Backlog filtering is keyed by stable `projectId` (`all`, concrete project id, `__no_project__`).
- Deterministic UI hooks already exist: `data-testid="strategic-districts"`, `data-testid="district-tab-{districtId}"`, `data-district-status`, `data-district-progress-source`, `data-backlog-filter-project-id`.

2. Strategic project mapping has a canonical mapper.
- File: `src/core/linearProject.ts`
- `mapLinearProjectContract` owns:
  - progress normalization
  - progress source (`linear` vs `issues_fallback`)
  - district id derivation
  - synthetic unassigned project behavior (`__no_project__`, `unassigned`)
- Unknown or missing issue state types intentionally fall back to `todo` via `toIssueBreakdownBucket`.

3. Client sync already supports contract-first ingestion.
- File: `src/core/linearSync.ts`
- `syncFromLinear` prefers `result.contracts.projects` when available.
- If API contract is missing, client derives from raw `team.projects` + `team.issues`.

4. Strategic contract type is shared and explicit.
- File: `src/core/types.ts`
- `LinearProjectContract` includes `progress`, `status`, `progressSource`, `issueBreakdown`, `districtId`, and unassigned identity fields.

5. Two server-side integration stacks still exist.
- API route path: `app/api/linear/route.ts` (returns `contracts.projects`).
- Core server path: `src/core/linearServer.ts` (separate parsing/query stack).

## Hard Constraints (Current)

1. Query caps and backlog caps can silently drop scope.
- `app/api/linear/route.ts`: `issues(first: 50)`, `projects(first: 20)`, project `issues(first: 50)`.
- `src/core/linearServer.ts`: same `50/20/50` bounds.
- `src/core/store.ts` in `syncBacklog`: merged backlog is sorted then truncated to `100` entries.
- Constraint impact: larger teams can lose project/issues visibility with no explicit truncation signal.

2. Team scope is hardcoded.
- `TEAM_ID` in `src/core/linearSync.ts` and `LINEAR_TEAM_ID` in `src/core/linearServer.ts` are fixed constants.
- Constraint impact: no workspace/team switch without code changes.

3. Linear state cache has no invalidation.
- `cachedStates` in `src/core/linearSync.ts` persists for process lifetime.
- Constraint impact: status transitions can drift from live Linear state configuration.

4. Progress semantics diverge across endpoints.
- Strategic contract supports source-aware progress (`progressSource`).
- `app/api/projects/route.ts` exposes issue-derived `progressPercentage` only.
- Constraint impact: different UI surfaces can display conflicting progress narratives.

5. Contract parsing is strict and drop-based.
- `parseProjectsFromApiContract` in `src/core/linearSync.ts` drops malformed entries (`return []`) without telemetry.
- Constraint impact: upstream drift can hide districts with no operator-visible warning.

6. District display identity is slug-from-name and not uniqueness-safe.
- `districtId` is slugified from `project.name` in `src/core/linearProject.ts`.
- Backlog filtering remains correct because it uses `project.id`.
- Constraint impact: duplicate normalized names can collide for selectors/analytics keyed by `districtId`.

7. Verified contract drift already exists in repo artifacts.
- Runtime query limits are `50/20/50`.
- `tests/linear-server-projects.spec.ts` still asserts `projects(first: 100)` and `issues(first: 250)`.
- Constraint impact: current test intent and production behavior are out of sync.

## Architecture Invariants To Preserve

1. Strategic filtering identity must remain `project.id`-based.
- Never switch backlog filtering to `districtId`.

2. Unassigned work must stay first-class.
- Preserve synthetic project identity: `id=__no_project__`, `districtId=unassigned`.

3. Canonical issue buckets remain `todo | in_progress | done` for project rollups.
- Keep mapping centralized in `src/core/linearProject.ts`.

4. Strategic progress must be source-attributed.
- UI should continue to expose whether progress is `linear` or `issues_fallback`.

## Implementation Guidance (Actionable, Ordered)

1. Subtask 2/5: Lock a single strategic project contract boundary.
- Keep `LinearProjectContract` as canonical strategic contract.
- Decide `/api/projects` role:
  - Strategic endpoint: add `progressSource`, `status`, and preserve source provenance.
  - Non-strategic endpoint: explicitly de-scope from strategic surfaces and docs.

2. Subtask 3/5: Remove server-stack drift before adding features.
- Extract shared query fragments and project-rollup mapping into one core module (for both `app/api/linear/route.ts` and `src/core/linearServer.ts`).
- Keep one query limit/config source of truth.
- Add parity tests so both stacks produce equivalent project contracts for same fixture payload.

3. Subtask 3/5: Introduce bounded pagination + truncation signaling.
- Add cursor pagination for issues/projects/project-issues with `pageInfo { hasNextPage endCursor }`.
- Add hard guards (max pages, max nodes, timeout budget).
- Return explicit truncation metadata (e.g., `contracts.meta.truncated=true`) and surface a telemetry/log warning.

4. Subtask 4/5: Extract strategic selectors from UI component.
- Move sorting/filtering/building district tab view-model out of `BacklogPanel` into pure selectors (example: `src/core/linearSelectors.ts`).
- Keep selection/filter contracts testable without DOM rendering.

5. Subtask 5/5: Close verification gaps.
- Add tests for pagination and truncation metadata behavior.
- Add duplicate-slug project-name fixture and enforce deterministic selector id strategy.
- Add explicit stale-state-cache behavior tests for status updates.
- Update stale query-limit assertions in `tests/linear-server-projects.spec.ts` to current contract (or to shared constants if extracted).

## Validation Coverage Snapshot

Currently covered:
- Mapper semantics: `tests/linear-project-contract.spec.ts`
- Client contract preference/fallback: `tests/linear-sync-contract.spec.ts`
- Strategic UI filtering/status/progress attributes: `tests/linear-integration.spec.ts`
- Server project normalization: `tests/linear-server-projects.spec.ts`

Missing or weak:
- Pagination + truncation behavior
- Cross-stack parity for API route vs core server stack
- Duplicate `districtId` collision behavior
- State-cache invalidation lifecycle

## Definition of Done Signals for SWA-67

1. Strategic layer reads one canonical project contract everywhere.
2. Query limits no longer silently hide work (or truncation is explicit and tested).
3. District filtering remains identity-safe (`project.id`) and deterministic.
4. Progress semantics stay consistent and source-attributed across strategic surfaces.
5. Tests/docs query-limit expectations match runtime implementation.
