import { describe, expect, it } from 'vitest';
import { COPPER_N } from '~/physics/circuits';
import { E_CHARGE, G } from '~/physics/constants';
import { wireForce, wireForceVec } from '~/physics/magnetism';
import { balanceField, balanceMass, bentWireForce, carrierCount, carrierForceTotal } from '~/physics/wireforce';
import { len3, relativeError, type Vec3 } from '~/physics/vec';

describe('analytic limits', () => {
  it('the Lorentz forces on the carriers in a length L add up to exactly BIL·sinα', () => {
    for (const alpha of [Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
      const sum = carrierForceTotal(COPPER_N, E_CHARGE, 1e-6, 0.2, 5, 0.3, alpha);
      expect(relativeError(sum, wireForce(5, 0.2, 0.3, alpha))).toBeLessThan(1e-12);
    }
  });

  it('a wire along B feels no force (α = 0 and α = 180°)', () => {
    expect(wireForce(3, 0.5, 0.4, 0)).toBe(0);
    expect(wireForce(3, 0.5, 0.4, Math.PI)).toBeLessThan(1e-15);
    expect(len3(wireForceVec(3, [0.5, 0, 0], [0.4, 0, 0]))).toBe(0);
  });

  it('palm rule: I to the right in a ⊗ field pushes the wire up the page', () => {
    const f = wireForceVec(2, [0.1, 0, 0], [0, 0, -0.2]);
    expect(f[1]).toBeGreaterThan(0);
    expect(relativeError(f[1], 0.04)).toBeLessThan(1e-12);
  });

  it('a bent wire feels the force on the straight chord from its first point to its last', () => {
    const B: Vec3 = [0, 0, -0.4];
    const L: Vec3[] = [
      [0, 0, 0],
      [0.1, 0, 0],
      [0.1, 0.1, 0],
    ];
    const f = bentWireForce(2, L, B);
    const chord = wireForceVec(2, [0.1, 0.1, 0], B);
    for (let k = 0; k < 3; k++) expect(f[k]).toBeCloseTo(chord[k], 15);
    expect(relativeError(len3(f), 0.08 * Math.SQRT2)).toBeLessThan(1e-12);
  });

  it('the current balance levels at m = BIL/g, and B = mg/(IL) inverts it', () => {
    const m = balanceMass(0.08, 3, 0.05);
    expect(relativeError(m, (0.08 * 3 * 0.05) / G)).toBeLessThan(1e-12);
    expect(relativeError(balanceField(m, 3, 0.05), 0.08)).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('a closed loop in a uniform field feels no net force', () => {
    const loop: Vec3[] = [
      [0, 0, 0],
      [0.3, 0, 0],
      [0.3, 0.2, 0.1],
      [-0.1, 0.25, 0],
      [0, 0, 0],
    ];
    const f = bentWireForce(4, loop, [0.1, -0.3, 0.5]);
    expect(len3(f)).toBeLessThan(1e-15);
  });

  it('the total force does not depend on how the carriers are counted: n·q·v is fixed by I', () => {
    const copper = carrierForceTotal(COPPER_N, E_CHARGE, 1e-6, 0.1, 2, 0.5);
    const sparse = carrierForceTotal(COPPER_N / 3, E_CHARGE, 4e-6, 0.1, 2, 0.5);
    const doubly = carrierForceTotal(COPPER_N, 2 * E_CHARGE, 1e-6, 0.1, 2, 0.5);
    expect(relativeError(sparse, copper)).toBeLessThan(1e-12);
    expect(relativeError(doubly, copper)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('F grows in proportion to I, to L and to B, and N = nAL grows with L', () => {
    const f0 = wireForce(2, 0.1, 0.2);
    expect(relativeError(wireForce(4, 0.1, 0.2), 2 * f0)).toBeLessThan(1e-12);
    expect(relativeError(wireForce(2, 0.2, 0.2), 2 * f0)).toBeLessThan(1e-12);
    expect(relativeError(wireForce(2, 0.1, 0.6), 3 * f0)).toBeLessThan(1e-12);
    expect(relativeError(carrierCount(COPPER_N, 1e-6, 0.2), 2 * carrierCount(COPPER_N, 1e-6, 0.1))).toBeLessThan(1e-12);
  });

  it('units: N/(A·m) per tesla, so 1 T on 1 A over 1 m is 1 N', () => {
    expect(wireForce(1, 1, 1)).toBe(1);
  });
});

describe('convergence', () => {
  it('a semicircle of radius R built from n straight pieces feels 2BIR for every n', () => {
    const R = 0.15;
    const arc = (n: number): Vec3[] => Array.from({ length: n + 1 }, (_, k) => [R * Math.cos(Math.PI - (Math.PI * k) / n), R * Math.sin(Math.PI - (Math.PI * k) / n), 0] as Vec3);
    for (const n of [2, 8, 64]) {
      const f = bentWireForce(4, arc(n), [0, 0, -0.2]);
      expect(relativeError(len3(f), 2 * 0.2 * 4 * R)).toBeLessThan(1e-12);
    }
  });

  it('the total length of a semicircle converges to πR while its force stays 2BIR', () => {
    const R = 0.15;
    const lengthOf = (n: number) => 2 * n * R * Math.sin(Math.PI / (2 * n));
    const e8 = Math.abs(lengthOf(8) - Math.PI * R);
    const e16 = Math.abs(lengthOf(16) - Math.PI * R);
    expect(e8 / e16).toBeGreaterThan(3.9); // second order
    expect(e8 / e16).toBeLessThan(4.1);
  });
});
