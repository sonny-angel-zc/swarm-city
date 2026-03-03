# SWA-68 Subtask 1/5: Research Constraints for City Visual Upgrade

## Objective

Audit architecture and implementation constraints for upgrading roads, transit, trees, parks, and city life; produce implementation guidance for SWA-68 subtasks 2-5 that is safe against current contracts.

## Code-Verified Baseline (Current Repo)

1. Rendering ownership and pass order
- `src/components/CityCanvas.tsx` owns the entire world draw loop and runtime pass ordering.
- Runtime marker is `data-render-pipeline-version` and must stay in sync with `src/core/cityCanvasRenderPipeline.ts`.
- Current ordered phases in `render()` are:
  - frame/tick update
  - background gradient + stars
  - world transform enter
  - terrain tiles
  - decorative buildings
  - fountain/plaza props + fountain base
  - power-grid underlay (non-economy mode)
  - transit underlay (vehicles)
  - agent buildings
  - city-life overlay/effects (fountain spray + particles + ambient floaters)
  - world transform exit + day/night overlay

2. Simulation ownership
- `src/core/store.ts` owns dynamic simulation via `tick(dt)`.
- `tick(dt)` currently updates `vehicles`, `particles`, and agent context pressure.
- Dynamic lifecycle is time-based (`dt`), not frame-count based.

3. Topology ownership
- `src/core/cityLayout.ts` is the source-of-truth for map semantics:
  `ROAD_TILES`, `MAIN_ROAD_TILES`, `SECONDARY_CONNECTOR_TILES`, `SIDEWALK_BORDER_TILES`, `WATER_TILES`, `PARK_CORNER_TILES`, `TREE_POSITIONS`.
- Any visual placement that ignores these sets will drift from gameplay geometry.

4. Visual/token/layer contract
- `src/core/cityVisualSpec.ts` defines:
  - occupancy precedence (`building -> road -> sidewalk -> water -> park -> tree -> grass_detail`);
  - semantic color tokens (`CITY_TERRAIN_TOKENS`);
  - layer rules (`CITY_LAYER_ORDER`, `CITY_Z_ORDER_RULES`);
  - performance constraints (`targetFps: 60`, `frameBudgetMs: 16.67`, `maxGroundPasses: 2`, `maxDynamicEntities: 220`).

5. Existing entity maturity
- Transit exists end-to-end (`Vehicle` type + store updates + render pass), but pathing is midpoint-based, not road-graph-following.
- `Pedestrian` type exists in `src/core/types.ts`, but no store field, no `tick(dt)` update, and no render pass currently uses it.
- Overlay mode is single-source state in store (`overlayMode`) and is reflected in:
  - UI tablist semantics in `src/components/OverlayToggle.tsx`
  - canvas runtime marker `data-overlay-mode` in `src/components/CityCanvas.tsx`
  - copy/emphasis contract in `src/core/cityOverlayContract.ts`

## Hard Constraints for SWA-68

1. Do not change `drawBuilding(...)` behavior
- Building rendering and status FX are already dense and coupled to overlays.
- City visual upgrades must land in separate passes/helpers.

2. Keep terrain hot path allocation-light
- Terrain loop iterates full `16x16` grid each frame (`256` tiles).
- Avoid per-frame object/array/set creation in tile loop; precompute static data outside render hot path.

3. Preserve deterministic pass layering
- Transit and city-life additions must keep deterministic z-order around structures.
- Use `gridX + gridY` depth and stable tie-breaking for mixed dynamic entities.

4. Maintain overlay mode contract
- `activity`, `power`, `economy` mode sync is consumed via `OverlayToggle` and canvas `data-overlay-mode`.
- Mode changes may alter emphasis/alpha, but must not mutate topology or break deterministic state reflection.

5. Respect performance budgets
- New features must fit existing dynamic limits and shadow/particle budgets.
- Pedestrian and transit expansions should enforce hard caps with deterministic despawn/cleanup.

## Actionable Implementation Guidance for Subtasks 2-5

### Subtask 2: UX/Data Contract Lock
- Keep existing tablist interaction model (single select, Arrow/Home/End support).
- Add/retain explicit data attributes required for renderer assertions:
  - `data-overlay-current` + emphasis attributes on toggle root
  - `data-overlay-mode` + `data-render-pipeline-version` on canvas
- Ensure any new mode-specific copy or emphasis value is represented in `CITY_OVERLAY_CONTRACT`, not hardcoded in component bodies.

### Subtask 3: Render Pipeline Refactor (No Visual Delta First)

1. Refactor into explicit pass helpers first (no visual change)
- Extract pass-scoped helpers in `CityCanvas`:
  - terrain base/detail;
  - static props;
  - transit underlay/overlay;
  - city-life underlay/overlay.
- Keep output pixel-equivalent during this extraction to reduce regression risk.

2. Keep contract file synchronized
- If helper extraction changes effective pass boundaries, update `CITY_CANVAS_RENDER_PASSES` / insertion slot metadata in `src/core/cityCanvasRenderPipeline.ts`.
- Keep runtime marker `CITY_CANVAS_RENDER_PIPELINE_VERSION` synchronized with contract updates.

### Subtask 4: Roads/Transit/Trees/Parks Upgrade

2. Trees and park props: deterministic static index
- Build a precomputed prop map keyed by `TileKey` from `TREE_POSITIONS`, `PARK_CORNER_TILES`, and allowed grass tiles.
- Use seeded coordinate formulas for variation; never call `Math.random()` inside render loop for static props.
- Render in the slot between terrain and decorative/building masses.

3. Transit upgrade: road-aware routing with compatibility
- Phase 1: derive waypoints from `ROAD_TILE_MAP` + connectors without breaking existing `Vehicle` payload.
- Phase 2 (if needed): extend `Vehicle` with optional route metadata (`route?: TileKey[]`, `routeIndex?: number`) while keeping midpoint fallback for legacy events.
- Keep underlay rendering for behind-building motion; reserve only near-camera accents for overlay slot.

### Subtask 5: City-Life Rollout (Pedestrians)

4. City-life rollout: pedestrian slice in store
- Add `pedestrians` state and `tick(dt)` updates in `store.ts`.
- Spawn on sidewalk/park candidates; avoid building, road core, and water sets.
- Apply cap + TTL/despawn rules to stay under `maxDynamicEntities`.

5. Mode-safe styling
- Use `CITY_TERRAIN_TOKENS` for roads, transit, trees, parks, and pedestrians.
- In `power`/`economy`, emphasize via visibility/alpha only; avoid separate topology logic per mode.

## Risk Register and Mitigations

1. Risk: pass-order drift between runtime and contract doc
- Mitigation: treat `CITY_CANVAS_RENDER_PIPELINE_VERSION` bump + pass list update as one atomic change.

2. Risk: entity blow-up from pedestrians + richer transit
- Mitigation: cap per-type counts, deterministic despawn (TTL + out-of-bounds), and total dynamic count guard.

3. Risk: topology drift from ad-hoc coordinate placement
- Mitigation: generate placement candidates strictly from `cityLayout` sets and derived neighbors.

4. Risk: visual regressions from nondeterministic static props
- Mitigation: precompute seed map once; avoid render-time randomness for static scene elements.

## Validation Plan (Targeted and Required)

1. Contract sync checks
- If pass sequence changes, update `src/core/cityCanvasRenderPipeline.ts` and keep `data-render-pipeline-version` aligned in `CityCanvas`.

2. UI/data coupling checks
- Preserve overlay tablist semantics (`aria-selected`) and canvas mode reflection (`data-overlay-mode`).

3. Regression checks
- Add utility-level tests for route/depth helpers.
- Keep smoke/Playwright checks focused on deterministic `data-*` contracts rather than fragile pixel diffs.

4. Documentation consistency checks
- Keep this constraints document and `docs/testing/city-canvas-render-pipeline-audit-swa-68-subtask-1.md` aligned when pass boundaries evolve.
- Run docs registry validation to ensure plan metadata integrity.

## Subtask-Ready Definition of Done

- Roads, transit, trees, parks, and city-life additions are layered deterministically and token-driven.
- Topology remains sourced from `cityLayout` sets only.
- `drawBuilding(...)` remains unchanged.
- Dynamic entities are bounded and time-step driven in `tick(dt)`.
- Overlay contracts and pipeline versioning remain testable and synchronized.
