/**
 * The displacement current (lesson 6.12): a parallel-plate capacitor with circular plates charging
 * through a resistor, the electric flux between its plates, Maxwell's term ε₀·dΦ_E/dt, and the
 * magnetic field that the Ampère–Maxwell law gives between the plates.
 *
 * MODEL SPECIFICATION
 * - System: an ideal battery ε, a resistor R and a capacitor of two coaxial circular plates of
 *   radius a a distance d apart, joined by thin straight wires along the axis. Optionally, a
 *   capacitor driven by an AC voltage V₀·sin(ωt), and a "leaky" capacitor whose gap is filled by a
 *   resistor (the challenge problems).
 * - Dynamics: the charge follows the RC law of lesson 3.9 (`rcCharge` in circuits.ts):
 *   I(t) = (ε/R)·e^(−t/RC), q = Cε(1 − e^(−t/RC)), C = ε₀πa²/d. Between the plates the field is
 *   uniform, E = q/(ε₀πa²), so the flux through a coaxial disc of radius r is E·π·min(r, a)² and the
 *   displacement current through it is ε₀·dΦ_E/dt = I·min(r, a)²/a². Through any disc that takes in
 *   the whole gap it equals the wire's current I exactly, at every instant. The Ampère–Maxwell law
 *   on a coaxial circle in the gap gives B(r) = μ₀ε₀(r/2)·dE/dt = μ₀Ir/(2πa²) for r < a and
 *   μ₀I/(2πr) for r ≥ a, azimuthal (right-hand rule about the direction of dE/dt).
 * - Boundary: E = 0 outside the gap (behind the plates and beyond r = a). Charge spreads over each
 *   plate uniformly, so the radial current on a plate that crosses a circle of radius ρ is
 *   I·(1 − ρ²/a²) (it feeds the charge that sits beyond ρ).
 * - Ignored: the fringe field at the plate edges (valid when d ≪ a); the electric field around the
 *   wires; the self-inductance of the circuit; retardation: the field everywhere follows the charge
 *   instantly (quasi-static), which holds when the time constant RC ≫ a/c.
 * - Valid when: d ≪ a, RC ≫ a/c, and the plates are ideal conductors.
 * - Failure modes: r = 0 in the 1/r branch is guarded (B = 0 on the axis); R = 0 makes the RC law
 *   singular (an instant charge), and the callers keep R, a, d positive.
 *
 * ε₀ here is the engine's EPS0 = 1/(4πK), so that μ₀ε₀ = 1/c² holds exactly and I_d equals I to the
 * last digit. A capacitance computed with the sheet's 8.85·10⁻¹² differs by 0.1%, below every grading
 * tolerance.
 */

import { rcCharge } from './circuits';
import { EPS0, MU0 } from './constants';

/** A charging capacitor: battery EMF [V], resistance [Ω], plate radius a [m], gap d [m]. */
export interface ChargingCapacitor {
  emf: number;
  R: number;
  a: number;
  d: number;
}

/** Area of one circular plate, πa² [m²]. */
export const plateArea = (a: number): number => Math.PI * a * a;

/** Capacitance of the circular plate capacitor, C = ε₀πa²/d [F]. */
export const capacitanceOf = (c: ChargingCapacitor): number => (EPS0 * plateArea(c.a)) / c.d;

/** Time constant of the charging, τ = RC [s]. */
export const timeConstant = (c: ChargingCapacitor): number => c.R * capacitanceOf(c);

/** Everything between the plates t seconds after the switch closes. */
export interface GapState {
  /** charge on the + plate [C] */
  q: number;
  /** current in the wires [A] */
  I: number;
  /** field between the plates [V/m], from the + plate to the − plate */
  E: number;
  /** its rate of change [V/(m·s)] */
  dEdt: number;
  /** flux through a disc that takes in the whole gap, E·πa² [V·m] */
  flux: number;
  /** displacement current through that disc, ε₀·dΦ_E/dt [A] */
  Id: number;
}

/** The state of the gap at time t: the RC law gives q and I, Gauss gives E = q/(ε₀A). */
export function gapState(c: ChargingCapacitor, t: number): GapState {
  const C = capacitanceOf(c);
  const A = plateArea(c.a);
  const { q, I } = rcCharge(t, c.emf, c.R, C);
  const E = q / (EPS0 * A);
  // dE/dt = (dq/dt)/(ε₀A) and dq/dt is the current that reaches the plate
  const dEdt = I / (EPS0 * A);
  const flux = E * A;
  return { q, I, E, dEdt, flux, Id: EPS0 * dEdt * A };
}

/** The flux of the gap's uniform field E through a coaxial disc of radius r, E·π·min(r, a)² [V·m]. */
export const discFlux = (E: number, r: number, a: number): number => E * plateArea(Math.min(r, a));

/** The displacement current through a coaxial disc of radius r in the gap, ε₀·(dE/dt)·π·min(r, a)² [A]. */
export const discDisplacement = (dEdt: number, r: number, a: number): number => EPS0 * dEdt * plateArea(Math.min(r, a));

/** The part of the wire's current that a coaxial disc of radius r in the gap carries as displacement current. */
export const enclosedFraction = (r: number, a: number): number => (Math.min(r, a) / a) ** 2;

/**
 * Magnetic field between the plates at a distance r from the axis, from the Ampère–Maxwell law on a
 * coaxial circle: μ₀Ir/(2πa²) inside (r < a), μ₀I/(2πr) outside [T]. I is the wire's current.
 */
export function gapField(I: number, r: number, a: number): number {
  if (r <= 0) return 0;
  return r < a ? (MU0 * I * r) / (2 * Math.PI * a * a) : (MU0 * I) / (2 * Math.PI * r);
}

/** The same field inside the plates written with the field's rate of change: B = μ₀ε₀(r/2)·dE/dt [T]. */
export const gapFieldFromDEdt = (dEdt: number, r: number): number => (MU0 * EPS0 * r * dEdt) / 2;

/** Where the Ampère loop sits: around the wire before the capacitor, or between the plates. */
export type LoopAt = 'wire' | 'gap';
/**
 * The surface spanned on the loop. Around the wire: `flat` is the disc the wire pierces, `bulge` a bag
 * that passes between the plates without touching the wire. In the gap: `flat` is the disc in the gap,
 * `bulge` a cup that goes back through the + plate and is closed behind it, where the wire pierces it.
 */
export type Surface = 'flat' | 'bulge';

/** Conduction and displacement current through a surface, both counted along the wire's current [A]. */
export interface SurfaceCurrents {
  conduction: number;
  displacement: number;
}

/** Radial current on a plate across a circle of radius ρ: it feeds the charge beyond ρ, I·(1 − ρ²/a²) [A]. */
export const plateRadialCurrent = (I: number, rho: number, a: number): number => (rho >= a ? 0 : I * (1 - (rho * rho) / (a * a)));

/**
 * The currents through each surface on a loop of radius r. Around the wire the loop's radius does not
 * matter; in the gap only the part of the gap inside r counts. The total, conduction + displacement, is
 * the same for both surfaces on one loop: that is the point of Maxwell's term.
 */
export function surfaceCurrents(at: LoopAt, surface: Surface, r: number, a: number, I: number): SurfaceCurrents {
  if (at === 'wire') return surface === 'flat' ? { conduction: I, displacement: 0 } : { conduction: 0, displacement: I };
  if (surface === 'flat') return { conduction: 0, displacement: I * enclosedFraction(r, a) };
  // the cup: the wire brings I in through its bottom; the plate carries I·(1 − r²/a²) out through its wall;
  // its wall runs along the field, so no flux crosses it
  return { conduction: I - plateRadialCurrent(I, r, a), displacement: 0 };
}

/** The circulation ∮B·dl around the loop that the Ampère–Maxwell law predicts, μ₀(I_c + I_d) [T·m]. */
export const ampereMaxwell = (s: SurfaceCurrents): number => MU0 * (s.conduction + s.displacement);

/** Ampère's law before Maxwell: μ₀ times the conduction current alone [T·m]. */
export const ampereOld = (s: SurfaceCurrents): number => MU0 * s.conduction;

/* ------------------------------------------------------------------ an AC capacitor */

/** A capacitor C driven by V₀·sin(ωt): its displacement current, C·V₀·ω·cos(ωt) [A], equals the wire's. */
export const acDisplacement = (C: number, V0: number, omega: number, t: number): number => C * V0 * omega * Math.cos(omega * t);

/* ------------------------------------------------------------------ a leaky capacitor */

/**
 * A capacitor whose gap is filled by a resistor, discharging through it. Through a coaxial disc of
 * radius r < a in the gap, counted from the + plate to the − plate: the conduction current I·r²/a²
 * flows forward, and the field, which is shrinking, gives a displacement current of the same size
 * backward. Their sum is zero, so the Ampère–Maxwell law gives B = 0 everywhere in the gap.
 */
export function leakyCurrents(I: number, r: number, a: number): SurfaceCurrents {
  const f = enclosedFraction(r, a);
  return { conduction: I * f, displacement: -I * f };
}

/** The leaky capacitor's time constant: RC = (ρd/A)(ε₀A/d) = ρε₀, whatever its size [s]. */
export const leakyTimeConstant = (rho: number): number => rho * EPS0;
