/**
 * The charge arrangements and readout wording shared by the figures of lessons 2.2–2.3: the
 * potential map (PotentialMap) and the potential landscape (figures3d/PotentialLandscape).
 * Both read the same charges, so a landscape and a map of the same preset show the same field.
 */

import { K } from '~/physics/constants';
import type { PointCharge } from '~/physics/electrostatics';
import { pointPotential, type GridBounds } from '~/physics/potential';
import type { Vec2 } from '~/physics/vec';
import { directionHe, sci } from './core/format';

export const uC = 1e-6;

/** the mapped region [m] */
export const MAP: GridBounds = { xmin: -1, xmax: 1, ymin: -0.575, ymax: 0.575 };

/** equipotentials every 2·10⁴ V up to 1.2·10⁵ V, both signs (and V = 0 where it exists) */
export const V_STEP = 2e4;
export const V_LEVELS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((k) => k * V_STEP);

export type ChargePreset = 'single' | 'single-neg' | 'like' | 'dipole' | 'unequal';

export const CHARGE_PRESETS: Record<ChargePreset, PointCharge[]> = {
  single: [{ x: -0.2, y: 0, q: 2 * uC }],
  'single-neg': [{ x: -0.2, y: 0, q: -2 * uC }],
  like: [
    { x: -0.4, y: 0, q: 2 * uC },
    { x: 0.4, y: 0, q: 2 * uC },
  ],
  dipole: [
    { x: -0.4, y: 0, q: 2 * uC },
    { x: 0.4, y: 0, q: -2 * uC },
  ],
  unequal: [
    { x: -0.4, y: 0, q: 4 * uC },
    { x: 0.4, y: 0, q: -2 * uC },
  ],
};

/** P starts 30 cm from a single charge, and on the bisector of a pair */
export const CHARGE_PROBE_START: Record<ChargePreset, Vec2> = {
  single: [0.1, 0],
  'single-neg': [0.1, 0],
  like: [0, 0.3],
  dipole: [0, 0.3],
  unequal: [0, 0.3],
};

export const PRESET_LABEL: Record<ChargePreset | 'plates', string> = {
  single: 'מטען חיובי',
  'single-neg': 'מטען שלילי',
  like: 'שני מטענים זהים',
  dipole: 'דיפול',
  unequal: 'מטענים שונים',
  plates: 'שני לוחות',
};

export const vWords = (v: number) => (Math.abs(v) < 0.5 ? 'V = 0' : `V = ${sci(v)} V`);
export const eWords = (E: Vec2, unit = 'N/C') => {
  const m = Math.hypot(E[0], E[1]);
  return m < 1 ? 'E = 0' : `E = ${sci(m)} ${unit}, ${directionHe(Math.atan2(E[1], E[0]))}`;
};

/** A reference field and potential to judge "practically zero": those of 2 μC at 30 cm. */
export const E_REF = (K * 2 * uC) / 0.09;
export const V_REF = pointPotential(2 * uC, 0.3);
