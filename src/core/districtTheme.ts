/**
 * District Theme — Art directions and semantic token tables for the four district quadrants.
 *
 * Each district has a unique palette family, material set, and architectural motif that
 * differentiates it from the other districts and from the neutral central government district.
 *
 * Resolver functions always return deterministic values — no runtime exceptions.
 * Project color from Linear is accepted as an optional override for borderStroke and
 * taskBuildingBase, while groundTint/parkTint remain from the deterministic table to
 * preserve readability across arbitrary project palette inputs.
 */

import type { CityThemeMode } from './cityVisualSpec';

export type QuadrantId = 'nw' | 'ne' | 'sw' | 'se';

// ---------------------------------------------------------------------------
// Art Direction Reference
// ---------------------------------------------------------------------------

export type DistrictArtDirection = {
  quadrantId: QuadrantId;
  name: string;
  /** High-level design intent and character statement. */
  description: string;
  /** Dominant hue family — guides palette selection and mixing decisions. */
  paletteFamily: string;
  /** Surface materials and construction vocabulary. */
  materialSet: string;
  /** Recurring structural and ornamental motifs. */
  architecturalMotif: string;
  /** Contrast against the central government district. */
  distinctionNote: string;
};

/**
 * Art direction for each of the four quadrant districts.
 *
 * The central government district (center tiles, agent buildings + plaza) uses
 * neutral civic tones — warm cream/ivory (light) and navy/slate (dark) — with
 * monumental symmetry. Each quadrant district must read as clearly distinct.
 */
export const DISTRICT_ART_DIRECTIONS: Record<QuadrantId, DistrictArtDirection> = {
  nw: {
    quadrantId: 'nw',
    name: 'Core Architecture',
    description:
      'Foundational systems infrastructure — precise, load-bearing, grid-first engineering. ' +
      'Cold industrial character communicates depth and structural authority.',
    paletteFamily: 'blue-steel',
    materialSet:
      'Structural steel frames, reinforced concrete slabs, industrial glass with blue tint, ' +
      'exposed metal grating, dark anodized finishes.',
    architecturalMotif:
      'Strict grid column layouts, load-bearing spans, systematic floor-plate repetition, ' +
      'deep-set windows, and monolithic base plinths.',
    distinctionNote:
      'Cold blue-steel palette contrasts the warm cream/navy civic center and the violet, ' +
      'green, and amber palettes of the other three districts.',
  },
  ne: {
    quadrantId: 'ne',
    name: 'Dashboard & UX',
    description:
      'Human-facing interface layer — creative, light, and experience-forward. ' +
      'Violet-lavender palette signals craft and intentional design thinking.',
    paletteFamily: 'violet-lavender',
    materialSet:
      'Translucent glass curtain walls, light anodized alloy frames, frosted panel inserts, ' +
      'soft-edge cladding, and matte-lacquered composite surfaces.',
    architecturalMotif:
      'Curved facade profiles, double-height open atria, display-wall elevations, ' +
      'slender spandrel panels, and flowing canopy forms.',
    distinctionNote:
      'Violet palette and organic curves contrast the rigid steel of NW, the industrial ' +
      'greens of SW, and the warm amber of SE — and diverge from the civic neutrals of center.',
  },
  sw: {
    quadrantId: 'sw',
    name: 'Observability',
    description:
      'Telemetry, monitoring, and signal infrastructure — analytical, layered, data-dense. ' +
      'Emerald-teal palette evokes active sensor networks and real-time visibility.',
    paletteFamily: 'emerald-teal',
    materialSet:
      'Green-tinted structural glass, perforated sensor-mesh cladding, data-center alloy racks, ' +
      'antenna mast segments, and matte-green composite panels.',
    architecturalMotif:
      'Stacked antenna tower arrays, sensor cluster rooftops, dense rack-row building masses, ' +
      'network node junction forms, and elevated cable-tray connectors.',
    distinctionNote:
      'Deep emerald-teal coloration and dense sensor-tower silhouettes contrast the open ' +
      'glass forms of NE, the cold industrial precision of NW, and the warm growth forms of SE.',
  },
  se: {
    quadrantId: 'se',
    name: 'Self-Improvement',
    description:
      'Adaptive learning and capability growth systems — warm, evolving, and organic. ' +
      'Amber-copper palette communicates energy, transformation, and iterative progress.',
    paletteFamily: 'amber-copper',
    materialSet:
      'Warm oxidized copper cladding, adaptive composite panels with textured surface variation, ' +
      'layered terracotta-finish masonry, and living-material facade inserts.',
    architecturalMotif:
      'Spiraling growth-ring building forms, layered geological strata profiles, ' +
      'adaptive stepped-pyramid massing, and organically curved facade edges.',
    distinctionNote:
      'Warm amber-copper tones and organic spiraling silhouettes contrast the cold blue-steel ' +
      'of NW, the translucent violet of NE, and the dense green sensor clusters of SW.',
  },
};

// ---------------------------------------------------------------------------
// Semantic Theme Tokens
// ---------------------------------------------------------------------------

export type DistrictThemeTokens = {
  /** Subtle tint applied to base grass tiles within the district territory. */
  groundTint: string;
  /** Tint applied to park/vegetation tiles within the district. */
  parkTint: string;
  /** Stroke color for district boundary edges. */
  borderStroke: string;
  /** Color for the district name label rendered on the map. */
  labelText: string;
  /** Primary fill color for task buildings within the district. */
  taskBuildingBase: string;
  /** Accent color for selection rings, active indicators, and highlights. */
  accent: string;
};

/**
 * Full per-district, per-mode token table.
 *
 * All tint values use low alpha (0.08–0.16) to remain subtle over terrain.
 * Solid color values target ≥3:1 contrast against surrounding terrain tokens
 * to satisfy WCAG non-text contrast at both theme modes.
 */
const DISTRICT_THEME_TABLE: Record<QuadrantId, Record<CityThemeMode, DistrictThemeTokens>> = {
  // NW — Core Architecture — blue-steel
  nw: {
    light: {
      groundTint: 'rgba(37, 99, 235, 0.07)',
      parkTint: 'rgba(37, 99, 235, 0.12)',
      borderStroke: '#2563eb',
      labelText: '#1d4ed8',
      taskBuildingBase: '#3b82f6',
      accent: '#60a5fa',
    },
    dark: {
      groundTint: 'rgba(59, 130, 246, 0.09)',
      parkTint: 'rgba(59, 130, 246, 0.14)',
      borderStroke: '#3b82f6',
      labelText: '#93c5fd',
      taskBuildingBase: '#2563eb',
      accent: '#60a5fa',
    },
  },

  // NE — Dashboard & UX — violet-lavender
  ne: {
    light: {
      groundTint: 'rgba(124, 58, 237, 0.07)',
      parkTint: 'rgba(124, 58, 237, 0.12)',
      borderStroke: '#7c3aed',
      labelText: '#6d28d9',
      taskBuildingBase: '#8b5cf6',
      accent: '#a78bfa',
    },
    dark: {
      groundTint: 'rgba(139, 92, 246, 0.09)',
      parkTint: 'rgba(139, 92, 246, 0.14)',
      borderStroke: '#8b5cf6',
      labelText: '#c4b5fd',
      taskBuildingBase: '#7c3aed',
      accent: '#a78bfa',
    },
  },

  // SW — Observability — emerald-teal
  sw: {
    light: {
      groundTint: 'rgba(5, 150, 105, 0.07)',
      parkTint: 'rgba(5, 150, 105, 0.13)',
      borderStroke: '#059669',
      labelText: '#047857',
      taskBuildingBase: '#10b981',
      accent: '#34d399',
    },
    dark: {
      groundTint: 'rgba(16, 185, 129, 0.09)',
      parkTint: 'rgba(16, 185, 129, 0.15)',
      borderStroke: '#10b981',
      labelText: '#6ee7b7',
      taskBuildingBase: '#059669',
      accent: '#34d399',
    },
  },

  // SE — Self-Improvement — amber-copper
  se: {
    light: {
      groundTint: 'rgba(217, 119, 6, 0.07)',
      parkTint: 'rgba(217, 119, 6, 0.12)',
      borderStroke: '#d97706',
      labelText: '#b45309',
      taskBuildingBase: '#f59e0b',
      accent: '#fbbf24',
    },
    dark: {
      groundTint: 'rgba(245, 158, 11, 0.09)',
      parkTint: 'rgba(245, 158, 11, 0.14)',
      borderStroke: '#f59e0b',
      labelText: '#fde68a',
      taskBuildingBase: '#d97706',
      accent: '#fbbf24',
    },
  },
};

// ---------------------------------------------------------------------------
// Utility: quadrant-order fallback list
// ---------------------------------------------------------------------------

const QUADRANT_ORDER: QuadrantId[] = ['nw', 'ne', 'sw', 'se'];

const EXPLICIT_QUADRANT_IDS = new Set<string>(QUADRANT_ORDER);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the art direction spec for a quadrant.
 * Always deterministic — no undefined return.
 */
export function resolveDistrictArtDirection(quadrantId: QuadrantId): DistrictArtDirection {
  return DISTRICT_ART_DIRECTIONS[quadrantId];
}

/**
 * Returns all four art direction specs in NW → NE → SW → SE order.
 */
export function getAllDistrictArtDirections(): DistrictArtDirection[] {
  return QUADRANT_ORDER.map((id) => DISTRICT_ART_DIRECTIONS[id]);
}

/**
 * Resolves semantic theme tokens for a district.
 *
 * If `projectColor` is a valid 3–8 digit hex string, it overrides
 * `borderStroke` and `taskBuildingBase` only. Ground and park tints
 * remain from the deterministic table to preserve legibility regardless
 * of what color Linear assigns to a project.
 */
export function resolveDistrictThemeTokens(
  quadrantId: QuadrantId,
  mode: CityThemeMode,
  projectColor?: string | null,
): DistrictThemeTokens {
  const base = DISTRICT_THEME_TABLE[quadrantId][mode];

  if (projectColor && /^#[0-9A-Fa-f]{3,8}$/.test(projectColor)) {
    return {
      ...base,
      borderStroke: projectColor,
      taskBuildingBase: projectColor,
    };
  }

  return base;
}

/**
 * Resolves a QuadrantId from a zone id string or zone index.
 *
 * Zone ids produced by `buildDistrictZones()` are either:
 * - Explicit quadrant ids ('nw', 'ne', 'sw', 'se')
 * - Linear project UUIDs (not a quadrant id)
 * - Fallback strings like 'unassigned-nw'
 *
 * When the zone id is not an explicit quadrant id, falls back to
 * position-based mapping using the zone's index in the zones array
 * (zones are always emitted in NW → NE → SW → SE order).
 */
export function resolveQuadrantId(zoneId: string, zoneIndex: number): QuadrantId {
  if (EXPLICIT_QUADRANT_IDS.has(zoneId)) {
    return zoneId as QuadrantId;
  }

  // 'unassigned-nw' style fallback ids embed the quadrant suffix
  for (const qid of QUADRANT_ORDER) {
    if (zoneId.endsWith(`-${qid}`)) return qid;
  }

  // Position-based fallback: zones are always in NW/NE/SW/SE order
  return QUADRANT_ORDER[zoneIndex % 4];
}
