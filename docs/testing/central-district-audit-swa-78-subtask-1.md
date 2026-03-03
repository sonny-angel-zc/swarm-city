# SWA-78 Subtask 1/10: Central District Visual Audit — Government Plaza

## Goal

Audit the existing central district layout and asset usage. Identify empty/underused tiles, landmark visibility issues, and missing civic-center visual cues. Produce a gap list mapped to grid coordinates and asset needs for SWA-78 subtasks 2–10.

---

## Code-Verified Baseline

### 1. Grid constants and coordinate system

- File: `src/core/types.ts`
- `GRID_SIZE = 24`, `TILE_WIDTH = 64px`, `TILE_HEIGHT = 38px`
- `gridToScreen(gx, gy)` → `{ x: (gx - gy) * 32, y: (gx + gy) * 19 }`
- All tile references below use 0-indexed engine grid coordinates (origin top-left in grid space, top-right in screen space).

### 2. Agent building positions (central district occupants)

- File: `src/core/types.ts` (`BUILDING_CONFIGS`)

| Agent | Building | gridX | gridY | Width | Height | Tile depth (x+y) |
|-------|----------|-------|-------|-------|--------|-----------------|
| PM | City Hall | 11 | 11 | 2 | 90px | 22 |
| Reviewer | Courthouse | 9 | 6 | 2 | 70px | 15 |
| Researcher | Library | 13 | 6 | 2 | 65px | 19 |
| Engineer | Workshop | 7 | 8 | 2 | 75px | 15 |
| Designer | Studio | 15 | 8 | 2 | 70px | 23 |
| QA | Testing Lab | 7 | 14 | 2 | 65px | 21 |
| Devil's Advocate | Dark Tower | 15 | 14 | 1 | 95px | 29 |

- Building footprints are width×width tiles: PM occupies (11,11)+(12,11)+(11,12)+(12,12).
- Footprint tiles are removed from road and water tile sets at module load.

### 3. Plaza tile definition

- File: `src/core/cityLayout.ts` (lines 93–97)
- `PLAZA_TILES` = addRect from PM config: tiles (11,11), (12,11), (11,12), (12,12).
- These tiles render with `terrain.sidewalkBase` fill — no distinct plaza visual treatment.
- `PLAZA_TILES` are excluded from `ROAD_TILES`, `WATER_TILES`, and `TREE_POSITION_EXCLUSION_TILES`.

### 4. Fountain position — confirmed spatial mismatch

- File: `src/components/CityCanvas.tsx` (lines 141–226, 232–316, 318–383)
- `drawFountainBase()` and `drawFountainPlazaProps()` both call `gridToScreen(7.5, 7.5)`.
- Screen position of fountain center: `x = (7.5-7.5)*32 = 0`, `y = (7.5+7.5)*19 = 285`.
- Screen position of City Hall (PM): `x = (11-11)*32 = 0`, `y = (11+11)*19 = 418`.
- **Gap**: Fountain is 133px above City Hall in screen space. The fountain sits at the main road intersection (rows/cols 7–8), not at the PLAZA_TILES location (11–12, 11–12).
- `drawPowerGrid()` arcs around `gridToScreen(7.5, 7.5)` as the "plaza" for routing — consistent with the fountain position, but 133px displaced from the actual civic center (City Hall at 11,11).

### 5. Road network — central corridor

- File: `src/core/cityLayout.ts` (`ROAD_NETWORK_SPEC`)
- Main roads: rows [7, 8], cols [7, 8] → full-width horizontal and vertical corridors.
- Main road intersection center in screen space: `gridToScreen(7.5, 7.5)` → `(0, 285)`.
- The fountain draws directly on top of this intersection. Road lane markings (CityCanvas line 941) apply to `gx === 7 || gx === 8 || gy === 7 || gy === 8` — these overlap with fountain tiles.
- Outer roads: rows [3, 4, 11, 12], cols [3, 4, 11, 12]. Row/col 11–12 run directly through the PLAZA_TILES zone (11,11)+(12,11)+(11,12)+(12,12), but footprint tiles are removed from ROAD_TILES, so plaza tiles correctly take precedence.

### 6. Engineer Workshop straddles main road intersection

- Engineer footprint: (7,8)+(8,8)+(7,9)+(8,9).
- Tiles (7,8) and (8,8) are at main road row 8 and cols 7/8.
- `BUILDING_FOOTPRINT_TILES` deletion from `MAIN_ROAD_TILES` correctly removes them from road rendering.
- **Gap**: Workshop sits at the functional center of the road network cross, not on a spur or approach — visually confusing for "Workshop" placement near the road intersection.

### 7. Static deco building collision with Reviewer

- File: `src/components/CityCanvas.tsx` (line 87)
- `DECO_BUILDINGS` entry: `{ gx: 9, gy: 6, h: 14, color: '#151d30', sprite: NATURE_SPRITES[0], scale: 0.5 }`.
- Reviewer/Courthouse occupies gridX=9, gridY=6 (footprint: (9,6)+(10,6)+(9,7)+(10,7)).
- The deco entry at (9,6) shares the exact anchor tile as the Reviewer building.
- `ALL_DECO_BUILDINGS` rendering loop only skips tiles in `ROAD_TILES` or `PLAZA_TILES` (line 1018) — it does **not** check `BUILDING_FOOTPRINT_TILES` for static deco entries.
- **Gap**: Nature sprite renders on top of Reviewer building base, creating a visual pile-up at (9,6).

### 8. Civic district — no named zone

- File: `src/core/districtLayout.ts`
- Only four quadrant zones exist: `nw` (0–5, 0–5), `ne` (10–15, 0–5), `sw` (0–5, 10–15), `se` (10–15, 10–15).
- The central government zone (approx. tiles x:6–14, y:6–14) has no `DistrictZone` definition.
- Central zone tiles render as plain `grass_detail` or `sidewalk` with no district-linked tint.
- **Gap**: Central area is visually undifferentiated from random grass despite being the government hub of the map.

### 9. Visual height hierarchy — Dark Tower outranks City Hall

- Dark Tower height: 95px (gridX=15, gridY=14). City Hall height: 90px (gridX=11, gridY=11).
- Dark Tower tile depth: 15+14=29. City Hall tile depth: 11+11=22. Dark Tower renders after (atop) City Hall.
- **Gap**: The "villain" building is taller and deeper than the government hub, breaking civic visual hierarchy.

### 10. Sprite semantic mismatches

- File: `src/core/spriteLoader.ts` and `src/core/types.ts`
- Reviewer/Courthouse: uses `police_station.webp` (semantic mismatch — courthouse ≠ police station).
- Dark Tower (Devil's Advocate): uses `residential.webp` (semantic mismatch — dark tower ≠ residence).
- Library/Researcher: uses `university.webp` (acceptable but generic).
- No sprites for civic landmark types: no obelisk, arch, monument, flag, or government tower.

### 11. Available but unused public assets near central district

- File: listing of `/public/assets/buildings/`
- Unused near the central zone: `watertower.webp`, `fire_station.webp`, `school.webp`, `airport.webp`, `stadium.webp`.
- These could serve as secondary civic buildings or district-boundary landmarks.
- No dedicated "government/civic center" landmark sprites exist anywhere in `/public/assets/`.

### 12. District building procedural filler in central area

- File: `src/components/CityCanvas.tsx` (lines 100–129, `DISTRICT_BUILDINGS`)
- `nearCore = gx >= 3 && gx <= 12 && gy >= 3 && gy <= 12` — central tiles are classified as "nearCore" for denser procedural fill.
- Procedural placement: `seed % 3 !== 0` for nearCore tiles — roughly 2/3 of non-excluded tiles get a small deco structure.
- Heights: 11–28px; scale: 0.56–0.80; alpha: 0.82. These tiny filler buildings crowd the approach to City Hall.
- **Gap**: The corridor from the main road junction (7–8, 7–8) toward City Hall (11,11) is visually cluttered with undifferentiated filler rather than a legible civic approach.

---

## Gap List Mapped to Coordinates

| ID | Gap Type | Grid Coordinates | Screen Impact | Priority |
|----|----------|-----------------|---------------|----------|
| G-01 | Fountain/plaza spatial mismatch | Fountain at (7.5,7.5); plaza at (11–12, 11–12) | Fountain and City Hall appear in unrelated locations | Critical |
| G-02 | Deco collision with Reviewer | (9, 6) | Nature sprite overlaid on Courthouse base | Critical |
| G-03 | Road lane markings under fountain | (7,7), (7,8), (8,7), (8,8) | Dashes render beneath fountain basin | High |
| G-04 | PLAZA_TILES visually indistinct | (11,11), (12,11), (11,12), (12,12) | Civic plaza renders same as sidewalk — no identity | High |
| G-05 | No civic district zone | (6–14, 6–14) approx | Central zone untinted, looks like plain grass | High |
| G-06 | Empty/filler civic approach | (9–12, 9–10) | Tiny procedural filler where landmark approach should be | High |
| G-07 | No entrance markers | (8–9, 8–9), (11–12, 8–9) | No gates, arches, or columns marking government zone entry | Medium |
| G-08 | City Hall height hierarchy | (11,11) | Dark Tower (95px) taller than City Hall (90px) | Medium |
| G-09 | Workshop at road intersection | (7–8, 8–9) | Major agent building at map crossroads, not on approach | Medium |
| G-10 | Sprite semantic mismatch — Courthouse | (9,6) | police_station.webp for a courthouse | Medium |
| G-11 | Sprite semantic mismatch — Dark Tower | (15,14) | residential.webp for a dark tower | Medium |
| G-12 | Power grid routes wrong hub | arc center (7.5,7.5) | All power lines arc around road intersection, not City Hall | Medium |
| G-13 | No civic landmark sprite assets | N/A | No obelisk, arch, monument, or flag sprites | Low |
| G-14 | Unused civic-adjacent sprites | N/A | watertower, fire_station, school, airport unused | Low |
| G-15 | No outer-road treatment at plaza edge | (11,12), (12,11) | Outer road rows/cols 11–12 border plaza with no visual emphasis | Low |

---

## Hard Constraints

1. **Do not change `drawBuilding` signature or call sites.**
   - File: `src/core/cityVisualSpec.ts` (`CITY_VISUAL_CONSTRAINTS.noBuildingDrawFunctionChanges = true`)
   - Building rendering must stay in the existing `drawBuilding` callback.

2. **Do not mutate module-level tile sets at runtime.**
   - `PLAZA_TILES`, `ROAD_TILES`, `BUILDING_FOOTPRINT_TILES` are computed once at module load.
   - Any central district overlay must derive from these sets in the renderer, not re-assign them.

3. **Preserve render pass order from `cityCanvasRenderPipeline.ts`.**
   - New civic ground treatment must stay within the `terrain_tiles` pass (ground → roads → sidewalks order).
   - Landmark props must render before agent buildings (same insertion as fountain base).

4. **Stay within 16.67ms frame budget at 60 fps.**
   - `CITY_PERFORMANCE_CONSTRAINTS.frameBudgetMs = 16.67`
   - Per-tile lookups for civic district treatment must use precomputed sets, not per-tile `find()` calls.

5. **All new color values must use `cityVisualSpec.ts` semantic tokens.**
   - Inline `rgba(...)` strings in `drawFountainBase`, `drawPowerGrid` are pre-existing tech debt; do not extend the pattern.

6. **PLAZA_TILES and BUILDING_FOOTPRINT_TILES coordinate ranges must remain stable.**
   - Downstream subtasks reference specific tile coordinates for fountain, plaza props, and power grid routing.
   - G-01 (fountain relocation) requires coordinated update across fountain draw position, plaza prop positions, and power grid hub.

---

## Implementation Guidance (Actionable, Ordered for SWA-78 Subtasks 2–10)

### Subtask 2/10 — Fix deco collision at Reviewer (G-02)
- File: `src/components/CityCanvas.tsx`
- In the `ALL_DECO_BUILDINGS` render loop (line 1018), add `BUILDING_FOOTPRINT_TILES` to the skip check:
  ```ts
  if (ROAD_TILES.has(key) || BUILDING_FOOTPRINT_TILES.has(key)) continue;
  ```
- Also audit `DECO_BUILDINGS` static array entries at (9,6), (10,5) against `BUILDING_FOOTPRINT_TILES` and remove confirmed conflicts.
- Specifically remove the entry `{ gx: 9, gy: 6, ... }` and `{ gx: 9, gy: 6 ... }` from the static array.

### Subtask 3/10 — Define civic district zone (G-05)
- File: `src/core/districtLayout.ts`
- Add a `CIVIC_CENTER_ZONE` constant for the central government area (approx. (6–14, 6–14) minus road, plaza, and building footprint tiles).
- Export a `CIVIC_DISTRICT_TILES: Set<TileKey>` precomputed at module load — analogous to `PARK_CORNER_TILES`.
- In `CityCanvas.tsx` terrain loop, detect civic district tiles and apply a distinct `civicGroundTint` before sidewalk/grass branches.
- Add semantic token `city.civic.ground` to `CITY_TERRAIN_TOKENS` (both light and dark) — e.g., light: `'#c8c0a8'`, dark: `'#2a2c38'`.

### Subtask 4/10 — Differentiate PLAZA_TILES ground (G-04)
- File: `src/components/CityCanvas.tsx` (terrain loop, line 958)
- Add a dedicated `isPlaza` branch before the general `sidewalk` branch:
  ```ts
  if (isPlaza) {
    // civic plaza paving — warmer stone tone than sidewalk
    ctx.fillStyle = terrain.civicPlazaBase; // new token
    ctx.fill();
    ctx.strokeStyle = terrain.civicPlazaEdge;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  } else if (occupant === 'sidewalk') { ... }
  ```
- Add `civicPlazaBase` and `civicPlazaEdge` to `CITY_TERRAIN_TOKENS` (light: `'#d4c9a8'`/`'#bfb48c'`, dark: `'#3a3628'`/`'#2e2b1e'`).

### Subtask 5/10 — Resolve fountain/plaza spatial mismatch (G-01, G-03, G-12)
- Move fountain draw position from `gridToScreen(7.5, 7.5)` to `gridToScreen(11.5, 11.5)` (center of the 2×2 PLAZA_TILES at (11–12, 11–12)).
- Update fountain screen center in `drawFountainBase`, `drawFountainSpray`, `drawFountainPlazaProps` (three call sites, same hard-coded `gridToScreen(7.5, 7.5)`).
- Update planter corner positions in `drawFountainPlazaProps` from `gridToScreen(7,7)/(8,7)/(8,8)/(7,8)` to `gridToScreen(11,11)/(12,11)/(12,12)/(11,12)`.
- Update `drawPowerGrid` arc hub from `gridToScreen(7.5, 7.5)` (line 775) to `gridToScreen(11.5, 11.5)`.
- Verify road lane markings at (7,7)/(7,8)/(8,7)/(8,8) no longer conflict with fountain after move.

### Subtask 6/10 — Civic approach corridor (G-06, G-07)
- File: `src/components/CityCanvas.tsx` (`DECO_BUILDINGS` static array and procedural placement logic)
- Define an `APPROACH_CORRIDOR_TILES: Set<TileKey>` for the tile range (9–12, 8–10) — the visual path from the road crossroads to City Hall.
- Exclude corridor tiles from `DISTRICT_BUILDINGS` procedural fill (`nearCore` condition).
- Add 2–4 static landmark props to the corridor: column/pillar pairs flanking the approach (drawn as tall narrow `drawIsoBox` instances, e.g., 6px wide × 6px deep × 30px tall with `#3a3040` colors).
- These render in the fountain props pass (before buildings), not as separate deco buildings.

### Subtask 7/10 — City Hall visual hierarchy fix (G-08, G-10, G-11)
- File: `src/core/types.ts` (`BUILDING_CONFIGS`)
- Increase City Hall height from 90px to 110px to clearly dominate the skyline.
- Change Reviewer sprite from `police_station.webp` to `university.webp` (pending availability) or add a `courthouse.webp` sprite to `/public/assets/buildings/`. If no asset, use `warehouse.webp` as interim.
- Consider reducing Dark Tower height from 95px to 80px — or leave height and instead increase City Hall to 110px+ so it clearly leads.

### Subtask 8/10 — Civic landmark sprite additions (G-13, G-14)
- Identify 1–2 secondary civic buildings to place at (10, 9) and (12, 9) (flanking the approach corridor just north of City Hall).
- Use `watertower.webp` as a city observation tower at (10, 9) and `fire_station.webp` as an emergency services building at (12, 9).
- Add these as entries in `DECO_BUILDINGS` with higher scale (0.75–0.85) and alpha (0.9) to read clearly as named civic structures.
- Alternatively add a `BuildingConfig`-style civic object for proper label rendering.

### Subtask 9/10 — Outer road visual emphasis at civic zone edge (G-15)
- File: `src/components/CityCanvas.tsx` (terrain road tile branch)
- Detect tiles at outer road rows/cols 11–12 that border PLAZA_TILES:
  - Tiles (11,12), (12,11), (10,12), (13,11), etc.
- Apply a subtle accent fill (`terrain.civicBorderAccent`) at 20–30% opacity on these tiles to visually frame the civic plaza.
- This is within the existing road branch — no new render pass needed.

### Subtask 10/10 — Validation coverage
- Run `npx tsc --noEmit` to confirm type-safety of all new tokens and tile set exports.
- Run `node scripts/validate-docs-registry.mjs` after registering this doc.
- Visual regression: inspect fountain position, approach corridor, and plaza tile differentiation in both light and dark modes.
- Confirm deco–building collision at (9,6) is gone by checking that `BUILDING_FOOTPRINT_TILES` exclusion fires in deco loop.

---

## Risk Register and Mitigations

1. **Risk: Fountain relocation (G-01) breaks coin-toss click detection.**
   - `CityCanvas` has a coin-toss mechanic checking distance from fountain center (line ~484).
   - Mitigation: Update click-distance check origin to match new fountain position `gridToScreen(11.5, 11.5)`.

2. **Risk: City Hall height increase causes sprite/label overflow.**
   - Building labels are rendered above the building at `cy - bh - 8`.
   - Mitigation: Test label clearance at 110px height; adjust label offset if crowded by nearby Reviewer/Researcher buildings.

3. **Risk: Civic district ground tint conflicts with district quadrant coloring.**
   - Central zone sits between all four quadrants — wrong tint could bleed into adjacent quadrant tiles.
   - Mitigation: Restrict `CIVIC_DISTRICT_TILES` strictly to bounds (6–14, 6–14) with explicit exclusion of quadrant tile sets (x1≤5 or x2≥16, y1≤5 or y2≥16).

4. **Risk: Approach corridor exclusion breaks procedural fill density in core.**
   - Removing procedural fill from (9–12, 8–10) creates a visible blank patch if no replacement props are added.
   - Mitigation: Add civic column/pillar props in the same subtask that removes corridor fill (Subtask 6).

5. **Risk: Power grid hub move disrupts existing arc routing.**
   - All 9 power edges use the hub as a bezier control-point reference.
   - Mitigation: Update hub to `gridToScreen(11.5, 11.5)` in `drawPowerGrid`. Verify each edge still arcs correctly without clipping through buildings by visually reviewing all 9 edges after change.

---

## Validation Plan

1. **Docs registry consistency** (run immediately after registering this doc):
   ```
   node scripts/validate-docs-registry.mjs
   ```

2. **TypeScript compile** (after each token addition):
   ```
   npx tsc --noEmit
   ```

3. **Visual inspection gates** (per subtask, no pixel snapshot required):
   - Fountain visible atop City Hall plaza (not at road intersection).
   - PLAZA_TILES render in warm stone tone distinct from road sidewalk.
   - Central zone tiles carry civic tint distinct from quadrant district tints.
   - Deco nature sprite absent from Reviewer building base at (9,6).
   - Approach corridor between (9,8) and (11,11) readable without clutter.
   - City Hall visually taller than Dark Tower in final skyline.

---

## Definition of Done Signals for SWA-78

1. Fountain and plaza props co-located at City Hall plaza (11–12, 11–12).
2. PLAZA_TILES render with a distinct civic ground tone in both light and dark themes.
3. Central district zone (approx. 6–14, 6–14) carries a named civic tint distinct from quadrant districts.
4. Deco–Reviewer collision at (9,6) resolved — no nature sprite overlap on Courthouse.
5. Approach corridor (9–12, 8–10) has legible landmark props replacing filler clutter.
6. City Hall height ≥ 110px, visually dominant over all other agent buildings including Dark Tower.
7. Power grid arcs route around the correct civic hub at (11.5, 11.5).
8. All new semantic tokens present in both `CITY_TERRAIN_TOKENS.light` and `.dark`.
9. TypeScript type-checks clean; docs registry passes validation.
