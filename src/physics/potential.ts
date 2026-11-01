/**
 * Electric potential energy, potential and energy conservation: chapter 2, lessons 2.1–2.5.
 *
 * MODEL SPECIFICATION
 * - System: point charges at rest (the sources) and one moving charge q of mass m; or a uniform
 *   field E (the region between large parallel plates); or isolated conducting spheres, far
 *   apart compared with their radii.
 * - Dynamics: the electrostatic field is conservative, so the work the field does on q between
 *   two points is W = q(V_A − V_B) = −ΔU whatever the path. A charge moving under the field
 *   alone conserves ½mv² + qV. Two connected conductors exchange charge until their potentials
 *   are equal; total charge is conserved.
 * - Boundary: V = 0 at infinity for point charges and spheres. In a uniform field the zero of V
 *   is a reference point the caller chooses (only differences are physical).
 * - Ignored: radiation by an accelerating charge, relativity, gravity on the moving charge,
 *   the mutual influence of two spheres (each keeps a uniform surface charge: valid when the
 *   distance between them is much larger than their radii), the charge on the connecting wire.
 * - Valid when: speeds are well below c (an electron through 10 kV reaches 0.2c: ~3% error in
 *   v), and the sources do not move while q moves.
 * - Failure modes: V at a point charge's own position is infinite (the functions skip r = 0);
 *   `speedAfter` returns NaN when the charge cannot reach the end point (kinetic energy would
 *   be negative); `closestApproach` assumes a repulsive head-on collision (qQ > 0).
 */

import { E_CHARGE, K } from './constants';
import { dot, type Vec2 } from './vec';

/* ------------------------------------------------------ 2.1 work and potential energy */

/** Potential energy of two point charges a distance r apart, U = kq₁q₂/r, zero at infinity [J]. */
export const pairEnergy = (q1: number, q2: number, r: number): number => (K * q1 * q2) / r;

/** Work the uniform field E does on q moving from `from` to `to`: W = qE·Δr, any path [J]. */
export const uniformWork = (q: number, E: Vec2, from: Vec2, to: Vec2): number =>
  q * dot(E, [to[0] - from[0], to[1] - from[1]]);

/**
 * Work a field does on q along a polyline path, summed segment by segment at each segment's
 * midpoint [J]. Exact for a uniform field; for a point charge it converges as the segments
 * shrink. The figure of lesson 2.1 feeds it the learner's actual drag path.
 */
export function workAlongPath(q: number, field: (x: number, y: number) => Vec2, path: readonly Vec2[]): number {
  let w = 0;
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1];
    const [x1, y1] = path[i];
    const E = field((x0 + x1) / 2, (y0 + y1) / 2);
    w += q * (E[0] * (x1 - x0) + E[1] * (y1 - y0));
  }
  return w;
}

/** Length of a polyline [m]. */
export function pathLength(path: readonly Vec2[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return s;
}

/* -------------------------------------------------------------------- 2.2 potential */

/** Potential of a point charge Q at distance r, V = kQ/r, zero at infinity [V]. */
export const pointPotential = (Q: number, r: number): number => (K * Q) / r;

/** Potential in a uniform field E at p, relative to the reference point `ref` (V = −E·(p − ref)) [V]. */
export const uniformPotential = (E: Vec2, p: Vec2, ref: Vec2 = [0, 0]): number => -dot(E, [p[0] - ref[0], p[1] - ref[1]]);

/** Work the field does on q moving from a point at V_A to a point at V_B: W = q(V_A − V_B) [J]. */
export const fieldWork = (q: number, vA: number, vB: number): number => q * (vA - vB);

/** One electron-volt in joules: the energy a charge e gains across 1 V. */
export const JOULES_PER_EV = E_CHARGE;
export const toEV = (joules: number): number => joules / JOULES_PER_EV;
export const fromEV = (ev: number): number => ev * JOULES_PER_EV;

/* --------------------------------------------------- 2.3 equipotentials and E = ΔV/d */

/** Uniform field between two plates held at potential difference V a distance d apart, E = V/d [V/m]. */
export const fieldFromVoltage = (V: number, d: number): number => V / d;

export interface GridBounds {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

/**
 * Marching squares: the segments where f(x, y) = level on an nx × ny grid of cells. Used to
 * draw equipotential lines; the segments lie on the level set to within the grid spacing.
 * Cells where f is not finite (at a point charge) are skipped.
 */
export function contourSegments(
  f: (x: number, y: number) => number,
  b: GridBounds,
  nx: number,
  ny: number,
  level: number,
): [Vec2, Vec2][] {
  const dx = (b.xmax - b.xmin) / nx;
  const dy = (b.ymax - b.ymin) / ny;
  const vals: number[][] = [];
  for (let j = 0; j <= ny; j++) {
    const row: number[] = [];
    for (let i = 0; i <= nx; i++) row.push(f(b.xmin + i * dx, b.ymin + j * dy));
    vals.push(row);
  }
  return contourFromGrid(vals, b, level);
}

/** Marching squares over precomputed grid values vals[j][i] (row j is y, column i is x). */
export function contourFromGrid(vals: readonly (readonly number[])[], b: GridBounds, level: number): [Vec2, Vec2][] {
  const ny = vals.length - 1;
  const nx = vals[0].length - 1;
  const dx = (b.xmax - b.xmin) / nx;
  const dy = (b.ymax - b.ymin) / ny;
  const segs: [Vec2, Vec2][] = [];
  const lerp = (xa: number, ya: number, va: number, xb: number, yb: number, vb: number): Vec2 => {
    const t = (level - va) / (vb - va);
    return [xa + t * (xb - xa), ya + t * (yb - ya)];
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = b.xmin + i * dx;
      const y0 = b.ymin + j * dy;
      const x1 = x0 + dx;
      const y1 = y0 + dy;
      const v00 = vals[j][i];
      const v10 = vals[j][i + 1];
      const v11 = vals[j + 1][i + 1];
      const v01 = vals[j + 1][i];
      if (![v00, v10, v11, v01].every(Number.isFinite)) continue;
      // crossing points on the four edges, in order bottom, right, top, left
      const pts: Vec2[] = [];
      if (v00 < level !== v10 < level) pts.push(lerp(x0, y0, v00, x1, y0, v10));
      if (v10 < level !== v11 < level) pts.push(lerp(x1, y0, v10, x1, y1, v11));
      if (v01 < level !== v11 < level) pts.push(lerp(x0, y1, v01, x1, y1, v11));
      if (v00 < level !== v01 < level) pts.push(lerp(x0, y0, v00, x0, y1, v01));
      if (pts.length === 2) segs.push([pts[0], pts[1]]);
      else if (pts.length === 4) {
        // saddle: pair the crossings by the value at the cell centre
        const centre = (v00 + v10 + v11 + v01) / 4;
        if (centre < level === v00 < level) {
          segs.push([pts[0], pts[1]], [pts[2], pts[3]]);
        } else {
          segs.push([pts[0], pts[3]], [pts[1], pts[2]]);
        }
      }
    }
  }
  return segs;
}

/* ------------------------------------------------------ 2.4 energy conservation */

/**
 * Speed of q (mass m) after it moves through a potential difference ΔV = V_end − V_start,
 * starting at speed v0: ½mv² = ½mv0² − qΔV. NaN if it cannot get there [m/s].
 */
export function speedAfter(q: number, m: number, deltaV: number, v0 = 0): number {
  const k0 = 0.5 * m * v0 * v0;
  const k = k0 - q * deltaV;
  // exactly at the turning point round-off can leave k a hair below zero: that is a stop, not "unreachable"
  const scale = Math.max(k0, Math.abs(q * deltaV));
  if (k < -1e-12 * scale) return Number.NaN;
  return Math.sqrt((2 * Math.max(0, k)) / m);
}

/** Kinetic energy gained by q falling through ΔV = V_end − V_start: ΔK = −qΔV [J]. */
export const kineticGain = (q: number, deltaV: number): number => -q * deltaV;

/**
 * Closest approach of q (mass m, speed v0) fired head-on at a fixed charge Q of the same sign,
 * starting a distance r0 away (Infinity: from far away). At the turning point all the kinetic
 * energy has become potential energy: ½mv0² + kqQ/r0 = kqQ/r_min [m].
 */
export function closestApproach(q: number, Q: number, m: number, v0: number, r0 = Number.POSITIVE_INFINITY): number {
  const u0 = Number.isFinite(r0) ? (K * q * Q) / r0 : 0;
  return (K * q * Q) / (0.5 * m * v0 * v0 + u0);
}

/* ----------------------------------------------- 2.5 conducting spheres and earthing */

/** Potential of a conducting sphere (charge Q, radius R) at distance r from its centre [V]. */
export const spherePotentialAt = (Q: number, R: number, r: number): number => (K * Q) / Math.max(r, R);

/** Field magnitude of a charged conducting sphere: 0 inside, kQ/r² outside [N/C], signed with Q. */
export const sphereFieldAt = (Q: number, R: number, r: number): number => (r < R ? 0 : (K * Q) / (r * r));

/** Energy stored on an isolated conducting sphere, U = kQ²/(2R) [J]. */
export const sphereEnergy = (Q: number, R: number): number => (K * Q * Q) / (2 * R);

export interface Connected {
  q1: number;
  q2: number;
  /** the common potential [V] */
  V: number;
}

/**
 * Two far-apart conducting spheres joined by a thin wire: charge flows until their potentials
 * are equal. Total charge is conserved, so q_i = Q_total·R_i/(R₁ + R₂) and V = kQ_total/(R₁ + R₂).
 */
export function connectSpheres(Q1: number, R1: number, Q2: number, R2: number): Connected {
  const Q = Q1 + Q2;
  return { q1: (Q * R1) / (R1 + R2), q2: (Q * R2) / (R1 + R2), V: (K * Q) / (R1 + R2) };
}
