/**
 * Lesson 6.1's curves: four situations from the course whose rate of change is a physical quantity,
 * each with its exact derivative, so the secant slope (src/physics/calculus.ts) can be watched
 * converging to it. Also the algebra the lesson derives the derivative rules from: the expansion of the
 * secant slope of xⁿ, and the two slope factors (e^h − 1)/h and sin(h)/h that tend to 1.
 *
 * MODEL SPECIFICATION
 * - System:
 *   - free fall from rest: x(t) = ½gt², velocity v = dx/dt = gt;
 *   - a capacitor discharging through a resistor (lesson 3.9): q(t) = Q₀e^(−t/τ), τ = RC, the current
 *     I = −dq/dt = (Q₀/τ)e^(−t/τ) (the minus sign: the charge on the capacitor falls while I > 0);
 *   - the potential of a point charge (lesson 2.2): V(r) = kQ/r, the radial field E = −dV/dr = kQ/r²;
 *   - a harmonic oscillator: x(t) = A·sin(ωt), velocity v = dx/dt = Aω·cos(ωt).
 * - Dynamics: closed-form functions of one variable; no integration.
 * - Boundary: t ≥ 0 for the fall and the discharge (the lesson starts the clock at release / switching);
 *   r > 0 for the point charge.
 * - Ignored: air drag; leakage and wire resistance in the RC circuit; the size of the charge.
 * - Valid when: the exact formulas hold everywhere they are drawn (the course's idealisations).
 *   `powerSecant` is exact for integer n ≥ 0; the slope factors are exact functions of h ≠ 0.
 * - Failure modes: r → 0 makes V and E infinite; h = 0 in a slope factor is 0/0 (NaN). That is the point
 *   the lesson makes: the derivative is the limit, never the value at h = 0.
 */

import { derivative, type Fn } from './calculus';
import { G, K } from './constants';
import { potentialAt } from './electrostatics';

/** Distance fallen from rest after time t [m]: x = ½gt². */
export const fallPosition = (t: number, g = G): number => 0.5 * g * t * t;
/** Velocity of the fall, dx/dt = gt [m/s]. */
export const fallVelocity = (t: number, g = G): number => g * t;

/** Charge left on a capacitor discharging through a resistor, q = Q₀e^(−t/τ) [C]. */
export const dischargeCharge = (t: number, q0: number, tau: number): number => q0 * Math.exp(-t / tau);
/** The discharge current I = −dq/dt = (Q₀/τ)e^(−t/τ) [A]. At t = 0 it is Q₀/(RC) = V₀/R. */
export const dischargeCurrent = (t: number, q0: number, tau: number): number => (q0 / tau) * Math.exp(-t / tau);

/** Potential at distance r from a point charge Q, zero at infinity [V] (via `potentialAt`). */
export const pointPotential = (r: number, q: number): number => potentialAt([{ x: 0, y: 0, q }], r, 0);
/** The radial field of a point charge, E = −dV/dr = kQ/r² (signed: positive points away from Q) [N/C]. */
export const pointRadialField = (r: number, q: number): number => (K * q) / (r * r);

/** Position of a harmonic oscillator, x = A·sin(ωt) [m]. */
export const oscillatorPosition = (t: number, a: number, w: number): number => a * Math.sin(w * t);
/** Its velocity by the chain rule, dx/dt = Aω·cos(ωt) [m/s]. */
export const oscillatorVelocity = (t: number, a: number, w: number): number => a * w * Math.cos(w * t);
/** Its acceleration, the derivative of the velocity: −Aω²·sin(ωt) = −ω²x [m/s²]. */
export const oscillatorAcceleration = (t: number, a: number, w: number): number => -a * w * w * Math.sin(w * t);

/** The binomial coefficient C(n, k): the number of ways to pick k of n brackets. */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
}

/**
 * The secant slope of xⁿ between x and x+h, written out as the lesson derives it:
 * ((x+h)ⁿ − xⁿ)/h = n·xⁿ⁻¹ + C(n,2)·xⁿ⁻²·h + C(n,3)·xⁿ⁻³·h² + … + hⁿ⁻¹.
 * Every term after the first carries a power of h, so as h → 0 only n·xⁿ⁻¹ is left. Integer n ≥ 0.
 */
export function powerSecant(n: number, x: number, h: number): number {
  let s = 0;
  for (let k = 1; k <= n; k++) s += binomial(n, k) * x ** (n - k) * h ** (k - 1);
  return s;
}

/** (e^h − 1)/h: the secant slope of eˣ at x = 0, the factor that multiplies eˣ in every secant of eˣ. */
export const expSlopeFactor = (h: number): number => Math.expm1(h) / h;
/** sin(h)/h: the secant slope of sin at x = 0 (h in radians). */
export const sinSlopeFactor = (h: number): number => Math.sin(h) / h;

/**
 * Where the tangent to f at x₀ crosses the horizontal axis: x₀ − f(x₀)/f′(x₀). For the discharge curve
 * it is x₀ + τ at every x₀: "had the current stayed as it is now, the capacitor would empty in τ".
 */
export function tangentZero(f: Fn, x0: number): number {
  return x0 - f(x0) / derivative(f, x0);
}
