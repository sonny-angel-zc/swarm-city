# SWA-67 Subtask 1/11: Linear Project Contract + Mapping Rules

## Goal
Confirm and lock the data contract used for strategic project districts from Linear team projects/issues.

## GraphQL Contract
`POST /api/linear` action `list` now requests both:

- `team.issues.nodes[]` with issue-level fields (id, identifier, title, state, project ref, assignee, labels, timestamps)
- `team.projects.nodes[]` with project-level fields (id, name, description, icon, color, state, progress, nested `issues.nodes[].state.type`)

This supports:
- backlog rendering from issue nodes
- strategic district/project aggregation from explicit project nodes (including projects with zero issues)

## Issue State Mapping
Canonical mapping to app status buckets (`todo | in_progress | done`):

- `started`, `in_progress`, `in progress` -> `in_progress`
- `completed`, `canceled`, `cancelled`, `done` -> `done`
- `triage`, `backlog`, `unstarted`, `todo`, unknown/missing -> `todo`

## Project Progress Rule
Canonical rule in `mapLinearProjectContract`:

1. Use Linear project progress when available (`project.progress`, normalized to 0-1).
2. Fallback to issue-derived ratio when needed: `doneIssues / totalIssues`.
3. Guard for zero issues in fallback mode: when `totalIssues === 0`, progress is `0`.

`progressSource` semantics:
- `linear`: progress came from Linear project progress
- `issues_fallback`: progress came from the issue-ratio fallback rule

## District Identity + No Project
- Project district identity is derived from project name (`districtId` slug)
- Issues without project association are grouped into a synthetic `No Project` contract entry with id `__no_project__`
- The synthetic entry keeps stable district id `unassigned` to preserve existing filtering and selectors

## Actionable Implementation Guidance
1. Keep `src/core/linearProject.ts` as the canonical mapping layer:
   - `normalizeIssueState()` and `toIssueBreakdownBucket()` own issue state normalization.
   - `mapLinearProjectContract()` owns project progress source selection (`linear` first, `done/total` fallback + zero-issue guard) and synthetic no-project behavior.
   - Project issue breakdown output keys are canonicalized to `todo`, `in_progress`, and `done`.
2. Treat `LinearProjectContract` in `src/core/types.ts` as the shared shape across:
   - server ingestion (`app/api/linear/route.ts`, `src/core/linearServer.ts`)
   - client sync/store (`src/core/linearSync.ts`, `src/core/store.ts`)
   - UI consumers (`BacklogItem.project*` fields and strategic district views)
   - When API contracts are partial, backlog issue project linkage (`projectId`, `projectName`) should fall back to issue-level project identity.
3. Guard the contract with unit coverage in `tests/linear-project-contract.spec.ts` for:
   - todo/in_progress/done normalization
   - linear progress normalization + done/total fallback calculation with zero-issue guard
   - no-project synthetic identity (`id=__no_project__`, `name=No Project`)
