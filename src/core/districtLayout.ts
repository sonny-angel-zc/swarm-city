/**
 * District Layout — Maps Linear projects to grid zones on the isometric city map.
 * Each project gets a rectangular district zone. Issues within become small buildings.
 */

import { GRID_SIZE, type BacklogItem, type LinearProjectContract } from './types';
import { ROAD_TILES, BUILDING_FOOTPRINT_TILES, PLAZA_TILES, WATER_TILES, BRIDGE_TILES } from './cityLayout';
import type { TileKey } from './cityLayout';

// District zones — 4 quadrants around the center government district
// Center (5-10, 5-10) is reserved for agent buildings
// Roads at 3-4, 7-8, 11-12
export type DistrictZone = {
  id: string;
  name: string;
  color: string;
  gridBounds: { x1: number; y1: number; x2: number; y2: number }; // inclusive
  tiles: Set<TileKey>;
  buildingSlots: Array<{ x: number; y: number }>; // available spots for task buildings
};

// The 4 district quadrants (avoiding roads, water, agent buildings)
const DISTRICT_QUADRANTS = [
  { id: 'nw', bounds: { x1: 0, y1: 0, x2: 5, y2: 5 }, defaultColor: '#4A90D9' },
  { id: 'ne', bounds: { x1: 10, y1: 0, x2: 15, y2: 5 }, defaultColor: '#9C27B0' },
  { id: 'sw', bounds: { x1: 0, y1: 10, x2: 5, y2: 15 }, defaultColor: '#4CAF50' },
  { id: 'se', bounds: { x1: 10, y1: 10, x2: 15, y2: 15 }, defaultColor: '#F5A623' },
] as const;

const keyOf = (x: number, y: number): TileKey => `${x},${y}`;

// Tiles that cannot be used for district buildings
function getExcludedTiles(): Set<TileKey> {
  const excluded = new Set<TileKey>();
  for (const t of ROAD_TILES) excluded.add(t);
  for (const t of BUILDING_FOOTPRINT_TILES) excluded.add(t);
  for (const t of PLAZA_TILES) excluded.add(t);
  for (const t of WATER_TILES) excluded.add(t);
  for (const t of BRIDGE_TILES) excluded.add(t);
  return excluded;
}

function computeDistrictTiles(
  bounds: { x1: number; y1: number; x2: number; y2: number },
  excluded: Set<TileKey>,
): { tiles: Set<TileKey>; slots: Array<{ x: number; y: number }> } {
  const tiles = new Set<TileKey>();
  const slots: Array<{ x: number; y: number }> = [];

  for (let x = bounds.x1; x <= bounds.x2; x++) {
    for (let y = bounds.y1; y <= bounds.y2; y++) {
      if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) continue;
      const key = keyOf(x, y);
      tiles.add(key);
      if (!excluded.has(key)) {
        slots.push({ x, y });
      }
    }
  }

  return { tiles, slots };
}

/**
 * Build district zones from Linear projects.
 * Maps up to 4 projects to the 4 quadrants. Remaining go to "unassigned".
 */
export function buildDistrictZones(projects: LinearProjectContract[]): DistrictZone[] {
  const excluded = getExcludedTiles();
  const zones: DistrictZone[] = [];

  // Sort projects by issue count (most issues first) to give them prime real estate
  const sortedProjects = [...projects]
    .filter(p => !p.isUnassigned)
    .sort((a, b) => b.totalIssues - a.totalIssues);

  for (let i = 0; i < DISTRICT_QUADRANTS.length; i++) {
    const quad = DISTRICT_QUADRANTS[i];
    const project = sortedProjects[i];
    const { tiles, slots } = computeDistrictTiles(quad.bounds, excluded);

    zones.push({
      id: project?.districtId ?? `unassigned-${quad.id}`,
      name: project?.name ?? `Zone ${quad.id.toUpperCase()}`,
      color: project?.color ?? quad.defaultColor,
      gridBounds: quad.bounds,
      tiles,
      buildingSlots: slots,
    });
  }

  return zones;
}

// Task building states
export type TaskBuildingState = 'empty' | 'construction' | 'complete';

export type TaskBuilding = {
  issueId: string;
  identifier: string;
  title: string;
  state: TaskBuildingState;
  gridX: number;
  gridY: number;
  districtId: string;
  color: string;
  height: number; // visual height based on priority
};

function issueStateToBuilding(stateType: string | undefined): TaskBuildingState {
  if (!stateType) return 'empty';
  switch (stateType) {
    case 'completed':
    case 'done':
      return 'complete';
    case 'started':
    case 'in_progress':
      return 'construction';
    default:
      return 'empty';
  }
}

/**
 * Place backlog items as buildings within their district zones.
 */
export function placeTaskBuildings(
  items: BacklogItem[],
  zones: DistrictZone[],
): TaskBuilding[] {
  const buildings: TaskBuilding[] = [];
  
  // Group items by project/district
  const itemsByDistrict = new Map<string, BacklogItem[]>();
  for (const item of items) {
    // Match by projectDistrictId, projectId, projectName, or labels
    const zone = zones.find(z => {
      if (item.projectDistrictId && z.id === item.projectDistrictId) return true;
      if (item.projectId && z.id === item.projectId) return true;
      if (item.projectName && z.name === item.projectName) return true;
      return false;
    });
    // If no project match, distribute unassigned items across zones evenly
    const districtId = zone?.id ?? zones[items.indexOf(item) % zones.length]?.id ?? 'unknown';
    if (!itemsByDistrict.has(districtId)) itemsByDistrict.set(districtId, []);
    itemsByDistrict.get(districtId)!.push(item);
  }

  for (const zone of zones) {
    const districtItems = itemsByDistrict.get(zone.id) ?? [];
    const slots = zone.buildingSlots;

    for (let i = 0; i < districtItems.length && i < slots.length; i++) {
      const item = districtItems[i];
      const slot = slots[i];
      const priorityHeight = item.priority === 'P0' ? 40 : item.priority === 'P1' ? 30 : item.priority === 'P2' ? 22 : 15;

      buildings.push({
        issueId: item.id,
        identifier: item.linearId ?? item.id.slice(0, 8),
        title: item.title,
        state: issueStateToBuilding(item.status === 'done' ? 'completed' : item.status === 'in_progress' ? 'started' : 'unstarted'),
        gridX: slot.x,
        gridY: slot.y,
        districtId: zone.id,
        color: zone.color,
        height: priorityHeight,
      });
    }
  }

  return buildings;
}
