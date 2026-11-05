/**
 * Induction read off graphs, for lesson 5.6: the emf as minus the slope of a flux graph, a rectangular
 * loop pushed at constant speed through a strip of field (flux, emf, current, the push it needs and the
 * power that push delivers), and the charge that passes, Q = −N·ΔΦ/R, as the area under I(t).
 *
 * MODEL SPECIFICATION
 * - System: a flat loop of N turns and total resistance R whose flux per turn Φ(t) is given, either as a
 *   piecewise-linear graph (knots [t, Φ]), as a smooth bell Φ₀·e^(−((t−t₀)/τ)²) (a magnet carried through
 *   a coil at constant speed), or by a rectangle of width w (along x) and height h moving at constant
 *   speed v along +x through a strip of uniform field B occupying a ≤ x ≤ b. In the strip figure B points
 *   into the page (⊗) and the loop's normal n̂ is chosen into the page too, so Φ ≥ 0 and, by the
 *   right-hand rule, the positive sense of circulation is clockwise as seen on the page.
 * - Dynamics: Faraday's law ε = −N·dΦ/dt; on a straight piece of the graph the emf is the constant
 *   −N·slope. Ohm's law I = ε/R. Strip: Φ = B·h·(length of the loop inside the strip), so
 *   ε = −N·v·dΦ/dx = ∓N·B·h·v while one vertical side is inside and 0 otherwise. The magnetic force on
 *   the loop along x is N·I·dΦ/dx (each vertical side inside the strip carries N·B·I·h; the two sides'
 *   currents are opposite), which is −N²·v·(dΦ/dx)²/R: it always opposes the motion. Keeping v constant
 *   takes an external push equal and opposite to it, whose power F·v equals I²R at every instant.
 *   Charge: dQ = I·dt = −N·dΦ/R, so Q = −N·ΔΦ/R whatever the time course (the area under I(t)).
 * - Boundary: no field outside the strip (sharp edges); the loop starts and ends outside it.
 * - Ignored: self-inductance (the current follows the emf instantly), fringe fields at the strip edges,
 *   the forces on the horizontal sides (equal and opposite, they cancel), friction and the loop's inertia
 *   (the push is only the extra force the induced current makes necessary).
 * - Valid when: L_self/R ≪ the time the flux takes to change (w/v for the strip); v ≪ c.
 * - Failure modes: R = 0 or v = 0 (callers keep both positive); a knot list with fewer than two knots or
 *   with times not increasing throws. At a corner of a piecewise-linear graph, or exactly on a strip edge,
 *   the emf is the one-sided value for the piece that starts there.
 */

import { chargeThrough, stripFlux, stripFluxSlope } from './induction';
import type { Fn } from './calculus';

/* ------------------------------------------------------------------ piecewise-linear graphs */

/** A corner of a piecewise-linear graph: [t, value]. */
export type Knot = readonly [number, number];

/** One straight piece of a piecewise-linear graph, from t0 to t1, with its slope [value/s]. */
export interface Piece {
  t0: number;
  t1: number;
  v0: number;
  v1: number;
  slope: number;
}

function checkKnots(knots: readonly Knot[]): void {
  if (knots.length < 2) throw new RangeError('a piecewise-linear graph needs at least two knots');
  for (let i = 1; i < knots.length; i++) {
    if (!(knots[i][0] > knots[i - 1][0])) throw new RangeError('knot times must increase');
  }
}

/** The straight pieces between consecutive knots. */
export function pieces(knots: readonly Knot[]): Piece[] {
  checkKnots(knots);
  const out: Piece[] = [];
  for (let i = 1; i < knots.length; i++) {
    const [t0, v0] = knots[i - 1];
    const [t1, v1] = knots[i];
    out.push({ t0, t1, v0, v1, slope: (v1 - v0) / (t1 - t0) });
  }
  return out;
}

/** The graph through the knots as a function of t, held at its end values outside the knots. */
export function piecewiseLinear(knots: readonly Knot[]): Fn {
  const ps = pieces(knots);
  return (t) => {
    if (t <= ps[0].t0) return ps[0].v0;
    for (const p of ps) if (t <= p.t1) return p.v0 + p.slope * (t - p.t0);
    return ps[ps.length - 1].v1;
  };
}

/** The index of the piece that holds t (a corner belongs to the piece that starts there); −1 outside. */
export function pieceAt(ps: readonly Piece[], t: number): number {
  for (let i = 0; i < ps.length; i++) if (t >= ps[i].t0 && (t < ps[i].t1 || (i === ps.length - 1 && t === ps[i].t1))) return i;
  return -1;
}

/** The emf of each straight piece of a flux-per-turn graph, ε = −N·slope [V]. */
export const pieceEmfs = (knots: readonly Knot[], N = 1): number[] =>
  pieces(knots).map((p) => (p.slope === 0 ? 0 : -N * p.slope));

/**
 * ε(t) for a flux-per-turn graph through the knots: a step function, −N·slope on each piece and 0
 * outside the graph, where the flux is held constant [V].
 */
export function stepEmf(knots: readonly Knot[], N = 1): Fn {
  const ps = pieces(knots);
  const e = pieceEmfs(knots, N);
  return (t) => {
    const i = pieceAt(ps, t);
    return i < 0 ? 0 : e[i];
  };
}

/* ------------------------------------------------------------------ a magnet carried through a coil */

/** The bell Φ₀·e^(−((t−t₀)/τ)²): the flux per turn of a magnet carried through a coil at constant speed [Wb]. */
export const bellFlux = (phi0: number, t0: number, tau: number): Fn => (t) => phi0 * Math.exp(-(((t - t0) / tau) ** 2));

/** Its emf, ε = −N·dΦ/dt = 2N·Φ₀·(t−t₀)/τ²·e^(−((t−t₀)/τ)²) [V]. */
export const bellEmf = (phi0: number, t0: number, tau: number, N = 1): Fn => (t) =>
  ((2 * N * phi0 * (t - t0)) / (tau * tau)) * Math.exp(-(((t - t0) / tau) ** 2));

/** The two moments the bell is steepest, t₀ ∓ τ/√2, where |ε| is largest [s]. */
export const bellSteepest = (t0: number, tau: number): [number, number] => [t0 - tau / Math.SQRT2, t0 + tau / Math.SQRT2];

/** The largest |ε| of the bell, N·Φ₀·√2·e^(−1/2)/τ [V]. */
export const bellPeakEmf = (phi0: number, tau: number, N = 1): number => (N * Math.abs(phi0) * Math.SQRT2 * Math.exp(-0.5)) / tau;

/* ------------------------------------------------------------------ a loop pushed through a strip */

export interface StripPass {
  /** field in the strip, along the loop's normal (into the page in the figure) [T] */
  B: number;
  /** strip edges, a < b [m] */
  a: number;
  b: number;
  /** loop width along the motion and height across it [m] */
  w: number;
  h: number;
  /** constant speed along +x [m/s] */
  v: number;
  /** total resistance of the loop [Ω] */
  R: number;
  /** turns */
  N: number;
  /** the loop's left side at t = 0 [m] */
  x0: number;
}

/** The loop's left side at time t [m]. */
export const passPosition = (p: StripPass, t: number): number => p.x0 + p.v * t;

/** Flux per turn at time t, B·h·(length inside the strip) [Wb]. */
export const passFlux = (p: StripPass, t: number): number => stripFlux(p.B, p.a, p.b, passPosition(p, t), p.w, p.h);

/** dΦ/dx at time t: +B·h with only the leading side in the strip, −B·h with only the trailing side, else 0 [Wb/m]. */
export const passFluxSlope = (p: StripPass, t: number): number => stripFluxSlope(p.B, p.a, p.b, passPosition(p, t), p.w, p.h);

/** emf of the N turns at time t, ε = −N·v·dΦ/dx; positive drives the current clockwise on the page [V]. */
export function passEmf(p: StripPass, t: number): number {
  const s = passFluxSlope(p, t);
  return s === 0 ? 0 : -p.N * p.v * s;
}

/** Current at time t, I = ε/R; positive is clockwise on the page [A]. */
export const passCurrent = (p: StripPass, t: number): number => passEmf(p, t) / p.R;

/**
 * The magnetic force on the loop along x at time t, N·I·dΦ/dx [N]. Negative while the loop moves in +x:
 * it always opposes the motion.
 */
export function passMagneticForce(p: StripPass, t: number): number {
  const f = p.N * passCurrent(p, t) * passFluxSlope(p, t);
  return f === 0 ? 0 : f;
}

/** The push along +x that keeps the speed constant: minus the magnetic force, N²B²h²v/R or 0 [N]. */
export function passPushForce(p: StripPass, t: number): number {
  const f = -passMagneticForce(p, t);
  return f === 0 ? 0 : f;
}

/** The power of that push, F·v [W]. It equals I²R at every instant. */
export const passPushPower = (p: StripPass, t: number): number => passPushForce(p, t) * p.v;

/** Joule power in the loop, I²R [W]. */
export const passHeatPower = (p: StripPass, t: number): number => passCurrent(p, t) ** 2 * p.R;

/** Charge that has passed (positive clockwise) from t0 to t1, −N·ΔΦ/R [C]. */
export const passCharge = (p: StripPass, t0: number, t1: number): number => chargeThrough(p.N, passFlux(p, t0), passFlux(p, t1), p.R);

/**
 * The moments the leading (right) side enters and leaves the strip, and the trailing (left) side enters
 * and leaves it [s]. For w < b − a: entering is [leadIn, trailIn), fully inside [trailIn, leadOut),
 * leaving [leadOut, trailOut).
 */
export function passTimes(p: StripPass): { leadIn: number; leadOut: number; trailIn: number; trailOut: number } {
  return {
    leadIn: (p.a - p.w - p.x0) / p.v,
    leadOut: (p.b - p.w - p.x0) / p.v,
    trailIn: (p.a - p.x0) / p.v,
    trailOut: (p.b - p.x0) / p.v,
  };
}

/**
 * The work of the push over a whole pass, which is the heat released in the loop:
 * 2·N²B²h²·v·min(w, b − a)/R [J]. It grows with the speed, while the charge in each phase does not.
 */
export const passWork = (p: StripPass): number =>
  (2 * p.N * p.N * p.B * p.B * p.h * p.h * p.v * Math.min(p.w, p.b - p.a)) / p.R;
