/**
 * Coils and Ampère's law for lesson 4.3: a flat coil, a few coaxial turns, a solenoid, all drawn in
 * the plane through their common axis; the sum Σ B∥·Δℓ along a closed path, edge by edge; and the
 * current that the path encloses.
 *
 * MODEL SPECIFICATION
 * - System: coaxial circular turns of thin wire, their axis along x through (x0, y0) in the page,
 *   straight thin wires perpendicular to the page, and a thick straight wire (radius R) with its
 *   current spread evenly over the cross-section. The page cuts every turn twice, at y0 + R and
 *   y0 − R. Figure coordinates: x right, y up, z out of the page (⊙).
 * - Dynamics: each turn contributes the exact field of a circular loop (`loopField` in
 *   magnetism.ts); a turn with I > 0 makes B point along +x on the axis, so its top cut carries the
 *   current out of the page (⊙) and its bottom cut into it (⊗). Wires use `wireFieldAt`. The sums of
 *   B·Δℓ use the midpoint rule on pieces no longer than `h`.
 * - Boundary: fields vanish at infinity; no magnetic materials (no iron core).
 * - Ignored: the thickness of the thin wires (the thick wire is the one exception), the leads that feed the turns, the pitch of a winding (every
 *   turn is a closed circle), the field of a solenoid's current along its length.
 * - Valid when: a closed path stays further from every cut than a few pieces h; then the sum equals
 *   μ₀ times the enclosed current to the accuracy of the midpoint rule.
 * - Failure modes: the field is singular on a cut; a path that runs through a cut has no defined
 *   enclosed current. `distanceToPath` lets callers refuse such a path.
 */

import { MU0 } from './constants';
import { loopField, wireFieldAt, type Solenoid, type Wire } from './magnetism';
import type { Vec2 } from './vec';

/** One circular turn whose axis is the x axis of the page through y0; I > 0 makes B along +x inside. */
export interface Turn {
  /** the turn's plane is x = x [m] */
  x: number;
  y0: number;
  R: number;
  I: number;
}

/** Field in the page plane of coaxial turns [T]. */
export function turnsFieldAt(turns: readonly Turn[], x: number, y: number): Vec2 {
  let bx = 0;
  let by = 0;
  for (const t of turns) {
    const f = loopField(t.I, t.R, y - t.y0, x - t.x);
    bx += f.z;
    by += f.rho;
  }
  return [bx, by];
}

/** A flat coil of N turns wound on top of each other: one turn carrying N·I. */
export const flatCoil = (x: number, y0: number, R: number, N: number, I: number): Turn[] => [{ x, y0, R, I: N * I }];

/** `count` equal turns, each carrying I, centred on x0 with distance `spacing` between neighbours. */
export function coaxialTurns(x0: number, y0: number, R: number, I: number, count: number, spacing: number): Turn[] {
  return Array.from({ length: count }, (_, i) => ({ x: x0 + (i - (count - 1) / 2) * spacing, y0, R, I }));
}

/**
 * The turns `solenoidFieldAt(s, x, y, loops)` sums: `loops` equally spaced turns sharing N·I. The
 * field of these turns is exactly that function's field, so a figure that draws these cuts and
 * counts them for Ampère's law agrees with the field it draws.
 */
export function solenoidTurns(s: Solenoid, loops: number): Turn[] {
  return Array.from({ length: loops }, (_, i) => ({
    x: s.x0 - s.L / 2 + ((i + 0.5) * s.L) / loops,
    y0: s.y0,
    R: s.R,
    I: (s.N * s.I) / loops,
  }));
}

/** Where the page cuts the turns: each turn gives a ⊙ cut on top and a ⊗ cut below (for I > 0). */
export function turnCuts(turns: readonly Turn[]): Wire[] {
  return turns.flatMap((t) => [
    { x: t.x, y: t.y0 + t.R, I: t.I },
    { x: t.x, y: t.y0 - t.R, I: -t.I },
  ]);
}

/** The field of turns and of wires perpendicular to the page, together [T]. */
export function combinedFieldAt(turns: readonly Turn[], wires: readonly Wire[], x: number, y: number): Vec2 {
  const a = turnsFieldAt(turns, x, y);
  if (wires.length === 0) return a;
  const b = wireFieldAt(wires, x, y);
  return [a[0] + b[0], a[1] + b[1]];
}

/* ------------------------------------------------------------------ Ampère's law */

/** Σ B·Δℓ along the straight segment a → b, midpoint rule on pieces no longer than h [T·m]. */
export function segmentSum(field: (x: number, y: number) => Vec2, a: Vec2, b: Vec2, h: number): number {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(L / h));
  const dx = (b[0] - a[0]) / n;
  const dy = (b[1] - a[1]) / n;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const [fx, fy] = field(a[0] + (k + 0.5) * dx, a[1] + (k + 0.5) * dy);
    sum += fx * dx + fy * dy;
  }
  return sum;
}

/** Σ B·Δℓ along each edge of a closed polygon (edge i runs from vertex i to vertex i + 1) [T·m]. */
export function edgeSums(field: (x: number, y: number) => Vec2, path: readonly Vec2[], h: number): number[] {
  return path.map((a, i) => segmentSum(field, a, path[(i + 1) % path.length], h));
}

/** Signed area of a polygon: positive when it runs counterclockwise (y up) [m²]. */
export function signedArea(path: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < path.length; i++) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[(i + 1) % path.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function inside(path: readonly Vec2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const [xi, yi] = path[i];
    const [xj, yj] = path[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * The current a closed path encloses, with the right-hand-rule sign [A]: curl the fingers along the
 * path, and a current along the thumb counts positive. For a counterclockwise path that is a current
 * out of the page (⊙, I > 0); for a clockwise path every sign flips.
 */
export function enclosedCurrent(wires: readonly Wire[], path: readonly Vec2[]): number {
  const sense = signedArea(path) >= 0 ? 1 : -1;
  return sense * wires.reduce((s, w) => (inside(path, w.x, w.y) ? s + w.I : s), 0);
}

/** Shortest distance from (x, y) to the edges of a closed polygon [m]. */
export function distanceToPath(path: readonly Vec2[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < path.length; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[(i + 1) % path.length];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/** A circle as a counterclockwise polygon of n vertices. */
export function circlePath(cx: number, cy: number, r: number, n = 96): Vec2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Vec2;
  });
}

/** An axis-aligned rectangle as a counterclockwise polygon: bottom, right, top, left edges in that order. */
export function rectPath(x1: number, y1: number, x2: number, y2: number): Vec2[] {
  const [l, r] = x1 < x2 ? [x1, x2] : [x2, x1];
  const [b, t] = y1 < y2 ? [y1, y2] : [y2, y1];
  return [
    [l, b],
    [r, b],
    [r, t],
    [l, t],
  ];
}

/* ------------------------------------------------------------------ a thick wire */

/**
 * A long straight wire of radius R perpendicular to the page at (cx, cy), carrying I spread evenly
 * over its cross-section (I > 0 out of the page, ⊙). Ampère's law on a circle of radius r around
 * its axis gives B·2πr = μ₀I·(r²/R²) inside, so B = μ₀Ir/(2πR²) grows linearly from zero on the
 * axis; outside, B = μ₀I/(2πr) as for a thin wire. The field circles the axis counterclockwise for
 * I > 0 [T].
 */
export interface ThickWire {
  x: number;
  y: number;
  R: number;
  I: number;
}

export function thickWireFieldAt(w: ThickWire, x: number, y: number): Vec2 {
  const dx = x - w.x;
  const dy = y - w.y;
  const r2 = dx * dx + dy * dy;
  if (r2 === 0) return [0, 0];
  // B/r along the counterclockwise unit (−dy, dx)/r: inside μ₀I/(2πR²), outside μ₀I/(2πr²)
  const k = (MU0 * w.I) / (2 * Math.PI * Math.max(r2, w.R * w.R));
  return [-k * dy, k * dx];
}

/** Magnitude of the thick wire's field at distance r from its axis [T]. */
export const thickWireField = (I: number, R: number, r: number): number =>
  r < R ? (MU0 * Math.abs(I) * r) / (2 * Math.PI * R * R) : (MU0 * Math.abs(I)) / (2 * Math.PI * r);

/**
 * The fraction of a disc (centre (cx, cy), radius R) that lies inside a closed polygon, by counting
 * the centres of an n×n grid of equal cells over the disc's bounding square. For a uniform current
 * this fraction times I is the current the path encloses. Error ≈ perimeter·cell/area, below 1% at
 * the default n.
 */
export function discFractionInside(path: readonly Vec2[], cx: number, cy: number, R: number, n = 240): number {
  let inDisc = 0;
  let both = 0;
  const h = (2 * R) / n;
  for (let i = 0; i < n; i++) {
    const x = cx - R + (i + 0.5) * h;
    for (let j = 0; j < n; j++) {
      const y = cy - R + (j + 0.5) * h;
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      inDisc++;
      if (inside(path, x, y)) both++;
    }
  }
  return inDisc === 0 ? 0 : both / inDisc;
}
