/**
 * Magnetic flux pictures for lesson 5.1: how many drawn field lines thread a tilted square loop in a
 * uniform field, the flux of a long straight wire through a coplanar rectangle as a sum over thin
 * strips, signed crossings of field lines with a closed curve, and the flux of a current loop's field
 * through a closed cube (Gauss's law for B).
 *
 * MODEL SPECIFICATION
 * - System: (1) a flat square loop of side s in a uniform field B along +x, its normal n̂ in the
 *   x–y plane at angle θ from B; the field is drawn as a square lattice of lines (spacing d) running
 *   along x, each line standing for a fixed flux Φ_line, so d = √(Φ_line/B). (2) A long straight
 *   wire carrying I and a rectangle of height h in the same plane whose sides parallel to the wire
 *   lie at distances r1 < r2 from it. (3) Field lines as polylines in the page, and a circle in the
 *   page standing for the section of a closed surface. (4) A circular current loop (radius R, current
 *   I, in the plane z = 0) and a cube anywhere that does not touch the wire.
 * - Dynamics: magnetostatics. Φ = B·A·cosθ for a flat loop in a uniform field (`fluxUniform` of
 *   induction.ts). The lines that thread the loop are those whose lattice points fall inside the
 *   loop's projection on a plane perpendicular to B, a rectangle s × s|cosθ|. The wire's field is
 *   B(r) = μ₀I/(2πr), perpendicular to the plane; the flux is the sum over strips of width Δr,
 *   Σ B(rᵢ)·h·Δr (midpoint rule), which tends to μ₀Ih·ln(r2/r1)/(2π) (`wireRectFlux`).
 * - Boundary: the uniform field fills all space; the wire is infinitely long.
 * - Ignored: the wire's thickness, the return path of its current, the loop wire's thickness, any
 *   current in the flux loop itself (no induction in this lesson).
 * - Valid when: the rectangle is much shorter than the wire and does not touch it (r1 > 0).
 * - Failure modes: the line count is an integer and Φ is not: it matches Φ/Φ_line exactly only when
 *   the lattice fits the projection, and to within a row or column otherwise. A polyline that
 *   touches the circle tangentially may count one crossing or none. `cubeLoopFlux` must keep the cube
 *   clear of the loop's wire (the field is singular there).
 */

import { MU0 } from './constants';
import { riemann, riemannPieces, type RiemannPiece } from './calculus';
import { loopField } from './magnetism';
import { cubeFlux } from './vectorcalc';
import type { Vec2, Vec3 } from './vec';

/* ------------------------------------------------------------------ lines through a tilted loop */

/** Spacing of a square lattice of field lines, each standing for lineFlux, in a field B: √(Φ_line/B) [m]. */
export const lineSpacing = (B: number, lineFlux: number): number => Math.sqrt(lineFlux / Math.abs(B));

/**
 * Lattice positions (k + ½)·d, centred on 0, that lie strictly inside |u| < half: the rows (or
 * columns) of lines that pass through a span of half-width `half` [m].
 */
export function latticeInside(d: number, half: number): number[] {
  const out: number[] = [];
  const kmax = Math.ceil(half / d) + 1;
  for (let k = -kmax; k < kmax; k++) {
    const u = (k + 0.5) * d;
    if (Math.abs(u) < half - 1e-12) out.push(u);
  }
  return out;
}

/**
 * Number of drawn lines that thread a square loop of side s whose normal is at θ from a uniform B,
 * each line standing for lineFlux. Signed: negative when the lines cross from the back of the loop
 * (cosθ < 0). Its value times lineFlux approximates Φ = B·s²·cosθ.
 */
export function linesThrough(B: number, s: number, theta: number, lineFlux: number): number {
  const c = Math.cos(theta);
  if (Math.abs(c) < 1e-12) return 0;
  const d = lineSpacing(B, lineFlux);
  const cols = latticeInside(d, s / 2).length;
  const rows = latticeInside(d, (s * Math.abs(c)) / 2).length;
  return Math.sign(c) * Math.sign(B) * rows * cols;
}

/* ------------------------------------------------------------------ wire beside a rectangle */

/** Field of a long straight wire at distance r, signed with the current: μ₀I/(2πr) [T]. */
export const wireB = (I: number, r: number): number => (MU0 * I) / (2 * Math.PI * r);

/**
 * The flux of a wire's field through a coplanar rectangle (height h, sides at r1 < r2) as a sum over
 * n strips parallel to the wire, each with the field at its middle: Σ B(rᵢ)·h·Δr [Wb].
 * n = 1 is "the field at the middle times the area".
 */
export function wireStripSum(I: number, h: number, r1: number, r2: number, n: number): number {
  if (!(r1 > 0 && r2 > r1)) throw new RangeError('wireStripSum needs 0 < r1 < r2');
  return h * riemann((r) => wireB(I, r), r1, r2, n, 'mid');
}

/** The strips of `wireStripSum`: each strip's edges [m] and the field at its middle [T]. */
export function wireStrips(I: number, r1: number, r2: number, n: number): RiemannPiece[] {
  return riemannPieces((r) => wireB(I, r), r1, r2, n, 'mid');
}

/* ------------------------------------------------------------------ closed curves and surfaces */

export interface Crossings {
  /** crossings from inside the circle to outside */
  out: number;
  /** crossings from outside to inside */
  in: number;
}

/**
 * Signed crossings of a polyline (followed in the direction of B) with a circle of centre c and
 * radius r: how many times it leaves the circle and how many times it enters. Each crossing's
 * position is returned too, for drawing.
 */
export function circleCrossings(points: readonly Vec2[], c: Vec2, r: number): Crossings & { at: { p: Vec2; out: boolean }[] } {
  const inside = (p: Vec2) => Math.hypot(p[0] - c[0], p[1] - c[1]) < r;
  const at: { p: Vec2; out: boolean }[] = [];
  let out = 0;
  let inn = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const ia = inside(a);
    const ib = inside(b);
    if (ia === ib) continue;
    // the crossing point on the segment, by bisection on |p − c| = r
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 30; k++) {
      const m = (lo + hi) / 2;
      const p: Vec2 = [a[0] + m * (b[0] - a[0]), a[1] + m * (b[1] - a[1])];
      if (inside(p) === ia) lo = m;
      else hi = m;
    }
    const t = (lo + hi) / 2;
    const p: Vec2 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    if (ia) out++;
    else inn++;
    at.push({ p, out: ia });
  }
  return { out, in: inn, at };
}

/** The 3D field of a circular loop (radius R, current I, in z = 0, centred on the z axis) at p [T]. */
export function loopField3(I: number, R: number, p: Vec3): Vec3 {
  const rho = Math.hypot(p[0], p[1]);
  const f = loopField(I, R, rho, p[2]);
  if (rho < 1e-12) return [0, 0, f.z];
  return [(f.rho * p[0]) / rho, (f.rho * p[1]) / rho, f.z];
}

/**
 * Net outward flux of the loop's field through a cube of side a centred at c, n×n midpoints per face
 * [Wb]. Gauss's law for B: it is zero for every cube that does not touch the wire.
 */
export const cubeLoopFlux = (I: number, R: number, c: Vec3, a: number, n = 40): number =>
  cubeFlux((p) => loopField3(I, R, p), c, a, n);

/** Flux of the loop's field through one flat face of that cube, z = c_z + a/2 (normal +z) [Wb]. */
export function topFaceLoopFlux(I: number, R: number, c: Vec3, a: number, n = 40): number {
  const d = a / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = c[0] - a / 2 + (i + 0.5) * d;
      const y = c[1] - a / 2 + (j + 0.5) * d;
      s += loopField3(I, R, [x, y, c[2] + a / 2])[2];
    }
  }
  return s * d * d;
}
