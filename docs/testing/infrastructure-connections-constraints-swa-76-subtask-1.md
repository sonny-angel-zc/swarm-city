# SWA-76 Subtask 1/9: Infrastructure Rules and Map Constraints

## Goal

Document the authoritative pathing rules, tile types, waterway crossing rules, bridge placement
conditions, and animation performance limits that govern infrastructure connections (roads, rail,
power grid) between the central government district and the four outer district quadrants.
All coordinates are code-verified against `src/core/cityLayout.ts`, `src/core/districtLayout.ts`,
`src/core/types.ts`, and `src/core/cityVisualSpec.ts`.

---

## 1. Coordinate System and Grid Constants

- File: `src/core/types.ts`
- `GRID_SIZE = 24` (0-indexed: columns 0–23, rows 0–23)
- `TILE_WIDTH = 64px`, `TILE_HEIGHT = 38px` (~0.6 isometric ratio)
- Screen projection: `gridToScreen(gx, gy)` → `{ x: (gx - gy) * 32, y: (gx + gy) * 19 }`
- Tile key format: `"${x},${y}"` (string, used in all Set/Map lookups)
- Pathfinding directions: 4-cardinal only (no diagonal movement)

---

## 2. Tile Type Taxonomy and Occupancy Precedence

Tile type is resolved per tile via `resolveTileOccupant()` in `src/core/cityVisualSpec.ts`.
Occupancy is exclusive — the first matching type wins:

| Priority | Type | Source Set |
|----------|------|-----------|
| 1 | `building` | `BUILDING_FOOTPRINT_TILES` |
| 2 | `road` | `ROAD_TILES` (includes main, outer, and secondary connectors) |
| 3 | `sidewalk` | `SIDEWALK_BORDER_TILES` |
| 4 | `water` | `WATER_TILES` |
| 5 | `park` | `PARK_CORNER_TILES` |
| 6 | `tree` | `TREE_POSITIONS` |
| 7 | `grass_detail` | (fallback) |

> **Bridge tiles** (`BRIDGE_TILES`) are a subset of `WATER_TILES`. They render over water with
> bridge deck styling but do not add a new occupancy type — they are detected by `BRIDGE_TILES.has(tile)`
> inside the `water` render branch.

Implementation source: `src/core/cityVisualSpec.ts` (`TILE_OCCUPANCY_PRECEDENCE`, `resolveTileOccupant`).

---

## 3. Road Network Layout (Exact Coordinates)

File: `src/core/cityLayout.ts` (`ROAD_NETWORK_SPEC`)

```
ROAD_NETWORK_SPEC = {
  mainRows: [11, 12],        // central horizontal corridors
  mainCols: [11, 12],        // central vertical corridors
  outerRows: [4, 5, 18, 19], // boundary ring — horizontal
  outerCols: [4, 5, 18, 19], // boundary ring — vertical
}
```

### Main roads (center cross)

- Full-width horizontal bands at rows 11 and 12 (spanning all 24 columns)
- Full-width vertical bands at cols 11 and 12 (spanning all 24 rows)
- Intersection tiles: tiles that have road neighbors in both axes
- Plaza tiles (PM City Hall footprint at 11–12, 11–12) are **excluded** from `MAIN_ROAD_TILES`
- Building footprint tiles are excluded from all road sets at module load

### Outer roads (district boundary ring)

- Horizontal bands at rows 4, 5, 18, 19 — separate the outer district quadrants from the center
- Vertical bands at cols 4, 5, 18, 19 — same boundary function
- Included in `ROAD_TILES` and `ROAD_TILE_MAP.all` but **not** in `ROAD_TILE_MAP.main`
- No lane markings or visual arterial emphasis yet (gap to close in subtask 3)

### Secondary connectors

- BFS paths from each agent building's perimeter to the nearest main road row/col
- Added to `ROAD_TILES` at module load (no runtime mutation — computed once)
- Stored per-role in `SECONDARY_CONNECTOR_TILES_BY_ROLE`
- Do not receive lane markings — intentionally visually quieter than main roads

---

## 4. Central Government District

The government district is the area between the outer road rings, approximately tiles x: 6–17,
y: 6–17. No formal `DistrictZone` definition exists for the center (only the four quadrant
districts exist in `districtLayout.ts`).

### Agent building positions

File: `src/core/types.ts` (`BUILDING_CONFIGS`)

| Agent | Building | gridX | gridY | Width (tiles) | Footprint tiles |
|-------|----------|-------|-------|---------------|-----------------|
| PM | City Hall | 11 | 11 | 2 | (11,11),(12,11),(11,12),(12,12) |
| Reviewer | Courthouse | 9 | 6 | 2 | (9,6),(10,6),(9,7),(10,7) |
| Researcher | Library | 13 | 6 | 2 | (13,6),(14,6),(13,7),(14,7) |
| Engineer | Workshop | 7 | 8 | 2 | (7,8),(8,8),(7,9),(8,9) |
| Designer | Studio | 15 | 8 | 2 | (15,8),(16,8),(15,9),(16,9) |
| QA | Testing Lab | 7 | 14 | 2 | (7,14),(8,14),(7,15),(8,15) |
| Devil's Advocate | Dark Tower | 15 | 14 | 1 | (15,14),(16,14),(15,15),(16,15) |

### Plaza tiles

`PLAZA_TILES` = addRect from PM config → tiles (11,11), (12,11), (11,12), (12,12).

Plaza tiles are **excluded** from `ROAD_TILES`, `WATER_TILES`, and `TREE_POSITION_EXCLUSION_TILES`.
Road rendering treats plaza tiles as building-priority (occupancy precedence applies).

### Center-district pathfinding entry points

Any vehicle entering the government district from an outer road must:

1. Arrive at one of the outer road bands (row/col 4, 5, 18, or 19).
2. Follow the road tile set (BFS-navigable) inward.
3. Transition onto the main cross (rows/cols 11, 12) via the shared road tile adjacency.
4. Reach the building's secondary connector spur.

No explicit "gateway" tiles exist — path continuity is maintained because outer roads and
main roads share touching grid cells at their intersection points.

---

## 5. District Quadrant Bounds

File: `src/core/districtLayout.ts` (`DISTRICT_QUADRANTS`)

| ID | Name | x1 | y1 | x2 | y2 | Default color |
|----|------|----|----|----|-----|--------------|
| `nw` | NW quadrant | 0 | 0 | 7 | 7 | `#2563EB` (Blue) |
| `ne` | NE quadrant | 16 | 0 | 23 | 7 | `#7C3AED` (Purple) |
| `sw` | SW quadrant | 0 | 16 | 7 | 23 | `#059669` (Green) |
| `se` | SE quadrant | 16 | 16 | 23 | 23 | `#D97706` (Orange) |

- All bounds are 0-indexed, inclusive.
- Each quadrant is 8×8 tiles.
- The center government zone (approx. x: 8–15, y: 8–15) sits between the quadrants, separated
  by the outer road bands (rows/cols 4–5 and 18–19).
- `buildingSlots` within each district exclude road, building, plaza, water, and bridge tiles.

---

## 6. Road-Based Paths: Center → Each District

The road tile graph is a continuous, BFS-navigable set. The path from the government center to
each district quadrant follows the road bands:

### Center → NW (0–7, 0–7)

1. Main road col 11 or 12 → travel north (decreasing y) toward row 5.
2. At outer road row 5 (or 4): transition west along row 4/5 toward col 4/5.
3. Outer road col 4 or 5: travel north toward row 0 (water perimeter).
4. NW district building slots: tiles 1–6 in x and y (interior of 0–7 box, minus roads/water/bridges).

**Critical junction**: tile (4, 5) or (5, 4) — intersection of outer col 4/5 and outer row 4/5 — is
the road-to-district gateway for NW.

### Center → NE (16–23, 0–7)

1. Main road row 11 or 12 → travel east (increasing x) toward col 18/19.
2. At outer road col 18 (or 19): transition north along col 18/19 toward row 4/5.
3. At outer road row 4/5: continue to NE district interior (x: 17–22, y: 1–6).

**Critical junction**: tile (18, 5) or (19, 4) — NE gateway.

### Center → SW (0–7, 16–23)

1. Main road col 11 or 12 → travel south (increasing y) toward row 18/19.
2. At outer road row 18 (or 19): transition west toward col 4/5.
3. At outer road col 4/5: travel south to SW district interior (x: 1–6, y: 17–22).

**Critical junction**: tile (4, 18) or (5, 19) — SW gateway.

### Center → SE (16–23, 16–23)

1. Main road row 11 or 12 → travel east toward col 18/19, OR col 11/12 south toward row 18/19.
2. At outer road col 18/19 + row 18/19: transition to SE district interior (x: 17–22, y: 17–22).

**Critical junction**: tile (18, 18) — SE gateway (outer col 18 meets outer row 18).

---

## 7. Waterway Tiles

File: `src/core/cityLayout.ts` (WATER_TILES generation)

```typescript
// Water occupies the full outer perimeter — every cell in row 0, row 23, col 0, col 23
for (let i = 0; i < GRID_SIZE; i++) {
  WATER_TILES.add(`${i},0`);           // top row
  WATER_TILES.add(`${i},${GRID_SIZE - 1}`); // bottom row (row 23)
  WATER_TILES.add(`0,${i}`);           // left col
  WATER_TILES.add(`${GRID_SIZE - 1},${i}`); // right col (col 23)
}
```

After exclusion: building footprint tiles and plaza tiles are removed from `WATER_TILES`.

**Key rule**: Water is **only on the absolute perimeter** (row 0, row 23, col 0, col 23). There
are **no interior waterways**. All district-to-district paths through the interior grid are
water-free. Bridges are only required at the four outer edges.

---

## 8. Bridge Placement Conditions

File: `src/core/cityLayout.ts`

```typescript
const BRIDGE_COLS = [4, 5, 11, 12, 18, 19];
const BRIDGE_ROWS = [4, 5, 11, 12, 18, 19];
```

Bridge tiles are generated at the intersection of road rows/columns with the water perimeter:

```typescript
// Vertical crossings (road cols crossing top/bottom perimeter rows)
for (const col of BRIDGE_COLS) {
  BRIDGE_TILES.add(`${col},0`);            // top perimeter
  BRIDGE_TILES.add(`${col},${GRID_SIZE - 1}`); // bottom perimeter (row 23)
}
// Horizontal crossings (road rows crossing left/right perimeter cols)
for (const row of BRIDGE_ROWS) {
  BRIDGE_TILES.add(`0,${row}`);            // left perimeter
  BRIDGE_TILES.add(`${GRID_SIZE - 1},${row}`); // right perimeter (col 23)
}
// Filter: only keep tiles that are actually water tiles
for (const tile of BRIDGE_TILES) {
  if (!WATER_TILES.has(tile)) BRIDGE_TILES.delete(tile);
}
```

### Bridge placement conditions (rules)

1. **Road alignment required**: a bridge tile is only created where a road row/col
   (one of `[4, 5, 11, 12, 18, 19]`) meets the outer water perimeter.
2. **Water membership required**: only tiles that are in `WATER_TILES` survive the filter.
3. **No interior bridges**: bridges never appear in the interior of the grid (water is perimeter-only).
4. **Building exclusion inherited**: tiles removed from `WATER_TILES` due to building footprints
   are also absent from `BRIDGE_TILES` (removed upstream before bridge generation).
5. **Single-tile bridges**: each crossing is a 1-tile bridge span — no multi-tile bridge structures.
6. **Crossing tile referenced in spec**: `BRIDGE_CROSSING_TILE = "7,0"` is a legacy constant
   (represents the outer top row at x=7 — this tile may not align with a current road column
   since road cols are 4, 5, 11, 12, 18, 19; x=7 is not in the bridge col set).

### Effective bridge tile inventory

| Road band | Top perimeter (y=0) | Bottom perimeter (y=23) | Left perimeter (x=0) | Right perimeter (x=23) |
|-----------|--------------------|-----------------------|---------------------|----------------------|
| col/row 4 | (4, 0) | (4, 23) | (0, 4) | (23, 4) |
| col/row 5 | (5, 0) | (5, 23) | (0, 5) | (23, 5) |
| col/row 11 | (11, 0) | (11, 23) | (0, 11) | (23, 11) |
| col/row 12 | (12, 0) | (12, 23) | (0, 12) | (23, 12) |
| col/row 18 | (18, 0) | (18, 23) | (0, 18) | (23, 18) |
| col/row 19 | (19, 0) | (19, 23) | (0, 19) | (23, 19) |

Total bridge tiles: up to 24 tiles (6 cols × 2 perimeter rows + 6 rows × 2 perimeter cols),
minus any removed by building-footprint exclusion (unlikely at perimeter, but applied).

---

## 9. Pathfinding Algorithm

File: `src/core/cityLayout.ts` (`bfsPath`, `nearestRoadTarget`)

- **Algorithm**: BFS (breadth-first search), 4-cardinal directions only.
- **Start**: any tile on the building's perimeter (adjacent, non-blocked tiles).
- **End**: nearest tile on a main road row/col — computed by `nearestRoadTarget(x, y)` which
  picks the closer of the two main rows and two main cols, then whichever axis distance is shorter.
- **Blocked set**: `BUILDING_FOOTPRINT_TILES` minus the building's own footprint.
- **Traversal**: grid bounds enforced (`0 ≤ x,y < GRID_SIZE`); blocked tiles skipped except
  the destination itself (destination can be blocked — building spur reaches into road).
- **Result**: shortest path as `TileKey[]`, empty array if no path found.

### Connector path storage

Secondary connectors are computed **once at module load** (not per frame). They are stored as:
- `SECONDARY_CONNECTOR_TILES_BY_ROLE`: `Record<AgentRole, Set<TileKey>>` — per-role sets
- `SECONDARY_CONNECTOR_TILES`: union of all role sets
- Both sets are merged into `ROAD_TILES` so connectors participate in the navigable road graph

### Infrastructure route precomputation rule

All rail routes, district power edges, and arterial emphasis overlays **must** be precomputed as
static coordinate arrays before the render loop. BFS must never run inside the animation frame.

---

## 10. Animation and Performance Constraints

File: `src/core/cityVisualSpec.ts` (`CITY_PERFORMANCE_CONSTRAINTS`, `CITY_VISUAL_CONSTRAINTS`)

| Constraint | Value | Notes |
|-----------|-------|-------|
| Target FPS | 60 | Hard target |
| Frame budget | 16.67ms | Per frame, all passes combined |
| Max ground passes | 2 | Terrain tile loop budget |
| Max dynamic entities | 220 | Vehicles + pedestrians combined |
| Max particles | 260 | All particle effects combined |
| Max shadows per frame | 180 | |
| Per-frame allocations | Forbidden | No `new Array`, `new Set`, spread in hot path |

### Infrastructure overlay performance rules

1. **Route geometry precomputed once**: rail tracks, power line paths, and arterial emphasis overlays
   are computed at module load as `Array<{ sx: number; sy: number }>` (screen-space points).
   Never run pathfinding or `gridToScreen` inside the animation frame for static routes.

2. **O(edges) not O(tiles)**: infrastructure connections operate over small edge/route arrays
   (4 district nodes, ~6 edges), not over the 576-tile grid. No per-tile iteration in
   infrastructure overlay passes.

3. **Avoid `Set.has()` in animation-only sections**: if rail animation needs to check which tiles
   a train occupies, precompute position lookup arrays rather than using `ROAD_TILES.has()` per frame.

4. **Cross-tie rendering**: rail cross-tie screen positions must be stored as a static array
   computed once after route geometry is finalized. Do not recompute per frame.

5. **Alpha caps for readability**:
   - Rail tracks: ≤ 0.85 opacity
   - District power lines: ≤ 0.90 at maximum emphasis
   - Road arterial tint: ≤ 0.60 (overlay, not opaque)

6. **Render pass slots** (file: `src/core/cityCanvasRenderPipeline.ts`):
   - Road arterial emphasis → inside the existing `terrain_tiles` pass (no new pass)
   - Rail tracks → `transit_underlay` pass (between `power_grid_underlay` and `agent_buildings`)
   - District power lines → `power_grid_underlay` pass or parallel with existing `drawPowerGrid`
   - Do not add new named passes without updating `CITY_CANVAS_RENDER_PASSES`

7. **Water shimmer period**: `CITY_LOW_POLY_TEXTURE_SPEC.water.shimmerPeriodSec = 3.1s`. Bridge
   tiles share the water render pass; bridge deck rendering must not restart or interfere with
   the shimmer animation timing for adjacent water tiles.

---

## 11. Existing Infrastructure Gaps

### Gap A — No distinct arterial visual treatment

Outer road bands (rows/cols 4, 5, 18, 19) are included in `ROAD_TILES` but receive the same
visual style as secondary building connectors. No lane markings, no color emphasis, no width
differentiation. The natural inter-district arterials are visually indistinguishable from spurs.

**Fix location**: terrain road tile branch in `CityCanvas.tsx`; check `ROAD_NETWORK_SPEC.outerRows/outerCols`
and apply an overlay fill using a new `city.infra.road.arterial` semantic token.

### Gap B — No rail line definitions or rendering

`transit_underlay` pass exists in `CITY_CANVAS_RENDER_PASSES` and `CITY_CANVAS_INSERTION_SLOTS.transitUnderlayUpgrade`
is reserved, but no rail route data, track geometry, or rendering function exists.
`transitBody`/`transitWindow` color tokens are defined but unused for rail.

**Fix location**: new `src/core/infraConnections.ts` for route data; new `drawRailLines()` in
`CityCanvas.tsx` called in the `transit_underlay` slot.

### Gap C — Power grid is agent-to-agent only, not district-to-district

`POWER_EDGES` in `CityCanvas.tsx` forms a star topology between the 7 agent buildings.
`drawPowerGrid()` uses bezier curves between building centers, arcing around the fountain hub
at `gridToScreen(7.5, 7.5)` (itself misaligned — fountain should be at 11.5, 11.5 per SWA-78).
No district quadrant center nodes exist; no district power ring exists.

**Fix location**: new `drawDistrictPowerGrid()` using `DISTRICT_NODES` in `infraConnections.ts`.

### Gap D — Missing infrastructure semantic color tokens

No tokens for: `city.infra.rail.track`, `city.infra.rail.tie`, `city.infra.power.line`,
`city.infra.power.node`, `city.infra.road.arterial`. All must be added to `CITY_TERRAIN_TOKENS`
(both `light` and `dark` entries) and `CitySemanticColorToken` before rendering infrastructure.

### Gap E — `BRIDGE_CROSSING_TILE = "7,0"` is a stale constant

`"7,0"` is referenced in `cityLayout.ts` (line 355) but x=7 is not in `BRIDGE_COLS = [4,5,11,12,18,19]`.
This legacy tile was valid in an earlier grid configuration. It is exported but not used in any
rendering logic — it is safe to leave as-is until a renderer explicitly references it, at which
point it should be replaced with a valid bridge tile (e.g., `"4,0"` or `"5,0"`).

---

## 12. Hard Constraints (Summary for Implementation)

1. **No runtime mutation of module-level tile sets.** `ROAD_TILES`, `BRIDGE_TILES`, `WATER_TILES`
   are computed once at module load. New tile designations must be exported as new sets or
   derived in the renderer from existing exported constants.

2. **Render pass order is fixed.** Infrastructure passes must use existing named slots.
   Do not insert passes before `terrain_tiles` or after `day_night_overlay` without updating
   `CITY_CANVAS_RENDER_PASSES`.

3. **All new colors via semantic tokens.** Inline RGB strings are pre-existing tech debt; do not
   extend the pattern. Add to `CITY_TERRAIN_TOKENS` and `CitySemanticColorToken`.

4. **Frame budget: 16.67ms.** Infrastructure route geometry precomputed. No BFS, no `gridToScreen`
   calls, no allocations inside the animation frame.

5. **Theme safety.** All new infrastructure tokens must have both `light` and `dark` values.
   Test against `terrain.roadBase`, `terrain.grassBase`, and `terrain.parkBase` in both modes.

6. **District quadrant bounds stable.** Do not change `DISTRICT_QUADRANTS` or `DistrictZone.id`
   values — infrastructure topology depends on them.

7. **Overlay mode contract respected.** Infrastructure visibility scales by `transitEmphasis` and
   `roadsEmphasis` from `CITY_OVERLAY_CONTRACT[overlayMode]`. Emphasis 0 = hidden, 1 = supporting,
   2 = primary, 3 = dominant.

---

## 13. Implementation Guidance (Ordered, for Subtasks 2–9)

### Subtask 2/9 — Define infrastructure data types and route constants

Create `src/core/infraConnections.ts`:

```typescript
// District center nodes (approximate interior centers, clear of roads and buildings)
export const DISTRICT_NODES = {
  nw: { gridX: 3, gridY: 3 },
  ne: { gridX: 20, gridY: 3 },
  sw: { gridX: 3, gridY: 20 },
  se: { gridX: 20, gridY: 20 },
} as const;

// Rail routes along outer road band corridors
export type RailRoute = {
  id: string;
  waypoints: Array<{ x: number; y: number }>;
};

// District power mesh (ring + diagonals)
export type DistrictPowerEdge = {
  from: 'nw' | 'ne' | 'sw' | 'se';
  to: 'nw' | 'ne' | 'sw' | 'se';
};
```

### Subtask 3/9 — Add infrastructure semantic color tokens

Add to `src/core/cityVisualSpec.ts`:

```
city.infra.rail.track    light: '#5a6478', dark: '#3a4258'
city.infra.rail.tie      light: '#6b7489', dark: '#2e3548'
city.infra.power.line    light: 'rgba(96,165,250,0.7)', dark: 'rgba(96,165,250,0.5)'
city.infra.power.node    light: 'rgba(96,165,250,0.9)', dark: 'rgba(147,197,253,0.8)'
city.infra.road.arterial light: 'rgba(255,220,140,0.22)', dark: 'rgba(255,211,100,0.18)'
```

Extend `CityTerrainTokens`, `CitySemanticColorToken`, and both entries of `CITY_TERRAIN_TOKENS`.

### Subtask 4/9 — Road arterial emphasis

In `CityCanvas.tsx` terrain road tile branch: detect outer road tiles using
`ROAD_NETWORK_SPEC.outerRows` and `ROAD_NETWORK_SPEC.outerCols`, apply arterial tint fill
scaled by `overlayContract.roadsEmphasis`. Exclude `ROAD_TILE_MAP.secondaryLinks` set.

### Subtask 5/9 — Rail line rendering

New `drawRailLines(ctx, time, overlayContract)` in `CityCanvas.tsx`, called in `transit_underlay` slot:
- Precomputed screen-space waypoints from `RAIL_ROUTES` (computed at module load, not per frame)
- Two parallel track strokes + perpendicular cross-ties at precomputed intervals
- Animated train dot: `(time * speed) % totalRouteLength` — no per-frame route computation
- Scale alpha by `overlayContract.transitEmphasis / 3`

### Subtask 6/9 — District-level power grid

New `drawDistrictPowerGrid(ctx, time, overlayContract)` using `DISTRICT_POWER_EDGES` and
`DISTRICT_NODES`. Straight lines (no fountain-avoidance needed at district scale). Diamond
pylon markers at each node. Skip when `overlay === 'economy'`. Use `city.infra.power.line` token.

### Subtask 7/9 — Bridge visual differentiation

In the `water` render branch of `CityCanvas.tsx`, detect bridge tiles via `BRIDGE_TILES.has(tile)`.
Apply bridge deck fill (road-adjacent tone) plus compact side-rail strokes. Bridge deck must not
interrupt water shimmer animation timing for adjacent water tiles.

### Subtask 8/9 — Overlay coherence review

Verify `activity`, `power`, and `economy` overlay modes produce coherent infrastructure emphasis.
Update `CITY_OVERLAY_CONTRACT.power.helper` to reference rail and district power.

### Subtask 9/9 — Validation

- `npx tsc --noEmit` — type safety of new tokens and exports
- `node scripts/validate-docs-registry.mjs` — registry consistency
- `npm run test:smoke` — no terrain/building regressions
- `npm run test:theme:guardrails` — infrastructure readable in both themes
- Visual inspection: rail in `transit_underlay` renders before agent buildings; district power
  ring visible in `power` overlay mode; economy mode hides district power.

---

## 14. Validation Plan

1. **Docs registry** (run after registering this doc):
   ```
   node scripts/validate-docs-registry.mjs
   ```

2. **TypeScript compile** (after each token/type addition):
   ```
   npx tsc --noEmit
   ```

3. **Smoke tests** (after each rendering change):
   ```
   npm run test:smoke
   ```

4. **Theme regression**:
   ```
   npm run test:theme:guardrails
   ```

---

## 15. Definition of Done Signals for SWA-76

1. Inter-district outer road bands (rows/cols 4, 5, 18, 19) have distinct arterial emphasis
   visible in `activity` and `power` overlay modes, scaled by `roadsEmphasis`.
2. Rail lines render in the `transit_underlay` pass with precomputed geometry and animated trains.
3. District power connections form a ring/mesh between quadrant center nodes, visible in `power` mode.
4. All bridge tiles (perimeter intersections of road cols/rows [4,5,11,12,18,19] with water edges)
   render with a bridge deck distinct from plain water tiles.
5. All infrastructure colors use semantic tokens — no inline RGB for new elements.
6. Both `light` and `dark` themes render all infrastructure clearly.
7. Frame budget ≤ 16.67ms at 60 fps with all infrastructure passes active.
8. Overlay modes `activity`, `power`, `economy` produce visually coherent results.
