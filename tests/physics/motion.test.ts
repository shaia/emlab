import { describe, expect, it } from 'vitest';
import { E_CHARGE, M_ELECTRON, M_PROTON } from '~/physics/constants';
import { borisStep, deflection, NO_FIELD, rk4Step, uniformField, type Body } from '~/physics/motion';
import { len3, relativeError } from '~/physics/vec';

describe('analytic limit: deflection between plates', () => {
  it('RK4 reproduces y = qE x² / (2 m v²)', () => {
    const E = 2000;
    const v = 2e7;
    let b: Body = { pos: [0, 0, 0], vel: [v, 0, 0], m: M_ELECTRON, q: -E_CHARGE };
    const field = uniformField([0, E, 0]);
    const L = 0.05;
    const dt = L / v / 400;
    let t = 0;
    while (b.pos[0] < L) {
      b = rk4Step(b, field, t, dt);
      t += dt;
    }
    const expected = deflection(-E_CHARGE, M_ELECTRON, E, v, b.pos[0]);
    expect(relativeError(b.pos[1], expected)).toBeLessThan(1e-9);
  });
});

describe('conservation', () => {
  it('kinetic energy gain equals qEd in a uniform field (work–energy)', () => {
    const E = 5000;
    let b: Body = { pos: [0, 0, 0], vel: [0, 0, 0], m: M_PROTON, q: E_CHARGE };
    const dt = 1e-9;
    for (let i = 0; i < 2000; i++) b = rk4Step(b, uniformField([E, 0, 0]), i * dt, dt);
    const ke = 0.5 * b.m * len3(b.vel) ** 2;
    expect(relativeError(ke, b.q * E * b.pos[0])).toBeLessThan(1e-9);
  });

  it('a magnetic field does no work: Boris keeps |v| exactly', () => {
    let b: Body = { pos: [0, 0, 0], vel: [1e6, 3e5, 0], m: M_PROTON, q: E_CHARGE };
    const v0 = len3(b.vel);
    const B = uniformField([0, 0, 0.12]);
    for (let i = 0; i < 10000; i++) b = borisStep(b, NO_FIELD, B, 0, 1e-10);
    expect(relativeError(len3(b.vel), v0)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('Boris orbit radius approaches mv/(qB) as dt shrinks', () => {
    const v = 1e6;
    const Bz = 0.12;
    const rTrue = (M_PROTON * v) / (E_CHARGE * Bz);
    const period = (2 * Math.PI * M_PROTON) / (E_CHARGE * Bz);
    const radiusAt = (steps: number) => {
      let b: Body = { pos: [0, 0, 0], vel: [v, 0, 0], m: M_PROTON, q: E_CHARGE };
      const dt = period / steps;
      let maxY = 0;
      for (let i = 0; i < steps; i++) {
        b = borisStep(b, NO_FIELD, uniformField([0, 0, Bz]), 0, dt);
        maxY = Math.max(maxY, Math.abs(b.pos[1]));
      }
      return maxY / 2;
    };
    const coarse = relativeError(radiusAt(50), rTrue);
    const fine = relativeError(radiusAt(800), rTrue);
    expect(fine).toBeLessThan(coarse);
    expect(fine).toBeLessThan(1e-3);
  });
});
