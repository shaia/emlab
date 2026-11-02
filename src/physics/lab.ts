/**
 * Lab data and straight-line fits: the graphing toolbox of lesson 0.4, reused by every lab lesson.
 *
 * MODEL SPECIFICATION
 * - System: n measurements of a law. The controlled variable is set exactly; the measured one is
 *   read with a small random relative scatter, the same on every load (a seeded generator). A
 *   compass angle is read with an absolute scatter in degrees, then rounded to the whole degree.
 * - Dynamics: none.
 * - Boundary: none.
 * - Ignored: uncertainty in the controlled variable; systematic errors (a zero offset, a
 *   miscalibrated meter), so a law through the origin stays through the origin up to scatter.
 * - Valid when: the scatter is a few percent and random. The "best line" is the least-squares
 *   line of y on x, which is what a student's ruler line approximates.
 * - Failure modes: fewer than two distinct x values leaves the slope undefined (NaN).
 */

import { plateCapacitance } from './capacitors';
import { G } from './constants';
import { terminalVoltage } from './circuits';
import { coulombForce } from './electrostatics';
import { compassDeflection, EARTH_B_HORIZONTAL, straightWireField } from './magnetism';

/** A reproducible uniform generator on [0, 1) (mulberry32): the same seed, the same table. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Readings of `law` at each x, each off by a uniform relative error of at most `scatter`. */
export function measure(law: (x: number) => number, xs: readonly number[], scatter: number, seed: number): number[] {
  const rnd = seededRandom(seed);
  return xs.map((x) => law(x) * (1 + scatter * (2 * rnd() - 1)));
}

export interface Line {
  slope: number;
  intercept: number;
}

/** Least-squares line y = slope·x + intercept. */
export function fitLine(xs: readonly number[], ys: readonly number[]): Line {
  const n = xs.length;
  const mx = xs.reduce((a, x) => a + x, 0) / n;
  const my = ys.reduce((a, y) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/** Least-squares slope of a line forced through the origin, y = slope·x. */
export function fitThroughOrigin(xs: readonly number[], ys: readonly number[]): number {
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += xs[i] * ys[i];
    sxx += xs[i] * xs[i];
  }
  return sxy / sxx;
}

/* ------------------------------------------------------------------ laws */

/** Distance fallen from rest after time t, d = ½gt² [m]. */
export const fallDistance = (t: number) => 0.5 * G * t * t;

/** Time to fall a distance d from rest, t = √(2d/g) [s]. */
export const fallTime = (d: number) => Math.sqrt((2 * d) / G);

/** Length of a spring of natural length L0 [m] and constant k [N/m] under a load F [N] (Hooke). */
export const springLength = (F: number, L0: number, k: number) => L0 + F / k;

/* --------------------------------------------------------- linearization */

/** What goes on the horizontal axis: the measured x, or a function of it. */
export type Transform = 'x' | 'x2' | 'sqrt' | 'inv' | 'inv2';

export const TRANSFORMS: Record<Transform, (x: number) => number> = {
  x: (x) => x,
  x2: (x) => x * x,
  sqrt: (x) => Math.sqrt(x),
  inv: (x) => 1 / x,
  inv2: (x) => 1 / (x * x),
};

/* -------------------------------------------------------------- datasets */

export interface Dataset {
  /** horizontal-axis quantity, as measured */
  x: number[];
  /** vertical-axis quantity */
  y: number[];
  /** the transform of x that makes the law a straight line */
  linear: Transform;
  /** slope and intercept of the true law after that transform */
  law: Line;
}

/** to the millimetre (or millisecond): 3 decimals */
const mm = (v: number) => Number(v.toFixed(3));
const sig3 = (v: number) => Number(v.toPrecision(3));

/** Spring: hang 0…5 N, read the length to the millimetre. L0 = 12 cm, k = 50 N/m. */
function spring(): Dataset {
  const L0 = 0.12;
  const k = 50;
  const F = [0, 1, 2, 3, 4, 5];
  const L = measure((f) => springLength(f, L0, k), F, 0.008, 7).map(mm);
  return { x: F, y: L, linear: 'x', law: { slope: 1 / k, intercept: L0 } };
}

/** Free fall: drop from set heights, time the fall with a photogate (to the millisecond). */
function fall(): Dataset {
  // a wide range of heights, so that d against t is visibly curved
  const d = [0.1, 0.4, 0.7, 1.0, 1.3, 1.6];
  const t = measure(fallTime, d, 0.012, 11).map(mm);
  return { x: t, y: d, linear: 'x2', law: { slope: G / 2, intercept: 0 } };
}

/** Two small balls of 50 nC each at set distances: the force read to 3 significant figures. */
export const COULOMB_Q = 50e-9;
function coulomb(): Dataset {
  // 2…12 cm: wide enough that F against 1/r is visibly curved, not only F against r
  const r = [0.02, 0.03, 0.04, 0.06, 0.08, 0.12];
  const F = measure((x) => coulombForce(COULOMB_Q, COULOMB_Q, x), r, 0.025, 5).map(sig3);
  return { x: r, y: F, linear: 'inv2', law: { slope: coulombForce(COULOMB_Q, COULOMB_Q, 1), intercept: 0 } };
}

/** The plate capacitor of lesson 2.9: plates of 400 cm² (0.04 m²) in air. */
export const CAP_AREA = 0.04;
export const CAP_GAP = 1e-3;

/** Capacitor: charge it to set voltages, read the charge (a charge meter, 3 significant figures). */
function capacitorQV(): Dataset {
  const C = plateCapacitance(CAP_AREA, CAP_GAP);
  const V = [50, 100, 150, 200, 250, 300];
  const Q = measure((v) => C * v, V, 0.02, 13).map(sig3);
  return { x: V, y: Q, linear: 'x', law: { slope: C, intercept: 0 } };
}

/** Capacitor: move the plates apart step by step, read the capacitance (a capacitance meter). */
function capacitorGap(): Dataset {
  const d = [1e-3, 1.5e-3, 2e-3, 3e-3, 4e-3, 6e-3];
  const C = measure((x) => plateCapacitance(CAP_AREA, x), d, 0.025, 17).map(sig3);
  return { x: d, y: C, linear: 'inv', law: { slope: plateCapacitance(CAP_AREA, 1), intercept: 0 } };
}

/** The battery of lesson 3.10: a worn 4.5 V battery with an internal resistance of 1.5 Ω. */
export const BATTERY_EMF = 4.5;
export const BATTERY_R = 1.5;

/**
 * Battery: a rheostat sets the current, an ammeter and a voltmeter read I and the terminal voltage
 * (both to 3 significant figures). The line V = ε − Ir meets the V axis at ε and falls by r.
 */
function batteryVI(): Dataset {
  const I = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2];
  const V = measure((i) => terminalVoltage(BATTERY_EMF, BATTERY_R, i), I, 0.01, 23).map(sig3);
  return { x: I, y: V, linear: 'x', law: { slope: -BATTERY_R, intercept: BATTERY_EMF } };
}

/** The compass of lesson 4.10: a north–south wire 3 cm above the needle, in the Earth's horizontal field. */
export const COMPASS_R = 0.03;
export const COMPASS_CURRENTS = [1, 2, 3, 4, 5, 6];

/**
 * Compass readings under a north–south wire at height r: the needle's deflection from north, read
 * on the dial to the whole degree, each off by a uniform error of at most `scatterDeg` before the
 * rounding [degrees].
 */
export function compassReadings(currents: readonly number[], r: number, BE: number, scatterDeg: number, seed: number): number[] {
  const rnd = seededRandom(seed);
  return currents.map((I) => Math.round((compassDeflection(straightWireField(I, r), BE) * 180) / Math.PI + scatterDeg * (2 * rnd() - 1)));
}

/** tan of an angle given in degrees, to 3 significant figures (as a student's table writes it). */
export const tanDeg = (deg: number) => sig3(Math.tan((deg * Math.PI) / 180));

/**
 * Earth's field: a power supply sets the current in a north–south wire above a compass, and the
 * deflection is read to the degree. tanθ = μ₀I/(2πr·B_E), a line through the origin in I.
 */
function earthField(): Dataset {
  const I = [...COMPASS_CURRENTS];
  const y = compassReadings(I, COMPASS_R, EARTH_B_HORIZONTAL, 1, 8).map(tanDeg);
  return { x: I, y, linear: 'x', law: { slope: straightWireField(1, COMPASS_R) / EARTH_B_HORIZONTAL, intercept: 0 } };
}

export type DatasetId = 'spring' | 'fall' | 'coulomb' | 'capacitor-qv' | 'capacitor-gap' | 'battery-vi' | 'earth-field';
export const DATASETS: Record<DatasetId, Dataset> = {
  spring: spring(),
  fall: fall(),
  coulomb: coulomb(),
  'capacitor-qv': capacitorQV(),
  'capacitor-gap': capacitorGap(),
  'battery-vi': batteryVI(),
  'earth-field': earthField(),
};
