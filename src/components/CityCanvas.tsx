'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSwarmStore } from '@/core/store';
import {
  TILE_WIDTH, TILE_HEIGHT, GRID_SIZE, BUILDING_CONFIGS,
  AgentRole, AgentStatus, BuildingConfig, OverlayMode,
} from '@/core/types';
import { gridToScreen, drawIsoBox } from '@/core/isometric';
import { getRoleSprite, getSprite, preloadAllSprites, DECO_SPRITES, NATURE_SPRITES } from '@/core/spriteLoader';

// ─── Lighting ────────────────────────────────────────────────────────────────

/** Darkness 0 = full day, 1 = full night. Based on real system clock. */
function getDarkness(hour: number): number {
  if (hour >= 7 && hour < 18) return 0;
  if (hour >= 5 && hour < 7) return 1 - (hour - 5) / 2;
  if (hour >= 18 && hour < 20) return (hour - 18) / 2;
  return 1;
}

/** Ambient tint RGB for sky / overlay by time of day. */
function getAmbientColor(hour: number): { r: number; g: number; b: number } {
  if (hour >= 7 && hour < 18) return { r: 180, g: 200, b: 230 }; // cool daylight
  if (hour >= 5 && hour < 7) {
    const t = (hour - 5) / 2;
    return { r: Math.round(80 + 100 * t), g: Math.round(50 + 150 * t), b: Math.round(120 + 110 * t) };
  }
  if (hour >= 18 && hour < 20) {
    const t = (hour - 18) / 2;
    return { r: Math.round(180 - 160 * t), g: Math.round(120 - 90 * t), b: Math.round(160 - 100 * t) };
  }
  return { r: 10, g: 15, b: 40 };
}

// ─── Road layout ─────────────────────────────────────────────────────────────

// The 4 center tiles form the fountain plaza — excluded from road network
const PLAZA_TILES = new Set(['7,7', '7,8', '8,7', '8,8']);

const ROAD_TILES = new Set<string>();
for (let i = 0; i < GRID_SIZE; i++) {
  ROAD_TILES.add(`7,${i}`);
  ROAD_TILES.add(`8,${i}`);
  ROAD_TILES.add(`${i},7`);
  ROAD_TILES.add(`${i},8`);
}
for (let i = 2; i < 13; i++) {
  ROAD_TILES.add(`${i},3`);
  ROAD_TILES.add(`${i},4`);
  ROAD_TILES.add(`${i},11`);
  ROAD_TILES.add(`${i},12`);
  ROAD_TILES.add(`3,${i}`);
  ROAD_TILES.add(`4,${i}`);
  ROAD_TILES.add(`11,${i}`);
  ROAD_TILES.add(`12,${i}`);
}
// Remove plaza tiles from roads
for (const key of PLAZA_TILES) ROAD_TILES.delete(key);

// ─── Power grid edges (building-to-building along roads) ─────────────────────

type PowerEdge = { from: AgentRole; to: AgentRole };
const POWER_EDGES: PowerEdge[] = [
  { from: 'pm', to: 'engineer' },
  { from: 'pm', to: 'designer' },
  { from: 'pm', to: 'qa' },
  { from: 'pm', to: 'devils_advocate' },
  { from: 'pm', to: 'reviewer' },
  { from: 'pm', to: 'researcher' },
  { from: 'engineer', to: 'qa' },
  { from: 'designer', to: 'reviewer' },
  { from: 'researcher', to: 'reviewer' },
];

// Decorative buildings (small filler) with sprite assignments
type DecoBuilding = { gx: number; gy: number; h: number; color: string; sprite: string; scale: number; alpha?: number };
const DECO_BUILDINGS: DecoBuilding[] = [
  { gx: 1, gy: 1, h: 20, color: '#1a2744', sprite: DECO_SPRITES[0], scale: 0.7 },
  { gx: 2, gy: 1, h: 15, color: '#1c2840', sprite: DECO_SPRITES[1], scale: 0.65 },
  { gx: 1, gy: 2, h: 25, color: '#192540', sprite: DECO_SPRITES[2], scale: 0.6 },
  { gx: 13, gy: 1, h: 18, color: '#1a2744', sprite: DECO_SPRITES[3], scale: 0.65 },
  { gx: 14, gy: 2, h: 22, color: '#1c2840', sprite: DECO_SPRITES[4], scale: 0.7 },
  { gx: 1, gy: 13, h: 16, color: '#192540', sprite: NATURE_SPRITES[0], scale: 0.6 },
  { gx: 2, gy: 14, h: 20, color: '#1a2744', sprite: DECO_SPRITES[5], scale: 0.65 },
  { gx: 13, gy: 13, h: 24, color: '#1c2840', sprite: DECO_SPRITES[6], scale: 0.7 },
  { gx: 14, gy: 14, h: 18, color: '#192540', sprite: NATURE_SPRITES[1], scale: 0.6 },
  { gx: 5, gy: 6, h: 12, color: '#151d30', sprite: NATURE_SPRITES[2], scale: 0.5 },
  { gx: 6, gy: 5, h: 10, color: '#151d30', sprite: DECO_SPRITES[0], scale: 0.5 },
  { gx: 9, gy: 6, h: 14, color: '#151d30', sprite: NATURE_SPRITES[0], scale: 0.5 },
  { gx: 10, gy: 5, h: 11, color: '#151d30', sprite: DECO_SPRITES[2], scale: 0.5 },
  { gx: 5, gy: 9, h: 13, color: '#151d30', sprite: NATURE_SPRITES[1], scale: 0.5 },
  { gx: 6, gy: 10, h: 9, color: '#151d30', sprite: DECO_SPRITES[1], scale: 0.45 },
  { gx: 9, gy: 9, h: 15, color: '#151d30', sprite: DECO_SPRITES[3], scale: 0.5 },
  { gx: 10, gy: 10, h: 11, color: '#151d30', sprite: NATURE_SPRITES[2], scale: 0.5 },
];

// Fill empty lots so the scene reads as a denser city instead of isolated landmarks.
const AGENT_TILES = new Set(BUILDING_CONFIGS.map(cfg => `${cfg.gridX},${cfg.gridY}`));
const STATIC_DECO_TILES = new Set(DECO_BUILDINGS.map(d => `${d.gx},${d.gy}`));
const DISTRICT_BUILDINGS: DecoBuilding[] = [];
for (let gx = 0; gx < GRID_SIZE; gx++) {
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    const key = `${gx},${gy}`;
    if (ROAD_TILES.has(key) || PLAZA_TILES.has(key) || AGENT_TILES.has(key) || STATIC_DECO_TILES.has(key)) continue;

    const seed = gx * 37 + gy * 53;
    const nearCore = gx >= 3 && gx <= 12 && gy >= 3 && gy <= 12;
    const placeLot = nearCore ? seed % 3 !== 0 : seed % 4 === 0;
    if (!placeLot) continue;

    const useNature = !nearCore && seed % 5 === 0;
    const spritePool = useNature ? NATURE_SPRITES : DECO_SPRITES;
    const sprite = spritePool[seed % spritePool.length];
    const scale = nearCore ? 0.56 + (seed % 4) * 0.06 : 0.46 + (seed % 3) * 0.05;
    const h = nearCore ? 11 + (seed % 6) * 3 : 9 + (seed % 4) * 3;
    const shade = 18 + (seed % 7) * 3;
    DISTRICT_BUILDINGS.push({
      gx,
      gy,
      h,
      color: `rgb(${shade},${shade + 8},${shade + 22})`,
      sprite,
      scale,
      alpha: nearCore ? 0.82 : 0.72,
    });
  }
}
const ALL_DECO_BUILDINGS = [...DECO_BUILDINGS, ...DISTRICT_BUILDINGS]
  .sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));

// ─── Fountain drawing ─────────────────────────────────────────────────────────

/**
 * Draw the fountain basin, water surface, column, and spout glow.
 * Rendered BEFORE agent buildings so City Hall sits on top of the plaza base.
 */
function drawFountainBase(
  ctx: CanvasRenderingContext2D,
  time: number,
  intensity: number,
  darkness: number,
) {
  const { x: cx, y: cy } = gridToScreen(7.5, 7.5);
  const rX = 36, rY = 20, wallH = 7;

  ctx.save();

  // Drop shadow
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy + wallH + 3, rX * 1.08, rY * 0.68, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fill();

  // Basin wall face (shifted-down ellipse creates depth)
  ctx.beginPath();
  ctx.ellipse(cx, cy + wallH, rX, rY, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#141e2a';
  ctx.fill();

  // Rim top face
  ctx.beginPath();
  ctx.ellipse(cx, cy, rX, rY, 0, 0, Math.PI * 2);
  const rimG = ctx.createRadialGradient(cx, cy, rX * 0.55, cx, cy, rX);
  rimG.addColorStop(0, '#253848');
  rimG.addColorStop(1, '#1c2c3a');
  ctx.fillStyle = rimG;
  ctx.fill();
  ctx.strokeStyle = `rgba(80,160,220,${0.2 + darkness * 0.12})`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Water surface
  const wX = rX - 6, wY = rY - 3;
  const shimmer = Math.sin(time * 2.5) * 0.018;
  ctx.beginPath();
  ctx.ellipse(cx, cy, wX, wY, 0, 0, Math.PI * 2);
  const wG = ctx.createRadialGradient(cx, cy, 0, cx, cy, wX);
  const wA = 0.32 + intensity * 0.42 + shimmer;
  wG.addColorStop(0, `rgba(145,235,255,${wA})`);
  wG.addColorStop(0.55, `rgba(55,155,215,${wA * 0.65})`);
  wG.addColorStop(1, `rgba(22,70,125,${wA * 0.42})`);
  ctx.fillStyle = wG;
  ctx.fill();

  // Surface ripples
  for (let r = 0; r < 3; r++) {
    const ph = ((time * 0.72 + r * 0.34) % 1);
    ctx.beginPath();
    ctx.ellipse(cx, cy, wX * (0.12 + ph * 0.72), wY * (0.12 + ph * 0.72), 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(195,248,255,${(1 - ph) * 0.1 * (0.4 + intensity * 0.6)})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // Central column
  const colH = 13 + intensity * 5;
  drawIsoBox(ctx, cx, cy, 10, 6, colH, '#1e3044', '#162538', '#1a2d3e', 'rgba(65,145,195,0.22)');

  // Spout glow
  const gR = 7 + intensity * 19 + Math.sin(time * 3.0) * 1.4;
  const gg = ctx.createRadialGradient(cx, cy - colH, 0, cx, cy - colH, gR);
  gg.addColorStop(0, `rgba(135,238,255,${0.18 + intensity * 0.48})`);
  gg.addColorStop(0.5, `rgba(50,150,215,${(0.18 + intensity * 0.48) * 0.3})`);
  gg.addColorStop(1, 'rgba(45,130,200,0)');
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.ellipse(cx, cy - colH, gR, gR * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dormant drips when no agents active
  if (intensity <= 0) {
    for (let d = 0; d < 3; d++) {
      const dp = ((time * 0.45 + d * 0.33) % 1);
      ctx.beginPath();
      ctx.arc(cx + (d - 1) * 2, cy - colH + dp * (colH * 0.55), 0.9, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120,200,240,${0.45 * (1 - dp)})`;
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Draw animated water jets, mist, and pulse rings.
 * Rendered AFTER agent buildings so spray arcs over the rooftops.
 */
function drawFountainSpray(
  ctx: CanvasRenderingContext2D,
  time: number,
  intensity: number,
) {
  if (intensity <= 0) return;

  const { x: cx, y: cy } = gridToScreen(7.5, 7.5);
  const colH = 13 + intensity * 5;
  const spoutY = cy - colH;
  const jets = intensity < 0.34 ? 6 : intensity < 0.67 ? 14 : 22;
  const arcH = (8 + intensity * 28) * 4;
  const spread = 28 + intensity * 14;

  ctx.save();

  // Mist ring (active+)
  if (intensity >= 0.34) {
    for (let m = 0; m < 12; m++) {
      const ma = (m / 12) * Math.PI * 2 + time * 0.07;
      const mr = 24 + Math.sin(time * 0.6 + m * 0.5) * 3;
      const mA = (0.03 + Math.sin(time * 0.3 + m) * 0.012) * intensity;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ma) * mr, cy + Math.sin(ma) * mr * 0.55, 4 + Math.sin(time * 0.5 + m) * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(175,232,255,${mA})`;
      ctx.fill();
    }
  }

  // Jet arcs
  for (let j = 0; j < jets; j++) {
    const ba = (j / jets) * Math.PI * 2 + time * 0.12;
    const lx = cx + Math.cos(ba) * spread;
    const ly = cy + Math.sin(ba) * spread * 0.55;

    ctx.beginPath();
    for (let s = 0; s <= 14; s++) {
      const t = s / 14;
      const ax = cx + (lx - cx) * t;
      const ay = spoutY + (ly - spoutY) * t - arcH * t * (1 - t);
      s === 0 ? ctx.moveTo(ax, ay) : ctx.lineTo(ax, ay);
    }
    ctx.strokeStyle = `rgba(165,235,255,${0.33 + Math.sin(time * 2.0 + j * 0.6) * 0.1})`;
    ctx.lineWidth = 0.85 + intensity * 0.55;
    ctx.stroke();

    // Moving droplet along arc
    const tp = ((time * 0.85 + j * 0.285) % 1);
    const tx = cx + (lx - cx) * tp;
    const ty = spoutY + (ly - spoutY) * tp - arcH * tp * (1 - tp);
    const dropA = 0.5 * (1 - Math.abs(tp - 0.5) * 1.4);
    if (dropA > 0) {
      ctx.beginPath();
      ctx.arc(tx, ty, 0.75 + (1 - Math.abs(tp - 0.5) * 2) * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210,248,255,${dropA})`;
      ctx.fill();
    }
  }

  // Surge: 4 diagonal mini-jets
  if (intensity >= 0.67) {
    for (let m = 0; m < 4; m++) {
      const ma = (m / 4) * Math.PI * 2 + time * 0.5;
      const ml = 8 + Math.sin(time * 3.1 + m) * 3;
      ctx.beginPath();
      ctx.moveTo(cx, spoutY);
      ctx.lineTo(cx + Math.cos(ma) * ml * 0.4, spoutY - Math.abs(Math.sin(ma)) * ml);
      ctx.strokeStyle = `rgba(205,250,255,${0.42 + Math.sin(time * 4 + m) * 0.18})`;
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }
  }

  // Sync pulse ring (surge state)
  if (intensity >= 0.67) {
    const pt = (time * 0.42) % 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 18 + pt * 56, (18 + pt * 56) * 0.55, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(110,215,255,${(1 - pt) * 0.17 * intensity})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  ctx.restore();
}

function drawFountainPlazaProps(
  ctx: CanvasRenderingContext2D,
  time: number,
  darkness: number,
) {
  const { x: cx, y: cy } = gridToScreen(7.5, 7.5);
  const benchPoints = [
    { x: cx, y: cy - 33, w: 16, h: 5 },
    { x: cx + 28, y: cy, w: 12, h: 5 },
    { x: cx, y: cy + 33, w: 16, h: 5 },
    { x: cx - 28, y: cy, w: 12, h: 5 },
  ];

  ctx.save();

  // Planters on the diagonal corners of the plaza.
  for (const corner of [
    gridToScreen(7, 7),
    gridToScreen(8, 7),
    gridToScreen(8, 8),
    gridToScreen(7, 8),
  ]) {
    drawIsoBox(
      ctx,
      corner.x,
      corner.y,
      10,
      6,
      5,
      '#25384a',
      '#1a2838',
      '#1f3040',
      'rgba(0,0,0,0.22)',
    );
    ctx.beginPath();
    ctx.ellipse(corner.x, corner.y - 4, 4.2, 2.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(95,165,120,0.75)';
    ctx.fill();
  }

  // Bench tops around the fountain ring.
  for (const bench of benchPoints) {
    drawIsoBox(
      ctx,
      bench.x,
      bench.y,
      bench.w,
      bench.h,
      4,
      '#334457',
      '#233243',
      '#29394a',
      'rgba(0,0,0,0.2)',
    );
  }

  // Low plaza ring lighting, brighter at night.
  const lightAlpha = 0.04 + darkness * 0.12 + Math.sin(time * 2.1) * 0.01;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 54, 30, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(110,205,245,${lightAlpha})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

// ─── Building details ────────────────────────────────────────────────────────

function drawBuildingDetails(
  ctx: CanvasRenderingContext2D,
  cfg: BuildingConfig,
  cx: number, cy: number,
  bw: number, bh: number,
  time: number,
  status: AgentStatus,
  darkness: number,
) {
  const hw = bw / 2;
  const cols = Math.max(2, Math.floor(bw / 16));
  const rows = Math.max(2, Math.floor(bh / 18));
  const winW = 5;
  const winH = 6;

  // Window glow intensity: bright at night, dim during day
  const nightGlow = 0.3 + darkness * 0.7; // 0.3 day → 1.0 night

  // Left face windows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < Math.ceil(cols / 2); c++) {
      const wx = cx - hw + 4 + c * (hw / (cols / 2 + 0.5));
      const wy = cy - bh + 10 + r * (bh / (rows + 0.5));
      if (status === 'idle') {
        const a = (0.08 + Math.sin(time * 0.5 + r + c) * 0.03) * (0.3 + darkness * 0.7);
        ctx.fillStyle = `rgba(100,120,160,${a})`;
      } else {
        const flicker = status === 'working'
          ? (0.5 + Math.sin(time * 3 + r * 1.3 + c * 2.1) * 0.3) * nightGlow
          : 0.15 * nightGlow;
        ctx.fillStyle = `rgba(255,240,180,${flicker})`;
      }
      ctx.fillRect(wx, wy, winW, winH);
    }
  }

  // Right face windows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < Math.ceil(cols / 2); c++) {
      const wx = cx + 4 + c * (hw / (cols / 2 + 0.5));
      const wy = cy - bh + 10 + r * (bh / (rows + 0.5));
      if (status === 'idle') {
        const a = (0.06 + Math.sin(time * 0.3 + r + c) * 0.02) * (0.3 + darkness * 0.7);
        ctx.fillStyle = `rgba(80,100,140,${a})`;
      } else {
        const flicker = status === 'working'
          ? (0.4 + Math.sin(time * 2.5 + r * 0.9 + c * 1.7) * 0.25) * nightGlow
          : 0.1 * nightGlow;
        ctx.fillStyle = `rgba(255,240,180,${flicker})`;
      }
      ctx.fillRect(wx, wy, winW, winH);
    }
  }

  // Roof accent line
  ctx.strokeStyle = cfg.accent + '66';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy - bh);
  ctx.lineTo(cx, cy - bh - TILE_HEIGHT / 2);
  ctx.lineTo(cx + hw, cy - bh);
  ctx.stroke();
}

// ─── Context meter color ─────────────────────────────────────────────────────

function contextColor(t: number): string {
  if (t < 0.5) {
    const r = Math.round(80 + 175 * (t * 2));
    const g = Math.round(200 - 50 * (t * 2));
    return `rgb(${r},${g},60)`;
  }
  const r = 255;
  const g = Math.round(150 - 150 * ((t - 0.5) * 2));
  return `rgb(${r},${g},40)`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CityCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastTime = useRef(0);
  const mouseRef = useRef({ dragging: false, lastX: 0, lastY: 0 });
  // Track per-agent reboot flash (timestamp of last context reset)
  const rebootFlashRef = useRef<Partial<Record<AgentRole, number>>>({});
  const prevContextRef = useRef<Partial<Record<AgentRole, number>>>({});

  const tick = useSwarmStore(s => s.tick);
  const selectAgent = useSwarmStore(s => s.selectAgent);
  const spawnParticles = useSwarmStore(s => s.spawnParticles);
  const setCameraPos = useSwarmStore(s => s.setCameraPos);
  const panCamera = useSwarmStore(s => s.panCamera);
  const setZoom = useSwarmStore(s => s.setZoom);

  // Track coins tossed into the fountain
  const coinCountRef = useRef(0);

  const storeRef = useRef(useSwarmStore.getState());
  useEffect(() => useSwarmStore.subscribe(s => { storeRef.current = s; }), []);

  // Starfield (generated once, in effect to avoid SSR mismatch)
  const starsRef = useRef<{ x: number; y: number; r: number; a: number }[]>([]);
  useEffect(() => {
    if (starsRef.current.length === 0) {
      for (let i = 0; i < 120; i++) {
        starsRef.current.push({
          x: Math.random(),
          y: Math.random(),
          r: 0.3 + Math.random() * 1.2,
          a: 0.2 + Math.random() * 0.5,
        });
      }
    }
  }, []);

  // ─── Draw single building ───────────────────────────────────────────────────

  const drawBuilding = useCallback((
    ctx: CanvasRenderingContext2D,
    role: AgentRole,
    time: number,
    darkness: number,
    overlay: OverlayMode,
  ) => {
    const agent = storeRef.current.agents[role];
    const b = agent.building;
    const pos = gridToScreen(b.gridX, b.gridY);
    const cx = pos.x;
    const cy = pos.y;
    const bw = b.width * TILE_WIDTH * 0.8;
    const bd = b.width * TILE_HEIGHT * 0.8;
    const bh = b.height;

    ctx.save();

    // Status glow under building
    if (agent.status !== 'idle') {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, bw * 1.2);
      const glowColor = agent.status === 'needs_input' ? b.color :
        agent.status === 'done' ? '#4CAF50' : b.color;
      grad.addColorStop(0, glowColor + (agent.status === 'needs_input' ? '40' : '25'));
      grad.addColorStop(1, glowColor + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 5, bw * 1.2, bd * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Building base shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx + 4, cy + 6, bw * 0.5, bd * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    const alpha = agent.status === 'idle' ? 0.5 : 1;
    ctx.globalAlpha = alpha;

    // Main building - try sprite first, fallback to procedural
    const sprite = getRoleSprite(role);
    if (sprite && sprite.naturalWidth > 0) {
      // Scale sprite to match building footprint
      const spriteScale = b.width;
      const destWidth = TILE_WIDTH * 1.3 * spriteScale;
      const destHeight = (sprite.naturalHeight / sprite.naturalWidth) * destWidth;
      const drawX = cx - destWidth / 2;
      const drawY = cy - destHeight + TILE_HEIGHT * 0.35;

      ctx.drawImage(sprite, drawX, drawY, destWidth, destHeight);
    } else {
      // Fallback: procedural iso box while sprites load
      // Economy overlay: tint buildings by simulated token spend
      let topCol = agent.status === 'idle' ? '#1a2030' : b.color;
      let leftCol = agent.status === 'idle' ? '#0f1520' : b.dark;
      let rightCol = agent.status === 'idle' ? '#222d40' : b.accent;

      if (overlay === 'economy') {
        // Use contextUsed as proxy for token spend
        const spend = agent.contextUsed;
        const r = Math.round(40 + 215 * spend);
        const g = Math.round(200 - 160 * spend);
        const tint = `rgb(${r},${g},40)`;
        topCol = tint;
        leftCol = `rgb(${Math.round(r * 0.6)},${Math.round(g * 0.6)},25)`;
        rightCol = `rgb(${Math.round(r * 0.8)},${Math.round(g * 0.8)},30)`;
      }

      drawIsoBox(ctx, cx, cy, bw, bd, bh, topCol, leftCol, rightCol, 'rgba(0,0,0,0.4)');

      // Architectural details (only for fallback)
      ctx.globalAlpha = alpha;
      drawBuildingDetails(ctx, b, cx, cy, bw, bh, time, agent.status, darkness);
    }

    ctx.globalAlpha = 1;

    // Status-specific effects
    if (agent.status === 'working') {
      for (let i = 0; i < 5; i++) {
        const t = (time * 1.5 + i * 0.7) % 2;
        const px = cx + Math.sin(time * 2 + i * 1.5) * (bw * 0.25);
        const py = cy - bh - t * 20;
        const pa = Math.max(0, 1 - t / 2);
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + t, 0, Math.PI * 2);
        ctx.fillStyle = b.accent;
        ctx.globalAlpha = pa * 0.6;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (agent.status === 'needs_input') {
      const pulse = 0.5 + Math.sin(time * 5) * 0.5;
      ctx.strokeStyle = `rgba(255,60,60,${0.4 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy - bh / 2, bw * 0.6 + pulse * 5, bd * 0.4 + pulse * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,60,60,${0.7 + pulse * 0.3})`;
      ctx.fillText('!', cx, cy - bh - 14);
    }

    if (agent.status === 'done') {
      for (let i = 0; i < 4; i++) {
        const angle = (time * 0.8 + i * Math.PI / 2) % (Math.PI * 2);
        const r = 12 + Math.sin(time * 2 + i) * 4;
        const sx = cx + Math.cos(angle) * r;
        const sy = cy - bh - 8 + Math.sin(angle) * r * 0.5;
        ctx.fillStyle = '#4CAF50';
        ctx.globalAlpha = 0.5 + Math.sin(time * 3 + i) * 0.3;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('\u2713', cx, cy - bh - 10);
    }

    // ─── Context meter bar (vertical, right side of building) ──────────────

    if (agent.contextUsed > 0) {
      const meterH = bh * 0.6;
      const meterW = 4;
      const mx = cx + bw / 2 + 6;
      const my = cy - bh + (bh - meterH) / 2;

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.roundRect(mx - 1, my - 1, meterW + 2, meterH + 2, 2);
      ctx.fill();

      // Fill (bottom-up)
      const fillH = meterH * agent.contextUsed;
      ctx.fillStyle = contextColor(agent.contextUsed);
      ctx.beginPath();
      ctx.roundRect(mx, my + meterH - fillH, meterW, fillH, 1);
      ctx.fill();

      // Percentage label
      ctx.font = '7px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(agent.contextUsed * 100)}`, mx + meterW / 2, my - 3);
    }

    // Smoke / spark particles when context > 90%
    if (agent.contextWarning) {
      for (let i = 0; i < 6; i++) {
        const t2 = (time * 2 + i * 0.5) % 1.5;
        const sx = cx + (Math.sin(time * 4 + i * 2.3) * bw * 0.3);
        const sy = cy - bh - t2 * 15;
        const sa = Math.max(0, 1 - t2 / 1.5);
        // Smoke
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + t2 * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,80,30,${sa * 0.5})`;
        ctx.fill();
        // Spark
        if (i % 2 === 0) {
          const sparkX = cx + Math.sin(time * 8 + i * 3) * bw * 0.2;
          const sparkY = cy - bh + Math.sin(time * 6 + i) * 5;
          ctx.beginPath();
          ctx.arc(sparkX, sparkY, 1, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,200,60,${0.6 + Math.sin(time * 10 + i) * 0.4})`;
          ctx.fill();
        }
      }
    }

    // Reboot flash animation
    const flashTime = rebootFlashRef.current[role];
    if (flashTime !== undefined) {
      const elapsed = time - flashTime;
      if (elapsed < 0.5) {
        const flashAlpha = (1 - elapsed / 0.5) * 0.6;
        ctx.fillStyle = `rgba(100,200,255,${flashAlpha})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy - bh / 2, bw * 0.6, bh * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        delete rebootFlashRef.current[role];
      }
    }

    // Progress bar
    if (agent.status === 'working' && agent.progress > 0) {
      const barW = bw * 0.7;
      const barH = 3;
      const barX = cx - barW / 2;
      const barY = cy - bh - 22;

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 2);
      ctx.fill();

      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * agent.progress, barH, 1.5);
      ctx.fill();

      ctx.font = '9px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(agent.progress * 100)}%`, cx, barY - 3);
    }

    // Building label
    ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const label = `${b.icon} ${b.buildingName}`;
    const labelW = ctx.measureText(label).width + 10;
    const labelY = cy - bh - (agent.status === 'working' ? 32 : 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(cx - labelW / 2, labelY - 9, labelW, 14, 3);
    ctx.fill();

    ctx.fillStyle = agent.status === 'idle' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)';
    ctx.fillText(label, cx, labelY);

    if (agent.currentTask && agent.status !== 'idle') {
      const taskLabel = agent.currentTask.length > 28
        ? agent.currentTask.slice(0, 28) + '\u2026'
        : agent.currentTask;
      ctx.font = '8px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(taskLabel, cx, labelY + 12);
    }

    ctx.restore();
  }, []);

  // ─── Draw power grid lines ─────────────────────────────────────────────────

  const drawPowerGrid = useCallback((
    ctx: CanvasRenderingContext2D,
    time: number,
    overlay: OverlayMode,
  ) => {
    const state = storeRef.current;
    const prominent = overlay === 'power';
    const baseAlpha = prominent ? 0.6 : 0.15;

    for (const edge of POWER_EDGES) {
      const a1 = state.agents[edge.from];
      const a2 = state.agents[edge.to];
      const p1 = gridToScreen(a1.building.gridX, a1.building.gridY);
      const p2 = gridToScreen(a2.building.gridX, a2.building.gridY);

      const active = a1.status === 'working' || a2.status === 'working';
      const warned = a1.contextWarning || a2.contextWarning;

      // Flicker when context near capacity
      let lineAlpha = baseAlpha;
      if (active) lineAlpha = prominent ? 0.9 : 0.35;
      if (warned) lineAlpha *= 0.4 + Math.sin(time * 12) * 0.4; // rapid flicker

      // Route near the fountain plaza but arc around it to avoid piercing the basin.
      // Offset the bezier control point perpendicularly based on line direction.
      const midBase = gridToScreen(7.5, 7.5);
      const ldx = p2.x - p1.x;
      const ldy = p2.y - p1.y;
      const lLen = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
      const flip = (edge.from.charCodeAt(0) + edge.to.charCodeAt(0)) % 2 === 0 ? 1 : -1;
      const mid = {
        x: midBase.x + (-ldy / lLen) * 52 * flip,
        y: midBase.y + (ldx / lLen) * 52 * flip,
      };

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.quadraticCurveTo(mid.x, mid.y, p2.x, p2.y);

      const color = active ? (warned ? '255,100,50' : '100,200,255') : '60,80,120';
      ctx.strokeStyle = `rgba(${color},${lineAlpha})`;
      ctx.lineWidth = prominent ? 2.5 : 1.2;
      ctx.stroke();

      // Glow
      if (active && prominent) {
        ctx.strokeStyle = `rgba(${color},${lineAlpha * 0.3})`;
        ctx.lineWidth = 6;
        ctx.stroke();
      }

      // Animated pulse dot along the line
      if (active) {
        const t = (time * 0.5 + edge.from.length * 0.3) % 1;
        // Approximate position on quadratic bezier
        const px = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * mid.x + t * t * p2.x;
        const py = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * mid.y + t * t * p2.y;
        ctx.beginPath();
        ctx.arc(px, py, prominent ? 3 : 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${lineAlpha * 1.5})`;
        ctx.fill();
      }
    }
  }, []);

  // ─── Render loop ───────────────────────────────────────────────────────────

  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = Math.min((timestamp - lastTime.current) / 1000, 0.1);
    lastTime.current = timestamp;
    tick(dt);

    const state = storeRef.current;
    const W = canvas.width;
    const H = canvas.height;
    const time = timestamp / 1000;
    const overlay = state.overlayMode;

    // ─── Time of day ───────────────────────────────────────────────────────
    const now = new Date();
    const hourFrac = now.getHours() + now.getMinutes() / 60;
    const darkness = getDarkness(hourFrac);
    const ambient = getAmbientColor(hourFrac);

    // Detect context resets for reboot flash
    for (const role of Object.keys(state.agents) as AgentRole[]) {
      const prev = prevContextRef.current[role] ?? 0;
      const cur = state.agents[role].contextUsed;
      if (prev > 0.3 && cur === 0) {
        rebootFlashRef.current[role] = time;
      }
      prevContextRef.current[role] = cur;
    }

    // ─── Background gradient (time-aware) ──────────────────────────────────
    ctx.clearRect(0, 0, W, H);
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);

    if (darkness >= 0.8) {
      // Night (current default look)
      bgGrad.addColorStop(0, '#050810');
      bgGrad.addColorStop(0.5, '#0a0f1e');
      bgGrad.addColorStop(1, '#060a13');
    } else if (darkness <= 0.05) {
      // Day — lighter but still techy
      bgGrad.addColorStop(0, '#0e1525');
      bgGrad.addColorStop(0.5, '#141e35');
      bgGrad.addColorStop(1, '#0c1222');
    } else {
      // Dawn/dusk transition
      const d = darkness;
      const lerp = (a: number, b: number) => Math.round(a + (b - a) * d);
      const top = `rgb(${lerp(14, 5)},${lerp(21, 8)},${lerp(37, 16)})`;
      const mid = `rgb(${lerp(20, 10)},${lerp(30, 15)},${lerp(53, 30)})`;
      const bot = `rgb(${lerp(12, 6)},${lerp(18, 10)},${lerp(34, 19)})`;
      // Dusk warm tint
      if (hourFrac >= 18 && hourFrac < 20) {
        const duskT = (hourFrac - 18) / 2;
        const warmR = Math.round(40 * (1 - duskT));
        const topR = `rgb(${lerp(14, 5) + warmR},${lerp(21, 8)},${lerp(37, 16)})`;
        const midR = `rgb(${lerp(20, 10) + warmR},${lerp(30, 15)},${lerp(53, 30)})`;
        bgGrad.addColorStop(0, topR);
        bgGrad.addColorStop(0.5, midR);
        bgGrad.addColorStop(1, bot);
      } else {
        bgGrad.addColorStop(0, top);
        bgGrad.addColorStop(0.5, mid);
        bgGrad.addColorStop(1, bot);
      }
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ─── Stars (fade with darkness) ────────────────────────────────────────
    const starAlpha = Math.max(0, darkness - 0.2) / 0.8; // visible only darkness > 0.2
    if (starAlpha > 0) {
      for (const s of starsRef.current) {
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H * 0.6, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,200,255,${s.a * starAlpha * (0.5 + Math.sin(time * 0.5 + s.x * 10) * 0.3)})`;
        ctx.fill();
      }
    }

    // ─── City scene ────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(W / 2 + state.cameraX, H * 0.38 + state.cameraY);
    ctx.scale(state.zoom, state.zoom);

    // Intensity: fraction of agents currently working (drives fountain animation state)
    const agentRoles = Object.keys(state.agents) as AgentRole[];
    const workingCount = agentRoles.filter(r => state.agents[r].status === 'working').length;
    const fountainIntensity = workingCount / agentRoles.length;

    // Ground tiles
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      for (let gy = 0; gy < GRID_SIZE; gy++) {
        const pos = gridToScreen(gx, gy);
        const tileKey = `${gx},${gy}`;
        const isPlaza = PLAZA_TILES.has(tileKey);
        const isRoad = ROAD_TILES.has(tileKey);

        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - TILE_HEIGHT / 2);
        ctx.lineTo(pos.x + TILE_WIDTH / 2, pos.y);
        ctx.lineTo(pos.x, pos.y + TILE_HEIGHT / 2);
        ctx.lineTo(pos.x - TILE_WIDTH / 2, pos.y);
        ctx.closePath();

        if (isPlaza) {
          // Stone plaza tile — dark slate with cyan tint, distinct from road
          const sb = Math.round(19 + (1 - darkness) * 8);
          ctx.fillStyle = `rgb(${sb + 2},${sb + 9},${sb + 22})`;
          ctx.fill();
          ctx.strokeStyle = 'rgba(80,150,220,0.12)';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        } else if (isRoad) {
          // Road slightly lighter during day
          const roadBright = Math.round(21 + (1 - darkness) * 8);
          ctx.fillStyle = `rgb(${roadBright},${roadBright + 7},${roadBright + 24})`;
          ctx.fill();
          ctx.strokeStyle = 'rgba(80,120,180,0.08)';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Center line markings
          if (gx === 7 || gx === 8 || gy === 7 || gy === 8) {
            if ((gx + gy) % 2 === 0) {
              ctx.fillStyle = 'rgba(255,200,60,0.08)';
              ctx.fillRect(pos.x - 1, pos.y - 0.5, 2, 1);
            }
          }

          // Street lamp glow at night
          if (darkness > 0.3 && (gx + gy) % 3 === 0) {
            const lampAlpha = (darkness - 0.3) * 0.5;
            const lampGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, TILE_WIDTH * 0.6);
            lampGrad.addColorStop(0, `rgba(255,220,140,${lampAlpha})`);
            lampGrad.addColorStop(1, 'rgba(255,220,140,0)');
            ctx.fillStyle = lampGrad;
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y, TILE_WIDTH * 0.6, TILE_HEIGHT * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          const groundBright = Math.round(11 + (1 - darkness) * 6);
          ctx.fillStyle = `rgb(${groundBright},${groundBright + 5},${groundBright + 21})`;
          ctx.fill();
          ctx.strokeStyle = 'rgba(40,60,100,0.06)';
          ctx.lineWidth = 0.3;
          ctx.stroke();
        }
      }
    }

    // Deco buildings (background filler) - sprites with fallback
    for (const d of ALL_DECO_BUILDINGS) {
      const pos = gridToScreen(d.gx, d.gy);
      if (!ROAD_TILES.has(`${d.gx},${d.gy}`)) {
        const decoSprite = getSprite(d.sprite);
        if (decoSprite && decoSprite.naturalWidth > 0) {
          const destW = TILE_WIDTH * d.scale;
          const destH = (decoSprite.naturalHeight / decoSprite.naturalWidth) * destW;
          const dx = pos.x - destW / 2;
          const dy = pos.y - destH + TILE_HEIGHT * 0.3;
          ctx.globalAlpha = d.alpha ?? 0.85;
          ctx.drawImage(decoSprite, dx, dy, destW, destH);
          ctx.globalAlpha = 1;
        } else {
          const dark = '#0a0f1a';
          const light = '#1f2940';
          drawIsoBox(ctx, pos.x, pos.y, 28, 16, d.h, d.color, dark, light);
          // Tiny windows - glow at night
          for (let r = 0; r < Math.floor(d.h / 10); r++) {
            const winAlpha = (0.05 + Math.sin(time * 0.3 + d.gx + d.gy + r) * 0.03) * (0.3 + darkness * 0.7);
            ctx.fillStyle = `rgba(255,240,180,${winAlpha})`;
            ctx.fillRect(pos.x - 6 + r * 5, pos.y - d.h + 5 + r * 8, 3, 3);
          }
        }
      }
    }

    // ─── Plaza props around fountain (benches, planters, and ring lights) ──
    drawFountainPlazaProps(ctx, time, darkness);

    // ─── Fountain base (basin + water surface, below buildings) ────────────
    drawFountainBase(ctx, time, fountainIntensity, darkness);

    // ─── Power grid lines (before buildings, so they appear under) ─────────
    if (overlay !== 'economy') {
      drawPowerGrid(ctx, time, overlay);
    }

    // Vehicles
    for (const v of state.vehicles) {
      const fromB = state.agents[v.fromAgent].building;
      const toB = state.agents[v.toAgent].building;
      const from = gridToScreen(fromB.gridX, fromB.gridY);
      const to = gridToScreen(toB.gridX, toB.gridY);

      const midX = 0;
      const midY = (from.y + to.y) / 2;
      let vx: number, vy: number;
      if (v.progress < 0.5) {
        const t = v.progress * 2;
        vx = from.x + (midX - from.x) * t;
        vy = from.y + (midY - from.y) * t;
      } else {
        const t = (v.progress - 0.5) * 2;
        vx = midX + (to.x - midX) * t;
        vy = midY + (to.y - midY) * t;
      }

      ctx.shadowColor = v.color;
      ctx.shadowBlur = 10;

      ctx.beginPath();
      ctx.moveTo(vx, vy - 4);
      ctx.lineTo(vx + 7, vy);
      ctx.lineTo(vx, vy + 4);
      ctx.lineTo(vx - 7, vy);
      ctx.closePath();
      ctx.fillStyle = v.color;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(vx, vy - 2);
      ctx.lineTo(vx + 3, vy);
      ctx.lineTo(vx, vy + 2);
      ctx.lineTo(vx - 3, vy);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;

      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      for (let i = 1; i <= 4; i++) {
        const tx = vx - Math.cos(angle) * i * 4;
        const ty = vy - Math.sin(angle) * i * 4;
        ctx.beginPath();
        ctx.arc(tx, ty, 1.5 - i * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = v.color;
        ctx.globalAlpha = 0.3 - i * 0.06;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // Agent buildings (depth sorted)
    const sortedBuildings = [...BUILDING_CONFIGS].sort(
      (a, b) => (a.gridX + a.gridY) - (b.gridX + b.gridY)
    );
    for (const cfg of sortedBuildings) {
      drawBuilding(ctx, cfg.role, time, darkness, overlay);
    }

    // ─── Fountain spray (jets + mist, above buildings) ──────────────────────
    drawFountainSpray(ctx, time, fountainIntensity);

    // Particles
    for (const p of state.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      if (p.type === 'coin') {
        // Gold coin particle
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        const r = Math.max(1, p.size);

        // Outer gold circle
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        const coinGrad = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, 0, p.x, p.y, r);
        coinGrad.addColorStop(0, '#FFF8DC');
        coinGrad.addColorStop(0.5, p.color);
        coinGrad.addColorStop(1, '#B8860B');
        ctx.fillStyle = coinGrad;
        ctx.fill();

        // Inner emboss
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Glow
        ctx.shadowColor = p.color;
        ctx.shadowBlur = r * 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,200,0.4)';
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
      } else if (p.type === 'water') {
        // Water droplet — cyan radial gradient
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        const wr = Math.max(0.4, p.size);
        ctx.beginPath();
        ctx.arc(p.x, p.y, wr, 0, Math.PI * 2);
        const wg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, wr);
        wg.addColorStop(0, 'rgba(210,250,255,1)');
        wg.addColorStop(1, 'rgba(60,160,220,0.3)');
        ctx.fillStyle = wg;
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.3, p.size), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha * 0.7;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Ambient floating particles
    for (let i = 0; i < 8; i++) {
      const px = Math.sin(time * 0.2 + i * 1.5) * 350;
      const py = Math.cos(time * 0.15 + i * 0.9) * 200;
      ctx.beginPath();
      ctx.arc(px, py, 1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100,160,255,${0.05 + Math.sin(time * 0.5 + i) * 0.03})`;
      ctx.fill();
    }

    ctx.restore();

    // ─── Night / dusk overlay on full scene ────────────────────────────────
    if (darkness > 0.05) {
      const overlayAlpha = darkness * 0.15; // subtle dark overlay
      ctx.fillStyle = `rgba(${ambient.r},${ambient.g},${ambient.b},${overlayAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }

    animRef.current = requestAnimationFrame(render);
  }, [tick, drawBuilding, drawPowerGrid]);

  // Click detection
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (mouseRef.current.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const state = storeRef.current;
    const mx = (e.clientX - rect.left - canvas.width / 2 - state.cameraX) / state.zoom;
    const my = (e.clientY - rect.top - canvas.height * 0.38 - state.cameraY) / state.zoom;

    // Fountain coin toss — click within 40px of the plaza center
    const fp = gridToScreen(7.5, 7.5);
    const fdx = mx - fp.x;
    const fdy = my - fp.y;
    if (Math.sqrt(fdx * fdx + fdy * fdy) < 40) {
      coinCountRef.current += 1;
      // Arc a coin from click point toward fountain with parabolic velocity
      spawnParticles([{
        x: mx + (Math.random() - 0.5) * 8,
        y: my,
        vx: (fp.x - mx) * 0.12 + (Math.random() - 0.5) * 4,
        vy: -28 - Math.random() * 14,
        life: 1.1,
        maxLife: 1.1,
        color: '#FFD700',
        size: 3.5,
        type: 'coin',
      }]);
      return;
    }

    for (const cfg of BUILDING_CONFIGS) {
      const pos = gridToScreen(cfg.gridX, cfg.gridY);
      const bw = cfg.width * TILE_WIDTH * 0.8;
      const dx = Math.abs(mx - pos.x);
      const dy = my - (pos.y - cfg.height);
      if (dx < bw / 2 + 15 && dy > -15 && dy < cfg.height + 25) {
        selectAgent(cfg.role);
        return;
      }
    }
    selectAgent(null);
  }, [selectAgent, spawnParticles]);

  // Pan & zoom
  const dragStartRef = useRef({ x: 0, y: 0 });
  const touchRef = useRef({ lastDist: 0, lastX: 0, lastY: 0 });
  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    mouseRef.current = { dragging: false, lastX: e.clientX, lastY: e.clientY };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!(e.buttons & 1)) return;
    const dx = e.clientX - mouseRef.current.lastX;
    const dy = e.clientY - mouseRef.current.lastY;
    const totalDx = e.clientX - dragStartRef.current.x;
    const totalDy = e.clientY - dragStartRef.current.y;
    if (Math.abs(totalDx) + Math.abs(totalDy) > 5) mouseRef.current.dragging = true;
    panCamera(dx, dy);
    mouseRef.current.lastX = e.clientX;
    mouseRef.current.lastY = e.clientY;
  };
  const handleMouseUp = () => {
    setTimeout(() => { mouseRef.current.dragging = false; }, 10);
  };
  const handleWheel = (e: React.WheelEvent) => {
    setZoom(storeRef.current.zoom - e.deltaY * 0.001);
  };

  // Touch handlers for mobile pan & pinch-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      dragStartRef.current = { x: t.clientX, y: t.clientY };
      mouseRef.current = { dragging: false, lastX: t.clientX, lastY: t.clientY };
      touchRef.current.lastDist = 0;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current.lastDist = Math.sqrt(dx * dx + dy * dy);
      touchRef.current.lastX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      touchRef.current.lastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - mouseRef.current.lastX;
      const dy = t.clientY - mouseRef.current.lastY;
      const totalDx = t.clientX - dragStartRef.current.x;
      const totalDy = t.clientY - dragStartRef.current.y;
      if (Math.abs(totalDx) + Math.abs(totalDy) > 5) mouseRef.current.dragging = true;
      panCamera(dx, dy);
      mouseRef.current.lastX = t.clientX;
      mouseRef.current.lastY = t.clientY;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      if (touchRef.current.lastDist > 0) {
        const scale = dist / touchRef.current.lastDist;
        setZoom(storeRef.current.zoom * scale);
        const panDx = midX - touchRef.current.lastX;
        const panDy = midY - touchRef.current.lastY;
        panCamera(panDx, panDy);
      }
      touchRef.current.lastDist = dist;
      touchRef.current.lastX = midX;
      touchRef.current.lastY = midY;
    }
  };
  const handleTouchEnd = () => {
    touchRef.current.lastDist = 0;
    setTimeout(() => { mouseRef.current.dragging = false; }, 10);
  };

  // Init
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Preload all building sprites
    preloadAllSprites();
    if (Math.abs(storeRef.current.zoom - 1) < 0.001) {
      setZoom(1.16);
    }

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    lastTime.current = performance.now();
    animRef.current = requestAnimationFrame(render);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    />
  );
}
