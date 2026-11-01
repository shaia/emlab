/**
 * The potential landscape of lesson 2.3, shared by the 3D view and its 2D fallback: V on a
 * grid over the map, and the height each value is drawn at. The map is a sheet of paper and
 * the height of the paper at a point stands for V there, the way a relief model stands for a
 * topographic map. Height is a drawing device, not a direction in space: the charges, the
 * field and P all lie in the plane of the page.
 *
 * Near a point charge V grows without bound, so the height is clipped at ±V_CLIP: the hill
 * ends in a flat top (a flat floor for a pit) a little above the highest drawn equipotential.
 * Below the clip the height is exactly proportional to V, so equal steps of V are equal steps
 * of height and the equipotentials printed on the sheet are its contour lines.
 */

import { potentialAt, type PointCharge } from '~/physics/electrostatics';
import { contourFromGrid } from '~/physics/potential';
import type { Vec2 } from '~/physics/vec';
import { MAP, V_LEVELS } from '~/sims/potentialPresets';

/** the potential where the drawn height stops growing [V] */
export const V_CLIP = 1.3e5;
/** the height of V_CLIP, in the map's metres */
export const H_CLIP = 0.55;

export const heightOf = (v: number): number => (Math.max(-V_CLIP, Math.min(V_CLIP, v)) / V_CLIP) * H_CLIP;

/** V at a point; on a charge itself ±∞ (potentialAt skips a charge at zero distance). */
export function vAt(charges: readonly PointCharge[], x: number, y: number): number {
  for (const c of charges) if (Math.hypot(x - c.x, y - c.y) < 1e-9) return c.q > 0 ? Infinity : -Infinity;
  return potentialAt(charges, x, y);
}

/** V on (nx + 1) × (ny + 1) nodes over the map: vals[j][i], row j is y, column i is x. */
export function landscapeGrid(charges: readonly PointCharge[], nx: number, ny: number): number[][] {
  const dx = (MAP.xmax - MAP.xmin) / nx;
  const dy = (MAP.ymax - MAP.ymin) / ny;
  const vals: number[][] = [];
  for (let j = 0; j <= ny; j++) {
    const row: number[] = [];
    for (let i = 0; i <= nx; i++) row.push(vAt(charges, MAP.xmin + i * dx, MAP.ymin + j * dy));
    vals.push(row);
  }
  return vals;
}

export interface Contour {
  v: number;
  segs: [Vec2, Vec2][];
}

/** The drawn equipotentials (the same levels as the potential map), with V = 0 only where it exists. */
export function landscapeContours(charges: readonly PointCharge[], vals: readonly (readonly number[])[]): Contour[] {
  // a small core around each charge is skipped, as on the map: there the lines would crowd into a blot
  const ny = vals.length - 1;
  const nx = vals[0].length - 1;
  const finite = vals.map((row, j) =>
    row.map((v, i) => {
      const x = MAP.xmin + (i * (MAP.xmax - MAP.xmin)) / nx;
      const y = MAP.ymin + (j * (MAP.ymax - MAP.ymin)) / ny;
      return charges.some((c) => Math.hypot(x - c.x, y - c.y) < 0.045) ? Number.NaN : v;
    }),
  );
  const hasZero = charges.some((c) => c.q > 0) && charges.some((c) => c.q < 0);
  return V_LEVELS.filter((v) => v !== 0 || hasZero).map((v) => ({ v, segs: contourFromGrid(finite, MAP, v) }));
}
