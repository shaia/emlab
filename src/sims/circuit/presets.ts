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

export const PRESETS: Record<string, Preset> = { simple, series2, unjoined, ammeters };
