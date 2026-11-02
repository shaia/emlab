/**
 * The language of fields (lesson 6.3): a point in Cartesian, cylindrical and spherical coordinates,
 * the unit vectors of each system, dot and cross products, the separation vector r − r′ that writes
 * Coulomb's law for a source anywhere, and the partial derivative as the limit of a one-direction
 * difference quotient.
 *
 * MODEL SPECIFICATION
 * - System: points and vectors in 3D Euclidean space, SI metres; a point charge q [C] at a source
 *   point r′ in vacuum; a scalar field V(x, y) given as a function.
 * - Dynamics: none. Cylindrical (s, φ, z): s = √(x² + y²), φ = atan2(y, x) ∈ [0, 2π), z = z.
 *   Spherical (r, θ, φ): r = |r|, θ = arccos(z/r) ∈ [0, π] measured from +z, φ as above.
 *   Separation 𝓻 = r − r′, from the source point to the field point; E(r) = kq 𝓻/|𝓻|³,
 *   V(r) = kq/|𝓻|. Partial derivative ∂V/∂x = lim_{h→0} [V(x + h, y) − V(x, y)]/h with y fixed.
 * - Boundary: V → 0 at infinity for the point charge.
 * - Ignored: nothing physical beyond electrostatics.ts (static charges in vacuum).
 * - Valid when: the field point is not the source point (|𝓻| > 0); φ is defined only off the z axis
 *   (s > 0) and θ only away from the origin (r > 0).
 * - Failure modes: on the z axis `toCylindrical` / `toSpherical` return φ = 0 by convention; at the
 *   origin `toSpherical` returns θ = 0. At |𝓻| = 0 the field and potential are returned as zero
 *   (the self-field of a point charge is undefined); callers keep probes away from the source.
 *   A forward difference quotient is O(h) accurate, a central one O(h²): the figure shows the
 *   forward one, because that is the definition.
 */

import { K } from './constants';
import { cross3, dot3, len3, sub3, type Vec3 } from './vec';
import { gradient2, type Scalar2 } from './vectorcalc';

/* -------------------------------------------------------------- coordinates */

export interface Cylindrical {
  /** distance from the z axis [m] */
  s: number;
  /** angle around the z axis from +x, counter-clockwise seen from +z [rad], in [0, 2π) */
  phi: number;
  z: number;
}

export interface Spherical {
  /** distance from the origin [m] */
  r: number;
  /** angle from the +z axis [rad], in [0, π] */
  theta: number;
  /** same φ as in cylindrical coordinates [rad], in [0, 2π) */
  phi: number;
}

const TWO_PI = 2 * Math.PI;
/** φ = atan2(y, x) folded into [0, 2π); 0 on the z axis. */
export function azimuth(x: number, y: number): number {
  if (x === 0 && y === 0) return 0;
  const a = Math.atan2(y, x);
  return a < 0 ? a + TWO_PI : a;
}

export function toCylindrical(p: Vec3): Cylindrical {
  return { s: Math.hypot(p[0], p[1]), phi: azimuth(p[0], p[1]), z: p[2] };
}

export function fromCylindrical(c: Cylindrical): Vec3 {
  return [c.s * Math.cos(c.phi), c.s * Math.sin(c.phi), c.z];
}

export function toSpherical(p: Vec3): Spherical {
  const r = len3(p);
  return {
    r,
    theta: r === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, p[2] / r))),
    phi: azimuth(p[0], p[1]),
  };
}

export function fromSpherical(c: Spherical): Vec3 {
  const st = Math.sin(c.theta);
  return [c.r * st * Math.cos(c.phi), c.r * st * Math.sin(c.phi), c.r * Math.cos(c.theta)];
}

/** Unit vectors of cylindrical coordinates at azimuth φ: ŝ (away from the axis), φ̂ (around it), ẑ. */
export function cylindricalBasis(phi: number): { s: Vec3; phi: Vec3; z: Vec3 } {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return { s: [c, s, 0], phi: [-s, c, 0], z: [0, 0, 1] };
}

/** Unit vectors of spherical coordinates at (θ, φ): r̂ (away from the origin), θ̂ (toward −z), φ̂. */
export function sphericalBasis(theta: number, phi: number): { r: Vec3; theta: Vec3; phi: Vec3 } {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  return {
    r: [st * cp, st * sp, ct],
    theta: [ct * cp, ct * sp, -st],
    phi: [-sp, cp, 0],
  };
}

/* ----------------------------------------------------- dot and cross products */

/** Angle between two non-zero vectors from a·b = |a||b|cos α [rad], in [0, π]. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const m = len3(a) * len3(b);
  if (m === 0) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot3(a, b) / m)));
}

/** The component of a along the direction of b: a·b̂ (signed). */
export function componentAlong(a: Vec3, b: Vec3): number {
  const l = len3(b);
  return l === 0 ? NaN : dot3(a, b) / l;
}

/** Area of the parallelogram spanned by a and b: |a × b|. */
export const parallelogramArea = (a: Vec3, b: Vec3): number => len3(cross3(a, b));

/* --------------------------------------------------------- separation vector */

export interface Separation {
  /** 𝓻 = r − r′, from the source point to the field point [m] */
  vec: Vec3;
  /** |𝓻| [m] */
  dist: number;
  /** 𝓻̂ = 𝓻/|𝓻|; zero when the two points coincide */
  unit: Vec3;
}

export function separation(r: Vec3, rSource: Vec3): Separation {
  const vec = sub3(r, rSource);
  const dist = len3(vec);
  const unit: Vec3 = dist === 0 ? [0, 0, 0] : [vec[0] / dist, vec[1] / dist, vec[2] / dist];
  return { vec, dist, unit };
}

/** Coulomb's law for a source at any point: E(r) = kq 𝓻̂/|𝓻|² = kq 𝓻/|𝓻|³ [N/C]. */
export function coulombField(q: number, rSource: Vec3, r: Vec3): Vec3 {
  const { vec, dist } = separation(r, rSource);
  if (dist === 0) return [0, 0, 0];
  const f = (K * q) / (dist * dist * dist);
  return [f * vec[0], f * vec[1], f * vec[2]];
}

/** Potential of a point charge at r′: V(r) = kq/|r − r′| [V]. */
export function coulombPotential(q: number, rSource: Vec3, r: Vec3): number {
  const { dist } = separation(r, rSource);
  return dist === 0 ? 0 : (K * q) / dist;
}

/* ------------------------------------------------------- partial derivatives */

/**
 * The forward difference quotient of V along one axis, the other coordinate held fixed:
 * [V(x + h, y) − V(x, y)]/h for 'x'. Tends to ∂V/∂x as h → 0, with an error O(h).
 */
export function differenceQuotient(V: Scalar2, x: number, y: number, axis: 'x' | 'y', h: number): number {
  return axis === 'x' ? (V(x + h, y) - V(x, y)) / h : (V(x, y + h) - V(x, y)) / h;
}

/** ∂V/∂x or ∂V/∂y at (x, y), by central differences (vectorcalc.gradient2). */
export function partial(V: Scalar2, x: number, y: number, axis: 'x' | 'y', h = 1e-5): number {
  const g = gradient2(V, x, y, h);
  return axis === 'x' ? g[0] : g[1];
}

/** cross3 re-exported so a figure can import the lesson's whole toolbox from one module. */
export { cross3, dot3 };
