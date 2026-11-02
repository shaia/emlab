/** Shared drawing and formatting helpers for the field-language figure (lesson 6.3). */

import type { Palette } from '../core/canvas';
import { withAlpha } from '../core/ink';
import { sci } from '../core/format';

/** A readout number: three significant figures, a true minus sign, and a plain 0. */
export const num = (x: number, sig = 3) => (Math.abs(x) < 1e-12 ? '0' : sci(x, sig).replace('-', '−'));

/** A vector as "(a, b)" or "(a, b, c)". */
export const vecText = (v: readonly number[], sig = 3) => `(${v.map((c) => num(c, sig)).join(', ')})`;

/** Degrees, rounded to 0.1°. */
export const degText = (rad: number) => `${num(Math.round(((rad * 180) / Math.PI) * 10) / 10, 4)}°`;

/** A draggable handle: a soft ring around a point. */
export function handle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, selected: boolean, p: Palette, r = 8) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(color, 0.18);
  ctx.fill();
  ctx.lineWidth = selected ? 2.6 : 1.4;
  ctx.strokeStyle = selected ? p.ink : color;
  ctx.stroke();
  ctx.restore();
}

/** An italic label for a vector or a point, centred at (x, y). */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, p: Palette, size = 14) {
  ctx.save();
  ctx.font = `italic 700 ${size}px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // a paper halo keeps the label readable over lines and shading
  ctx.lineWidth = 4;
  ctx.strokeStyle = withAlpha(p.paper, 0.85);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Label beside the middle of a segment, pushed off it to one side by `off` px. */
export function sideLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  p: Palette,
  off = 14,
) {
  const L = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / L;
  const ny = (x2 - x1) / L;
  label(ctx, text, (x1 + x2) / 2 + nx * off, (y1 + y2) / 2 + ny * off, color, p);
}

/** A dashed straight segment in screen space. */
export function dashed(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 1.3,
  dash = [5, 5],
) {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** A small filled point. */
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r = 4) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
