/**
 * A rod sliding on two parallel rails closed by a resistor, for lesson 5.4 and its figure RailRodLab:
 * the rod on an incline (the field perpendicular to the rails or vertical), the closed-form state of a
 * run made of segments (a parameter changes, a new segment starts from the present speed), and the
 * energy and power bookkeeping the figure shows.
 *
 * MODEL SPECIFICATION
 * - System: the rail circuit of `RailRod` in induction.ts (rod mass m, active length L, total
 *   resistance R, a constant drive F along the rails). On an incline at α the drive is gravity's
 *   component along the rails, m·g·sinα, and only the field component perpendicular to the rails'
 *   plane makes an emf: B itself when the field is perpendicular to the rails, B·cosα when the field
 *   is vertical. With a vertical field the magnetic force on the rod is horizontal; its component
 *   along the rails is B·I·L·cosα, with I = B·L·v·cosα/R, i.e. the braking of a rod in a field B·cosα.
 * - Dynamics: m·dv/dt = F − B⊥²L²v/R, solved in closed form (railSpeed, railDistance). The Joule heat
 *   of a segment follows from energy conservation, Q = F·Δx − ΔK, which the tests check against the
 *   heat railStep integrates as I²R.
 * - Boundary: the rails are long enough for the run; the rod stays on them (frictionless; the normal
 *   force does no work).
 * - Ignored: friction, the rails' and the rod's resistance unless folded into R, the circuit's
 *   self-inductance, air drag.
 * - Valid when: as for the rail rod in induction.ts (L_self/R much shorter than τ, v ≪ c).
 * - Failure modes: B⊥·L = 0 (a field along the rails, α = 90° with a vertical field) leaves no
 *   braking and no terminal speed; callers keep B⊥·L ≠ 0 and R > 0.
 */

import {
  inclineDrive,
  railBrakingForce,
  railCurrent,
  railDistance,
  railSpeed,
  railTimeConstant,
  type RailRod,
  type RailState,
} from './induction';

/** How the field meets an inclined pair of rails. */
export type InclineField = 'normal' | 'vertical';

/** The field component perpendicular to rails inclined at alpha [T]. */
export const perpendicularField = (B: number, alpha: number, field: InclineField): number =>
  field === 'normal' ? B : B * Math.cos(alpha);

/** A rod of mass m released on rails inclined at alpha: the RailRod whose drive is m·g·sinα. */
export function inclineRod(m: number, L: number, B: number, R: number, alpha: number, field: InclineField): RailRod {
  return { m, L, R, B: perpendicularField(B, alpha, field), F: inclineDrive(m, alpha) };
}

/** Kinetic energy ½mv² [J]. */
export const kinetic = (m: number, v: number): number => 0.5 * m * v * v;

/** Acceleration of the rod at speed v, (F − B²L²v/R)/m [m/s²]. */
export const railAcceleration = (p: RailRod, v: number): number => (p.F - railBrakingForce(p, v)) / p.m;

/** The two powers at speed v: the drive's F·v and the resistor's I²R [W]. */
export function railPowers(p: RailRod, v: number): { drive: number; joule: number } {
  const I = railCurrent(p, v);
  return { drive: p.F * v, joule: I * I * p.R };
}

/** Time for a rod starting at v0 to come within the fraction `frac` of the way to v_T: τ·ln(1/(1 − frac)) [s]. */
export const railTimeToFraction = (p: RailRod, frac: number): number => railTimeConstant(p) * Math.log(1 / (1 - frac));

/**
 * The state a time t after a segment that started in state s0, in closed form: position and speed
 * from railDistance/railSpeed, and the heat from energy conservation, Q = Q₀ + F·Δx − ΔK.
 */
export function railAt(p: RailRod, s0: RailState, t: number): RailState {
  const v = railSpeed(p, s0.v, t);
  const dx = railDistance(p, s0.v, t);
  return { x: s0.x + dx, v, heat: s0.heat + p.F * dx - (kinetic(p.m, v) - kinetic(p.m, s0.v)) };
}

/** One piece of a run: from absolute time t0 in state s0, with the parameters p. */
export interface RailSegment {
  t0: number;
  s0: RailState;
  p: RailRod;
}

/** The state at absolute time T of a run made of segments (sorted by t0; the first starts at 0). */
export function runAt(segs: readonly RailSegment[], T: number): RailState {
  let k = 0;
  while (k + 1 < segs.length && segs[k + 1].t0 <= T) k++;
  const s = segs[k];
  return railAt(s.p, s.s0, Math.max(0, T - s.t0));
}

/** The work the drive has done by absolute time T, Σ F·Δx over the segments [J]. */
export function runWork(segs: readonly RailSegment[], T: number): number {
  let W = 0;
  for (let k = 0; k < segs.length && segs[k].t0 <= T; k++) {
    const s = segs[k];
    const end = k + 1 < segs.length ? Math.min(T, segs[k + 1].t0) : T;
    W += s.p.F * railDistance(s.p, s.s0.v, end - s.t0);
  }
  return W;
}
