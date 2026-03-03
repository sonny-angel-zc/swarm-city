# SWA-75 Subtask 1/5: Research Constraints for Visually Distinct Districts

## Goal
Audit current architecture and runtime constraints for making districts visually distinct with unique theming and clear separation, then provide implementation-ready guidance for SWA-75 subtasks 2-5.

## Code-Verified Baseline

1. District topology is fixed to four quadrants.
- File: `src/core/districtLayout.ts`
- `DISTRICT_QUADRANTS` is hardcoded (`nw`, `ne`, `sw`, `se`) with fixed bounds.
- `buildDistrictZones(...)` always returns exactly 4 zones.

2. Project-to-district assignment is capacity-limited.
- File: `src/core/districtLayout.ts`
- Non-unassigned projects are sorted by `totalIssues` and only first 4 are mapped to quadrants.
- Additional projects are not rendered as separate districts in city canvas.

3. District visuals currently depend on one raw color field.
- Files: `src/core/districtLayout.ts`, `src/components/CityCanvas.tsx`
- District color source is `project.color` (or quadrant fallback color).
- City canvas uses that color directly for:
  - grass/park tint overlays (`+ '35'` / `+ '40'` alpha suffix)
  - task building fill color
  - district text label color

4. Separation exists geometrically, but not as a dedicated visual boundary system.
- Files: `src/core/districtLayout.ts`, `src/components/CityCanvas.tsx`, `src/core/cityLayout.ts`
- Districts are spatially separated by map layout roads/plaza/water exclusions.
- There is no explicit district border pass (no outlines, edge bands, gates, or separators).

5. Tile-to-district lookup is currently linear per tile.
- File: `src/components/CityCanvas.tsx`
- Terrain loop calls `state.districts.find(...)` for park and grass branches per tile.
- This is acceptable at current scale but becomes a hot-path risk if richer per-district theming logic is added.

6. Global app theme and district tinting are independent systems.
- Files: `src/components/CityCanvas.tsx`, `src/core/cityVisualSpec.ts`, `app/globals.css`
- Base terrain palette is theme-aware (`CITY_TERRAIN_TOKENS[light|dark]`).
- District tint colors are not normalized per theme and can reduce contrast depending on project color.

7. Strategic district UI contract exists but is not theme-linked to map districts.
- Files: `src/components/BacklogPanel.tsx`, `src/core/strategicLayerContract.ts`
- Stable selectors and status/progress attributes exist (`data-testid="district-tab-*"`, `data-district-*`).
- No canonical district visual-token contract currently links backlog district chip styling to map district theming.

## Hard Constraints (Current)

1. Preserve deterministic district placement and identity contracts.
- Keep `buildDistrictZones(...)` deterministic for same project input.
- Keep `districtId` and `project.id` usage stable for filtering and test selectors.

2. Do not break city render layering contracts.
- Any district separation visuals must respect the existing pass order owned by `CityCanvas` and `cityCanvasRenderPipeline`.
- District boundaries must not occlude agent buildings in unintended ways.

3. Keep terrain hot path allocation-light.
- Avoid repeated `find(...)`/object creation in per-tile branches when adding richer district styles.
- Prefer precomputed lookup maps keyed by `TileKey`.

4. Maintain theme safety across light/dark modes.
- District theming must remain readable in both `CITY_TERRAIN_TOKENS` modes.
- Avoid hardcoding one-mode-only contrast assumptions.

5. Keep project color input resilient.
- `project.color` can be null/missing and may be inconsistent.
- District theming must always have deterministic fallback palettes.

## Implementation Guidance (Actionable, Ordered)

1. Subtask 2/5: Define a district visual token contract.
- Add a dedicated district theme resolver module (example: `src/core/districtTheme.ts`) that outputs per-district semantic slots:
  - `groundTint`, `parkTint`, `borderStroke`, `labelText`, `taskBuildingBase`, `accent`.
- Inputs should include `baseProjectColor`, `cityThemeMode`, and deterministic fallback by quadrant id.
- Keep one canonical place for tint alpha/contrast normalization.

2. Subtask 3/5: Introduce deterministic separation rendering.
- Add a district-boundary pass in `CityCanvas` after terrain and before buildings.
- Build boundary edges from zone tile adjacency (tile belongs to district and neighbor does not).
- Render subtle border strokes/glow bands using district semantic tokens, with mode-safe alpha caps.

3. Subtask 3/5: Remove hot-path district lookup overhead before adding effects.
- Precompute once per sync/update:
  - `tileToDistrictId: Map<TileKey, string>`
  - optionally `districtEdgeTiles: Map<districtId, TileKey[]>`
- Store these derived maps in memoized canvas-local caches or in state-derived selectors.

4. Subtask 4/5: Align strategic panel and map district theming.
- Add optional district visual data attributes/styles to district tabs (for deterministic UX/data assertions).
- Ensure map district and strategic district share the same resolved theme identity source.

5. Subtask 5/5: Add targeted regression coverage.
- Add unit tests for district theme resolution and fallback behavior.
- Add integration checks that district tabs/map remain synchronized when project colors are null or duplicated.
- Add canvas contract assertions for district boundary pass presence via stable `data-*` markers, not pixel snapshots.

## Risk Register and Mitigations

1. Risk: visually noisy districts reduce map readability.
- Mitigation: cap tint/border opacity and enforce contrast thresholds relative to terrain tokens.

2. Risk: many projects beyond 4 quadrants create unclear expectations.
- Mitigation: explicitly document and surface "top 4 shown on map" behavior in SWA-75 UX/data contract.

3. Risk: project color collisions create indistinct neighboring districts.
- Mitigation: deterministic hue-shift or accent-pattern fallback when resolved colors are too similar.

4. Risk: rendering cost increases from boundary/effect passes.
- Mitigation: precompute tile ownership/edges and render minimal primitives only.

## Validation Plan (Targeted)

1. Registry and docs consistency
- Run: `node scripts/validate-docs-registry.mjs`

2. Contract-level testing (follow-on subtasks)
- Add tests for district theme resolver outputs per mode.
- Add tests for district map/tab synchronization attributes.

3. Runtime regression checks (follow-on subtasks)
- Verify district separation visuals in both light and dark modes.
- Verify no regression in existing strategic district filtering behavior.

## Definition of Done Signals for SWA-75

1. Each rendered district has a unique, deterministic theme identity in both light and dark modes.
2. District boundaries/separation are visually explicit without harming agent/building readability.
3. District map visuals and strategic district UI reference the same resolved theme contract.
4. Hot-path rendering remains deterministic and allocation-light.
5. Validation covers fallback, contrast safety, and district synchronization contracts.
