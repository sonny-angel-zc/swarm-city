export const CITY_CANVAS_RENDER_PIPELINE_VERSION = 'swa-68-subtask-1';

export const CITY_CANVAS_RENDER_PASSES = [
  'frame_state_update',
  'background_gradient',
  'background_stars',
  'camera_transform_enter',
  'terrain_tiles',
  'decorative_buildings',
  'fountain_plaza_props',
  'fountain_base',
  'power_grid_underlay',
  'transit_underlay',
  'agent_buildings',
  'city_life_overlay',
  'fountain_spray',
  'scene_particles',
  'camera_transform_exit',
  'day_night_overlay',
] as const;

export type CityCanvasRenderPass = (typeof CITY_CANVAS_RENDER_PASSES)[number];

export const CITY_CANVAS_INSERTION_SLOTS = {
  terrainMicroDetail: {
    slot: 'terrain_micro_detail',
    after: 'terrain_tiles',
    before: 'decorative_buildings',
    purpose: 'Road/sidewalk/water/park tile micro-detail that must remain below props and buildings.',
  },
  staticWorldProps: {
    slot: 'static_world_props',
    after: 'terrain_tiles',
    before: 'decorative_buildings',
    purpose: 'Deterministic trees, lamp posts, benches, and static park furniture.',
  },
  transitUnderlayUpgrade: {
    slot: 'transit_underlay_upgrade',
    after: 'power_grid_underlay',
    before: 'agent_buildings',
    purpose: 'Road-aware vehicle paths and moving entities that should remain behind buildings.',
  },
  cityLifeOverlay: {
    slot: 'city_life_overlay',
    after: 'agent_buildings',
    before: 'fountain_spray',
    purpose: 'Foreground city-life entities such as pedestrians and near-camera transit.',
  },
} as const;

