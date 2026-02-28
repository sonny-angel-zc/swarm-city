import { TILE_WIDTH, TILE_HEIGHT } from './types';

export function gridToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (TILE_WIDTH / 2),
    y: (gx + gy) * (TILE_HEIGHT / 2),
  };
}

export function screenToGrid(sx: number, sy: number): { gx: number; gy: number } {
  return {
    gx: Math.round((sx / (TILE_WIDTH / 2) + sy / (TILE_HEIGHT / 2)) / 2),
    gy: Math.round((sy / (TILE_HEIGHT / 2) - sx / (TILE_WIDTH / 2)) / 2),
  };
}

// Draw an isometric diamond tile
export function drawIsoDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  w: number, h: number,
  topColor: string, leftColor: string, rightColor: string,
) {
  // Top face
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();

  // Left face (just an outline accent)
  ctx.strokeStyle = leftColor;
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// Draw a 3D isometric box (building)
export function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  w: number, d: number, h: number,
  topColor: string, leftColor: string, rightColor: string,
  strokeColor?: string,
) {
  const hw = w / 2;
  const hd = d / 2;

  // Left face
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy);
  ctx.lineTo(cx, cy + hd);
  ctx.lineTo(cx, cy + hd - h);
  ctx.lineTo(cx - hw, cy - h);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();

  // Right face
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hd);
  ctx.lineTo(cx, cy + hd - h);
  ctx.lineTo(cx + hw, cy - h);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();

  // Top face
  ctx.beginPath();
  ctx.moveTo(cx, cy - hd - h);
  ctx.lineTo(cx + hw, cy - h);
  ctx.lineTo(cx, cy + hd - h);
  ctx.lineTo(cx - hw, cy - h);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();

  if (strokeColor) {
    // Stroke all edges
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    // Top
    ctx.beginPath();
    ctx.moveTo(cx, cy - hd - h);
    ctx.lineTo(cx + hw, cy - h);
    ctx.lineTo(cx, cy + hd - h);
    ctx.lineTo(cx - hw, cy - h);
    ctx.closePath();
    ctx.stroke();
    // Left
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx - hw, cy - h);
    ctx.stroke();
    // Right
    ctx.beginPath();
    ctx.moveTo(cx + hw, cy);
    ctx.lineTo(cx + hw, cy - h);
    ctx.stroke();
    // Bottom edges
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx, cy + hd);
    ctx.lineTo(cx + hw, cy);
    ctx.stroke();
  }
}
