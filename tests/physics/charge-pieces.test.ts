import { describe, expect, it } from 'vitest';
import { EPS0, K } from '~/physics/constants';
import { discPieces, discModels, ringOpposite, ringPieces, ringModels, rodMirror, rodModels, rodPieces, sumError } from '~/physics/charge-pieces';
import { discAxisField, ringAxisField, ringAxisPeak, rodField } from '~/physics/continuous';
import { len, len3, relativeError } from '~/physics/vec';

const lambda = 1e-8; // the figure's rod: 10 nC/m
const Q = 4e-9; // the figure's ring: 4 nC
const sigma = Q / (Math.PI * 0.01); // the figure's disc: 4 nC on R = 10 cm

describe('identities (superposition)', () => {
  it('the contributions of the pieces add up to the field of all the pieces together', () => {
    const { dE, sum } = rodPieces(lambda, 0.4, 9, [0.07, 0.12]);
    const total = dE.reduce((s, v) => [s[0] + v[0], s[1] + v[1]], [0, 0]);
    expect(relativeError(total[0], sum[0])).toBeLessThan(1e-12);
    expect(relativeError(total[1], sum[1])).toBeLessThan(1e-12);
    const ring = ringPieces(Q, 0.1, 12, 0.05);
    expect(relativeError(ring.dE.reduce((s, v) => s + v[2], 0), ring.sum[2])).toBeLessThan(1e-12);
    const disc = discPieces(sigma, 0.1, 6, 16, 0.04);
    expect(relativeError(disc.dE.reduce((s, v) => s + v[2], 0), disc.sum[2])).toBeLessThan(1e-12);
  });

  it('on the bisector, mirror pieces of the rod cancel along the rod and add across it', () => {
    const n = 8;
    const { dE } = rodPieces(lambda, 0.4, n, [0, 0.1]);
    for (let i = 0; i < n / 2; i++) {
      const a = dE[i];
      const b = dE[rodMirror(i, n)];
      expect(Math.abs(a[0] + b[0])).toBeLessThan(1e-12 * Math.abs(a[0]));
      expect(relativeError(a[1], b[1])).toBeLessThan(1e-12);
    }
  });

  it('off the bisector the rod field has a component along the rod: the symmetry is gone', () => {
    const { sum } = rodPieces(lambda, 0.4, 40, [0.15, 0.05]);
    expect(sum[0]).toBeGreaterThan(0.1 * Math.abs(sum[1]));
  });

  it('opposite pieces of a ring cancel across the axis and add along it', () => {
    const n = 10;
    const { dE } = ringPieces(Q, 0.1, n, 0.06);
    for (let i = 0; i < n; i++) {
      const a = dE[i];
      const b = dE[ringOpposite(i, n)];
      expect(Math.hypot(a[0] + b[0], a[1] + b[1])).toBeLessThan(1e-12 * len3(a));
      expect(relativeError(a[2], b[2])).toBeLessThan(1e-12);
    }
  });
});

describe('analytic limits', () => {
  it('at the centre of a ring every piece pulls, and the pulls add to zero', () => {
    const { dE, sum } = ringPieces(Q, 0.1, 16, 0);
    for (const v of dE) expect(len3(v)).toBeGreaterThan(0.9 * ((K * Q) / 16 / 0.01));
    expect(len3(sum)).toBeLessThan(1e-12 * ((K * Q) / 0.01));
  });

  it('the ring sum on the axis peaks at R/√2, and is about 0.385 kQ/R² there', () => {
    const R = 0.1;
    const at = (z: number) => ringPieces(Q, R, 24, z).sum[2];
    const zp = ringAxisPeak(R);
    expect(at(zp)).toBeGreaterThan(at(zp - 0.005));
    expect(at(zp)).toBeGreaterThan(at(zp + 0.005));
    expect(relativeError(at(zp), (2 * K * Q) / (3 * Math.sqrt(3) * R * R))).toBeLessThan(1e-12);
  });

  it('the rod models: a long rod is a line, a far rod is a point', () => {
    const near = rodModels(lambda, 20, [0, 0.05]);
    expect(relativeError(near.exact, near.line)).toBeLessThan(1e-4);
    const far = rodModels(lambda, 0.1, [0.3, 2]);
    expect(relativeError(far.exact, far.point)).toBeLessThan(2e-3);
  });

  it('the disc models: a disc seen from close is a plane σ/(2ε₀), seen from far a point', () => {
    const close = discModels(sigma, 0.1, 1e-4);
    expect(relativeError(close.exact, close.plane)).toBeLessThan(2e-3);
    expect(relativeError(close.plane, sigma / (2 * EPS0))).toBeLessThan(1e-12);
    const far = discModels(sigma, 0.1, 5);
    expect(relativeError(far.exact, far.point)).toBeLessThan(1e-3);
    expect(relativeError(ringModels(Q, 0.1, 5).exact, ringModels(Q, 0.1, 5).point)).toBeLessThan(1e-3);
  });

  it('the figure’s disc: σ/(2ε₀) = 2kQ/R² = 7200 N/C', () => {
    expect(relativeError(discModels(sigma, 0.1, 0.05).plane, 7200)).toBeLessThan(1e-12);
  });
});

describe('convergence (the sum becomes the integral)', () => {
  it('the rod sum approaches the closed form, its error falling as 1/N²', () => {
    const p: [number, number] = [0, 0.1];
    const exact = len(rodField(lambda, 0.4, p));
    const err = (n: number) => sumError(len(rodPieces(lambda, 0.4, n, p).sum), exact);
    expect(err(10) / err(20)).toBeCloseTo(4, 0);
    expect(err(40)).toBeLessThan(0.01);
    expect(err(40)).toBeLessThan(err(4));
  });

  it('the disc, ring by ring, approaches σ/(2ε₀)(1 − z/√(z²+R²))', () => {
    const z = 0.05;
    const exact = discAxisField(sigma, 0.1, z);
    const err = (n: number) => sumError(discPieces(sigma, 0.1, n, 24, z).sum[2], exact);
    expect(err(8) / err(16)).toBeCloseTo(4, 0);
    expect(err(16)).toBeLessThan(0.01);
  });

  it('the ring needs no limit on its axis: two pieces already give the exact axial field', () => {
    for (const n of [2, 5, 48]) expect(relativeError(ringPieces(Q, 0.1, n, 0.08).sum[2], ringAxisField(Q, 0.1, 0.08))).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('doubling λ doubles every piece’s contribution', () => {
    const a = rodPieces(lambda, 0.4, 5, [0.05, 0.1]);
    const b = rodPieces(2 * lambda, 0.4, 5, [0.05, 0.1]);
    a.dE.forEach((v, i) => expect(relativeError(b.dE[i][1], 2 * v[1])).toBeLessThan(1e-12));
  });

  it('a disc twice as wide, seen from twice as far, has the same field (σ fixed)', () => {
    expect(relativeError(discModels(sigma, 0.2, 0.1).exact, discModels(sigma, 0.1, 0.05).exact)).toBeLessThan(1e-12);
  });
});

describe('the figure’s error readout', () => {
  it('vectorError is |sum − exact|/|exact|, and zero when both vanish', async () => {
    const { vectorError } = await import('~/physics/charge-pieces');
    expect(vectorError([3, 4], [3, 0])).toBeCloseTo(4 / 3, 12);
    expect(vectorError([0, 0, 1e-14], [0, 0, 0])).toBe(0);
  });
});
