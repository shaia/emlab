/**
 * Maxwell's four laws in integral form (lesson 5.9): one scene per law, each with the closed surface or
 * the closed path the law speaks about, and both sides of the law computed independently, so that the
 * figure MaxwellFour can show them agree. Plus the electromagnetic wave (lesson 5.10): its speed from the
 * two constants, c = 1/√(μ₀ε₀), the travel time d/c, the fields at a point of the wave as fractions of
 * their peaks, and where a frequency sits in the electromagnetic spectrum.
 *
 * MODEL SPECIFICATION
 * - System:
 *   - Gauss for E: point charges in the plane of the page (z = 0) and a sphere centred in that plane.
 *     The left side, ∮E·dA, is a sum of E·n̂ dA over a Fibonacci lattice on the sphere
 *     (`fluxThroughSphere`); the right side is the enclosed charge over ε₀.
 *   - Gauss for B: the flat coil of maxwell.ts (`flatCoilB`), which acts like a long bar magnet with its
 *     north pole at the top, and a cube of side a whose front and back faces lie parallel to the page.
 *     B has no z component, so those two faces carry no flux, and the flux out of the cube is a times the
 *     outward flux through its four edges in the page, summed by the midpoint rule. The outgoing and the
 *     incoming parts are kept apart.
 *   - Faraday: a uniform B along z (out of the page) inside a circle of radius R, the core of a long
 *     solenoid, changing at dB/dt, and a circular path anywhere in the page, walked counter-clockwise
 *     (normal out of the page). The left side is the circulation of the induced E (`inducedE` in
 *     maxwell.ts) around a fine polygon (`circulation` in magnetism.ts); the right side is −dB/dt times
 *     the part of the path's disc that lies inside the core (the area where B is).
 *   - Ampère–Maxwell: a capacitor with circular plates of radius a, charging with current I, and a
 *     coaxial circular path, around the wire or in the gap (displacement.ts). The left side is 2πr
 *     times the field on the path: μ₀I/(2πr) around the wire, `gapField` in the gap. The right side is
 *     μ₀ times the current of moving charges through the chosen surface, plus (when Maxwell's term is
 *     on) μ₀ε₀ times the rate of change of the electric flux through it (`surfaceCurrents`).
 *   - Wave: a plane wave in vacuum (waves.ts); its speed comes from the constants alone, and the
 *     wavelength from λ = c/f. `waveProbe` reads E/E₀ and B/B₀ at a point from `waveAt` of waves.ts.
 *     Spectrum bands by wavelength, with the usual approximate boundaries.
 * - Dynamics: none beyond the given rates (a snapshot); the wave is drawn by `waveAt`.
 * - Boundary: the core's field and the gap's electric field vanish outside their circles; every source
 *   is long along z except the point charges.
 * - Ignored: the charges' own size; the coil's field singularities at the ends of its strips (the cube
 *   may not have an edge exactly along a strip); fringe fields of the capacitor (gap ≪ a); retardation
 *   (quasi-static scenes).
 * - Valid when: no charge sits on the sphere (`onSurface` flags a charge within 4% of the radius of
 *   it, where the lattice sum would be poor and the law itself has no answer); the cube's edges stay
 *   off the coil's strips.
 * - Failure modes: R = 0 or a = 0 return zero flux; r = 0 returns a zero path.
 *
 * ε₀ is the engine's EPS0 = 1/(4πK), so c = 1/√(μ₀ε₀) is 3·10⁸ m/s exactly; with the sheet's 8.85·10⁻¹²
 * it is 2.998·10⁸ m/s, and the two agree to 0.05%.
 */

import { EPS0, MU0 } from './constants';
import { surfaceCurrents, gapField, type LoopAt, type Surface } from './displacement';
import { fluxThroughSphere, type PointCharge3 } from './electrostatics';
import { circulation, straightWireField } from './magnetism';
import { inducedE } from './maxwell';
import type { Vec2, Vec3 } from './vec';
import type { Field2 } from './vectorcalc';
import { amplitudeB, speedFromConstants, waveAt, type PlaneWave } from './waves';

/* ------------------------------------------------------------------ Gauss for E */

export interface GaussReading {
  /** ∮E·dA, summed over the sphere [N·m²/C] */
  flux: number;
  /** the enclosed charge [C] */
  enclosed: number;
  /** Q_in/ε₀ [N·m²/C] */
  rhs: number;
  /** a charge lies (almost) on the sphere: neither side is meaningful there */
  onSurface: boolean;
}

/** Both sides of Gauss's law for a sphere of radius R centred at `center` (in the page, z = 0). */
export function sphereGauss(charges: readonly PointCharge3[], center: Vec3, R: number, samples = 6000): GaussReading {
  let enclosed = 0;
  let onSurface = false;
  for (const c of charges) {
    const d = Math.hypot(c.pos[0] - center[0], c.pos[1] - center[1], c.pos[2] - center[2]);
    if (Math.abs(d - R) < 0.04 * R) onSurface = true;
    if (d < R) enclosed += c.q;
  }
  const flux = R > 0 ? fluxThroughSphere(charges, center, R, samples) : 0;
  return { flux, enclosed, rhs: enclosed / EPS0, onSurface };
}

/* ------------------------------------------------------------------ Gauss for B */

export interface CubeFlux {
  /** flux leaving through the faces where B points out [T·m²], ≥ 0 */
  out: number;
  /** flux entering through the faces where B points in [T·m²], ≥ 0 */
  in: number;
  /** out − in [T·m²] */
  net: number;
}

/**
 * Flux of a field with no z component out of a cube of side a centred at (cx, cy) in the page: the
 * front and back faces carry none, and each of the four other faces carries a times the line integral
 * of B·n̂ along its edge. Outgoing and incoming parts are summed separately, point by point.
 */
export function cubeFlux(F: Field2, cx: number, cy: number, a: number, n = 600): CubeFlux {
  const h = a / 2;
  const dl = a / n;
  let out = 0;
  let inn = 0;
  const add = (bn: number) => {
    if (bn > 0) out += bn;
    else inn -= bn;
  };
  for (let i = 0; i < n; i++) {
    const t = -h + (i + 0.5) * dl;
    add(F(cx + h, cy + t)[0]); // right face, n̂ = +x
    add(-F(cx - h, cy + t)[0]); // left face, n̂ = −x
    add(F(cx + t, cy + h)[1]); // top face, n̂ = +y
    add(-F(cx + t, cy - h)[1]); // bottom face, n̂ = −y
  }
  const w = dl * a; // each sample stands for a strip dl long and a deep
  return { out: out * w, in: inn * w, net: (out - inn) * w };
}

/* ------------------------------------------------------------------ Faraday */

/** Area of the overlap of two discs of radii r1, r2 whose centres are d apart [m²]. */
export function circleOverlapArea(r1: number, r2: number, d: number): number {
  if (r1 <= 0 || r2 <= 0) return 0;
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a1 = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const a2 = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const k = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return a1 + a2 - k;
}

/** A circle as a counter-clockwise polygon of n vertices. */
export function circlePolygon(cx: number, cy: number, r: number, n = 360): Vec2[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as Vec2;
  });
}

export interface FaradayReading {
  /** ∮E·dl counter-clockwise, summed around the path [V] */
  circulation: number;
  /** the magnetic flux through the path's disc, along +z (out of the page) [Wb] */
  flux: number;
  /** −dΦ_B/dt [V] */
  rhs: number;
}

/**
 * Both sides of Faraday's law for a circle of radius r centred at (cx, cy), walked counter-clockwise,
 * around a core of radius R with a uniform B (out of the page) changing at dBdt. B is the field at this
 * instant; it sets the flux but not the induced field.
 */
export function faradayCircle(B: number, dBdt: number, R: number, cx: number, cy: number, r: number, n = 360): FaradayReading {
  const inside = circleOverlapArea(R, r, Math.hypot(cx, cy));
  return {
    circulation: r > 0 ? circulation(inducedE(dBdt, R), circlePolygon(cx, cy, r, n), 8) : 0,
    flux: B * inside,
    rhs: inside === 0 ? 0 : -dBdt * inside,
  };
}

/* ------------------------------------------------------------------ Ampère–Maxwell */

export interface AmpereReading {
  /** the field on the path [T] */
  B: number;
  /** ∮B·dl = 2πr·B, along the wire's current by the right-hand rule [T·m] */
  circulation: number;
  /** current of moving charges through the surface [A] */
  conduction: number;
  /** ε₀·dΦ_E/dt through the surface [A] */
  displacement: number;
  /** μ₀ times the moving-charge current: Ampère's law as in lesson 4.4 [T·m] */
  ampereOld: number;
  /** μ₀(I + ε₀dΦ_E/dt): with Maxwell's term [T·m] */
  ampereMaxwell: number;
}

/**
 * A coaxial circular path of radius r around the wire (`at = 'wire'`) or in the gap of a capacitor
 * with plates of radius a, charging with current I; and a surface on it (`flat` or the `bulge` bag
 * through the gap; in the gap only `flat`, the disc between the plates).
 */
export function ampereReading(at: LoopAt, surface: Surface, r: number, a: number, I: number): AmpereReading {
  const B = at === 'wire' ? straightWireField(I, r) : gapField(I, r, a);
  const s = surfaceCurrents(at, at === 'gap' ? 'flat' : surface, r, a, I);
  return {
    B,
    circulation: 2 * Math.PI * r * B,
    conduction: s.conduction,
    displacement: s.displacement,
    ampereOld: MU0 * s.conduction,
    ampereMaxwell: MU0 * (s.conduction + s.displacement),
  };
}

/** The rate at which the uniform field between plates of area A grows while a current I charges them: I/(ε₀A) [V/(m·s)]. */
export const gapFieldRate = (I: number, A: number): number => I / (EPS0 * A);

/* ------------------------------------------------------------------ the wave and the spectrum */

/** c = 1/√(μ₀ε₀) [m/s]: from the constants alone. */
export const waveSpeed = (): number => speedFromConstants();

/** Wavelength in vacuum, λ = c/f [m]. */
export const vacuumWavelength = (f: number): number => speedFromConstants() / f;

/** Frequency in vacuum for a wavelength, f = c/λ [Hz]. */
export const vacuumFrequency = (lambda: number): number => speedFromConstants() / lambda;

/** The time a wave takes to cross a distance d in vacuum, t = d/c [s]. */
export const travelTime = (d: number): number => d / speedFromConstants();

/** A unit wave (one wavelength per unit length, one period per unit time) for `waveProbe`. */
const UNIT_WAVE: PlaneWave = { E0: 1, f: 1, v: 1 };

/**
 * E and B at a point of a wave travelling toward +x, as fractions of their peaks (E/E₀, B/B₀), at a
 * position x given in wavelengths and a time t given in periods: the true wave of waves.ts, with B in
 * step with E (no lag). Positive E is up the page, positive B out of it (⊙).
 */
export function waveProbe(xInWavelengths: number, tInPeriods: number): { E: number; B: number } {
  const w = waveAt(UNIT_WAVE, xInWavelengths, tInPeriods);
  return { E: w.E / UNIT_WAVE.E0, B: w.B / amplitudeB(UNIT_WAVE) };
}

export type Band = 'radio' | 'microwave' | 'infrared' | 'visible' | 'ultraviolet' | 'xray' | 'gamma';

/**
 * The bands of the electromagnetic spectrum, from long waves to short, each down to its shortest
 * wavelength [m]. The boundaries are the usual approximate ones; nature has no sharp edges here.
 */
export const BANDS: readonly { band: Band; minLambda: number }[] = [
  { band: 'radio', minLambda: 1 },
  { band: 'microwave', minLambda: 1e-3 },
  { band: 'infrared', minLambda: 700e-9 },
  { band: 'visible', minLambda: 400e-9 },
  { band: 'ultraviolet', minLambda: 10e-9 },
  { band: 'xray', minLambda: 1e-11 },
  { band: 'gamma', minLambda: 0 },
];

/** The band a wavelength falls in. */
export function bandOf(lambda: number): Band {
  for (const b of BANDS) if (lambda >= b.minLambda) return b.band;
  return 'gamma';
}

/* ------------------------------------------------------------------ the scenes of figure 5.9 */

/** Gauss for E: two point charges in the page [C, m]. */
export const SCENE_CHARGES: readonly PointCharge3[] = [
  { q: 4e-9, pos: [-0.04, 0, 0] },
  { q: -2e-9, pos: [0.045, 0.01, 0] },
];
/** Faraday: the field in the core at the instant drawn [T] (the core's radius is SOL_R of maxwell.ts). */
export const CORE_B = 0.05;
/** Ampère–Maxwell: the plates' radius [m] and the charging current [A]. */
export const PLATE_A = 0.05;
export const CHARGING_I = 2;
