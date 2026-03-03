# SWA-77 Subtask 1/8: Building Interaction and Data Requirements

## Goal

Translate SWA-77 ("Click on any issue building to highlight it and show project details") into
acceptance criteria, event flows, and data contracts for selection, deselection, panel content,
agent activity visibility, and test outcomes — sourced from the current Linear/store data pipeline.

---

## Code-Verified Baseline

1. Task buildings exist in store but are not yet clickable.
- File: `src/core/districtLayout.ts`
- `TaskBuilding` is placed in `taskBuildings: TaskBuilding[]` by `placeTaskBuildings()`.
- `TaskBuilding` fields: `issueId`, `identifier`, `title`, `state`, `gridX`, `gridY`, `districtId`, `color`, `height`.
- File: `src/components/CityCanvas.tsx` (lines 1316-1326)
- `handleClick` only tests against `BUILDING_CONFIGS` (the 7 agent buildings). Task buildings receive no click detection today.

2. The only clickable building selection in the store is agent-scoped.
- File: `src/core/store.ts` (line 71, 107, 249, 297)
- Store has `selectedAgent: AgentRole | null` and `selectAgent(role)` action.
- No `selectedTaskBuildingId` or equivalent exists.

3. Issue data flows from Linear through backlog into task buildings.
- File: `src/core/types.ts` (lines 226-247)
- `BacklogItem` carries: `id`, `title`, `ownerRole`, `status`, `priority`, `source`, `linearId`, `linearUrl`, `ownerName`, `statusLabel`, `labels`, `projectId`, `projectName`, `projectDistrictId`, `projectProgress`, `projectProgressSource`, `isSwarmTarget`, `swarmTaskId`.

4. Project data is available in store as `LinearProjectContract[]`.
- File: `src/core/types.ts` (lines 211-224)
- `LinearProjectContract` carries: `id`, `name`, `description`, `progress` (0-1), `issueBreakdown` (todo/in_progress/done counts), `status`, `progressSource`, `totalIssues`, `doneIssues`, `districtId`, `color`, `icon`.

5. District zones link projects to map quadrants.
- File: `src/core/districtLayout.ts` (lines 13-20)
- `DistrictZone` has: `id`, `name`, `color`, `gridBounds`, `tiles`, `buildingSlots`.
- `TaskBuilding.districtId` matches `DistrictZone.id` which matches `LinearProjectContract.districtId`.

6. Agent activity logs are available in store.
- File: `src/core/types.ts` (lines 21-32)
- `Agent.log: LogEntry[]` — each entry has `timestamp`, `message`, `type`.
- `BacklogItem.ownerRole` links an issue to the agent whose log is relevant.
- `BacklogItem.isSwarmTarget` flags issues actively being worked by the swarm.

7. InspectPanel is the existing panel pattern for agent selection.
- File: `src/components/InspectPanel.tsx`
- Mounts when `selectedAgent !== null`; renders agent detail, current task, log, and message input.
- Panel pattern is positioned `absolute bottom-16 left-4 w-96`.

8. Render pipeline has safe insertion slots.
- File: `src/core/cityCanvasRenderPipeline.ts`
- Task buildings are drawn in the `agent_buildings` pass (same pass group as decorative buildings).
- A selection highlight overlay should be inserted after buildings but before `day_night_overlay`.
- The `cityLifeOverlay` insertion slot (`after: 'agent_buildings', before: 'fountain_spray'`) is the correct location.

---

## Acceptance Criteria

### AC-1: Task Building Selection
- Clicking a task building sets `selectedTaskBuildingId` to that building's `issueId`.
- A selection highlight (ring or glow) renders around the selected building in the city canvas.
- If an agent building was selected, it is deselected (`selectedAgent → null`) when a task building is selected.
- Selection is single: clicking a second task building replaces the previous selection.

### AC-2: Task Building Deselection
- Clicking an empty canvas area (no hit on any building) clears `selectedTaskBuildingId → null`.
- Clicking the currently selected task building again clears the selection (toggle behavior).
- Pressing Escape clears the selection.
- Clicking an agent building sets `selectedAgent` and clears `selectedTaskBuildingId`.

### AC-3: Issue Detail Panel Visibility
- A detail panel (`IssueDetailPanel`) is visible when and only when `selectedTaskBuildingId !== null`.
- Panel is hidden immediately when selection is cleared.
- Panel does not block keyboard Escape from reaching the deselect handler.

### AC-4: Issue Detail Panel Content (from BacklogItem)
- Panel displays: issue identifier (`linearId` or truncated `id`), title, status with label, priority badge.
- Panel displays: owner role name, labels array (if any), and a link to `linearUrl` when present.
- Panel displays: `isSwarmTarget` indicator when true.

### AC-5: Project Detail Panel Content (from LinearProjectContract)
- Panel displays: project name, project status, overall progress bar (value from `progress`, 0-1).
- Panel displays: issue breakdown counts (todo / in_progress / done).
- Panel displays: `progressSource` distinction (`linear` vs `issues_fallback`) as a visual badge or footnote.
- Project data is resolved via `TaskBuilding.districtId → LinearProjectContract.districtId`.
- When no matching project exists (unassigned district), panel shows "No Project" with zero-state breakdown.

### AC-6: Agent Activity Visibility
- When `BacklogItem.isSwarmTarget === true`, panel renders the last 8 entries from
  `agents[item.ownerRole].log` in a compact activity sub-section.
- When `isSwarmTarget === false` or no agent log entries exist, the activity sub-section is hidden.
- Log entries display `timestamp` (relative time), `message`, and `type` styling
  (info / output / error / request).

### AC-7: Canvas Highlight Fidelity
- Highlight renders at the same grid position as the task building (`gridX`, `gridY`).
- Highlight does not occlude agent buildings or distort isometric perspective.
- Highlight is removed in the same render pass that processes `selectedTaskBuildingId === null`.
- Highlight uses the district color with elevated opacity, not a hardcoded color.

### AC-8: Performance and Stability
- Click detection for task buildings uses the same screen-space coordinate transform as agent
  building detection (`gridToScreen` + camera offset).
- Task building hit-testing runs after fountain and agent building checks so it does not steal clicks.
- Panel content computation is purely derived from existing store state — no new API calls triggered.

---

## Event Flows

### Flow 1: Select Task Building
```
User clicks canvas
  → handleClick computes (mx, my) from event + camera state
  → Fountain check: no hit
  → Agent building loop: no hit
  → Task building loop: find first TaskBuilding where gridToScreen collision matches
      hit = dx < (TILE_WIDTH/2 + 8) && dy > -8 && dy < (building.height + 20)
  → selectTaskBuilding(building.issueId)
      set({ selectedTaskBuildingId: issueId, selectedAgent: null })
  → Canvas re-renders highlight in cityLifeOverlay slot
  → IssueDetailPanel mounts (or updates)
```

### Flow 2: Deselect by Empty Click
```
User clicks canvas (no building hit)
  → handleClick: fountain miss, agent miss, task building miss
  → selectTaskBuilding(null) AND selectAgent(null)  [already existing behavior for agent]
  → Canvas removes highlight
  → IssueDetailPanel unmounts
```

### Flow 3: Toggle Deselect (same building)
```
User clicks already-selected task building
  → handleClick detects hit, building.issueId === selectedTaskBuildingId
  → selectTaskBuilding(null)
  → Canvas removes highlight; panel unmounts
```

### Flow 4: Escape Deselect
```
User presses Escape (keyboard handler on window or canvas)
  → if selectedTaskBuildingId !== null → selectTaskBuilding(null)
  → else if selectedAgent !== null → selectAgent(null)  [existing behavior preserved]
```

### Flow 5: Agent Building Replaces Task Selection
```
User clicks agent building
  → handleClick detects agent building hit
  → selectAgent(cfg.role) → store also sets selectedTaskBuildingId = null
  → IssueDetailPanel unmounts; InspectPanel mounts
```

### Flow 6: Panel Content Derivation (on each selectedTaskBuildingId change)
```
selectedTaskBuildingId (issueId)
  → taskBuildings.find(b => b.issueId === issueId)   → TaskBuilding
  → backlog.find(i => i.id === issueId)               → BacklogItem
  → districts.find(d => d.id === tb.districtId)       → DistrictZone
  → linear.projects.find(p => p.districtId === dz.id) → LinearProjectContract | null
  → agents[backlogItem.ownerRole]                      → Agent (for log if isSwarmTarget)
  → Compose IssueDetailView for panel render
```

---

## Data Contracts

### New Store Fields

```typescript
// Add to SwarmStore state
selectedTaskBuildingId: string | null;  // matches TaskBuilding.issueId

// Add to SwarmStore actions
selectTaskBuilding: (issueId: string | null) => void;
```

### Mutual Exclusion Invariant

```typescript
// selectTaskBuilding implementation
selectTaskBuilding: (issueId) => set({ selectedTaskBuildingId: issueId, selectedAgent: null }),

// selectAgent implementation (existing — add task building clear)
selectAgent: (role) => set({ selectedAgent: role, selectedTaskBuildingId: null }),
```

### Derived View Type (computed, not stored)

```typescript
type IssueDetailView = {
  // From TaskBuilding
  issueId: string;
  identifier: string;       // linearId ?? id.slice(0, 8)
  buildingState: TaskBuildingState;   // 'empty' | 'construction' | 'complete'
  districtId: string;
  districtColor: string;

  // From BacklogItem
  title: string;
  status: BacklogStatus;            // 'todo' | 'in_progress' | 'blocked' | 'done'
  statusLabel: string | undefined;
  priority: BacklogPriority;        // 'P0' | 'P1' | 'P2' | 'P3'
  ownerRole: AgentRole;
  ownerName: string | undefined;
  labels: string[];
  linearUrl: string | undefined;
  isSwarmTarget: boolean;
  swarmTaskId: string | undefined;
  source: BacklogSource;

  // From LinearProjectContract (via districtId) — nullable when unassigned
  projectId: string | null;
  projectName: string;              // 'No Project' when unassigned
  projectStatus: StrategicProjectStatus;
  projectProgress: number;          // 0-1
  projectProgressSource: ProjectProgressSource;
  projectIssueBreakdown: { todo: number; in_progress: number; done: number };
  projectDescription: string | null;

  // From Agent.log (when isSwarmTarget)
  agentLog: LogEntry[];             // last 8 entries, empty array when not swarm target
};
```

### Canvas Hit Test Contract

```typescript
// Task building hit detection (to be added to handleClick after agent building loop)
// Uses same coordinate space as agent buildings
for (const tb of taskBuildings) {
  const pos = gridToScreen(tb.gridX, tb.gridY);
  const dx = Math.abs(mx - pos.x);
  const dy = my - (pos.y - tb.height);
  if (dx < TILE_WIDTH / 2 + 8 && dy > -8 && dy < tb.height + 20) {
    if (selectedTaskBuildingId === tb.issueId) {
      selectTaskBuilding(null);  // toggle off
    } else {
      selectTaskBuilding(tb.issueId);
    }
    return;
  }
}
```

### Panel Stable Selectors (for E2E tests)

```
data-testid="issue-detail-panel"              — panel root (present when selected)
data-testid="issue-detail-identifier"         — identifier text
data-testid="issue-detail-title"              — issue title
data-testid="issue-detail-status"             — status badge
data-testid="issue-detail-priority"           — priority badge
data-testid="issue-detail-owner"              — owner role chip
data-testid="issue-detail-project-name"       — project name heading
data-testid="issue-detail-project-progress"   — progress bar (aria-valuenow = progress × 100)
data-testid="issue-detail-breakdown"          — issue count breakdown (todo/in_progress/done)
data-testid="issue-detail-agent-log"          — agent activity section (present only when isSwarmTarget)
data-testid="issue-detail-linear-link"        — external link to Linear (present only when linearUrl set)
data-issue-id={issueId}                       — on panel root for deterministic selection assertions
data-district-id={districtId}                 — on panel root for district coupling assertions
```

---

## Hard Constraints

1. Task building click detection is added after fountain and agent building checks in `handleClick`.
- Prevents stealing fountain coin-toss and agent interactions; preserves existing behavior.

2. `selectedAgent` and `selectedTaskBuildingId` are mutually exclusive at the store level.
- Enforced in both `selectAgent` and `selectTaskBuilding` actions, not in component logic.

3. Selection highlight must use the `cityLifeOverlay` insertion slot (after `agent_buildings`, before `fountain_spray`).
- Must not modify `drawBuilding` logic (hard constraint from SWA-68 pipeline audit).
- Highlight drawn as a canvas ring/glow at the building's isometric base; not DOM overlay.

4. Panel content is derived entirely from existing store state.
- No new Linear API calls triggered by selection; data must be available from last sync.
- Missing data (null project, empty log) is handled with zero-state fallbacks, not errors.

5. `IssueDetailPanel` must not interfere with existing `InspectPanel`.
- The two panels have independent mount conditions; they cannot both be visible simultaneously.
- Position the new panel so it does not collide with `InspectPanel` when both could be triggered rapidly.

6. Escape key handler must be additive, not a replacement.
- If existing Escape handling is present for `InspectPanel`, extend it in priority order:
  task building first, then agent.

7. All stable selectors use `data-testid` attributes, not CSS class names or text content.
- Required for Playwright reliability per project testing convention.

---

## Test Outcomes (Definition of Done Gates)

### Interaction Gate
- `IT-SEL-01`: Click task building → `selectedTaskBuildingId` set, panel visible with correct `data-issue-id`.
- `IT-SEL-02`: Click empty area → `selectedTaskBuildingId` null, panel absent.
- `IT-SEL-03`: Click same building twice → panel absent after second click.
- `IT-SEL-04`: Escape key clears active task building selection.
- `IT-SEL-05`: Clicking agent building clears task building selection, shows InspectPanel.

### Panel Content Gate
- `IT-PNL-01`: Panel identifier text matches `LinearProjectContract` or `BacklogItem.linearId`.
- `IT-PNL-02`: Panel progress bar `aria-valuenow` matches `LinearProjectContract.progress × 100` (±1).
- `IT-PNL-03`: Issue breakdown counts (todo/in_progress/done) match `issueBreakdown` from contract.
- `IT-PNL-04`: `progressSource` indicator is present and matches `linear` or `issues_fallback`.
- `IT-PNL-05`: Panel hidden when `selectedTaskBuildingId` is null.

### Agent Activity Gate
- `IT-LOG-01`: Agent activity section present when `isSwarmTarget === true`.
- `IT-LOG-02`: Agent activity section absent when `isSwarmTarget === false`.
- `IT-LOG-03`: Activity entries are ordered newest-first with at most 8 entries visible.

### Exclusivity Gate
- `IT-EXC-01`: Selecting task building while agent is selected clears agent; `InspectPanel` absent.
- `IT-EXC-02`: Selecting agent while task building is selected clears task building; `IssueDetailPanel` absent.

### Regression Gate
- `IT-REG-01`: Fountain coin-toss click still works (no task building collision detected at fountain center).
- `IT-REG-02`: Agent building click detection unchanged (same collision formula, same precedence).
- `IT-REG-03`: Pan/drag does not trigger selection (existing `dragging` guard preserved).

---

## Ordered Implementation Guidance for Subtasks 2-8

1. **Subtask 2**: Add `selectedTaskBuildingId` and `selectTaskBuilding` to store with mutual exclusion.
   - Update `selectAgent` to clear `selectedTaskBuildingId`.
   - No UI changes yet; store is the contract anchor.

2. **Subtask 3**: Add task building hit detection in `CityCanvas.handleClick`.
   - Insert after agent building loop, before final `selectAgent(null)` fallback.
   - Use the hit formula from the canvas hit test contract above.

3. **Subtask 4**: Add selection highlight canvas pass.
   - Insert after `agent_buildings` pass using the `cityLifeOverlay` slot.
   - Draw ring/glow at the selected `TaskBuilding` grid position using district color.

4. **Subtask 5**: Implement `IssueDetailPanel` component.
   - Mounts when `selectedTaskBuildingId !== null`.
   - Derives `IssueDetailView` from store state using the lookup chain in Flow 6.
   - Apply all `data-testid` stable selectors from the panel contract above.

5. **Subtask 6**: Add Escape key handler for task building deselection.
   - Additive: task building escape runs before existing agent escape path.

6. **Subtask 7**: Add targeted Playwright E2E assertions.
   - Cover all `IT-SEL-*`, `IT-PNL-*`, `IT-LOG-*`, `IT-EXC-*`, `IT-REG-*` gates.
   - Use mock Linear sync state (same pattern as existing linear-* tests) for stable data.

7. **Subtask 8**: Review and close — verify all ACs pass, no regressions, registry up to date.

---

## Validation Plan

1. Registry and docs consistency (run after each subtask that modifies planRegistry.ts):
   - `node scripts/validate-docs-registry.mjs`

2. Targeted E2E (subtask 7 deliverable):
   - `npx playwright test tests/building-interaction.spec.ts --reporter=line`

3. Full smoke suite (regression guard):
   - `npm run test:smoke`
