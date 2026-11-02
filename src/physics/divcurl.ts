/**
 * The fields and probes of figure DivCurlProbe (lessons 6.7 and 6.8): a small box or a small loop that
 * the learner drags through a field and shrinks, its net flux per volume / circulation per area, and
 * the same probe cut into N×N smaller probes (the divergence theorem and Stokes' theorem).
 *
 * MODEL SPECIFICATION
 * - System: static fields that do not depend on z (the axis out of the page), drawn in the z = 0 plane:
 *   - electric: a uniform field; an infinite line charge λ along z; an infinitely long rod of radius R with
 *     a uniform charge density ρ, or with ρ = ρ₀·s/R (s = distance from the axis);
 *   - magnetic: a thin straight wire along z with current I; a thick wire of radius R with a uniform current
 *     density J, or with J = J₀·s/R; a slab |y| < d carrying a uniform current density J along z.
 *   Each field is the exact solution of Gauss's law (electric) or Ampère's law (magnetic) for that
 *   symmetric source, so the analytic divergence is ρ/ε₀ and the analytic curl is μ₀J.
 * - Dynamics: none.
 * - Boundary: every source is infinitely long along z, so the fields have no z component and no z
 *   dependence. **A box here is a cube of side a**, two of whose faces lie parallel to the page: the field is
 *   parallel to those faces, so they carry no flux, and the net flux is a·(the flux through the square's edge
 *   per metre of depth, `squareFlux`). Φ/V = squareFlux/a², and the in-plane divergence (`divergence2`) is the
 *   full ∇·E, because ∂Ez/∂z = 0. This is what makes the 2D picture honest; the 2D slice of 3D point charges
 *   is not (vectorcalc.ts header).
 * - Ignored: the sources' ends; the fields of the probe itself; anything time dependent.
 * - Valid when: the probe does not straddle a line source or a thin wire (there the box or loop encloses a
 *   finite charge or current in zero volume or area, the ratio grows like 1/a², and no derivative exists).
 * - Failure modes: a probe whose edge passes within a sample spacing of a line source or thin wire gives a
 *   noisy midpoint sum. `enclosesSingularity` reports when the probe contains one.
 */

import { EPS0, MU0 } from './constants';
import type { Vec2 } from './vec';
import { curl2, divergence2, lineSource2, squareCirculation, squareFlux, type Field2 } from './vectorcalc';

export type FieldId = 'uniform' | 'line' | 'rod' | 'graded' | 'wire' | 'thick' | 'gradedWire' | 'slab';

export interface TeachingField {
  id: FieldId;
  /** 'E' fields are electric (N/C), 'B' fields magnetic (T) */
  kind: 'E' | 'B';
  F: Field2;
  /** the source density that the analytic divergence (ρ, electric) or curl (J, magnetic) is made of, at (x, y) */
  density: (x: number, y: number) => number;
  /** a line source / thin wire sits here, if any */
  singular?: Vec2;
  /** the radius of the rod or thick wire, or the half-thickness of the slab, for drawing */
  size?: number;
}

/* ---------------------------------------------------------- the sources (SI) */

export const UNIFORM_E = 2000; // N/C
export const LINE_LAMBDA = 1e-8; // C/m
export const ROD_R = 0.05; // m
export const ROD_RHO = 1e-6; // C/m³
export const GRADED_RHO0 = 1.5e-6; // C/m³ at the rod's surface
export const WIRE_I = 5; // A
export const THICK_I = 10; // A
export const SLAB_J = 1e4; // A/m²
export const SLAB_D = 0.03; // m, half-thickness

/** Field of a long rod of radius R with uniform ρ: ρs/(2ε₀) inside, ρR²/(2ε₀s) outside, radially. */
export function rodField(rho: number, R: number): Field2 {
  return (x, y) => {
    const s2 = x * x + y * y;
    if (s2 === 0) return [0, 0];
    const k = s2 < R * R ? rho / (2 * EPS0) : (rho * R * R) / (2 * EPS0 * s2);
    return [k * x, k * y];
  };
}

/**
 * Field of a long rod with ρ = ρ₀·s/R: λ_in(s) = 2πρ₀s³/(3R) inside, so E = ρ₀s²/(3ε₀R) inside and
 * ρ₀R²/(3ε₀s) outside (λ_total = 2πρ₀R²/3), radially.
 */
export function gradedRodField(rho0: number, R: number): Field2 {
  return (x, y) => {
    const s2 = x * x + y * y;
    if (s2 === 0) return [0, 0];
    const s = Math.sqrt(s2);
    const E = s < R ? (rho0 * s2) / (3 * EPS0 * R) : (rho0 * R * R) / (3 * EPS0 * s);
    return [(E * x) / s, (E * y) / s];
  };
}

/** B of a thin straight wire along z (current +z, out of the page): μ₀I/(2πs), counter-clockwise. */
export function wireB(I: number): Field2 {
  return (x, y) => {
    const s2 = x * x + y * y;
    if (s2 === 0) return [0, 0];
    const k = (MU0 * I) / (2 * Math.PI * s2);
    return [-k * y, k * x];
  };
}

/** B of a thick wire of radius R with uniform J = I/(πR²): μ₀Is/(2πR²) inside, μ₀I/(2πs) outside. */
export function thickWireB(I: number, R: number): Field2 {
  return (x, y) => {
    const s2 = x * x + y * y;
    if (s2 === 0) return [0, 0];
    const k = s2 < R * R ? (MU0 * I) / (2 * Math.PI * R * R) : (MU0 * I) / (2 * Math.PI * s2);
    return [-k * y, k * x];
  };
}

/** B of a thick wire with J = J₀·s/R: μ₀J₀s²/(3R) inside, μ₀J₀R²/(3s) outside, counter-clockwise. */
export function gradedWireB(J0: number, R: number): Field2 {
  return (x, y) => {
    const s2 = x * x + y * y;
    if (s2 === 0) return [0, 0];
    const s = Math.sqrt(s2);
    const B = s < R ? (MU0 * J0 * s2) / (3 * R) : (MU0 * J0 * R * R) / (3 * s);
    return [(-B * y) / s, (B * x) / s];
  };
}

/**
 * B of a slab |y| < d carrying J along +z (out of the page): Bx = −μ₀Jy inside, ∓μ₀Jd outside (above / below),
 * By = 0. Straight parallel lines everywhere, yet inside the slab the curl is μ₀J: the physical shear field.
 */
export function slabB(J: number, d: number): Field2 {
  return (_x, y) => [-MU0 * J * Math.max(-d, Math.min(d, y)), 0];
}

/** J₀ of the graded wire chosen so that it carries THICK_I in all: I = 2πJ₀R²/3. */
export const GRADED_J0 = (3 * THICK_I) / (2 * Math.PI * ROD_R * ROD_R);

const inside = (x: number, y: number, R: number) => x * x + y * y < R * R;

export const FIELDS: Record<FieldId, TeachingField> = {
  uniform: { id: 'uniform', kind: 'E', F: () => [UNIFORM_E, 0], density: () => 0 },
  line: { id: 'line', kind: 'E', F: lineSource2(LINE_LAMBDA), density: () => 0, singular: [0, 0] },
  rod: { id: 'rod', kind: 'E', F: rodField(ROD_RHO, ROD_R), density: (x, y) => (inside(x, y, ROD_R) ? ROD_RHO : 0), size: ROD_R },
  graded: {
    id: 'graded',
    kind: 'E',
    F: gradedRodField(GRADED_RHO0, ROD_R),
    density: (x, y) => (inside(x, y, ROD_R) ? (GRADED_RHO0 * Math.hypot(x, y)) / ROD_R : 0),
    size: ROD_R,
  },
  wire: { id: 'wire', kind: 'B', F: wireB(WIRE_I), density: () => 0, singular: [0, 0] },
  thick: {
    id: 'thick',
    kind: 'B',
    F: thickWireB(THICK_I, ROD_R),
    density: (x, y) => (inside(x, y, ROD_R) ? THICK_I / (Math.PI * ROD_R * ROD_R) : 0),
    size: ROD_R,
  },
  gradedWire: {
    id: 'gradedWire',
    kind: 'B',
    F: gradedWireB(GRADED_J0, ROD_R),
    density: (x, y) => (inside(x, y, ROD_R) ? (GRADED_J0 * Math.hypot(x, y)) / ROD_R : 0),
    size: ROD_R,
  },
  slab: { id: 'slab', kind: 'B', F: slabB(SLAB_J, SLAB_D), density: (_x, y) => (Math.abs(y) < SLAB_D ? SLAB_J : 0), size: SLAB_D },
};

/** The analytic value the probe's ratio tends to: ρ/ε₀ for an electric field, μ₀J for a magnetic one. */
export const analyticLimit = (f: TeachingField, x: number, y: number, mode: 'box' | 'loop'): number => {
  if (mode === 'box') return f.kind === 'E' ? f.density(x, y) / EPS0 : 0;
  return f.kind === 'B' ? MU0 * f.density(x, y) : 0;
};

/* ---------------------------------------------------------------- the probes */

/** Does the square of side a centred at (cx, cy) contain the field's line source or thin wire? */
export function enclosesSingularity(f: TeachingField, cx: number, cy: number, a: number): boolean {
  if (!f.singular) return false;
  return Math.abs(f.singular[0] - cx) < a / 2 && Math.abs(f.singular[1] - cy) < a / 2;
}

export interface BoxReading {
  /** net outward flux through the cube of side a [N·m²/C] */
  flux: number;
  /** a³ [m³] */
  volume: number;
  /** flux / volume [N/(C·m)] */
  ratio: number;
  /** the derivative at the centre: ∇·E by central differences [N/(C·m)] */
  limit: number;
}

/** The cube of side a centred at (cx, cy): its net flux, volume, ratio, and the divergence it tends to. */
export function boxReading(F: Field2, cx: number, cy: number, a: number, n = 60): BoxReading {
  const flux = a * squareFlux(F, cx, cy, a, n);
  const volume = a * a * a;
  return { flux, volume, ratio: flux / volume, limit: divergence2(F, cx, cy, 1e-6) };
}

export interface LoopReading {
  /** counter-clockwise circulation ∮F·dl around the square loop of side a [V or T·m] */
  circulation: number;
  /** a² [m²] */
  area: number;
  /** circulation / area [V/m² or T/m] */
  ratio: number;
  /** the derivative at the centre: (∇×F)_z by central differences */
  limit: number;
}

/** The square loop of side a centred at (cx, cy): its circulation, area, ratio, and the curl it tends to. */
export function loopReading(F: Field2, cx: number, cy: number, a: number, n = 60): LoopReading {
  const circulation = squareCirculation(F, cx, cy, a, n);
  const area = a * a;
  return { circulation, area, ratio: circulation / area, limit: curl2(F, cx, cy, 1e-6) };
}

export interface SplitReading {
  /**
   * the small probes' fluxes (box) or circulations (loop) in the plane of the page, row by row from the
   * bottom-left: N×N small loops, or the front layer of N×N small cubes
   */
  parts: number[];
  /** the sum over every small probe: Σ parts for loops; N·Σ parts for cubes (N identical layers in depth) */
  sum: number;
  /** the big probe's own flux / circulation, sampled at the same points on its outer edge */
  whole: number;
}

/**
 * Cut the probe of side a into smaller ones of side b = a/N and integrate each: a loop into N×N small loops,
 * a cube into N×N×N small cubes. Every inner edge or face is shared by two neighbours, sampled at the same
 * points with opposite directions (loop) or opposite normals (box), so it cancels in the sum: sum = whole,
 * the discrete Stokes' theorem / divergence theorem. The fields do not depend on z, so the N layers of cubes
 * are identical and the faces between layers carry no flux.
 */
export function splitProbe(F: Field2, cx: number, cy: number, a: number, N: number, mode: 'box' | 'loop', n = 24): SplitReading {
  const b = a / N;
  const parts: number[] = [];
  const one = mode === 'box' ? (x: number, y: number) => b * squareFlux(F, x, y, b, n) : (x: number, y: number) => squareCirculation(F, x, y, b, n);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      parts.push(one(cx - a / 2 + (i + 0.5) * b, cy - a / 2 + (j + 0.5) * b));
    }
  }
  const sum = parts.reduce((s, v) => s + v, 0) * (mode === 'box' ? N : 1);
  const whole = mode === 'box' ? a * squareFlux(F, cx, cy, a, n * N) : squareCirculation(F, cx, cy, a, n * N);
  return { parts, sum, whole };
}

/** The ratio (flux/volume or circulation/area) for probe sizes from aMax down to aMin: the convergence curve. */
export function ratioCurve(F: Field2, cx: number, cy: number, mode: 'box' | 'loop', aMin: number, aMax: number, steps = 40, n = 40): Vec2[] {
  const out: Vec2[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = aMin + ((aMax - aMin) * k) / steps;
    const r = mode === 'box' ? squareFlux(F, cx, cy, a, n) / (a * a) : squareCirculation(F, cx, cy, a, n) / (a * a);
    out.push([a, r]);
  }
  return out;
}

