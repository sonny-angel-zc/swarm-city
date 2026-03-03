import { ROAD_NETWORK_SPEC, ROAD_TILE_MAP, type TileKey } from '@/core/cityLayout';

export type CityThemeMode = 'light' | 'dark';

export const TILE_OCCUPANCY_PRECEDENCE = [
  'building',
  'road',
  'sidewalk',
  'water',
  'park',
  'tree',
  'grass_detail',
] as const;

export type TileOccupant = (typeof TILE_OCCUPANCY_PRECEDENCE)[number];

const parseTileKey = (tile: TileKey): { x: number; y: number } => {
  const [x, y] = tile.split(',').map(Number);
  return { x, y };
};

const isMainRoadCoreTile = (tile: TileKey): boolean => {
  const { x, y } = parseTileKey(tile);
  return ROAD_NETWORK_SPEC.mainCols.includes(x as (typeof ROAD_NETWORK_SPEC.mainCols)[number])
    || ROAD_NETWORK_SPEC.mainRows.includes(y as (typeof ROAD_NETWORK_SPEC.mainRows)[number]);
};

const MAIN_ROAD_EXAMPLE_TILES = ROAD_TILE_MAP.main.filter(isMainRoadCoreTile).slice(0, 8);
const SECONDARY_CONNECTOR_EXAMPLES = Object.fromEntries(
  Object.entries(ROAD_TILE_MAP.secondaryLinksByRole).map(([role, tiles]) => [role, tiles.slice(0, 6)]),
);

export const CITY_ROAD_TILE_LANGUAGE = {
  lineWidthsPx: {
    roadEdge: 0.6,
    roadIntersectionEdge: 0.75,
    laneDash: 1.2,
    laneMedian: 0.75,
    sidewalkEdge: 0.6,
    sidewalkSeam: 0.45,
  },
  contrastRatios: {
    light: {
      roadLaneDashOnRoadBase: 4.1,
      roadMedianOnRoadBase: 2.6,
      sidewalkSeamOnSidewalkBase: 2.2,
      roadEdgeOnRoadBase: 1.8,
    },
    dark: {
      roadLaneDashOnRoadBase: 5.2,
      roadMedianOnRoadBase: 2.9,
      sidewalkSeamOnSidewalkBase: 2.4,
      roadEdgeOnRoadBase: 1.9,
    },
  },
  laneMarkings: {
    dashLengthRatio: 0.22,
    dashGapRatio: 0.16,
    centerInsetRatio: 0.3,
    medianInsetRatio: 0.18,
  },
  intersections: {
    centerPlateInsetRatio: 0.26,
    centerPlateOpacity: {
      light: 0.36,
      dark: 0.28,
    },
    // Product design coordinates for SWA-68 use rows/cols 6-7;
    // these map to centered engine lanes (0-index) in ROAD_NETWORK_SPEC.
    mainRoadDesignRows: [6, 7],
    mainRoadDesignCols: [6, 7],
    engineRows: [...ROAD_NETWORK_SPEC.mainRows],
    engineCols: [...ROAD_NETWORK_SPEC.mainCols],
  },
  sidewalks: {
    borderWidthTiles: 1,
    seamInsetRatio: 0.12,
    seamOpacity: {
      light: 0.3,
      dark: 0.26,
    },
  },
  examples: {
    mainRoadTiles: MAIN_ROAD_EXAMPLE_TILES,
    secondaryConnectorTilesByRole: SECONDARY_CONNECTOR_EXAMPLES,
  },
  copy: {
    legendHeading: 'Road language',
    mainRoadLabel: 'Main avenue',
    intersectionLabel: 'Signal intersection',
    connectorLabel: 'Secondary connector',
    sidewalkLabel: '1-tile sidewalk border',
    laneHelper: 'Dashed lanes appear only on central corridors.',
    connectorHelper: 'Connectors stay unpainted to reduce map noise.',
  },
} as const;

type CityTerrainTokens = {
  roadBase: string;
  roadEdge: string;
  roadMarking: string;
  roadLaneDash: string;
  roadLaneMedian: string;
  roadTextureNoise: string;
  sidewalkBase: string;
  sidewalkEdge: string;
  sidewalkSeam: string;
  sidewalkTextureNoise: string;
  waterBase: string;
  waterEdge: string;
  waterFoam: string;
  waterShimmer: string;
  parkBase: string;
  parkPath: string;
  parkPathEdge: string;
  parkTextureNoise: string;
  grassBase: string;
  grassEdge: string;
  treeLeaf: string;
  treeTrunk: string;
  transitBody: string;
  transitWindow: string;
  vehicleBody: string;
  vehicleHighlight: string;
  pedestrianBody: string;
  pedestrianAccent: string;
  effectGlow: string;
  effectSpark: string;
  softShadow: string;
};

type CityLowPolyElementSpec = {
  element: string;
  silhouette: string;
  detail: string;
  light: string;
  dark: string;
};

type CityLowPolyElementName =
  | 'roads'
  | 'lane_markings'
  | 'intersections'
  | 'sidewalks'
  | 'trees'
  | 'parks'
  | 'cars'
  | 'water_shimmer'
  | 'bridge'
  | 'grass_variation';

export const CITY_TERRAIN_TOKENS: Record<CityThemeMode, CityTerrainTokens> = {
  light: {
    roadBase: '#6f7683',
    roadEdge: '#586071',
    roadMarking: 'rgba(255, 246, 203, 0.34)',
    roadLaneDash: '#f7ebbf',
    roadLaneMedian: '#d8c48e',
    roadTextureNoise: 'rgba(47, 55, 68, 0.1)',
    sidewalkBase: '#c5ccd6',
    sidewalkEdge: '#aeb7c3',
    sidewalkSeam: '#98a3b2',
    sidewalkTextureNoise: 'rgba(85, 96, 114, 0.1)',
    waterBase: '#5fb8d6',
    waterEdge: '#469ebf',
    waterFoam: 'rgba(218, 243, 252, 0.72)',
    waterShimmer: 'rgba(205, 236, 248, 0.3)',
    parkBase: '#6aa85f',
    parkPath: '#c7b289',
    parkPathEdge: '#ae9971',
    parkTextureNoise: 'rgba(52, 96, 50, 0.1)',
    grassBase: '#7fb06b',
    grassEdge: '#689a58',
    treeLeaf: '#4f8f4b',
    treeTrunk: '#8a6548',
    transitBody: '#2f80ed',
    transitWindow: '#bfdbfe',
    vehicleBody: '#f97316',
    vehicleHighlight: '#fde68a',
    pedestrianBody: '#374151',
    pedestrianAccent: '#fb7185',
    effectGlow: 'rgba(56, 189, 248, 0.26)',
    effectSpark: 'rgba(250, 204, 21, 0.78)',
    softShadow: 'rgba(15, 23, 42, 0.16)',
  },
  dark: {
    roadBase: '#343b49',
    roadEdge: '#2a3140',
    roadMarking: 'rgba(255, 211, 122, 0.22)',
    roadLaneDash: '#d8bf88',
    roadLaneMedian: '#ae9461',
    roadTextureNoise: 'rgba(5, 10, 20, 0.22)',
    sidewalkBase: '#4a5262',
    sidewalkEdge: '#3e4554',
    sidewalkSeam: '#343b49',
    sidewalkTextureNoise: 'rgba(12, 16, 26, 0.2)',
    waterBase: '#2f6f96',
    waterEdge: '#275a79',
    waterFoam: 'rgba(196, 229, 245, 0.42)',
    waterShimmer: 'rgba(120, 190, 220, 0.24)',
    parkBase: '#3a7246',
    parkPath: '#8c7a5f',
    parkPathEdge: '#74644d',
    parkTextureNoise: 'rgba(8, 24, 10, 0.2)',
    grassBase: '#3f6a4a',
    grassEdge: '#33563d',
    treeLeaf: '#3d6e3f',
    treeTrunk: '#5e4637',
    transitBody: '#60a5fa',
    transitWindow: '#dbeafe',
    vehicleBody: '#fb923c',
    vehicleHighlight: '#fdba74',
    pedestrianBody: '#cbd5e1',
    pedestrianAccent: '#fda4af',
    effectGlow: 'rgba(56, 189, 248, 0.34)',
    effectSpark: 'rgba(251, 191, 36, 0.88)',
    softShadow: 'rgba(2, 6, 23, 0.45)',
  },
};

export const CITY_LOW_POLY_STYLE_SPEC: {
  direction: string[];
  referenceStyle: string;
  elements: Record<CityLowPolyElementName, CityLowPolyElementSpec>;
} = {
  direction: ['isometric', 'low-poly', 'clean silhouettes', 'soft contrast', 'zoomed-out readability'],
  referenceStyle: 'SimCity/Pocket City-inspired city readability with minimal clutter.',
  elements: {
    roads: {
      element: 'Roads',
      silhouette: 'Flat diamond planes with slight beveled edge contrast.',
      detail: 'Limit texture to subtle shoulder noise; emphasize route legibility first.',
      light: '#6f7683',
      dark: '#343b49',
    },
    lane_markings: {
      element: 'Lane markings',
      silhouette: 'Thin center-guides only on main corridors.',
      detail: 'Dash rhythm stays longer than gaps to avoid noisy zoomed-out flicker.',
      light: '#f7ebbf',
      dark: '#d8bf88',
    },
    intersections: {
      element: 'Intersections',
      silhouette: 'Centered low-contrast plate to signal crossing hierarchy.',
      detail: 'Keep plate inset and semi-transparent so traffic remains primary.',
      light: 'rgba(255, 246, 203, 0.34)',
      dark: 'rgba(255, 211, 122, 0.22)',
    },
    sidewalks: {
      element: 'Sidewalks',
      silhouette: 'One-tile border ring around roads/buildings.',
      detail: 'Seams are sparse and low-frequency for a stable low-poly surface read.',
      light: '#c5ccd6',
      dark: '#4a5262',
    },
    trees: {
      element: 'Trees',
      silhouette: 'Rounded triangular canopy clusters on short trunks.',
      detail: 'No fine branch detail; rely on canopy mass and shadow anchor.',
      light: '#4f8f4b',
      dark: '#3d6e3f',
    },
    parks: {
      element: 'Parks',
      silhouette: 'Flat green pads with one gently curving path accent.',
      detail: 'Use mild facet variance and path-edge contrast only.',
      light: '#6aa85f',
      dark: '#3a7246',
    },
    cars: {
      element: 'Cars',
      silhouette: 'Small capsule bodies with one bright windshield accent.',
      detail: 'Prioritize color pop and motion readability over shape complexity.',
      light: '#f97316',
      dark: '#fb923c',
    },
    water_shimmer: {
      element: 'Water shimmer',
      silhouette: 'Broad moving highlight band parallel to shoreline.',
      detail: 'Shimmer travels slowly to feel calm, not sparkly/noisy.',
      light: 'rgba(205, 236, 248, 0.3)',
      dark: 'rgba(120, 190, 220, 0.24)',
    },
    bridge: {
      element: 'Bridge',
      silhouette: 'Single-span deck with compact side rails over water gap.',
      detail: 'Bridge surface stays road-adjacent tone, rail contrast defines crossing.',
      light: '#8a94a3',
      dark: '#4e5767',
    },
    grass_variation: {
      element: 'Grass variation',
      silhouette: 'Base grass plane with broad patch and edge tint variation.',
      detail: 'Macro tonal shifts only; avoid micro noise that competes with roads.',
      light: '#7fb06b',
      dark: '#3f6a4a',
    },
  },
} as const;

export const CITY_LOW_POLY_TEXTURE_SPEC = {
  road: {
    laneWidthRatio: 0.18,
    laneDashLengthRatio: 0.24,
    laneDashGapRatio: 0.18,
    shoulderNoiseOpacity: 0.1,
  },
  sidewalk: {
    seamInsetRatio: 0.12,
    seamFrequency: 2,
    seamOpacity: 0.24,
  },
  park: {
    pathWidthRatio: 0.16,
    pathCurvature: 0.28,
    facetVariance: 0.06,
  },
  water: {
    shorelineFoamWidthRatio: 0.14,
    shimmerPeriodSec: 3.1,
    shimmerTravelRatio: 0.22,
  },
} as const;

export const CITY_LAYER_ORDER = [
  'ground',
  'roads',
  'sidewalks',
  'water',
  'parks_trees',
  'buildings',
  'cars_pedestrians',
  'overlays',
] as const;

export type CityLayer = (typeof CITY_LAYER_ORDER)[number];

export const CITY_Z_ORDER_RULES = {
  primary: 'layer rank from CITY_LAYER_ORDER',
  secondary: 'tile depth (gridX + gridY)',
  tertiary: 'anchorY in world-space pixels',
  quaternary: 'stable entity id for deterministic ties',
  structureRule: 'building roofs and crowns stay above dynamic underlays',
  curbRule: 'pedestrians stay above roads/sidewalks but below elevated effects',
} as const;

export type CityLayeredItem = {
  layer: CityLayer;
  gridX: number;
  gridY: number;
  anchorY: number;
  stableId: string;
};

export function getCityLayerRank(layer: CityLayer): number {
  return CITY_LAYER_ORDER.indexOf(layer);
}

export function getCityTileDepth(gridX: number, gridY: number): number {
  return gridX + gridY;
}

export function compareCityLayeredItems(a: CityLayeredItem, b: CityLayeredItem): number {
  const layerDelta = getCityLayerRank(a.layer) - getCityLayerRank(b.layer);
  if (layerDelta !== 0) return layerDelta;

  const tileDepthDelta = getCityTileDepth(a.gridX, a.gridY) - getCityTileDepth(b.gridX, b.gridY);
  if (tileDepthDelta !== 0) return tileDepthDelta;

  const anchorDelta = a.anchorY - b.anchorY;
  if (anchorDelta !== 0) return anchorDelta;

  return a.stableId.localeCompare(b.stableId);
}

export const CITY_VISUAL_CONSTRAINTS = {
  noBuildingDrawFunctionChanges: true,
  lockedBuildingDrawFunction: 'drawBuilding',
  targetFps: 60,
  frameBudgetMs: 16.67,
} as const;

export const CITY_PERFORMANCE_CONSTRAINTS = {
  targetFps: 60,
  frameBudgetMs: 16.67,
  maxGroundPasses: 2,
  maxDynamicEntities: 220,
  maxParticles: 260,
  maxShadowsPerFrame: 180,
  avoidPerFrameAllocations: true,
} as const;

type OccupancySets = {
  buildingTiles: Set<TileKey>;
  roadTiles: Set<TileKey>;
  sidewalkTiles: Set<TileKey>;
  waterTiles: Set<TileKey>;
  parkTiles: Set<TileKey>;
  treeTiles?: Set<TileKey>;
};

export function resolveTileOccupant(tile: TileKey, sets: OccupancySets): TileOccupant {
  if (sets.buildingTiles.has(tile)) return 'building';
  if (sets.roadTiles.has(tile)) return 'road';
  if (sets.sidewalkTiles.has(tile)) return 'sidewalk';
  if (sets.waterTiles.has(tile)) return 'water';
  if (sets.parkTiles.has(tile)) return 'park';
  if (sets.treeTiles?.has(tile)) return 'tree';
  return 'grass_detail';
}

export function resolveCityThemeMode(rootTheme: string | undefined): CityThemeMode {
  return rootTheme === 'light' ? 'light' : 'dark';
}
