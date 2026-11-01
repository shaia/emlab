/**
 * Capacitors: the parallel-plate capacitor, its energy, and capacitors in series and in
 * parallel. Chapter 2, lessons 2.6–2.8.
 *
 * MODEL SPECIFICATION
 * - System: two parallel conducting plates of area A a distance d apart, with charges +Q and −Q,
 *   possibly with a dielectric of constant κ filling the gap; networks of such capacitors and an
 *   ideal battery (a fixed potential difference, no internal resistance).
 * - Dynamics: none in time (lessons 2.6–2.8 are about end states; charging in time is lesson
 *   3.9). Between the plates the field is uniform, E = σ/(κε₀) = V/d, and C = Q/V = κε₀A/d.
 *   Connected to a battery, V is fixed and Q follows; disconnected (isolated), Q is fixed and V
 *   follows. Connecting a charged capacitor to an empty one conserves charge but not energy.
 * - Boundary: the field outside the plates is zero.
 * - Ignored: fringe fields at the plate edges (valid when d ≪ √A), the resistance of wires
 *   (they only decide how fast an end state is reached, and where the lost energy goes).
 * - Valid when: d ≪ √A, and the field stays below the breakdown of the gap.
 * - Failure modes: d = 0 or C = 0 divide by zero; the callers keep d and C positive.
 *
 * ε₀ here is the formula sheet's 8.85·10⁻¹² (EPS0_DISPLAY), not the engine's 1/(4πk): a readout of
 * C then agrees with the learner's own calculation to the last digit. The two differ by 0.1%, and
 * this module never mixes ε₀ with k.
 */

import { EPS0_DISPLAY } from './constants';

const EPS0 = EPS0_DISPLAY;

/* ---------------------------------------------------------- 2.6 the plate capacitor */

/** Capacitance of a parallel-plate capacitor, C = κε₀A/d [F]. */
export const plateCapacitance = (A: number, d: number, kappa = 1): number => (kappa * EPS0 * A) / d;

/** Charge on a capacitor at voltage V, Q = CV [C]. */
export const chargeOf = (C: number, V: number): number => C * V;

/** Uniform field between the plates, E = V/d [V/m]. */
export const gapField = (V: number, d: number): number => V / d;

/** Surface charge density on a plate, σ = Q/A [C/m²]. */
export const plateSigma = (Q: number, A: number): number => Q / A;

/** The field from the plate charge by Gauss, E = σ/(κε₀) [V/m]: the same number as V/d. */
export const fieldFromSigma = (sigma: number, kappa = 1): number => sigma / (kappa * EPS0);

/* ------------------------------------------------------------------ 2.7 energy */

/** Energy stored in a capacitor, U = ½CV² [J]. */
export const energyCV = (C: number, V: number): number => 0.5 * C * V * V;

/** Energy stored in a capacitor, U = Q²/(2C) [J]. */
export const energyQC = (Q: number, C: number): number => (Q * Q) / (2 * C);

/** Energy per unit volume of the field between the plates, u = ½κε₀E² [J/m³]. */
export const energyDensity = (E: number, kappa = 1): number => 0.5 * kappa * EPS0 * E * E;

/** Attraction between the plates of an isolated capacitor, F = Q²/(2κε₀A) [N]: each plate sits in the other's field σ/(2ε₀). */
export const plateForce = (Q: number, A: number, kappa = 1): number => (Q * Q) / (2 * kappa * EPS0 * A);

export interface PlateState {
  C: number;
  Q: number;
  V: number;
  E: number;
  U: number;
}

/** Everything about a plate capacitor, either held at V by a battery or isolated with charge Q. */
export function plateState(A: number, d: number, kappa: number, hold: { V: number } | { Q: number }): PlateState {
  const C = plateCapacitance(A, d, kappa);
  const Q = 'V' in hold ? C * hold.V : hold.Q;
  const V = Q / C;
  return { C, Q, V, E: V / d, U: energyQC(Q, C) };
}

/* -------------------------------------------------------- 2.8 series and parallel */

/** Equivalent capacitance in parallel: C = C₁ + C₂ + … [F]. */
export const parallel = (...cs: number[]): number => cs.reduce((a, c) => a + c, 0);

/** Equivalent capacitance in series: 1/C = 1/C₁ + 1/C₂ + … [F]. */
export const series = (...cs: number[]): number => 1 / cs.reduce((a, c) => a + 1 / c, 0);

export interface Share {
  /** the common voltage after connecting [V] */
  V: number;
  q1: number;
  q2: number;
  /** energy before and after [J]; the difference is lost in the wires */
  before: number;
  after: number;
}

/**
 * A capacitor C₁ charged to V₀ is connected, plate to plate (+ to +), to an uncharged C₂. Charge
 * flows until both have the same voltage; the charge is conserved, the energy is not.
 */
export function shareCharge(C1: number, V0: number, C2: number): Share {
  const Q = C1 * V0;
  const V = Q / (C1 + C2);
  return { V, q1: C1 * V, q2: C2 * V, before: energyCV(C1, V0), after: energyCV(C1 + C2, V) };
}

export interface Branch {
  C: number;
  Q: number;
  V: number;
  U: number;
}

/** Each capacitor of a series string across a voltage V: same Q, voltages in inverse ratio to C. */
export function seriesString(cs: number[], V: number): Branch[] {
  const Q = series(...cs) * V;
  return cs.map((C) => ({ C, Q, V: Q / C, U: energyQC(Q, C) }));
}

/** Each capacitor of a parallel bank across a voltage V: same V, charges in proportion to C. */
export function parallelBank(cs: number[], V: number): Branch[] {
  return cs.map((C) => ({ C, Q: C * V, V, U: energyCV(C, V) }));
}
