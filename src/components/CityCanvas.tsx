'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSwarmStore } from '@/core/store';
import {
  TILE_WIDTH, TILE_HEIGHT, GRID_SIZE, BUILDING_CONFIGS,
  AgentRole, AgentStatus, BuildingConfig,
} from '@/core/types';
import { gridToScreen, drawIsoBox } from '@/core/isometric';

// Road layout
const ROAD_TILES = new Set<string>();
// Main arteries
for (let i = 0; i < GRID_SIZE; i++) {
  ROAD_TILES.add(`7,${i}`);
  ROAD_TILES.add(`8,${i}`);
  ROAD_TILES.add(`${i},7`);
  ROAD_TILES.add(`${i},8`);
}
// Side streets
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

// Decorative buildings (small filler)
const DECO_BUILDINGS: { gx: number; gy: number; h: number; color: string }[] = [
  { gx: 1, gy: 1, h: 20, color: '#1a2744' },
  { gx: 2, gy: 1, h: 15, color: '#1c2840' },
  { gx: 1, gy: 2, h: 25, color: '#192540' },
  { gx: 13, gy: 1, h: 18, color: '#1a2744' },
  { gx: 14, gy: 2, h: 22, color: '#1c2840' },
  { gx: 1, gy: 13, h: 16, color: '#192540' },
  { gx: 2, gy: 14, h: 20, color: '#1a2744' },
  { gx: 13, gy: 13, h: 24, color: '#1c2840' },
  { gx: 14, gy: 14, h: 18, color: '#192540' },
  { gx: 5, gy: 6, h: 12, color: '#151d30' },
  { gx: 6, gy: 5, h: 10, color: '#151d30' },
  { gx: 9, gy: 6, h: 14, color: '#151d30' },
  { gx: 10, gy: 5, h: 11, color: '#151d30' },
  { gx: 5, gy: 9, h: 13, color: '#151d30' },
  { gx: 6, gy: 10, h: 9, color: '#151d30' },
  { gx: 9, gy: 9, h: 15, color: '#151d30' },
  { gx: 10, gy: 10, h: 11, color: '#151d30' },
];

// Building architectural details by role
function drawBuildingDetails(
  ctx: CanvasRenderingContext2D,
  cfg: BuildingConfig,
  cx: number, cy: number,
  bw: number, bh: number,
  time: number,
  status: AgentStatus,
) {
  const hw = bw / 2;

  // Windows - grid of lit squares
  const cols = Math.max(2, Math.floor(bw / 16));
  const rows = Math.max(2, Math.floor(bh / 18));
  const winW = 5;
  const winH = 6;

  // Left face windows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < Math.ceil(cols / 2); c++) {
      const wx = cx - hw + 4 + c * (hw / (cols / 2 + 0.5));
      const wy = cy - bh + 10 + r * (bh / (rows + 0.5));
      const flicker = status === 'working' ? 0.5 + Math.sin(time * 3 + r * 1.3 + c * 2.1) * 0.3 : 0.15;
      ctx.fillStyle = status === 'idle'
        ? `rgba(100,120,160,${0.08 + Math.sin(time * 0.5 + r + c) * 0.03})`
        : `rgba(255,240,180,${flicker})`;
      ctx.fillRect(wx, wy, winW, winH);
    }
  }

  // Right face windows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < Math.ceil(cols / 2); c++) {
      const wx = cx + 4 + c * (hw / (cols / 2 + 0.5));
      const wy = cy - bh + 10 + r * (bh / (rows + 0.5));
      const flicker = status === 'working' ? 0.4 + Math.sin(time * 2.5 + r * 0.9 + c * 1.7) * 0.25 : 0.1;
      ctx.fillStyle = status === 'idle'
        ? `rgba(80,100,140,${0.06 + Math.sin(time * 0.3 + r + c) * 0.02})`
        : `rgba(255,240,180,${flicker})`;
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

export default function CityCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastTime = useRef(0);
  const mouseRef = useRef({ dragging: false, lastX: 0, lastY: 0 });

  const tick = useSwarmStore(s => s.tick);
  const selectAgent = useSwarmStore(s => s.selectAgent);
  const setCameraPos = useSwarmStore(s => s.setCameraPos);
  const setZoom = useSwarmStore(s => s.setZoom);

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

  const drawBuilding = useCallback((
    ctx: CanvasRenderingContext2D,
    role: AgentRole,
    time: number,
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
      const glowColor = agent.status === 'needs_input' ? b.color : // use building color
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

    // Opacity for idle
    const alpha = agent.status === 'idle' ? 0.5 : 1;
    ctx.globalAlpha = alpha;

    // Main building
    const topCol = agent.status === 'idle' ? '#1a2030' : b.color;
    const leftCol = agent.status === 'idle' ? '#0f1520' : b.dark;
    const rightCol = agent.status === 'idle' ? '#222d40' : b.accent;
    drawIsoBox(ctx, cx, cy, bw, bd, bh, topCol, leftCol, rightCol, 'rgba(0,0,0,0.4)');

    // Architectural details
    ctx.globalAlpha = alpha;
    drawBuildingDetails(ctx, b, cx, cy, bw, bh, time, agent.status);

    ctx.globalAlpha = 1;

    // Status-specific effects
    if (agent.status === 'working') {
      // Particles rising from building
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
      // Pulsing ring
      const pulse = 0.5 + Math.sin(time * 5) * 0.5;
      ctx.strokeStyle = `rgba(255,60,60,${0.4 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy - bh / 2, bw * 0.6 + pulse * 5, bd * 0.4 + pulse * 3, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Exclamation
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,60,60,${0.7 + pulse * 0.3})`;
      ctx.fillText('!', cx, cy - bh - 14);
    }

    if (agent.status === 'done') {
      // Sparkle effect
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
      ctx.fillText('✓', cx, cy - bh - 10);
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

      // Progress text
      ctx.font = '9px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(agent.progress * 100)}%`, cx, barY - 3);
    }

    // Building label
    ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';

    // Label background
    const label = `${b.icon} ${b.buildingName}`;
    const labelW = ctx.measureText(label).width + 10;
    const labelY = cy - bh - (agent.status === 'working' ? 32 : 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(cx - labelW / 2, labelY - 9, labelW, 14, 3);
    ctx.fill();

    ctx.fillStyle = agent.status === 'idle' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)';
    ctx.fillText(label, cx, labelY);

    // Task name (small, below label)
    if (agent.currentTask && agent.status !== 'idle') {
      const taskLabel = agent.currentTask.length > 28
        ? agent.currentTask.slice(0, 28) + '…'
        : agent.currentTask;
      ctx.font = '8px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(taskLabel, cx, labelY + 12);
    }

    ctx.restore();
  }, []);

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

    // Background
    ctx.clearRect(0, 0, W, H);
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#050810');
    bgGrad.addColorStop(0.5, '#0a0f1e');
    bgGrad.addColorStop(1, '#060a13');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (const s of starsRef.current) {
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H * 0.6, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,200,255,${s.a * (0.5 + Math.sin(time * 0.5 + s.x * 10) * 0.3)})`;
      ctx.fill();
    }

    // City scene
    ctx.save();
    ctx.translate(W / 2 + state.cameraX, H * 0.38 + state.cameraY);
    ctx.scale(state.zoom, state.zoom);

    // Ground tiles
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      for (let gy = 0; gy < GRID_SIZE; gy++) {
        const pos = gridToScreen(gx, gy);
        const isRoad = ROAD_TILES.has(`${gx},${gy}`);

        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - TILE_HEIGHT / 2);
        ctx.lineTo(pos.x + TILE_WIDTH / 2, pos.y);
        ctx.lineTo(pos.x, pos.y + TILE_HEIGHT / 2);
        ctx.lineTo(pos.x - TILE_WIDTH / 2, pos.y);
        ctx.closePath();

        if (isRoad) {
          ctx.fillStyle = '#151c2d';
          ctx.fill();
          ctx.strokeStyle = 'rgba(80,120,180,0.08)';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Center line markings on main roads
          if (gx === 7 || gx === 8 || gy === 7 || gy === 8) {
            if ((gx + gy) % 2 === 0) {
              ctx.fillStyle = 'rgba(255,200,60,0.08)';
              ctx.fillRect(pos.x - 1, pos.y - 0.5, 2, 1);
            }
          }
        } else {
          ctx.fillStyle = '#0b1020';
          ctx.fill();
          ctx.strokeStyle = 'rgba(40,60,100,0.06)';
          ctx.lineWidth = 0.3;
          ctx.stroke();
        }
      }
    }

    // Deco buildings (background filler)
    for (const d of DECO_BUILDINGS) {
      const pos = gridToScreen(d.gx, d.gy);
      if (!ROAD_TILES.has(`${d.gx},${d.gy}`)) {
        const dark = '#0a0f1a';
        const light = '#1f2940';
        drawIsoBox(ctx, pos.x, pos.y, 28, 16, d.h, d.color, dark, light);
        // Tiny windows
        for (let r = 0; r < Math.floor(d.h / 10); r++) {
          ctx.fillStyle = `rgba(255,240,180,${0.05 + Math.sin(time * 0.3 + d.gx + d.gy + r) * 0.03})`;
          ctx.fillRect(pos.x - 6 + r * 5, pos.y - d.h + 5 + r * 8, 3, 3);
        }
      }
    }

    // Vehicles
    for (const v of state.vehicles) {
      const fromB = state.agents[v.fromAgent].building;
      const toB = state.agents[v.toAgent].building;
      const from = gridToScreen(fromB.gridX, fromB.gridY);
      const to = gridToScreen(toB.gridX, toB.gridY);

      // Route via center
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

      // Glow
      ctx.shadowColor = v.color;
      ctx.shadowBlur = 10;

      // Vehicle body
      ctx.beginPath();
      ctx.moveTo(vx, vy - 4);
      ctx.lineTo(vx + 7, vy);
      ctx.lineTo(vx, vy + 4);
      ctx.lineTo(vx - 7, vy);
      ctx.closePath();
      ctx.fillStyle = v.color;
      ctx.fill();

      // Inner highlight
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

      // Trail
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
      drawBuilding(ctx, cfg.role, time);
    }

    // Particles
    for (const p of state.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, p.size), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife) * 0.7;
      ctx.fill();
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

    animRef.current = requestAnimationFrame(render);
  }, [tick, drawBuilding]);

  // Click detection
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (mouseRef.current.dragging) return; // was a drag, not click
    const rect = canvas.getBoundingClientRect();
    const state = storeRef.current;
    const mx = (e.clientX - rect.left - canvas.width / 2 - state.cameraX) / state.zoom;
    const my = (e.clientY - rect.top - canvas.height * 0.38 - state.cameraY) / state.zoom;

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
  }, [selectAgent]);

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
    const s = storeRef.current;
    setCameraPos(s.cameraX + dx, s.cameraY + dy);
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
      const s = storeRef.current;
      setCameraPos(s.cameraX + dx, s.cameraY + dy);
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
        // Pan with two fingers
        const panDx = midX - touchRef.current.lastX;
        const panDy = midY - touchRef.current.lastY;
        const s = storeRef.current;
        setCameraPos(s.cameraX + panDx, s.cameraY + panDy);
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
