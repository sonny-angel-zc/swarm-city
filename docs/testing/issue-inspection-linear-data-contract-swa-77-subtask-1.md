# SWA-77 Subtask 1/7: Linear Data Contract for Issue Inspection

## Goal

Define and lock the data contract for all information displayed when a task building is clicked
in the city canvas. Covers required fields, Linear API mapping, sync/refresh behavior, and
source-of-truth constraints.

---

## Contract Type

**Canonical TypeScript type**: `IssueInspectionContract` in `src/core/types.ts`

The type is a pure derived view — assembled from existing store state at selection time with no
new API calls. Every field traces to one of four store slices:

| Source key | Store slice | Populated by |
|------------|-------------|--------------|
| A | `store.backlog: BacklogItem[]` | `linearSync.syncFromLinear()` via `/api/linear action=list` |
| B | `store.linear.projects: LinearProjectContract[]` | `linearSync.syncFromLinear()` via `/api/linear action=list` |
| C | `store.agents[role].log: LogEntry[]` | Store SSE event processing (`agent_output`, `agent_done`, `agent_error`) |
| D | `store.autonomous: AutonomousStatus` | `/api/autonomous` status polling |
| E | `store.linear: LinearSyncState` | `store.syncLinear()` |

---

## Field Inventory and API Mapping

### Issue Identity (source: A — BacklogItem)

| Contract field | BacklogItem field | Linear GraphQL field | Notes |
|----------------|-------------------|---------------------|-------|
| `issueId` | `id` | `issue.identifier` (e.g. "SWA-42") | Primary key; used as `selectedTaskBuildingId` |
| `linearId` | `linearId` | `issue.id` (UUID) | Null for local/stub items |
| `linearUrl` | `linearUrl` | `issue.url` | Deep link to Linear app; null for local |
| `title` | `title` | `issue.title` | Display title |
| `identifier` | Resolution order (see below) | — | Panel header display |

**`identifier` resolution**:
1. `BacklogItem.id` when it matches the pattern `[A-Z]+-\d+` (Linear identifier)
2. `BacklogItem.linearId?.slice(0, 8)` as a short UUID fallback
3. `issueId.slice(0, 8)` as last resort

### Status & Priority (source: A — BacklogItem)

| Contract field | BacklogItem field | Linear GraphQL field | Mapping rule |
|----------------|-------------------|---------------------|--------------|
| `status` | `status` | `issue.state.type` | `normalizeIssueState(stateType)` in `linearProject.ts` |
| `statusLabel` | `statusLabel` | `issue.state.name` | Raw display label; null for local items |
| `priority` | `priority` | `issue.priority` | `mapPriority()` in `linearSync.ts` |
| `source` | `source` | — | `'linear'` for synced, `'local'`/`'linear_stub'` otherwise |
| `labels` | `labels` | `issue.labels.nodes[].name` | Array of label name strings; empty when none |

**Status normalization** (canonical in `linearProject.normalizeIssueState()`):

| Linear state type | App bucket |
|-------------------|------------|
| `started`, `in_progress`, `in progress` | `in_progress` |
| `completed`, `canceled`, `cancelled`, `done` | `done` |
| `triage`, `backlog`, `unstarted`, `todo`, unknown/missing | `todo` |

**Priority mapping** (canonical in `linearSync.mapPriority()`):

| Linear priority value | App priority |
|----------------------|--------------|
| 1 (urgent) | P0 |
| 2 (high) | P1 |
| 3 (medium) | P2 |
| 0 (none), 4 (low) | P3 |

### Ownership (source: A — BacklogItem)

| Contract field | BacklogItem field | Linear GraphQL field | Notes |
|----------------|-------------------|---------------------|-------|
| `ownerRole` | `ownerRole` | — | Round-robin assigned at sync time via `pickOwner(i)` |
| `ownerName` | `ownerName` | `issue.assignee.name` | Null when unassigned or not synced |

### Project Context (source: B — LinearProjectContract)

Project data is resolved at panel render time via the district lookup chain:

```
TaskBuilding.districtId
  → DistrictZone.id (from store.districts)
  → LinearProjectContract.districtId (from store.linear.projects)
```

| Contract field | LinearProjectContract field | Notes |
|----------------|-----------------------------|-------|
| `projectId` | `id` | Null when districtId = `'unassigned'` |
| `projectName` | `name` | `'No Project'` when unassigned |
| `projectStatus` | `status` | Derived from issue breakdown counts |
| `projectProgress` | `progress` | 0-1 (see progress source rules below) |
| `projectProgressSource` | `progressSource` | `'linear'` or `'issues_fallback'` |
| `projectIssueBreakdown` | `issueBreakdown` | `{ todo, in_progress, done }` counts |
| `projectDescription` | `description` | Null when absent or unassigned |

**Progress source rules** (canonical in `linearProject.mapLinearProjectContract()`):

1. Use `LinearProjectContract.progress` when derived from Linear's own `project.progress` field
   (`progressSource = 'linear'`, normalized 0-100 → 0-1 if needed).
2. Fallback to `doneIssues / totalIssues` when Linear progress unavailable
   (`progressSource = 'issues_fallback'`).
3. Zero-issue guard: when `totalIssues === 0`, progress is `0` regardless of source.

**Unassigned district fallback** (zero-state):

When `districtId = 'unassigned'` (no Linear project), populate with:
```
projectId: null
projectName: 'No Project'
projectStatus: 'todo'
projectProgress: 0
projectProgressSource: 'issues_fallback'
projectIssueBreakdown: { todo: 0, in_progress: 0, done: 0 }
projectDescription: null
```

### Autonomous Pipeline Context (source: D — AutonomousStatus)

| Contract field | Source | Notes |
|----------------|--------|-------|
| `isSwarmTarget` | `BacklogItem.isSwarmTarget` | True when autonomous loop is currently processing the issue |
| `swarmTaskId` | `BacklogItem.swarmTaskId` | Orchestrator task ID; null when not swarm target |
| `autonomousCompletedAt` | `AutonomousStatus.completedTasks[].completedAt` | Match by `completedTasks[i].issueId === linearId`. Null if not completed. |

### Agent Activity History (source: C — Agent.log)

| Contract field | Source | Notes |
|----------------|--------|-------|
| `agentLog` | `store.agents[ownerRole].log` | Last 8 entries, newest-first. Empty array when `isSwarmTarget = false` or log is empty. |

**`agentLog` population rule**:
```
agentLog = isSwarmTarget
  ? agents[ownerRole].log.slice(-8).reverse()
  : []
```

Each `LogEntry` shape:
```typescript
{ timestamp: number; message: string; type: 'info' | 'output' | 'error' | 'request' }
```

### Sync Metadata (source: E — LinearSyncState)

| Contract field | Source | Notes |
|----------------|--------|-------|
| `syncedAt` | `store.linear.lastSyncAt` | Epoch ms; null before first sync |
| `updatedAt` | `BacklogItem.updatedAt` | Epoch ms from `new Date(issue.updatedAt).getTime()` |

---

## Assembly Function Contract

The `IssueInspectionContract` for a given `issueId` is assembled as follows
(pseudocode for future `buildIssueInspectionContract()` utility):

```typescript
function buildIssueInspectionContract(
  issueId: string,
  store: { backlog, linear, agents, autonomous, districts }
): IssueInspectionContract | null {
  const item = store.backlog.find(b => b.id === issueId);
  if (!item) return null;

  const taskBuilding = store.taskBuildings.find(tb => tb.issueId === issueId);
  const districtId = taskBuilding?.districtId ?? 'unassigned';
  const project = store.linear.projects.find(p => p.districtId === districtId) ?? null;

  const completedEntry = store.autonomous.completedTasks
    .find(t => t.issueId === item.linearId);

  const agentLog = item.isSwarmTarget
    ? (store.agents[item.ownerRole]?.log ?? []).slice(-8).reverse()
    : [];

  return {
    issueId: item.id,
    linearId: item.linearId ?? null,
    linearUrl: item.linearUrl ?? null,
    title: item.title,
    identifier: item.id,           // caller resolves display fallback
    status: item.status,
    statusLabel: item.statusLabel ?? null,
    priority: item.priority,
    source: item.source,
    labels: item.labels ?? [],
    ownerRole: item.ownerRole,
    ownerName: item.ownerName ?? null,
    projectId: project?.id ?? null,
    projectName: project?.name ?? 'No Project',
    projectStatus: project?.status ?? 'todo',
    projectProgress: project?.progress ?? 0,
    projectProgressSource: project?.progressSource ?? 'issues_fallback',
    projectIssueBreakdown: project?.issueBreakdown ?? { todo: 0, in_progress: 0, done: 0 },
    projectDescription: project?.description ?? null,
    isSwarmTarget: item.isSwarmTarget ?? false,
    swarmTaskId: item.swarmTaskId ?? null,
    autonomousCompletedAt: completedEntry?.completedAt ?? null,
    agentLog,
    syncedAt: store.linear.lastSyncAt,
    updatedAt: item.updatedAt,
  };
}
```

---

## Sync / Refresh Behavior

### Trigger conditions

| Trigger | Action |
|---------|--------|
| User opens app (initial mount) | `store.syncLinear()` runs automatically |
| User clicks "Sync" in sidebar | `store.syncLinear()` called manually |
| Autonomous loop completes an issue | `store.syncLinear()` triggered to reflect state change |
| Task building selection changes | **No sync triggered** — panel reads from current store state |
| Panel is open and displayed | **No polling** — panel is purely derived from store snapshot |

### Refresh staleness policy

- Panel content reflects store state at render time (reactive via Zustand subscriptions).
- When `store.linear.syncing = true`, the panel may show stale data from the previous sync.
- `syncedAt` field exposes `lastSyncAt` so the UI can display "Last synced X minutes ago".
- **No auto-refresh timer** is added for the panel; sync frequency is controlled by existing
  Linear sync strategy (manual or loop-triggered).

### Source-of-truth constraints

1. **Linear is the source of truth for all issue and project fields.**
   Local mutations (e.g. `setBacklogItemStatus`) are reflected in BacklogItem immediately but
   are considered optimistic until the next sync confirms them from Linear.

2. **The store is the source of truth for agent activity history.**
   `Agent.log` entries are written by SSE events during swarm execution. They are not persisted
   to Linear and are lost on page reload. The panel shows in-memory activity only.

3. **`IssueInspectionContract` is always derived, never stored.**
   It must not be stored in Zustand state. Compute it on demand from store fields.

4. **Project linkage is via `districtId`, not `projectId`.**
   `BacklogItem.projectId` may differ from `LinearProjectContract.id` in edge cases (synthetic
   no-project entries). Always resolve via the district chain:
   `TaskBuilding.districtId → DistrictZone.id → LinearProjectContract.districtId`.

5. **Autonomous pipeline fields are advisory, not authoritative.**
   `isSwarmTarget` reflects the store's last-known swarm state; it can lag behind Linear's
   actual status by up to one sync cycle. Do not use it as a blocking gate.

---

## Required Linear GraphQL Fields

The following fields must be present in the `listIssues` query (action `list`) to populate
`IssueInspectionContract`. All are already requested in `linearServer.ts:QUERIES.listIssues`:

```graphql
issue {
  id              # → linearId
  identifier      # → issueId, identifier
  title           # → title
  url             # → linearUrl
  priority        # → priority (via mapPriority)
  updatedAt       # → updatedAt
  state {
    id
    name          # → statusLabel
    type          # → status (via normalizeIssueState)
  }
  project {
    id            # → projectId (via getIssueProjectIdentity)
    name          # → projectName
    description   # → projectDescription
    icon          # → district icon
    color         # → district color
    state         # → projectStatus hint
    progress      # → projectProgress (when progressSource = 'linear')
  }
  labels {
    nodes {
      id
      name        # → labels[]
    }
  }
  assignee {
    name          # → ownerName
  }
}
```

The `listProjects` query (also in `action=list`) provides project-level issue counts for
`projectIssueBreakdown` and authoritative `progress`:

```graphql
project {
  id
  name
  description
  icon
  color
  state
  progress      # authoritative; progressSource = 'linear' when present
  issues(first: 50) {
    nodes {
      id
      identifier
      state { type }   # for issueBreakdown bucket counts
    }
  }
}
```

---

## Constraints

1. **No new GraphQL queries on building click.** All data must come from the most recent sync.
2. **`IssueInspectionContract` is not a stored Zustand slice** — it is assembled on demand.
3. **Progress is always clamped to [0, 1]** before being written to `projectProgress`.
4. **`agentLog` is capped at 8 entries** (newest-first) to keep the panel compact.
5. **All optional BacklogItem fields default to null/empty** (`ownerName`, `statusLabel`,
   `labels`, `linearId`, `linearUrl`, `swarmTaskId`).
6. **Zero-issue guard**: when `projectIssueBreakdown` totals 0, `projectProgress = 0`
   and `progressSource = 'issues_fallback'`.

---

## Actionable Implementation Guidance for Subtasks 2-7

- **Subtask 2** (store): Add `selectedTaskBuildingId: string | null` and `selectTaskBuilding()`.
  This is the primary key that triggers `buildIssueInspectionContract()`.
- **Subtask 3** (canvas click): Hit-test task buildings, call `selectTaskBuilding(issueId)`.
- **Subtask 4** (highlight): Draw selection ring using `districtColor` from district zone.
- **Subtask 5** (panel): Implement `IssueDetailPanel`. Call `buildIssueInspectionContract()`
  with current store state. Render all fields per `IssueInspectionContract` shape.
  Apply `data-testid` stable selectors from `building-interaction-requirements-swa-77-subtask-1.md`.
- **Subtask 6** (escape): Additive Escape handler clears `selectedTaskBuildingId` first.
- **Subtask 7** (E2E): Assert panel fields match `IssueInspectionContract` values in mock sync state.

---

## Validation

```bash
# TypeScript contract validity
npx tsc --noEmit

# Doc registry consistency
node scripts/validate-docs-registry.mjs
```
