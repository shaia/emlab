/**
 * A charge in a uniform electric field: the cathode-ray-tube deflection and the Millikan oil drop.
 *
 * MODEL SPECIFICATION
 * - System: one point charge q of mass m. In the tube it enters, with speed v along x, a region
 *   of length L with a uniform field E along y (positive = up). After the plates it is in free
 *   flight to a screen a distance D beyond the plates. In the drop experiment a drop of mass m
 *   and charge q hangs in a uniform vertical field E and in gravity G, in air.
 * - Dynamics: tube: a = qE/m along y, v_x constant, so y = qE·x²/(2mv²) inside the field
 *   (the same formula as `deflection` in motion.ts) and a straight line of slope qEL/(mv²) after
 *   it. Drop: air drag proportional to speed (Stokes), so the drop moves at a constant speed
 *   v = (qE − mG)/γ instead of accelerating, and hovers when qE = mG.
 * - Boundary: the beam is stopped by a plate if |y| reaches the half-gap inside the field. The
 *   drop is stopped by a plate if it reaches one (the caller clamps).
 * - Ignored: gravity on the beam particle (for an electron mg/eE ~ 10⁻¹⁴ at 10³ N/C), fringe
 *   fields at the plate edges, relativity (v ≤ 4·10⁷ m/s is 13% of c: ≲ 1% error), buoyancy,
 *   changes of the drop's mass.
 * - Valid when: the field is uniform over the region the particle crosses.
 * - Failure modes: E = 0 gives a straight line (the plate-hit distance is only computed when
 *   the beam is stopped, which needs E ≠ 0); v = 0 is not a beam.
 */

import { E_CHARGE, G } from './constants';
import { deflection } from './motion';

/** Acceleration along the field axis, a = qE/m [m/s²] (signed with q·E). */
export const acceleration = (q: number, m: number, E: number): number => (q * E) / m;

export interface CrtGeometry {
  /** length of the plates along x [m] */
  plateLength: number;
  /** half the gap between the plates [m] */
  halfGap: number;
  /** distance from the end of the plates to the screen [m] */
  screenDistance: number;
}

export interface CrtResult {
  /** the beam reaches the screen, or is stopped by a plate */
  outcome: 'screen' | 'plate';
  /** deflection at the end of the plates, y = qEL²/(2mv²) [m]; capped at ±halfGap when stopped */
  yExit: number;
  /** tan of the exit angle, qEL/(mv²) */
  slope: number;
  /** y on the screen [m]; NaN when the beam is stopped by a plate */
  yScreen: number;
  /** where the beam hits a plate: x from the plate entrance, y of that plate [m]; NaN otherwise */
  xHit: number;
  yHit: number;
  /** time spent between the plates, L/v [s] */
  transitTime: number;
}

export function crtPath(q: number, m: number, E: number, v: number, g: CrtGeometry): CrtResult {
  const L = g.plateLength;
  const yFull = deflection(q, m, E, v, L);
  const slope = (q * E * L) / (m * v * v);
  const transitTime = L / v;
  if (Math.abs(yFull) >= g.halfGap) {
    // y(x) = ±halfGap  →  x = sqrt(2·halfGap·m·v² / |qE|)
    const xHit = Math.sqrt((2 * g.halfGap * m * v * v) / Math.abs(q * E));
    return {
      outcome: 'plate',
      yExit: Math.sign(yFull) * g.halfGap,
      slope,
      yScreen: NaN,
      xHit,
      yHit: Math.sign(yFull) * g.halfGap,
      transitTime,
    };
  }
  return { outcome: 'screen', yExit: yFull, slope, yScreen: yFull + slope * g.screenDistance, xHit: NaN, yHit: NaN, transitTime };
}

/**
 * Height of the beam at horizontal position x measured from the plate entrance [m]
 * (0 before the plates, a parabola between them, a straight line after them).
 */
export function beamY(q: number, m: number, E: number, v: number, g: CrtGeometry, x: number): number {
  if (x <= 0) return 0;
  if (x <= g.plateLength) return deflection(q, m, E, v, x);
  const yExit = deflection(q, m, E, v, g.plateLength);
  const slope = (q * E * g.plateLength) / (m * v * v);
  return yExit + slope * (x - g.plateLength);
}

/** Position after time t inside the field: x = vt (uniform), y = ½at² (uniformly accelerated). */
export function positionAtTime(q: number, m: number, E: number, v: number, t: number): [number, number] {
  return [v * t, 0.5 * acceleration(q, m, E) * t * t];
}

/* ------------------------------------------------------------------ Millikan */

/** Field strength that holds a drop of mass m and charge q still: qE = mG [N/C]. */
export const balanceField = (m: number, q: number): number => (m * G) / Math.abs(q);

/** Net upward force on the drop: qE_y − mG [N] (E_y is the signed y-component of the field). */
export const netForceUp = (q: number, m: number, Ey: number): number => q * Ey - m * G;

/** Drag coefficient γ [N·s/m] such that the drop falls at `fallSpeed` [m/s] with no field. */
export const dragCoefficient = (m: number, fallSpeed: number): number => (m * G) / fallSpeed;

/** Steady vertical speed of the drop, positive up [m/s]: v = (qE_y − mG)/γ. */
export const driftSpeed = (q: number, m: number, Ey: number, gamma: number): number => netForceUp(q, m, Ey) / gamma;

/** Does the drop hover? The net force is within `tol` of the weight (default 2.5%). */
export const isHovering = (q: number, m: number, Ey: number, tol = 0.025): boolean =>
  Math.abs(netForceUp(q, m, Ey)) <= tol * m * G;

/** The charge read off a hovering drop, q = mG/|E| [C]. */
export const chargeFromBalance = (m: number, E: number): number => (m * G) / Math.abs(E);

/** A charge as a multiple of the elementary charge. */
export const inUnitsOfE = (q: number): number => q / E_CHARGE;
