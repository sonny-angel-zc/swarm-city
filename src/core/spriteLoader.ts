import { AgentRole } from './types';

// Sprite image cache
const spriteCache = new Map<string, HTMLImageElement>();
const loadingPromises = new Map<string, Promise<HTMLImageElement>>();

// Map agent roles to their building sprite files
export const ROLE_SPRITE_MAP: Record<AgentRole, string> = {
  pm: '/assets/buildings/mansion.webp',           // City Hall - grand civic building
  engineer: '/assets/buildings/warehouse.webp',     // Workshop - industrial
  designer: '/assets/buildings/commercial.webp',    // Studio - commercial
  qa: '/assets/buildings/hospital.webp',            // Testing Lab - institutional
  devils_advocate: '/assets/buildings/residential.webp', // Dark Tower - tall apartment
  reviewer: '/assets/buildings/police_station.webp', // Courthouse - authority
  researcher: '/assets/buildings/university.webp',   // Library - academic
};

// Decorative sprite options for filler buildings
export const DECO_SPRITES = [
  '/assets/buildings/house_small.webp',
  '/assets/buildings/house_medium.webp',
  '/assets/buildings/shop_small.webp',
  '/assets/buildings/shop_medium.webp',
  '/assets/buildings/fire_station.webp',
  '/assets/buildings/school.webp',
  '/assets/buildings/industrial.webp',
];

// Nature/park sprites for green areas
export const NATURE_SPRITES = [
  '/assets/buildings/trees.webp',
  '/assets/buildings/park.webp',
  '/assets/buildings/park_medium.webp',
];

/**
 * Load a single sprite image, returning cached version if available.
 */
export function loadSprite(src: string): Promise<HTMLImageElement> {
  if (spriteCache.has(src)) {
    return Promise.resolve(spriteCache.get(src)!);
  }

  if (loadingPromises.has(src)) {
    return loadingPromises.get(src)!;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      spriteCache.set(src, img);
      loadingPromises.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      loadingPromises.delete(src);
      reject(new Error(`Failed to load sprite: ${src}`));
    };
    img.src = src;
  });

  loadingPromises.set(src, promise);
  return promise;
}

/**
 * Get a cached sprite synchronously (returns undefined if not yet loaded).
 */
export function getSprite(src: string): HTMLImageElement | undefined {
  return spriteCache.get(src);
}

/**
 * Get the sprite for a given agent role (synchronous, returns undefined if not loaded).
 */
export function getRoleSprite(role: AgentRole): HTMLImageElement | undefined {
  return spriteCache.get(ROLE_SPRITE_MAP[role]);
}

/**
 * Preload all building sprites. Call once at startup.
 */
export function preloadAllSprites(): Promise<void> {
  const allSources = [
    ...Object.values(ROLE_SPRITE_MAP),
    ...DECO_SPRITES,
    ...NATURE_SPRITES,
  ];

  // Deduplicate
  const unique = [...new Set(allSources)];

  return Promise.all(unique.map(src => loadSprite(src).catch(() => {
    console.warn(`Failed to load sprite: ${src}`);
  }))).then(() => {});
}

/**
 * Check if all role sprites are loaded and ready to render.
 */
export function areSpritesReady(): boolean {
  return Object.values(ROLE_SPRITE_MAP).every(src => spriteCache.has(src));
}
