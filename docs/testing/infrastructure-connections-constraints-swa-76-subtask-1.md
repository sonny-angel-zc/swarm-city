# SWA-76 Subtask 1/5: Research Constraints for Infrastructure Connections

## Goal
Audit current architecture and runtime constraints for "Infrastructure connections: roads, rail lines, and power grid between districts". Document actionable implementation guidance for SWA-76 subtasks 2–5.

## Code-Verified Baseline

### 1. Road network exists but districts are not explicitly connected by arterials.
- File: `src/core/cityLayout.ts`
- `ROAD_NETWORK_SPEC` defines two tiers:
  - `mainRows/mainCols: [7, 8]` — central cross (government district spine)
  - `outerRows/outerCols: [3, 4, 11, 12]` — outer rings that physically separate quadrants
- Outer road bands are included in `ROAD_TILES` and `ROAD_TILE_MAP.all` but not in `ROAD_TILE_MAP.main`.
- `ROAD_NETWORK_SPEC` (including `outerRows`/`outerCols`) is exported and accessible to the renderer.
- There is no distinct visual treatment for outer-ring tiles vs secondary connectors in `CityCanvas.tsx`. All non-main roads render with the same color, no lane markings, and no emphasis.
- **Gap**: Outer road bands are the natural inter-district arterials but are visually indistinguishable from building spur connectors.

### 2. Rail/transit infrastructure is absent but the render pass slot is reserved.
- File: `src/core/cityCanvasRenderPipeline.ts`
- `CITY_CANVAS_RENDER_PASSES` includes `'transit_underlay'` (slot between `power_grid_underlay` and `agent_buildings`).
- `CITY_CANVAS_INSERTION_SLOTS.transitUnderlayUpgrade` is also reserved for "Road-aware vehicle paths and moving entities that should remain behind buildings."
- File: `src/core/cityVisualSpec.ts`
- `CITY_TERRAIN_TOKENS` includes `transitBody` and `transitWindow` in both `light` and `dark` modes.
- `CitySemanticColorToken` includes `city.transit.body` and `city.transit.window`.
- `CITY_OVERLAY_CONTRACT` references `transitEmphasis` across all three overlay modes (2 in `activity`, 3 in `power`, 1 in `economy`).
- File: `src/components/CityCanvas.tsx`
- The `transit_underlay` pass is not implemented. The vehicle loop that runs in its place renders animated diamond shapes (data-packet metaphors), not rail routes or track geometry.
- **Gap**: No rail route definitions, no track tile set, no rail rendering function exists anywhere.

### 3. Power grid exists as agent-to-agent connections, not district-to-district infrastructure.
- File: `src/components/CityCanvas.tsx` (lines 61–71, 750–813)
- `POWER_EDGES` is a fixed star topology: PM → each agent + engineer→qa, designer→reviewer, researcher→reviewer.
- `drawPowerGrid()` renders quadratic bezier curves from building screen-center to building screen-center, arcing around the fountain plaza via a computed perpendicular offset.
- Active edges show animated pulse dots and a wider glow stroke.
- `overlay === 'power'` increases `baseAlpha` from `0.15` to `0.6` and `lineWidth` from `1.2` to `2.5`.
- The power overlay is skipped when `overlay === 'economy'`.
- **Gap**: No district-level power connections exist. Power represents agent data-flow, not geographic district infrastructure. District quadrant centers are never used as connection nodes.

### 4. District quadrant geometry is fixed and well-defined.
- File: `src/core/districtLayout.ts`
- Quadrant bounds (0-indexed, inclusive):
  - `nw`: x1:0, y1:0, x2:5, y2:5
  - `ne`: x1:10, y1:0, x2:15, y2:5
  - `sw`: x1:0, y1:10, x2:5, y2:15
  - `se`: x1:10, y1:10, x2:15, y2:15
- Center grid point for each quadrant: midpoint of its bounds (e.g., `nw` center ≈ `(2.5, 2.5)`).
- The center government zone (approx. rows/cols 6–9) contains agent buildings and is not part of any district quadrant.
- Water occupies the perimeter ring (row 0, row 15, col 0, col 15); interior grid is water-free, so district-to-district paths are safe without bridges.

### 5. Overlay contract labels `power` mode as "Transit Grid" — a semantic mismatch.
- File: `src/core/cityOverlayContract.ts`
- `CITY_OVERLAY_CONTRACT.power.label` is `'Transit Grid'` and its `rendererIntent` mentions "transit/power network readability and active connection diagnostics."
- The actual renderer only draws agent data-flow bezier lines, not transit routes.
- This naming ambiguity needs resolution before adding true transit/infrastructure — either rename the overlay mode or keep the label and ensure the renderer delivers the described behavior.

### 6. No infrastructure-specific semantic color tokens exist.
- File: `src/core/cityVisualSpec.ts`
- Existing tokens cover roads, sidewalks, water, parks, trees, transit (body/window), vehicles, and pedestrians.
- There are no tokens for:
  - `city.infra.rail.track`, `city.infra.rail.tie` (rail tracks)
  - `city.infra.power.line`, `city.infra.power.node` (district power lines)
  - `city.infra.road.arterial` (inter-district road emphasis)
- The `effectGlow` and `effectSpark` tokens exist and could be extended for infrastructure glow FX.

### 7. Hot-path performance baseline is established.
- File: `src/core/cityVisualSpec.ts`
- `CITY_PERFORMANCE_CONSTRAINTS`: 60 fps target, 16.67ms frame budget, max 220 dynamic entities, max 260 particles.
- The terrain loop is 16×16 = 256 iterations per frame; infrastructure overlay passes must not add per-tile work.
- Infrastructure connections (roads, rail, power) should operate on O(edges) or O(routes), not O(tiles).

---

## Hard Constraints

1. **Preserve the render pass order defined in `cityCanvasRenderPipeline.ts`.**
   - Rail lines must render in the `transit_underlay` slot (after `power_grid_underlay`, before `agent_buildings`).
   - Inter-district road emphasis (terrain-level) must remain within the `terrain_tiles` pass.
   - Do not insert new named passes without updating `CITY_CANVAS_RENDER_PASSES`.

2. **Road tile sets in `cityLayout.ts` are module-level constants — no runtime mutation.**
   - `ROAD_TILES`, `ROAD_TILE_MAP`, and `ROAD_NETWORK_SPEC` are computed once at module load.
   - Inter-district arterial styling must be derived in the renderer (or a new exported set), not by mutating existing sets.
   - `ROAD_NETWORK_SPEC` is already exported; `outerRows`/`outerCols` can be imported directly.

3. **Keep frame budget within 16.67ms at 60 fps.**
   - Infrastructure routes must be precomputed (not BFS-computed per frame).
   - Use static route arrays (coordinate pairs or tile sequences) for rail and district power lines.
   - Avoid `Set.has()` lookups inside animation-only sections; precompute route geometry as screen-space points.

4. **All new color values must use `cityVisualSpec.ts` semantic tokens.**
   - Do not inline RGB strings for infrastructure elements (current `drawPowerGrid` uses inline strings — this is a pre-existing issue, do not extend this pattern).
   - Add infrastructure tokens to `CITY_TERRAIN_TOKENS` (both `light` and `dark` entries) and corresponding `CitySemanticColorToken` entries.

5. **Infrastructure must be readable in both `light` and `dark` theme modes.**
   - Test contrast against `terrain.roadBase`, `terrain.grassBase`, and `terrain.parkBase` in both modes.
   - Apply mode-safe alpha caps: rail tracks ≤ 0.85, power lines ≤ 0.9 at prominent, district road emphasis ≤ 0.6.

6. **District quadrant bounds and IDs must remain stable.**
   - Infrastructure connection topology depends on quadrant IDs and bounds.
   - Do not change `DISTRICT_QUADRANTS` or `DistrictZone.id` format as part of this feature.

7. **Overlay mode contract must be respected.**
   - `transitEmphasis` drives rail/transit visibility; read from `CITY_OVERLAY_CONTRACT[overlayMode].transitEmphasis`.
   - Infrastructure connections hidden at `emphasis: 0`, supporting at `1`, primary at `2`, dominant at `3`.
   - The `power` overlay mode (currently "Transit Grid") must produce a visually coherent result after rail and district power lines are added.

---

## Implementation Guidance (Actionable, Ordered)

### Subtask 2/5 — Define infrastructure types and static route data
- Create `src/core/infraConnections.ts`:
  - Export `DISTRICT_NODES: Record<'nw'|'ne'|'sw'|'se', { gridX: number; gridY: number }>` — midpoints of each quadrant's non-excluded bounds. Start with approximate centers (e.g., `nw: { gridX: 2, gridY: 2 }`).
  - Export `RAIL_ROUTES: Array<{ from: 'nw'|'ne'|'sw'|'se'|'center', to: 'nw'|'ne'|'sw'|'se'|'center', waypoints?: Array<{x: number, y: number}> }>` — fixed routes following the outer road bands. Route rail along `outerRows`/`outerCols` grid corridors to align with road geometry.
  - Export `DISTRICT_POWER_EDGES: Array<{ from: 'nw'|'ne'|'sw'|'se', to: 'nw'|'ne'|'sw'|'se' }>` — district-to-district power connections (ring topology: nw→ne, ne→se, se→sw, sw→nw + diagonals nw→se, ne→sw).
  - Type: `InfraEdge`, `RailRoute`, `DistrictPowerEdge`.
- Add infrastructure semantic color tokens to `cityVisualSpec.ts`:
  - `city.infra.rail.track` (light: `'#5a6478'`, dark: `'#3a4258'`)
  - `city.infra.rail.tie` (light: `'#6b7489'`, dark: `'#2e3548'`)
  - `city.infra.power.line` (light: `'rgba(96,165,250,0.7)'`, dark: `'rgba(96,165,250,0.5)'`)
  - `city.infra.road.arterial` (light: `'rgba(255,220,140,0.22)'`, dark: `'rgba(255,211,100,0.18)'`)
  - Extend `CityTerrainTokens`, `CitySemanticColorToken`, and `CITY_TERRAIN_TOKENS` for both modes.

### Subtask 3/5 — Road arterial emphasis and rail line rendering
- **Road arterial emphasis** (inside the `terrain_tiles` pass in `CityCanvas.tsx`):
  - When rendering a `road` tile, check if `(gx === outerRow || gy === outerRow || gx === outerCol || gy === outerCol)` using `ROAD_NETWORK_SPEC.outerRows/outerCols`.
  - Apply a secondary overlay fill (`terrain.infra.road.arterial` token) scaled by `overlayContract.roadsEmphasis`.
  - Keep this as a cheap `fillStyle` + `fill()` after the base road fill — no extra loop.
- **Rail line rendering** (new `drawRailLines()` function in `CityCanvas.tsx`, called in `transit_underlay` slot):
  - For each `RAIL_ROUTE`, compute screen-space waypoints using `gridToScreen()`.
  - Draw track geometry: two parallel strokes offset perpendicular to route direction (track gauge ~3px apart in screen space), plus short perpendicular cross-ties every ~8px.
  - Scale alpha by `overlayContract.transitEmphasis / 3`.
  - Animated train dot: single moving point along each route using `(time * speed + routeIndex * offset) % 1`.
  - Use `city.infra.rail.track` and `city.infra.rail.tie` tokens.

### Subtask 4/5 — District-level power grid connections
- Extend or parallel `drawPowerGrid()` with a new `drawDistrictPowerGrid()` function:
  - Render edges from `DISTRICT_POWER_EDGES` using district node screen positions from `DISTRICT_NODES`.
  - Use straight lines (no fountain-avoidance arc needed — district centers are far from plaza).
  - Alpha scales with `overlayContract.transitEmphasis` (consistent with "Transit Grid" overlay mode intent).
  - Use `city.infra.power.line` token; glow stroke at `lineWidth * 3` and `alpha * 0.25` when prominent.
  - Add pylon markers at district center nodes: small diamond (3×3px) at each `DISTRICT_NODES[quad]` screen position.
  - Skip rendering when `overlay === 'economy'` (consistent with existing `drawPowerGrid` behavior).

### Subtask 5/5 — Validation and overlay coherence
- Verify `transit_underlay` slot renders correctly (rail before buildings) by adding a `data-testid="rail-underlay"` canvas attribute or a visible log in dev builds.
- Add Playwright assertions (in `smoke.spec.ts` or a new `infrastructure.spec.ts`):
  - Overlay toggle to `power` mode shows increased rail/power emphasis.
  - Overlay toggle to `economy` mode hides district power lines.
  - `activity` mode shows baseline infrastructure at supporting emphasis.
- Run `node scripts/validate-docs-registry.mjs` after each subtask to confirm registry consistency.
- Run `npm run test:smoke` to confirm no regressions in terrain/building rendering.

---

## Risk Register and Mitigations

1. **Risk: Rail line geometry clips through buildings or agent buildings.**
   - Mitigation: Rail routes follow outer road band corridors (rows/cols 3–4, 11–12), which are outside the central agent zone (rows/cols 5–10). Verify by checking that no route waypoint lands on `BUILDING_FOOTPRINT_TILES`.

2. **Risk: Outer road arterial emphasis makes secondary connectors visually similar to main roads.**
   - Mitigation: Apply arterial tint only to tiles in `ROAD_NETWORK_SPEC.outerRows/outerCols`, not to secondary connectors. Use `ROAD_TILE_MAP.secondaryLinks` as an exclusion set.

3. **Risk: Frame budget exceeded by rail track cross-tie rendering.**
   - Mitigation: Precompute cross-tie screen positions once (not per frame). Store as static arrays in module scope alongside route definitions.

4. **Risk: District power lines overlap the existing agent power grid, creating visual confusion.**
   - Mitigation: Use distinct line style (dashed for district power, solid for agent power) and a different color token. District power lines render thinner (`lineWidth: 0.8`) and more transparent (`alpha * 0.6`).

5. **Risk: "Transit Grid" overlay label mismatch creates UX confusion when rail is added.**
   - Mitigation: Update `CITY_OVERLAY_CONTRACT.power.helper` to reference both transit and power: `'Focus rail routes, district power links, and agent connection stress'`. Keep `mode: 'power'` key stable for test selectors.

---

## Validation Plan

1. **Docs registry consistency** — run after registering this doc:
   ```
   node scripts/validate-docs-registry.mjs
   ```

2. **Type-check** — confirm new tokens and types compile:
   ```
   npx tsc --noEmit
   ```

3. **Smoke tests** — no terrain/building rendering regressions:
   ```
   npm run test:smoke
   ```

4. **Theme regression** — infrastructure readable in both modes:
   ```
   npm run test:theme:guardrails
   ```

---

## Definition of Done Signals for SWA-76

1. Inter-district road arterials (outer rings) have distinct visual emphasis scaled by `roadsEmphasis`.
2. Rail lines render in the `transit_underlay` pass with animated trains and scale with `transitEmphasis`.
3. District-level power connections form a ring/mesh topology between quadrant centers and scale with `transitEmphasis`.
4. All infrastructure colors use semantic tokens from `cityVisualSpec.ts` (no inline RGB strings).
5. All infrastructure passes are theme-safe in both `light` and `dark` modes.
6. Frame budget remains ≤ 16.67ms at 60 fps after all infrastructure passes are added.
7. Overlay modes (`activity`, `power`, `economy`) produce visually coherent results with the new infrastructure.
