/**
 * Laplace's and Poisson's equations for lesson 6.9: a relaxation solver on a square grid (each free
 * node becomes the average of its four neighbours, plus the source term), and the method of images
 * for a point charge in front of a grounded conducting plane.
 *
 * MODEL SPECIFICATION
 * - System: a 2D grid of nx × ny nodes, spacing h [m]. Some nodes are fixed (conductors held at a
 *   given potential, the outer boundary); the rest are free. An optional charge density ρ per node
 *   [C/m³] makes it Poisson's equation ∇²V = −ρ/ε₀. The grid is a cross-section of a geometry that
 *   does not change along z, so it solves the 2D equation (line charges, not point charges).
 *   Images: a point charge q at height d above the grounded plane y = 0 (3D).
 * - Dynamics: Jacobi sweeps V ← mean of neighbours + h²ρ/(4ε₀); Gauss–Seidel with over-relaxation
 *   (SOR, 1 < ω < 2) for speed. Each sweep lowers the residual; the solution is unique once the
 *   boundary is fixed (uniqueness theorem). Image charge: V = kq(1/r₁ − 1/r₂) for y ≥ 0, which is 0 on
 *   the plane; force on q toward the plane kq²/(2d)²; induced σ(x, z) = −qd/(2π(ρ² + d²)^{3/2}).
 * - Boundary: Dirichlet only (every fixed node has a set V). The image solution has V → 0 at infinity.
 * - Ignored: Neumann boundaries, dielectrics, the third dimension of the grid.
 * - Valid when: features are several grid spacings wide; ω < 2 (SOR diverges at ω ≥ 2).
 * - Failure modes: a grid with no fixed node has no unique solution (V drifts); a coarse grid puts a
 *   corner of a conductor in the wrong place; the image formulas hold only for y ≥ 0 (below the plane,
 *   inside the conductor, V = 0 and the image charge is not real).
 */

import { EPS0, K } from './constants';

export interface Grid {
  nx: number;
  ny: number;
  /** spacing [m] */
  h: number;
  /** potentials, row-major: index = j·nx + i [V] */
  V: Float64Array;
  /** 1 where the node is held fixed (conductor or boundary) */
  fixed: Uint8Array;
  /** charge density per node [C/m³]; omitted means Laplace's equation */
  rho?: Float64Array;
}

/** A grid with its outer edge fixed at `edge` volts and every interior node free at 0 V. */
export function makeGrid(nx: number, ny: number, h: number, edge = 0): Grid {
  const V = new Float64Array(nx * ny);
  const fixed = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) {
        fixed[j * nx + i] = 1;
        V[j * nx + i] = edge;
      }
    }
  }
  return { nx, ny, h, V, fixed };
}

/** Hold node (i, j) at potential v. */
export function fix(g: Grid, i: number, j: number, v: number): void {
  g.fixed[j * g.nx + i] = 1;
  g.V[j * g.nx + i] = v;
}

const source = (g: Grid, k: number) => (g.rho ? (g.h * g.h * g.rho[k]) / (4 * EPS0) : 0);

/** One Jacobi sweep (every node from the old values); returns the largest change [V]. */
export function jacobiStep(g: Grid): number {
  const { nx, ny, V, fixed } = g;
  const old = V.slice();
  let maxChange = 0;
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (fixed[k]) continue;
      const v = (old[k - 1] + old[k + 1] + old[k - nx] + old[k + nx]) / 4 + source(g, k);
      maxChange = Math.max(maxChange, Math.abs(v - old[k]));
      V[k] = v;
    }
  }
  return maxChange;
}

/** One Gauss–Seidel sweep with over-relaxation ω (ω = 1 is plain Gauss–Seidel); returns the largest change [V]. */
export function sorStep(g: Grid, omega = 1.8): number {
  const { nx, ny, V, fixed } = g;
  let maxChange = 0;
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (fixed[k]) continue;
      const target = (V[k - 1] + V[k + 1] + V[k - nx] + V[k + nx]) / 4 + source(g, k);
      const dv = omega * (target - V[k]);
      maxChange = Math.max(maxChange, Math.abs(dv));
      V[k] += dv;
    }
  }
  return maxChange;
}

/**
 * The residual: the largest |∇²V + ρ/ε₀| over the free nodes, in units of V/m² — how far the grid is
 * from solving the equation.
 */
export function residual(g: Grid): number {
  const { nx, ny, h, V, fixed } = g;
  let r = 0;
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (fixed[k]) continue;
      const lap = (V[k - 1] + V[k + 1] + V[k - nx] + V[k + nx] - 4 * V[k]) / (h * h);
      r = Math.max(r, Math.abs(lap + (g.rho ? g.rho[k] / EPS0 : 0)));
    }
  }
  return r;
}

/** Relax until the largest change in a sweep falls below `tol` volts; returns the sweeps used. */
export function relax(g: Grid, tol = 1e-6, maxSweeps = 20000, omega = 1.8): number {
  for (let n = 1; n <= maxSweeps; n++) if (sorStep(g, omega) < tol) return n;
  return maxSweeps;
}

/* ------------------------------------------------------------------ images */

/** Potential at (x, y) of charge q at (0, d) above the grounded plane y = 0, for y ≥ 0 (in the page plane) [V]. */
export function imagePotential(q: number, d: number, x: number, y: number): number {
  if (y < 0) return 0;
  return K * q * (1 / Math.hypot(x, y - d) - 1 / Math.hypot(x, y + d));
}

/** Field at (x, y ≥ 0) of the same arrangement: the real charge plus its image −q at (0, −d) [N/C]. */
export function imageField(q: number, d: number, x: number, y: number): [number, number] {
  if (y < 0) return [0, 0];
  const r1 = Math.hypot(x, y - d);
  const r2 = Math.hypot(x, y + d);
  const a = (K * q) / (r1 * r1 * r1);
  const b = (K * q) / (r2 * r2 * r2);
  return [a * x - b * x, a * (y - d) - b * (y + d)];
}

/** Attraction of the charge toward the plane: kq²/(2d)² [N]. */
export const imageForce = (q: number, d: number): number => (K * q * q) / (4 * d * d);

/** Induced surface charge density on the plane at distance s from the foot of the charge: −qd/(2π(s² + d²)^{3/2}) [C/m²]. */
export const inducedDensity = (q: number, d: number, s: number): number => (-q * d) / (2 * Math.PI * Math.pow(s * s + d * d, 1.5));
