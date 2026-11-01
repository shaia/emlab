/**
 * Ready-made boards for CircuitLab, by name. A lesson picks one with `preset`; a text step may
 * switch to another. Coordinates are grid points (column, row), row 0 at the top; a battery's +
 * terminal is its `to` end.
 */

import type { Board, Part, Pt } from './board';

export interface Preset {
  board: Board;
  /** named closed loops, as corner points, for the potential profile under the board */
  loops?: Record<string, Pt[]>;
  /** the point drawn as 0 V (default: the − terminal of the first battery) */
  ground?: Pt;
  /** the power of a fully bright bulb [W]: brightness is P relative to it (default 24 W) */
  pref?: number;
}

const w = (id: string, from: Pt, to: Pt): Part => ({ id, kind: 'wire', from, to, locked: true });
/** a run of locked wires through consecutive points */
const run = (tag: string, ...pts: Pt[]): Part[] => pts.slice(1).map((p, i) => w(`${tag}${i}`, pts[i], p));

/** battery on the left (+ up), switch on top, bulb on the right */
const simple: Preset = {
  board: {
    cols: 4,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'S', kind: 'switch', from: [1, 0], to: [2, 0], closed: false, locked: true },
      ...run('wt', [2, 0], [3, 0], [3, 1]),
      { id: 'L1', kind: 'bulb', from: [3, 1], to: [3, 2], R: 6, locked: true },
      ...run('wb', [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
  loops: { main: [[0, 2], [0, 0], [3, 0], [3, 2]] },
};

/** two identical bulbs one after the other, no switch */
const series2: Preset = {
  board: {
    cols: 4,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'L1', kind: 'bulb', from: [1, 0], to: [2, 0], R: 6, locked: true },
      ...run('wt', [2, 0], [3, 0], [3, 1]),
      { id: 'L2', kind: 'bulb', from: [3, 1], to: [3, 2], R: 6, locked: true },
      ...run('wb', [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
  loops: { main: [[0, 2], [0, 0], [3, 0], [3, 2]] },
};

/** a battery and a bulb that are not yet joined: the learner draws the wires */
const unjoined: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      { id: 'L1', kind: 'bulb', from: [3, 1], to: [3, 2], R: 6, locked: true },
    ],
  },
};

/** an ammeter on each side of a bulb, and a switch: the current is the same in and out (3.2) */
const ammeters: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'A1', kind: 'ammeter', from: [1, 0], to: [2, 0], locked: true },
      { id: 'L1', kind: 'bulb', from: [2, 0], to: [3, 0], R: 6, locked: true },
      { id: 'A2', kind: 'ammeter', from: [3, 0], to: [4, 0], locked: true },
      w('wr', [4, 0], [4, 1]),
      { id: 'S', kind: 'switch', from: [4, 1], to: [4, 2], closed: false, locked: true },
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/** a bulb with an ammeter in line and a voltmeter across it: P = VI (3.4) */
const power: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 6, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'A1', kind: 'ammeter', from: [1, 0], to: [2, 0], locked: true },
      ...run('wt', [2, 0], [3, 0], [4, 0]),
      w('wm', [2, 0], [2, 1]),
      { id: 'L1', kind: 'bulb', from: [2, 1], to: [2, 2], R: 6, locked: true },
      w('wv', [4, 0], [4, 1]),
      { id: 'V1', kind: 'voltmeter', from: [4, 1], to: [4, 2], locked: true },
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
  // the resistance slider reaches 1 Ω at 12 V (144 W): a higher reference keeps the glow growing
  pref: 60,
};

/** two bulbs rated for 12 V, 24 W and 12 W, each straight across the battery (3.4) */
const ratings: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0]),
      { id: 'L1', kind: 'bulb', from: [2, 0], to: [2, 1], R: 6, locked: true },
      w('w1', [2, 1], [2, 2]),
      { id: 'L2', kind: 'bulb', from: [4, 0], to: [4, 1], R: 12, locked: true },
      w('w2', [4, 1], [4, 2]),
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/** two identical bulbs in series, and a switch that bypasses L2 when closed (3.5) */
const seriesPair: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'L1', kind: 'bulb', from: [1, 0], to: [2, 0], R: 6, locked: true },
      w('wm', [2, 0], [3, 0]),
      { id: 'L2', kind: 'bulb', from: [3, 0], to: [4, 0], R: 6, locked: true },
      ...run('wr', [4, 0], [4, 1], [4, 2]),
      w('ws', [3, 0], [3, 1]),
      { id: 'S', kind: 'switch', from: [3, 1], to: [4, 1], closed: false, locked: true },
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/** L1 straight across the battery, and L2 in its own branch behind a switch (3.5) */
const parallelPair: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0]),
      { id: 'L1', kind: 'bulb', from: [2, 0], to: [2, 1], R: 6, locked: true },
      w('w1', [2, 1], [2, 2]),
      { id: 'S', kind: 'switch', from: [4, 0], to: [4, 1], closed: false, locked: true },
      { id: 'L2', kind: 'bulb', from: [4, 1], to: [4, 2], R: 6, locked: true },
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/** L1 in series with L2, and L3 that joins L2 in parallel when the switch closes (3.5) */
const mixed3: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'L1', kind: 'bulb', from: [1, 0], to: [2, 0], R: 6, locked: true },
      ...run('wt', [2, 0], [3, 0], [4, 0]),
      { id: 'L2', kind: 'bulb', from: [2, 0], to: [2, 1], R: 6, locked: true },
      w('w2', [2, 1], [2, 2]),
      { id: 'S', kind: 'switch', from: [4, 0], to: [4, 1], closed: false, locked: true },
      { id: 'L3', kind: 'bulb', from: [4, 1], to: [4, 2], R: 6, locked: true },
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/**
 * A battery with internal resistance r: a voltmeter across its terminals, an ammeter, a load R₁,
 * and a switch that shorts the load (3.6). The loop runs through the battery for the profile.
 */
const emf: Preset = {
  board: {
    cols: 6,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 1, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0], [2, 0]),
      { id: 'V1', kind: 'voltmeter', from: [1, 0], to: [1, 1], locked: true },
      w('wv', [1, 1], [1, 2]),
      { id: 'A1', kind: 'ammeter', from: [2, 0], to: [3, 0], locked: true },
      ...run('wt', [3, 0], [4, 0], [5, 0]),
      { id: 'S', kind: 'switch', from: [3, 0], to: [3, 1], closed: false, locked: true },
      w('ws', [3, 1], [3, 2]),
      { id: 'R1', kind: 'resistor', from: [5, 0], to: [5, 1], R: 5, locked: true },
      w('wr', [5, 1], [5, 2]),
      ...run('wb', [5, 2], [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
  loops: { main: [[0, 2], [0, 0], [5, 0], [5, 2]] },
};

/** real meters, rightly placed: the ammeter (0.1 Ω) in line, the voltmeter (10 kΩ) across the bulb (3.7) */
const metersRight: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'A1', kind: 'ammeter', from: [1, 0], to: [2, 0], R: 0.1, locked: true },
      ...run('wt', [2, 0], [3, 0], [4, 0]),
      w('wm', [2, 0], [2, 1]),
      { id: 'L1', kind: 'bulb', from: [2, 1], to: [2, 2], R: 6, locked: true },
      w('wv', [4, 0], [4, 1]),
      { id: 'V1', kind: 'voltmeter', from: [4, 1], to: [4, 2], R: 1e4, locked: true },
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/** the voltmeter put in line, where the ammeter belongs (3.7) */
const vSeries: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'V1', kind: 'voltmeter', from: [1, 0], to: [2, 0], R: 1e4, locked: true },
      w('wm', [2, 0], [2, 1]),
      { id: 'L1', kind: 'bulb', from: [2, 1], to: [2, 2], R: 6, locked: true },
      ...run('wb', [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/** the ammeter put across the bulb, where the voltmeter belongs: a short through the meter (3.7) */
const aParallel: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0.5, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0]),
      w('wm', [2, 0], [2, 1]),
      { id: 'L1', kind: 'bulb', from: [2, 1], to: [2, 2], R: 6, locked: true },
      w('wa', [4, 0], [4, 1]),
      { id: 'A1', kind: 'ammeter', from: [4, 1], to: [4, 2], R: 0.1, locked: true },
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/** two 10 kΩ resistors on 12 V, and a voltmeter of adjustable resistance across the lower one (3.7) */
const loading: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'R1', kind: 'resistor', from: [1, 0], to: [2, 0], R: 1e4, locked: true },
      ...run('wt', [2, 0], [3, 0], [4, 0]),
      w('wm', [2, 0], [2, 1]),
      { id: 'R2', kind: 'resistor', from: [2, 1], to: [2, 2], R: 1e4, locked: true },
      w('wv', [4, 0], [4, 1]),
      { id: 'V1', kind: 'voltmeter', from: [4, 1], to: [4, 2], R: 1e4, locked: true },
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/** a rheostat in series with a bulb, an ammeter in line and a voltmeter across the bulb (3.7) */
const rheostat: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'Rv', kind: 'rheostat', from: [1, 0], to: [2, 0], R: 6, locked: true },
      ...run('wt', [2, 0], [3, 0], [4, 0]),
      w('wm', [2, 0], [2, 1]),
      { id: 'L1', kind: 'bulb', from: [2, 1], to: [2, 2], R: 6, locked: true },
      w('wv', [4, 0], [4, 1]),
      { id: 'V1', kind: 'voltmeter', from: [4, 1], to: [4, 2], locked: true },
      ...run('wb', [4, 2], [3, 2]),
      w('wb2', [3, 2], [2, 2]),
      { id: 'A1', kind: 'ammeter', from: [2, 2], to: [1, 2], locked: true },
      w('wb3', [1, 2], [0, 2]),
    ],
  },
};

/**
 * Two batteries and two junctions (3.8): ε₁ = 12 V with R₁ = 3 Ω on the left, ε₂ = 3 V with
 * R₂ = 3 Ω on the right, R₃ = 6 Ω across the junctions, an ammeter in each branch. The currents
 * are 2 A, 1 A (into ε₂'s + terminal) and 1 A, as tests/physics/circuits.test.ts pins down.
 */
const kirchhoff: Preset = {
  board: {
    cols: 7,
    rows: 3,
    parts: [
      { id: 'eps1', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      w('wl', [0, 1], [0, 0]),
      w('wt0', [0, 0], [1, 0]),
      { id: 'R1', kind: 'resistor', from: [1, 0], to: [2, 0], R: 3, locked: true },
      ...run('wt1', [2, 0], [3, 0], [4, 0]),
      { id: 'R3', kind: 'resistor', from: [3, 0], to: [3, 1], R: 6, locked: true },
      { id: 'A3', kind: 'ammeter', from: [3, 1], to: [3, 2], locked: true },
      { id: 'R2', kind: 'resistor', from: [4, 0], to: [5, 0], R: 3, locked: true },
      ...run('wt2', [5, 0], [6, 0], [6, 1]),
      { id: 'eps2', kind: 'battery', from: [6, 2], to: [6, 1], emf: 3, r: 0, locked: true },
      w('wb0', [6, 2], [5, 2]),
      { id: 'A2', kind: 'ammeter', from: [5, 2], to: [4, 2], locked: true },
      ...run('wb1', [4, 2], [3, 2], [2, 2]),
      { id: 'A1', kind: 'ammeter', from: [2, 2], to: [1, 2], locked: true },
      w('wb2', [1, 2], [0, 2]),
    ],
  },
  loops: {
    left: [[0, 2], [0, 0], [3, 0], [3, 2]],
    right: [[6, 2], [6, 0], [3, 0], [3, 2]],
    outer: [[0, 2], [0, 0], [6, 0], [6, 2]],
  },
};

/** a capacitor in parallel with R₂, both in series with R₁: the steady state of a DC circuit (3.9) */
const capSteady: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'R1', kind: 'resistor', from: [1, 0], to: [2, 0], R: 4, locked: true },
      ...run('wt', [2, 0], [3, 0], [4, 0]),
      w('wm', [2, 0], [2, 1]),
      { id: 'R2', kind: 'resistor', from: [2, 1], to: [2, 2], R: 8, locked: true },
      w('wc', [4, 0], [4, 1]),
      { id: 'C1', kind: 'capacitor', from: [4, 1], to: [4, 2], C: 100e-6, locked: true },
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/** a capacitor in series with a resistor and a battery, long after the switch closed (3.9) */
const capSeries: Preset = {
  board: {
    cols: 5,
    rows: 3,
    parts: [
      { id: 'eps', kind: 'battery', from: [0, 2], to: [0, 1], emf: 12, r: 0, locked: true },
      ...run('wl', [0, 1], [0, 0], [1, 0]),
      { id: 'R1', kind: 'resistor', from: [1, 0], to: [2, 0], R: 4, locked: true },
      ...run('wt', [2, 0], [3, 0], [4, 0], [4, 1]),
      { id: 'C1', kind: 'capacitor', from: [4, 1], to: [4, 2], C: 100e-6, locked: true },
      ...run('wb', [4, 2], [3, 2], [2, 2], [1, 2], [0, 2]),
    ],
  },
};

/** an empty builder board with a battery (3.5) */
const blank: Preset = {
  board: {
    cols: 6,
    rows: 4,
    parts: [{ id: 'eps', kind: 'battery', from: [0, 3], to: [0, 2], emf: 12, r: 0, locked: true }],
  },
};

export const PRESETS: Record<string, Preset> = {
  simple,
  series2,
  unjoined,
  ammeters,
  power,
  ratings,
  'series-pair': seriesPair,
  'parallel-pair': parallelPair,
  mixed3,
  blank,
  emf,
  meters: metersRight,
  'v-series': vSeries,
  'a-parallel': aParallel,
  loading,
  rheostat,
  kirchhoff,
  'cap-steady': capSteady,
  'cap-series': capSeries,
};
