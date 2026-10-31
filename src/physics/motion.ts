/**
 * Motion of a charged body in prescribed fields.
 *
 * MODEL SPECIFICATION
 * - System: one point body (mass m, charge q) in external E and B fields; it does not
 *   disturb the sources.
 * - Dynamics: Newton's second law with F = qE + qv×B (+ optional constant gravity).
 *   Pure-E motion uses RK4; motion with B uses the Boris push, which conserves |v| exactly
 *   in a pure magnetic field (the magnetic force does no work).
 * - Boundary: none; callers stop integration at plates, screens or region edges.
 * - Ignored: radiation, relativity, self-field.
 * - Valid when: v ≪ c and accelerations are modest.
 * - Failure modes: time steps comparable to the cyclotron period distort orbits.
 */

import type { Vec3 } from './vec';
import { cross3 } from './vec';

export interface Body {
  pos: Vec3;
  vel: Vec3;
  m: number;
  q: number;
}

export type Field3 = (p: Vec3, t: number) => Vec3;

const ZERO: Field3 = () => [0, 0, 0];

/** One RK4 step for motion under E (and optional gravity, as acceleration vector g). */
export function rk4Step(b: Body, E: Field3, t: number, dt: number, g: Vec3 = [0, 0, 0]): Body {
  const acc = (p: Vec3, tt: number): Vec3 => {
    const e = E(p, tt);
    return [(b.q * e[0]) / b.m + g[0], (b.q * e[1]) / b.m + g[1], (b.q * e[2]) / b.m + g[2]];
  };
  const p0 = b.pos;
  const v0 = b.vel;
  const a1 = acc(p0, t);
  const p2: Vec3 = [p0[0] + (v0[0] * dt) / 2, p0[1] + (v0[1] * dt) / 2, p0[2] + (v0[2] * dt) / 2];
  const v2: Vec3 = [v0[0] + (a1[0] * dt) / 2, v0[1] + (a1[1] * dt) / 2, v0[2] + (a1[2] * dt) / 2];
  const a2 = acc(p2, t + dt / 2);
  const p3: Vec3 = [p0[0] + (v2[0] * dt) / 2, p0[1] + (v2[1] * dt) / 2, p0[2] + (v2[2] * dt) / 2];
  const v3: Vec3 = [v0[0] + (a2[0] * dt) / 2, v0[1] + (a2[1] * dt) / 2, v0[2] + (a2[2] * dt) / 2];
  const a3 = acc(p3, t + dt / 2);
  const p4: Vec3 = [p0[0] + v3[0] * dt, p0[1] + v3[1] * dt, p0[2] + v3[2] * dt];
  const v4: Vec3 = [v0[0] + a3[0] * dt, v0[1] + a3[1] * dt, v0[2] + a3[2] * dt];
  const a4 = acc(p4, t + dt);
  const pos: Vec3 = [
    p0[0] + (dt / 6) * (v0[0] + 2 * v2[0] + 2 * v3[0] + v4[0]),
    p0[1] + (dt / 6) * (v0[1] + 2 * v2[1] + 2 * v3[1] + v4[1]),
    p0[2] + (dt / 6) * (v0[2] + 2 * v2[2] + 2 * v3[2] + v4[2]),
  ];
  const vel: Vec3 = [
    v0[0] + (dt / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]),
    v0[1] + (dt / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]),
    v0[2] + (dt / 6) * (a1[2] + 2 * a2[2] + 2 * a3[2] + a4[2]),
  ];
  return { ...b, pos, vel };
}

/** One Boris step under E and B; exact |v| conservation when E = 0. */
export function borisStep(b: Body, E: Field3, B: Field3, t: number, dt: number): Body {
  const qm = (b.q / b.m) * (dt / 2);
  const e = E(b.pos, t);
  const vMinus: Vec3 = [b.vel[0] + qm * e[0], b.vel[1] + qm * e[1], b.vel[2] + qm * e[2]];
  const bf = B(b.pos, t);
  const tv: Vec3 = [qm * bf[0], qm * bf[1], qm * bf[2]];
  const t2 = tv[0] * tv[0] + tv[1] * tv[1] + tv[2] * tv[2];
  const sv: Vec3 = [(2 * tv[0]) / (1 + t2), (2 * tv[1]) / (1 + t2), (2 * tv[2]) / (1 + t2)];
  const c1 = cross3(vMinus, tv);
  const vPrime: Vec3 = [vMinus[0] + c1[0], vMinus[1] + c1[1], vMinus[2] + c1[2]];
  const c2 = cross3(vPrime, sv);
  const vPlus: Vec3 = [vMinus[0] + c2[0], vMinus[1] + c2[1], vMinus[2] + c2[2]];
  const vel: Vec3 = [vPlus[0] + qm * e[0], vPlus[1] + qm * e[1], vPlus[2] + qm * e[2]];
  const pos: Vec3 = [b.pos[0] + vel[0] * dt, b.pos[1] + vel[1] * dt, b.pos[2] + vel[2] * dt];
  return { ...b, pos, vel };
}

export const uniformField =
  (v: Vec3): Field3 =>
  () =>
    v;

export { ZERO as NO_FIELD };

/**
 * Deflection of a charge entering a uniform transverse field E with speed v along the
 * field-free axis, after travelling a horizontal distance x: y = qE·x² / (2 m v²).
 */
export function deflection(q: number, m: number, E: number, v: number, x: number): number {
  return (q * E * x * x) / (2 * m * v * v);
}
