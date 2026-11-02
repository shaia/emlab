/**
 * Continuous charge distributions for chapter 6 (lessons 6.4–6.6): a finite rod, a ring and a disc,
 * in closed form and as the sum of N point charges that the closed form is the limit of; plus the
 * spherically and cylindrically symmetric volume charges of lesson 6.5.
 *
 * MODEL SPECIFICATION
 * - System: a thin straight rod of length L with uniform line density λ [C/m]; a thin ring of radius
 *   R with total charge Q; a disc of radius R with uniform surface density σ [C/m²]; a ball or an
 *   infinite cylinder with a volume density ρ(r) [C/m³]. Rods lie on the x axis, centred on the
 *   origin; rings and discs lie in the z = 0 plane, centred on the origin, axis along z.
 * - Dynamics: none (electrostatics). Each closed form is ∫ k·dq/r² (or ∫ k·dq/r) done by hand:
 *   rod  E = kλ/y·(u₂/r₂ − u₁/r₁) across, kλ(1/r₂ − 1/r₁) along; V = kλ·ln((u₂+r₂)/(u₁+r₁));
 *   ring axis E = kQz/(z²+R²)^{3/2}, V = kQ/√(z²+R²); disc axis E = σ/(2ε₀)(1 − z/√(z²+R²)),
 *   V = σ/(2ε₀)(√(z²+R²) − |z|). The discretised versions place N point charges at the midpoints of
 *   N equal pieces and superpose with `fieldAt` / `fieldAt3`.
 * - Boundary: V → 0 at infinity for the finite bodies. The infinite line and the infinite cylinder
 *   have no zero at infinity; their potentials are not given here.
 * - Ignored: the thickness of the rod and the ring; any conductor (the charge is glued in place).
 * - Valid when: the field point is not on the charge. The midpoint sum converges as O(1/N²) for a
 *   point whose distance to the body is large compared with the piece size; closer than one piece,
 *   the sum is dominated by the nearest point charge and is wrong.
 * - Failure modes: every field diverges on the body (y = 0 inside the rod, z = 0 on the disc's
 *   face is finite but jumps by σ/ε₀). The disc's axis formulas take z ≥ 0 and are odd/even in z.
 */

import { EPS0, K } from './constants';
import type { PointCharge, PointCharge3 } from './electrostatics';
import { riemann } from './calculus';
import type { Vec2 } from './vec';

/* ------------------------------------------------------------------ rod */

/** Rod from x = −L/2 to x = L/2: the signed offsets of its ends from a field point at x = px. */
const rodEnds = (L: number, px: number): [number, number] => [-L / 2 - px, L / 2 - px];

/** Field of a uniform rod (density λ, length L, on the x axis, centred) at the point p [N/C]. */
export function rodField(lambda: number, L: number, p: Vec2): Vec2 {
  const [u1, u2] = rodEnds(L, p[0]);
  const y = p[1];
  const r1 = Math.hypot(u1, y);
  const r2 = Math.hypot(u2, y);
  const ex = K * lambda * (1 / r2 - 1 / r1);
  const ey = y === 0 ? 0 : ((K * lambda) / y) * (u2 / r2 - u1 / r1);
  return [ex, ey];
}

/** Potential of the same rod at p, zero at infinity [V]. */
export function rodPotential(lambda: number, L: number, p: Vec2): number {
  const [u1, u2] = rodEnds(L, p[0]);
  const y = Math.abs(p[1]);
  // on the axis, beyond either end, ∫du/|u| = ln of the ratio of the end distances
  if (y === 0) return K * lambda * Math.log(Math.max(Math.abs(u1), Math.abs(u2)) / Math.min(Math.abs(u1), Math.abs(u2)));
  // ∫du/√(u² + y²) = asinh(u/y): the same as ln(u + r), without its cancellation for u < 0
  return K * lambda * (Math.asinh(u2 / y) - Math.asinh(u1 / y));
}

/** Field on the rod's perpendicular bisector at distance r: 2kλ·(L/2)/(r√(r² + L²/4)) [N/C]. */
export const rodBisectorField = (lambda: number, L: number, r: number): number =>
  (2 * K * lambda * (L / 2)) / (r * Math.hypot(r, L / 2));

/** Field on the rod's axis, a distance d beyond one end: kλL/(d(d+L)) = kQ/(d(d+L)) [N/C]. */
export const rodAxisField = (lambda: number, L: number, d: number): number => (K * lambda * L) / (d * (d + L));

/** Field of an infinite line charge at distance r: 2kλ/r = λ/(2πε₀r) [N/C]. */
export const lineField = (lambda: number, r: number): number => (2 * K * lambda) / r;

/** The rod as n point charges at the midpoints of n equal pieces (a 2D figure's charges). */
export function discretizeRod(lambda: number, L: number, n: number): PointCharge[] {
  const dx = L / n;
  return Array.from({ length: n }, (_, i) => ({ x: -L / 2 + (i + 0.5) * dx, y: 0, q: lambda * dx }));
}

/* ------------------------------------------------------------------ ring */

/** Field on a ring's axis at height z (signed): kQz/(z² + R²)^{3/2}, along +z for Q, z > 0 [N/C]. */
export const ringAxisField = (Q: number, R: number, z: number): number => (K * Q * z) / Math.pow(z * z + R * R, 1.5);

/** Potential on a ring's axis: kQ/√(z² + R²) [V]. */
export const ringAxisPotential = (Q: number, R: number, z: number): number => (K * Q) / Math.hypot(z, R);

/** Height where the ring's axial field is largest: z = R/√2. */
export const ringAxisPeak = (R: number): number => R / Math.SQRT2;

/** The ring as n point charges spread evenly on the circle (z = 0 plane). */
export function discretizeRing(Q: number, R: number, n: number): PointCharge3[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * (i + 0.5)) / n;
    return { pos: [R * Math.cos(t), R * Math.sin(t), 0] as const, q: Q / n };
  });
}

/* ------------------------------------------------------------------ disc */

/** Field on a disc's axis at height z ≥ 0: σ/(2ε₀)(1 − z/√(z² + R²)) [N/C]. R → ∞ gives σ/(2ε₀). */
export const discAxisField = (sigma: number, R: number, z: number): number =>
  (sigma / (2 * EPS0)) * (1 - z / Math.hypot(z, R));

/** Potential on a disc's axis: σ/(2ε₀)(√(z² + R²) − |z|) [V]. */
export const discAxisPotential = (sigma: number, R: number, z: number): number =>
  (sigma / (2 * EPS0)) * (Math.hypot(z, R) - Math.abs(z));

/**
 * The disc's axial field as a sum of `rings` concentric rings (midpoint radii), each a ring of charge
 * σ·2πr·Δr: the sum that becomes the integral ∫ k·z·σ·2πr dr/(z² + r²)^{3/2}.
 */
export function discAxisFieldByRings(sigma: number, R: number, z: number, rings: number): number {
  const dr = R / rings;
  let e = 0;
  for (let i = 0; i < rings; i++) {
    const r = (i + 0.5) * dr;
    e += ringAxisField(sigma * 2 * Math.PI * r * dr, r, z);
  }
  return e;
}

/** The disc as `rings` × `perRing` point charges (each ring evenly spread), z = 0 plane. */
export function discretizeDisc(sigma: number, R: number, rings: number, perRing: number): PointCharge3[] {
  const dr = R / rings;
  const out: PointCharge3[] = [];
  for (let i = 0; i < rings; i++) {
    const r = (i + 0.5) * dr;
    out.push(...discretizeRing(sigma * 2 * Math.PI * r * dr, r, perRing));
  }
  return out;
}

/* --------------------------------------------- volume charges (lesson 6.5) */

export type Density = (r: number) => number;

/** Charge inside radius r of a ball with density ρ(r): ∫₀ʳ ρ(s)·4πs² ds, midpoint sum [C]. */
export const ballEnclosed = (rho: Density, r: number, n = 2000): number =>
  r <= 0 ? 0 : riemann((s) => rho(s) * 4 * Math.PI * s * s, 0, r, n);

/** Radial field of a spherically symmetric ρ(r) (zero outside `R`), by Gauss: Q_in/(4πε₀r²) [N/C]. */
export function ballField(rho: Density, R: number, r: number, n = 2000): number {
  const qin = ballEnclosed((s) => (s <= R ? rho(s) : 0), Math.min(r, R), n);
  return qin / (4 * Math.PI * EPS0 * r * r);
}

/** Charge per unit length inside radius r of an infinite cylinder with density ρ(r): ∫₀ʳ ρ·2πs ds [C/m]. */
export const cylinderEnclosed = (rho: Density, r: number, n = 2000): number =>
  r <= 0 ? 0 : riemann((s) => rho(s) * 2 * Math.PI * s, 0, r, n);

/** Radial field of an infinite cylinder with density ρ(r) (zero outside `R`), by Gauss: λ_in/(2πε₀r) [N/C]. */
export function cylinderField(rho: Density, R: number, r: number, n = 2000): number {
  const lin = cylinderEnclosed((s) => (s <= R ? rho(s) : 0), Math.min(r, R), n);
  return lin / (2 * Math.PI * EPS0 * r);
}
