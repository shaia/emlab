/**
 * A compass needle near a long straight horizontal wire, in the Earth's field: the measuring
 * method of lesson 4.10 (the tangent method), for a wire laid in any horizontal direction.
 *
 * MODEL SPECIFICATION
 * - System: a long straight horizontal wire carrying a steady current I, a horizontal distance of
 *   zero and a vertical distance r from a compass needle that turns freely in the horizontal plane;
 *   the horizontal component B_E of the Earth's field, pointing to magnetic north. Map coordinates
 *   seen from above: east to the right, north up, vertical up out of the page (toward the viewer).
 *   The wire runs along the azimuth φ (measured from north toward east); I > 0 flows along φ.
 * - Dynamics: none. The needle rests along the horizontal resultant of B_E and the wire's field
 *   B_w = μ₀I/(2πr) (straightWireField). Below the wire B_w points along û × (−ẑ), above it along
 *   û × ẑ (the right-hand grip rule), where û is the current's direction. When the wire runs
 *   north–south the two fields are perpendicular and tanθ = B_w/B_E (compassDeflection).
 * - Boundary: the leads that bring the current are far away; the wire is long compared with r.
 * - Ignored: the vertical component of the Earth's field (the needle only turns horizontally), the
 *   needle's own field and size, friction at the pivot, any iron nearby.
 * - Valid when: r is much larger than the wire's thickness and much smaller than the wire's length.
 * - Failure modes: r = 0 is singular (the field of a wire on its own axis); the resultant can vanish
 *   (wire east–west with B_w = B_E against the Earth's field), and the needle direction is then
 *   undefined: needleDeflection returns NaN.
 */

import { MU0 } from './constants';

export interface CompassWire {
  /** current [A]; positive along the wire's azimuth */
  I: number;
  /** vertical distance from the wire to the needle [m] */
  r: number;
  /** direction of the wire, measured from north toward east [rad] */
  azimuth: number;
  /** horizontal component of the Earth's field [T] */
  BE: number;
  /** the needle is below the wire (default) or above it */
  below?: boolean;
}

/** Signed field of the wire at the needle, μ₀I/(2πr), negative when the current flows against the azimuth [T]. */
export const signedWireField = (I: number, r: number) => (MU0 * I) / (2 * Math.PI * r);

/** The wire's own horizontal field at the needle, as (east, north) components [T]. */
export function wireFieldAtNeedle(s: CompassWire): { east: number; north: number } {
  const B = signedWireField(s.I, s.r);
  const ue = Math.sin(s.azimuth);
  const un = Math.cos(s.azimuth);
  // û × (−ẑ) = (−u_n, u_e) below the wire; the opposite above it
  const k = s.below === false ? -1 : 1;
  return { east: -k * B * un, north: k * B * ue };
}

/** The total horizontal field at the needle: the Earth's (north) plus the wire's [T]. */
export function horizontalField(s: CompassWire): { east: number; north: number } {
  const w = wireFieldAtNeedle(s);
  return { east: w.east, north: s.BE + w.north };
}

/**
 * The needle's direction, measured from north toward east [rad], in (−π, π]: negative = turned
 * west. NaN when the horizontal field vanishes.
 */
export function needleDeflection(s: CompassWire): number {
  const b = horizontalField(s);
  const scale = Math.abs(s.BE) + Math.abs(signedWireField(s.I, s.r));
  if (Math.hypot(b.east, b.north) <= 1e-12 * scale) return NaN;
  return Math.atan2(b.east, b.north);
}

/**
 * Inverting the method: the Earth's horizontal field from the slope k of tanθ against I for a
 * north–south wire at height r, B_E = μ₀/(2πr·k) [T].
 */
export const earthFieldFromSlope = (k: number, r: number) => MU0 / (2 * Math.PI * r * k);
