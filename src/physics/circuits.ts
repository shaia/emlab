/**
 * DC circuits: current and its microscopic model, resistance and resistivity, a filament bulb,
 * power, EMF and internal resistance, resistors in series and parallel, the RC circuit, and a
 * nodal solver for any network of them. Chapter 3, lessons 3.1–3.10.
 *
 * MODEL SPECIFICATION
 * - System: lumped elements joined at numbered nodes: resistors (bulbs, rheostats and real meters
 *   are resistors too), ideal wires (closed switches and ideal ammeters are wires), open gaps (open
 *   switches and ideal voltmeters), batteries with an EMF ε and an internal resistance r ≥ 0, and
 *   capacitors.
 * - Dynamics: DC steady state by modified nodal analysis: Kirchhoff's junction rule at every node,
 *   with each element's law (V = IR for a resistor, V₊ − V₋ = ε − Ir for a battery). A capacitor
 *   is an open gap in the steady state; in time, one backward-Euler step replaces it by a
 *   conductance C/Δt in parallel with a current source (first order in Δt). The RC formulas
 *   below are the exact solution of the same circuit, which the solver must converge to.
 * - Boundary: potentials are defined up to a constant in each conducting piece; the solver sets
 *   the lowest-numbered node of each piece to 0 V.
 * - Ignored: the resistance of wires and of closed switches, inductance, the time the field takes
 *   to set up in the wires (light-speed, far below any time a lesson measures), and the temperature
 *   dependence of resistors. Only `filamentBulb` models heating, and the network solver treats a
 *   bulb as a fixed resistance, as Bagrut circuit questions do.
 * - Valid when: currents are steady (or vary slowly next to light-crossing times), and each
 *   element obeys its law: a resistor is ohmic, a battery's ε and r are constant.
 * - Failure modes: an ideal battery (r = 0) whose terminals are joined by ideal wire has no
 *   finite solution, and `solveCircuit` returns { ok: false, reason: 'short' }; a loop of ideal
 *   batteries (or two in parallel) makes the equations singular and returns reason 'conflict'.
 *   In the steady state a node joined to the rest only through capacitors is its own piece, at
 *   0 V: its true potential depends on the history of the charge, which DC analysis cannot know.
 */

import { E_CHARGE } from './constants';

/* ------------------------------------------------------------------ 3.2 current */

/** Current as the rate of flow of charge, I = Δq/Δt [A]. */
export const currentOf = (dq: number, dt: number): number => dq / dt;

/** Free electrons per cubic metre in copper (one per atom) [m⁻³]. */
export const COPPER_N = 8.5e28;

/** Drift speed of the carriers, from I = nqvA [m/s]. */
export const driftSpeed = (I: number, n: number, A: number, q = E_CHARGE): number => I / (n * q * A);

/** Current carried by n carriers per m³ of charge q drifting at v through area A, I = nqvA [A]. */
export const driftCurrent = (n: number, v: number, A: number, q = E_CHARGE): number => n * q * v * A;

/* -------------------------------------------------------- 3.3 resistance, ρL/A */

/** Resistivity at room temperature [Ω·m], the values Israeli textbooks print. */
export const RESISTIVITY = {
  copper: 1.7e-8,
  aluminium: 2.8e-8,
  iron: 1.0e-7,
  constantan: 4.9e-7,
  nichrome: 1.1e-6,
} as const;
export type Material = keyof typeof RESISTIVITY;

/** Resistance of a uniform wire, R = ρL/A [Ω]. */
export const wireResistance = (rho: number, L: number, A: number): number => (rho * L) / A;

/** Cross-section of a round wire of diameter d [m²]. */
export const roundArea = (d: number): number => (Math.PI * d * d) / 4;

/**
 * A tungsten filament bulb rated (P, V): its current at any voltage, from the energy balance of the
 * filament. The resistance grows in proportion to the absolute temperature, R = R₀·T/T₀, and in
 * equilibrium the electrical power equals what the filament radiates, V²/R = σ'(T⁴ − T₀⁴).
 * At the rated voltage it draws exactly P/V; at low voltage it is ohmic with its cold resistance
 * R₀; far above, I grows as V^0.6. A model of the I–V curve's shape for lesson 3.3, not a
 * datasheet: the hot temperature 2800 K is a typical value.
 */
export interface FilamentPoint {
  I: number;
  R: number;
  T: number;
}

const T_ROOM = 300;
const T_HOT = 2800;

export function filamentBulb(V: number, ratedP: number, ratedV: number): FilamentPoint {
  const Rhot = (ratedV * ratedV) / ratedP;
  const R0 = (Rhot * T_ROOM) / T_HOT;
  const sigma = ratedP / (T_HOT ** 4 - T_ROOM ** 4);
  const v2 = V * V;
  // f(T) = V²T₀/(R₀T) − σ'(T⁴ − T₀⁴) falls monotonically from f(T₀) ≥ 0: bisect
  const f = (T: number) => (v2 * T_ROOM) / (R0 * T) - sigma * (T ** 4 - T_ROOM ** 4);
  let lo = T_ROOM;
  let hi = T_HOT;
  while (f(hi) > 0) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const T = 0.5 * (lo + hi);
  const R = (R0 * T) / T_ROOM;
  return { I: V / R, R, T };
}

/* ---------------------------------------------------------------- 3.4 power */

/** Electrical power into an element, P = VI [W]. */
export const powerVI = (V: number, I: number): number => V * I;

/** Power dissipated in a resistor carrying I, P = I²R [W]. */
export const powerIR = (I: number, R: number): number => I * I * R;

/** Power dissipated in a resistor across V, P = V²/R [W]. */
export const powerVR = (V: number, R: number): number => (V * V) / R;

/** Resistance of a device rated P at voltage V, R = V²/P [Ω]. */
export const ratedResistance = (P: number, V: number): number => (V * V) / P;

/** One kilowatt-hour in joules. */
export const KWH = 3.6e6;

/** Efficiency, the useful share of the power taken in, η = P_useful/P_in. */
export const efficiency = (useful: number, input: number): number => useful / input;

/* ------------------------------------------------------ 3.5 series and parallel */

/** Equivalent resistance in series, R = R₁ + R₂ + … [Ω]. */
export const seriesR = (...rs: number[]): number => rs.reduce((a, r) => a + r, 0);

/** Equivalent resistance in parallel, 1/R = 1/R₁ + 1/R₂ + … [Ω]. */
export const parallelR = (...rs: number[]): number => 1 / rs.reduce((a, r) => a + 1 / r, 0);

/* --------------------------------------------- 3.6 EMF and internal resistance */

/** Current from a battery (ε, r) through an external resistance R, I = ε/(R + r) [A]. */
export const loopCurrent = (emf: number, r: number, R: number): number => emf / (R + r);

/** Terminal voltage of a battery delivering I, V = ε − Ir [V]. */
export const terminalVoltage = (emf: number, r: number, I: number): number => emf - I * r;

/* ------------------------------------------------------------------- 3.9 RC */

export interface RCState {
  /** charge on the capacitor [C] */
  q: number;
  /** voltage across the capacitor [V] */
  vC: number;
  /** current in the loop [A] */
  I: number;
}

/** Charging an empty capacitor C through R from a battery ε, t seconds after closing the switch. */
export function rcCharge(t: number, emf: number, R: number, C: number): RCState {
  const x = Math.exp(-t / (R * C));
  const vC = emf * (1 - x);
  return { q: C * vC, vC, I: (emf / R) * x };
}

/** Discharging a capacitor C, charged to V₀, through R: the current runs the other way, here > 0. */
export function rcDischarge(t: number, V0: number, R: number, C: number): RCState {
  const x = Math.exp(-t / (R * C));
  const vC = V0 * x;
  return { q: C * vC, vC, I: vC / R };
}

/**
 * The general RC curve: a capacitor at v0 heading for the voltage it would reach in the end,
 * `target` (ε while charging, 0 while discharging), through R. vC = target + (v0 − target)·e^(−t/RC),
 * and the current into the capacitor's + plate, I = (target − vC)/R, is negative while it discharges.
 * rcCharge is the case v0 = 0, target = ε; rcDischarge is target = 0 (with the current's sign flipped).
 */
export function rcFrom(t: number, target: number, v0: number, R: number, C: number): RCState {
  const vC = target + (v0 - target) * Math.exp(-t / (R * C));
  return { q: C * vC, vC, I: (target - vC) / R };
}

/* ======================================================== the network solver */

export type Element =
  /** a resistor: bulbs, rheostats and meters with a resistance are resistors too */
  | { kind: 'R'; a: number; b: number; R: number }
  /** an ideal wire: also a closed switch and an ideal ammeter */
  | { kind: 'wire'; a: number; b: number }
  /** no connection: an open switch, an ideal voltmeter */
  | { kind: 'open'; a: number; b: number }
  /** a battery: a is the − terminal, b the + terminal */
  | { kind: 'battery'; a: number; b: number; emf: number; r: number }
  | { kind: 'C'; a: number; b: number; C: number };

export interface Circuit {
  /** node count; elements refer to nodes 0 … nodes − 1 */
  nodes: number;
  elements: Element[];
}

export type Solution =
  | {
      ok: true;
      /** potential of every node [V] */
      V: number[];
      /** current through each element from a to b [A] (a battery: from − to + inside it) */
      I: number[];
    }
  | { ok: false; reason: 'short' | 'conflict'; element?: number };

/** A backward-Euler step for the capacitors: Δt and each capacitor's V_a − V_b at the start. */
export interface Step {
  dt: number;
  /** indexed by element; entries for non-capacitors are ignored */
  vC: number[];
}

function makeSets(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  return { find, join };
}

/** Solve A·x = b in place by Gaussian elimination with partial pivoting; null when singular. */
function gauss(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  let scale = 0;
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
  if (n === 0) return [];
  if (scale === 0) return null;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12 * scale) return null;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

/**
 * Potentials and currents of a network. Ideal wires first merge their nodes into one; the merged
 * network is solved by modified nodal analysis (unknowns: node potentials, and the current of
 * each ideal battery); then the current in each wire follows from the junction rule at its ends.
 * Wires that form a loop share the current equally, the limit of equal small resistances.
 * With `step`, capacitors take one backward-Euler step of Δt instead of being open.
 */
export function solveCircuit(c: Circuit, step?: Step): Solution {
  const { nodes, elements } = c;
  const wires = makeSets(nodes);
  elements.forEach((e) => {
    if (e.kind === 'wire') wires.join(e.a, e.b);
  });
  const sup = Array.from({ length: nodes }, (_, i) => wires.find(i));

  // an ideal battery shorted by wire has no finite current
  for (let k = 0; k < elements.length; k++) {
    const e = elements[k];
    if (e.kind === 'battery' && e.r === 0 && sup[e.a] === sup[e.b]) return { ok: false, reason: 'short', element: k };
  }

  // conducting pieces of the merged network; each gets one reference node at 0 V
  const pieces = makeSets(nodes);
  elements.forEach((e) => {
    if (e.kind === 'R' || e.kind === 'battery' || (e.kind === 'C' && step)) pieces.join(sup[e.a], sup[e.b]);
  });
  const isRef = (s: number) => pieces.find(s) === s;
  const unknown = new Map<number, number>();
  for (let i = 0; i < nodes; i++) if (sup[i] === i && !isRef(i)) unknown.set(i, unknown.size);
  const ideal = elements.flatMap((e, k) => (e.kind === 'battery' && e.r === 0 ? [k] : []));
  const n = unknown.size + ideal.length;
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const rhs = new Array<number>(n).fill(0);
  const row = (node: number) => unknown.get(sup[node]);

  /** a conductance g between a and b, with a source current j pushed from a to b through it */
  const stamp = (a: number, b: number, g: number, j: number) => {
    const ia = row(a);
    const ib = row(b);
    if (ia !== undefined) {
      A[ia][ia] += g;
      if (ib !== undefined) A[ia][ib] -= g;
      rhs[ia] -= j;
    }
    if (ib !== undefined) {
      A[ib][ib] += g;
      if (ia !== undefined) A[ib][ia] -= g;
      rhs[ib] += j;
    }
  };
  elements.forEach((e, k) => {
    if (e.kind === 'R') stamp(e.a, e.b, 1 / e.R, 0);
    else if (e.kind === 'battery' && e.r > 0) stamp(e.a, e.b, 1 / e.r, e.emf / e.r);
    else if (e.kind === 'C' && step) {
      const g = e.C / step.dt;
      // I(a→b) = g·(V_a − V_b) − g·v₀: a conductance, plus a source of g·v₀ pushed from b to a
      stamp(e.a, e.b, g, -g * (step.vC[k] ?? 0));
    }
  });
  ideal.forEach((k, m) => {
    const e = elements[k] as Extract<Element, { kind: 'battery' }>;
    const col = unknown.size + m;
    const ia = row(e.a);
    const ib = row(e.b);
    // the battery's current J flows from a to b inside it: it leaves node a, enters node b
    if (ia !== undefined) A[ia][col] += 1;
    if (ib !== undefined) A[ib][col] -= 1;
    // V_b − V_a = ε
    if (ib !== undefined) A[col][ib] += 1;
    if (ia !== undefined) A[col][ia] -= 1;
    rhs[col] = e.emf;
  });

  const x = gauss(A, rhs);
  if (!x) return { ok: false, reason: 'conflict' };
  const V = Array.from({ length: nodes }, (_, i) => {
    const r = row(i);
    return r === undefined ? 0 : x[r];
  });

  const I = elements.map((e, k) => {
    switch (e.kind) {
      case 'R':
        return (V[e.a] - V[e.b]) / e.R;
      case 'battery':
        return e.r === 0 ? x[unknown.size + ideal.indexOf(k)] : (e.emf - (V[e.b] - V[e.a])) / e.r;
      case 'C':
        return step ? (e.C / step.dt) * (V[e.a] - V[e.b] - (step.vC[k] ?? 0)) : 0;
      default:
        return 0;
    }
  });

  // wire currents: inside each merged node, solve L·ψ = injection with unit conductances
  const inj = new Array<number>(nodes).fill(0);
  elements.forEach((e, k) => {
    if (e.kind === 'wire') return;
    inj[e.a] -= I[k];
    inj[e.b] += I[k];
  });
  const groups = new Map<number, number[]>();
  for (let i = 0; i < nodes; i++) {
    const g = groups.get(sup[i]) ?? [];
    g.push(i);
    groups.set(sup[i], g);
  }
  const wireIdx = elements.flatMap((e, k) => (e.kind === 'wire' && e.a !== e.b ? [k] : []));
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const local = new Map(members.map((m, i) => [m, i]));
    // the first member is the reference (ψ = 0); the others are unknowns
    const m = members.length - 1;
    const L = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    const q = members.slice(1).map((node) => inj[node]);
    for (const k of wireIdx) {
      const e = elements[k];
      if (!local.has(e.a)) continue;
      const ia = local.get(e.a)! - 1;
      const ib = local.get(e.b)! - 1;
      if (ia >= 0) L[ia][ia] += 1;
      if (ib >= 0) L[ib][ib] += 1;
      if (ia >= 0 && ib >= 0) {
        L[ia][ib] -= 1;
        L[ib][ia] -= 1;
      }
    }
    const psi = gauss(L, q);
    if (!psi) continue;
    const at = (node: number) => {
      const i = local.get(node)! - 1;
      return i < 0 ? 0 : psi[i];
    };
    for (const k of wireIdx) {
      const e = elements[k];
      if (local.has(e.a)) I[k] = at(e.a) - at(e.b);
    }
  }
  return { ok: true, V, I };
}

/**
 * Advance a circuit with capacitors by one backward-Euler step of Δt, from the capacitor voltages
 * vC (V_a − V_b, indexed by element). Returns the solution at the end of the step and the new vC.
 */
export function advance(c: Circuit, vC: number[], dt: number): { s: Solution; vC: number[] } {
  const s = solveCircuit(c, { dt, vC });
  if (!s.ok) return { s, vC };
  return { s, vC: c.elements.map((e, k) => (e.kind === 'C' ? s.V[e.a] - s.V[e.b] : 0)) };
}

/** Power absorbed by each element [W]; a battery that delivers energy has a negative value. */
export function elementPowers(c: Circuit, s: Extract<Solution, { ok: true }>): number[] {
  return c.elements.map((e, k) => (s.V[e.a] - s.V[e.b]) * s.I[k]);
}
