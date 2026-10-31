/**
 * Coulomb's law between point charges, its comparison with gravity, and the vector sum of the
 * electric forces on one charge.
 *
 * MODEL SPECIFICATION
 * - System: N fixed point charges in vacuum, in the plane of the figure; two point masses for
 *   the gravity comparison.
 * - Dynamics: none; forces are evaluated for a given configuration (static).
 * - Boundary: unbounded space.
 * - Ignored: polarisation of the surroundings, motion of the charges, the other interactions,
 *   and the quantum structure of the atom (the electron-proton comparison only asks how strong
 *   the two forces are at a given distance).
 * - Valid when: the bodies are small compared with their separation and at rest.
 * - Failure modes: forces diverge as r -> 0; callers keep separations above zero. Two charges at
 *   the same point exert no force on each other here (0, not NaN).
 */

import { G_NEWTON, K } from './constants';
import type { PointCharge } from './electrostatics';
import { add, type Vec2 } from './vec';

/** Newton's law of gravitation, magnitude only: always attractive [N]. */
export function gravityForce(m1: number, m2: number, r: number): number {
  return (G_NEWTON * m1 * m2) / (r * r);
}

/**
 * Electric force over gravitational force for two bodies, magnitudes. Both laws fall off as
 * 1/r^2, so r cancels and the ratio is a property of the pair, not of the distance.
 */
export function electricToGravityRatio(q1: number, q2: number, m1: number, m2: number): number {
  return (K * Math.abs(q1 * q2)) / (G_NEWTON * m1 * m2);
}

/**
 * Electric force on `on` caused by `source` [N], as a vector. Along the line between them:
 * away from the source for like charges, toward it for opposite charges.
 */
export function forceFrom(on: PointCharge, source: PointCharge): Vec2 {
  const dx = on.x - source.x;
  const dy = on.y - source.y;
  const r2 = dx * dx + dy * dy;
  if (r2 === 0) return [0, 0];
  const r = Math.sqrt(r2);
  const f = (K * on.q * source.q) / (r2 * r);
  return [f * dx, f * dy];
}

/** The force on charge `index` from each other charge, in the order of the others [N]. */
export function forcesOnCharge(charges: readonly PointCharge[], index: number): Vec2[] {
  return charges.filter((_, i) => i !== index).map((c) => forceFrom(charges[index], c));
}

/** The vector sum of the forces on charge `index` from all the others [N]. */
export function netForceOnCharge(charges: readonly PointCharge[], index: number): Vec2 {
  return forcesOnCharge(charges, index).reduce<Vec2>((s, f) => add(s, f), [0, 0]);
}
