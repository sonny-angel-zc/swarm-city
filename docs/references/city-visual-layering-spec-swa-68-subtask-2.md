# City Visual Layering Spec (SWA-68 Subtask 2/11)

## Purpose

Define the concise source-of-truth for SimCity/Pocket City-inspired low-poly city visuals and layering across roads, lane markings, intersections, sidewalks, trees, parks, cars, water shimmer, bridge, and grass variation in light/dark modes.

## Style Direction

- Isometric low-poly forms with clean silhouettes.
- Soft contrast tuned for zoomed-out readability before micro detail.
- Minimal clutter: texture and markings support navigation, not decoration.

## Element Spec (Light / Dark)

| Element | Silhouette rule | Detail rule | Light | Dark |
| --- | --- | --- | --- | --- |
| Roads | Flat diamond planes with beveled edge contrast | Keep shoulder texture subtle; route legibility first | `#6f7683` | `#343b49` |
| Lane markings | Thin center-guides on main corridors only | Dash rhythm longer than gap to reduce flicker | `#f7ebbf` | `#d8bf88` |
| Intersections | Centered low-contrast crossing plate | Inset + semi-transparent so traffic stays primary | `rgba(255, 246, 203, 0.34)` | `rgba(255, 211, 122, 0.22)` |
| Sidewalks | 1-tile border ring around roads/buildings | Sparse seams; low-frequency breakup only | `#c5ccd6` | `#4a5262` |
| Trees | Rounded triangular canopy clusters on short trunks | No branch micro-detail; canopy mass carries read | `#4f8f4b` | `#3d6e3f` |
| Parks | Flat green pads with one curving path accent | Mild facet variance and restrained path edge contrast | `#6aa85f` | `#3a7246` |
| Cars | Compact capsule body + bright windshield accent | Color pop and motion readability over geometry detail | `#f97316` | `#fb923c` |
| Water shimmer | Broad moving highlight band near shoreline | Slow shimmer travel; avoid sparkly noise | `rgba(205, 236, 248, 0.3)` | `rgba(120, 190, 220, 0.24)` |
| Bridge | Single-span deck with compact side rails | Bridge deck near road tone, rails define crossing | `#8a94a3` | `#4e5767` |
| Grass variation | Base grass plane + broad patch variation | Macro tonal shifts only; no busy micro-noise | `#7fb06b` | `#3f6a4a` |

Implementation source: `src/core/cityVisualSpec.ts` (`CITY_LOW_POLY_STYLE_SPEC`, `CITY_TERRAIN_TOKENS`).

## Placement Maps (Concrete Coordinates)

Coordinate maps are exported as deterministic, sorted tile keys from `src/core/cityLayout.ts`.

| Map | Constant |
| --- | --- |
| Main + secondary roads | `ROAD_TILE_MAP.main`, `ROAD_TILE_MAP.secondaryLinks`, `ROAD_TILE_MAP.secondaryLinksByRole`, `ROAD_TILE_MAP.all` |
| Sidewalk coverage | `SIDEWALK_COVERAGE_MAP` |
| Tree positions + exclusions | `TREE_POSITION_MAP.positions`, `TREE_POSITION_MAP.exclusions` |
| 2x2 park zones | `PARK_ZONE_MAP` (`nw`, `ne`, `sw`, `se`) |
| Water-edge adjacency tiles | `WATER_EDGE_TILE_MAP` |
| Bridge crossing tile | `BRIDGE_CROSSING_TILE` |

Bridge crossing contract: `BRIDGE_CROSSING_TILE = "7,0"` (0-indexed grid).

## Tile Occupancy Precedence

Per tile, resolve occupancy in this strict order:

1. `building`
2. `road`
3. `sidewalk`
4. `water`
5. `park`
6. `tree`
7. `grass_detail`

Implementation source: `src/core/cityVisualSpec.ts` (`TILE_OCCUPANCY_PRECEDENCE`, `resolveTileOccupant`).

## Render Layer Stack (Back to Front)

Apply this pass order each frame:

1. `ground`: base terrain/fill tiles
2. `roads`: road surfaces and road-only detail
3. `sidewalks`: sidewalk surfaces and seam detail
4. `water`: water basins, shoreline edge, shimmer
5. `parks_trees`: park surfaces, paths, and static tree props
6. `buildings`: building bases, walls, roofs
7. `cars_pedestrians`: all dynamic traffic and pedestrian entities
8. `overlays`: effects, interaction rings, outlines, labels

Implementation source: `src/core/cityVisualSpec.ts` (`CITY_LAYER_ORDER`).

## Lane And Texture Detail Tokens

Low-poly detail controls for render pass tuning are exported from `src/core/cityVisualSpec.ts`:

- `CITY_TERRAIN_TOKENS[mode].roadLaneDash`, `roadLaneMedian`, `roadTextureNoise`
- `CITY_TERRAIN_TOKENS[mode].sidewalkSeam`, `sidewalkTextureNoise`
- `CITY_TERRAIN_TOKENS[mode].parkPathEdge`, `parkTextureNoise`
- `CITY_TERRAIN_TOKENS[mode].waterFoam`, `waterShimmer`
- `CITY_LOW_POLY_TEXTURE_SPEC` (lane widths/dash rhythm, seam cadence, park facet variance, water shimmer timing)
