import { describe, expect, it } from 'vitest';
import { E_CHARGE, K } from '~/physics/constants';
import { coulombAxis, coulombRun, drops, emptyMarks, linearFit, seededRandom, unitMisfit } from '~/physics/lab-data';
import { relativeError } from '~/physics/vec';

const R = [0.05, 0.075, 0.1, 0.125, 0.15, 0.2, 0.25];

describe('analytic limit: line fit', () => {
  it('recovers slope and intercept of exact data, R² = 1', () => {
    const x = [1, 2, 3, 4];
    const f = linearFit(x, x.map((v) => 3 * v + 2));
    expect(relativeError(f.slope, 3)).toBeLessThan(1e-12);
    expect(relativeError(f.intercept, 2)).toBeLessThan(1e-12);
    expect(relativeError(f.r2, 1)).toBeLessThan(1e-12);
  });
  it('noise-free Coulomb data are a straight line in 1/r² with slope k·q1·q2', () => {
    const run = coulombRun(2e-7, 3e-7, R, 0, 1);
    const f = linearFit(coulombAxis(run, -2), run.F);
    expect(relativeError(f.slope, K * 2e-7 * 3e-7)).toBeLessThan(1e-12);
    expect(Math.abs(f.intercept)).toBeLessThan(1e-12 * Math.max(...run.F));
  });
});

describe('analytic limit: which graph is straight', () => {
  const run = coulombRun(2e-7, 3e-7, R, 0.04, 7);
  const r2 = (p: number) => linearFit(coulombAxis(run, p), run.F).r2;
  it('F against 1/r² is straighter than against 1/r, which is straighter than against r', () => {
    expect(r2(-2)).toBeGreaterThan(0.99);
    expect(r2(-2)).toBeGreaterThan(r2(-1));
    expect(r2(-1)).toBeGreaterThan(r2(1));
  });
  it('the fitted slope recovers the charge product within the noise', () => {
    const f = linearFit(coulombAxis(run, -2), run.F);
    expect(relativeError(f.slope, K * 2e-7 * 3e-7)).toBeLessThan(0.05);
  });
});

describe('scaling', () => {
  it('doubling both charges quadruples every force (same seed, same noise)', () => {
    const a = coulombRun(1e-7, 1e-7, R, 0.03, 5);
    const b = coulombRun(2e-7, 2e-7, R, 0.03, 5);
    a.F.forEach((f, i) => expect(relativeError(b.F[i], 4 * f)).toBeLessThan(1e-12));
  });
  it('the same seed gives the same data, a different seed does not', () => {
    expect(coulombRun(1e-7, 1e-7, R, 0.03, 5).F).toEqual(coulombRun(1e-7, 1e-7, R, 0.03, 5).F);
    expect(coulombRun(1e-7, 1e-7, R, 0.03, 5).F).not.toEqual(coulombRun(1e-7, 1e-7, R, 0.03, 6).F);
  });
  it('the generator stays in [0, 1)', () => {
    const rnd = seededRandom(3);
    for (let i = 0; i < 1000; i++) {
      const x = rnd();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('analytic limit: finding the unit of charge', () => {
  const qs = drops([3, 5, 2, 4, 1, 6, 3, 2], 0.02, 11);
  it('the elementary charge is a near-perfect unit; a non-divisor is not', () => {
    expect(unitMisfit(qs, E_CHARGE)).toBeLessThan(0.03);
    expect(unitMisfit(qs, 1.5 * E_CHARGE)).toBeGreaterThan(0.15);
  });
  it('half the elementary charge also fits every point, but leaves empty marks', () => {
    expect(unitMisfit(qs, E_CHARGE / 2)).toBeLessThan(0.06);
    expect(emptyMarks(qs, E_CHARGE / 2)).toBeGreaterThan(0);
    expect(emptyMarks(qs, E_CHARGE)).toBe(0);
  });
  it('twice the elementary charge misses the odd multiples', () => {
    expect(unitMisfit(qs, 2 * E_CHARGE)).toBeGreaterThan(0.15);
  });
});
