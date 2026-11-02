/**
 * Numerical vector calculus for chapter 6 (lessons 6.3, 6.6–6.8): the gradient, divergence, curl and
 * Laplacian by central differences, and their integral definitions — net flux out of a small box per
 * unit volume, circulation around a small loop per unit area — which is how the lessons introduce
 * them. Also the standard teaching fields (shear, vortex, line source) whose div and curl are known.
 *
 * MODEL SPECIFICATION
 * - System: a scalar field V(x, y[, z]) or a vector field F(x, y[, z]) given as a function, in SI
 *   units, smooth near the probe point.
 * - Dynamics: none. ∇V = (∂V/∂x, ∂V/∂y, ∂V/∂z); ∇·F = ∂Fx/∂x + ∂Fy/∂y + ∂Fz/∂z;
 *   (∇×F)_z = ∂Fy/∂x − ∂Fx/∂y; ∇²V = Σ ∂²V/∂xᵢ². Box flux and loop circulation are midpoint sums
 *   over the faces / sides; divided by the volume / area they tend to ∇·F / (∇×F)_z as the box shrinks.
 * - Boundary: none; every operator is local.
 * - Ignored: nothing physical; this is mathematics.
 * - Valid when: the probe's size h (or a) is small compared with the distance over which F changes.
 *   Central differences are O(h²) accurate.
 * - Failure modes: a probe that straddles a singularity (a point charge, a line source, the vortex
 *   core) returns the enclosed delta — that is the point of the box picture, but a derivative there
 *   is meaningless.
 *   **A 2D figure of point charges shows the z = 0 slice of a 3D field (electrostatics.ts).** Its
 *   in-plane divergence ∂Ex/∂x + ∂Ey/∂y is NOT zero in empty space: the missing ∂Ez/∂z carries the
 *   rest. Use `divergence3` / `boxFlux3` for 3D point charges, or 2D fields of line charges
 *   (`lineSource2`), whose in-plane divergence does vanish away from the line.
 */

import { K } from './constants';
import type { Vec2, Vec3 } from './vec';

export type Scalar2 = (x: number, y: number) => number;
export type Field2 = (x: number, y: number) => Vec2;
export type Scalar3 = (p: Vec3) => number;
export type Field3 = (p: Vec3) => Vec3;

/* ---------------------------------------------------- differential operators */

/** ∇V at (x, y) by central differences. */
export function gradient2(V: Scalar2, x: number, y: number, h = 1e-4): Vec2 {
  return [(V(x + h, y) - V(x - h, y)) / (2 * h), (V(x, y + h) - V(x, y - h)) / (2 * h)];
}

/** ∇V at p in 3D by central differences. */
export function gradient3(V: Scalar3, p: Vec3, h = 1e-4): Vec3 {
  const [x, y, z] = p;
  return [
    (V([x + h, y, z]) - V([x - h, y, z])) / (2 * h),
    (V([x, y + h, z]) - V([x, y - h, z])) / (2 * h),
    (V([x, y, z + h]) - V([x, y, z - h])) / (2 * h),
  ];
}

/** In-plane divergence ∂Fx/∂x + ∂Fy/∂y (see the 2D-slice warning in the header). */
export function divergence2(F: Field2, x: number, y: number, h = 1e-4): number {
  return (F(x + h, y)[0] - F(x - h, y)[0] + F(x, y + h)[1] - F(x, y - h)[1]) / (2 * h);
}

/** ∇·F at p in 3D. */
export function divergence3(F: Field3, p: Vec3, h = 1e-4): number {
  const [x, y, z] = p;
  return (
    (F([x + h, y, z])[0] - F([x - h, y, z])[0] + F([x, y + h, z])[1] - F([x, y - h, z])[1] + F([x, y, z + h])[2] - F([x, y, z - h])[2]) /
    (2 * h)
  );
}

/** (∇×F)_z = ∂Fy/∂x − ∂Fx/∂y for a planar field: positive means a counter-clockwise spin (⊙). */
export function curl2(F: Field2, x: number, y: number, h = 1e-4): number {
  return (F(x + h, y)[1] - F(x - h, y)[1] - (F(x, y + h)[0] - F(x, y - h)[0])) / (2 * h);
}

/** ∇×F at p in 3D. */
export function curl3(F: Field3, p: Vec3, h = 1e-4): Vec3 {
  const [x, y, z] = p;
  const d = (i: number, axis: 0 | 1 | 2) => {
    const a: [number, number, number] = [x, y, z];
    const b: [number, number, number] = [x, y, z];
    a[axis] += h;
    b[axis] -= h;
    return (F(a)[i] - F(b)[i]) / (2 * h);
  };
  return [d(2, 1) - d(1, 2), d(0, 2) - d(2, 0), d(1, 0) - d(0, 1)];
}

/** ∇²V at (x, y) by the five-point stencil. */
export function laplacian2(V: Scalar2, x: number, y: number, h = 1e-3): number {
  return (V(x + h, y) + V(x - h, y) + V(x, y + h) + V(x, y - h) - 4 * V(x, y)) / (h * h);
}

/** ∇²V at p in 3D by the seven-point stencil. */
export function laplacian3(V: Scalar3, p: Vec3, h = 1e-3): number {
  const [x, y, z] = p;
  return (
    (V([x + h, y, z]) + V([x - h, y, z]) + V([x, y + h, z]) + V([x, y - h, z]) + V([x, y, z + h]) + V([x, y, z - h]) - 6 * V(p)) / (h * h)
  );
}

/* ------------------------------------------- integral (box and loop) pictures */

/**
 * Net outward flux of a planar field through the edge of a square of side a centred at (cx, cy):
 * ∮ F·n̂ dl, a midpoint sum with n points per side. Divided by a², it tends to divergence2.
 */
export function squareFlux(F: Field2, cx: number, cy: number, a: number, n = 40): number {
  const h = a / 2;
  const dl = a / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const t = -h + (i + 0.5) * dl;
    s += F(cx + h, cy + t)[0] - F(cx - h, cy + t)[0] + F(cx + t, cy + h)[1] - F(cx + t, cy - h)[1];
  }
  return s * dl;
}

/**
 * Counter-clockwise circulation ∮ F·dl around a square of side a centred at (cx, cy), n points per
 * side. Divided by a², it tends to curl2.
 */
export function squareCirculation(F: Field2, cx: number, cy: number, a: number, n = 40): number {
  const h = a / 2;
  const dl = a / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const t = -h + (i + 0.5) * dl;
    // bottom (→), right (↑), top (←), left (↓)
    s += F(cx + t, cy - h)[0] + F(cx + h, cy + t)[1] - F(cx + t, cy + h)[0] - F(cx - h, cy + t)[1];
  }
  return s * dl;
}

/**
 * Net outward flux of a 3D field through a cube of side a centred at c, n×n midpoints per face.
 * Divided by a³, it tends to divergence3; for an electric field it equals Q_in/ε₀ (Gauss).
 */
export function cubeFlux(F: Field3, c: Vec3, a: number, n = 24): number {
  const h = a / 2;
  const d = a / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = -h + (i + 0.5) * d;
      const v = -h + (j + 0.5) * d;
      s += F([c[0] + h, c[1] + u, c[2] + v])[0] - F([c[0] - h, c[1] + u, c[2] + v])[0];
      s += F([c[0] + u, c[1] + h, c[2] + v])[1] - F([c[0] + u, c[1] - h, c[2] + v])[1];
      s += F([c[0] + u, c[1] + v, c[2] + h])[2] - F([c[0] + u, c[1] + v, c[2] - h])[2];
    }
  }
  return s * d * d;
}

/* ------------------------------------------------------------- teaching fields */

/** Shear flow F = (s·y, 0): straight parallel lines, yet curl = −s everywhere ("curl is not circles"). */
export const shearField =
  (s = 1): Field2 =>
  (_x, y) => [s * y, 0];

/** Rigid rotation F = ω(−y, x): circles, curl = 2ω, divergence 0. */
export const rotationField =
  (omega = 1): Field2 =>
  (x, y) => [-omega * y, omega * x];

/** Irrotational vortex F = Γ/(2π)·(−y, x)/r²: circles, yet curl = 0 away from the core. */
export const vortexField =
  (gamma = 1): Field2 =>
  (x, y) => {
    const r2 = x * x + y * y;
    return r2 === 0 ? [0, 0] : [(-gamma * y) / (2 * Math.PI * r2), (gamma * x) / (2 * Math.PI * r2)];
  };

/** Uniform expansion F = (s·x, s·y): divergence 2s everywhere, like a uniform charge density. */
export const expansionField =
  (s = 1): Field2 =>
  (x, y) => [s * x, s * y];

/** Field of an infinite line charge λ through (x0, y0), perpendicular to the page: 2kλ r̂/r [N/C]. */
export const lineSource2 =
  (lambda: number, x0 = 0, y0 = 0): Field2 =>
  (x, y) => {
    const dx = x - x0;
    const dy = y - y0;
    const r2 = dx * dx + dy * dy;
    return r2 === 0 ? [0, 0] : [(2 * K * lambda * dx) / r2, (2 * K * lambda * dy) / r2];
  };
