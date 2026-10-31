/**
 * Drawing helpers shared by the scenes of the charge lab. Every charge is drawn twice over so
 * its sign never depends on colour: a positive charge is a FILLED disc with a "+", a negative
 * charge (an electron) is an open RING with a "−".
 */

import type { Palette, View } from '../core/canvas';
import { withAlpha } from '../core/ink';

/** The stage is 160 × 120 design units (1 unit = 1 cm of the drawn apparatus). */
export const STAGE_W = 160;
export const STAGE_H = 120;

export interface Frame {
  u: number;
  X: (x: number) => number;
  Y: (y: number) => number;
}

export function frameOf(v: View): Frame {
  const u = v.ppm / 100;
  return { u, X: (x) => v.w / 2 + (x - STAGE_W / 2) * u, Y: (y) => v.h / 2 + (y - STAGE_H / 2) * u };
}

/** A positive charge: filled disc and a plus. Pass `ghost` for a place a charge could be. */
export function positive(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: Palette, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.pos;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.4, r * 0.22);
  ctx.lineCap = 'round';
  const g = r * 0.55;
  ctx.beginPath();
  ctx.moveTo(x - g, y);
  ctx.lineTo(x + g, y);
  ctx.moveTo(x, y - g);
  ctx.lineTo(x, y + g);
  ctx.stroke();
  ctx.restore();
}

/** A negative charge (an electron): open ring in the page colour, with a minus. */
export function negative(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: Palette, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.neg;
  ctx.lineWidth = Math.max(1.8, r * 0.26);
  ctx.beginPath();
  ctx.arc(x, y, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineCap = 'round';
  const g = r * 0.5;
  ctx.beginPath();
  ctx.moveTo(x - g, y);
  ctx.lineTo(x + g, y);
  ctx.stroke();
  ctx.restore();
}

/** An empty electron place (a missing electron): dashed ring. */
export function hole(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: Palette) {
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink, 0.35);
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, r - 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A solid body of apparatus: a rounded slab with a soft fill and an ink outline. */
export function slab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Palette,
  opts: { fill?: string; radius?: number; dash?: boolean } = {},
) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, opts.radius ?? 6);
  ctx.fillStyle = opts.fill ?? p.paper2;
  ctx.fill();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.6;
  if (opts.dash) ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.restore();
}

export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  p: Palette,
  o: { size?: number; color?: string; align?: CanvasTextAlign; weight?: number; hand?: boolean; baseline?: CanvasTextBaseline } = {},
) {
  ctx.save();
  ctx.font = `${o.weight ?? 600} ${o.size ?? 13}px ${o.hand ? p.fontHand : p.fontUi}`;
  ctx.fillStyle = o.color ?? p.ink2;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.baseline ?? 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Signed charge as text, in units of e: "−3e", "+2e", "0". Pure LTR symbols. */
export const eText = (q: number) => (q === 0 ? '0' : `${q > 0 ? '+' : '−'}${Math.abs(q)}e`);

/** Charge from an excess-electron count n (Q = −n·e), in units of e. */
export const chargeInE = (n: number) => (n === 0 ? 0 : -n);

/** Draw `count` charges of one kind on a row of slots; `n > 0` is electrons, `n < 0` plus discs. */
export function glyphFor(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, r: number, p: Palette) {
  if (n > 0) negative(ctx, x, y, r, p);
  else if (n < 0) positive(ctx, x, y, r, p);
}
