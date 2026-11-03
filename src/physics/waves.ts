/**
 * Electromagnetic waves and the energy in the field (lesson 6.14): a plane wave in empty space, the
 * energy densities of the electric and magnetic field, the Poynting vector and the intensity, and the
 * energy that flows through the surface of a resistor or into a charging capacitor.
 *
 * MODEL SPECIFICATION
 * - System: a sinusoidal plane wave in vacuum travelling along ±x, with E along y and B along z:
 *   E_y = E₀·sin(kx ∓ ωt), B_z = ±B₀·sin(kx ∓ ωt ± lag), so that at every point B(t) = E(t − lag/ω)·B₀/E₀:
 *   B reaches each stage of its cycle lag/ω later than E. A "trial" wave may have any speed v = ω/k
 *   and any phase lag of B behind E; it is built so that Faraday's law holds whenever lag = 0
 *   (B₀ = E₀/v), and the lesson asks which v also satisfies the Ampère–Maxwell law (only v = c).
 *   The true wave has v = 1/√(μ₀ε₀) = c and lag = 0, so E₀ = cB₀.
 * - Dynamics: the curl equations in empty space, ∇×E = −∂B/∂t and ∇×B = μ₀ε₀·∂E/∂t (lesson 6.13).
 *   For this geometry they reduce to ∂E_y/∂x = −∂B_z/∂t and −∂B_z/∂x = μ₀ε₀·∂E_y/∂t, and together to
 *   the wave equation ∂²E/∂x² = μ₀ε₀·∂²E/∂t². `maxwellResiduals` checks them numerically with the
 *   central-difference curl of vectorcalc.ts and the derivative of calculus.ts.
 * - Energy: u = ε₀E²/2 + B²/(2μ₀) [J/m³] (the capacitor of lesson 2.7 gives the first term, a solenoid
 *   whose current grows, through Faraday's law, the second). The Poynting vector S = E×B/μ₀ [W/m²]
 *   is the energy crossing unit area per second; for the wave S = u·c and the time average of sin² is
 *   ½, so the intensity is ⟨S⟩ = cε₀E₀²/2.
 * - Boundary: none for the wave (infinite plane fronts). For a resistor, a straight cylindrical wire
 *   of radius a and length L with a uniform field V/L along it; for a capacitor, circular plates of
 *   radius a a gap d apart, with the Ampère–Maxwell field of displacement.ts at the edge.
 * - Ignored: sources (the wave has always existed), absorption, any medium (vacuum only); for the
 *   wire, the field outside its surface beyond the surface value and the return circuit; for the
 *   capacitor, fringe fields (d ≪ a) and retardation (quasi-static, slow charging).
 * - Valid when: vacuum; for the wire and capacitor flows, steady or slowly changing currents.
 * - Failure modes: v ≤ 0 or f ≤ 0 are meaningless and the callers keep them positive; a = 0 makes the
 *   wire's surface field infinite.
 *
 * ε₀ here is the engine's EPS0 = 1/(4πK), so μ₀ε₀ = 1/c² holds exactly, u_E = u_B to the last digit
 * and S = u·c exactly. Students substitute 8.85·10⁻¹² (EPS0_DISPLAY); the 0.1% gap is below every
 * grading tolerance.
 */

import { derivative } from './calculus';
import { C_LIGHT, EPS0, MU0 } from './constants';
import { gapField } from './displacement';
import { cross3, type Vec3 } from './vec';
import { curl3 } from './vectorcalc';

/** The speed of an electromagnetic wave from the two constants of electricity and magnetism, 1/√(μ₀ε₀) [m/s]. */
export const speedFromConstants = (): number => 1 / Math.sqrt(MU0 * EPS0);

/** A plane wave along ±x: E along y, B along z. */
export interface PlaneWave {
  /** amplitude of E [V/m] */
  E0: number;
  /** frequency [Hz] */
  f: number;
  /** +1: travels toward +x; −1: toward −x */
  dir?: 1 | -1;
  /** trial speed ω/k [m/s]; the true wave has c */
  v?: number;
  /** phase lag of B behind E [rad]; the true wave has 0 */
  lag?: number;
}

/** Angular frequency ω = 2πf [rad/s]. */
export const angularFrequency = (f: number): number => 2 * Math.PI * f;

/** Wave number k = ω/v [rad/m]. */
export const waveNumber = (w: PlaneWave): number => angularFrequency(w.f) / (w.v ?? C_LIGHT);

/** Wavelength λ = 2π/k = v/f [m]. */
export const wavelength = (w: PlaneWave): number => (w.v ?? C_LIGHT) / w.f;

/** Period T = 1/f [s]. */
export const period = (w: PlaneWave): number => 1 / w.f;

/** Amplitude of B that Faraday's law demands for this E₀ and speed: B₀ = kE₀/ω = E₀/v [T]. */
export const amplitudeB = (w: PlaneWave): number => w.E0 / (w.v ?? C_LIGHT);

/** E_y and B_z at (x, t). */
export function waveAt(w: PlaneWave, x: number, t: number): { E: number; B: number } {
  const dir = w.dir ?? 1;
  const k = waveNumber(w);
  const om = angularFrequency(w.f);
  const phase = k * x - dir * om * t;
  // at fixed x, B(t) = sin(kx ∓ ω(t − lag/ω)) = sin(phase ± lag): a lag in time, for either direction
  return { E: w.E0 * Math.sin(phase), B: dir * amplitudeB(w) * Math.sin(phase + dir * (w.lag ?? 0)) };
}

/** The wave's E field as a 3D vector field at time t (for vectorcalc's curl). */
export const fieldE =
  (w: PlaneWave, t: number) =>
  (p: Vec3): Vec3 => [0, waveAt(w, p[0], t).E, 0];

/** The wave's B field as a 3D vector field at time t. */
export const fieldB =
  (w: PlaneWave, t: number) =>
  (p: Vec3): Vec3 => [0, 0, waveAt(w, p[0], t).B];

/** Both sides of the two curl equations at (x, t), from numerical derivatives (no formula for the wave's slopes). */
export function curlSides(w: PlaneWave, x: number, t: number) {
  const p: Vec3 = [x, 0, 0];
  const lam = wavelength(w);
  const T = period(w);
  const curlE = curl3(fieldE(w, t), p, lam * 1e-4)[2];
  const curlB = curl3(fieldB(w, t), p, lam * 1e-4)[1];
  const dBdt = derivative((s) => waveAt(w, x, s).B, t, T * 1e-4);
  const dEdt = derivative((s) => waveAt(w, x, s).E, t, T * 1e-4);
  return {
    /** (∇×E)_z = ∂E_y/∂x */
    curlE,
    /** −∂B_z/∂t */
    minusDBdt: -dBdt,
    /** (∇×B)_y = −∂B_z/∂x */
    curlB,
    /** μ₀ε₀·∂E_y/∂t */
    mu0eps0DEdt: MU0 * EPS0 * dEdt,
  };
}

/**
 * How badly the wave misses each curl equation over one wavelength at time t: the largest
 * |left − right| over the samples, relative to the largest |left|. Zero (to rounding and the O(h²)
 * of the differences) for a wave that satisfies the law.
 */
export function maxwellResiduals(w: PlaneWave, t = 0, samples = 48): { faraday: number; ampere: number } {
  const lam = wavelength(w);
  let fMiss = 0;
  let fScale = 0;
  let aMiss = 0;
  let aScale = 0;
  for (let i = 0; i < samples; i++) {
    const x = ((i + 0.37) / samples) * lam;
    const s = curlSides(w, x, t);
    fMiss = Math.max(fMiss, Math.abs(s.curlE - s.minusDBdt));
    fScale = Math.max(fScale, Math.abs(s.curlE), Math.abs(s.minusDBdt));
    aMiss = Math.max(aMiss, Math.abs(s.curlB - s.mu0eps0DEdt));
    aScale = Math.max(aScale, Math.abs(s.curlB), Math.abs(s.mu0eps0DEdt));
  }
  return { faraday: fScale === 0 ? 0 : fMiss / fScale, ampere: aScale === 0 ? 0 : aMiss / aScale };
}

/* --------------------------------------------------------------------- energy */

/** Energy density of an electric field, ε₀E²/2 [J/m³]. */
export const energyDensityE = (E: number): number => (EPS0 * E * E) / 2;

/** Energy density of a magnetic field, B²/(2μ₀) [J/m³]. */
export const energyDensityB = (B: number): number => (B * B) / (2 * MU0);

/** Total energy density u = ε₀E²/2 + B²/(2μ₀) [J/m³]. */
export const energyDensity = (E: number, B: number): number => energyDensityE(E) + energyDensityB(B);

/** The Poynting vector S = E×B/μ₀ [W/m²]. */
export const poynting = (E: Vec3, B: Vec3): Vec3 => {
  const s = cross3(E, B);
  return [s[0] / MU0, s[1] / MU0, s[2] / MU0];
};

/** S_x of the plane wave at (x, t) [W/m²]: E_y·B_z/μ₀. */
export const poyntingAt = (w: PlaneWave, x: number, t: number): number => {
  const { E, B } = waveAt(w, x, t);
  return (E * B) / MU0;
};

/**
 * Time average of S_x over one period for any (trial) wave: E₀B₀cos(lag)/(2μ₀), signed by the
 * direction of travel [W/m²]. For the true wave it is the intensity cε₀E₀²/2.
 */
export const meanPoynting = (w: PlaneWave): number => ((w.dir ?? 1) * w.E0 * Math.abs(amplitudeB(w)) * Math.cos(w.lag ?? 0)) / (2 * MU0);

/** Intensity (time-averaged |S|) of a true plane wave of amplitude E₀: cε₀E₀²/2 [W/m²]. */
export const intensity = (E0: number): number => (C_LIGHT * EPS0 * E0 * E0) / 2;

/** The amplitude of E for a given intensity, √(2I/(cε₀)) [V/m]. */
export const amplitudeFromIntensity = (I: number): number => Math.sqrt((2 * I) / (C_LIGHT * EPS0));

/** Time-averaged energy density of a true plane wave, ε₀E₀²/2 (= ⟨S⟩/c) [J/m³]. */
export const meanEnergyDensity = (E0: number): number => (EPS0 * E0 * E0) / 2;

/** Intensity of a point source of power P [W] spread over a sphere of radius r: P/(4πr²) [W/m²]. */
export const intensityAtDistance = (P: number, r: number): number => P / (4 * Math.PI * r * r);

/* ---------------------------------------------------- energy stored in devices */

/** Energy of a parallel-plate capacitor (area A, gap d) at voltage V, ½CV² with C = ε₀A/d [J]. */
export const capacitorEnergy = (A: number, d: number, V: number): number => 0.5 * ((EPS0 * A) / d) * V * V;

/** Field inside a long solenoid with n turns per metre carrying I: B = μ₀nI [T]. */
export const solenoidB = (n: number, I: number): number => MU0 * n * I;

/**
 * The work the source does to raise the current of a long solenoid (n turns per metre, cross-section A,
 * length ℓ) from 0 to I, summed in N time steps (midpoint rule). The current rises along a smooth ramp
 * I(t) = I·sin(πt/2) for 0 ≤ t ≤ 1 s; in each step the flux through every turn grows, Faraday's law
 * gives a back-emf N_turns·A·dB/dt, and the source supplies I(t)·emf·dt against it. The sum converges
 * (O(1/N²)) to B²/(2μ₀)·Aℓ whatever the shape of the ramp.
 */
export function solenoidWork(n: number, A: number, len: number, I: number, steps: number): number {
  const turns = n * len;
  const dt = 1 / steps;
  let W = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const current = I * Math.sin((Math.PI * t) / 2);
    const dBdt = solenoidB(n, I) * (Math.PI / 2) * Math.cos((Math.PI * t) / 2);
    const emf = turns * A * dBdt;
    W += current * emf * dt;
  }
  return W;
}

/* ----------------------------------------------------- energy flow into devices */

/**
 * The field at the surface of a straight resistor wire (radius a, length L, voltage V, current I):
 * E = V/L along the wire, B = μ₀I/(2πa) around it, and S = EB/μ₀ pointing radially inward.
 * The total flow through the side surface, S·2πaL, is the power VI the wire turns into heat.
 */
export function wireSurfaceFlow(V: number, I: number, a: number, L: number) {
  const E = V / L;
  const B = (MU0 * I) / (2 * Math.PI * a);
  const S = (E * B) / MU0;
  return { E, B, S, power: S * 2 * Math.PI * a * L };
}

/**
 * Energy flowing into a charging capacitor with circular plates (radius a, gap d) through the
 * cylindrical surface at the plate edge, when the field between the plates is E and grows at dE/dt.
 * B at the edge is the Ampère–Maxwell field of lesson 6.12; S = EB/μ₀ points inward; the power
 * S·2πad equals the rate of growth of the stored energy, d/dt(ε₀E²/2·πa²d).
 */
export function capacitorEdgeFlow(a: number, d: number, E: number, dEdt: number) {
  const I = EPS0 * Math.PI * a * a * dEdt; // the displacement current = the current in the wires
  const B = gapField(I, a, a);
  const S = (E * B) / MU0;
  return { B, S, power: S * 2 * Math.PI * a * d, dUdt: EPS0 * E * dEdt * Math.PI * a * a * d };
}
