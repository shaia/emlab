import { describe, expect, it } from 'vitest';
import { E_CHARGE, G, M_ELECTRON, M_PROTON } from '~/physics/constants';
import {
  acceleration,
  balanceField,
  beamY,
  chargeFromBalance,
  crtPath,
  dragCoefficient,
  driftSpeed,
  inUnitsOfE,
  isHovering,
  netForceUp,
  positionAtTime,
  type CrtGeometry,
} from '~/physics/charge-in-field';
import { deflection, rk4Step, uniformField, type Body } from '~/physics/motion';
import { len3, relativeError } from '~/physics/vec';

const GEO: CrtGeometry = { plateLength: 0.06, halfGap: 0.02, screenDistance: 0.12 };

describe('analytic limit: the cathode-ray tube', () => {
  it('the screen spot follows the textbook formula Y = (qEL/mv²)(L/2 + D)', () => {
    const q = -E_CHARGE;
    const E = 5000;
    const v = 2e7;
    const r = crtPath(q, M_ELECTRON, E, v, GEO);
    const expected = ((q * E * GEO.plateLength) / (M_ELECTRON * v * v)) * (GEO.plateLength / 2 + GEO.screenDistance);
    expect(r.outcome).toBe('screen');
    expect(relativeError(r.yScreen, expected)).toBeLessThan(1e-12);
  });

  it('the exit point agrees with deflection() of motion.ts', () => {
    const r = crtPath(E_CHARGE, M_PROTON, 3000, 5e5, GEO);
    expect(relativeError(r.yExit, deflection(E_CHARGE, M_PROTON, 3000, 5e5, GEO.plateLength))).toBeLessThan(1e-12);
  });

  it('with no field the beam goes straight to the centre of the screen', () => {
    const r = crtPath(-E_CHARGE, M_ELECTRON, 0, 2e7, GEO);
    expect(Math.abs(r.yScreen)).toBe(0);
    expect(Math.abs(beamY(-E_CHARGE, M_ELECTRON, 0, 2e7, GEO, 0.1))).toBe(0);
  });

  it('after the plates the path is the tangent line from the exit point, which crosses the axis at L/2', () => {
    const q = -E_CHARGE;
    const E = 4000;
    const v = 2e7;
    const r = crtPath(q, M_ELECTRON, E, v, GEO);
    const xBack = GEO.plateLength - r.yExit / r.slope;
    expect(relativeError(xBack, GEO.plateLength / 2)).toBeLessThan(1e-12);
  });

  it('an electron is pushed against the field, a proton along it', () => {
    expect(crtPath(-E_CHARGE, M_ELECTRON, 3000, 2e7, GEO).yScreen).toBeLessThan(0);
    expect(crtPath(-E_CHARGE, M_ELECTRON, -3000, 2e7, GEO).yScreen).toBeGreaterThan(0);
    expect(crtPath(E_CHARGE, M_PROTON, 3000, 5e5, GEO).yScreen).toBeGreaterThan(0);
  });

  it('a beam that would leave the gap is stopped at the plate where y(x) = half-gap', () => {
    const r = crtPath(-E_CHARGE, M_ELECTRON, 10000, 1e7, GEO);
    expect(r.outcome).toBe('plate');
    expect(Number.isNaN(r.yScreen)).toBe(true);
    expect(r.xHit).toBeLessThan(GEO.plateLength);
    expect(relativeError(Math.abs(deflection(-E_CHARGE, M_ELECTRON, 10000, 1e7, r.xHit)), GEO.halfGap)).toBeLessThan(1e-12);
    expect(r.yHit).toBe(-GEO.halfGap); // an electron in an upward field hits the lower plate
  });

  it('a particle in a gap-filling beam is a projectile: equal x steps in equal times, y steps 1 : 3 : 5', () => {
    const q = -E_CHARGE;
    const dt = 1e-10;
    const p = [1, 2, 3, 4].map((k) => positionAtTime(q, M_ELECTRON, 2000, 2e7, k * dt));
    const dx = p.map((c, i) => c[0] - (i ? p[i - 1][0] : 0));
    const dy = p.map((c, i) => c[1] - (i ? p[i - 1][1] : 0));
    expect(relativeError(dx[3], dx[0])).toBeLessThan(1e-12);
    expect(relativeError(dy[1] / dy[0], 3)).toBeLessThan(1e-12);
    expect(relativeError(dy[2] / dy[0], 5)).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('numerical integration agrees with the closed form, and kinetic energy gained equals |qE·y|', () => {
    const q = -E_CHARGE;
    const E = 3000;
    const v = 2e7;
    let b: Body = { pos: [0, 0, 0], vel: [v, 0, 0], m: M_ELECTRON, q };
    const field = uniformField([0, E, 0]);
    const dt = GEO.plateLength / v / 600;
    let t = 0;
    while (b.pos[0] < GEO.plateLength) {
      b = rk4Step(b, field, t, dt);
      t += dt;
    }
    const model = beamY(q, M_ELECTRON, E, v, GEO, b.pos[0]);
    expect(relativeError(b.pos[1], model)).toBeLessThan(1e-9);
    const gain = 0.5 * M_ELECTRON * (len3(b.vel) ** 2 - v * v);
    expect(relativeError(gain, Math.abs(q * E * b.pos[1]))).toBeLessThan(1e-6);
  });
});

describe('scaling', () => {
  const base = crtPath(-E_CHARGE, M_ELECTRON, 2000, 2e7, GEO);
  it('double the field, double the deflection', () => {
    expect(relativeError(crtPath(-E_CHARGE, M_ELECTRON, 4000, 2e7, GEO).yScreen, 2 * base.yScreen)).toBeLessThan(1e-12);
  });
  it('double the speed, a quarter of the deflection', () => {
    expect(relativeError(crtPath(-E_CHARGE, M_ELECTRON, 2000, 4e7, GEO).yScreen, base.yScreen / 4)).toBeLessThan(1e-12);
  });
  it('a proton at the same speed deflects m_e/m_p of an electron, in the opposite direction', () => {
    const p = crtPath(E_CHARGE, M_PROTON, 2000, 2e7, GEO);
    expect(relativeError(p.yScreen, -base.yScreen * (M_ELECTRON / M_PROTON))).toBeLessThan(1e-12);
  });
  it('at equal kinetic energy the deflection does not depend on the mass', () => {
    const ek = 0.5 * M_ELECTRON * (2e7) ** 2;
    const vp = Math.sqrt((2 * ek) / M_PROTON);
    const p = crtPath(E_CHARGE, M_PROTON, 2000, vp, GEO);
    expect(relativeError(p.yScreen, -base.yScreen)).toBeLessThan(1e-12);
  });
  it('acceleration is qE/m', () => {
    expect(relativeError(acceleration(-E_CHARGE, M_ELECTRON, 2000), (-E_CHARGE * 2000) / M_ELECTRON)).toBeLessThan(1e-15);
  });
  it('gravity on an electron is negligible next to a 10³ N/C field', () => {
    expect((M_ELECTRON * G) / (E_CHARGE * 1000)).toBeLessThan(1e-12);
  });
});

describe('analytic limit: the oil drop', () => {
  const m = 1.6e-15;
  const q = -3 * E_CHARGE;
  it('hovers at qE = mg', () => {
    const E = balanceField(m, q);
    expect(relativeError(E, (m * G) / (3 * E_CHARGE))).toBeLessThan(1e-12);
    expect(Math.abs(netForceUp(q, m, -E))).toBeLessThan(1e-12 * m * G);
    expect(isHovering(q, m, -E)).toBe(true);
  });
  it('with no field the drop falls, at the speed the drag coefficient was built for', () => {
    const gamma = dragCoefficient(m, 1e-3);
    expect(relativeError(driftSpeed(q, m, 0, gamma), -1e-3)).toBeLessThan(1e-12);
    expect(isHovering(q, m, 0)).toBe(false);
  });
  it('a field twice the balance field lifts it at the same speed it falls with no field', () => {
    const gamma = dragCoefficient(m, 1e-3);
    expect(relativeError(driftSpeed(q, m, -2 * balanceField(m, q), gamma), 1e-3)).toBeLessThan(1e-12);
  });
  it('a negative drop needs the field to point down to rise', () => {
    expect(netForceUp(q, m, 1e6)).toBeLessThan(0);
    expect(netForceUp(q, m, -1e6)).toBeGreaterThan(0);
  });
});

describe('scaling: charge quantisation', () => {
  it('the balance field is inversely proportional to the number of elementary charges', () => {
    const m = 1.6e-15;
    const e1 = balanceField(m, E_CHARGE);
    for (const n of [2, 3, 4, 5]) expect(relativeError(balanceField(m, n * E_CHARGE), e1 / n)).toBeLessThan(1e-12);
  });
  it('reading the charge back from the balance field returns n·e', () => {
    const m = 1.6e-15;
    for (const n of [1, 2, 3, 4, 5]) {
      const E = balanceField(m, -n * E_CHARGE);
      expect(relativeError(inUnitsOfE(chargeFromBalance(m, E)), n)).toBeLessThan(1e-12);
    }
  });
});
