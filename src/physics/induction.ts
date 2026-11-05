/**
 * Electromagnetic induction for chapter 5: magnetic flux, Faraday's law and Lenz's sense, a loop
 * pushed through a strip of field, the flux of a straight wire through a rectangle, a rod sliding on
 * rails, the charge that flows for a given change of flux, the induced electric field of a growing
 * uniform field, and the rotating-coil generator.
 *
 * MODEL SPECIFICATION
 * - System: flat loops (N turns, area A, total resistance R) in prescribed magnetic fields, and one
 *   moving conductor, a rod of mass m and length L closing a circuit on two parallel rails. Figure
 *   coordinates: x to the right, y up, z out of the page (⊙). A loop's normal n̂ and its positive
 *   circulation are tied by the right-hand rule: with n̂ out of the page, positive is counter-clockwise.
 *   The flux Φ = B·A·cosθ is measured along n̂ (θ between B and n̂), and an emf or a current is positive
 *   when it drives charge in the positive sense.
 * - Dynamics: Faraday's law ε = −N·dΦ/dt (the minus sign is Lenz's law); averaged over a finite change,
 *   ε = −N·ΔΦ/Δt. Ohm's law closes the loop, I = ε/R, and the charge that passes is Q = −N·ΔΦ/R,
 *   whatever the time course. Rod on rails: ε = BLv, I = BLv/R, braking force B·I·L, so
 *   m·dv/dt = F − B²L²v/R under a constant drive F along the rails, with the closed form
 *   v(t) = v_T + (v₀ − v_T)·e^(−t/τ), v_T = FR/(B²L²), τ = mR/(B²L²). Generator: a coil turning at
 *   ω about an axis perpendicular to a uniform B, θ = ωt + θ₀, Φ = NBA·cosθ, ε = NBAω·sinθ.
 *   Induced electric field: a uniform B along z inside a circle of radius a (the core of a long
 *   solenoid), changing at dB/dt, drives an azimuthal E of strength |dB/dt|·r/2 inside and
 *   |dB/dt|·a²/(2r) outside (the vector field is `inducedE` in maxwell.ts).
 * - Boundary: fields outside the drawn region are zero (a strip of field has sharp edges; the
 *   solenoid's field vanishes outside its core).
 * - Ignored: the loop's own field acting back on its flux (self-inductance, so the current follows
 *   the emf instantly), friction on the rails unless it is folded into F, the rails' and the rod's
 *   resistance unless it is folded into R, fringe fields at a strip's edges, retardation and radiation
 *   (quasi-static: every region is much smaller than c times the time over which the fields change).
 * - Valid when: the loop's self-inductance L_self satisfies L_self/R ≪ the time over which the flux
 *   changes; speeds v ≪ c.
 * - Failure modes: R = 0 (superconducting loop) or B·L = 0 make the rail time constant infinite or
 *   zero; callers keep R > 0 and B·L ≠ 0. `wireRectFlux` needs 0 < r1 < r2 (the near side may not
 *   touch the wire). A loop exactly on a strip edge has a one-sided emf; `stripEmf` returns the value
 *   for motion in the +x direction past that point.
 */

import { G, MU0 } from './constants';
import { derivative, type Fn } from './calculus';

/* ------------------------------------------------------------------ flux */

/** Φ = B·A·cosθ, θ between B and the loop's normal [Wb]. */
export const fluxUniform = (B: number, A: number, theta = 0): number => B * A * Math.cos(theta);

/**
 * Flux of a long straight wire carrying I through a coplanar rectangle of height h (parallel to the
 * wire) whose sides lie at distances r1 < r2 from it: Φ = μ₀Ih·ln(r2/r1)/(2π) [Wb].
 */
export function wireRectFlux(I: number, h: number, r1: number, r2: number): number {
  if (!(r1 > 0 && r2 > r1)) throw new RangeError('wireRectFlux needs 0 < r1 < r2');
  return ((MU0 * I * h) / (2 * Math.PI)) * Math.log(r2 / r1);
}

/** Length of [x1, x2] ∩ [a, b] (0 if they do not overlap) [m]. */
export const overlap = (x1: number, x2: number, a: number, b: number): number =>
  Math.max(0, Math.min(x2, b) - Math.max(x1, a));

/**
 * A rectangular loop of width w (along x) and height h whose left side is at xLeft, and a strip of
 * uniform field B (along the loop's normal) occupying a ≤ x ≤ b: Φ = B·h·overlap [Wb].
 */
export const stripFlux = (B: number, a: number, b: number, xLeft: number, w: number, h: number): number =>
  B * h * overlap(xLeft, xLeft + w, a, b);

/**
 * dΦ/dx for the loop of `stripFlux` moving in +x: +B·h while its leading side is in the field and its
 * trailing side is not, −B·h in the reverse case, 0 when both or neither are [Wb/m].
 */
export function stripFluxSlope(B: number, a: number, b: number, xLeft: number, w: number, h: number): number {
  const xRight = xLeft + w;
  const lead = xRight >= a && xRight < b ? 1 : 0;
  const trail = xLeft >= a && xLeft < b ? 1 : 0;
  return B * h * (lead - trail);
}

/** emf in the loop of `stripFlux` moving at v along +x: ε = −dΦ/dt = −v·dΦ/dx [V]. */
export function stripEmf(B: number, a: number, b: number, xLeft: number, w: number, h: number, v: number): number {
  const slope = stripFluxSlope(B, a, b, xLeft, w, h);
  return slope === 0 ? 0 : -v * slope; // no −0 for a figure to print
}

/* ------------------------------------------------------------------ Faraday and Lenz */

/** Average emf over a finite change of flux per turn, ε = −N·ΔΦ/Δt [V]. */
export const averageEmf = (N: number, phi1: number, phi2: number, dt: number): number => (-N * (phi2 - phi1)) / dt;

/**
 * Instantaneous emf from a flux history Φ(t) per turn, ε = −N·dΦ/dt [V]. Pass a step h much smaller
 * than the time over which Φ changes (the default suits changes over seconds, not a 50 Hz cycle).
 */
export const emfOf = (phi: Fn, t: number, N = 1, h?: number): number => -N * derivative(phi, t, h);

/**
 * Lenz's sense: +1 if the induced current circulates in the loop's positive sense, −1 if against it,
 * 0 if the flux is not changing.
 */
export const lenzSense = (dPhiDt: number): number => (dPhiDt === 0 ? 0 : -Math.sign(dPhiDt));

/** Charge that passes through a loop of total resistance R while its flux per turn goes Φ₁ → Φ₂ [C]. */
export const chargeThrough = (N: number, phi1: number, phi2: number, R: number): number => (-N * (phi2 - phi1)) / R;

/* ------------------------------------------------------------------ rod on rails */

/** Motional emf of a rod of length L moving at v perpendicular to itself and to B: ε = BLv [V]. */
export const motionalEmf = (B: number, L: number, v: number): number => B * L * v;

export interface RailRod {
  /** rod mass [kg] */
  m: number;
  /** distance between the rails, the rod's active length [m] */
  L: number;
  /** field component perpendicular to the plane of the rails [T] */
  B: number;
  /** total resistance of the circuit [Ω] */
  R: number;
  /** constant net drive along the rails (applied force, or m·g·sinα on an incline) [N] */
  F: number;
}

/** The drive of gravity along rails inclined at alpha: m·g·sinα [N]. */
export const inclineDrive = (m: number, alpha: number): number => m * G * Math.sin(alpha);

/** Terminal speed, where the braking force B²L²v/R balances F: v_T = FR/(B²L²) [m/s]. */
export const railTerminalSpeed = (p: RailRod): number => (p.F * p.R) / (p.B * p.B * p.L * p.L);

/** Time constant of the approach to v_T: τ = mR/(B²L²) [s]. */
export const railTimeConstant = (p: RailRod): number => (p.m * p.R) / (p.B * p.B * p.L * p.L);

/** Braking (magnetic) force on the rod at speed v, opposing the motion: B²L²v/R [N]. */
export const railBrakingForce = (p: RailRod, v: number): number => (p.B * p.B * p.L * p.L * v) / p.R;

/** Current in the rail circuit at speed v: I = BLv/R [A]. */
export const railCurrent = (p: RailRod, v: number): number => (p.B * p.L * v) / p.R;

/** Rod speed at time t from v0: v_T + (v0 − v_T)·e^(−t/τ) [m/s]. */
export function railSpeed(p: RailRod, v0: number, t: number): number {
  const vT = railTerminalSpeed(p);
  return vT + (v0 - vT) * Math.exp(-t / railTimeConstant(p));
}

/** Distance travelled by time t from v0: v_T·t + (v0 − v_T)·τ·(1 − e^(−t/τ)) [m]. */
export function railDistance(p: RailRod, v0: number, t: number): number {
  const vT = railTerminalSpeed(p);
  const tau = railTimeConstant(p);
  return vT * t + (v0 - vT) * tau * (1 - Math.exp(-t / tau));
}

export interface RailState {
  /** position along the rails [m] */
  x: number;
  /** speed [m/s] */
  v: number;
  /** Joule heat released so far [J] */
  heat: number;
}

/** One RK4 step of m·dv/dt = F − B²L²v/R, integrating the heat I²R alongside (for figures and tests). */
export function railStep(s: RailState, p: RailRod, dt: number): RailState {
  const acc = (v: number): number => (p.F - railBrakingForce(p, v)) / p.m;
  const heatRate = (v: number): number => railBrakingForce(p, v) * v;
  const k1 = acc(s.v);
  const k2 = acc(s.v + (dt / 2) * k1);
  const k3 = acc(s.v + (dt / 2) * k2);
  const k4 = acc(s.v + dt * k3);
  const v1 = s.v + (dt / 2) * k1;
  const v2 = s.v + (dt / 2) * k2;
  const v3 = s.v + dt * k3;
  return {
    v: s.v + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4),
    x: s.x + (dt / 6) * (s.v + 2 * v1 + 2 * v2 + v3),
    heat: s.heat + (dt / 6) * (heatRate(s.v) + 2 * heatRate(v1) + 2 * heatRate(v2) + heatRate(v3)),
  };
}

/* ------------------------------------------------------------------ induced electric field */

/**
 * Strength of the azimuthal E induced at distance r from the axis of a uniform field confined to a
 * circle of radius a and changing at dBdt: |dB/dt|·r/2 inside, |dB/dt|·a²/(2r) outside [V/m].
 */
export function inducedFieldStrength(dBdt: number, a: number, r: number): number {
  if (r === 0) return 0;
  const k = Math.abs(dBdt);
  return r < a ? (k * r) / 2 : (k * a * a) / (2 * r);
}

/** emf around a circle of radius r about that axis, |∮E·dl| = π·min(r, a)²·|dB/dt| [V]. */
export const inducedCircleEmf = (dBdt: number, a: number, r: number): number =>
  Math.PI * Math.min(r, a) ** 2 * Math.abs(dBdt);

/* ------------------------------------------------------------------ generator and AC */

export interface Generator {
  /** turns */
  N: number;
  /** field [T] */
  B: number;
  /** area of one turn [m²] */
  A: number;
  /** angular speed [rad/s] */
  omega: number;
  /** angle between the normal and B at t = 0 [rad] */
  theta0?: number;
}

/** Flux linkage N·Φ = NBA·cos(ωt + θ₀) [Wb]. */
export const generatorFlux = (g: Generator, t: number): number => g.N * g.B * g.A * Math.cos(g.omega * t + (g.theta0 ?? 0));

/** emf ε = NBAω·sin(ωt + θ₀), i.e. −d(NΦ)/dt [V]. */
export const generatorEmf = (g: Generator, t: number): number =>
  g.N * g.B * g.A * g.omega * Math.sin(g.omega * t + (g.theta0 ?? 0));

/** Peak emf ε₀ = NBAω [V]. */
export const generatorPeak = (g: Generator): number => g.N * g.B * g.A * g.omega;

/** Effective (rms) value of a sinusoid of amplitude x0: x0/√2. */
export const rms = (x0: number): number => x0 / Math.SQRT2;

/** Mean power of a sinusoidal emf of amplitude e0 in a resistor R: e0²/(2R) [W]. */
export const acMeanPower = (e0: number, R: number): number => (e0 * e0) / (2 * R);
