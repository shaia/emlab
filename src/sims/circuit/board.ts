/**
 * The circuit board behind CircuitLab: a grid of points, and parts that each sit on one edge
 * between two neighbouring points. The grid points are the circuit's nodes, so a board turns
 * straight into a src/physics/circuits.ts network. Pure data and geometry, no DOM.
 */

import { solveCircuit, type Circuit, type Element, type Solution } from '~/physics/circuits';

export type PartKind = 'wire' | 'resistor' | 'bulb' | 'rheostat' | 'battery' | 'switch' | 'ammeter' | 'voltmeter' | 'capacitor';

export type Pt = readonly [number, number];

export interface Part {
  /** stable id, also the label drawn beside it: 'L1' is drawn L₁ */
  id: string;
  kind: PartKind;
  /** grid points (column, row), neighbours; row 0 is the top. A battery's + terminal is `to`. */
  from: Pt;
  to: Pt;
  /** resistance [Ω]: resistor, bulb, rheostat; a meter's own resistance (absent = ideal) */
  R?: number;
  /** battery */
  emf?: number;
  r?: number;
  /** switch */
  closed?: boolean;
  /** capacitor [F] */
  C?: number;
  /** cannot be erased or moved in the builder */
  locked?: boolean;
}

export interface Board {
  cols: number;
  rows: number;
  parts: Part[];
}

export const nodeOf = (b: Board, p: Pt): number => p[1] * b.cols + p[0];
export const ptOf = (b: Board, n: number): Pt => [n % b.cols, Math.floor(n / b.cols)];

/** Same edge, either way round. */
export const sameEdge = (a: Part | { from: Pt; to: Pt }, from: Pt, to: Pt) =>
  (a.from[0] === from[0] && a.from[1] === from[1] && a.to[0] === to[0] && a.to[1] === to[1]) ||
  (a.from[0] === to[0] && a.from[1] === to[1] && a.to[0] === from[0] && a.to[1] === from[1]);

export const isEdge = (b: Board, from: Pt, to: Pt) =>
  from[0] >= 0 && from[1] >= 0 && to[0] >= 0 && to[1] >= 0 &&
  from[0] < b.cols && to[0] < b.cols && from[1] < b.rows && to[1] < b.rows &&
  Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]) === 1;

/** The physics element a part stands for. Meters without a resistance are ideal. */
export function elementOf(b: Board, p: Part): Element {
  const a = nodeOf(b, p.from);
  const c = nodeOf(b, p.to);
  switch (p.kind) {
    case 'wire':
      return { kind: 'wire', a, b: c };
    case 'resistor':
    case 'bulb':
    case 'rheostat':
      return { kind: 'R', a, b: c, R: p.R ?? 6 };
    case 'battery':
      return { kind: 'battery', a, b: c, emf: p.emf ?? 12, r: p.r ?? 0 };
    case 'switch':
      return p.closed ? { kind: 'wire', a, b: c } : { kind: 'open', a, b: c };
    case 'ammeter':
      return p.R ? { kind: 'R', a, b: c, R: p.R } : { kind: 'wire', a, b: c };
    case 'voltmeter':
      return p.R ? { kind: 'R', a, b: c, R: p.R } : { kind: 'open', a, b: c };
    case 'capacitor':
      return { kind: 'C', a, b: c, C: p.C ?? 100e-6 };
  }
}

export const circuitOf = (b: Board): Circuit => ({ nodes: b.cols * b.rows, elements: b.parts.map((p) => elementOf(b, p)) });

export interface Reading {
  /** potential difference V(to) − V(from) [V] */
  V: number;
  /** current from `from` to `to` [A] */
  I: number;
  /** power absorbed [W] (a delivering battery: negative) */
  P: number;
}

export type BoardSolution =
  | { ok: true; V: number[]; parts: Record<string, Reading> }
  | { ok: false; reason: 'short' | 'conflict'; part?: string };

/** Readings of every part, from one physics solution. */
export function readings(b: Board, s: Solution): BoardSolution {
  if (!s.ok) return { ok: false, reason: s.reason, part: s.element !== undefined ? b.parts[s.element]?.id : undefined };
  const parts: Record<string, Reading> = {};
  b.parts.forEach((p, k) => {
    const V = s.V[nodeOf(b, p.to)] - s.V[nodeOf(b, p.from)];
    const I = s.I[k];
    parts[p.id] = { V, I, P: -V * I };
  });
  return { ok: true, V: s.V, parts };
}

export const solveBoard = (b: Board): BoardSolution => readings(b, solveCircuit(circuitOf(b)));

/** Nodes some part touches: probes snap only to these. */
export function usedPoints(b: Board): Set<number> {
  const s = new Set<number>();
  for (const p of b.parts) {
    s.add(nodeOf(b, p.from));
    s.add(nodeOf(b, p.to));
  }
  return s;
}

/** Points a loop walks through, corner to corner along grid lines, as unit steps. */
export function expandLoop(corners: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < corners.length; i++) {
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[(i + 1) % corners.length];
    const n = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    for (let k = 0; k < n; k++) out.push([x0 + dx * k, y0 + dy * k]);
  }
  return out;
}

const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };

/** 'L12' → 'L₁₂'; 'eps' → 'ε'; 'eps2' → 'ε₂' */
export function labelOf(id: string): string {
  const m = id.match(/^([A-Za-z]+)(\d*)$/);
  if (!m) return id;
  const head = m[1] === 'eps' ? 'ε' : m[1];
  return head + m[2].split('').map((d) => SUB[d] ?? d).join('');
}

const PREFIX: Record<PartKind, string> = {
  wire: 'w',
  resistor: 'R',
  bulb: 'L',
  rheostat: 'Rv',
  battery: 'eps',
  switch: 'S',
  ammeter: 'A',
  voltmeter: 'V',
  capacitor: 'C',
};

/** A fresh id for a new part of this kind: the lowest free number. */
export function nextId(b: Board, kind: PartKind): string {
  const pre = PREFIX[kind];
  const used = new Set(b.parts.map((p) => p.id));
  for (let i = 1; ; i++) if (!used.has(`${pre}${i}`)) return `${pre}${i}`;
}

/** Default values of a part placed in the builder. */
export function newPart(b: Board, kind: PartKind, from: Pt, to: Pt): Part {
  const id = nextId(b, kind);
  const base: Part = { id, kind, from, to };
  if (kind === 'resistor') base.R = 4;
  if (kind === 'bulb') base.R = 6;
  if (kind === 'rheostat') base.R = 10;
  if (kind === 'battery') Object.assign(base, { emf: 12, r: 0 });
  if (kind === 'switch') base.closed = false;
  if (kind === 'capacitor') base.C = 100e-6;
  return base;
}

/** Place (or replace) a part on an edge; returns a new board. Locked parts stay. */
export function place(b: Board, kind: PartKind | 'erase', from: Pt, to: Pt): Board {
  const old = b.parts.find((p) => sameEdge(p, from, to));
  if (old?.locked) return b;
  if (kind !== 'erase' && old?.kind === kind) return b;
  const rest = b.parts.filter((p) => p !== old);
  if (kind === 'erase') return { ...b, parts: rest };
  const nb = { ...b, parts: rest };
  return { ...b, parts: [...rest, newPart(nb, kind, from, to)] };
}
