import { describe, expect, it } from 'vitest';
import { derivative, riemann } from '~/physics/calculus';
import { rcDischarge } from '~/physics/circuits';
import { energyQC } from '~/physics/capacitors';
import { pairEnergy } from '~/physics/potential';
import {
  CAP_C,
  CASES,
  COULOMB_Q1,
  COULOMB_Q2,
  RC_C,
  RC_R,
  RC_V0,
  areaParts,
  doublingRatio,
  exactIntegral,
  relativeSumError,
  sumError,
  unsignedArea,
  type CaseId,
} from '~/physics/integrals';
import { relativeError } from '~/physics/vec';

const IDS = Object.keys(CASES) as CaseId[];

describe('analytic limits', () => {
  it('every antiderivative has the integrand as its derivative (F′ = f)', () => {
    for (const id of IDS) {
      const c = CASES[id];
      for (const t of [0.3, 0.6, 0.9]) {
        const x = c.a + t * (c.bMax - c.a);
        const h = 1e-5 * (c.bMax - c.a);
        expect(relativeError(derivative(c.F, x, h), c.f(x)), `${id} at ${x}`).toBeLessThan(1e-6);
      }
    }
  });

  it('the work of the Coulomb force out to a far distance is the pair energy kq₁q₂/r of lesson 2.1', () => {
    const c = CASES.coulomb;
    expect(relativeError(exactIntegral(c, 0.1, 1e9), pairEnergy(COULOMB_Q1, COULOMB_Q2, 0.1))).toBeLessThan(1e-9);
  });

  it('the work of the Coulomb force between two distances is the drop in pair energy', () => {
    const c = CASES.coulomb;
    const w = exactIntegral(c, 0.1, 0.5);
    expect(relativeError(w, pairEnergy(COULOMB_Q1, COULOMB_Q2, 0.1) - pairEnergy(COULOMB_Q1, COULOMB_Q2, 0.5))).toBeLessThan(1e-12);
  });

  it('the charge under a discharge current, after many τ, is all the charge CV₀ the capacitor held', () => {
    const c = CASES.discharge;
    expect(relativeError(exactIntegral(c, 0, 40), RC_C * RC_V0)).toBeLessThan(1e-12);
    // and after time T it is the charge that left the plates, q(0) − q(T)
    const T = 2;
    expect(relativeError(exactIntegral(c, 0, T), RC_C * RC_V0 - rcDischarge(T, RC_V0, RC_R, RC_C).q)).toBeLessThan(1e-12);
  });

  it('the area under V(q) = q/C up to Q is the stored energy Q²/(2C) of lesson 2.7', () => {
    const c = CASES.capacitor;
    expect(relativeError(riemann(c.f, 0, 6e-5, 1000), energyQC(6e-5, CAP_C))).toBeLessThan(1e-9);
  });

  it('on a straight line the midpoint and trapezoid sums are exact for every N', () => {
    for (const id of ['accel', 'velocity', 'capacitor'] as const) {
      const c = CASES[id];
      for (const rule of ['mid', 'trapezoid'] as const) {
        for (const n of [1, 3, 7]) {
          expect(Math.abs(sumError(c, c.a, c.bMax, n, rule)), `${id} ${rule} N=${n}`).toBeLessThan(1e-12 * unsignedArea(c, c.a, c.bMax));
        }
      }
    }
  });

  it('the hand-countable cases: area under 2t from 0 to 10 s is 100 m, under x² from 0 to 3 is 9', () => {
    expect(exactIntegral(CASES.accel, 0, 10)).toBeCloseTo(100, 12);
    expect(exactIntegral(CASES.parabola, 0, 3)).toBeCloseTo(9, 12);
    expect(exactIntegral(CASES.sine, 0, Math.PI)).toBeCloseTo(2, 12);
  });

  it('an interval of zero width has zero area', () => {
    for (const id of IDS) expect(exactIntegral(CASES[id], CASES[id].a, CASES[id].a)).toBe(0);
  });
});

describe('identities (the fundamental theorem and signed area)', () => {
  it('the Riemann sum converges to F(b) − F(a) for every case', () => {
    for (const id of IDS) {
      const c = CASES[id];
      const err = Math.abs(riemann(c.f, c.a, c.bMax, 4000, 'mid') - exactIntegral(c, c.a, c.bMax));
      expect(err, id).toBeLessThan(1e-6 * unsignedArea(c, c.a, c.bMax));
    }
  });

  it('integrals add over adjacent intervals: ∫ₐᶜ + ∫ᶜᵇ = ∫ₐᵇ', () => {
    for (const id of IDS) {
      const c = CASES[id];
      const m = c.a + 0.37 * (c.bMax - c.a);
      expect(exactIntegral(c, c.a, m) + exactIntegral(c, m, c.bMax)).toBeCloseTo(exactIntegral(c, c.a, c.bMax), 10);
    }
  });

  it('the signed area is the area above the axis minus the area below it', () => {
    for (const id of ['sine', 'velocity'] as const) {
      const c = CASES[id];
      const { above, below } = areaParts(c, c.a, c.bMax);
      expect(above - below).toBeCloseTo(exactIntegral(c, c.a, c.bMax), 5);
      expect(above + below).toBeCloseTo(unsignedArea(c, c.a, c.bMax), 5);
    }
  });

  it('the car of v = 4 − 2t: 4 m forward, 9 m back, displacement −5 m, distance 13 m, back at the start at t = 4 s', () => {
    const c = CASES.velocity;
    const { above, below } = areaParts(c, 0, 5);
    expect(above).toBeCloseTo(4, 5);
    expect(below).toBeCloseTo(9, 5);
    expect(exactIntegral(c, 0, 5)).toBeCloseTo(-5, 12);
    expect(unsignedArea(c, 0, 5)).toBeCloseTo(13, 5);
    expect(exactIntegral(c, 0, 4)).toBeCloseTo(0, 12);
  });

  it('sin over a full period has zero signed area, and the area function peaks where f = 0 (x = π)', () => {
    const c = CASES.sine;
    expect(exactIntegral(c, 0, 2 * Math.PI)).toBeCloseTo(0, 12);
    const A = (x: number) => exactIntegral(c, 0, x);
    expect(Math.abs(derivative(A, Math.PI))).toBeLessThan(1e-9);
    expect(A(Math.PI)).toBeGreaterThan(A(Math.PI - 0.1));
    expect(A(Math.PI)).toBeGreaterThan(A(Math.PI + 0.1));
  });
});

describe('scaling', () => {
  it('doubling one charge doubles the work of the Coulomb force', () => {
    const w1 = exactIntegral(CASES.coulomb, 0.1, 0.5);
    const w2 = riemann((r) => 2 * CASES.coulomb.f(r), 0.1, 0.5, 4000);
    expect(relativeError(w2, 2 * w1)).toBeLessThan(1e-6);
  });

  it('charging to twice the charge stores four times the energy (the area grows as Q²)', () => {
    const c = CASES.capacitor;
    expect(relativeError(exactIntegral(c, 0, 6e-5), 4 * exactIntegral(c, 0, 3e-5))).toBeLessThan(1e-12);
  });

  it('the area under x² from 0 to b grows as b³', () => {
    const c = CASES.parabola;
    expect(relativeError(exactIntegral(c, 0, 3), 8 * exactIntegral(c, 0, 1.5))).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('left and right sums: doubling N halves the error', () => {
    for (const id of ['parabola', 'coulomb', 'discharge'] as const) {
      const c = CASES[id];
      expect(doublingRatio(c, c.a, c.bMax, 100, 'left'), id).toBeCloseTo(2, 1);
      expect(doublingRatio(c, c.a, c.bMax, 100, 'right'), id).toBeCloseTo(2, 1);
    }
  });

  it('midpoint and trapezoid sums: doubling N quarters the error', () => {
    for (const id of ['parabola', 'coulomb', 'discharge'] as const) {
      const c = CASES[id];
      expect(doublingRatio(c, c.a, c.bMax, 100, 'mid'), id).toBeCloseTo(4, 1);
      expect(doublingRatio(c, c.a, c.bMax, 100, 'trapezoid'), id).toBeCloseTo(4, 1);
    }
  });

  it('for a rising function the left sum is below the area and the right sum above; for a falling one, the reverse', () => {
    for (const n of [2, 10, 50]) {
      const up = CASES.parabola;
      expect(sumError(up, 0, 3, n, 'left')).toBeLessThan(0);
      expect(sumError(up, 0, 3, n, 'right')).toBeGreaterThan(0);
      const down = CASES.discharge;
      expect(sumError(down, 0, 5, n, 'left')).toBeGreaterThan(0);
      expect(sumError(down, 0, 5, n, 'right')).toBeLessThan(0);
    }
  });

  it('the left sum on 2t is 100(1 − 1/N): 80 m with 5 pieces', () => {
    for (const n of [5, 20, 100]) expect(riemann(CASES.accel.f, 0, 10, n, 'left')).toBeCloseTo(100 * (1 - 1 / n), 10);
  });

  it('the relative error shrinks below 1% for the left sum on x² only from N = 150 on', () => {
    const c = CASES.parabola;
    expect(relativeSumError(c, 0, 3, 149, 'left')).toBeGreaterThan(0.01);
    expect(relativeSumError(c, 0, 3, 150, 'left')).toBeLessThan(0.01);
  });
});
