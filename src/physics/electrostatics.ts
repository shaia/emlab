/**
 * Electrostatics of point charges.
 *
 * MODEL SPECIFICATION
 * - System: N fixed point charges in vacuum. 2D figures show the z = 0 slice of 3D point
 *   charges, so fields fall off as 1/r² (not the 1/r of infinite line charges).
 * - Dynamics: none here; charges are static sources (moving test bodies live in motion.ts).
 * - Boundary: unbounded space, V → 0 at infinity.
 * - Ignored: polarisation of surroundings, gravity, relativistic and radiative effects.
 * - Valid when: charges are small compared with their separations and at rest.
 * - Failure modes: |E| and V diverge at a charge; callers keep probes outside `coreRadius`.
 */

import { K, EPS0 } from './constants';
import type { Vec2, Vec3 } from './vec';
import { len3, sub3, dot3, norm3 } from './vec';

export interface PointCharge {
  x: number;
  y: number;
  /** charge [C] */
  q: number;
}

export interface PointCharge3 {
  pos: Vec3;
  q: number;
}

/** Signed Coulomb force between two charges a distance r apart; positive means repulsion [N]. */
export function coulombForce(q1: number, q2: number, r: number): number {
  return (K * q1 * q2) / (r * r);
}

/** Field of a single point charge at distance r, magnitude only [N/C]. */
export function pointFieldMagnitude(q: number, r: number): number {
  return (K * Math.abs(q)) / (r * r);
}

/** Superposed electric field at (x, y) [N/C]. */
export function fieldAt(charges: readonly PointCharge[], x: number, y: number): Vec2 {
  let ex = 0;
  let ey = 0;
  for (const c of charges) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r2 = dx * dx + dy * dy;
    if (r2 === 0) continue;
    const r = Math.sqrt(r2);
    const f = (K * c.q) / (r2 * r);
    ex += f * dx;
    ey += f * dy;
  }
  return [ex, ey];
}

/** Electric potential at (x, y), zero at infinity [V]. */
export function potentialAt(charges: readonly PointCharge[], x: number, y: number): number {
  let v = 0;
  for (const c of charges) {
    const r = Math.hypot(x - c.x, y - c.y);
    if (r === 0) continue;
    v += (K * c.q) / r;
  }
  return v;
}

/** Net force on a test charge from all `sources` (the test charge itself excluded) [N]. */
export function forceOn(sources: readonly PointCharge[], test: PointCharge): Vec2 {
  const [ex, ey] = fieldAt(
    sources.filter((s) => s !== test),
    test.x,
    test.y,
  );
  return [test.q * ex, test.q * ey];
}

export interface Bounds {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface TraceOptions {
  /** +1 follows E (from + toward −), −1 follows −E. */
  direction: 1 | -1;
  bounds: Bounds;
  /** a line ending within this distance of a charge terminates on it [m] */
  coreRadius: number;
  /** largest step [m]; steps shrink near charges */
  maxStep: number;
  maxSteps?: number;
}

export interface TracedLine {
  points: Vec2[];
  /**
   * +1 when `points` run along E (a line traced from a positive charge), −1 when they run
   * against it (traced from a negative charge). Anything that marks the field's direction on
   * the line, or follows the line in the field's sense, must read this.
   */
  direction: 1 | -1;
  end: 'charge' | 'bounds' | 'steps' | 'null';
  /** index of the charge the line ended on, when end === 'charge' */
  endCharge?: number;
}

function nearestCharge(charges: readonly PointCharge[], x: number, y: number): [number, number] {
  let best = Infinity;
  let idx = -1;
  for (let i = 0; i < charges.length; i++) {
    const d = Math.hypot(x - charges[i].x, y - charges[i].y);
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  return [best, idx];
}

function direction(charges: readonly PointCharge[], x: number, y: number, sgn: number): Vec2 | null {
  const [ex, ey] = fieldAt(charges, x, y);
  const m = Math.hypot(ex, ey);
  if (m === 0 || !Number.isFinite(m)) return null;
  return [(sgn * ex) / m, (sgn * ey) / m];
}

/**
 * Trace one field line with RK4 on the unit direction field dx/ds = ±E/|E|.
 * Step length shrinks near charges so lines bend correctly around them.
 */
export function traceFieldLine(
  charges: readonly PointCharge[],
  start: Vec2,
  opts: TraceOptions,
): TracedLine {
  const { bounds, coreRadius, maxStep } = opts;
  const maxSteps = opts.maxSteps ?? 4000;
  const sgn = opts.direction;
  const points: Vec2[] = [start];
  let [x, y] = start;
  const margin = (bounds.xmax - bounds.xmin) * 0.05;

  for (let i = 0; i < maxSteps; i++) {
    const [dNear] = nearestCharge(charges, x, y);
    const h = Math.max(coreRadius * 0.15, Math.min(maxStep, dNear * 0.2));
    const k1 = direction(charges, x, y, sgn);
    if (!k1) return { points, direction: sgn, end: 'null' };
    const k2 = direction(charges, x + (h / 2) * k1[0], y + (h / 2) * k1[1], sgn);
    if (!k2) return { points, direction: sgn, end: 'null' };
    const k3 = direction(charges, x + (h / 2) * k2[0], y + (h / 2) * k2[1], sgn);
    if (!k3) return { points, direction: sgn, end: 'null' };
    const k4 = direction(charges, x + h * k3[0], y + h * k3[1], sgn);
    if (!k4) return { points, direction: sgn, end: 'null' };
    x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    points.push([x, y]);

    const [d, idx] = nearestCharge(charges, x, y);
    if (d < coreRadius && i > 2) {
      points.push([charges[idx].x, charges[idx].y]);
      return { points, direction: sgn, end: 'charge', endCharge: idx };
    }
    if (
      x < bounds.xmin - margin ||
      x > bounds.xmax + margin ||
      y < bounds.ymin - margin ||
      y > bounds.ymax + margin
    ) {
      return { points, direction: sgn, end: 'bounds' };
    }
  }
  return { points, direction: sgn, end: 'steps' };
}

export interface FieldLineOptions {
  bounds: Bounds;
  coreRadius: number;
  maxStep: number;
  /** charge represented by one field line [C]; line count per charge ∝ |q| */
  chargePerLine: number;
  /** minimum lines drawn from any non-zero charge */
  minLines?: number;
}

/**
 * Field lines whose density is proportional to charge: lines start on positive charges and
 * run forward; negative charges then emit backward lines, keeping only those that do not end
 * on a positive charge (those are already drawn from the other end).
 */
export function fieldLines(charges: readonly PointCharge[], opts: FieldLineOptions): TracedLine[] {
  const minLines = opts.minLines ?? 4;
  const lines: TracedLine[] = [];
  const startR = opts.coreRadius * 1.05;

  const emit = (sign: 1 | -1) => {
    charges.forEach((c) => {
      if (Math.sign(c.q) !== sign) return;
      const n = Math.max(minLines, Math.round(Math.abs(c.q) / opts.chargePerLine));
      // offset by half a slot so a symmetric pair never shoots a line straight at its partner
      const offset = Math.PI / n;
      for (let i = 0; i < n; i++) {
        const a = offset + (2 * Math.PI * i) / n;
        const start: Vec2 = [c.x + startR * Math.cos(a), c.y + startR * Math.sin(a)];
        const line = traceFieldLine(charges, start, {
          direction: sign,
          bounds: opts.bounds,
          coreRadius: opts.coreRadius,
          maxStep: opts.maxStep,
        });
        line.points.unshift([c.x, c.y]);
        if (sign === -1 && line.end === 'charge' && charges[line.endCharge!].q > 0) continue;
        lines.push(line);
      }
    });
  };

  emit(1);
  emit(-1);
  return lines;
}

/* ---------------------------- 3D: Gauss's law ---------------------------- */

export function fieldAt3(charges: readonly PointCharge3[], p: Vec3): Vec3 {
  let e: [number, number, number] = [0, 0, 0];
  for (const c of charges) {
    const r = sub3(p, c.pos);
    const d = len3(r);
    if (d === 0) continue;
    const f = (K * c.q) / (d * d * d);
    e = [e[0] + f * r[0], e[1] + f * r[1], e[2] + f * r[2]];
  }
  return e;
}

/** Evenly spread points on the unit sphere (Fibonacci lattice). */
export function fibonacciSphere(n: number): Vec3[] {
  const pts: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - z * z);
    const t = golden * i;
    pts.push([r * Math.cos(t), r * Math.sin(t), z]);
  }
  return pts;
}

/** Electric flux through a sphere, by summing E·n̂ dA over a Fibonacci lattice [N·m²/C]. */
export function fluxThroughSphere(
  charges: readonly PointCharge3[],
  center: Vec3,
  radius: number,
  samples = 20000,
): number {
  const dA = (4 * Math.PI * radius * radius) / samples;
  let flux = 0;
  for (const n of fibonacciSphere(samples)) {
    const p: Vec3 = [center[0] + radius * n[0], center[1] + radius * n[1], center[2] + radius * n[2]];
    flux += dot3(fieldAt3(charges, p), n) * dA;
  }
  return flux;
}

/** Electric flux through an axis-aligned cube, midpoint rule on each face [N·m²/C]. */
export function fluxThroughCube(
  charges: readonly PointCharge3[],
  center: Vec3,
  side: number,
  perEdge = 120,
): number {
  const h = side / 2;
  const d = side / perEdge;
  const dA = d * d;
  let flux = 0;
  for (let axis = 0; axis < 3; axis++) {
    for (const s of [-1, 1]) {
      const n: [number, number, number] = [0, 0, 0];
      n[axis] = s;
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      for (let i = 0; i < perEdge; i++) {
        for (let j = 0; j < perEdge; j++) {
          const p: [number, number, number] = [center[0], center[1], center[2]];
          p[axis] += s * h;
          p[u] += -h + (i + 0.5) * d;
          p[v] += -h + (j + 0.5) * d;
          flux += dot3(fieldAt3(charges, p), n) * dA;
        }
      }
    }
  }
  return flux;
}

/** Gauss's law prediction: Φ = q_enclosed / ε₀. */
export function gaussFlux(qEnclosed: number): number {
  return qEnclosed / EPS0;
}

/** Field of a uniformly charged thin spherical shell (or conducting sphere) at distance r [N/C]. */
export function shellField(Q: number, R: number, r: number): number {
  return r < R ? 0 : (K * Q) / (r * r);
}

/** Field magnitude of an infinite uniformly charged plane with surface density σ [N/C]. */
export function planeField(sigma: number): number {
  return Math.abs(sigma) / (2 * EPS0);
}

/** Field between two infinite plates carrying ±σ [N/C]. */
export function parallelPlatesField(sigma: number): number {
  return Math.abs(sigma) / EPS0;
}

/** Unit radial direction of a 3D point from a center, for figures. */
export const radial3 = (p: Vec3, c: Vec3): Vec3 => norm3(sub3(p, c));
