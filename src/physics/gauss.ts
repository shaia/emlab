/**
 * Gauss's law at lesson level: flux through a flat window, closed surfaces drawn in a 2D
 * figure, and the symmetric results (sphere, plane, plates) derived from a Gaussian surface.
 *
 * MODEL SPECIFICATION
 * - System: static point charges in vacuum; uniform fields for flat windows; ideal infinite
 *   planes and thin spherical shells for the symmetric results.
 * - Dynamics: none (electrostatics).
 * - Boundary: a closed surface is a simple polygon in the figure's plane (2D figures) or a
 *   sphere/cube (3D figure, see electrostatics.ts).
 * - Ignored: edge effects of real plates, polarisation of matter.
 * - Valid when: the closed surface passes through no charge; plates are much larger than
 *   their separation (the `diskAxisField` test shows the limit).
 * - Failure modes: a charge exactly on the polygon is classified arbitrarily; field lines
 *   that stop at a field null can break the crossing count.
 */

import { EPS0 } from './constants';
import type { Vec2, Vec3 } from './vec';
import type { PointCharge, TracedLine } from './electrostatics';
import { gaussFlux } from './electrostatics';

/** Flux of a uniform field E through a flat surface of area A whose normal makes angle θ with E [N·m²/C]. */
export function fluxFlat(E: number, area: number, theta: number): number {
  return E * area * Math.cos(theta);
}

/** Even-odd rule: is (x, y) inside the closed polygon? */
export function pointInPolygon(poly: readonly Vec2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Net charge inside the polygon [C]. */
export function enclosedCharge(charges: readonly PointCharge[], poly: readonly Vec2[]): number {
  return charges.reduce((s, c) => (pointInPolygon(poly, c.x, c.y) ? s + c.q : s), 0);
}

/** Gauss's law applied to a polygon: Φ = q_enclosed / ε₀ [N·m²/C]. */
export function polygonFlux(charges: readonly PointCharge[], poly: readonly Vec2[]): number {
  return gaussFlux(enclosedCharge(charges, poly));
}

/** Signed area (positive when the polygon runs counter-clockwise, y up). */
export function polygonArea(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return a / 2;
}

export interface Crossing {
  x: number;
  y: number;
  /** true when the field line leaves the polygon here, false when it enters */
  outward: boolean;
}

/**
 * Where the traced field lines cross the polygon, with the direction of each crossing.
 * Lines are followed in the field's direction, which is the order of `points` for lines
 * started on positive charges and, for lines started on a negative charge, the reverse.
 * `reversed` flags those, so the caller need not know how the lines were built.
 */
export function lineCrossings(lines: readonly (TracedLine & { reversed?: boolean })[], poly: readonly Vec2[]): Crossing[] {
  const orient = Math.sign(polygonArea(poly)) || 1;
  const out: Crossing[] = [];
  for (const line of lines) {
    const pts = line.reversed ? [...line.points].reverse() : line.points;
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1];
      const [bx, by] = pts[k];
      const rx = bx - ax;
      const ry = by - ay;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [cx, cy] = poly[j];
        const [dx, dy] = poly[i];
        const sx = dx - cx;
        const sy = dy - cy;
        const den = rx * sy - ry * sx;
        if (den === 0) continue;
        const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
        const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
        if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
        // a line crossing edge j→i of a counter-clockwise polygon leaves it when it runs to the edge's right
        out.push({ x: ax + t * rx, y: ay + t * ry, outward: den * orient > 0 });
      }
    }
  }
  return out;
}

/* ------------------------- symmetric results from a Gaussian surface ------------------------- */

/** Charge inside a Gaussian sphere of radius r concentric with a thin shell (radius R, charge Q) [C]. */
export function shellEnclosed(Q: number, R: number, r: number): number {
  return r < R ? 0 : Q;
}

/**
 * Field on a Gaussian sphere of radius r, read off Gauss's law by symmetry:
 * E · 4πr² = q_enclosed / ε₀ [N/C, positive outward].
 */
export function sphereFieldFromGauss(qEnclosed: number, r: number): number {
  return qEnclosed / (EPS0 * 4 * Math.PI * r * r);
}

/** Charge inside a pillbox of face area A straddling a plane of surface density σ [C]. */
export function pillboxEnclosed(sigma: number, faceArea: number): number {
  return sigma * faceArea;
}

/** Field of an infinite plane from a pillbox: E · 2A = σA / ε₀ [N/C]. */
export function planeFieldFromGauss(sigma: number): number {
  return pillboxEnclosed(sigma, 1) / (EPS0 * 2);
}

/**
 * Signed x-component of the field at x of infinite planes perpendicular to x.
 * Each plane at x₀ with density σ contributes sign(x − x₀)·σ/(2ε₀) (away from a positive plane).
 */
export function planesFieldX(planes: readonly { x: number; sigma: number }[], x: number): number {
  return planes.reduce((s, p) => s + Math.sign(x - p.x) * (p.sigma / (2 * EPS0)), 0);
}

/** Field on the axis of a uniformly charged disc (radius R) at height z: σ/(2ε₀)·(1 − z/√(z²+R²)) [N/C]. */
export function diskAxisField(sigma: number, R: number, z: number): number {
  return (sigma / (2 * EPS0)) * (1 - z / Math.hypot(z, R));
}

/* --------------------- rays through a sphere or a cube (3D figure) --------------------- */

export type SurfaceShape = 'sphere' | 'cube';

export interface RayCrossings {
  /** times the ray leaves the closed surface */
  out: number;
  /** times the ray enters it */
  in: number;
}

/**
 * Crossings of the closed surface by the ray `origin + t·dir` (t > 0, |dir| = 1).
 * `size` is the radius of a sphere or the half-side of an axis-aligned cube centred at `center`.
 * A ray from a charge inside leaves once; a ray from a charge outside either misses or enters
 * and leaves once each. That is Gauss's law counted in rays.
 */
export function rayCrossings(shape: SurfaceShape, center: Vec3, size: number, origin: Vec3, dir: Vec3): RayCrossings {
  let tNear: number;
  let tFar: number;
  if (shape === 'sphere') {
    const oc: Vec3 = [origin[0] - center[0], origin[1] - center[1], origin[2] - center[2]];
    const b = oc[0] * dir[0] + oc[1] * dir[1] + oc[2] * dir[2];
    const c = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - size * size;
    const disc = b * b - c;
    if (disc <= 0) return { out: 0, in: 0 };
    const sq = Math.sqrt(disc);
    tNear = -b - sq;
    tFar = -b + sq;
  } else {
    tNear = -Infinity;
    tFar = Infinity;
    for (let k = 0; k < 3; k++) {
      const o = origin[k] - center[k];
      if (Math.abs(dir[k]) < 1e-12) {
        if (Math.abs(o) > size) return { out: 0, in: 0 };
        continue;
      }
      const t1 = (-size - o) / dir[k];
      const t2 = (size - o) / dir[k];
      tNear = Math.max(tNear, Math.min(t1, t2));
      tFar = Math.min(tFar, Math.max(t1, t2));
    }
    if (tNear >= tFar) return { out: 0, in: 0 };
  }
  if (tFar <= 0) return { out: 0, in: 0 };
  return tNear > 0 ? { out: 1, in: 1 } : { out: 1, in: 0 };
}
