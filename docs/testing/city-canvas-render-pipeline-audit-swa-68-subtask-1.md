# City Canvas Render Pipeline Audit (SWA-68 Subtask 1/11)

## Scope

Audit `src/components/CityCanvas.tsx` for:

1. Draw order and pass boundaries
2. Tile loop behavior and occupancy constraints
3. Animation timing and frame budget constraints
4. Theme and terrain token handling
5. Current vehicle and pedestrian implementation state

The goal is to define safe insertion points for roads, sidewalks, trees, parks, water, and city-life upgrades without modifying `drawBuilding()`.

## Source-of-Truth Contract

- Pass contract: `src/core/cityCanvasRenderPipeline.ts`
- Runtime pipeline marker: `data-render-pipeline-version` on `#city-canvas`
- Theme/token + performance constraints: `src/core/cityVisualSpec.ts`
- Layout/topology sets used by terrain pass: `src/core/cityLayout.ts`
- Non-negotiable building constraint: `CITY_VISUAL_CONSTRAINTS.noBuildingDrawFunctionChanges`

## Current Draw Order in `render()` (Back to Front)

1. Frame state update:
   - `dt` clamp and `tick(dt)`
   - real-time clock lighting + theme mode resolution
2. Full-screen background:
   - gradient
   - stars
3. Enter world transform:
   - `translate` then `scale`
4. Terrain tiles (`GRID_SIZE * GRID_SIZE` loop):
   - occupancy resolution + per-occupant branch rendering
5. Static/decorative buildings:
   - `ALL_DECO_BUILDINGS`
6. Plaza/fountain underlays:
   - `drawFountainPlazaProps`
   - `drawFountainBase`
7. Mid-scene dynamic underlay:
   - `drawPowerGrid` when overlay is not economy
   - vehicle pass
8. Agent buildings:
   - depth-sort by `gridX + gridY` then `drawBuilding`
9. Foreground effects:
   - `drawFountainSpray`
   - particles + ambient floaters
10. Exit world transform + screen-space tint:
    - `ctx.restore`
    - day/night overlay

## Tile Loop and Occupancy Constraints

- Terrain runs every frame over all 256 tiles (16x16).
- Occupancy is resolved by precomputed sets via `resolveTileOccupant(...)`.
- Current set precedence is `building > road > sidewalk > water > park > tree > grass_detail` (`cityVisualSpec.ts`).
- `CityCanvas` currently passes `building/road/sidewalk/water/park` sets; it does not pass `treeTiles`.
- Road/sidewalk/water/park/grass have isolated styling branches, making branch-local micro-detail insertion low-risk.

## Animation and Frame-Timing Constraints

- `dt` is clamped by `CITY_PERFORMANCE_CONSTRAINTS.frameBudgetMs` before ticking simulation.
- Existing effects are time-driven (`timestamp / 1000`) and should remain time-driven.
- Time-of-day lighting uses system local clock (`new Date()`), so golden/snapshot tests must avoid hardcoded lighting assumptions unless time is mocked.
- Global constraints to honor for SWA-68 work (`cityVisualSpec.ts`):
  - `maxGroundPasses: 2`
  - `maxDynamicEntities: 220`
  - `maxParticles: 260`
  - `maxShadowsPerFrame: 180`

## Theme Handling Constraints

- Theme mode is derived from `document.documentElement.dataset.theme` through `resolveCityThemeMode(...)`.
- Terrain and dynamic accents read from `CITY_TERRAIN_TOKENS[cityTheme]` each frame.
- Day/night brightness and theme mode are orthogonal:
  - Theme selects color family tokens (`light` vs `dark`).
  - Clock-driven darkness controls star visibility, lamp glows, and final ambient overlay.
- New passes should consume token values from `CITY_TERRAIN_TOKENS` rather than introducing hardcoded colors, except transient special FX.

## Vehicle and Pedestrian State Audit

- Vehicle logic exists end-to-end:
  - store slice: `vehicles` in `useSwarmStore` (`src/core/store.ts`)
  - render pass: underlay vehicle diamonds/trails before buildings (`CityCanvas.tsx`)
  - pathing currently uses from->center spine->to interpolation, not road-tile routing
- Pedestrian logic is only a type definition:
  - `Pedestrian` type exists (`src/core/types.ts`)
  - no store field, no update loop, no render pass currently consumes pedestrians

## Safe Insertion Slots (No `drawBuilding()` Changes)

### Slot A: Terrain Micro-Detail

- Location: inside occupancy branches in terrain loop.
- Anchor: `terrain_tiles` pass in `render()`.
- Use for: lane dashes/medians, sidewalk seams, curb paint, water shimmer/foam, park path texture.
- Constraint: must remain O(tiles) and cheap; avoid allocations in loop.

### Slot B: Static World Props

- Location: between terrain loop and `ALL_DECO_BUILDINGS`.
- Anchor: after `terrain_tiles`, before `decorative_buildings`.
- Use for: trees, park furniture, transit stops, deterministic street props.
- Constraint: deterministic generation from tile keys to avoid visual jitter.

### Slot C: Transit Underlay Upgrade

- Location: current vehicle section after power grid and before agent buildings.
- Anchor: `transit_underlay` pass region.
- Use for: road-aware cars/transit movement, behind-building city motion, wheel shadow and headlight underlay.

### Slot D: City-Life Overlay

- Location: after buildings and before fountain spray/particles.
- Anchor: between `agent_buildings` and `fountain_spray`.
- Use for: foreground pedestrians, curbside activity, near-camera transit elements.

## Feature-to-Slot Mapping (Implementation-Ready)

1. Roads upgrade:
   - Implement lane dash/median/intersection plates in Slot A.
   - Use `ROAD_TILES`, `MAIN_ROAD_TILES`, `ROAD_INTERSECTION_TILES`, and `CITY_ROAD_TILE_LANGUAGE` line widths.
2. Sidewalk upgrade:
   - Implement seams/edge wear in Slot A using `SIDEWALK_BORDER_TILES` and plaza-aware branching.
3. Water upgrade:
   - Implement shoreline foam + shimmer in Slot A using `WATER_TILES` and theme water tokens.
4. Trees + parks:
   - Place deterministic tree/trunk sprites in Slot B, fed by `PARK_CORNER_TILES` and optional derived grass candidates.
5. Upgraded cars/transit:
   - Keep all road-aware car bodies in Slot C so structures occlude them correctly.
   - Reserve windshield/glint accents that should pop in foreground for Slot D.
6. Pedestrian rollout:
   - Add state + `tick(dt)` lifecycle first.
   - Split pedestrians by depth: far/behind-structure walkers in Slot C, near-camera walkers in Slot D.

## Actionable Implementation Guidance

1. Keep `drawBuilding()` unchanged; add new helpers called from `render()` pass anchors only.
2. Extract pass helpers in this order with no behavioral change first:
   - `drawTerrainPass`
   - `drawStaticWorldPropsPass`
   - `drawTransitUnderlayPass`
   - `drawCityLifeOverlayPass`
3. Implement roads/sidewalk/water/park polish in Slot A, sourcing colors from `CITY_TERRAIN_TOKENS`.
4. Introduce deterministic tree + park prop rendering in Slot B using `PARK_CORNER_TILES` and precomputed tile-key seeds.
5. Upgrade vehicle pathing in Slot C by converting tile routes (from `ROAD_TILE_MAP`) to world-space waypoints.
6. Add pedestrian state to store and render split:
   - behind-structure walkers in Slot C
   - foreground walkers in Slot D
7. Keep interaction compatibility:
   - building click hit testing and fountain coin toss logic should remain unchanged unless explicitly re-scoped.
8. Keep contract files synchronized when passes evolve:
   - `src/core/cityCanvasRenderPipeline.ts`
   - `data-render-pipeline-version` in `CityCanvas`

## Validation Targets for Follow-On Subtasks

1. Contract integrity:
   - update `CITY_CANVAS_RENDER_PASSES` and insertion slot metadata if pass order changes
2. Runtime correctness:
   - verify canvas `data-render-pipeline-version` remains aligned with contract updates
3. Performance:
   - preserve stable 60fps behavior under default entity counts
4. Regression safety:
   - add pass-order test markers and run smoke + docs registry validation
