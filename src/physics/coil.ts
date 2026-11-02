/**
 * A flat rectangular coil on an axle in a uniform magnetic field: the forces on its four sides, the
 * torque, the rotation it causes, the DC motor's commutator and the moving-coil meter. Built for
 * lesson 4.10 (figure CoilTorque).
 *
 * MODEL SPECIFICATION
 * - System: a rigid rectangular coil of N turns, sides a (parallel to the axle) and b (perpendicular
 *   to it), area A = ab, carrying I, free to turn about a fixed axle through its centre. Coordinates
 *   as the rest of chapter 4: the axle is the z axis (out of the page in the end-on view), the field
 *   B is uniform and along +x (from the N pole on the left to the S pole on the right). The coil's
 *   orientation is φ, the angle from B to the coil's normal n̂ = (cos φ, sin φ), counter-clockwise
 *   positive; n̂ is given by the right-hand grip rule from the current (fingers along I, thumb n̂).
 *   The side whose current flows out of the page (⊙) sits at +(b/2)û, the ⊗ side at −(b/2)û, with
 *   û = (−sin φ, cos φ) the in-page direction along the coil's edge-on trace.
 * - Dynamics: the force on each side is F = N·I L×B (magnetism.ts, wireForceVec); the torque about
 *   the axle is τ_z = −NBIA·sin φ (magnetism.ts, loopTorque gives the magnitude NBIA·sinθ, θ = |φ|).
 *   Rotation: J φ'' = τ_z − c φ' (moment of inertia J, viscous friction c), integrated by RK4. With a
 *   commutator (split ring) the current reverses each time the coil passes φ = 0 or 180° (its plane
 *   perpendicular to B), so the torque never changes sense. The moving-coil meter has a radial field
 *   (curved pole pieces, iron core): the sides always move across B, the torque is NBIA at every
 *   angle, and a spiral spring of torsion constant κ balances it at the deflection δ = NBIA/κ.
 * - Boundary: the field is uniform over the coil (the meter's field is radial with the same
 *   magnitude at both sides); the axle is fixed.
 * - Ignored: the leads and the field of the coil itself, the emf induced in the turning coil (back
 *   emf, chapter 5: in a real motor it limits the current and the speed), the commutator's gap width
 *   and sparking, gravity on the coil.
 * - Valid when: the coil is rigid and the current is set by the supply (no back emf), speeds low.
 * - Failure modes: J or c in the figure are chosen for the eye, not measured; only the torque and the
 *   forces are quantitative. A coil released exactly at φ = 0 or 180° stays there (zero torque);
 *   a motor at a dead point does not start.
 */

import { loopTorque, wireForceVec } from './magnetism';
import type { Vec2, Vec3 } from './vec';

/** Where the two sides parallel to the axle cross the page (end-on view) [m]: ⊙ side, ⊗ side. */
export function coilSides(phi: number, b: number): { out: Vec2; in: Vec2 } {
  const ux = -Math.sin(phi);
  const uy = Math.cos(phi);
  return { out: [(ux * b) / 2, (uy * b) / 2], in: [(-ux * b) / 2, (-uy * b) / 2] };
}

export interface CoilSideForce {
  /** midpoint of the side [m] */
  at: Vec3;
  /** force on the side, all N turns [N] */
  F: Vec3;
}

/**
 * The forces on the four sides of the coil, in the order: ⊙ side, top side (z = +a/2), ⊗ side,
 * bottom side. B along +x with magnitude B. The current I is signed: I < 0 reverses it.
 */
export function coilSideForces(N: number, I: number, a: number, b: number, B: number, phi: number): CoilSideForce[] {
  const u: Vec3 = [-Math.sin(phi), Math.cos(phi), 0];
  const Bv: Vec3 = [B, 0, 0];
  const NI = N * I;
  // the circulation: up the ⊙ side (+z), across the top toward −û, down the ⊗ side, back along +û
  const sides: { at: Vec3; L: Vec3 }[] = [
    { at: [(u[0] * b) / 2, (u[1] * b) / 2, 0], L: [0, 0, a] },
    { at: [0, 0, a / 2], L: [-u[0] * b, -u[1] * b, 0] },
    { at: [(-u[0] * b) / 2, (-u[1] * b) / 2, 0], L: [0, 0, -a] },
    { at: [0, 0, -a / 2], L: [u[0] * b, u[1] * b, 0] },
  ];
  return sides.map((s) => ({ at: s.at, F: wireForceVec(NI, s.L, Bv) }));
}

/** Signed torque about the axle (z), τ_z = −NBIA·sin φ [N·m]; positive turns counter-clockwise. */
export const coilTorqueZ = (N: number, I: number, A: number, B: number, phi: number): number => -loopTorque(N, I, A, B, phi);

/**
 * The commutator: the sign it gives the current so that the torque keeps one sense. For a motor
 * that turns counter-clockwise (τ_z ≥ 0) the current is +1 while sin φ < 0 and −1 while sin φ > 0;
 * it flips each time the coil's plane is perpendicular to B (φ = 0 or 180°).
 */
export const commutatorSign = (phi: number): number => (Math.sin(phi) > 0 ? -1 : 1);

export interface Rotor {
  /** orientation [rad], unwrapped (counts whole turns) */
  phi: number;
  /** angular velocity [rad/s] */
  omega: number;
}

export interface RotorParams {
  N: number;
  /** supply current [A], signed; with a commutator its sign sets the sense of rotation */
  I: number;
  A: number;
  B: number;
  /** moment of inertia [kg·m²] */
  J: number;
  /** viscous friction [N·m·s] */
  c: number;
  commutator: boolean;
}

/** Net torque on the rotor at (φ, ω), including friction [N·m]. */
export function rotorTorque(p: RotorParams, phi: number, omega: number): number {
  const I = p.commutator ? p.I * commutatorSign(phi) : p.I;
  return coilTorqueZ(p.N, I, p.A, p.B, phi) - p.c * omega;
}

/** One RK4 step of J φ'' = τ(φ, ω). */
export function rotorStep(s: Rotor, p: RotorParams, dt: number): Rotor {
  const acc = (phi: number, omega: number) => rotorTorque(p, phi, omega) / p.J;
  const k1p = s.omega;
  const k1w = acc(s.phi, s.omega);
  const k2p = s.omega + (k1w * dt) / 2;
  const k2w = acc(s.phi + (k1p * dt) / 2, s.omega + (k1w * dt) / 2);
  const k3p = s.omega + (k2w * dt) / 2;
  const k3w = acc(s.phi + (k2p * dt) / 2, s.omega + (k2w * dt) / 2);
  const k4p = s.omega + k3w * dt;
  const k4w = acc(s.phi + k3p * dt, s.omega + k3w * dt);
  return {
    phi: s.phi + ((k1p + 2 * k2p + 2 * k3p + k4p) * dt) / 6,
    omega: s.omega + ((k1w + 2 * k2w + 2 * k3w + k4w) * dt) / 6,
  };
}

/**
 * Energy of the coil without a commutator: ½Jω² − NIAB·cos φ [J]. It is conserved when c = 0, and
 * shows why φ = 0 (plane perpendicular to B, energy lowest) is the stable position and φ = 180° the
 * unstable one.
 */
export const rotorEnergy = (p: RotorParams, s: Rotor): number =>
  0.5 * p.J * s.omega ** 2 - p.N * p.I * p.A * p.B * Math.cos(s.phi);

/** Moving-coil meter: the deflection at which the spring balances the torque, δ = NBIA/κ [rad]. */
export const meterDeflection = (N: number, I: number, A: number, B: number, kappa: number): number => (N * B * I * A) / kappa;
