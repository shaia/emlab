/**
 * Flux as a surface integral (lesson 6.5): the flux of a point charge through each face of a cube,
 * exactly (by solid angle) and as the patch sum Σ E·ΔA that the surface integral is the limit of;
 * and the closed-form fields of a ball and of an infinite cylinder whose density is a power of r,
 * ρ ∝ (r/R)ⁿ, normalised to a given total charge, which Gauss's law gives in one line.
 *
 * MODEL SPECIFICATION
 * - System: (a) a point charge q at p and an axis-aligned cube of side a centred at c (the charge may
 *   be inside or outside); (b) a ball of radius R, total charge Q, density ρ(r) = ρ₀(r/R)ⁿ; (c) an
 *   infinite cylinder of radius R, charge λ per unit length, density ρ(r) = ρ₀(r/R)ⁿ, r measured from
 *   the axis. n > −3 for the ball and n > −2 for the cylinder keeps the enclosed charge finite; the
 *   lesson uses n = 0 (uniform), 1 and −1.
 * - Dynamics: none (electrostatics). (a) The flux of a point charge through a flat patch is kq times
 *   the solid angle Ω the patch subtends, signed by the side the charge is on. For a rectangle
 *   [x₁,x₂]×[y₁,y₂] in a plane at distance h, with the foot of the perpendicular at the origin,
 *   Ω = F(x₂,y₂) − F(x₁,y₂) − F(x₂,y₁) + F(x₁,y₁), F(x,y) = atan(xy / (h√(h²+x²+y²))).
 *   The patch sum puts n×n equal squares on each face and adds E·n̂ ΔA at their midpoints.
 *   (b) Q_in(r) = Q(r/R)^{n+3}, E = kQ_in/r² = kQ r^{n+1}/R^{n+3} inside, kQ/r² outside.
 *   (c) λ_in(r) = λ(r/R)^{n+2}, E = 2kλ_in/r = 2kλ r^{n+1}/R^{n+2} inside, 2kλ/r outside.
 *   ρ₀ = (n+3)Q/(4πR³) for the ball and (n+2)λ/(2πR²) for the cylinder.
 * - Boundary: none needed; the fields of (b) and (c) follow from Gauss's law and symmetry alone.
 * - Ignored: the charge is glued in place (no conductor); the cylinder has no ends.
 * - Valid when: (a) the charge is not on a face plane inside the face (the flux through that face is
 *   then ±2πkq and the patch sum is meaningless). The patch sum converges as O(1/n²) while the charge
 *   is farther from every face than a patch is wide; closer, the nearest patch dominates and the sum is
 *   far off. (b), (c) any r > 0; E is continuous at r = R.
 * - Failure modes: for n < 0 the density diverges at the centre (integrable for n > −3 in the ball and
 *   n > −2 in the cylinder); the field there is still finite for n ≥ −1.
 */

import { EPS0, K } from './constants';
import { fieldAt3, type PointCharge3 } from './electrostatics';
import type { Vec3 } from './vec';

/* ----------------------------------------------------------- cube faces */

/** The six faces of a cube, in the order the figure lists them: +x, −x, +y, −y, +z, −z. */
export const FACES = [
  { axis: 0, sign: 1 },
  { axis: 0, sign: -1 },
  { axis: 1, sign: 1 },
  { axis: 1, sign: -1 },
  { axis: 2, sign: 1 },
  { axis: 2, sign: -1 },
] as const;

const cornerTerm = (x: number, y: number, h: number) => Math.atan((x * y) / (h * Math.sqrt(h * h + x * x + y * y)));

/**
 * Solid angle [sr] of the rectangle [x1,x2]×[y1,y2] seen from a point at height h > 0 above its plane,
 * with the foot of the perpendicular at (0, 0). The whole plane gives 2π.
 */
export function rectSolidAngle(h: number, x1: number, x2: number, y1: number, y2: number): number {
  return cornerTerm(x2, y2, h) - cornerTerm(x1, y2, h) - cornerTerm(x2, y1, h) + cornerTerm(x1, y1, h);
}

/** Exact outward flux of a point charge q at p through each face of the cube (centre c, side a) [N·m²/C]. */
export function cubeFaceFluxes(q: number, p: Vec3, c: Vec3, a: number): number[] {
  const h = a / 2;
  return FACES.map(({ axis, sign }) => {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    // distance from the charge to the face plane, positive when the charge is on the inner side
    const d = sign * (c[axis] + sign * h - p[axis]);
    if (d === 0) return 0;
    const omega = rectSolidAngle(Math.abs(d), c[u] - h - p[u], c[u] + h - p[u], c[v] - h - p[v], c[v] + h - p[v]);
    return Math.sign(d) * K * q * omega;
  });
}

/** One face as an n×n patch sum: Σ E·n̂ ΔA at the midpoints of n×n equal squares [N·m²/C]. */
export function facePatchFlux(charges: readonly PointCharge3[], c: Vec3, a: number, face: number, n: number): number {
  const { axis, sign } = FACES[face];
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const h = a / 2;
  const d = a / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const pt: [number, number, number] = [c[0], c[1], c[2]];
      pt[axis] += sign * h;
      pt[u] += -h + (i + 0.5) * d;
      pt[v] += -h + (j + 0.5) * d;
      s += sign * fieldAt3(charges, pt)[axis];
    }
  }
  return s * d * d;
}

/** All six faces as patch sums, in FACES order. */
export const cubePatchFluxes = (charges: readonly PointCharge3[], c: Vec3, a: number, n: number): number[] =>
  FACES.map((_, f) => facePatchFlux(charges, c, a, f, n));

/** The normal component E·n̂ at the patch midpoints of one face, row by row [N/C]: how much it varies. */
export function facePatchNormals(charges: readonly PointCharge3[], c: Vec3, a: number, face: number, n: number): number[] {
  const { axis, sign } = FACES[face];
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const h = a / 2;
  const d = a / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const pt: [number, number, number] = [c[0], c[1], c[2]];
      pt[axis] += sign * h;
      pt[u] += -h + (i + 0.5) * d;
      pt[v] += -h + (j + 0.5) * d;
      out.push(sign * fieldAt3(charges, pt)[axis]);
    }
  }
  return out;
}

/** Is p strictly inside the cube? */
export const insideCube = (p: Vec3, c: Vec3, a: number): boolean =>
  Math.abs(p[0] - c[0]) < a / 2 && Math.abs(p[1] - c[1]) < a / 2 && Math.abs(p[2] - c[2]) < a / 2;

/* --------------------------------------- ball and cylinder with ρ ∝ (r/R)ⁿ */

/** ρ₀, the density at r = R, of a ball of total charge Q with ρ = ρ₀(r/R)ⁿ [C/m³]. */
export const powerBallRho0 = (Q: number, R: number, n: number): number => ((n + 3) * Q) / (4 * Math.PI * R ** 3);

/** The density of that ball at r [C/m³] (zero outside). */
export const powerBallDensity = (Q: number, R: number, n: number, r: number): number =>
  r > R ? 0 : powerBallRho0(Q, R, n) * (r / R) ** n;

/** Charge inside radius r: Q(r/R)^{n+3} inside, Q outside [C]. */
export const powerBallEnclosed = (Q: number, R: number, n: number, r: number): number => (r >= R ? Q : Q * (r / R) ** (n + 3));

/** Radial field by Gauss: kQ_in/r² [N/C]. */
export const powerBallField = (Q: number, R: number, n: number, r: number): number => (K * powerBallEnclosed(Q, R, n, r)) / (r * r);

/** ρ₀ of an infinite cylinder with λ per unit length and ρ = ρ₀(r/R)ⁿ [C/m³]. */
export const powerCylinderRho0 = (lambda: number, R: number, n: number): number => ((n + 2) * lambda) / (2 * Math.PI * R * R);

/** The density of that cylinder at distance r from the axis [C/m³]. */
export const powerCylinderDensity = (lambda: number, R: number, n: number, r: number): number =>
  r > R ? 0 : powerCylinderRho0(lambda, R, n) * (r / R) ** n;

/** Charge per unit length inside radius r: λ(r/R)^{n+2} inside, λ outside [C/m]. */
export const powerCylinderEnclosed = (lambda: number, R: number, n: number, r: number): number =>
  r >= R ? lambda : lambda * (r / R) ** (n + 2);

/** Radial field by Gauss on a coaxial cylinder: λ_in/(2πε₀r) = 2kλ_in/r [N/C]. */
export const powerCylinderField = (lambda: number, R: number, n: number, r: number): number =>
  powerCylinderEnclosed(lambda, R, n, r) / (2 * Math.PI * EPS0 * r);

/**
 * Flux through the three parts of a coaxial Gaussian cylinder of radius r and length L around that
 * cylinder: the side carries E·2πrL, each cap carries nothing (E lies in the cap) [N·m²/C].
 */
export function gaussCylinderPieces(lambda: number, R: number, n: number, r: number, L: number): { side: number; caps: number } {
  return { side: powerCylinderField(lambda, R, n, r) * 2 * Math.PI * r * L, caps: 0 };
}
