/**
 * Field lines and null points of straight wires perpendicular to the page, optionally in a uniform
 * field that lies in the page (the Earth's horizontal field, seen from above). Built for lesson 4.2.
 *
 * MODEL SPECIFICATION
 * - System: long straight wires perpendicular to the page at (x, y), each carrying I (I > 0 out of
 *   the page, ⊙; I < 0 into it, ⊗), plus an optional uniform field B₀ = (B₀x, B₀y) in the page.
 *   Coordinates as in magnetism.ts: x right, y up, z out of the page.
 * - Dynamics: magnetostatics in 2D. The in-plane field derives from a flux function (the z component
 *   of the vector potential) A(x, y) through B = (∂A/∂y, −∂A/∂x). For one wire
 *   A = −(μ₀I/2π)·ln r, for the uniform field A = B₀x·y − B₀y·x; A of several sources is the sum.
 *   Field lines are the level curves of A, and equally spaced levels give a line density
 *   proportional to |B|: the drawing obeys "denser lines, stronger field" exactly.
 * - Boundary: A is defined up to a constant (the ln r reference length is 1 m); only differences of
 *   A carry meaning (the flux per metre of wire length between two points).
 * - Ignored: the wire's thickness and the field inside it; the return path of each current (the
 *   wires are infinitely long); magnetic materials.
 * - Valid when: the distances are much larger than the wire's thickness and much smaller than its
 *   length and the distance to its ends.
 * - Failure modes: A → ±∞ on a wire (ln 0); callers keep a core radius around each wire. Two equal
 *   antiparallel currents have no null point (nullPointTwoWires returns null).
 */

import { MU0 } from './constants';
import { wireFieldAt, type Wire } from './magnetism';
import type { Vec2 } from './vec';

/** Flux function A [T·m] of wires perpendicular to the page and a uniform in-plane field B₀. */
export function wireFlux(wires: readonly Wire[], x: number, y: number, B0: Vec2 = [0, 0]): number {
  let a = B0[0] * y - B0[1] * x;
  for (const w of wires) {
    const r2 = (x - w.x) ** 2 + (y - w.y) ** 2;
    a -= ((MU0 * w.I) / (4 * Math.PI)) * Math.log(r2); // −(μ₀I/2π)·ln r
  }
  return a;
}

/** In-plane field [T] of the wires plus the uniform field B₀. */
export function totalFieldAt(wires: readonly Wire[], x: number, y: number, B0: Vec2 = [0, 0]): Vec2 {
  const [bx, by] = wireFieldAt(wires, x, y);
  return [bx + B0[0], by + B0[1]];
}

/** The distance from a wire at which its field equals B: r = μ₀|I|/(2πB) [m]. */
export const wireDistanceForField = (I: number, B: number): number => (MU0 * Math.abs(I)) / (2 * Math.PI * Math.abs(B));

/**
 * The null point of one wire in a uniform in-plane field B₀: the point at r = μ₀|I|/(2πB₀) from the
 * wire where the wire's field is exactly −B₀. With B₀ pointing up the page (north) and I > 0 (⊙,
 * counterclockwise), it lies to the left of the wire (west); with I < 0 to the right.
 */
export function nullPointWireUniform(w: Wire, B0: Vec2): Vec2 | null {
  const B = Math.hypot(B0[0], B0[1]);
  if (B === 0 || w.I === 0) return null;
  const r = wireDistanceForField(w.I, B);
  // the wire's field at offset d is (μ₀I/2πr²)·(−d_y, d_x); it equals −B₀ for
  // d = (r/B)·(−B₀y, B₀x) when I > 0, and for the opposite offset when I < 0
  const s = Math.sign(w.I);
  return [w.x - (s * r * B0[1]) / B, w.y + (s * r * B0[0]) / B];
}

/**
 * The null point of two parallel wires a distance d apart, measured from wire 1 along the line
 * towards wire 2 [m]. Currents in the same direction: between the wires, x = d·|I₁|/(|I₁| + |I₂|).
 * Opposite currents: outside, beyond the weaker wire, x = d·|I₁|/(|I₁| − |I₂|) (negative = on the far
 * side of wire 1). Equal and opposite currents: no null point.
 */
export function nullPointTwoWires(I1: number, I2: number, d: number): number | null {
  const a = Math.abs(I1);
  const b = Math.abs(I2);
  if (a === 0 && b === 0) return null;
  if (I1 * I2 > 0) return (d * a) / (a + b);
  // equal opposite currents, or one wire alone: no null point at a finite distance
  if (a === b || a === 0 || b === 0) return null;
  return (d * a) / (a - b);
}
