/**
 * Circular orbits in a bounded uniform magnetic field, and ions in a mass spectrometer. Built for
 * lesson 4.5 (the figure MagneticOrbit); the circle itself comes from magnetism.ts.
 *
 * MODEL SPECIFICATION
 * - System: one point charge (mass m, charge q) moving in the page plane. A uniform field B_z
 *   perpendicular to the page (B_z > 0 is ⊙, out of the page) fills the half-plane x ≥ xb on one
 *   side of a straight edge; outside it there is no field. Ions in the spectrometer are atoms that
 *   lost one or two electrons.
 * - Dynamics: outside the field, a straight line at constant velocity. Inside, uniform circular
 *   motion with r = mv/(|q|B) and T = 2πm/(|q|B) (circlePosition, circleCenter, orbitPeriod in
 *   magnetism.ts): the magnetic force is perpendicular to v, so the speed never changes. The circle
 *   is symmetric about the line through its centre perpendicular to the edge, so the charge leaves
 *   the field at the mirror image of its entry point, with its velocity mirrored in the edge.
 * - Boundary: a sharp field edge (the field drops from B to 0 across a negligible width).
 * - Ignored: the fringe field at a real magnet's edge, gravity (mg ≪ qvB for every particle here),
 *   radiation and relativity, collisions with gas. An ion's mass is taken as A·m_p (A nucleons,
 *   each about a proton mass; the electrons and the binding energy are neglected), as the Bagrut
 *   does when a question gives only the mass number.
 * - Valid when: v ≪ c; the field region is wider than the circle's reach into it (otherwise the
 *   charge leaves through a far side the model does not have).
 * - Failure modes: a charge moving along the edge (v_x = 0) never enters; edgeCrossing requires
 *   v_x > 0 at entry. B = 0 has no circle.
 */

import { M_PROTON } from './constants';
import { circleCenter, orbitPeriod, orbitRadius, spectrometerRadius } from './magnetism';
import type { Vec2 } from './vec';

export interface EdgeCrossing {
  /** where the charge leaves the field, on the edge x = xb [m] */
  exit: Vec2;
  /** velocity on leaving: the entry velocity mirrored in the edge [m/s] */
  vExit: Vec2;
  /** time spent in the field [s] */
  time: number;
  /** angle the velocity turns through inside the field, 0 … 2π [rad] */
  arc: number;
  /** centre and radius of the circle [m] */
  center: Vec2;
  r: number;
  /** distance along the edge from the entry point to the exit point (the chord) [m] */
  chord: number;
}

/**
 * A charge enters the field (x ≥ p0[0]) at p0 with in-plane velocity v0 (v0[0] > 0) and returns to
 * the edge. Perpendicular entry gives a half circle: chord 2r, time T/2. Entry at an angle φ to the
 * edge's normal gives chord 2r·cosφ and a turn of π − 2φ or π + 2φ, depending on which way the
 * force bends the path.
 */
export function edgeCrossing(q: number, m: number, Bz: number, p0: Vec2, v0: Vec2): EdgeCrossing {
  if (!(v0[0] > 0)) throw new Error('edgeCrossing: the charge must move into the field (v0[0] > 0)');
  if (Bz === 0 || q === 0) throw new Error('edgeCrossing: no field, no circle');
  const v = Math.hypot(v0[0], v0[1]);
  const r = orbitRadius(m, v, q, Bz);
  const c = circleCenter(q, m, Bz, p0, v0);
  const exit: Vec2 = [p0[0], 2 * c[1] - p0[1]];
  // the sense of rotation: ω = −qB_z/m, counterclockwise positive
  const ccw = -q * Bz > 0;
  const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
  const a1 = Math.atan2(exit[1] - c[1], exit[0] - c[0]);
  let arc = ccw ? a1 - a0 : a0 - a1;
  arc = ((arc % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const T = orbitPeriod(m, q, Bz);
  return {
    exit,
    vExit: [-v0[0], v0[1]],
    time: (arc / (2 * Math.PI)) * T,
    arc,
    center: c,
    r,
    chord: Math.abs(exit[1] - p0[1]),
  };
}

/** Mass of an ion with A nucleons, A·m_p [kg] (electrons and binding energy neglected). */
export const ionMass = (A: number): number => A * M_PROTON;

/**
 * Mass spectrometer: where an ion lands on the detector, measured from the entrance slit. It enters
 * perpendicular to the edge, so it lands one diameter away, 2r = 2√(2mU/|q|)/B [m].
 */
export const landingDistance = (m: number, q: number, U: number, B: number): number => 2 * spectrometerRadius(m, q, U, B);

/** Distance between the landing points of two ions of masses m1 and m2 and the same charge [m]. */
export const isotopeSeparation = (m1: number, m2: number, q: number, U: number, B: number): number =>
  Math.abs(landingDistance(m2, q, U, B) - landingDistance(m1, q, U, B));
