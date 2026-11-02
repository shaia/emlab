/**
 * Bar magnets and compasses for lesson 4.1: the field of one or more bar magnets in the plane of a
 * table, plus an optional uniform field (the Earth's horizontal component), and how a compass needle
 * lines up with the sum.
 *
 * MODEL SPECIFICATION
 * - System: bar magnets lying in the page (the table top), each a rectangle of length L and width 2R
 *   with its north pole at one end, and compass needles free to turn in the page. Figure
 *   coordinates: x to the right (east, in the Earth preset), y up (north), metres.
 * - Dynamics: each magnet is modelled as a short, wide solenoid (`solenoidFieldAt` of
 *   magnetism.ts) whose axis runs from its S end to its N end; outside, a uniformly magnetised bar
 *   and a solenoid of the same shape have the same field, and inside both carry the lines from S to
 *   N, so every field line is closed. The strength is set by the ampere-turns NI (for a magnet, its
 *   magnetisation times its length). Fields add as vectors (superposition), and a uniform field may
 *   be added. A compass needle points along the total field in the page; its north end points the
 *   way B points.
 * - Boundary: fields vanish far from the magnets (apart from the uniform part).
 * - Ignored: the vertical component of the Earth's field (the needle turns only in the page), the
 *   magnets' influence on one another's magnetisation, iron nearby, the needle's own field and
 *   inertia (it is drawn already at rest).
 * - Valid when: compasses stay outside the bars; fields steady.
 * - Failure modes: the solenoid stand-in has its current on the bar's long sides, so the field is
 *   singular there (callers keep compasses outside the body and seed field lines well inside it,
 *   |offset| ≤ 0.7R). A broken magnet is two magnets with the same NI per length.
 */

import { solenoidFieldAt, type Solenoid } from './magnetism';
import type { Vec2 } from './vec';

export interface BarMagnet {
  /** centre [m] */
  x: number;
  y: number;
  /** direction from the S end to the N end, radians from +x (0: N on the right) */
  angle: number;
  /** length [m] */
  L: number;
  /** half-width [m] */
  R: number;
  /** ampere-turns of the solenoid stand-in [A] */
  NI: number;
}

/** Loops per magnet: enough for a smooth field outside the bar and a figure that redraws while dragging. */
export const MAGNET_LOOPS = 16;

/** Field of one bar magnet at (x, y) [T]: the solenoid field in the magnet's own frame, rotated back. */
export function barMagnetField(m: BarMagnet, x: number, y: number, loops = MAGNET_LOOPS): Vec2 {
  const c = Math.cos(m.angle);
  const s = Math.sin(m.angle);
  const dx = x - m.x;
  const dy = y - m.y;
  // the point in the magnet's frame (axis along +x)
  const u = c * dx + s * dy;
  const v = -s * dx + c * dy;
  const sol: Solenoid = { x0: 0, y0: 0, L: m.L, R: m.R, N: 1, I: m.NI };
  const [bu, bv] = solenoidFieldAt(sol, u, v, loops);
  return [c * bu - s * bv, s * bu + c * bv];
}

/** Total field of several magnets plus a uniform field (e.g. the Earth's horizontal component) [T]. */
export function magnetsFieldAt(
  magnets: readonly BarMagnet[],
  x: number,
  y: number,
  uniform: Vec2 = [0, 0],
  loops = MAGNET_LOOPS,
): Vec2 {
  let bx = uniform[0];
  let by = uniform[1];
  for (const m of magnets) {
    const [mx, my] = barMagnetField(m, x, y, loops);
    bx += mx;
    by += my;
  }
  return [bx, by];
}

/** The two pole faces' centres: N at the end the angle points to, S at the other. */
export function poles(m: BarMagnet): { N: Vec2; S: Vec2 } {
  const hx = (Math.cos(m.angle) * m.L) / 2;
  const hy = (Math.sin(m.angle) * m.L) / 2;
  return { N: [m.x + hx, m.y + hy], S: [m.x - hx, m.y - hy] };
}

/** True when (x, y) lies inside the bar's rectangle, grown by `pad` on every side. */
export function insideMagnet(m: BarMagnet, x: number, y: number, pad = 0): boolean {
  const c = Math.cos(m.angle);
  const s = Math.sin(m.angle);
  const u = c * (x - m.x) + s * (y - m.y);
  const v = -s * (x - m.x) + c * (y - m.y);
  return Math.abs(u) <= m.L / 2 + pad && Math.abs(v) <= m.R + pad;
}

/**
 * Break a magnet across its middle into two magnets of half the length, pulled `gap` apart along the
 * axis. Each half keeps the same NI per length (the same magnetisation), so each is a whole magnet
 * with its own N and S: a single pole never appears.
 */
export function breakMagnet(m: BarMagnet, gap: number): [BarMagnet, BarMagnet] {
  const off = m.L / 4 + gap / 2;
  const ox = Math.cos(m.angle) * off;
  const oy = Math.sin(m.angle) * off;
  const half = { ...m, L: m.L / 2, NI: m.NI / 2 };
  return [
    { ...half, x: m.x - ox, y: m.y - oy },
    { ...half, x: m.x + ox, y: m.y + oy },
  ];
}

/** The direction a compass needle's north end points: the angle of B in the page (radians from +x). */
export const needleAngle = (B: Vec2): number => Math.atan2(B[1], B[0]);

/**
 * Angle of a compass needle away from the Earth's horizontal field, when a magnet adds a field
 * B_m perpendicular to it: tanθ = B_m/B_E [rad]. For any direction of B_m use the vector sum.
 */
export const deflectionFromNorth = (Bm: number, BE: number): number => Math.atan2(Bm, BE);

/** Magnitude and angle of the sum of two fields of magnitudes B1, B2 with angle φ between them. */
export function sumOfTwo(B1: number, B2: number, phi: number): { B: number; angleFromB1: number } {
  const x = B1 + B2 * Math.cos(phi);
  const y = B2 * Math.sin(phi);
  return { B: Math.hypot(x, y), angleFromB1: Math.atan2(y, x) };
}
