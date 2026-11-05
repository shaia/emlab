/**
 * The rotating-coil generator of lesson 5.7: what the brushes deliver with slip rings and with a split
 * ring, the lamp's instantaneous and mean power, time averages over a cycle, the same emf read as the
 * motional emf of the two long sides, the drag torque the induced current feels (the motor of 4.10 run
 * backwards), and the grid's numbers. Built on `Generator` in induction.ts and the coil of coil.ts.
 *
 * MODEL SPECIFICATION
 * - System: a flat rectangular coil of N turns, sides a (along the axle) and b, area A = ab, turning at a
 *   constant angular speed ω about an axle perpendicular to a uniform field B, its ends joined to an
 *   external resistor R (the lamp; the coil's own resistance is folded into R). Coordinates as coil.ts:
 *   the axle is z, B along +x, the coil's normal n̂ at the angle φ = ωt + θ₀ from B, counter-clockwise
 *   positive. Positive emf drives current in the sense tied to n̂ by the right-hand rule, which is the
 *   positive current of coil.ts (⊙ in the side at +(b/2)û).
 * - Dynamics: Φ = BA·cosφ per turn and ε = NBAω·sinφ (induction.ts). Slip rings: each ring stays joined
 *   to one end of the coil, so the brushes carry ε itself (alternating). Split ring (commutator): the
 *   connection to the brushes swaps each time the coil's plane is perpendicular to B (φ = 0, 180°), the
 *   same split ring as the motor's (coil.ts, `commutatorSign`), so the brushes carry |ε| (pulsating
 *   DC). The lamp gets p = ε²/R. The current I = ε/R in the coil feels the 4.10 torque −NBIA·sinφ,
 *   which opposes the rotation (Lenz), so the drive must supply −τ·ω = ε²/R: mechanical power in equals
 *   electrical power out at every instant.
 * - Boundary: the field is uniform over the coil and zero elsewhere; ω is held constant by the drive.
 * - Ignored: the coil's self-inductance (current in phase with ε), friction, sparking and the width of
 *   the commutator's gap, the resistance of brushes and rings, the field of the coil itself.
 * - Valid when: L_self·ω ≪ R; the drive is strong enough to keep ω constant against the drag torque.
 * - Failure modes: R = 0 makes the current and the torque infinite; callers keep R > 0. `cycleMean`
 *   integrates by the midpoint rule: exact for a sinusoid and its square over whole cycles, but over a
 *   window that is not a whole number of cycles it carries the leftover part-cycle (the 1/window error
 *   the tests measure).
 */

import { coilTorqueZ, commutatorSign } from './coil';
import { generatorEmf, generatorFlux, motionalEmf, type Generator } from './induction';

export type RingKind = 'slip' | 'split';

/** The grid in Israel: 230 V effective, 50 Hz. */
export const GRID_RMS_VOLTAGE = 230;
export const GRID_FREQUENCY = 50;

/** ω = 2πf [rad/s] from turns per second f [Hz]. */
export const angularSpeed = (f: number): number => 2 * Math.PI * f;

/** Period T = 2π/ω [s]. */
export const periodOf = (omega: number): number => (2 * Math.PI) / omega;

/** The coil's angle from B at time t, φ = ωt + θ₀ [rad]. */
export const coilAngle = (g: Generator, t: number): number => g.omega * t + (g.theta0 ?? 0);

/** Flux through one turn, Φ = BA·cos φ [Wb]. */
export const fluxPerTurn = (g: Generator, t: number): number => generatorFlux(g, t) / g.N;

/**
 * The emf between the brushes [V]. Slip rings pass the coil's ε unchanged; the split ring swaps the
 * connection with the motor's `commutatorSign`, which turns ε into |ε|.
 */
export function brushEmf(g: Generator, t: number, rings: RingKind): number {
  const e = generatorEmf(g, t);
  if (rings === 'slip') return e;
  const out = -commutatorSign(coilAngle(g, t)) * e;
  return out === 0 ? 0 : out; // no −0 for a readout
}

/** Instantaneous power in a resistor R driven by the emf e: p = e²/R [W]. */
export const instantPower = (e: number, R: number): number => (e * e) / R;

/**
 * Time average of f over [t0, t0 + span] by the midpoint rule with n samples. Over a whole number of
 * cycles of a sinusoid this is exact for n ≥ 3.
 */
export function cycleMean(f: (t: number) => number, span: number, n = 600, t0 = 0): number {
  let s = 0;
  for (let k = 0; k < n; k++) s += f(t0 + ((k + 0.5) * span) / n);
  return s / n;
}

/** Effective (root-mean-square) value of f over [t0, t0 + span]: √(mean of f²). */
export const cycleRms = (f: (t: number) => number, span: number, n = 600, t0 = 0): number =>
  Math.sqrt(cycleMean((t) => f(t) ** 2, span, n, t0));

/** Mean of |ε₀ sin ωt| over a cycle, 2ε₀/π: what a split ring gives on average, not the effective value. */
export const rectifiedMean = (e0: number): number => (2 * e0) / Math.PI;

/**
 * The same emf from the moving sides: each long side (length a) moves on a circle of radius b/2 at
 * v = ωb/2, and only the part of v across B, v·sinφ, makes a motional emf BLv (5.4). The two sides add,
 * in each of N turns: ε = 2N·B·a·(ωb/2)·sinφ = NBAω·sinφ [V].
 */
export const sidesEmf = (N: number, B: number, a: number, b: number, omega: number, phi: number): number =>
  2 * N * motionalEmf(B, a, ((omega * b) / 2) * Math.sin(phi));

/**
 * The torque on the coil from the induced current I = ε/R, as for the coil of 4.10 (coil.ts) [N·m];
 * positive turns counter-clockwise. It always opposes the rotation.
 */
export function dragTorque(g: Generator, R: number, t: number): number {
  const I = generatorEmf(g, t) / R;
  return coilTorqueZ(g.N, I, g.A, g.B, coilAngle(g, t));
}

/** Mechanical power the drive must supply to keep ω constant against the drag torque, −τ·ω [W]. */
export const drivePower = (g: Generator, R: number, t: number): number => -dragTorque(g, R, t) * g.omega;

/** Peak of a sinusoid from its effective value, x₀ = √2·x_rms. */
export const peakOfRms = (xRms: number): number => xRms * Math.SQRT2;
