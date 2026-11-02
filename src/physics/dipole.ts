/**
 * The electric dipole for lesson 6.10: the exact field of two opposite charges, the far-field (point
 * dipole) approximation derived from V = kp·cosθ/r² and E = −∇V, the torque and energy of a dipole in a
 * uniform field, the force on a dipole near a point charge, and a polarised slab (many small dipoles).
 *
 * MODEL SPECIFICATION
 * - System: charges +q and −q a distance d apart (dipole moment p = qd, pointing from −q to +q), in
 *   vacuum. In the plane functions the dipole's centre is at the origin and p makes the angle `phi`
 *   with the x axis; the plane is a slice through the axis of the 3D dipole, so the 3D field lies in it.
 * - Dynamics: none (electrostatics). Exact field = superposition of the two Coulomb fields
 *   (`fieldAt`). Far field of a point dipole: V = kp·cosθ/r², E_r = 2kp·cosθ/r³, E_θ = kp·sinθ/r³,
 *   i.e. E = k(3(p·r̂)r̂ − p)/r³. On the axis exactly E = 2kq·rd/(r² − d²/4)², on the perpendicular
 *   bisector exactly E = kqd/(r² + d²/4)^{3/2}. In a uniform field E: net force 0, τ = p×E
 *   (τ_z = −pE·sinθ with θ from E to p, counter-clockwise positive), U = −p·E = −pE·cosθ.
 *   Polarised slab: a linear dielectric of constant κ in an applied field E₀ (perpendicular to its
 *   faces) has E = E₀/κ inside, polarisation P = ε₀(κ − 1)E and bound surface charge σ_b = P = n·p.
 * - Boundary: V → 0 at infinity. The slab is a wide slab (edge effects ignored), its applied field
 *   uniform.
 * - Ignored: the size of the charges, any induced change of p by the field (p is rigid unless the
 *   slab says otherwise), gravity, radiation; quantum structure of molecules (a molecular p is an
 *   effective value).
 * - Valid when: the point-dipole formulas need r ≫ d: the relative error on the axis is
 *   1/(1 − d²/(4r²))² − 1 ≈ d²/(2r²) (1% at r ≈ 7d). The exact formulas hold at any point off the charges.
 *   Two point dipoles p₁ (at the origin) and p₂ (at r): W = −p₂·E₁ = k[p₁·p₂ − 3(p₁·r̂)(p₂·r̂)]/r³.
 * - Failure modes: the exact field diverges at each charge; the point-dipole field diverges at its
 *   centre and is meaningless for r ≲ d. `logSlope` needs a positive, smooth function near r.
 */

import { EPS0, K } from './constants';
import { fieldAt, potentialAt, type PointCharge } from './electrostatics';
import type { Vec2 } from './vec';

/** Dipole moment p = q·d [C·m]. */
export const dipoleMoment = (q: number, d: number): number => q * d;

/** The two charges of a dipole centred at (cx, cy) with p at angle phi from the x axis (+q at the head). */
export function dipoleCharges(q: number, d: number, phi = 0, cx = 0, cy = 0): PointCharge[] {
  const ux = (Math.cos(phi) * d) / 2;
  const uy = (Math.sin(phi) * d) / 2;
  return [
    { x: cx + ux, y: cy + uy, q },
    { x: cx - ux, y: cy - uy, q: -q },
  ];
}

/** Exact field of the two charges at (x, y) [N/C]. */
export const dipoleFieldExact = (q: number, d: number, x: number, y: number, phi = 0): Vec2 =>
  fieldAt(dipoleCharges(q, d, phi), x, y);

/** Exact potential of the two charges at (x, y) [V]. */
export const dipolePotentialExact = (q: number, d: number, x: number, y: number, phi = 0): number =>
  potentialAt(dipoleCharges(q, d, phi), x, y);

/** Far-field potential of a point dipole p (angle phi) at the origin: V = k·p·r̂/r² [V]. */
export function pointDipolePotential(p: number, x: number, y: number, phi = 0): number {
  const r2 = x * x + y * y;
  const pr = p * (Math.cos(phi) * x + Math.sin(phi) * y);
  return (K * pr) / (r2 * Math.sqrt(r2));
}

/** Far field of a point dipole: E = k(3(p·r̂)r̂ − p)/r³ [N/C]. */
export function pointDipoleField(p: number, x: number, y: number, phi = 0): Vec2 {
  const r = Math.hypot(x, y);
  const ux = x / r;
  const uy = y / r;
  const px = p * Math.cos(phi);
  const py = p * Math.sin(phi);
  const pr = px * ux + py * uy;
  const c = K / (r * r * r);
  return [c * (3 * pr * ux - px), c * (3 * pr * uy - py)];
}

/** Far field in polar components about p: E_r = 2kp·cosθ/r³, E_θ = kp·sinθ/r³ [N/C]. */
export const pointDipolePolar = (p: number, r: number, theta: number): { Er: number; Etheta: number } => ({
  Er: (2 * K * p * Math.cos(theta)) / r ** 3,
  Etheta: (K * p * Math.sin(theta)) / r ** 3,
});

/** |E| of a point dipole at distance r and angle θ from p: kp·√(1 + 3cos²θ)/r³ [N/C]. */
export const pointDipoleMagnitude = (p: number, r: number, theta: number): number =>
  ((K * p) / r ** 3) * Math.sqrt(1 + 3 * Math.cos(theta) ** 2);

/** Exact field on the axis at distance r from the centre (r > d/2): 2kq·rd/(r² − d²/4)² [N/C]. */
export const axisFieldExact = (q: number, d: number, r: number): number =>
  (2 * K * q * r * d) / (r * r - (d * d) / 4) ** 2;

/** Far field on the axis: 2kp/r³ [N/C]. */
export const axisFieldFar = (p: number, r: number): number => (2 * K * p) / r ** 3;

/** Exact field on the perpendicular bisector at distance r from the centre: kqd/(r² + d²/4)^{3/2} [N/C]. */
export const bisectorFieldExact = (q: number, d: number, r: number): number =>
  (K * q * d) / (r * r + (d * d) / 4) ** 1.5;

/** Far field on the bisector: kp/r³, pointing opposite to p [N/C]. */
export const bisectorFieldFar = (p: number, r: number): number => (K * p) / r ** 3;

/**
 * Exact field on the axis at distance s from the positive charge, on the side away from −q:
 * kq/s² − kq/(s + d)² [N/C]. Close to +q it is that charge's kq/s²; far away it tends to 2kp/s³.
 */
export const axisFieldFromCharge = (q: number, d: number, s: number): number => K * q * (1 / (s * s) - 1 / (s + d) ** 2);

/** The local slope of a log-log graph, d(ln f)/d(ln r), by a central difference in ln r. */
export function logSlope(f: (r: number) => number, r: number, h = 1e-4): number {
  return (Math.log(f(r * Math.exp(h))) - Math.log(f(r * Math.exp(-h)))) / (2 * h);
}

/* --------------------------------------------------------- uniform field */

/** τ_z of a dipole in a uniform field E along +x, p at angle θ from E (counter-clockwise): −pE·sinθ [N·m]. */
export const dipoleTorqueZ = (p: number, E: number, theta: number): number => -p * E * Math.sin(theta);

/** Potential energy of a dipole in a uniform field: U = −p·E = −pE·cosθ [J]. */
export const dipoleEnergy = (p: number, E: number, theta: number): number => -p * E * Math.cos(theta);

/**
 * Net force and torque about the centre from the two Coulomb forces ±qE on the ends of a rod of
 * length d at angle θ, in a uniform field (Ex, Ey). Computed charge by charge, independently of p×E.
 */
export function uniformFieldForces(q: number, d: number, theta: number, field: Vec2): { force: Vec2; torqueZ: number } {
  let fx = 0;
  let fy = 0;
  let tz = 0;
  for (const c of dipoleCharges(q, d, theta)) {
    const Fx = c.q * field[0];
    const Fy = c.q * field[1];
    fx += Fx;
    fy += Fy;
    tz += c.x * Fy - c.y * Fx;
  }
  return { force: [fx, fy], torqueZ: tz };
}

/* ------------------------------------------------ dipole near a point charge */

/**
 * Exact force along the line on a dipole whose axis lies on the line through a point charge Q, its
 * centre a distance r from Q and p pointing away from Q (−q is the nearer end). Positive = away from Q.
 */
export const dipoleForceNearCharge = (Q: number, q: number, d: number, r: number): number =>
  K * Q * q * (1 / (r + d / 2) ** 2 - 1 / (r - d / 2) ** 2);

/** The far-field approximation of the same force: F = p·dE/dr = −2kQp/r³ (an attraction for p away from Q). */
export const dipoleForceNearChargeFar = (Q: number, p: number, r: number): number => (-2 * K * Q * p) / r ** 3;

/* ------------------------------------------------------- two dipoles */

/**
 * Interaction energy of two point dipoles in a plane: p₁ (magnitude p1, angle a1) at the origin and
 * p₂ (p2, a2) at (x, y): W = k[p₁·p₂ − 3(p₁·r̂)(p₂·r̂)]/r³ [J].
 */
export function dipoleDipoleEnergy(p1: number, a1: number, p2: number, a2: number, x: number, y: number): number {
  const r = Math.hypot(x, y);
  const ux = x / r;
  const uy = y / r;
  const v1: Vec2 = [p1 * Math.cos(a1), p1 * Math.sin(a1)];
  const v2: Vec2 = [p2 * Math.cos(a2), p2 * Math.sin(a2)];
  const dot12 = v1[0] * v2[0] + v1[1] * v2[1];
  return (K * (dot12 - 3 * (v1[0] * ux + v1[1] * uy) * (v2[0] * ux + v2[1] * uy))) / r ** 3;
}

/* ------------------------------------------------------- polarised slab */

/** Bound surface charge of a slab of n aligned dipoles per m³, each of moment p: σ_b = n·p [C/m²]. */
export const slabSurfaceCharge = (n: number, p: number): number => n * p;

/** A linear dielectric slab (constant κ) in an applied field E₀ across it. */
export function polarisedSlab(E0: number, kappa: number): { E: number; P: number; sigmaBound: number } {
  const E = E0 / kappa;
  const P = EPS0 * (kappa - 1) * E;
  return { E, P, sigmaBound: P };
}
