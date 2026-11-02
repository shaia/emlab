/**
 * Crossed fields: the velocity selector and the Bainbridge mass spectrometer (lesson 4.6).
 *
 * MODEL SPECIFICATION
 * - System: one point ion (mass m, charge q) fired along +x into a selector: two parallel plates
 *   (0 ≤ x ≤ L, |y| < h) with a uniform electric field E_y between them and a uniform magnetic field
 *   B_z over the same region (z out of the page; B_z < 0 is ⊗). An exit slit of half-width w sits in a
 *   wall at x = x_s. Optionally a second stage: a uniform field B′_z for x > x_s and no electric field
 *   (the Bainbridge spectrometer), with a detector along the wall x = x_s.
 * - Dynamics: Newton's second law with F = qE + qv×B, integrated by the Boris push of motion.ts
 *   (exact |v| in a pure magnetic field; exact straight line at v = E/B, see the tests).
 *   For v along +x the transverse force is F_y = q(E_y − v·B_z): the selection condition is
 *   q·E_y = q·v·B_z, i.e. v = E/B whatever q and m.
 * - Boundary: sharp field edges at x = 0, x = L and x = x_s (no fringe fields). The ion stops on a
 *   plate (|y| ≥ h inside the plates), on the wall beside the slit, on the detector, or when it
 *   leaves the drawing box.
 * - Ignored: fringe fields, gravity (≈10⁻¹² of the electric force here), radiation, relativity,
 *   the ions' fields on one another (a beam is drawn as independent ions).
 * - Valid when: v ≪ c. A wrong speed follows a trochoid, y = (u/ω)(1 − cos ωt) with u = v − E/B and
 *   ω = qB/m, which never crosses to the other side: a faster ion always bends toward the magnetic
 *   force, a slower one toward the electric force. How far it bends is the parabola ½(F/m)t² only
 *   while ωt ≪ 1; in the figure ωt ≈ 1–2 rad for the ions, and an electron in the same fields would
 *   gyrate hundreds of times with a micrometre amplitude and merely drift at E/B (so the figure
 *   offers ions only).
 * - Failure modes: a step comparable to the orbit radius distorts the circle; the default step
 *   (0.2 mm) keeps the detector position within 0.1 % of 2r for r ≥ 1 cm (convergence test).
 */

import { borisStep, type Body, type Field3 } from './motion';
import type { Vec2, Vec3 } from './vec';

export interface SelectorGeometry {
  /** plate length L [m]; the selector fields fill 0 ≤ x ≤ L */
  plateLength: number;
  /** half the gap between the plates h [m] */
  halfGap: number;
  /** x of the wall with the exit slit [m] (≥ L) */
  slitX: number;
  /** half-width of the exit slit w [m] */
  slitHalf: number;
  /** x of the source [m] (< 0) */
  sourceX: number;
  /** the drawing box: the trace stops outside it [m] */
  box: { xMin: number; xMax: number; yMin: number; yMax: number };
}

export interface SelectorFields {
  /** electric field between the plates, y component [V/m] (negative = down, top plate +) */
  Ey: number;
  /** magnetic field over the plates, z component [T] (negative = ⊗, into the page) */
  Bz: number;
  /** second-stage field for x > slitX, z component [T]; null = no second stage */
  B2z: number | null;
}

export type SelectorOutcome = 'plate' | 'wall' | 'through' | 'detector' | 'out';

export interface SelectorPath {
  /** the path, from the source, in metres */
  points: Vec2[];
  outcome: SelectorOutcome;
  /** where the path ends (a plate, the wall, the detector, or the box edge) */
  end: Vec2;
  /** true when the ion went through the exit slit */
  passed: boolean;
  /** speed where the path ends [m/s] */
  endSpeed: number;
}

/** Transverse force on an ion moving along +x with speed v: F_y = q(E_y − v·B_z) [N]. */
export const crossedForceY = (q: number, v: number, Ey: number, Bz: number): number => q * (Ey - v * Bz);

/** The electric part of it, q·E_y [N]. */
export const electricForceY = (q: number, Ey: number): number => q * Ey;

/** The magnetic part of it, (qv×B)_y = −q·v·B_z [N]. */
export const magneticForceY = (q: number, v: number, Bz: number): number => -q * v * Bz;

/** Bainbridge spectrometer: radius in the second field B′ of an ion selected at v = E/B, r = mE/(|q|BB′) [m]. */
export const bainbridgeRadius = (m: number, q: number, E: number, B: number, B2: number): number =>
  (m * Math.abs(E)) / (Math.abs(q) * Math.abs(B) * Math.abs(B2));

/**
 * Trace one ion through the selector (and the second stage, if any). `step` is the path length per
 * Boris step [m]; the time step is step/v₀.
 */
export function traceSelector(
  q: number,
  m: number,
  v0: number,
  geo: SelectorGeometry,
  f: SelectorFields,
  step = 2e-4,
): SelectorPath {
  const L = geo.plateLength;
  const inPlates = (x: number) => x >= 0 && x <= L;
  const E: Field3 = (p) => (inPlates(p[0]) ? [0, f.Ey, 0] : [0, 0, 0]);
  const B: Field3 = (p) => {
    if (inPlates(p[0])) return [0, 0, f.Bz];
    if (f.B2z !== null && p[0] > geo.slitX) return [0, 0, f.B2z];
    return [0, 0, 0];
  };
  const dt = step / v0;
  let body: Body = { pos: [geo.sourceX, 0, 0] as Vec3, vel: [v0, 0, 0] as Vec3, m, q };
  const points: Vec2[] = [[geo.sourceX, 0]];
  let passed = false;
  const { xMin, xMax, yMin, yMax } = geo.box;
  const speed = (b: Body) => Math.hypot(b.vel[0], b.vel[1]);
  const finish = (outcome: SelectorOutcome, end: Vec2, b: Body): SelectorPath => {
    points.push(end);
    return { points, outcome, end, passed, endSpeed: speed(b) };
  };
  for (let i = 0; i < 200000; i++) {
    const prev = body;
    body = borisStep(body, E, B, 0, dt);
    const [x0, y0] = prev.pos;
    const [x1, y1] = body.pos;
    const at = (xc: number): Vec2 => {
      const s = (xc - x0) / (x1 - x0);
      return [xc, y0 + s * (y1 - y0)];
    };
    // a plate: inside the plate region the ion may not reach |y| = h
    if (inPlates(x1) && Math.abs(y1) >= geo.halfGap) {
      const yh = Math.sign(y1) * geo.halfGap;
      const s = (yh - y0) / (y1 - y0);
      return finish('plate', [x0 + s * (x1 - x0), yh], body);
    }
    // the slit wall, crossed from the left
    if (!passed && x0 < geo.slitX && x1 >= geo.slitX) {
      const c = at(geo.slitX);
      if (Math.abs(c[1]) > geo.slitHalf) return finish('wall', c, body);
      passed = true;
    }
    // the detector: the wall crossed back from the right, in the second stage
    if (passed && f.B2z !== null && x0 > geo.slitX && x1 <= geo.slitX) {
      return finish('detector', at(geo.slitX), body);
    }
    if (x1 < xMin || x1 > xMax || y1 < yMin || y1 > yMax) {
      return finish(passed && f.B2z === null ? 'through' : 'out', [x1, y1], body);
    }
    points.push([x1, y1]);
  }
  return finish('out', [body.pos[0], body.pos[1]], body);
}
