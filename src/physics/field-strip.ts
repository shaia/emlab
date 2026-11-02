/**
 * A charge crossing a strip of uniform field: lesson 4.5's figure 4.6ב, where the same particle
 * meets either a magnetic field perpendicular to the page or an electric field across its path,
 * so the two forces can be compared side by side.
 *
 * MODEL SPECIFICATION
 * - System: one point charge q of mass m, and a strip 0 ≤ x ≤ d (unbounded in y) holding a uniform
 *   field; outside the strip there is no field. The charge arrives from x < 0 moving along +x with
 *   speed v and crosses x = 0 at t = 0, at y = 0. Figure coordinates: x right, y up, z out of the
 *   page (⊙).
 * - Dynamics: magnetic strip, B = B_z ẑ (B_z > 0 is ⊙): F = q v×B, a circle of radius
 *   r = mv/(|q||B_z|) at constant speed, positions from magnetism.ts `circlePosition`. Electric
 *   strip, E = E_y ŷ: F = qE, constant acceleration a = qE_y/m along y, uniform motion along x
 *   (the parabola of lesson 1.10). Outside the strip: straight-line motion at the exit velocity.
 * - Boundary: the charge leaves through x = 0 (turned back, when r ≤ d) or through x = d (passed
 *   through). An electric strip is always crossed (v_x never changes).
 * - Ignored: gravity, radiation, relativity, fringe fields at the strip edges (the field switches
 *   on sharply at x = 0 and off at x = d).
 * - Valid when: v ≪ c; the field region's edges are sharp on the scale of the path.
 * - Failure modes: r = d exactly counts as turned back (the path touches x = d tangentially and
 *   returns). A zero field gives a straight line (r = ∞).
 */

import { circlePosition, orbitRadius } from './magnetism';
import type { Vec2 } from './vec';

export type StripField = { kind: 'B'; Bz: number } | { kind: 'E'; Ey: number };

export interface StripCrossing {
  /** 'back': left through x = 0; 'through': left through x = d */
  outcome: 'back' | 'through';
  /** time spent in the strip [s] */
  tExit: number;
  exitPos: Vec2;
  exitVel: Vec2;
}

export interface StripState {
  pos: Vec2;
  vel: Vec2;
  /** true while the charge is inside the strip */
  inField: boolean;
}

/** Angular velocity of the velocity vector in B_z, counterclockwise positive: ω = −qB_z/m [rad/s]. */
const omega = (q: number, m: number, Bz: number) => (-q * Bz) / m;

/** Velocity at time t inside a magnetic strip: the entry velocity (v, 0) turned by ωt. */
function magneticVel(q: number, m: number, Bz: number, v: number, t: number): Vec2 {
  const a = omega(q, m, Bz) * t;
  return [v * Math.cos(a), v * Math.sin(a)];
}

/** How the charge leaves the strip, and when. */
export function stripCrossing(q: number, m: number, field: StripField, v: number, d: number): StripCrossing {
  if (field.kind === 'E') {
    const a = (q * field.Ey) / m;
    const t = d / v;
    return { outcome: 'through', tExit: t, exitPos: [d, 0.5 * a * t * t], exitVel: [v, a * t] };
  }
  const r = orbitRadius(m, v, q, field.Bz);
  if (!Number.isFinite(r)) return { outcome: 'through', tExit: d / v, exitPos: [d, 0], exitVel: [v, 0] };
  const w = Math.abs(omega(q, m, field.Bz));
  // turned back after half a circle, or out through the far edge after turning by θ, sinθ = d/r
  const turn = r <= d ? Math.PI : Math.asin(d / r);
  const t = turn / w;
  const pos = circlePosition(q, m, field.Bz, [0, 0], [v, 0], t);
  const exitPos: Vec2 = r <= d ? [0, pos[1]] : [d, pos[1]];
  return { outcome: r <= d ? 'back' : 'through', tExit: t, exitPos, exitVel: magneticVel(q, m, field.Bz, v, t) };
}

/**
 * Position and velocity at time t (t = 0 at the entry point x = 0, t < 0 on the approach).
 */
export function stripState(q: number, m: number, field: StripField, v: number, d: number, t: number): StripState {
  if (t <= 0) return { pos: [v * t, 0], vel: [v, 0], inField: false };
  const c = stripCrossing(q, m, field, v, d);
  if (t >= c.tExit) {
    const s = t - c.tExit;
    return { pos: [c.exitPos[0] + c.exitVel[0] * s, c.exitPos[1] + c.exitVel[1] * s], vel: c.exitVel, inField: false };
  }
  if (field.kind === 'E') {
    const a = (q * field.Ey) / m;
    return { pos: [v * t, 0.5 * a * t * t], vel: [v, a * t], inField: true };
  }
  return { pos: circlePosition(q, m, field.Bz, [0, 0], [v, 0], t), vel: magneticVel(q, m, field.Bz, v, t), inField: true };
}

/** The force on the charge at time t [N]: zero outside the strip. */
export function stripForce(q: number, m: number, field: StripField, v: number, d: number, t: number): Vec2 {
  const s = stripState(q, m, field, v, d, t);
  if (!s.inField) return [0, 0];
  if (field.kind === 'E') return [0, q * field.Ey];
  // F = q v×B with B = B_z ẑ: (v_x, v_y, 0) × (0, 0, B_z) = (v_y B_z, −v_x B_z, 0)
  return [q * s.vel[1] * field.Bz, -q * s.vel[0] * field.Bz];
}
