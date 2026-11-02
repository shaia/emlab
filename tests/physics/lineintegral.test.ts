import { describe, expect, it } from 'vitest';
import { EPS0, K } from '~/physics/constants';
import { discAxisField, discAxisPotential, ringAxisField, ringAxisPeak, ringAxisPotential } from '~/physics/continuous';
import { fieldAt, potentialAt, type PointCharge } from '~/physics/electrostatics';
import {
  bentPath,
  directionalDerivative,
  discAxisFieldFromV,
  discAxisPotentialByRings,
  lineIntegral,
  loopOf,
  minusGradient,
  ringAxisFieldFromV,
  ringAxisPotentialByPieces,
  signedArea,
  straightPath,
  windingNumber,
} from '~/physics/lineintegral';
import { relativeError, type Vec2 } from '~/physics/vec';
import { rotationField } from '~/physics/vectorcalc';

const uC = 1e-6;
const Q1: PointCharge[] = [{ x: -0.3, y: -0.1, q: 2 * uC }];
const PAIR: PointCharge[] = [
  { x: -0.4, y: 0, q: 4 * uC },
  { x: 0.4, y: 0, q: -2 * uC },
];
const E = (cs: PointCharge[]) => (x: number, y: number) => fieldAt(cs, x, y);
const V = (cs: PointCharge[]) => (x: number, y: number) => potentialAt(cs, x, y);
const A: Vec2 = [-0.55, 0.15];
const B: Vec2 = [0.6, 0.3];

describe('analytic limits', () => {
  it('along a radial line from a point charge, −∫E·dl is kQ(1/r_B − 1/r_A)', () => {
    const Q = 2 * uC;
    const field = E([{ x: 0, y: 0, q: Q }]);
    const got = -lineIntegral(field, straightPath([0.1, 0], [0.4, 0], 2000));
    expect(relativeError(got, K * Q * (1 / 0.4 - 1 / 0.1))).toBeLessThan(1e-6);
  });

  it('in a uniform field the line integral is E·Δr, so V drops by Ed along the field', () => {
    const field = (): Vec2 => [1e4, 0];
    expect(relativeError(lineIntegral(field, straightPath([0, 0], [0.3, 0.2], 7)), 1e4 * 0.3)).toBeLessThan(1e-12);
  });

  it('far from a ring, its axial potential is kQ/z and −dV/dz is kQ/z²', () => {
    const Q = 5e-9;
    const z = 200;
    expect(relativeError(ringAxisPotential(Q, 0.1, z), (K * Q) / z)).toBeLessThan(1e-6);
    expect(relativeError(ringAxisFieldFromV(Q, 0.1, z), (K * Q) / (z * z))).toBeLessThan(1e-5);
  });

  it('close to a wide disc, −dV/dz is the sheet field σ/(2ε₀)', () => {
    const sigma = 1e-8;
    expect(relativeError(discAxisFieldFromV(sigma, 1e3, 0.01), sigma / (2 * EPS0))).toBeLessThan(1e-4);
  });

  it('far from a disc, its axial potential is that of a point charge σπR²', () => {
    const sigma = 1e-8;
    const R = 0.2;
    const z = 300;
    expect(relativeError(discAxisPotential(sigma, R, z), (K * sigma * Math.PI * R * R) / z)).toBeLessThan(1e-6);
  });
});

describe('identities', () => {
  it('the electrostatic field is conservative: a straight and a bent path from A to B give V(A) − V(B)', () => {
    const field = E(Q1);
    const exact = potentialAt(Q1, ...A) - potentialAt(Q1, ...B);
    for (const C of [[0, 0.22], [0, -0.6], [-0.3, 0.9], [0.2, -0.45]] as Vec2[]) {
      const I = lineIntegral(field, bentPath(A, C, B, 4000));
      expect(relativeError(I, exact)).toBeLessThan(1e-4);
    }
  });

  it('a path that passes on the other side of the charge still gives the same integral (the 3D field has no hole)', () => {
    const field = E(Q1);
    const go = straightPath(A, B, 4000);
    const back = bentPath(A, [-0.25, -0.75], B, 4000);
    expect(windingNumber(loopOf(go, back), [Q1[0].x, Q1[0].y])).not.toBe(0);
    expect(relativeError(lineIntegral(field, back), lineIntegral(field, go))).toBeLessThan(1e-4);
  });

  it('round a closed loop the electrostatic integral is zero', () => {
    const field = E(PAIR);
    const loop = loopOf(straightPath(A, B, 4000), bentPath(A, [-0.1, 0.8], B, 4000));
    const scale = Math.abs(potentialAt(PAIR, ...A));
    expect(Math.abs(lineIntegral(field, loop))).toBeLessThan(1e-4 * scale);
  });

  it('the swirl field is not conservative: round a loop its integral is 2ω times the enclosed area', () => {
    const omega = 2e5;
    const loop = loopOf(straightPath(A, B, 3000), bentPath(A, [0, -0.6], B, 3000));
    const circ = lineIntegral(rotationField(omega), loop);
    expect(relativeError(circ, 2 * omega * signedArea(loop))).toBeLessThan(1e-5);
    expect(Math.abs(circ)).toBeGreaterThan(1e4);
  });

  it('−∇V of the summed potential is the Coulomb field, at points all over the map', () => {
    for (const [x, y] of [[0.1, 0.3], [-0.7, -0.4], [0, 0.05], [0.8, 0.5]] as Vec2[]) {
      const g = minusGradient(V(PAIR), x, y, 1e-5);
      const f = fieldAt(PAIR, x, y);
      expect(Math.hypot(g[0] - f[0], g[1] - f[1]) / Math.hypot(...f)).toBeLessThan(1e-6);
    }
  });

  it('V changes fastest along ∇V, at the rate |∇V|, and not at all at right angles to it', () => {
    const [x, y] = [0.15, 0.25];
    const f = fieldAt(PAIR, x, y);
    const mag = Math.hypot(...f);
    const up = Math.atan2(-f[1], -f[0]);
    expect(relativeError(directionalDerivative(V(PAIR), x, y, up, 1e-5), mag)).toBeLessThan(1e-6);
    expect(Math.abs(directionalDerivative(V(PAIR), x, y, up + Math.PI / 2, 1e-5))).toBeLessThan(1e-6 * mag);
    for (let k = 0; k < 36; k++) {
      expect(directionalDerivative(V(PAIR), x, y, (k * Math.PI) / 18, 1e-5)).toBeLessThanOrEqual(mag * (1 + 1e-6));
    }
  });

  it('on a ring axis −dV/dz equals the field summed as vectors in 6.4, and peaks at z = R/√2', () => {
    const Q = 5e-9;
    const R = 0.2;
    for (const z of [-0.3, 0.05, 0.1414, 0.5]) expect(relativeError(ringAxisFieldFromV(Q, R, z), ringAxisField(Q, R, z))).toBeLessThan(1e-6);
    const zp = ringAxisPeak(R);
    expect(ringAxisFieldFromV(Q, R, zp)).toBeGreaterThan(ringAxisFieldFromV(Q, R, zp * 1.05));
    expect(ringAxisFieldFromV(Q, R, zp)).toBeGreaterThan(ringAxisFieldFromV(Q, R, zp * 0.95));
  });

  it('on a disc axis −dV/dz equals σ/(2ε₀)(1 − z/√(z² + R²))', () => {
    for (const z of [0.01, 0.1, 0.7]) expect(relativeError(discAxisFieldFromV(1e-8, 0.2, z), discAxisField(1e-8, 0.2, z))).toBeLessThan(1e-6);
  });

  it('every piece of a ring is the same distance from an axis point, so one piece already gives the exact V', () => {
    for (const n of [1, 3, 50]) expect(relativeError(ringAxisPotentialByPieces(5e-9, 0.2, 0.15, n), ringAxisPotential(5e-9, 0.2, 0.15))).toBeLessThan(1e-12);
  });

  it('the potential at the centre of a ring is kQ/R, a maximum on the axis, where the field is zero', () => {
    expect(relativeError(ringAxisPotential(5e-9, 0.2, 0), (K * 5e-9) / 0.2)).toBeLessThan(1e-12);
    expect(Math.abs(ringAxisFieldFromV(5e-9, 0.2, 0))).toBeLessThan(1e-9);
  });
});

describe('scaling', () => {
  it('doubling every charge doubles the line integral and the gradient', () => {
    const dbl = PAIR.map((c) => ({ ...c, q: 2 * c.q }));
    const path = bentPath(A, [0, 0.6], B, 2000);
    expect(relativeError(lineIntegral(E(dbl), path), 2 * lineIntegral(E(PAIR), path))).toBeLessThan(1e-12);
    expect(relativeError(minusGradient(V(dbl), 0.1, 0.2)[0], 2 * minusGradient(V(PAIR), 0.1, 0.2)[0])).toBeLessThan(1e-9);
  });

  it('a ring twice as big, seen from twice as far, has half the potential and a quarter of the field', () => {
    expect(relativeError(ringAxisPotential(5e-9, 0.4, 0.6), ringAxisPotential(5e-9, 0.2, 0.3) / 2)).toBeLessThan(1e-12);
    expect(relativeError(ringAxisFieldFromV(5e-9, 0.4, 0.6), ringAxisFieldFromV(5e-9, 0.2, 0.3) / 4)).toBeLessThan(1e-6);
  });

  it('the disc potential grows like σ: doubling σ doubles V', () => {
    expect(relativeError(discAxisPotential(2e-8, 0.2, 0.1), 2 * discAxisPotential(1e-8, 0.2, 0.1))).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the disc potential summed ring by ring converges to the integral as O(1/N²)', () => {
    const exact = discAxisPotential(1e-8, 0.2, 0.1);
    const e1 = Math.abs(discAxisPotentialByRings(1e-8, 0.2, 0.1, 20) - exact);
    const e2 = Math.abs(discAxisPotentialByRings(1e-8, 0.2, 0.1, 40) - exact);
    expect(e1 / e2).toBeGreaterThan(3.6);
    expect(e1 / e2).toBeLessThan(4.4);
    expect(relativeError(discAxisPotentialByRings(1e-8, 0.2, 0.1, 2000), exact)).toBeLessThan(1e-6);
  });

  it('the midpoint line integral along a curved path converges as O(1/N²)', () => {
    const field = E(Q1);
    const exact = potentialAt(Q1, ...A) - potentialAt(Q1, ...B);
    const C: Vec2 = [0, -0.6];
    const e1 = Math.abs(lineIntegral(field, bentPath(A, C, B, 100)) - exact);
    const e2 = Math.abs(lineIntegral(field, bentPath(A, C, B, 200)) - exact);
    expect(e1 / e2).toBeGreaterThan(3.5);
    expect(e1 / e2).toBeLessThan(4.5);
  });
});
