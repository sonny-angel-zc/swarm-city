# Task: Day/Night Cycle + Context/Power Overlay System

## Goal
Add a day/night lighting cycle based on real time, plus toggleable overlay modes for context usage and power grid visualization.

## Context
- This is a Next.js app at /tmp/swarm-lighting/
- The original isometric-city has a full lighting system. Reference: /Users/sonny_angel/.openclaw/workspace/isometric-city/src/components/game/lightingSystem.ts
- It also has overlay modes. Reference: /Users/sonny_angel/.openclaw/workspace/isometric-city/src/components/game/overlays.ts
- Current canvas renderer: src/components/CityCanvas.tsx
- Current store: src/core/store.ts, types: src/core/types.ts

## What to Do

### 1. Day/Night Cycle (modify CityCanvas.tsx)
Port the lighting system concept from the original:
- Use actual system time (new Date().getHours()) to determine time of day
- Background gradient shifts: day (blue sky) → dusk (orange/purple) → night (dark blue/black, current look)
- Stars only visible at night (already exist, just fade them)
- Building windows glow yellow at night, dim during day
- Road tiles get subtle street lamp glow at night
- The overall scene gets a dark overlay at night, warm tint at dusk/dawn
- Reference getDarkness() and getAmbientColor() from the original lightingSystem.ts

### 2. Context Meter Per Agent (types + store)
Add to types:
- Per agent: contextUsed (number 0-1), contextMax (number), contextWarning (boolean)
Add to store:
- Track context per agent (simulated for now — slowly fills during 'working' status)
- Context resets when agent status goes to 'idle' or 'done'

### 3. Power Grid Visualization
- Draw glowing lines between buildings to represent the "power grid" (context/communication links)
- Lines glow brighter when agents are active
- Lines dim/flicker when context is near capacity
- Use the road network as the base path for power lines

### 4. Context Meter on Buildings
- Draw a small vertical bar next to each building showing context fill level
- Color: green (low) → yellow (medium) → red (near full)
- When context is >90%, add smoke/spark particle effects on the building
- When context resets, brief "reboot" flash animation

### 5. Overlay Toggle (src/components/OverlayToggle.tsx)
Create a small toggle button group (bottom-right of canvas):
- "Activity" (default — normal view)
- "Power" — shows context grid lines prominently, hides other effects
- "Economy" — shows token spend heatmap (buildings colored by spend, green=low, red=high)
Reference: /Users/sonny_angel/.openclaw/workspace/isometric-city/src/components/game/OverlayModeToggle.tsx

### 6. Add overlay state to store
- overlayMode: 'activity' | 'power' | 'economy'
- setOverlayMode action

## Important
- The day/night cycle should work with the EXISTING dark theme (night is current default look)
- During day, make it noticeably lighter but still maintain the dark/tech aesthetic
- Keep all existing functionality (touch, mobile, etc.)
- Commit with clear message when done

When completely finished, run:
openclaw system event --text "Done: Day/night cycle, context meters, and overlay system" --mode now
