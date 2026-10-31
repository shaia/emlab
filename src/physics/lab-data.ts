/**
 * Synthetic but physical "lab data" for the chapter review: a torsion-balance run (Coulomb)
 * and a set of oil-drop charges (Millikan), each with a seeded measurement error, plus the
 * least-squares and unit-fitting tools students use on them.
 *
 * MODEL SPECIFICATION
 * - System: F = k·q1·q2/r² for point-like spheres, each force measured with an independent
 *   relative error ε ~ U(−noise, +noise); drop charges q = n·e, with the same kind of error.
 * - Dynamics: none; this module only generates and analyses numbers.
 * - Boundary: a seed makes a run reproducible, so a figure and a test see the same data.
 * - Ignored: induced charges on the spheres, the torsion fibre's own noise, drag corrections.
 * - Valid when: the noise is a few percent (the line fit is meaningful).
 * - Failure modes: fewer than two distinct x values make the fit degenerate (NaN slope).
 */

import { E_CHARGE, K } from './constants';

/** A small deterministic generator (mulberry32): same seed, same sequence, in [0, 1). */
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

export interface CoulombRun {
  q1: number;
  q2: number;
  /** distances [m] */
  r: number[];
  /** measured forces [N] */
  F: number[];
}

export function coulombRun(q1: number, q2: number, r: number[], noise: number, seed: number): CoulombRun {
  const rnd = seededRandom(seed);
  const F = r.map((ri) => ((K * q1 * q2) / (ri * ri)) * (1 + noise * (2 * rnd() - 1)));
  return { q1, q2, r: [...r], F };
}

export interface LineFit {
  slope: number;
  intercept: number;
  /** coefficient of determination, 1 for points exactly on the line */
  r2: number;
}

/** Ordinary least squares, y = slope·x + intercept. */
export function linearFit(x: number[], y: number[]): LineFit {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0) return { slope: NaN, intercept: NaN, r2: NaN };
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

/** The horizontal quantity for a graph of F: r^p, with p = 1 (r), −1 (1/r) or −2 (1/r²). */
export const coulombAxis = (run: CoulombRun, p: number): number[] => run.r.map((ri) => ri ** p);

/** Charges of drops, q = n·e·(1 + ε), for integer counts n. */
export function drops(counts: number[], noise: number, seed: number): number[] {
  const rnd = seededRandom(seed);
  return counts.map((n) => n * E_CHARGE * (1 + noise * (2 * rnd() - 1)));
}

/** RMS distance of the charges from the nearest multiple of `unit`, as a fraction of the unit. */
export function unitMisfit(qs: number[], unit: number): number {
  const s = qs.reduce((acc, q) => {
    const k = q / unit;
    return acc + (k - Math.round(k)) ** 2;
  }, 0);
  return Math.sqrt(s / qs.length);
}

/**
 * Multiples of `unit`, up to the largest charge, that no measured charge sits within `tol`
 * units of. A unit that is too small leaves many empty marks; the right one leaves none.
 */
export function emptyMarks(qs: number[], unit: number, tol = 0.15): number {
  const max = Math.max(...qs);
  let empty = 0;
  for (let k = 1; k * unit <= max + tol * unit; k++) {
    if (!qs.some((q) => Math.abs(q / unit - k) <= tol)) empty++;
  }
  return empty;
}
