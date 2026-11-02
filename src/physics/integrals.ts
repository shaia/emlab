/**
 * The integrands of lesson 6.2 (the integral as a sum of small pieces), each with its exact
 * antiderivative, so the figure can show a Riemann sum next to the exact area and the error between
 * them. The physics cases are the course's own: the work of a Coulomb force (2.1), displacement under
 * a velocity graph, the charge under a capacitor's discharge current (3.9) and the energy under a
 * capacitor's V(q) line (2.7). Sums themselves come from `calculus.ts` (`riemann`, `riemannPieces`).
 *
 * MODEL SPECIFICATION
 * - System: a function f on a closed interval [a, b] and an antiderivative F with F′ = f.
 *   Physics cases: two point charges q₁ = 2 μC, q₂ = 1 μC moving apart along a line from r = 0.1 m;
 *   a car with v(t) = 4 − 2t; a uniformly accelerating car v(t) = 2t; a 100 μF capacitor charged
 *   to 12 V discharging through 10 kΩ (τ = 1 s); a 5 μF capacitor charged from 0 to 60 μC.
 * - Dynamics: none. The exact integral is F(b) − F(a) (the fundamental theorem); the Riemann sum is
 *   Σ f(xᵢ)·Δx over N equal pieces.
 * - Boundary: a is fixed per case; b runs over [a, bMax]. b = a gives 0.
 * - Ignored: improper integrals (the Coulomb case stays at r ≥ 0.1 m; its "to infinity" limit is a
 *   test, not a figure state). Friction, air drag, wire resistance: the physics cases are the ideal
 *   models of their lessons.
 * - Valid when: f is smooth on [a, b]. Left/right sums err as O(1/N), midpoint/trapezoid as O(1/N²);
 *   on a straight line the midpoint and trapezoid sums are exact.
 * - Failure modes: the relative error of a case whose signed area is 0 (sin over a full period) is
 *   undefined, so errors are measured against the unsigned area ∫|f|, which is never 0 here.
 */

import { K } from './constants';
import { riemann, type Fn, type RiemannRule } from './calculus';
import { rcDischarge } from './circuits';
import { energyQC } from './capacitors';

export type CaseId = 'accel' | 'parabola' | 'sine' | 'velocity' | 'coulomb' | 'discharge' | 'capacitor';

export interface IntegrandCase {
  /** the integrand */
  f: Fn;
  /** an antiderivative: F′ = f */
  F: Fn;
  /** the fixed lower end of the interval */
  a: number;
  /** the largest upper end the figure offers */
  bMax: number;
  /** the upper end a case opens with */
  b: number;
}

/** Coulomb case: q₁ = 2 μC fixed, q₂ = 1 μC pushed away, the product k·q₁·q₂ [N·m²]. */
export const COULOMB_Q1 = 2e-6;
export const COULOMB_Q2 = 1e-6;
const KQQ = K * COULOMB_Q1 * COULOMB_Q2;

/** Discharge case, the 3.9 figure's defaults: 12 V on 100 μF through 10 kΩ, τ = RC = 1 s. */
export const RC_V0 = 12;
export const RC_R = 1e4;
export const RC_C = 1e-4;

/** Capacitor case: 5 μF, charged up to 60 μC. */
export const CAP_C = 5e-6;

/** Uniform acceleration [m/s²] of the `accel` car, and the velocity case's v₀ [m/s] and a [m/s²]. */
export const ACCEL_A = 2;
export const VEL_V0 = 4;
export const VEL_A = -2;

/** The coulomb force on q₂ at distance r [N], positive = pushing the charges apart. */
export const coulombForce = (r: number): number => KQQ / (r * r);

export const CASES: Record<CaseId, IntegrandCase> = {
  accel: { f: (t) => ACCEL_A * t, F: (t) => (ACCEL_A * t * t) / 2, a: 0, bMax: 10, b: 10 },
  parabola: { f: (x) => x * x, F: (x) => (x * x * x) / 3, a: 0, bMax: 3, b: 3 },
  sine: { f: Math.sin, F: (x) => -Math.cos(x), a: 0, bMax: 2 * Math.PI, b: 2 * Math.PI },
  velocity: { f: (t) => VEL_V0 + VEL_A * t, F: (t) => VEL_V0 * t + (VEL_A * t * t) / 2, a: 0, bMax: 5, b: 5 },
  // work done by the field as q₂ moves out: ∫ kq₁q₂/r² dr, antiderivative −kq₁q₂/r
  coulomb: { f: coulombForce, F: (r) => -KQQ / r, a: 0.1, bMax: 0.5, b: 0.5 },
  // charge through the resistor: ∫ i dt, antiderivative −q(t) (the charge still on the capacitor)
  discharge: {
    f: (t) => rcDischarge(t, RC_V0, RC_R, RC_C).I,
    F: (t) => -rcDischarge(t, RC_V0, RC_R, RC_C).q,
    a: 0,
    bMax: 5,
    b: 5,
  },
  // energy stored while charging: ∫ V dq with V = q/C, antiderivative q²/(2C)
  capacitor: { f: (q) => q / CAP_C, F: (q) => energyQC(q, CAP_C), a: 0, bMax: 6e-5, b: 6e-5 },
};

/** The exact definite integral ∫ₐᵇ f by the fundamental theorem: F(b) − F(a). */
export const exactIntegral = (c: IntegrandCase, a: number, b: number): number => c.F(b) - c.F(a);

/** The unsigned area ∫ₐᵇ |f|, by a fine midpoint sum (for a velocity graph: the distance travelled). */
export const unsignedArea = (c: IntegrandCase, a: number, b: number, n = 4000): number => riemann((x) => Math.abs(c.f(x)), a, b, n, 'mid');

/** The area above the axis and the area below it (both ≥ 0); signed area = above − below. */
export function areaParts(c: IntegrandCase, a: number, b: number, n = 4000): { above: number; below: number } {
  const above = riemann((x) => Math.max(0, c.f(x)), a, b, n, 'mid');
  const below = riemann((x) => Math.max(0, -c.f(x)), a, b, n, 'mid');
  return { above, below };
}

/** Riemann sum minus the exact integral. */
export const sumError = (c: IntegrandCase, a: number, b: number, n: number, rule: RiemannRule): number =>
  riemann(c.f, a, b, n, rule) - exactIntegral(c, a, b);

/**
 * The error as a fraction of the unsigned area ∫|f|: a size that never divides by zero, even when the
 * signed area is 0. Below ~1e-13 it is rounding, and is returned as 0.
 */
export function relativeSumError(c: IntegrandCase, a: number, b: number, n: number, rule: RiemannRule): number {
  const scale = unsignedArea(c, a, b);
  if (!(scale > 0)) return 0;
  const r = Math.abs(sumError(c, a, b, n, rule)) / scale;
  return r < 1e-13 ? 0 : r;
}

/** How many times smaller the error gets when N doubles: about 2 for left/right, 4 for mid/trapezoid. */
export function doublingRatio(c: IntegrandCase, a: number, b: number, n: number, rule: RiemannRule): number {
  const e1 = Math.abs(sumError(c, a, b, n, rule));
  const e2 = Math.abs(sumError(c, a, b, 2 * n, rule));
  return e2 > 0 ? e1 / e2 : Number.POSITIVE_INFINITY;
}
