/**
 * Lesson 6.9's own layer on the shared Laplace solver (laplace.ts): the scenes figure 6.9א relaxes,
 * the readouts it shows (the mean of a node's neighbours, where the largest free value sits), and the
 * two-dimensional image solution the grid is compared with: a long line charge in front of a grounded
 * plane. Also the image of a point charge in a grounded sphere, which lesson 2.5's earthed sphere is.
 *
 * MODEL SPECIFICATION
 * - System: the grid of laplace.ts (nx × ny nodes, spacing h), a cross-section of a geometry that does
 *   not change along z. Scenes: a grounded box with its lid held at V0; two plates at ±V0 inside a
 *   grounded box; an empty grounded box; a line charge λ [C/m] at height d above a grounded plane y = 0.
 *   On the grid the line charge is one node with ρ = λ/h², so the cell carries λ per metre of length.
 *   Sphere image: a point charge q at distance D from the centre of a grounded sphere of radius R < D.
 * - Dynamics: none of its own; the grid relaxes with jacobiStep / sorStep. The line-charge solution is
 *   V = 2kλ·ln(r₂/r₁) above the plane (r₁ to the line, r₂ to its image −λ at height −d), which is zero
 *   on the plane; the force per metre on the line is λ·2kλ/(2d) = kλ²/d toward the plane, and the
 *   induced charge per unit area is σ = −λd/(π(x² + d²)), totalling −λ per metre of plane length.
 *   Sphere: the image q′ = −qR/D at R²/D from the centre makes the whole sphere V = 0; the attraction is
 *   kq²RD/(D² − R²)².
 * - Boundary: in the image scene the outer edge of the grid (left, right, top) is held at the exact
 *   line-charge potential and the plane row at 0, so by uniqueness the relaxed grid must reproduce the
 *   image solution; elsewhere every edge is grounded.
 * - Ignored: the third dimension (a grid "charge" is a line, not a point), Neumann boundaries.
 * - Valid when: more than ~3 grid spacings from the line charge (one node cannot hold a 1/r core); the
 *   line charge sits on a node, a whole number of spacings above the plane.
 * - Failure modes: near the source node the grid stays finite while ln(r₂/r₁) diverges; a painted
 *   conductor one node wide is a thin wire on the grid, not a plate.
 */

import { K } from './constants';
import { earthedSphereCharge } from './potential';
import { fix, makeGrid, type Grid } from './laplace';

/* ------------------------------------------------------------ line charge in front of a grounded plane */

/** Potential at (x, y ≥ 0) of a line charge λ at (0, d) above the grounded plane y = 0: 2kλ·ln(r₂/r₁) [V]. */
export function lineImagePotential(lambda: number, d: number, x: number, y: number): number {
  if (y <= 0) return 0;
  const r1 = Math.hypot(x, y - d);
  const r2 = Math.hypot(x, y + d);
  return 2 * K * lambda * Math.log(r2 / r1);
}

/** Field at (x, y ≥ 0) of the line charge and its image −λ at (0, −d) [N/C]. */
export function lineImageField(lambda: number, d: number, x: number, y: number): [number, number] {
  if (y < 0) return [0, 0];
  const r1s = x * x + (y - d) ** 2;
  const r2s = x * x + (y + d) ** 2;
  const a = (2 * K * lambda) / r1s;
  const b = (2 * K * lambda) / r2s;
  return [a * x - b * x, a * (y - d) - b * (y + d)];
}

/** Attraction per metre of length of the line charge toward the plane: λ times its image's field 2kλ/(2d) [N/m]. */
export const lineImageForce = (lambda: number, d: number): number => (K * lambda * lambda) / d;

/** Induced charge per unit area on the plane at distance x from the foot of the line: −λd/(π(x² + d²)) [C/m²]. */
export const lineInducedDensity = (lambda: number, d: number, x: number): number => (-lambda * d) / (Math.PI * (x * x + d * d));

/** Induced charge per metre of length on the strip |x| < X of the plane: −(2/π)·λ·atan(X/d) [C/m]. */
export const lineInducedWithin = (lambda: number, d: number, X: number): number => (-2 / Math.PI) * lambda * Math.atan(X / d);

/* ------------------------------------------------------------ point charge and a grounded sphere */

export interface SphereImage {
  /** image charge [C] */
  q: number;
  /** its distance from the centre, on the line toward the real charge [m] */
  at: number;
}

/** The image of q at distance D from the centre of a grounded sphere of radius R: −qR/D at R²/D (lesson 2.5's charge). */
export const sphereImage = (q: number, D: number, R: number): SphereImage => ({ q: earthedSphereCharge(q, D, R), at: (R * R) / D });

/** Attraction of q toward the grounded sphere: kq²RD/(D² − R²)² [N]. */
export const sphereImageForce = (q: number, D: number, R: number): number => (K * q * q * R * D) / (D * D - R * R) ** 2;

/** Potential of q and its sphere image at a point (x, y), with the centre at the origin and q on the +x axis [V]. */
export function sphereImagePotential(q: number, D: number, R: number, x: number, y: number): number {
  if (Math.hypot(x, y) <= R) return 0;
  const im = sphereImage(q, D, R);
  return K * q / Math.hypot(x - D, y) + K * im.q / Math.hypot(x - im.at, y);
}

/* ------------------------------------------------------------ the figure's scenes */

export type SceneId = 'box' | 'plates' | 'free' | 'image';

export interface Scene {
  grid: Grid;
  /** world coordinates of node (0, 0) [m] */
  x0: number;
  y0: number;
  /** image scene only: the line charge's node, its height and its λ */
  source?: { i: number; j: number; d: number; lambda: number };
  /** image scene only: the row of the grounded plane */
  planeRow?: number;
}

/** Grid size of every scene: 81 × 51 nodes 1 cm apart, 0.8 m × 0.5 m. */
export const SCENE_NX = 81;
export const SCENE_NY = 51;
export const SCENE_H = 0.01;
/** the lid, the plates: ±100 V */
export const SCENE_V0 = 100;
/** image scene: λ = 1 nC/m at d = 12 cm above a plane 14 rows above the bottom edge (room for the image below it) */
export const IMAGE_LAMBDA = 1e-9;
export const IMAGE_D_ROWS = 12;
export const IMAGE_PLANE_ROW = 14;

/** Build a scene with every free node at 0 V (the starting guess). */
export function buildScene(id: SceneId, nx = SCENE_NX, ny = SCENE_NY, h = SCENE_H): Scene {
  const g = makeGrid(nx, ny, h, 0);
  const x0 = -((nx - 1) * h) / 2;
  const y0 = -((ny - 1) * h) / 2;
  if (id === 'box') {
    // the lid, without the two corner nodes, which stay with the grounded walls
    for (let i = 1; i < nx - 1; i++) fix(g, i, ny - 1, SCENE_V0);
    return { grid: g, x0, y0 };
  }
  if (id === 'plates') {
    const len = Math.round(ny * 0.56);
    const j0 = Math.round((ny - len) / 2);
    const gap = Math.round(nx * 0.3);
    const iL = Math.round((nx - 1) / 2 - gap / 2);
    const iR = Math.round((nx - 1) / 2 + gap / 2);
    for (let j = j0; j < j0 + len; j++) {
      fix(g, iL, j, SCENE_V0);
      fix(g, iR, j, -SCENE_V0);
    }
    return { grid: g, x0, y0 };
  }
  if (id === 'free') return { grid: g, x0, y0 };
  // image: the plane is row IMAGE_PLANE_ROW (world y = 0); rows below it are the metal, held at 0
  const planeRow = IMAGE_PLANE_ROW;
  const y0i = -planeRow * h;
  const si = (nx - 1) / 2;
  const sj = planeRow + IMAGE_D_ROWS;
  const d = IMAGE_D_ROWS * h;
  for (let j = 0; j <= planeRow; j++) for (let i = 0; i < nx; i++) fix(g, i, j, 0);
  // the far edges take the exact potential: with the same boundary, the unique solution is the image one
  for (let j = planeRow + 1; j < ny; j++) {
    for (const i of [0, nx - 1]) fix(g, i, j, lineImagePotential(IMAGE_LAMBDA, d, x0 + i * h, y0i + j * h));
  }
  for (let i = 0; i < nx; i++) fix(g, i, ny - 1, lineImagePotential(IMAGE_LAMBDA, d, x0 + i * h, y0i + (ny - 1) * h));
  g.rho = new Float64Array(nx * ny);
  g.rho[sj * nx + si] = IMAGE_LAMBDA / (h * h);
  return { grid: g, x0, y0: y0i, source: { i: si, j: sj, d, lambda: IMAGE_LAMBDA }, planeRow };
}

/* ------------------------------------------------------------ readouts */

/** Mean of the four neighbours of node (i, j) [V]. */
export function neighbourMean(g: Grid, i: number, j: number): number {
  const k = j * g.nx + i;
  return (g.V[k - 1] + g.V[k + 1] + g.V[k - g.nx] + g.V[k + g.nx]) / 4;
}

/** True when node (i, j) has a fixed node among its four neighbours. */
export function touchesFixed(g: Grid, i: number, j: number): boolean {
  const k = j * g.nx + i;
  return !!(g.fixed[k - 1] || g.fixed[k + 1] || g.fixed[k - g.nx] || g.fixed[k + g.nx]);
}

export interface Extreme {
  i: number;
  j: number;
  V: number;
}

/** The largest and smallest potential among the free nodes that carry no charge (where Laplace's equation holds). */
export function freeExtremes(g: Grid): { max: Extreme; min: Extreme } {
  let max: Extreme = { i: -1, j: -1, V: -Infinity };
  let min: Extreme = { i: -1, j: -1, V: Infinity };
  for (let j = 1; j < g.ny - 1; j++) {
    for (let i = 1; i < g.nx - 1; i++) {
      const k = j * g.nx + i;
      if (g.fixed[k] || (g.rho && g.rho[k] !== 0)) continue;
      if (g.V[k] > max.V) max = { i, j, V: g.V[k] };
      if (g.V[k] < min.V) min = { i, j, V: g.V[k] };
    }
  }
  return { max, min };
}

/** Largest |a − b| over the nodes of two grids of one shape [V]. */
export function maxDifference(a: Float64Array, b: Float64Array): number {
  let m = 0;
  for (let k = 0; k < a.length; k++) m = Math.max(m, Math.abs(a[k] - b[k]));
  return m;
}

/**
 * Potential inside a rectangle a × b with three walls at 0 and the wall y = b at V0, from the Fourier
 * series Σ (4V0/(nπ))·sin(nπx/a)·sinh(nπy/a)/sinh(nπb/a) over odd n [V]. The reference the box scene
 * converges to; written with exponentials so large n does not overflow.
 */
export function boxSeries(V0: number, a: number, b: number, x: number, y: number, terms = 401): number {
  let s = 0;
  for (let n = 1; n <= terms; n += 2) {
    const kx = (n * Math.PI) / a;
    // sinh(k y)/sinh(k b) = e^{k(y−b)}·(1 − e^{−2ky})/(1 − e^{−2kb})
    const ratio = (Math.exp(kx * (y - b)) * (1 - Math.exp(-2 * kx * y))) / (1 - Math.exp(-2 * kx * b));
    s += ((4 * V0) / (n * Math.PI)) * Math.sin(kx * x) * ratio;
  }
  return s;
}
