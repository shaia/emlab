/**
 * The induced electric field of a long solenoid's core, measured round circular loops anywhere in the
 * plane, and a charged bead that the field pushes along such a loop. Built for lesson 5.6 (figure
 * InducedField).
 *
 * MODEL SPECIFICATION
 * - System: the cross-section of a long solenoid seen end-on. Inside its core, a disc of radius a about
 *   the origin, the field is uniform and along z (out of the page, ⊙, when B_z > 0); outside, it is zero.
 *   B_z changes at a constant rate dB_z/dt. The induced E is azimuthal (`inducedE` in maxwell.ts):
 *   E_φ = −(dB_z/dt)·s/2 inside and −(dB_z/dt)·a²/(2s) outside, so positive dB_z/dt turns it clockwise.
 *   A test loop is a circle of radius r centred at (cx, cy), with its normal along +z, so that its positive
 *   sense is counter-clockwise (the right-hand rule) and Φ is measured along +z.
 * - Dynamics: Faraday's law for the loop, ∮E·dl (counter-clockwise) = −dΦ/dt, where Φ = B_z times the
 *   area of the loop that lies inside the core (the overlap of two discs). A bead of charge q and mass m
 *   slides without friction along the loop (a closed insulating tube): m·r·φ̈ = q·E_t(φ), with E_t the
 *   component of E along the counter-clockwise tangent. Integrated by RK4 in (φ, φ̇).
 * - Boundary: B = 0 outside the core (an ideal long solenoid); the windings are not drawn.
 * - Ignored: the magnetic force on the moving bead (the tube supplies whatever sideways force keeps it on
 *   the loop, and a sideways force does no work), the bead's own field, radiation, friction, and the
 *   current the field would drive if the loop were a conductor (its own field: self-inductance).
 * - Valid when: quasi-static (the region is much smaller than c times the time over which B changes),
 *   and dB_z/dt constant over the time simulated.
 * - Failure modes: r ≤ 0 is rejected; s = 0 on the axis is guarded in `inducedE` (E = 0 there). The
 *   numerical circulation has a kink in its integrand where the loop crosses the core's edge, so it
 *   converges as 1/n² there, not faster: `n` = 2000 keeps it within 10⁻⁶ of the exact value.
 */

import { inducedE } from './maxwell';
import type { Vec2 } from './vec';

/** A circular loop: centre (cx, cy) and radius r [m]. */
export interface Loop {
  cx: number;
  cy: number;
  r: number;
}

/**
 * Area of the overlap of a disc of radius a about the origin and a disc of radius r whose centre is at
 * distance d from it [m²]: 0 when they are apart, π·min(a, r)² when one holds the other, a lens between.
 */
export function circleOverlap(a: number, r: number, d: number): number {
  if (!(a > 0 && r > 0)) throw new RangeError('circleOverlap needs a > 0 and r > 0');
  if (d >= a + r) return 0;
  if (d <= Math.abs(a - r)) return Math.PI * Math.min(a, r) ** 2;
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  const alpha = Math.acos(clamp((d * d + r * r - a * a) / (2 * d * r))); // half-angle seen from the loop's centre
  const beta = Math.acos(clamp((d * d + a * a - r * r) / (2 * d * a))); // half-angle seen from the axis
  const k = (-d + r + a) * (d + r - a) * (d - r + a) * (d + r + a);
  return r * r * alpha + a * a * beta - 0.5 * Math.sqrt(Math.max(0, k));
}

/** The part of the loop's area that lies inside the core, where the field is [m²]. */
export const areaInCore = (a: number, loop: Loop): number => circleOverlap(a, loop.r, Math.hypot(loop.cx, loop.cy));

/** dΦ/dt through the loop, Φ measured along +z: (dB_z/dt) times the area inside the core [Wb/s]. */
export const loopFluxRate = (dBdt: number, a: number, loop: Loop): number => dBdt * areaInCore(a, loop);

/**
 * The emf round the loop by Faraday's law, ε = −dΦ/dt [V]; positive drives a positive charge
 * counter-clockwise, negative clockwise.
 */
export function loopEmf(dBdt: number, a: number, loop: Loop): number {
  const e = -loopFluxRate(dBdt, a, loop);
  return e === 0 ? 0 : e; // no −0 for a figure to print
}

/** Component of the induced E along the loop's counter-clockwise tangent at angle φ on the loop [V/m]. */
export function tangentialE(dBdt: number, a: number, loop: Loop, phi: number): number {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const [ex, ey] = inducedE(dBdt, a)(loop.cx + loop.r * c, loop.cy + loop.r * s);
  return -ex * s + ey * c;
}

/**
 * The work per unit charge round the loop, Σ E∥·Δℓ counter-clockwise, summed on n equal arcs by the
 * midpoint rule along the circle itself [V]. This is the left-hand side of Faraday's law, computed from
 * the field and not from the flux.
 */
export function loopCirculation(dBdt: number, a: number, loop: Loop, n = 2000): number {
  if (!(loop.r > 0)) throw new RangeError('loopCirculation needs r > 0');
  const dphi = (2 * Math.PI) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += tangentialE(dBdt, a, loop, (i + 0.5) * dphi);
  return sum * loop.r * dphi;
}

/** Work per unit charge along an arc of the loop from φ1 to φ2 (counter-clockwise if φ2 > φ1) [V]. */
export function arcWork(dBdt: number, a: number, loop: Loop, phi1: number, phi2: number, n = 1000): number {
  const dphi = (phi2 - phi1) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += tangentialE(dBdt, a, loop, phi1 + (i + 0.5) * dphi);
  return sum * loop.r * dphi;
}

/* ------------------------------------------------------------------ the bead */

export interface Bead {
  /** angle on the loop, counter-clockwise from +x [rad] */
  phi: number;
  /** angular speed [rad/s] */
  omega: number;
}

/**
 * One RK4 step of m·r·φ̈ = q·E_t(φ), written with the charge-to-mass ratio qm = q/m [C/kg]. The bead's
 * kinetic energy per unit mass is ½(r·φ̇)², and the work the field does on it per unit mass from φ1 to
 * φ2 is qm·arcWork(φ1, φ2).
 */
export function beadStep(b: Bead, dBdt: number, a: number, loop: Loop, qm: number, dt: number): Bead {
  const acc = (phi: number) => (qm * tangentialE(dBdt, a, loop, phi)) / loop.r;
  const k1p = b.omega;
  const k1w = acc(b.phi);
  const k2p = b.omega + (dt / 2) * k1w;
  const k2w = acc(b.phi + (dt / 2) * k1p);
  const k3p = b.omega + (dt / 2) * k2w;
  const k3w = acc(b.phi + (dt / 2) * k2p);
  const k4p = b.omega + dt * k3w;
  const k4w = acc(b.phi + dt * k3p);
  return {
    phi: b.phi + (dt / 6) * (k1p + 2 * k2p + 2 * k3p + k4p),
    omega: b.omega + (dt / 6) * (k1w + 2 * k2w + 2 * k3w + k4w),
  };
}

/**
 * Where to let the bead go from rest. When the emf is not zero: just past the point from which the
 * field's work, going in the emf's sense, is never negative over the next lap, so the bead never stops
 * and turns back. When it is zero (a loop beside the core): the point of the strongest push along the
 * loop, from which the bead swings back and forth.
 */
export function beadStart(dBdt: number, a: number, loop: Loop, n = 720): number {
  const emf = loopEmf(dBdt, a, loop);
  const dphi = (2 * Math.PI) / n;
  if (Math.abs(emf) < 1e-9 * Math.abs(dBdt) * a * a) {
    let best = 0;
    let most = -1;
    for (let i = 0; i < n; i++) {
      const e = Math.abs(tangentialE(dBdt, a, loop, i * dphi));
      if (e > most) {
        most = e;
        best = i;
      }
    }
    return best * dphi;
  }
  // the bead moves in the sense of the emf: sample at φ = dir·ψ, ψ the angle travelled; the tangent along
  // the motion is dir times the counter-clockwise one, so the push along the motion is dir·E_t
  const dir = Math.sign(emf);
  const et = Array.from({ length: n }, (_, i) => dir * tangentialE(dBdt, a, loop, dir * i * dphi));
  // U(ψ) = −(work per unit charge over the first ψ), by the trapezoid rule
  let u = 0;
  let maxU = -Infinity;
  let at = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) u -= 0.5 * (et[i - 1] + et[i]) * loop.r * dphi;
    if (u > maxU) {
      maxU = u;
      at = i;
    }
  }
  // two degrees on, in the direction of motion: off a smooth maximum, where the push would be zero
  return at * dphi * dir + dir * ((2 * Math.PI) / 180);
}

/** The point on the loop at angle φ [m]. */
export const onLoop = (loop: Loop, phi: number): Vec2 => [loop.cx + loop.r * Math.cos(phi), loop.cy + loop.r * Math.sin(phi)];
