# Task: Port Sprite-Based Building Rendering

## Goal
Replace the plain procedural isometric boxes in CityCanvas.tsx with proper sprite-based buildings from the original isometric-city game.

## Context
- This is a Next.js app at /tmp/swarm-sprites/
- The original isometric-city source is at /Users/sonny_angel/.openclaw/workspace/isometric-city/
- Building sprite images are already copied to public/assets/buildings/ (24 .webp files)
- Current buildings are drawn as simple colored 3D boxes via drawIsoBox() in src/core/isometric.ts
- The canvas renderer is in src/components/CityCanvas.tsx

## What to Do

### 1. Create a Sprite Loader (src/core/spriteLoader.ts)
- Load building sprites from public/assets/buildings/ as Image objects
- Cache them so they're only loaded once
- Map each agent role to an appropriate sprite:
  - PM (City Hall) → use a grand/civic sprite 
  - Engineer (Workshop) → warehouse.webp or industrial.webp
  - Designer (Studio) → commercial.webp or shop_medium.webp
  - QA (Testing Lab) → school.webp or hospital.webp
  - Devil's Advocate (Dark Tower) → residential.webp (tall apartment)
  - Reviewer (Courthouse) → police_station.webp or university.webp
  - Researcher (Library) → university.webp or school.webp
- Each sprite should be selectable by role and status

### 2. Modify CityCanvas.tsx to Use Sprites
- In the drawBuilding function, instead of calling drawIsoBox(), use ctx.drawImage() with the loaded sprite
- Position sprites so they sit on the isometric grid correctly (bottom-center aligned to tile position)
- Scale sprites appropriately (they're designed for 64px tile width)
- Keep ALL existing overlay effects (status glow, progress bar, particles, labels) — just change the building body rendering
- Keep the procedural drawIsoBox as fallback while sprites load

### 3. Add Status Visual Variations
- Idle: sprite at reduced opacity (0.5)
- Working: full opacity, animated glow underneath in building color
- Needs Input: full opacity + pulsing red ring (already exists)
- Done: full opacity + green sparkles (already exists)

### 4. Add Decorative Sprites
- Use smaller sprites (house_small, trees, park) as decoration around the city
- Replace the DECO_BUILDINGS plain gray boxes with actual sprite buildings

## Reference Files to Read
- Original sprite loader: /Users/sonny_angel/.openclaw/workspace/isometric-city/src/components/game/imageLoader.ts
- Original building sprite system: /Users/sonny_angel/.openclaw/workspace/isometric-city/src/components/game/buildingSprite.ts  
- Current canvas renderer: src/components/CityCanvas.tsx
- Current iso helpers: src/core/isometric.ts
- Current types: src/core/types.ts

## Important
- Don't break the existing touch/mouse controls or mobile responsive layout
- Commit your changes with a clear message when done

When completely finished, run:
openclaw system event --text "Done: Sprite-based building rendering ported to swarm-city" --mode now
