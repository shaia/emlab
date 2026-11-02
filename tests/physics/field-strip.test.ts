import { describe, expect, it } from 'vitest';
import { E_CHARGE, M_ELECTRON, M_PROTON } from '~/physics/constants';
import { stripCrossing, stripForce, stripState, type StripField } from '~/physics/field-strip';
import { lorentzMagnitude, orbitRadius } from '~/physics/magnetism';
import { borisStep, deflection, uniformField, NO_FIELD, type Body } from '~/physics/motion';
import { len, relativeError } from '~/physics/vec';

const q = E_CHARGE;
const m = M_PROTON;
const v = 1e6;
const d = 0.1;
const strongB: StripField = { kind: 'B', Bz: -0.2 }; // ⊗, r = 5.2 cm < d
const weakB: StripField = { kind: 'B', Bz: -0.05 }; // ⊗, r = 20.9 cm > d

describe('analytic limit: half a circle, or out through the far edge', () => {
  it('a strong field turns the charge back after half a circle, 2r from where it entered', () => {
    const r = orbitRadius(m, v, q, strongB.Bz);
    const c = stripCrossing(q, m, strongB, v, d);
    expect(c.outcome).toBe('back');
    expect(Math.abs(c.exitPos[0])).toBeLessThan(1e-12);
    expect(relativeError(c.exitPos[1], 2 * r)).toBeLessThan(1e-9);
    expect(relativeError(c.exitVel[0], -v)).toBeLessThan(1e-9);
  });

  it('a proton moving right in a ⊗ field is pushed up (the palm rule), so it turns back above its entry', () => {
    expect(stripCrossing(q, m, strongB, v, d).exitPos[1]).toBeGreaterThan(0);
    const [, Fy] = stripForce(q, m, strongB, v, d, 1e-12);
    expect(Fy).toBeGreaterThan(0);
  });

  it('a negative charge curves the other way', () => {
    expect(stripCrossing(-q, m, strongB, v, d).exitPos[1]).toBeLessThan(0);
  });

  it('a weak field lets the charge through, turned by θ with sinθ = d/r', () => {
    const r = orbitRadius(m, v, q, weakB.Bz);
    const c = stripCrossing(q, m, weakB, v, d);
    expect(c.outcome).toBe('through');
    expect(relativeError(c.exitPos[0], d)).toBeLessThan(1e-9);
    const theta = Math.atan2(c.exitVel[1], c.exitVel[0]);
    expect(relativeError(Math.sin(theta), d / r)).toBeLessThan(1e-9);
    // the sideways shift on a circle: r(1 − cosθ)
    expect(relativeError(c.exitPos[1], r * (1 - Math.cos(theta)))).toBeLessThan(1e-9);
  });

  it('an electric strip gives the parabola of lesson 1.10: y = qEd²/(2mv²) at the far edge', () => {
    const Ey = 2e4;
    const c = stripCrossing(q, m, { kind: 'E', Ey }, v, d);
    expect(c.outcome).toBe('through');
    expect(relativeError(c.exitPos[1], deflection(q, m, Ey, v, d))).toBeLessThan(1e-12);
  });

  it('the magnetic force has the size qvB everywhere in the strip and none outside it', () => {
    for (const t of [1e-9, 5e-8, 1e-7]) {
      const F = len(stripForce(q, m, strongB, v, d, t));
      expect(relativeError(F, lorentzMagnitude(q, v, Math.abs(strongB.Bz)))).toBeLessThan(1e-9);
    }
    const c = stripCrossing(q, m, strongB, v, d);
    expect(len(stripForce(q, m, strongB, v, d, c.tExit * 1.01))).toBe(0);
    expect(len(stripForce(q, m, strongB, v, d, -1e-9))).toBe(0);
  });
});

describe('conservation: the magnetic force does no work, the electric force does', () => {
  it('the speed never changes in a magnetic strip, for a proton and for an electron', () => {
    for (const [qq, mm, B] of [
      [q, m, strongB],
      [-q, M_ELECTRON, { kind: 'B', Bz: 1e-4 } as StripField],
    ] as const) {
      const T = stripCrossing(qq, mm, B, v, d).tExit;
      for (let k = 0; k <= 20; k++) {
        const s = stripState(qq, mm, B, v, d, (k / 20) * T * 1.5);
        expect(relativeError(len(s.vel), v)).toBeLessThan(1e-12);
      }
    }
  });

  it('the force is perpendicular to the velocity at every point of the magnetic path (zero power)', () => {
    const T = stripCrossing(q, m, strongB, v, d).tExit;
    for (let k = 1; k < 10; k++) {
      const t = (k / 10) * T;
      const s = stripState(q, m, strongB, v, d, t);
      const F = stripForce(q, m, strongB, v, d, t);
      const cos = (F[0] * s.vel[0] + F[1] * s.vel[1]) / (len(F) * len(s.vel));
      expect(Math.abs(cos)).toBeLessThan(1e-12);
    }
  });

  it('in an electric strip the kinetic energy grows by exactly the work qE·Δy', () => {
    const Ey = 2e4;
    const c = stripCrossing(q, m, { kind: 'E', Ey }, v, d);
    const dK = 0.5 * m * (c.exitVel[0] ** 2 + c.exitVel[1] ** 2) - 0.5 * m * v * v;
    expect(relativeError(dK, q * Ey * c.exitPos[1])).toBeLessThan(1e-9);
    expect(dK).toBeGreaterThan(0);
  });
});

describe('scaling: the bend depends on v/B', () => {
  it('doubling B halves how far from the entry the charge comes back', () => {
    const y1 = stripCrossing(q, m, { kind: 'B', Bz: -0.2 }, v, d).exitPos[1];
    const y2 = stripCrossing(q, m, { kind: 'B', Bz: -0.4 }, v, d).exitPos[1];
    expect(relativeError(y1 / y2, 2)).toBeLessThan(1e-9);
  });

  it('the path is the same when v and B are scaled together', () => {
    const a = stripCrossing(q, m, { kind: 'B', Bz: -0.05 }, v, d);
    const b = stripCrossing(q, m, { kind: 'B', Bz: -0.15 }, 3 * v, d);
    expect(relativeError(a.exitPos[1], b.exitPos[1])).toBeLessThan(1e-9);
  });
});

describe('convergence: an independent integrator agrees', () => {
  it('Boris steps converge to the analytic magnetic path as dt shrinks', () => {
    const T = stripCrossing(q, m, weakB, v, d).tExit;
    const exact = stripState(q, m, weakB, v, d, T * 0.8).pos;
    const err = (n: number) => {
      const dt = (T * 0.8) / n;
      let b: Body = { q, m, pos: [0, 0, 0], vel: [v, 0, 0] };
      // Boris is staggered: start the velocity half a step back so positions are second-order
      const back = borisStep({ ...b, vel: [v, 0, 0] }, NO_FIELD, uniformField([0, 0, weakB.Bz]), 0, -dt / 2);
      b = { ...b, vel: back.vel };
      for (let k = 0; k < n; k++) b = borisStep(b, NO_FIELD, uniformField([0, 0, weakB.Bz]), k * dt, dt);
      return Math.hypot(b.pos[0] - exact[0], b.pos[1] - exact[1]);
    };
    const e1 = err(100);
    const e2 = err(200);
    const e3 = err(400);
    expect(e2).toBeLessThan(e1);
    expect(e3).toBeLessThan(e2);
    expect(e3 / d).toBeLessThan(1e-4);
  });
});
