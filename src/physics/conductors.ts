/**
 * A conductor in electrostatic equilibrium: the exact case of a conducting sphere in a uniform field.
 *
 * MODEL SPECIFICATION
 * - System: a neutral conducting sphere of radius R at the origin, in vacuum, placed in an applied
 *   uniform field E₀ along +x. A hollow shell with the same outer radius has the same exterior field,
 *   because its cavity stays at one potential and so holds no field (see `cavityField`).
 * - Dynamics: none. This is the static end state after the free charges have stopped moving.
 * - Boundary: φ → −E₀x far away; φ = 0 on the whole conductor, which is neutral and so symmetric.
 * - Ignored: finite size of the electrons, the atomic structure of the surface, the time the charges
 *   take to settle, the field of whatever produces E₀, and any charge already on the conductor.
 * - Valid when: the conductor is a perfect conductor, the applied field is uniform over its size and
 *   weak enough to avoid breakdown (air breaks down near 3·10⁶ N/C).
 * - Failure modes: none inside the sphere (E is defined as exactly 0 there); the exterior formulas
 *   are exact for r ≥ R. 2D figures show the z = 0 slice of a 3D sphere, so lines bend the 3D way.
 *
 * Outside (r ≥ R), with θ measured from +x:
 *   φ = −E₀ (r − R³/r²) cos θ
 *   E_r = E₀ (1 + 2R³/r³) cos θ,   E_θ = −E₀ (1 − R³/r³) sin θ
 * and on the surface the induced surface charge is σ = ε₀E_r = 3ε₀E₀ cos θ.
 */

import { EPS0 } from './constants';
import type { Vec2, Vec3 } from './vec';

/** Electric field [N/C] at p. Exactly zero inside the conductor (r < R). */
export function sphereField(E0: number, R: number, p: Vec3): Vec3 {
  const [x, y, z] = p;
  const r2 = x * x + y * y + z * z;
  if (r2 < R * R) return [0, 0, 0];
  const u = (R * R * R) / (r2 * Math.sqrt(r2));
  return [E0 * (1 + u * ((3 * x * x) / r2 - 1)), (3 * u * E0 * x * y) / r2, (3 * u * E0 * x * z) / r2];
}

/** The same field in the z = 0 plane, for the 2D figure. */
export function sphereFieldPlane(E0: number, R: number, x: number, y: number): Vec2 {
  const [ex, ey] = sphereField(E0, R, [x, y, 0]);
  return [ex, ey];
}

/** Potential [V], zero on the (neutral) conductor and at the origin; −E₀x far away. */
export function spherePotential(E0: number, R: number, p: Vec3): number {
  const [x, y, z] = p;
  const r2 = x * x + y * y + z * z;
  if (r2 < R * R) return 0;
  const u = (R * R * R) / (r2 * Math.sqrt(r2));
  return -E0 * x * (1 - u);
}

/** Induced surface charge density [C/m²] at polar angle θ from +x: σ = 3ε₀E₀ cos θ. */
export function inducedSigma(E0: number, theta: number): number {
  return 3 * EPS0 * E0 * Math.cos(theta);
}

/** Induced charge [C] on the band thetaLo ≤ θ ≤ thetaHi of the sphere, by the midpoint rule. */
export function inducedChargeBetween(E0: number, R: number, thetaLo: number, thetaHi: number, n = 4000): number {
  const dth = (thetaHi - thetaLo) / n;
  let q = 0;
  for (let i = 0; i < n; i++) {
    const th = thetaLo + (i + 0.5) * dth;
    q += inducedSigma(E0, th) * 2 * Math.PI * R * R * Math.sin(th) * dth;
  }
  return q;
}

/** Total induced charge [C] on the whole sphere: zero, because the conductor is neutral. */
export function inducedChargeTotal(E0: number, R: number, n = 4000): number {
  return inducedChargeBetween(E0, R, 0, Math.PI, n);
}

/** Induced charge [C] on the +x hemisphere: the positive half of the induced pair. */
export function inducedChargeHemisphere(E0: number, R: number, n = 4000): number {
  return inducedChargeBetween(E0, R, 0, Math.PI / 2, n);
}

/** Field [N/C] inside the cavity of a neutral hollow conductor with an empty cavity: zero. */
export function cavityField(_E0: number, _R: number, _p: Vec3): Vec3 {
  return [0, 0, 0];
}

export interface PlaneTraceOptions {
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number };
  /** largest step [m] */
  maxStep: number;
  maxSteps?: number;
}

export interface PlaneLine {
  points: Vec2[];
  end: 'surface' | 'bounds' | 'steps';
}

/**
 * Trace a field line of the sphere-in-field picture in the z = 0 plane (RK4 on the unit direction).
 * `dir` +1 follows E, −1 runs against it. A line that reaches the sphere ends exactly on the surface.
 */
export function traceSphereLine(E0: number, R: number, start: Vec2, dir: 1 | -1, opts: PlaneTraceOptions): PlaneLine {
  const { bounds, maxStep } = opts;
  const maxSteps = opts.maxSteps ?? 3000;
  const unit = (x: number, y: number): Vec2 => {
    const [ex, ey] = sphereFieldPlane(E0, R, x, y);
    const m = Math.hypot(ex, ey);
    return m === 0 ? [dir, 0] : [(dir * ex) / m, (dir * ey) / m];
  };
  const points: Vec2[] = [start];
  let [x, y] = start;
  for (let i = 0; i < maxSteps; i++) {
    const d = Math.hypot(x, y);
    const h = Math.max(maxStep * 0.05, Math.min(maxStep, (d - R) * 0.5 + maxStep * 0.1));
    const step = (hh: number): Vec2 => {
      const k1 = unit(x, y);
      const k2 = unit(x + (hh / 2) * k1[0], y + (hh / 2) * k1[1]);
      const k3 = unit(x + (hh / 2) * k2[0], y + (hh / 2) * k2[1]);
      const k4 = unit(x + hh * k3[0], y + hh * k3[1]);
      return [x + (hh / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), y + (hh / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
    };
    let [nx, ny] = step(h);
    if (Math.hypot(nx, ny) <= R) {
      // bisect the step to land on the surface
      let lo = 0;
      let hi = h;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        const [mx, my] = step(mid);
        if (Math.hypot(mx, my) <= R) hi = mid;
        else lo = mid;
      }
      [nx, ny] = step(hi);
      points.push([nx, ny]);
      return { points, end: 'surface' };
    }
    x = nx;
    y = ny;
    points.push([x, y]);
    if (x < bounds.xmin || x > bounds.xmax || y < bounds.ymin || y > bounds.ymax) return { points, end: 'bounds' };
  }
  return { points, end: 'steps' };
}
