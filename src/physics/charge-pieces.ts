/**
 * The pieces of lesson 6.4's figure (`ChargeDistribution`): a rod, a ring or a disc cut into N point
 * charges, the field dE that each piece makes at a probe, their vector sum, and the limit models a
 * closed form is checked against (point charge, infinite line, infinite plane).
 *
 * MODEL SPECIFICATION
 * - System: the bodies of `continuous.ts`: a rod of length L and uniform density λ on the x axis,
 *   centred; a ring of radius R and charge Q, or a disc of radius R and density σ, in the z = 0
 *   plane, centred, axis along z. The probe is anywhere in the rod's plane, and on the axis for the
 *   ring and the disc.
 * - Dynamics: none (electrostatics). Each piece is a point charge at the midpoint of an equal piece
 *   (`discretizeRod`, `discretizeRing`, `discretizeDisc`); its field is Coulomb's, through
 *   `fieldAt` / `fieldAt3`, one charge at a time, so the list of contributions sums to exactly what
 *   superposition gives.
 * - Boundary: fields vanish at infinity; nothing else.
 * - Ignored: everything `continuous.ts` ignores (thickness, conductors).
 * - Valid when: the probe is farther from every piece than about one piece length; closer, the
 *   nearest point charge dominates and the sum is not the integral (see `continuous.ts`).
 * - Failure modes: a probe on a piece gets no contribution from it (`fieldAt` skips r = 0), so the
 *   sum is then meaningless; the figure keeps the probe off the body.
 */

import { K } from './constants';
import { discretizeDisc, discretizeRing, discretizeRod, discAxisField, lineField, ringAxisField, rodField } from './continuous';
import { fieldAt, fieldAt3, planeField, type PointCharge, type PointCharge3 } from './electrostatics';
import { len, relativeError, type Vec2, type Vec3 } from './vec';

export interface Pieces2 {
  charges: PointCharge[];
  /** the field of each piece at the probe [N/C], in the order of `charges` */
  dE: Vec2[];
  /** the vector sum of `dE`: the superposition of the N point charges [N/C] */
  sum: Vec2;
}

export interface Pieces3 {
  charges: PointCharge3[];
  dE: Vec3[];
  sum: Vec3;
}

/** A rod (density λ, length L) cut into n pieces, and each piece's field at p. */
export function rodPieces(lambda: number, L: number, n: number, p: Vec2): Pieces2 {
  const charges = discretizeRod(lambda, L, n);
  const dE = charges.map((c) => fieldAt([c], p[0], p[1]));
  return { charges, dE, sum: fieldAt(charges, p[0], p[1]) };
}

/** A ring (charge Q, radius R) cut into n pieces, and each piece's field at height z on the axis. */
export function ringPieces(Q: number, R: number, n: number, z: number): Pieces3 {
  const charges = discretizeRing(Q, R, n);
  const p: Vec3 = [0, 0, z];
  const dE = charges.map((c) => fieldAt3([c], p));
  return { charges, dE, sum: fieldAt3(charges, p) };
}

/**
 * A disc (density σ, radius R) cut into `rings` rings of `perRing` pieces each, and the field of each
 * ring at height z on the axis (one vector per ring, the sum of its pieces).
 */
export function discPieces(sigma: number, R: number, rings: number, perRing: number, z: number): Pieces3 {
  const charges = discretizeDisc(sigma, R, rings, perRing);
  const p: Vec3 = [0, 0, z];
  const dE: Vec3[] = [];
  for (let i = 0; i < rings; i++) dE.push(fieldAt3(charges.slice(i * perRing, (i + 1) * perRing), p));
  return { charges, dE, sum: fieldAt3(charges, p) };
}

/** The piece that mirrors piece i: across the rod's bisector, or across the ring's centre (n even). */
export const rodMirror = (i: number, n: number): number => n - 1 - i;
export const ringOpposite = (i: number, n: number): number => (i + n / 2) % n;

/** How far the N-piece sum is from the closed form, as a fraction (0.01 = 1%). */
export const sumError = (sum: number, exact: number): number => relativeError(sum, exact);

/** The same for vectors: |sum − exact| / |exact|; zero when both vanish (the ring's centre). */
export function vectorError(sum: readonly number[], exact: readonly number[]): number {
  const d = Math.hypot(...sum.map((v, i) => v - exact[i]));
  const e = Math.hypot(...exact);
  if (e === 0) return d < 1e-9 ? 0 : Infinity;
  return d / e;
}

/** The rod's closed form and the two limit models at p: the infinite line (distance |y|) and a point charge λL at the centre. */
export function rodModels(lambda: number, L: number, p: Vec2) {
  const exact = len(rodField(lambda, L, p));
  const r = Math.hypot(p[0], p[1]);
  return {
    exact,
    line: p[1] === 0 ? Infinity : lineField(lambda, Math.abs(p[1])),
    point: (K * lambda * L) / (r * r),
  };
}

/** The ring's closed form on the axis and its far model kQ/z². */
export const ringModels = (Q: number, R: number, z: number) => ({
  exact: ringAxisField(Q, R, z),
  point: z === 0 ? Infinity : (K * Q) / (z * z),
});

/** The disc's closed form on the axis and its two models: the infinite plane σ/(2ε₀) and a point charge σπR². */
export const discModels = (sigma: number, R: number, z: number) => ({
  exact: discAxisField(sigma, R, z),
  plane: planeField(sigma),
  point: z === 0 ? Infinity : (K * sigma * Math.PI * R * R) / (z * z),
});
