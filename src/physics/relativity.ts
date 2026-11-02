/**
 * Relativity and magnetism, for lesson 6.15 (figure TwoFrames): a long straight neutral wire with a
 * current, and a point charge moving parallel to it, seen from two frames of reference. In the lab
 * the wire is neutral and the force on the moving charge is magnetic, qvB. In the frame where the
 * charge is at rest a magnetic force cannot act on it, and the force is electric: the ions and the
 * electrons have different speeds in that frame, so their line densities contract by different
 * factors and the wire carries a net line charge (Purcell's argument).
 *
 * MODEL SPECIFICATION
 * - System: an infinite straight wire along an axis, made of two lines of charge: positive ions,
 *   line density +λ₀ [C/m], at rest in the lab; and conduction electrons, line density −λ₀ in the lab
 *   (so the wire is neutral there), moving along the axis with velocity u [m/s]. The lab current
 *   along the axis is I = −λ₀u. A point charge q at distance r from the axis moves parallel to it with
 *   velocity v. Velocities are signed components along the axis, |u|, |v| < c.
 * - Dynamics: none (fields and forces at one instant). Special relativity enters through three
 *   results only, quoted, not derived: the speed of light is the same in every frame; a line of
 *   charges moving at speed w is denser than in its own rest frame by γ(w) = 1/√(1 − w²/c²)
 *   (Lorentz contraction of the spacing); and velocities compose as u′ = (u − v)/(1 − uv/c²).
 *   Charge is invariant. In the charge's frame (moving at v): ions γ(v)·λ₀; electrons, whose rest
 *   density is −λ₀/γ(u), move at u′ and have density −λ₀γ(u′)/γ(u) = −λ₀γ(v)(1 − uv/c²); the net is
 *   λ′ = γ(v)·λ₀·uv/c², exactly. Lab force (radial component, + away from the wire):
 *   F = −qvμ₀I/(2πr) = qμ₀λ₀uv/(2πr). Charge-frame force: F′ = q·2kλ′/r. With μ₀ε₀ = 1/c²,
 *   μ₀/(2π) = 2k/c², so F′ = γ(v)·F: the transverse-force transformation (the force on a charge is
 *   largest in its own rest frame). For speeds much below c, γ ≈ 1 + v²/(2c²) and F′ = F to order v²/c².
 * - Boundary: the wire is infinitely long, so its field is 2kλ/r (lineField, continuous.ts) and
 *   μ₀I/(2πr). No other charges or fields.
 * - Ignored: the thickness of the wire, the charge's own field acting back on the wire, radiation,
 *   the circuit that closes the current far away (in the charge's frame the far side of a closed
 *   circuit carries the opposite net charge, so total charge is conserved).
 * - Valid when: |u|, |v| < c; r much larger than the wire's thickness and much smaller than its length.
 * - Failure modes: γ diverges as |v| → c; lorentzGamma throws for |v| ≥ c. At r = 0 every field
 *   diverges. Real conduction electrons drift at ~10⁻⁴ m/s, so λ′/λ₀ = uv/c² < u/c is ~10⁻¹² or less: the
 *   figure uses imagined speeds near c to make the contraction visible.
 */

import { C_LIGHT, K, MU0 } from './constants';

/** v/c, the speed as a fraction of the speed of light. */
export const beta = (v: number): number => v / C_LIGHT;

/** The Lorentz factor γ = 1/√(1 − v²/c²) ≥ 1. Throws for |v| ≥ c, where no frame exists. */
export function lorentzGamma(v: number): number {
  const b2 = beta(v) ** 2;
  if (!(b2 < 1)) throw new RangeError(`speed ${v} m/s is not below the speed of light`);
  return 1 / Math.sqrt(1 - b2);
}

/** The small-speed approximation γ ≈ 1 + v²/(2c²); its error is about (3/8)(v/c)⁴. */
export const gammaSmallSpeed = (v: number): number => 1 + beta(v) ** 2 / 2;

/** Length of a rod of rest length L0 moving along its length at speed v: L0/γ [m]. */
export const contractedLength = (L0: number, v: number): number => L0 / lorentzGamma(v);

/** Line density of a line of charges whose rest-frame density is λ_rest, seen moving at v: γλ_rest [C/m]. */
export const movingLineDensity = (lambdaRest: number, v: number): number => lambdaRest * lorentzGamma(v);

/** Rest-frame line density of a line of charges seen with density λ_seen while moving at v: λ_seen/γ [C/m]. */
export const restLineDensity = (lambdaSeen: number, v: number): number => lambdaSeen / lorentzGamma(v);

/** Velocity of a body moving at u in the lab, seen from a frame that moves at v: (u − v)/(1 − uv/c²) [m/s]. */
export const relativeVelocity = (u: number, v: number): number => (u - v) / (1 - (u * v) / C_LIGHT ** 2);

/** The lab current along the axis: electrons (−λ₀) moving at u carry I = −λ₀u [A]. */
export const labCurrent = (lambda0: number, u: number): number => -lambda0 * u;

/** The wire as seen from a frame moving along it at v. */
export interface WireView {
  /** line density of the ions [C/m] (positive) */
  ions: number;
  /** line density of the electrons [C/m] (negative) */
  electrons: number;
  /** net line density, ions + electrons [C/m] */
  net: number;
  /** velocity of the ions and of the electrons in this frame [m/s] */
  ionVelocity: number;
  electronVelocity: number;
  /** current along the axis in this frame [A] */
  current: number;
}

/**
 * The neutral lab wire (ions +λ₀ at rest, electrons −λ₀ moving at u) seen from a frame moving at v.
 * v = 0 returns the lab itself.
 */
export function wireSeenFrom(lambda0: number, u: number, v: number): WireView {
  const ionVelocity = -v;
  const electronVelocity = relativeVelocity(u, v);
  const ions = movingLineDensity(lambda0, ionVelocity);
  const electrons = movingLineDensity(restLineDensity(-lambda0, u), electronVelocity);
  return {
    ions,
    electrons,
    net: ions + electrons,
    ionVelocity,
    electronVelocity,
    current: ions * ionVelocity + electrons * electronVelocity,
  };
}

/** Exact net line density in the frame moving at v: γ(v)·λ₀·uv/c² [C/m]. */
export const netLineDensity = (lambda0: number, u: number, v: number): number =>
  (lorentzGamma(v) * lambda0 * u * v) / C_LIGHT ** 2;

/** The same to order 1/c², written with the lab current: λ′ ≈ λ₀uv/c² = −Iv/c² [C/m]. */
export const netLineDensitySmallSpeed = (I: number, v: number): number => (-I * v) / C_LIGHT ** 2;

/**
 * Lab magnetic field at the charge, as the component along ẑ for a wire along ŷ and the charge on +x̂:
 * B_z = −μ₀I/(2πr) [T]. Its size is μ₀|I|/(2πr).
 */
export const labField = (lambda0: number, u: number, r: number): number => (-MU0 * labCurrent(lambda0, u)) / (2 * Math.PI * r);

/** Lab force on the charge, radial component (+ away from the wire): F = q·v·B_z = qμ₀λ₀uv/(2πr) [N]. */
export const labMagneticForce = (q: number, v: number, lambda0: number, u: number, r: number): number =>
  q * v * labField(lambda0, u, r);

/** Electric field of the wire in the charge's frame, radial component: 2kλ′/r [N/C]. */
export const chargeFrameField = (lambda0: number, u: number, v: number, r: number): number => {
  const { net } = wireSeenFrom(lambda0, u, v);
  return (2 * K * net) / r;
};

/** Force on the charge in its own rest frame, radial component: F′ = q·2kλ′/r [N]. */
export const chargeFrameElectricForce = (q: number, v: number, lambda0: number, u: number, r: number): number =>
  q * chargeFrameField(lambda0, u, v, r);

/** A force perpendicular to the motion, measured in the body's rest frame, as the lab measures it: F′/γ [N]. */
export const transverseForceInLab = (restFrameForce: number, v: number): number => restFrameForce / lorentzGamma(v);
