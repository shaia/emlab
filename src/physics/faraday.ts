/**
 * Faraday's bench for lesson 5.2: the flux of a bar magnet, or of a flat coil carrying a current,
 * through a coaxial coil, and the emf that a change of that flux induces.
 *
 * MODEL SPECIFICATION
 * - System: a flat coil of N turns, radius b, centred on the x axis at x = xc with its plane
 *   perpendicular to the axis (all N turns in one plane, so every turn has the same flux Φ), and one
 *   source on the same axis: either a bar magnet of length L and radius a, or a flat coil of Np turns
 *   and radius a carrying a current I. The coil's normal n̂ is +x; its positive sense of circulation is
 *   tied to n̂ by the right-hand rule (counter-clockwise seen from +x). Φ is measured along n̂.
 * - Dynamics: magnetostatics at each instant (quasi-static). The flux through one turn from a circular
 *   loop of radius a carrying I, coaxial at axial distance d, is Φ = M·I with the mutual inductance of
 *   two coaxial loops, M = μ₀√(ab)·[(2/k − k)·K(k) − (2/k)·E(k)], k² = 4ab/((a+b)² + d²), K and E the
 *   complete elliptic integrals. The bar magnet is the solenoid stand-in of magnets.ts: `loops` equal
 *   loops sharing its ampere-turns NI, spread evenly along its length, so its flux is a sum of mutual
 *   fluxes. Faraday's law closes it: ε = −N·dΦ/dt, with dΦ/dt = (∂Φ/∂x)·v for a source moving at v
 *   along the axis and (∂Φ/∂I)·dI/dt for a changing current.
 * - Boundary: fields vanish far from the sources; the coil and the source share one axis.
 * - Ignored: the coil's length (its turns are packed in one plane), the field of the induced current
 *   itself (self-inductance), iron, the leads to the coil, and the meter's own inductance.
 * - Valid when: the source moves slowly enough for the quasi-static field (always, at hand speeds); the
 *   magnet's radius stays below the coil's (a < b) whenever it passes through the coil's plane.
 * - Failure modes: a = b at d = 0 is a loop on top of a loop and M diverges (k = 1); callers keep the
 *   magnet thinner than the coil. A source far away gives k → 0, where the bracket cancels to O(k³): the
 *   code computes it from the tail of the arithmetic–geometric mean, without the cancellation.
 */

import { MU0 } from './constants';
import { derivative } from './calculus';
import type { BarMagnet } from './magnets';

/**
 * K(m) and the bracket (2/k − k)·K − (2/k)·E of the coaxial-loop formula, by the arithmetic–geometric
 * mean. E = K·(1 − m/2 − T) with T = Σ_{n≥1} 2^{n−1}·c_n², so the bracket is 2K·T/k exactly: computing T
 * directly avoids the cancellation of two nearly equal terms when k is small.
 */
function bracket(m: number): number {
  let a = 1;
  let b = Math.sqrt(1 - m);
  let tail = 0;
  let pow = 0.5;
  for (let i = 0; i < 40; i++) {
    const c = (a - b) / 2;
    const an = (a + b) / 2;
    b = Math.sqrt(a * b);
    a = an;
    pow *= 2;
    const term = pow * c * c;
    tail += term;
    if (term < 1e-300 || Math.abs(c) < 1e-17 * a) break;
  }
  const K = Math.PI / (2 * a);
  return (2 * K * tail) / Math.sqrt(m);
}

/**
 * Mutual inductance of two coaxial circular loops of radii a and b whose planes are a distance d apart:
 * the flux through one loop per ampere in the other [H]. Symmetric in a and b.
 */
export function coaxialMutual(a: number, b: number, d: number): number {
  const m = (4 * a * b) / ((a + b) * (a + b) + d * d);
  if (m >= 1) return Infinity;
  return MU0 * Math.sqrt(a * b) * bracket(m);
}

/**
 * Flux through one turn (radius b, plane at x = xc) of a coaxial flat coil of Np turns and radius a at
 * x = xs carrying I (counter-clockwise seen from +x for I > 0, so its field along the axis is +x) [Wb].
 */
export const coilCoilFlux = (Np: number, I: number, a: number, xs: number, b: number, xc = 0): number =>
  Np * I * coaxialMutual(a, b, xc - xs);

/** Loops in the bar magnet's solenoid stand-in when computing flux: converged to 10⁻⁴ for the bench. */
export const FLUX_LOOPS = 64;

/**
 * Flux through one turn (radius b, plane at x = xc) of a coaxial coil from a bar magnet lying on the
 * axis (y = 0): its N end points along +x for angle 0 and along −x for angle π [Wb]. The magnet is the
 * stack of loops of magnets.ts, so this is the flux of the field `barMagnetField` draws.
 */
export function magnetFlux(m: BarMagnet, b: number, xc = 0, loops = FLUX_LOOPS): number {
  const dir = Math.cos(m.angle) >= 0 ? 1 : -1;
  const Iper = m.NI / loops;
  let phi = 0;
  for (let i = 0; i < loops; i++) {
    const u = m.x - m.L / 2 + ((i + 0.5) * m.L) / loops;
    phi += Iper * coaxialMutual(m.R, b, xc - u);
  }
  return dir * phi;
}

/** Far-field limit: the flux of a small magnetic dipole m on the axis of a loop of radius b at distance z, μ₀mb²/(2(b²+z²)^{3/2}) [Wb]. */
export const dipoleLoopFlux = (moment: number, b: number, z: number): number =>
  (MU0 * moment * b * b) / (2 * Math.pow(b * b + z * z, 1.5));

/** dΦ/dx [Wb/m]: how fast the magnet's flux through the coil changes as the magnet moves along the axis. */
export const magnetFluxSlope = (m: BarMagnet, b: number, xc = 0, h = 1e-5): number =>
  derivative((x) => magnetFlux({ ...m, x }, b, xc), m.x, h);

/** dΦ/dx [Wb/m] for the flat source coil of `coilCoilFlux` moving along the axis. */
export const coilFluxSlope = (Np: number, I: number, a: number, xs: number, b: number, xc = 0, h = 1e-5): number =>
  derivative((x) => coilCoilFlux(Np, I, a, x, b, xc), xs, h);

/** Faraday's law for N turns: ε = −N·dΦ/dt [V], positive when it drives current in the positive sense. */
export const benchEmf = (N: number, dPhiDt: number): number => {
  const e = -N * dPhiDt;
  return e === 0 ? 0 : e; // no −0 for a figure to print
};
