/**
 * Line integrals, the potential as one, and the field back from the potential: lesson 6.6.
 * Builds on the chapter 6 base (vectorcalc.ts `gradient2`, continuous.ts ring / disc potentials,
 * calculus.ts `derivative`) and on potential.ts `workAlongPath`, which is the same sum times q.
 *
 * MODEL SPECIFICATION
 * - System: a static planar field F(x, y) — the z = 0 slice of point charges (electrostatics.ts),
 *   or the rigid-rotation "swirl" teaching field of vectorcalc.ts, which is no electrostatic field —
 *   and a path given as a polyline; a ring of charge Q and radius R and a disc of density σ, on their
 *   axis z.
 * - Dynamics: none. The line integral ∫F·dl is the midpoint sum Σ F(midᵢ)·Δlᵢ over the polyline's
 *   segments. For an electrostatic field V(B) − V(A) = −∫_A^B E·dl, whatever the path, and the field
 *   comes back as E = −∇V. The rate of change of V along a unit direction û is ∇V·û (the
 *   directional derivative): largest along ∇V, zero along an equipotential. On the axis of a ring
 *   or a disc V is a sum of scalars kdq/r (no components cancel), and E_z = −dV/dz.
 * - Boundary: V → 0 at infinity for every charge here. The swirl field has no potential at all.
 * - Ignored: nothing physical; the fields are given.
 * - Valid when: the path's segments are short compared with the distance to the nearest point
 *   charge (the midpoint sum is O(Δl²) accurate); the derivative's step h is small compared with
 *   the distance over which V changes.
 * - Failure modes: a path through a point charge diverges (callers keep paths out of a core);
 *   on the disc's face (z = 0) V has a kink and −dV/dz jumps by σ/ε₀, so a central difference
 *   that straddles z = 0 returns the average of the two sides (zero), not either field.
 */

import { derivative } from './calculus';
import { discAxisPotential, ringAxisPotential } from './continuous';
import { workAlongPath } from './potential';
import type { Vec2 } from './vec';
import { gradient2, type Field2, type Scalar2 } from './vectorcalc';

/* -------------------------------------------------------------- paths */

/** ∫F·dl along a polyline: the midpoint sum, the work per unit charge for an electric field [V]. */
export const lineIntegral = (F: Field2, path: readonly Vec2[]): number => workAlongPath(1, F, path);

/** A straight path from A to B in n equal segments (n + 1 points). */
export function straightPath(A: Vec2, B: Vec2, n: number): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i) => [A[0] + ((B[0] - A[0]) * i) / n, A[1] + ((B[1] - A[1]) * i) / n] as const);
}

/**
 * A curved path from A to B bent towards the control point C: the quadratic Bézier curve
 * (1−t)²A + 2t(1−t)C + t²B, sampled at n + 1 equally spaced t. C = midpoint of AB gives the straight line.
 */
export function bentPath(A: Vec2, C: Vec2, B: Vec2, n: number): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * t * (1 - t);
    const c = t * t;
    return [a * A[0] + b * C[0] + c * B[0], a * A[1] + b * C[1] + c * B[1]] as const;
  });
}

/** The closed loop "out along `go`, back along `back` reversed" (both from A to B). */
export const loopOf = (go: readonly Vec2[], back: readonly Vec2[]): Vec2[] => [...go, ...[...back].reverse().slice(1)];

/** Area enclosed by a closed polyline, positive when it runs counter-clockwise (shoelace) [m²]. */
export function signedArea(loop: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x0, y0] = loop[i];
    const [x1, y1] = loop[(i + 1) % loop.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/**
 * How many times a closed polyline winds counter-clockwise around the point p (0 when p is
 * outside it): the sum of the angles each segment subtends at p, divided by 2π.
 */
export function windingNumber(loop: readonly Vec2[], p: Vec2): number {
  let total = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const t0 = Math.atan2(a[1] - p[1], a[0] - p[0]);
    const t1 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    let d = t1 - t0;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return Math.round(total / (2 * Math.PI));
}

/** Smallest distance from the point p to any vertex of a densely sampled path [m]. */
export const minDistance = (path: readonly Vec2[], p: Vec2): number =>
  Math.min(...path.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));

/* ------------------------------------------------------- gradient and direction */

/** The rate of change of V along the unit direction at angle θ: ∇V·û [units of V per metre]. */
export function directionalDerivative(V: Scalar2, x: number, y: number, theta: number, h?: number): number {
  const [gx, gy] = gradient2(V, x, y, h);
  return gx * Math.cos(theta) + gy * Math.sin(theta);
}

/** −∇V at (x, y): the field of a potential, by central differences [N/C for V in volts]. */
export function minusGradient(V: Scalar2, x: number, y: number, h?: number): Vec2 {
  const [gx, gy] = gradient2(V, x, y, h);
  return [-gx, -gy];
}

/* ------------------------------------------------- ring and disc: scalar first */

/**
 * The ring's axial potential summed piece by piece: n pieces of charge Q/n, each at the same
 * distance √(z² + R²) from the axis point. Every piece adds the same scalar, so the sum is exact for
 * any n — the reason the potential is the easy route on the axis.
 */
export function ringAxisPotentialByPieces(Q: number, R: number, z: number, n: number): number {
  let v = 0;
  for (let i = 0; i < n; i++) v += ringAxisPotential(Q / n, R, z);
  return v;
}

/**
 * The disc's axial potential as a sum of `rings` concentric rings (midpoint radii), each of charge
 * σ·2πr·Δr: the sum that becomes ∫ k·σ·2πr dr/√(z² + r²) = σ/(2ε₀)(√(z² + R²) − |z|).
 */
export function discAxisPotentialByRings(sigma: number, R: number, z: number, rings: number): number {
  const dr = R / rings;
  let v = 0;
  for (let i = 0; i < rings; i++) {
    const r = (i + 0.5) * dr;
    v += ringAxisPotential(sigma * 2 * Math.PI * r * dr, r, z);
  }
  return v;
}

/** E_z on a ring's axis the easy way: −dV/dz of the scalar potential [N/C]. */
export const ringAxisFieldFromV = (Q: number, R: number, z: number): number =>
  -derivative((t) => ringAxisPotential(Q, R, t), z, 1e-6 * Math.max(R, Math.abs(z)));

/**
 * E_z on a disc's axis the easy way: −dV/dz [N/C]. Off the face only (z ≠ 0): the potential has a
 * kink there, so the step is kept smaller than |z|.
 */
export const discAxisFieldFromV = (sigma: number, R: number, z: number): number =>
  -derivative((t) => discAxisPotential(sigma, R, t), z, 1e-6 * Math.max(Math.min(R, Math.abs(z)), 1e-9));
