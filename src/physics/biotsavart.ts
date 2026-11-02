/**
 * The Biot–Savart law for lesson 6.11: the field of a current element, the field of any thin wire as
 * the sum of its elements (a polyline cut into N pieces, or a circle cut into N arcs), the closed form
 * of a finite straight segment, and the shapes the lesson builds from them: a square loop, a regular
 * polygon, a loop on its axis and a solenoid as a stack of loops. The closed forms that chapter 4
 * already owns (straight wire, loop axis, finite solenoid) live in magnetism.ts; the tests check that
 * the sums here converge to them.
 *
 * MODEL SPECIFICATION
 * - System: steady currents I [A] in thin wires in vacuum, given as polylines (straight segments
 *   between vertices) or circles, in 3D SI coordinates. Figure convention as in magnetism.ts: x to the
 *   right, y up, z out of the page (⊙).
 * - Dynamics: none (magnetostatics). One element I·dl at r′ contributes
 *   dB = (μ₀/4π)·I·dl × (r − r′)/|r − r′|³ at r. A wire's field is the sum of its elements; the
 *   discretised sums put one element at the midpoint of each of N equal pieces (midpoint rule). A
 *   straight segment in closed form: B = μ₀I/(4πs)·(sinθ₂ − sinθ₁), s the perpendicular distance from
 *   the point to the segment's line, θ the signed angle from that perpendicular to each end, direction
 *   dl × r. A circle's elements sit at the midpoints of N equal arcs, each with dl tangent and of
 *   length 2πR/N.
 * - Boundary: B → 0 at infinity; superposition holds exactly.
 * - Ignored: the wire's thickness, magnetic materials (μ = μ₀), induction, radiation. **An open
 *   segment is not a circuit**: a steady current needs a closed path, and the segment formula gives
 *   the share of one straight piece of a circuit whose other pieces are added separately (or are far
 *   away). ∇·B = 0 holds for each segment's field; Ampère's law holds only for the closed circuit.
 * - Valid when: the field point is farther from the wire than its thickness, and, for the sums, farther
 *   than about one piece length: then the midpoint sum converges as O(1/N²). On the axis of a circle
 *   every element contributes the same axial part, and the arc sum is exact for any N ≥ 3.
 * - Failure modes: every field diverges on the wire itself (s → 0); on the line of a segment beyond
 *   its ends the field is exactly zero (dl ∥ r). A point closer to the wire than a piece is dominated
 *   by the nearest element and the sum is wrong there.
 */

import { MU0 } from './constants';
import { loopAxisField } from './magnetism';
import type { Vec3 } from './vec';
import { add3, cross3, dot3, len3, scale3, sub3 } from './vec';

/** μ₀/(4π) [T·m/A], the constant in front of every Biot–Savart sum: 10⁻⁷ with the sheet's μ₀. */
export const BS = MU0 / (4 * Math.PI);

/* ------------------------------------------------------------------ one element */

/**
 * Field at p of one current element I·dl located at `at` [T]: (μ₀/4π)·I·dl × r/r³ with r = p − at.
 * Zero when dl points at p (dl ∥ r).
 */
export function elementField(I: number, dl: Vec3, at: Vec3, p: Vec3): Vec3 {
  const r = sub3(p, at);
  const d = len3(r);
  if (d === 0) return [0, 0, 0];
  return scale3(cross3(dl, r), (BS * I) / (d * d * d));
}

/** Magnitude of one element's field, (μ₀/4π)·I·dl·sinφ/r² [T], φ the angle between dl and r. */
export const elementFieldMagnitude = (I: number, dl: number, r: number, phi: number): number =>
  (BS * Math.abs(I) * dl * Math.abs(Math.sin(phi))) / (r * r);

/* ------------------------------------------------------------------ straight segment, closed form */

/**
 * Magnitude of the field of a straight segment at perpendicular distance s from its line [T]:
 * μ₀I/(4πs)·(sinθ₂ − sinθ₁). x1 < x2 are the signed positions of its ends along the line, measured
 * from the foot of the perpendicular, so sinθ = x/√(s² + x²).
 */
export function segmentFieldAt(I: number, s: number, x1: number, x2: number): number {
  return ((BS * Math.abs(I)) / s) * (x2 / Math.hypot(s, x2) - x1 / Math.hypot(s, x1));
}

/** A segment of length L seen from a point on its perpendicular bisector at distance s [T]. */
export const symmetricSegmentField = (I: number, L: number, s: number): number => segmentFieldAt(I, s, -L / 2, L / 2);

/** The infinite-wire limit of segmentFieldAt seen from opposite one end (a semi-infinite wire), μ₀I/(4πs) [T]. */
export const semiInfiniteWireField = (I: number, s: number): number => (BS * Math.abs(I)) / s;

/**
 * Field vector at p of a straight segment from a to b carrying I from a to b, in closed form [T].
 * Zero on the segment's line (outside the segment); undefined (returned as zero) on the segment.
 */
export function segmentField(I: number, a: Vec3, b: Vec3, p: Vec3): Vec3 {
  const ab = sub3(b, a);
  const L = len3(ab);
  if (L === 0) return [0, 0, 0];
  const u = scale3(ab, 1 / L);
  const ap = sub3(p, a);
  const t = dot3(ap, u); // position of the foot of the perpendicular, measured from a
  const rho = sub3(ap, scale3(u, t)); // from the foot to p
  const s = len3(rho);
  if (s < 1e-12 * L) return [0, 0, 0];
  const mag = segmentFieldAt(I, s, -t, L - t);
  // direction dl × r = u × ρ, normalised; a negative current reverses it
  const dir = scale3(cross3(u, rho), 1 / s);
  return scale3(dir, Math.sign(I) * mag);
}

/* ------------------------------------------------------------------ polylines: elements and sums */

/** One discretised element of a wire: its midpoint and its vector dl (along the current) [m]. */
export interface Element {
  at: Vec3;
  dl: Vec3;
}

/**
 * Cut a polyline into elements: each edge into `perEdge` equal pieces, one element at the midpoint
 * of each piece. `closed` joins the last vertex back to the first.
 */
export function polylineElements(pts: readonly Vec3[], perEdge: number, closed = false): Element[] {
  const out: Element[] = [];
  const n = Math.max(1, Math.round(perEdge));
  const edges = closed ? pts.length : pts.length - 1;
  for (let e = 0; e < edges; e++) {
    const a = pts[e];
    const b = pts[(e + 1) % pts.length];
    const dl = scale3(sub3(b, a), 1 / n);
    for (let k = 0; k < n; k++) out.push({ at: add3(a, scale3(dl, k + 0.5)), dl });
  }
  return out;
}

/**
 * Cut a polyline into `N` elements of (nearly) equal length over its whole length, each edge getting
 * pieces in proportion to its length (at least one). For a figure that shows "N pieces".
 */
export function polylineElementsN(pts: readonly Vec3[], N: number, closed = false): Element[] {
  const edges = closed ? pts.length : pts.length - 1;
  const lens: number[] = [];
  for (let e = 0; e < edges; e++) lens.push(len3(sub3(pts[(e + 1) % pts.length], pts[e])));
  const total = lens.reduce((a, b) => a + b, 0);
  const out: Element[] = [];
  for (let e = 0; e < edges; e++) {
    const n = Math.max(1, Math.round((N * lens[e]) / total));
    out.push(...polylineElements([pts[e], pts[(e + 1) % pts.length]], n));
  }
  return out;
}

/** Field at p of a list of elements carrying I, and each element's own contribution [T]. */
export function elementsField(I: number, els: readonly Element[], p: Vec3): { total: Vec3; parts: Vec3[] } {
  let total: Vec3 = [0, 0, 0];
  const parts = els.map((e) => {
    const d = elementField(I, e.dl, e.at, p);
    total = add3(total, d);
    return d;
  });
  return { total, parts };
}

/** Midpoint-rule Biot–Savart sum for a polyline, `perEdge` pieces per edge [T]. */
export const polylineField = (I: number, pts: readonly Vec3[], p: Vec3, perEdge: number, closed = false): Vec3 =>
  elementsField(I, polylineElements(pts, perEdge, closed), p).total;

/** The same polyline in closed form, as the sum of its exact segments [T]. */
export function polylineFieldExact(I: number, pts: readonly Vec3[], p: Vec3, closed = false): Vec3 {
  let B: Vec3 = [0, 0, 0];
  const edges = closed ? pts.length : pts.length - 1;
  for (let e = 0; e < edges; e++) B = add3(B, segmentField(I, pts[e], pts[(e + 1) % pts.length], p));
  return B;
}

/* ------------------------------------------------------------------ circles */

/**
 * A circle of radius R centred on `centre` in the plane perpendicular to the x axis (the axis of the
 * lesson's side view), cut into N equal arcs. The current runs counterclockwise seen from +x, so the
 * field on the axis points along +x.
 */
export function circleElementsX(R: number, N: number, centre: Vec3 = [0, 0, 0]): Element[] {
  const out: Element[] = [];
  const dphi = (2 * Math.PI) / N;
  for (let k = 0; k < N; k++) {
    const phi = (k + 0.5) * dphi;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    out.push({ at: [centre[0], centre[1] + R * c, centre[2] + R * s], dl: [0, -R * dphi * s, R * dphi * c] });
  }
  return out;
}

/**
 * Vertices of a regular N-gon inscribed in a circle of radius R in the z = 0 plane, centred on the
 * origin, listed counterclockwise seen from +z (so a current along them makes B point along +z at the
 * centre). The first vertex is on the +x axis.
 */
export function regularPolygon(R: number, N: number): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k < N; k++) {
    const phi = (2 * Math.PI * k) / N;
    out.push([R * Math.cos(phi), R * Math.sin(phi), 0]);
  }
  return out;
}

/** Field at the centre of a square loop of side a, 2√2·μ₀I/(πa) [T]: four segments, each seen at ±45°. */
export const squareCenterField = (I: number, a: number): number => (2 * Math.SQRT2 * MU0 * Math.abs(I)) / (Math.PI * a);

/**
 * Field at the centre of a regular N-gon loop inscribed in a circle of radius R [T]:
 * N·μ₀I·tan(π/N)/(2πR). N → ∞ gives the circle's μ₀I/(2R).
 */
export const polygonCenterField = (I: number, R: number, N: number): number =>
  (N * MU0 * Math.abs(I) * Math.tan(Math.PI / N)) / (2 * Math.PI * R);

/** The far field of a loop on its axis, μ₀m/(2πz³) with m = I·πR² [T]: the magnetic dipole. */
export const dipoleAxisField = (m: number, z: number): number => (MU0 * m) / (2 * Math.PI * Math.abs(z) ** 3);

/** Magnetic dipole moment of a flat loop, m = I·A [A·m²]. */
export const loopMoment = (I: number, R: number): number => I * Math.PI * R * R;

/* ------------------------------------------------------------------ solenoid as stacked loops */

/**
 * Axial field at z of `loops` equal loops (radius R, current I each) spread evenly over a length L,
 * centred at z = 0: each loop sits at the middle of its own slice of length L/loops [T]. As loops → ∞
 * at fixed loops·I/L this converges to the continuous winding, finiteSolenoidAxisField.
 */
export function stackedLoopsAxisField(loops: number, L: number, R: number, I: number, z: number): number {
  let B = 0;
  for (let k = 0; k < loops; k++) {
    const zk = -L / 2 + ((k + 0.5) * L) / loops;
    B += loopAxisField(I, R, z - zk);
  }
  return B;
}

/**
 * The fraction of the ideal μ₀nI that a solenoid's axis field reaches at axial position z [-]:
 * (cosα₁ + cosα₂)/2, the angles to the two end rims. 1 deep inside a long solenoid, ½ at an end.
 */
export function solenoidAxisFraction(L: number, R: number, z: number): number {
  const a = L / 2 - z;
  const b = L / 2 + z;
  return (a / Math.hypot(a, R) + b / Math.hypot(b, R)) / 2;
}
