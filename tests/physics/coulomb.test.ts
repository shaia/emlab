import { describe, expect, it } from 'vitest';
import { E_CHARGE, G_NEWTON, K, M_ELECTRON, M_PROTON } from '~/physics/constants';
import { coulombForce, forceOn, type PointCharge } from '~/physics/electrostatics';
import {
  electricToGravityRatio,
  forceFrom,
  forcesOnCharge,
  gravityForce,
  netForceOnCharge,
} from '~/physics/coulomb';
import { add, len, relativeError, type Vec2 } from '~/physics/vec';

const uC = 1e-6;

describe('analytic limits', () => {
  it('two 2 uC charges 20 cm apart repel with k q^2 / r^2 = 0.9 N along the line', () => {
    const a: PointCharge = { x: 0, y: 0, q: 2 * uC };
    const b: PointCharge = { x: 0.2, y: 0, q: 2 * uC };
    const [fx, fy] = forceFrom(b, a);
    expect(relativeError(fx, 0.9)).toBeLessThan(1e-12);
    expect(fy).toBe(0);
  });

  it('opposite charges attract: the force on each points at the other', () => {
    const a: PointCharge = { x: 0, y: 0, q: uC };
    const b: PointCharge = { x: 0.3, y: 0, q: -uC };
    expect(forceFrom(a, b)[0]).toBeGreaterThan(0);
    expect(forceFrom(b, a)[0]).toBeLessThan(0);
  });

  it('electron-proton: Coulomb force over gravity is about 2e39, with the sheet constants', () => {
    const ratio = electricToGravityRatio(E_CHARGE, -E_CHARGE, M_ELECTRON, M_PROTON);
    expect(relativeError(ratio, (K * E_CHARGE ** 2) / (G_NEWTON * M_ELECTRON * M_PROTON))).toBeLessThan(1e-12);
    expect(ratio).toBeGreaterThan(2.2e39);
    expect(ratio).toBeLessThan(2.4e39);
  });

  it('a charge at the same point as its source feels no force (not NaN)', () => {
    expect(forceFrom({ x: 1, y: 1, q: uC }, { x: 1, y: 1, q: uC })).toEqual([0, 0]);
  });
});

describe('conservation', () => {
  it("Newton's third law: the two forces of a pair are equal and opposite, whatever the charges", () => {
    const a: PointCharge = { x: 0.1, y: 0.2, q: 3 * uC };
    const b: PointCharge = { x: 0.5, y: -0.1, q: -1 * uC };
    const fa = forceFrom(a, b);
    const fb = forceFrom(b, a);
    expect(relativeError(fa[0], -fb[0])).toBeLessThan(1e-12);
    expect(relativeError(fa[1], -fb[1])).toBeLessThan(1e-12);
  });

  it('the internal forces of a whole set of charges sum to zero (momentum is conserved)', () => {
    const cs: PointCharge[] = [
      { x: 0, y: 0, q: 2 * uC },
      { x: 0.4, y: 0.1, q: -3 * uC },
      { x: 0.1, y: 0.5, q: 1 * uC },
    ];
    const total = cs.map((_, i) => netForceOnCharge(cs, i)).reduce<Vec2>((s, f) => add(s, f), [0, 0]);
    const typical = len(netForceOnCharge(cs, 0));
    expect(len(total) / typical).toBeLessThan(1e-12);
  });
});

describe('scaling (dimensional proxy)', () => {
  const at = (q1: number, q2: number, r: number) => len(forceFrom({ x: r, y: 0, q: q2 }, { x: 0, y: 0, q: q1 }));

  it('doubling the distance cuts the force to a quarter', () => {
    expect(relativeError(at(2 * uC, 3 * uC, 0.4), at(2 * uC, 3 * uC, 0.2) / 4)).toBeLessThan(1e-12);
  });

  it('the force is proportional to each charge', () => {
    expect(relativeError(at(4 * uC, 3 * uC, 0.2), 2 * at(2 * uC, 3 * uC, 0.2))).toBeLessThan(1e-12);
    expect(relativeError(at(2 * uC, 9 * uC, 0.2), 3 * at(2 * uC, 3 * uC, 0.2))).toBeLessThan(1e-12);
  });

  it('electric over gravity does not depend on distance, because both fall off as 1/r^2', () => {
    const q = E_CHARGE;
    const at1 = coulombForce(q, -q, 1e-10) / gravityForce(M_ELECTRON, M_PROTON, 1e-10);
    const at2 = coulombForce(q, -q, 3e-7) / gravityForce(M_ELECTRON, M_PROTON, 3e-7);
    expect(relativeError(Math.abs(at1), Math.abs(at2))).toBeLessThan(1e-12);
  });

  it('gravity scales with each mass and with 1/r^2', () => {
    expect(relativeError(gravityForce(2, 3, 0.5), 6 * gravityForce(1, 1, 0.5))).toBeLessThan(1e-12);
    expect(relativeError(gravityForce(1, 1, 1), 4 * gravityForce(1, 1, 2))).toBeLessThan(1e-12);
  });
});

describe('convergence and consistency', () => {
  const cluster: PointCharge[] = [
    { x: 0, y: 0, q: 3 * uC },
    { x: 0.1, y: 0, q: -1 * uC },
    { x: 0, y: 0.1, q: 2 * uC },
  ];
  const Q = cluster.reduce((s, c) => s + c.q, 0);

  it('far from a cluster the net force tends to that of its total charge at its centre', () => {
    const errAt = (R: number) => {
      const test: PointCharge = { x: R, y: R, q: uC };
      const f = forceOn(cluster, test);
      const approx = (K * Q * test.q) / (2 * R * R);
      return Math.abs(len(f) - Math.abs(approx)) / Math.abs(approx);
    };
    expect(errAt(40)).toBeLessThan(errAt(4));
    expect(errAt(4000)).toBeLessThan(errAt(40));
    expect(errAt(4000)).toBeLessThan(1e-3);
  });

  it('the vector sum of the separate forces equals the field-based net force of electrostatics.ts', () => {
    const all: PointCharge[] = [...cluster, { x: 0.3, y: 0.2, q: 2 * uC }];
    const i = 3;
    const viaForces = netForceOnCharge(all, i);
    const viaField = forceOn(all, all[i]);
    expect(relativeError(viaForces[0], viaField[0])).toBeLessThan(1e-12);
    expect(relativeError(viaForces[1], viaField[1])).toBeLessThan(1e-12);
    expect(forcesOnCharge(all, i)).toHaveLength(3);
  });

  it('rotating the whole configuration rotates the net force and leaves its size unchanged', () => {
    const rot = (c: PointCharge, a: number): PointCharge => ({
      ...c,
      x: c.x * Math.cos(a) - c.y * Math.sin(a),
      y: c.x * Math.sin(a) + c.y * Math.cos(a),
    });
    const a = 0.7;
    const f0 = netForceOnCharge(cluster, 0);
    const f1 = netForceOnCharge(
      cluster.map((c) => rot(c, a)),
      0,
    );
    expect(relativeError(len(f0), len(f1))).toBeLessThan(1e-12);
    const expected: Vec2 = [f0[0] * Math.cos(a) - f0[1] * Math.sin(a), f0[0] * Math.sin(a) + f0[1] * Math.cos(a)];
    expect(relativeError(f1[0], expected[0])).toBeLessThan(1e-9);
    expect(relativeError(f1[1], expected[1])).toBeLessThan(1e-9);
  });

  it('forceFrom agrees with the scalar coulombForce for the magnitude', () => {
    const f = forceFrom({ x: 0.3, y: 0.4, q: 2 * uC }, { x: 0, y: 0, q: -5 * uC });
    expect(relativeError(len(f), Math.abs(coulombForce(2 * uC, -5 * uC, 0.5)))).toBeLessThan(1e-12);
  });
});
