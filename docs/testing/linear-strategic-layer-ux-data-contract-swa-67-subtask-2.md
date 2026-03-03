# SWA-67 Subtask 2/5: Strategic Layer UX/Data Contract

## Scope

Define the interaction model, UI copy contract, and UI/data mapping decisions for integrating Linear projects as the strategic district layer across backlog and progress surfaces.

## Interaction Model

- Primary panel structure inside Backlog:
  - Strategic district strip (top): project-level cards from `linear.projects`.
  - Issue list (bottom): canonical status groups from `backlog`.
- District selection behavior:
  - `All districts` chip is selected by default.
  - Selecting a district card filters visible backlog issues to matching `projectId`.
  - Selecting `Unassigned` filters to issues with no `projectId`.
  - Selecting an already-selected district clears to `All districts`.
- Status grouping behavior remains canonical:
  - Filter applies before grouping.
  - Existing status buckets (`in_progress`, `todo`, `blocked`, `done`) stay unchanged.
  - Filtering never mutates backlog item status.
- Keyboard/accessibility behavior:
  - District cards act as a single-select tablist (`role="tablist"` + `role="tab"`).
  - Left/Right arrows move focus between district tabs.
  - `Enter`/`Space` activates focused district tab.

## Copy Contract

Copy should emphasize strategic ownership first, execution queue second.

| Surface | Contract copy |
| --- | --- |
| Strategic section title | `Strategic Districts` |
| Strategic section helper text | `Track project momentum and focus the queue by district.` |
| Default filter chip | `All districts` |
| Unassigned district label | `Unassigned` |
| Per-card issue count | `N issues` |
| Progress source badge (`issues_fallback`) | `Issue-derived` |
| Progress source badge (`linear`) | `Linear-estimated` |
| Empty filtered queue state | `No issues in this district yet.` |
| Backlog filter summary | `Queue focus: {districtName} • Showing {visibleCount} of {totalCount} issues` |

## UI/Data Mapping Contract

Strategic rendering and filtering must be deterministic and machine-verifiable:

| UI element | Source field(s) | Notes |
| --- | --- | --- |
| District cards | `linear.projects[]` | Sorted by status, then progress desc, then name asc |
| Card identity | `project.id`, `project.districtId` | Stable key and selector anchors |
| Card title | `project.name` | Use `Unassigned` copy only when `isUnassigned=true` |
| Card status pill | `project.status` | `To Do`, `In Progress`, `Done` |
| Card issue breakdown microcopy | `project.issueBreakdown` | `T{todo} I{in_progress} D{done}` |
| Card progress bar | `project.progress` | Display as percent (0-100), clamped |
| Card progress source badge | `project.progressSource` | Copy from contract table above |
| Issue filter binding | `backlogItem.projectId` | Include unassigned when `projectId` missing |
| Filter summary | `visibleBacklog.length`, `backlog.length` | Shown whenever district filter is active |

Required state attributes for deterministic E2E assertions:

| Attribute | Meaning |
| --- | --- |
| `data-testid="strategic-districts"` | Strategic districts section root |
| `data-testid="district-tab-{districtId}"` | District tab target |
| `data-district-selected="true/false"` | Whether tab is active |
| `data-district-progress-source` | `issues_fallback` or `linear` |
| `data-district-status` | Strategic project status (`todo`, `in_progress`, `done`) |
| `data-district-progress` | Rounded progress percent |
| `data-district-issue-breakdown` | `todo/in_progress/done` counts |
| `data-backlog-filter-project-id` | Active project filter id or `all`/`unassigned` |
| `data-backlog-visible-count` | Count of backlog rows after filter |

## Edge Cases

- Projects with zero issues still render cards and show `0 issues`.
- `progressSource=linear` is mandatory visualized when project has no issue-derived ratio.
- `blocked` backlog issues remain visible in filtered queue if they match district; no special district-level blocked metric is implied.
- If `linear.projects` is empty, strategic section shows: `No project districts available from Linear sync.`
- Every district tab includes an `aria-label` with district name, strategic status, issue count, and progress percentage.
- Active tab controls backlog list region via `aria-controls="strategic-backlog-list"`.

## Pass/Fail Rules for SWA-67 Subtasks 3-5

- Pass:
  - Strategic district cards render from `linear.projects`, including unassigned when present.
  - District selection updates filtered backlog rows without changing canonical status mapping.
  - Progress source badge copy matches `progressSource` contract for every visible card.
  - Required `data-*` attributes and ARIA tab semantics stay in sync with selected state.
- Fail:
  - Missing unassigned district when unprojected issues exist.
  - Any mismatch between selected district and filtered backlog set.
  - Missing/incorrect progress source copy for cards.
  - Contradictory ARIA/data attributes for district selection state.
