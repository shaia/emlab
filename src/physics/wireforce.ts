/**
 * The force on a current-carrying wire, built up from the Lorentz force on its carriers, and the
 * devices of lesson 4.7: the current balance and a wire bent out of straight pieces.
 *
 * MODEL SPECIFICATION
 * - System: a thin straight wire (or a chain of straight pieces) carrying a steady current I in a
 *   uniform magnetic field B over a bounded region. The wire holds n carriers per m³ of charge q,
 *   drifting at v = I/(n|q|A) (lesson 3.2). Coordinates as in magnetism.ts: x right, y up, z out
 *   of the page.
 * - Dynamics: each carrier feels F = qv×B (lesson 4.4). The N = nAL carriers inside a length L of
 *   wire together feel N·|q|vB·sinα = BIL·sinα, along I L×B. A bent wire is the vector sum over its
 *   pieces, which equals the force on the straight chord from its first point to its last.
 *   The current balance is static: the frame is level when the weight mg of the added mass equals
 *   the magnetic force on the piece of frame inside the field.
 * - Boundary: B is uniform inside its region and zero outside; only the length inside counts.
 * - Ignored: the field of the wire's own current, the Hall field that moves the force from the
 *   carriers to the lattice, fringe fields at the region's edge, and every induced effect of a
 *   wire that moves (chapter 5).
 * - Valid when: the wire is at rest or slow (no induced EMF), the field is uniform over the wire.
 * - Failure modes: a carrier density or a cross-section of zero has no drift speed (division by
 *   zero); callers pass physical values.
 */

import { G } from './constants';
import { wireForce, wireForceVec } from './magnetism';
import type { Vec3 } from './vec';

/** Number of carriers in a length L of wire with cross-section A, N = nAL. */
export const carrierCount = (n: number, A: number, L: number): number => n * A * L;

/**
 * Total magnetic force on the carriers inside a length L of wire, summed carrier by carrier:
 * N = nAL carriers, each drifting at v = I/(n|q|A) and feeling |q|vB·sinα [N].
 * It equals BIL·sinα for every n, q and A: that is the derivation of the wire formula.
 */
export function carrierForceTotal(n: number, q: number, A: number, L: number, I: number, B: number, alpha = Math.PI / 2): number {
  const v = Math.abs(I) / (n * Math.abs(q) * A);
  const perCarrier = Math.abs(q) * v * Math.abs(B) * Math.abs(Math.sin(alpha));
  return carrierCount(n, A, L) * perCarrier;
}

/**
 * The current balance: the mass whose weight equals the magnetic force on the piece of frame
 * (length L, perpendicular to B) inside the field, m = BIL/g [kg].
 */
export const balanceMass = (B: number, I: number, L: number, g = G): number => wireForce(I, L, B) / g;

/** The field measured with a current balance, B = mg/(IL) [T]. */
export const balanceField = (m: number, I: number, L: number, g = G): number => (m * g) / Math.abs(I * L);

/**
 * Force on a wire made of straight pieces joining the points `pts` (in order, the current flowing
 * from the first point to the last) in a uniform field B: the vector sum of I·ΔL×B [N].
 */
export function bentWireForce(I: number, pts: readonly Vec3[], B: Vec3): Vec3 {
  let f: [number, number, number] = [0, 0, 0];
  for (let k = 1; k < pts.length; k++) {
    const d: Vec3 = [pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]];
    const p = wireForceVec(I, d, B);
    f = [f[0] + p[0], f[1] + p[1], f[2] + p[2]];
  }
  return f;
}
