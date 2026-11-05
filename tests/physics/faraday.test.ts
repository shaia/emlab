import { describe, expect, it } from 'vitest';
import { MU0 } from '~/physics/constants';
import { riemann } from '~/physics/calculus';
import { averageEmf } from '~/physics/induction';
import { ellipticKE, loopField } from '~/physics/magnetism';
import { barMagnetField, type BarMagnet } from '~/physics/magnets';
import {
  benchEmf,
  coaxialMutual,
  coilCoilFlux,
  coilFluxSlope,
  dipoleLoopFlux,
  magnetFlux,
  magnetFluxSlope,
} from '~/physics/faraday';
import { relativeError } from '~/physics/vec';

/** the bench magnet of figure 5.2: 8 cm long, 1 cm radius */
const BAR: BarMagnet = { x: -0.1, y: 0, angle: 0, L: 0.08, R: 0.01, NI: 12000 };
const B_COIL = 0.03;

/** Flux through a disc of radius b at axial distance d from a loop (radius a, current I), by the midpoint rule on n rings. */
const discFlux = (I: number, a: number, b: number, d: number, n: number) =>
  riemann((r) => loopField(I, a, r, d).z * 2 * Math.PI * r, 0, b, n, 'mid');

/** The textbook form of the coaxial-loop formula, with K and E from magnetism.ts (cancels for small k). */
function mutualTextbook(a: number, b: number, d: number): number {
  const m = (4 * a * b) / ((a + b) ** 2 + d * d);
  const k = Math.sqrt(m);
  const { K, E } = ellipticKE(m);
  return MU0 * Math.sqrt(a * b) * ((2 / k - k) * K - (2 / k) * E);
}

describe('analytic limits', () => {
  it('a small loop far away is a dipole: Φ through the big loop → μ₀(Iπa²)b²/(2(b²+d²)^{3/2}), at any distance', () => {
    const a = 1e-4;
    for (const d of [0, 0.02, 0.1, 0.5]) {
      const M = coaxialMutual(a, B_COIL, d);
      expect(relativeError(M, dipoleLoopFlux(Math.PI * a * a, B_COIL, d))).toBeLessThan(1e-5);
    }
  });

  it('a small loop at the centre of a big one: M → μ₀πa²/(2b), the centre field times the small area', () => {
    // the first correction is of order (a/b)²
    const a = 2e-5;
    expect(relativeError(coaxialMutual(a, 0.05, 0), (MU0 * Math.PI * a * a) / (2 * 0.05))).toBeLessThan(1e-6);
  });

  it('a bar magnet far along the axis is a dipole of moment NI·πa²', () => {
    const z = 0.6;
    const far = { ...BAR, x: -z };
    const dip = dipoleLoopFlux(BAR.NI * Math.PI * BAR.R ** 2, B_COIL, z);
    expect(relativeError(magnetFlux(far, B_COIL), dip)).toBeLessThan(0.01);
  });

  it('the flux agrees with the textbook elliptic-integral formula where that one does not cancel', () => {
    for (const d of [0, 0.01, 0.03, 0.1]) {
      expect(relativeError(coaxialMutual(0.01, B_COIL, d), mutualTextbook(0.01, B_COIL, d))).toBeLessThan(1e-12);
    }
  });

  it('nothing changes, nothing is induced: a magnet at rest gives ε = 0 however large its flux', () => {
    const atCentre = { ...BAR, x: 0 };
    expect(magnetFlux(atCentre, B_COIL)).toBeGreaterThan(1e-5);
    expect(benchEmf(200, magnetFluxSlope(atCentre, B_COIL) * 0)).toBe(0);
  });
});

describe('symmetry and conservation', () => {
  it('reciprocity: the flux through b from a equals the flux through a from b, M(a, b) = M(b, a)', () => {
    for (const d of [0, 0.015, 0.07]) {
      expect(relativeError(coaxialMutual(0.012, 0.03, d), coaxialMutual(0.03, 0.012, d))).toBeLessThan(1e-12);
    }
  });

  it('the flux is the same on both sides of the coil, and flipping the magnet reverses it', () => {
    const left = magnetFlux({ ...BAR, x: -0.05 }, B_COIL);
    const right = magnetFlux({ ...BAR, x: 0.05 }, B_COIL);
    expect(relativeError(left, right)).toBeLessThan(1e-12);
    expect(relativeError(magnetFlux({ ...BAR, x: -0.05, angle: Math.PI }, B_COIL), -left)).toBeLessThan(1e-12);
  });

  it('the flux peaks with the magnet centred in the coil, and dΦ/dx is zero there', () => {
    const c = magnetFlux({ ...BAR, x: 0 }, B_COIL);
    for (const x of [-0.03, -0.01, 0.01, 0.03]) expect(magnetFlux({ ...BAR, x }, B_COIL)).toBeLessThan(c);
    expect(Math.abs(magnetFluxSlope({ ...BAR, x: 0 }, B_COIL))).toBeLessThan(1e-9);
  });

  it('a magnet pushed in and then out the far side: the emf adds up to −NΔΦ, so in and out cancel', () => {
    // a constant speed of 0.5 m/s from x = −0.4 to 0 and on to +0.4; ∫ε dt = −N·[Φ(end) − Φ(start)]
    const N = 200;
    const v = 0.5;
    const emfAt = (t: number) => benchEmf(N, magnetFluxSlope({ ...BAR, x: -0.4 + v * t }, B_COIL) * v);
    const inward = riemann(emfAt, 0, 0.8, 800, 'mid');
    const phi0 = magnetFlux({ ...BAR, x: -0.4 }, B_COIL);
    const phiC = magnetFlux({ ...BAR, x: 0 }, B_COIL);
    expect(relativeError(inward, -N * (phiC - phi0))).toBeLessThan(1e-4);
    const through = riemann(emfAt, 0, 1.6, 1600, 'mid');
    expect(Math.abs(through)).toBeLessThan(1e-6 * Math.abs(inward));
    // the average emf of the push-in is the shared averageEmf of induction.ts
    expect(relativeError(inward / 0.8, averageEmf(N, phi0, phiC, 0.8))).toBeLessThan(1e-4);
  });
});

describe('scaling', () => {
  it('M grows in proportion to the size when every length is scaled together', () => {
    const lam = 3.7;
    expect(relativeError(coaxialMutual(0.01 * lam, 0.03 * lam, 0.02 * lam), lam * coaxialMutual(0.01, 0.03, 0.02))).toBeLessThan(1e-12);
  });

  it('the flux is proportional to the source strength: the magnet’s NI, the coil’s Np·I', () => {
    expect(relativeError(magnetFlux({ ...BAR, NI: 3 * BAR.NI }, B_COIL), 3 * magnetFlux(BAR, B_COIL))).toBeLessThan(1e-12);
    expect(relativeError(coilCoilFlux(100, 2, 0.02, -0.04, B_COIL), 2 * coilCoilFlux(100, 1, 0.02, -0.04, B_COIL))).toBeLessThan(1e-12);
  });

  it('the emf is proportional to N and to the speed: ε = −N·(dΦ/dx)·v', () => {
    const slope = magnetFluxSlope(BAR, B_COIL);
    expect(slope).toBeGreaterThan(0);
    const e1 = benchEmf(100, slope * 0.2);
    expect(relativeError(benchEmf(300, slope * 0.2), 3 * e1)).toBeLessThan(1e-12);
    expect(relativeError(benchEmf(100, slope * 0.6), 3 * e1)).toBeLessThan(1e-12);
    // approaching with N toward the coil, the flux along +x grows, so ε < 0 (against the positive sense)
    expect(e1).toBeLessThan(0);
  });
});

describe('convergence', () => {
  it('the closed form matches a numerical integral of the loop field over the disc, the error shrinking as O(1/n²)', () => {
    const exact = coaxialMutual(0.02, B_COIL, 0.025);
    const e1 = relativeError(discFlux(1, 0.02, B_COIL, 0.025, 50), exact);
    const e2 = relativeError(discFlux(1, 0.02, B_COIL, 0.025, 200), exact);
    expect(e2).toBeLessThan(2e-4);
    expect(e1 / e2).toBeGreaterThan(10);
  });

  it('the magnet’s flux equals the integral of the drawn field (barMagnetField) over the coil’s disc', () => {
    const m = { ...BAR, x: -0.06 };
    const viaField = riemann((r) => barMagnetField(m, 0, r, 48)[0] * 2 * Math.PI * r, 0, B_COIL, 400, 'mid');
    expect(relativeError(magnetFlux(m, B_COIL, 0, 48), viaField)).toBeLessThan(1e-4);
  });

  it('64 loops are enough: doubling them changes the flux by less than 10⁻⁴', () => {
    for (const x of [-0.12, -0.05, -0.02, 0]) {
      const m = { ...BAR, x };
      expect(relativeError(magnetFlux(m, B_COIL, 0, 64), magnetFlux(m, B_COIL, 0, 128))).toBeLessThan(1e-4);
    }
  });

  it('dΦ/dx of a moving coil agrees with the secant through two nearby positions', () => {
    const s = coilFluxSlope(100, 2, 0.02, -0.05, B_COIL);
    const h = 1e-4;
    const secant = (coilCoilFlux(100, 2, 0.02, -0.05 + h, B_COIL) - coilCoilFlux(100, 2, 0.02, -0.05 - h, B_COIL)) / (2 * h);
    expect(relativeError(s, secant)).toBeLessThan(1e-5);
  });
});
