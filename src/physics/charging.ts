/**
 * MODEL SPECIFICATION: qualitative charging model (lessons 1.1 and 1.2).
 *
 * System: bodies that exchange electrons. A body's state is an integer `n`, the number of
 * ELECTRONS IN EXCESS of neutrality: n > 0 is a surplus of electrons (negative charge),
 * n < 0 is a deficit (positive charge). Protons never move. Net charge Q = −n·e.
 *
 * Dynamics: none in time. Each function maps one configuration to the equilibrium the
 * textbook describes (rubbing, contact, induction with and without a ground, polarisation).
 * The numbers are small integers so a student can count them; they are NOT the real counts
 * (a rubbed rod carries ~10¹⁰ electrons).
 *
 * Boundary: the Earth is an infinite reservoir of electrons at zero charge. A charged rod
 * (an insulator) gives up only part of its charge when it touches a conductor.
 *
 * Ignored: geometry (shape, capacitance), sparks and leakage through air, the dependence on
 * humidity, the real triboelectric series (the order below is a convention taken from the
 * common textbook series), charge density on a real rod.
 *
 * Valid when: the electroscope is far from other conductors and the rod's charge is not
 * large enough to spark. Leaf angles and force arrows are qualitative (monotone in the
 * charge); they are not a measurement.
 *
 * Failure modes: a non-integer electron count (`assertCount` throws); touching a rod that is
 * not at the knob (`touch` does nothing unless prox = 1).
 */

import { E_CHARGE } from './constants';
import { relativeError } from './vec';

/** Net charge of a body with `n` excess electrons [C]. */
export const chargeOfElectrons = (n: number): number => (n === 0 ? 0 : -n * E_CHARGE);

/** Excess-electron count equivalent to charge `q`; not rounded, so a fractional result shows q is not allowed. */
export const electronsOfCharge = (q: number): number => (q === 0 ? 0 : -q / E_CHARGE);

/** The allowed charge nearest to `q` (a whole number of e). */
export const nearestAllowedCharge = (q: number): number => chargeOfElectrons(Math.round(electronsOfCharge(q)));

/**
 * Is `q` a whole multiple of e, within the relative tolerance `tol`? Relative, because charges
 * are ~10⁻¹⁹ C and an absolute tolerance would accept anything.
 */
export function isQuantised(q: number, tol = 1e-6): boolean {
  if (q === 0) return true;
  return relativeError(q, nearestAllowedCharge(q)) <= tol;
}

function assertCount(n: number, what: string) {
  if (!Number.isInteger(n)) throw new Error(`${what}: electron counts are whole numbers, got ${n}`);
}

/** Round half away from zero, so the model treats + and − charge the same way. */
const roundSym = (x: number) => {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
};

/* ------------------------------------------------------------- rubbing */

/**
 * Materials in a (textbook) triboelectric order: when two are rubbed together the one with the
 * higher rank gains electrons and the other loses them. Which one gains is found by experiment,
 * never derived, and the order changes with conditions; the lesson says so.
 */
export const TRIBO_RANK = { glass: 1, wool: 3, silk: 4, pvc: 7 } as const;
export type Material = keyof typeof TRIBO_RANK;

/** Which of two rubbed materials gains electrons: 'a', 'b', or null on equal rank. */
export function electronReceiver(a: Material, b: Material): 'a' | 'b' | null {
  const d = TRIBO_RANK[a] - TRIBO_RANK[b];
  return d > 0 ? 'a' : d < 0 ? 'b' : null;
}

/** Move `k` electrons from body 1 to body 2. The pair's total is unchanged. */
export function transferElectrons(n1: number, n2: number, k: number): [number, number] {
  assertCount(n1, 'transferElectrons');
  assertCount(n2, 'transferElectrons');
  assertCount(k, 'transferElectrons');
  return [n1 - k, n2 + k];
}

/* ------------------------------------------------------ conductors and insulators */

export type BodyKind = 'conductor' | 'insulator';

/**
 * Where the excess electrons end up on a bar of `sites` positions after electrons were deposited
 * at some of them (`deposits[i]` = electrons put on site i).
 *   - insulator: they stay where they were put;
 *   - conductor: they repel and spread out until every site holds the same number, within one
 *     (remainders go to the ends first: charge crowds at the ends of a real rod).
 * The total never changes.
 */
export function distributeCharge(kind: BodyKind, deposits: readonly number[]): number[] {
  deposits.forEach((d) => assertCount(d, 'distributeCharge'));
  if (kind === 'insulator') return [...deposits];
  const S = deposits.length;
  const total = deposits.reduce((a, b) => a + b, 0);
  const sign = total < 0 ? -1 : 1;
  const mag = Math.abs(total);
  const base = Math.floor(mag / S);
  let rest = mag - base * S;
  const out = new Array<number>(S).fill(base);
  // order sites from the ends inward: 0, S-1, 1, S-2, ...
  for (let k = 0; rest > 0; k++, rest--) {
    const i = k % 2 === 0 ? k / 2 : S - 1 - (k - 1) / 2;
    out[i] += 1;
  }
  return out.map((x) => sign * x);
}

/* ------------------------------------------------------------- contact */

/** Fraction of a charged insulating rod's excess that crosses to a conductor in one touch. */
export const CONTACT_FRACTION = 0.5;

/** Two conductors touching: the pair's total is shared in proportion to their sizes. */
export function shareByContact(n1: number, n2: number, size1: number, size2: number): [number, number] {
  assertCount(n1, 'shareByContact');
  assertCount(n2, 'shareByContact');
  const total = n1 + n2;
  const a = roundSym((total * size1) / (size1 + size2));
  return [a, total - a];
}

/* ---------------------------------------------------------- electroscope */

/** Share of an isolated electroscope's excess that sits on its leaves (the rest: knob and stem). */
export const LEAF_SHARE = 0.5;
/** Electrons the rod pushes to the far end of a neutral electroscope per rod electron at prox = 1. */
export const INDUCTION_K = 0.25;
/** Leaf opening at saturation and the leaf excess that reaches it. */
export const LEAF_MAX_DEG = 60;
export const LEAF_SATURATION = 8;

export interface Electroscope {
  /** excess electrons on the electroscope as a whole */
  n: number;
  /** excess electrons on the rod (the rod is an insulator and is never grounded) */
  rodN: number;
  /** how near the rod is, 0 (far away) … 1 (at the knob) */
  prox: number;
  grounded: boolean;
  /** electrons that went to (positive) or came from (negative) the Earth */
  earth: number;
}

export const freshElectroscope = (rodN = 0): Electroscope => ({ n: 0, rodN, prox: 0, grounded: false, earth: 0 });

/** Electrons the rod shifts from the knob to the leaves of the electroscope (sign: toward the leaves). */
export function inducedShift(rodN: number, prox: number): number {
  const p = Math.min(1, Math.max(0, prox));
  return roundSym(INDUCTION_K * p * rodN);
}

/** Excess electrons on the leaves and on the knob end. Their sum is `s.n`. */
export function zones(s: Electroscope): { leaves: number; knob: number } {
  const leaves = roundSym(LEAF_SHARE * s.n) + inducedShift(s.rodN, s.prox);
  return { leaves, knob: s.n - leaves };
}

/** The total a grounded electroscope settles at: the value that leaves nothing on the leaves. */
function groundedTotal(s: Electroscope): number {
  return 0 - roundSym(inducedShift(s.rodN, s.prox) / LEAF_SHARE);
}

/** Apply the Earth connection: the Earth supplies or takes electrons until the leaves hold none. */
function settle(s: Electroscope): Electroscope {
  if (!s.grounded) return s;
  const target = groundedTotal(s);
  return { ...s, n: target, earth: s.earth + (s.n - target) };
}

/** Leaf opening [deg]: grows with the excess ON THE LEAVES and does not depend on its sign. */
export function leafAngleDeg(leavesN: number): number {
  const f = Math.min(1, Math.abs(leavesN) / LEAF_SATURATION);
  return Math.round(LEAF_MAX_DEG * Math.sqrt(f));
}

export type ElectroscopeAction =
  | { type: 'rod'; n: number }
  | { type: 'approach'; prox: number }
  | { type: 'touch' }
  | { type: 'ground'; on: boolean }
  | { type: 'reset' };

/**
 * Apply one action. Everything except `rod` and `reset` conserves
 * n + rodN + earth (the electrons of the whole system, Earth included).
 */
export function step(s: Electroscope, a: ElectroscopeAction): Electroscope {
  switch (a.type) {
    case 'rod':
      assertCount(a.n, 'step(rod)');
      return settle({ ...s, rodN: a.n, prox: 0 });
    case 'approach':
      return settle({ ...s, prox: Math.min(1, Math.max(0, a.prox)) });
    case 'touch': {
      if (s.prox < 1) return s;
      const t = roundSym(CONTACT_FRACTION * s.rodN);
      return settle({ ...s, rodN: s.rodN - t, n: s.n + t });
    }
    case 'ground':
      return settle({ ...s, grounded: a.on });
    case 'reset':
      return freshElectroscope(0);
  }
}

/** Run a list of actions from a starting state. */
export const run = (s: Electroscope, actions: readonly ElectroscopeAction[]): Electroscope =>
  actions.reduce(step, s);

/** Electrons in the whole system; constant under every action except `rod` and `reset`. */
export const systemElectrons = (s: Electroscope): number => s.n + s.rodN + s.earth;

/* ---------------------------------------------------------- polarisation */

/**
 * Shift of the electron cloud of a neutral molecule relative to its nucleus [in units of the
 * largest drawn shift], produced by a point charge `rodN` (excess electrons) at relative
 * distance `r` (1 = reference distance). The shift is linear in the field, E ∝ rodN/r²,
 * and points toward a positive rod, away from a negative one. Positive = toward the rod.
 */
export function polarisationShift(rodN: number, r: number): number {
  if (r <= 0) throw new Error('polarisationShift: distance must be positive');
  return -rodN / (r * r);
}

/**
 * Relative attraction between the charged rod and the neutral polarised body: F ∝ α·E·dE/dr,
 * E ∝ rodN/r², so F ∝ rodN²/r⁵. Always an attraction, whatever the sign of the rod.
 */
export function polarisationAttraction(rodN: number, r: number): number {
  if (r <= 0) throw new Error('polarisationAttraction: distance must be positive');
  return (rodN * rodN) / r ** 5;
}
