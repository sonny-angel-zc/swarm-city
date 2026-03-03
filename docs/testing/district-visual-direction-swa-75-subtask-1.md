# SWA-75 Subtask 1/9: District Visual Direction and References

## Goal

Define distinct art directions for the four district quadrants — Core Architecture (NW),
Dashboard & UX (NE), Observability (SW), and Self-Improvement (SE) — with unique palette
families, material sets, architectural motifs, and semantic color tokens that are clearly
different from one another and from the neutral central government district.

## Deliverable

Module: `src/core/districtTheme.ts`

The module exports:
- `DISTRICT_ART_DIRECTIONS` — design intent record for each quadrant
- `DISTRICT_THEME_TABLE` — per-district, per-mode semantic token tables (private)
- `resolveDistrictArtDirection(quadrantId)` — art direction lookup
- `getAllDistrictArtDirections()` — ordered array for NW → NE → SW → SE
- `resolveDistrictThemeTokens(quadrantId, mode, projectColor?)` — runtime token resolver
- `resolveQuadrantId(zoneId, zoneIndex)` — zone-id to quadrant-id normalizer

## Central Government District (Baseline)

The center zone (agent buildings + plaza + fountain) uses the global city terrain tokens:

| Mode | Character |
|------|-----------|
| Dark | Navy/slate (#0a0e1a canvas, #343b49 roads) — civic, institutional, controlled |
| Light | Cream/warm (#eef3ff canvas, #6f7683 roads) — civic, approachable, daylight |

Motif: Monumental symmetry, plazas, symmetrical avenues. Neutral palette. No project-color
tinting. Each quadrant district must visually contrast this baseline.

## District Art Directions

### NW — Core Architecture — Blue-Steel

**Character:** Foundational systems infrastructure — precise, load-bearing, grid-first engineering.

**Palette family:** Blue-steel (deep navy blues, structural steel grays, cold industrial whites).

**Material set:** Structural steel frames, reinforced concrete slabs, industrial glass with blue
tint, exposed metal grating, dark anodized finishes.

**Architectural motif:** Strict grid column layouts, load-bearing spans, systematic floor-plate
repetition, deep-set windows, monolithic base plinths.

**Distinction from center:** Cold industrial blues contrast warm cream/navy civic center and all
other district palettes.

**Token table:**

| Token | Light | Dark |
|-------|-------|------|
| groundTint | rgba(37, 99, 235, 0.07) | rgba(59, 130, 246, 0.09) |
| parkTint | rgba(37, 99, 235, 0.12) | rgba(59, 130, 246, 0.14) |
| borderStroke | #2563eb | #3b82f6 |
| labelText | #1d4ed8 | #93c5fd |
| taskBuildingBase | #3b82f6 | #2563eb |
| accent | #60a5fa | #60a5fa |

---

### NE — Dashboard & UX — Violet-Lavender

**Character:** Human-facing interface layer — creative, light, and experience-forward.

**Palette family:** Violet-lavender (electric purples, soft lavenders, frosted mauves).

**Material set:** Translucent glass curtain walls, light anodized alloy frames, frosted panel
inserts, soft-edge cladding, matte-lacquered composite surfaces.

**Architectural motif:** Curved facade profiles, double-height open atria, display-wall elevations,
slender spandrel panels, flowing canopy forms.

**Distinction from center:** Violet-lavender and organic curves contrast civic neutrals, the cold
steel of NW, and the functional greens/ambers of SW/SE.

**Token table:**

| Token | Light | Dark |
|-------|-------|------|
| groundTint | rgba(124, 58, 237, 0.07) | rgba(139, 92, 246, 0.09) |
| parkTint | rgba(124, 58, 237, 0.12) | rgba(139, 92, 246, 0.14) |
| borderStroke | #7c3aed | #8b5cf6 |
| labelText | #6d28d9 | #c4b5fd |
| taskBuildingBase | #8b5cf6 | #7c3aed |
| accent | #a78bfa | #a78bfa |

---

### SW — Observability — Emerald-Teal

**Character:** Telemetry, monitoring, and signal infrastructure — analytical, layered, data-dense.

**Palette family:** Emerald-teal (forest greens, signal green, deep teal).

**Material set:** Green-tinted structural glass, perforated sensor-mesh cladding, data-center alloy
racks, antenna mast segments, matte-green composite panels.

**Architectural motif:** Stacked antenna tower arrays, sensor cluster rooftops, dense rack-row
building masses, network node junction forms, elevated cable-tray connectors.

**Distinction from center:** Deep emerald-teal and dense sensor-tower silhouettes contrast civic
neutrals, the cold blue-steel of NW, the soft violet of NE, and the warm amber of SE.

**Token table:**

| Token | Light | Dark |
|-------|-------|------|
| groundTint | rgba(5, 150, 105, 0.07) | rgba(16, 185, 129, 0.09) |
| parkTint | rgba(5, 150, 105, 0.13) | rgba(16, 185, 129, 0.15) |
| borderStroke | #059669 | #10b981 |
| labelText | #047857 | #6ee7b7 |
| taskBuildingBase | #10b981 | #059669 |
| accent | #34d399 | #34d399 |

---

### SE — Self-Improvement — Amber-Copper

**Character:** Adaptive learning and capability growth — warm, evolving, and organic.

**Palette family:** Amber-copper (warm gold, oxidized copper, burnt amber, terracotta).

**Material set:** Warm oxidized copper cladding, adaptive composite panels with textured surface
variation, layered terracotta-finish masonry, living-material facade inserts.

**Architectural motif:** Spiraling growth-ring building forms, layered geological strata profiles,
adaptive stepped-pyramid massing, organically curved facade edges.

**Distinction from center:** Warm amber-copper tones and organic spiraling silhouettes contrast
civic neutrals, cold blue-steel (NW), translucent violet (NE), and dense green clusters (SW).

**Token table:**

| Token | Light | Dark |
|-------|-------|------|
| groundTint | rgba(217, 119, 6, 0.07) | rgba(245, 158, 11, 0.09) |
| parkTint | rgba(217, 119, 6, 0.12) | rgba(245, 158, 11, 0.14) |
| borderStroke | #d97706 | #f59e0b |
| labelText | #b45309 | #fde68a |
| taskBuildingBase | #f59e0b | #d97706 |
| accent | #fbbf24 | #fbbf24 |

---

## Design Constraints Carried Forward

1. **No hardcoded one-mode colors.** All tokens are defined in both `light` and `dark` tables.
2. **Low alpha tints only.** groundTint and parkTint use ≤0.16 alpha to avoid obscuring terrain.
3. **Project color resilience.** `resolveDistrictThemeTokens()` accepts an optional `projectColor`
   override that affects only `borderStroke` and `taskBuildingBase`; tints stay deterministic.
4. **No DOCS_SEED duplication.** This doc has a unique id and path not shared with the
   constraints doc (`district-theming-constraints-swa-75-subtask-1`).
5. **Quadrant identity is stable.** `resolveQuadrantId()` handles Linear UUIDs, explicit quadrant
   ids, and `unassigned-*` zone ids without throwing.

## Validation

```
node scripts/validate-docs-registry.mjs
```

Expected: registry validates cleanly with this entry included.

## Next Subtasks

- Subtask 2: Precompute `tileToDistrictId` lookup map and `districtEdgeTiles` per zone
- Subtask 3: Integrate `resolveDistrictThemeTokens()` into CityCanvas terrain/park passes
- Subtask 4: Add district boundary rendering pass (borderStroke edges)
- Subtask 5: Align strategic panel district chip styling to resolved theme tokens
