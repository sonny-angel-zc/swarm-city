import { BUILDING_CONFIGS, GRID_SIZE, type AgentRole } from '@/core/types';

export type TileKey = `${number},${number}`;

type Tile = { x: number; y: number };
type ParkCorner = 'nw' | 'ne' | 'sw' | 'se';

const ROAD_NETWORK_SPEC = {
  // 0-indexed engine coordinates for a 24x24 grid (center at 11.5).
  mainRows: [11, 12],
  mainCols: [11, 12],
  outerRows: [4, 5, 18, 19],
  outerCols: [4, 5, 18, 19],
} as const;

const MAIN_ROAD_ROWS = ROAD_NETWORK_SPEC.mainRows;
const MAIN_ROAD_COLS = ROAD_NETWORK_SPEC.mainCols;
const OUTER_ROAD_ROWS = ROAD_NETWORK_SPEC.outerRows;
const OUTER_ROAD_COLS = ROAD_NETWORK_SPEC.outerCols;

const BRIDGE_COLS = [4, 5, 11, 12, 18, 19];
const BRIDGE_ROWS = [4, 5, 11, 12, 18, 19];

const CARDINAL_STEPS: Tile[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const keyOf = (x: number, y: number): TileKey => `${x},${y}`;

const parseKey = (key: string): Tile => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};

const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;

const addRect = (set: Set<TileKey>, x: number, y: number, w: number, h: number) => {
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      const tx = x + dx;
      const ty = y + dy;
      if (inBounds(tx, ty)) set.add(keyOf(tx, ty));
    }
  }
};

const addRoadBands = (set: Set<TileKey>, rows: readonly number[], cols: readonly number[]) => {
  for (let i = 0; i < GRID_SIZE; i++) {
    for (const row of rows) set.add(keyOf(i, row));
    for (const col of cols) set.add(keyOf(col, i));
  }
};

const sortedTileKeys = (tiles: Iterable<TileKey>): TileKey[] =>
  Array.from(tiles).sort((a, b) => {
    const ap = parseKey(a);
    const bp = parseKey(b);
    if (ap.y !== bp.y) return ap.y - bp.y;
    return ap.x - bp.x;
  });

const BUILDING_FOOTPRINT_TILES = new Set<TileKey>();
const BUILDING_FOOTPRINTS_BY_ROLE: Record<AgentRole, Set<TileKey>> = {
  pm: new Set<TileKey>(),
  engineer: new Set<TileKey>(),
  designer: new Set<TileKey>(),
  qa: new Set<TileKey>(),
  devils_advocate: new Set<TileKey>(),
  reviewer: new Set<TileKey>(),
  researcher: new Set<TileKey>(),
};

for (const cfg of BUILDING_CONFIGS) {
  const footprintWidth = Math.max(1, cfg.width);
  const footprintDepth = Math.max(1, cfg.width);
  const roleTiles = BUILDING_FOOTPRINTS_BY_ROLE[cfg.role];

  for (let dx = 0; dx < footprintWidth; dx++) {
    for (let dy = 0; dy < footprintDepth; dy++) {
      const tx = cfg.gridX + dx;
      const ty = cfg.gridY + dy;
      if (!inBounds(tx, ty)) continue;
      const tile = keyOf(tx, ty);
      BUILDING_FOOTPRINT_TILES.add(tile);
      roleTiles.add(tile);
    }
  }
}

const PM = BUILDING_CONFIGS.find((cfg) => cfg.role === 'pm');
const PLAZA_TILES = new Set<TileKey>();
if (PM) {
  addRect(PLAZA_TILES, PM.gridX, PM.gridY, PM.width, PM.width);
}

const MAIN_ROAD_TILES = new Set<TileKey>();
addRoadBands(MAIN_ROAD_TILES, MAIN_ROAD_ROWS, MAIN_ROAD_COLS);
for (const tile of PLAZA_TILES) MAIN_ROAD_TILES.delete(tile);
for (const tile of BUILDING_FOOTPRINT_TILES) MAIN_ROAD_TILES.delete(tile);

const ROAD_TILES = new Set<TileKey>(MAIN_ROAD_TILES);
addRoadBands(ROAD_TILES, OUTER_ROAD_ROWS, OUTER_ROAD_COLS);
for (const tile of PLAZA_TILES) ROAD_TILES.delete(tile);
for (const tile of BUILDING_FOOTPRINT_TILES) ROAD_TILES.delete(tile);

const ROAD_INTERSECTION_TILES = new Set<TileKey>();
for (const tile of ROAD_TILES) {
  const { x, y } = parseKey(tile);
  const hasHorizontal = ROAD_TILES.has(keyOf(x - 1, y)) && ROAD_TILES.has(keyOf(x + 1, y));
  const hasVertical = ROAD_TILES.has(keyOf(x, y - 1)) && ROAD_TILES.has(keyOf(x, y + 1));
  if (hasHorizontal && hasVertical) ROAD_INTERSECTION_TILES.add(tile);
}

const nearestRoadTarget = (x: number, y: number): Tile => {
  const row = Math.abs(y - MAIN_ROAD_ROWS[0]) <= Math.abs(y - MAIN_ROAD_ROWS[1]) ? MAIN_ROAD_ROWS[0] : MAIN_ROAD_ROWS[1];
  const col = Math.abs(x - MAIN_ROAD_COLS[0]) <= Math.abs(x - MAIN_ROAD_COLS[1]) ? MAIN_ROAD_COLS[0] : MAIN_ROAD_COLS[1];
  const rowTarget: Tile = { x, y: row };
  const colTarget: Tile = { x: col, y };
  const rowDist = Math.abs(y - row);
  const colDist = Math.abs(x - col);
  return rowDist <= colDist ? rowTarget : colTarget;
};

const bfsPath = (start: Tile, end: Tile, blocked: Set<TileKey>) => {
  const startKey = keyOf(start.x, start.y);
  const endKey = keyOf(end.x, end.y);
  if (startKey === endKey) return [startKey];

  const q: Tile[] = [start];
  const seen = new Set<TileKey>([startKey]);
  const prev = new Map<TileKey, TileKey>();

  while (q.length > 0) {
    const cur = q.shift()!;
    const curKey = keyOf(cur.x, cur.y);
    for (const step of CARDINAL_STEPS) {
      const nx = cur.x + step.x;
      const ny = cur.y + step.y;
      if (!inBounds(nx, ny)) continue;
      const nk = keyOf(nx, ny);
      if (seen.has(nk)) continue;
      if (blocked.has(nk) && nk !== endKey) continue;
      seen.add(nk);
      prev.set(nk, curKey);
      if (nk === endKey) {
        const path: TileKey[] = [nk];
        let walk = nk;
        while (walk !== startKey) {
          walk = prev.get(walk)!;
          path.push(walk);
        }
        path.reverse();
        return path;
      }
      q.push({ x: nx, y: ny });
    }
  }

  return [] as TileKey[];
};

const getPerimeterCandidates = (tiles: Set<TileKey>, blocked: Set<TileKey>) => {
  const out: Tile[] = [];
  const seen = new Set<TileKey>();

  for (const tile of tiles) {
    const { x, y } = parseKey(tile);
    for (const step of CARDINAL_STEPS) {
      const nx = x + step.x;
      const ny = y + step.y;
      if (!inBounds(nx, ny)) continue;
      const nk = keyOf(nx, ny);
      if (blocked.has(nk) || seen.has(nk)) continue;
      seen.add(nk);
      out.push({ x: nx, y: ny });
    }
  }

  return out;
};

const SECONDARY_CONNECTOR_TILES_BY_ROLE: Record<AgentRole, Set<TileKey>> = {
  pm: new Set<TileKey>(),
  engineer: new Set<TileKey>(),
  designer: new Set<TileKey>(),
  qa: new Set<TileKey>(),
  devils_advocate: new Set<TileKey>(),
  reviewer: new Set<TileKey>(),
  researcher: new Set<TileKey>(),
};

const SECONDARY_CONNECTOR_TILES = new Set<TileKey>();
for (const cfg of BUILDING_CONFIGS) {
  const ownFootprint = BUILDING_FOOTPRINTS_BY_ROLE[cfg.role];
  const blocked = new Set<TileKey>(BUILDING_FOOTPRINT_TILES);
  for (const t of ownFootprint) blocked.delete(t);

  const candidates = getPerimeterCandidates(ownFootprint, blocked);
  let bestPath: TileKey[] = [];

  for (const start of candidates) {
    const end = nearestRoadTarget(start.x, start.y);
    const path = bfsPath(start, end, blocked);
    if (path.length === 0) continue;
    if (bestPath.length === 0 || path.length < bestPath.length) {
      bestPath = path;
    }
  }

  const connector = SECONDARY_CONNECTOR_TILES_BY_ROLE[cfg.role];
  for (const tile of bestPath) {
    if (BUILDING_FOOTPRINT_TILES.has(tile) || PLAZA_TILES.has(tile)) continue;
    connector.add(tile);
    SECONDARY_CONNECTOR_TILES.add(tile);
    ROAD_TILES.add(tile);
  }
}

const WATER_TILES = new Set<TileKey>();
for (let i = 0; i < GRID_SIZE; i++) {
  WATER_TILES.add(keyOf(i, 0));
  WATER_TILES.add(keyOf(i, GRID_SIZE - 1));
  WATER_TILES.add(keyOf(0, i));
  WATER_TILES.add(keyOf(GRID_SIZE - 1, i));
}
for (const tile of BUILDING_FOOTPRINT_TILES) WATER_TILES.delete(tile);
for (const tile of PLAZA_TILES) WATER_TILES.delete(tile);

const BRIDGE_TILES = new Set<TileKey>();
for (const col of BRIDGE_COLS) {
  BRIDGE_TILES.add(keyOf(col, 0));
  BRIDGE_TILES.add(keyOf(col, GRID_SIZE - 1));
}
for (const row of BRIDGE_ROWS) {
  BRIDGE_TILES.add(keyOf(0, row));
  BRIDGE_TILES.add(keyOf(GRID_SIZE - 1, row));
}
for (const tile of Array.from(BRIDGE_TILES)) {
  if (!WATER_TILES.has(tile)) BRIDGE_TILES.delete(tile);
}

const WATER_EDGE_TILES = new Set<TileKey>();
for (const tile of WATER_TILES) {
  const { x, y } = parseKey(tile);
  for (const step of CARDINAL_STEPS) {
    const nx = x + step.x;
    const ny = y + step.y;
    const nk = keyOf(nx, ny);
    if (!inBounds(nx, ny)) continue;
    if (WATER_TILES.has(nk)) continue;
    if (BUILDING_FOOTPRINT_TILES.has(nk)) continue;
    WATER_EDGE_TILES.add(nk);
  }
}

const SIDEWALK_BORDER_TILES = new Set<TileKey>();
for (const tile of ROAD_TILES) {
  const { x, y } = parseKey(tile);
  for (const step of CARDINAL_STEPS) {
    const nx = x + step.x;
    const ny = y + step.y;
    const nk = keyOf(nx, ny);
    if (!inBounds(nx, ny)) continue;
    if (ROAD_TILES.has(nk) || PLAZA_TILES.has(nk) || BUILDING_FOOTPRINT_TILES.has(nk) || WATER_TILES.has(nk)) continue;
    SIDEWALK_BORDER_TILES.add(nk);
  }
}

const makeZone = (x: number, y: number): Set<TileKey> => {
  const zone = new Set<TileKey>();
  addRect(zone, x, y, 2, 2);
  return zone;
};

const zoneIsClear = (zone: Set<TileKey>) => {
  for (const tile of zone) {
    if (BUILDING_FOOTPRINT_TILES.has(tile)) return false;
    if (ROAD_TILES.has(tile)) return false;
    if (PLAZA_TILES.has(tile)) return false;
    if (WATER_TILES.has(tile)) return false;
  }
  return zone.size === 4;
};

const cornerCandidates = {
  nw: [
    [1, 1], [2, 1], [1, 2], [2, 2],
  ],
  ne: [
    [GRID_SIZE - 3, 1], [GRID_SIZE - 4, 1], [GRID_SIZE - 3, 2], [GRID_SIZE - 4, 2],
  ],
  sw: [
    [1, GRID_SIZE - 3], [2, GRID_SIZE - 3], [1, GRID_SIZE - 4], [2, GRID_SIZE - 4],
  ],
  se: [
    [GRID_SIZE - 3, GRID_SIZE - 3], [GRID_SIZE - 4, GRID_SIZE - 3], [GRID_SIZE - 3, GRID_SIZE - 4], [GRID_SIZE - 4, GRID_SIZE - 4],
  ],
} as const;

const PARK_CORNER_ZONES: Record<ParkCorner, Set<TileKey>> = {
  nw: new Set<TileKey>(),
  ne: new Set<TileKey>(),
  sw: new Set<TileKey>(),
  se: new Set<TileKey>(),
};

for (const corner of Object.keys(cornerCandidates) as Array<keyof typeof cornerCandidates>) {
  const candidates = cornerCandidates[corner];
  let picked: Set<TileKey> | null = null;
  for (const [x, y] of candidates) {
    const zone = makeZone(x, y);
    if (zoneIsClear(zone)) {
      picked = zone;
      break;
    }
  }
  PARK_CORNER_ZONES[corner] = picked ?? makeZone(candidates[0][0], candidates[0][1]);
}

const PARK_CORNER_TILES = new Set<TileKey>();
for (const zone of Object.values(PARK_CORNER_ZONES)) {
  for (const tile of zone) {
    if (!BUILDING_FOOTPRINT_TILES.has(tile)) PARK_CORNER_TILES.add(tile);
  }
}

const TREE_POSITION_EXCLUSION_TILES = new Set<TileKey>([
  ...BUILDING_FOOTPRINT_TILES,
  ...PLAZA_TILES,
  ...ROAD_TILES,
  ...SIDEWALK_BORDER_TILES,
  ...WATER_TILES,
  ...BRIDGE_TILES,
]);

const TREE_POSITIONS = new Set<TileKey>();
for (let y = 1; y < GRID_SIZE - 1; y++) {
  for (let x = 1; x < GRID_SIZE - 1; x++) {
    const tile = keyOf(x, y);
    if (TREE_POSITION_EXCLUSION_TILES.has(tile)) continue;
    // Deterministic sparse cadence to preserve low-poly readability at zoomed-out scale.
    if ((x * 17 + y * 31) % 7 !== 0) continue;
    TREE_POSITIONS.add(tile);
  }
}
for (const parkTile of PARK_CORNER_TILES) {
  if (!TREE_POSITION_EXCLUSION_TILES.has(parkTile)) {
    TREE_POSITIONS.add(parkTile);
  }
}

const BRIDGE_CROSSING_TILE: TileKey = keyOf(7, 0);

const ROAD_TILE_MAP = {
  main: sortedTileKeys(MAIN_ROAD_TILES),
  secondaryLinks: sortedTileKeys(SECONDARY_CONNECTOR_TILES),
  secondaryLinksByRole: Object.fromEntries(
    (Object.keys(SECONDARY_CONNECTOR_TILES_BY_ROLE) as AgentRole[]).map((role) => [
      role,
      sortedTileKeys(SECONDARY_CONNECTOR_TILES_BY_ROLE[role]),
    ]),
  ) as Record<AgentRole, TileKey[]>,
  all: sortedTileKeys(ROAD_TILES),
} as const;

const SIDEWALK_COVERAGE_MAP = sortedTileKeys(SIDEWALK_BORDER_TILES);

const TREE_POSITION_MAP = {
  positions: sortedTileKeys(TREE_POSITIONS),
  exclusions: sortedTileKeys(TREE_POSITION_EXCLUSION_TILES),
} as const;

const PARK_ZONE_MAP = Object.fromEntries(
  (Object.keys(PARK_CORNER_ZONES) as ParkCorner[]).map((corner) => [
    corner,
    sortedTileKeys(PARK_CORNER_ZONES[corner]),
  ]),
) as Record<ParkCorner, TileKey[]>;

const WATER_EDGE_TILE_MAP = sortedTileKeys(WATER_EDGE_TILES);

export {
  ROAD_NETWORK_SPEC,
  BUILDING_FOOTPRINT_TILES,
  BUILDING_FOOTPRINTS_BY_ROLE,
  PLAZA_TILES,
  MAIN_ROAD_TILES,
  ROAD_TILES,
  ROAD_INTERSECTION_TILES,
  SECONDARY_CONNECTOR_TILES,
  SECONDARY_CONNECTOR_TILES_BY_ROLE,
  ROAD_TILE_MAP,
  SIDEWALK_BORDER_TILES,
  SIDEWALK_COVERAGE_MAP,
  PARK_CORNER_TILES,
  PARK_CORNER_ZONES,
  PARK_ZONE_MAP,
  TREE_POSITION_EXCLUSION_TILES,
  TREE_POSITIONS,
  TREE_POSITION_MAP,
  WATER_TILES,
  WATER_EDGE_TILES,
  WATER_EDGE_TILE_MAP,
  BRIDGE_TILES,
  BRIDGE_CROSSING_TILE,
};
