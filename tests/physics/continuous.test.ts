import { describe, expect, it } from 'vitest';
import { EPS0, K } from '~/physics/constants';
import {
  ballEnclosed,
  ballField,
  cylinderField,
  discAxisField,
  discAxisFieldByRings,
  discAxisPotential,
  discretizeDisc,
  discretizeRing,
  discretizeRod,
  lineField,
  ringAxisField,
  ringAxisPeak,
  ringAxisPotential,
  rodAxisField,
  rodBisectorField,
  rodField,
  rodPotential,
} from '~/physics/continuous';
import { fieldAt, fieldAt3, potentialAt } from '~/physics/electrostatics';
import { diskAxisField } from '~/physics/gauss';
import { planeField } from '~/physics/electrostatics';
import { derivative } from '~/physics/calculus';
import { len, relativeError } from '~/physics/vec';

const lambda = 2e-9;
const Q = 3e-9;

describe('analytic limits', () => {
  it('a long rod looks like an infinite line: E → 2kλ/r', () => {
    expect(relativeError(rodBisectorField(lambda, 1e4, 0.05), lineField(lambda, 0.05))).toBeLessThan(1e-6);
    expect(relativeError(len(rodField(lambda, 1e4, [0, 0.05])), lineField(lambda, 0.05))).toBeLessThan(1e-6);
  });

  it('a rod seen from far away looks like a point charge kQ/r²', () => {
    const L = 0.1;
    const r = 100;
    expect(relativeError(rodBisectorField(lambda, L, r), (K * lambda * L) / (r * r))).toBeLessThan(1e-5);
    expect(relativeError(rodAxisField(lambda, L, r), (K * lambda * L) / (r * r))).toBeLessThan(2e-3);
  });

  it('the general rod field reduces to the bisector and axis formulas', () => {
    const L = 0.4;
    expect(relativeError(rodField(lambda, L, [0, 0.3])[1], rodBisectorField(lambda, L, 0.3))).toBeLessThan(1e-12);
    expect(rodField(lambda, L, [0, 0.3])[0]).toBeCloseTo(0, 6);
    expect(relativeError(rodField(lambda, L, [L / 2 + 0.1, 0])[0], rodAxisField(lambda, L, 0.1))).toBeLessThan(1e-12);
    expect(relativeError(-rodField(lambda, L, [-L / 2 - 0.1, 0])[0], rodAxisField(lambda, L, 0.1))).toBeLessThan(1e-12);
  });

  it('a ring far away looks like a point charge, and its field is zero at its centre', () => {
    expect(relativeError(ringAxisField(Q, 0.05, 50), (K * Q) / 2500)).toBeLessThan(1e-5);
    expect(ringAxisField(Q, 0.05, 0)).toBe(0);
    expect(relativeError(ringAxisPotential(Q, 0.05, 50), (K * Q) / 50)).toBeLessThan(1e-5);
  });

  it('the ring field on the axis peaks at z = R/√2, not at the centre', () => {
    const R = 0.2;
    const zp = ringAxisPeak(R);
    expect(Math.abs(derivative((z) => ringAxisField(Q, R, z), zp))).toBeLessThan(1e-6 * ringAxisField(Q, R, zp));
    expect(ringAxisField(Q, R, zp)).toBeGreaterThan(ringAxisField(Q, R, 0.8 * zp));
    expect(ringAxisField(Q, R, zp)).toBeGreaterThan(ringAxisField(Q, R, 1.2 * zp));
  });

  it('a huge disc is an infinite plane: E → σ/(2ε₀)', () => {
    const sigma = 4e-6;
    expect(relativeError(discAxisField(sigma, 1e5, 0.01), planeField(sigma))).toBeLessThan(1e-6);
  });

  it('a disc far away looks like a point charge σπR²', () => {
    const sigma = 4e-6;
    const R = 0.1;
    const z = 100;
    expect(relativeError(discAxisField(sigma, R, z), (K * sigma * Math.PI * R * R) / (z * z))).toBeLessThan(1e-5);
  });

  it('the disc axis field agrees with lesson 1.8’s diskAxisField', () => {
    expect(relativeError(discAxisField(3e-6, 0.2, 0.07), diskAxisField(3e-6, 0.2, 0.07))).toBeLessThan(1e-14);
  });

  it('E = −dV/dz on the axes of the ring and the disc (field from potential)', () => {
    const R = 0.2;
    const z = 0.13;
    expect(relativeError(-derivative((t) => ringAxisPotential(Q, R, t), z), ringAxisField(Q, R, z))).toBeLessThan(1e-7);
    expect(relativeError(-derivative((t) => discAxisPotential(4e-6, R, t), z), discAxisField(4e-6, R, z))).toBeLessThan(1e-7);
  });

  it('E = −∇V around the rod, off its axis', () => {
    const L = 0.3;
    const p: [number, number] = [0.1, 0.07];
    const ex = -derivative((x) => rodPotential(lambda, L, [x, p[1]]), p[0]);
    const ey = -derivative((y) => rodPotential(lambda, L, [p[0], y]), p[1]);
    const e = rodField(lambda, L, p);
    expect(relativeError(ex, e[0])).toBeLessThan(1e-6);
    expect(relativeError(ey, e[1])).toBeLessThan(1e-6);
  });
});

describe('conservation (Gauss)', () => {
  it('a uniform ball holds ρ·(4/3)πR³ and its field inside grows linearly, ρr/(3ε₀)', () => {
    const rho = 1e-6;
    expect(relativeError(ballEnclosed(() => rho, 0.2), rho * (4 / 3) * Math.PI * 0.008)).toBeLessThan(1e-6);
    expect(relativeError(ballField(() => rho, 0.2, 0.1), (rho * 0.1) / (3 * EPS0))).toBeLessThan(1e-6);
  });

  it('outside a ball with ρ ∝ r the field is kQ/r² with Q = πAR⁴', () => {
    const A = 2e-5;
    const R = 0.1;
    const Qtot = Math.PI * A * R ** 4;
    expect(relativeError(ballField((r) => A * r, R, 0.3), (K * Qtot) / 0.09)).toBeLessThan(1e-6);
  });

  it('a uniform cylinder: ρr/(2ε₀) inside, ρR²/(2ε₀r) outside, continuous at R', () => {
    const rho = 1e-6;
    const R = 0.05;
    expect(relativeError(cylinderField(() => rho, R, 0.02), (rho * 0.02) / (2 * EPS0))).toBeLessThan(1e-6);
    expect(relativeError(cylinderField(() => rho, R, 0.2), (rho * R * R) / (2 * EPS0 * 0.2))).toBeLessThan(1e-6);
  });

  it('the discretised bodies carry the whole charge', () => {
    expect(discretizeRod(lambda, 0.4, 17).reduce((s, c) => s + c.q, 0)).toBeCloseTo(lambda * 0.4, 20);
    expect(discretizeRing(Q, 0.1, 23).reduce((s, c) => s + c.q, 0)).toBeCloseTo(Q, 20);
    const sigma = 1e-6;
    expect(relativeError(discretizeDisc(sigma, 0.1, 30, 40).reduce((s, c) => s + c.q, 0), sigma * Math.PI * 0.01)).toBeLessThan(1e-12);
  });
});

describe('convergence (sum of point charges → integral)', () => {
  it('the rod as N point charges converges to the closed form as 1/N²', () => {
    const L = 0.4;
    const p: [number, number] = [0.05, 0.15];
    const exact = len(rodField(lambda, L, p));
    const err = (n: number) => Math.abs(len(fieldAt(discretizeRod(lambda, L, n), p[0], p[1])) - exact);
    expect(err(40) / err(80)).toBeCloseTo(4, 1);
    expect(relativeError(potentialAt(discretizeRod(lambda, L, 400), p[0], p[1]), rodPotential(lambda, L, p))).toBeLessThan(1e-4);
  });

  it('a ring of N charges gives the exact axis field for every N (symmetry)', () => {
    const R = 0.1;
    const z = 0.07;
    for (const n of [3, 8, 50]) {
      const e = fieldAt3(discretizeRing(Q, R, n), [0, 0, z]);
      expect(relativeError(e[2], ringAxisField(Q, R, z))).toBeLessThan(1e-12);
    }
  });

  it('a disc of N rings converges to the closed form as 1/N²', () => {
    const sigma = 2e-6;
    const R = 0.1;
    const z = 0.03;
    const exact = discAxisField(sigma, R, z);
    const err = (n: number) => Math.abs(discAxisFieldByRings(sigma, R, z, n) - exact);
    expect(err(20) / err(40)).toBeCloseTo(4, 1);
  });
});

describe('scaling', () => {
  it('doubling λ doubles the rod field; doubling σ doubles the disc field', () => {
    const p: [number, number] = [0.02, 0.1];
    expect(rodField(2 * lambda, 0.3, p)[1]).toBeCloseTo(2 * rodField(lambda, 0.3, p)[1], 6);
    expect(discAxisField(2e-6, 0.1, 0.05)).toBeCloseTo(2 * discAxisField(1e-6, 0.1, 0.05), 6);
  });

  it('scaling every length by s scales a ring’s axial field by 1/s²', () => {
    const s = 3;
    expect(relativeError(ringAxisField(Q, 0.1 * s, 0.07 * s), ringAxisField(Q, 0.1, 0.07) / (s * s))).toBeLessThan(1e-12);
  });
});
