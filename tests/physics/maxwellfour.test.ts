import { describe, expect, it } from 'vitest';
import { EPS0, EPS0_DISPLAY, K, MU0 } from '~/physics/constants';
import { COIL_H, COIL_K, COIL_W, flatCoilB, SOL_R } from '~/physics/maxwell';
import {
  ampereReading,
  bandOf,
  circleOverlapArea,
  cubeFlux,
  faradayCircle,
  gapFieldRate,
  SCENE_CHARGES,
  sphereGauss,
  vacuumFrequency,
  vacuumWavelength,
  waveSpeed,
} from '~/physics/maxwellfour';
import { relativeError } from '~/physics/vec';

const charges = SCENE_CHARGES;
const coil = flatCoilB(COIL_K, COIL_W, COIL_H);

describe('analytic limits', () => {
  it('a sphere around one charge carries q/ε₀ = 4πkq, whatever its radius', () => {
    for (const R of [0.01, 0.02, 0.04]) {
      const g = sphereGauss(charges, [-0.04, 0, 0], R);
      expect(relativeError(g.flux, 4 * Math.PI * K * 4e-9)).toBeLessThan(1e-4);
      expect(relativeError(g.rhs, 4e-9 / EPS0)).toBeLessThan(1e-12);
    }
  });

  it('a sphere that encloses no charge has zero net flux, though the field on it is not zero', () => {
    const g = sphereGauss(charges, [0, 0.05, 0], 0.02);
    expect(g.enclosed).toBe(0);
    expect(Math.abs(g.flux)).toBeLessThan(1e-3 * (4e-9 / EPS0));
  });

  it('the overlap of two discs: none when apart, the smaller disc when inside, 2π/3 − √3/2 for unit discs a radius apart', () => {
    expect(circleOverlapArea(1, 1, 2.5)).toBe(0);
    expect(circleOverlapArea(3, 1, 1)).toBeCloseTo(Math.PI, 12);
    expect(relativeError(circleOverlapArea(1, 1, 1), (2 * Math.PI) / 3 - Math.sqrt(3) / 2)).toBeLessThan(1e-12);
  });

  it('Faraday: a centred circle inside the core has ∮E·dl = −πr²·dB/dt, and one outside the core −πR²·dB/dt', () => {
    const inside = faradayCircle(0.05, 2, SOL_R, 0, 0, 0.03);
    expect(relativeError(inside.circulation, -Math.PI * 0.03 ** 2 * 2)).toBeLessThan(1e-4);
    const outside = faradayCircle(0.05, 2, SOL_R, 0, 0, 0.07);
    expect(relativeError(outside.circulation, -Math.PI * SOL_R ** 2 * 2)).toBeLessThan(1e-4);
    expect(relativeError(outside.rhs, -Math.PI * SOL_R ** 2 * 2)).toBeLessThan(1e-12);
  });

  it('Faraday: a path that encloses none of the core has zero circulation, though E on it is not zero', () => {
    const f = faradayCircle(0.05, 2, SOL_R, 0.07, 0, 0.01);
    expect(f.rhs).toBe(0);
    expect(Math.abs(f.circulation)).toBeLessThan(1e-9);
  });

  it('Ampère–Maxwell: around the wire both surfaces give μ₀I once Maxwell’s term is in; without it the bag gives 0', () => {
    const flat = ampereReading('wire', 'flat', 0.03, 0.05, 2);
    const bag = ampereReading('wire', 'bulge', 0.03, 0.05, 2);
    expect(relativeError(flat.circulation, MU0 * 2)).toBeLessThan(1e-12);
    expect(relativeError(flat.ampereOld, flat.circulation)).toBeLessThan(1e-12);
    expect(bag.ampereOld).toBe(0);
    expect(relativeError(bag.ampereMaxwell, bag.circulation)).toBeLessThan(1e-12);
    expect(bag.displacement).toBe(2);
  });

  it('Ampère–Maxwell: in the gap no charge moves, and the displacement current alone matches the circulation', () => {
    for (const r of [0.01, 0.03, 0.05, 0.07]) {
      const g = ampereReading('gap', 'flat', r, 0.05, 2);
      expect(g.conduction).toBe(0);
      expect(g.ampereOld).toBe(0);
      expect(relativeError(g.ampereMaxwell, g.circulation)).toBeLessThan(1e-12);
    }
    // a path wider than the plates takes in the whole gap: the displacement current equals the wire's
    expect(ampereReading('gap', 'flat', 0.07, 0.05, 2).displacement).toBe(2);
  });
});

describe('conservation', () => {
  it('Gauss for B: the flux out of a cube equals the flux into it, wherever the cube is, the north pole included', () => {
    for (const [x, y, a] of [
      [0, COIL_H, 0.03],
      [0, 0, 0.03],
      [0.04, 0.02, 0.03],
      [0, COIL_H, 0.06],
      [0.01, 0.03, 0.02],
    ]) {
      const c = cubeFlux(coil, x, y, a);
      expect(c.out).toBeGreaterThan(0);
      expect(relativeError(c.out, c.in)).toBeLessThan(1e-5);
    }
  });

  it('Gauss for E: the flux counts the enclosed charge with its sign, and no charge outside', () => {
    const both = sphereGauss(charges, [0, 0, 0], 0.08);
    expect(both.enclosed).toBeCloseTo(2e-9, 18);
    expect(relativeError(both.flux, both.rhs)).toBeLessThan(1e-4);
    const neg = sphereGauss(charges, [0.03, 0, 0], 0.03);
    expect(neg.enclosed).toBeCloseTo(-2e-9, 18);
    expect(relativeError(neg.flux, neg.rhs)).toBeLessThan(1e-4);
  });

  it('the charging current reappears between the plates as ε₀·dΦ_E/dt: ε₀·A·dE/dt = I', () => {
    const A = 0.02;
    expect(relativeError(EPS0 * A * gapFieldRate(2, A), 2)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('the circulation of the induced E grows as r² inside the core and stops growing outside it', () => {
    const c1 = faradayCircle(0.05, 2, SOL_R, 0, 0, 0.01).circulation;
    const c2 = faradayCircle(0.05, 2, SOL_R, 0, 0, 0.02).circulation;
    expect(relativeError(c2 / c1, 4)).toBeLessThan(1e-4);
    const c6 = faradayCircle(0.05, 2, SOL_R, 0, 0, 0.06).circulation;
    const c9 = faradayCircle(0.05, 2, SOL_R, 0, 0, 0.09).circulation;
    expect(relativeError(c9, c6)).toBeLessThan(1e-4);
  });

  it('the circulation follows dB/dt in size and sign, and not B itself', () => {
    const up = faradayCircle(0.05, 2, SOL_R, 0, 0, 0.03).circulation;
    const down = faradayCircle(0.05, -1, SOL_R, 0, 0, 0.03).circulation;
    const big = faradayCircle(0.5, 2, SOL_R, 0, 0, 0.03).circulation;
    expect(up).toBeLessThan(0); // B out of the page and growing: E turns clockwise, against the walk
    expect(relativeError(down / up, -0.5)).toBeLessThan(1e-9);
    expect(relativeError(big, up)).toBeLessThan(1e-12);
  });

  it('every frequency travels at the same speed in vacuum: λ·f = c, and λ halves when f doubles', () => {
    for (const f of [50, 1e8, 2.45e9, 5.6e14, 3e18]) {
      expect(relativeError(vacuumWavelength(f) * f, waveSpeed())).toBeLessThan(1e-12);
      expect(relativeError(vacuumWavelength(2 * f), vacuumWavelength(f) / 2)).toBeLessThan(1e-12);
      expect(relativeError(vacuumFrequency(vacuumWavelength(f)), f)).toBeLessThan(1e-12);
    }
  });

  it('c = 1/√(μ₀ε₀) is 3·10⁸ m/s from the engine’s constants and within 0.05% of it with the sheet’s ε₀', () => {
    expect(relativeError(waveSpeed(), 3e8)).toBeLessThan(1e-12);
    expect(relativeError(1 / Math.sqrt(MU0 * EPS0_DISPLAY), 3e8)).toBeLessThan(5e-4);
  });

  it('the spectrum runs from radio to gamma as the wavelength shrinks', () => {
    expect(bandOf(vacuumWavelength(50))).toBe('radio');
    expect(bandOf(vacuumWavelength(1e8))).toBe('radio');
    expect(bandOf(vacuumWavelength(2.45e9))).toBe('microwave');
    expect(bandOf(vacuumWavelength(3e13))).toBe('infrared');
    expect(bandOf(vacuumWavelength(5.6e14))).toBe('visible');
    expect(bandOf(vacuumWavelength(1.5e15))).toBe('ultraviolet');
    expect(bandOf(vacuumWavelength(3e18))).toBe('xray');
    expect(bandOf(vacuumWavelength(3e21))).toBe('gamma');
  });
});

describe('convergence', () => {
  it('the lattice sum over the sphere converges to q/ε₀ as the lattice is refined', () => {
    const exact = 4e-9 / EPS0;
    const err = (n: number) => relativeError(sphereGauss(charges, [-0.02, 0, 0], 0.024, n).flux, exact);
    expect(err(24000)).toBeLessThan(err(1500));
    expect(err(24000)).toBeLessThan(1e-4);
  });

  it('the polygon circulation converges to −dB/dt times the enclosed core area, also off centre', () => {
    const f = (n: number) => faradayCircle(0.05, 2, SOL_R, 0.02, 0.01, 0.03, n);
    const e = (n: number) => relativeError(f(n).circulation, f(n).rhs);
    expect(e(720)).toBeLessThan(e(90));
    expect(e(720)).toBeLessThan(1e-4);
  });
});
