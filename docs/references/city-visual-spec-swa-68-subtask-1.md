# City Visual Spec (SWA-68 Subtask 1/12)

## Purpose

Define the source-of-truth visual/technical baseline for isometric roads, sidewalks, trees, parks, vehicles, and water with strict tile precedence, explicit draw order, and frame constraints.

## Visual Style

- Direction: `isometric`, `low-poly`, `clean silhouettes`, `soft contrast`, `zoomed-out readability`.
- Surface rule: use flat/faceted color blocks, not photoreal texture overlays.
- Motion rule: vehicles move steadily; water/tree motion remains subtle and ambient.

## Color Tokens (Light / Dark)

Implementation source: `src/core/cityVisualSpec.ts` (`CITY_TERRAIN_TOKENS`).

| Token | Light | Dark |
| --- | --- | --- |
| `city.road.base` | `#6f7683` | `#343b49` |
| `city.road.edge` | `#586071` | `#2a3140` |
| `city.sidewalk.base` | `#c5ccd6` | `#4a5262` |
| `city.sidewalk.edge` | `#aeb7c3` | `#3e4554` |
| `city.water.base` | `#5fb8d6` | `#2f6f96` |
| `city.water.edge` | `#469ebf` | `#275a79` |
| `city.park.base` | `#6aa85f` | `#3a7246` |
| `city.park.path` | `#c7b289` | `#8c7a5f` |
| `city.tree.leaf` | `#4f8f4b` | `#3d6e3f` |
| `city.tree.trunk` | `#8a6548` | `#5e4637` |
| `city.vehicle.body` | `#f97316` | `#fb923c` |
| `city.vehicle.highlight` | `#fde68a` | `#fdba74` |
| `city.shadow.soft` | `rgba(15, 23, 42, 0.16)` | `rgba(2, 6, 23, 0.45)` |

## Tile Occupancy Precedence

Resolve each tile in this exact order:

1. `building`
2. `road`
3. `sidewalk`
4. `water`
5. `park`
6. `tree`
7. `grass_detail`

Implementation source: `src/core/cityVisualSpec.ts` (`TILE_OCCUPANCY_PRECEDENCE`, `resolveTileOccupant`).

## Tile Rules

| Type | Rule |
| --- | --- |
| `road` | Flat diamond, edge darkening only, minimal lane paint outside core avenues |
| `sidewalk` | One-tile border around roads with seams/corner cuts for readability |
| `water` | Basin-style fill with darker rim and slow shimmer (no high-frequency animation) |
| `park` | Grass variant with sparse curved paths and open walkable negative space |
| `tree` | 2-3 low-poly canopy volumes + short trunk with slight deterministic variation |
| `vehicle` | Compact body block + bright top highlight; role changes via trim/accent only |

## Draw Order (Back to Front)

Render in this strict order:

1. `ground`
2. `roads`
3. `sidewalks`
4. `water`
5. `parks_trees`
6. `buildings`
7. `cars_pedestrians`
8. `overlays`

Implementation source: `src/core/cityVisualSpec.ts` (`CITY_LAYER_ORDER`).

## Constraints

- `No building draw function changes`: keep `drawBuilding` behavior untouched for this issue scope.
- `Performance target`: `60fps` with `16.67ms` frame budget.
- Hot-path rule: avoid per-frame transient allocations in tile render loops.

Implementation source: `src/core/cityVisualSpec.ts` (`CITY_VISUAL_CONSTRAINTS`, `CITY_PERFORMANCE_CONSTRAINTS`).
