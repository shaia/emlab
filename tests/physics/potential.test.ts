import { describe, expect, it } from 'vitest';
import { E_CHARGE, K, M_ELECTRON, M_PROTON } from '~/physics/constants';
import { fieldAt, potentialAt, type PointCharge } from '~/physics/electrostatics';
import { rk4Step, type Body } from '~/physics/motion';
import {
  closestApproach,
  connectSpheres,
  contourSegments,
  fieldFromVoltage,
  fieldWork,
  fromEV,
  kineticGain,
  pairEnergy,
  pathLength,
  pointPotential,
  speedAfter,
  sphereEnergy,
  sphereFieldAt,
  spherePotentialAt,
  toEV,
  uniformPotential,
  uniformWork,
  workAlongPath,
} from '~/physics/potential';
import type { Vec2, Vec3 } from '~/physics/vec';
import { relativeError } from '~/physics/vec';

const uC = 1e-6;

/** n points along a straight segment, ends included */
const segment = (a: Vec2, b: Vec2, n: number): Vec2[] =>
  Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);

describe('analytic limits', () => {
  it('work of a uniform field is qEd along the field, zero across it', () => {
    const E: Vec2 = [2000, 0];
    expect(relativeError(uniformWork(3e-9, E, [0, 0], [0.1, 0]), 3e-9 * 2000 * 0.1)).toBeLessThan(1e-12);
    expect(Math.abs(uniformWork(3e-9, E, [0, 0], [0, 0.4]))).toBe(0);
    expect(uniformWork(-3e-9, E, [0, 0], [0.1, 0])).toBeLessThan(0);
  });

  it('the potential energy of a pair is kq₁q₂/r: positive for like charges, negative for unlike', () => {
    expect(relativeError(pairEnergy(2 * uC, 3 * uC, 0.1), 0.54)).toBeLessThan(1e-12);
    expect(pairEnergy(2 * uC, -3 * uC, 0.1)).toBeLessThan(0);
  });

  it('the point-charge potential agrees with the superposition engine', () => {
    const q: PointCharge[] = [{ x: 0, y: 0, q: 4 * uC }];
    expect(relativeError(potentialAt(q, 0.3, 0.4), pointPotential(4 * uC, 0.5))).toBeLessThan(1e-12);
  });

  it('potential decreases along a uniform field by E per metre', () => {
    const E: Vec2 = [500, 0];
    expect(relativeError(uniformPotential(E, [0.2, 0.7]), -100)).toBeLessThan(1e-12);
    expect(uniformPotential(E, [0, 0.7])).toBe(-0);
  });

  it('E = V/d between plates: 200 V across 4 mm is 5·10⁴ V/m', () => {
    expect(relativeError(fieldFromVoltage(200, 4e-3), 5e4)).toBeLessThan(1e-12);
  });

  it('an electron through 2000 V from rest reaches √(2eV/m) = 2.65·10⁷ m/s', () => {
    const v = speedAfter(-E_CHARGE, M_ELECTRON, 2000);
    expect(relativeError(v, Math.sqrt((2 * E_CHARGE * 2000) / M_ELECTRON))).toBeLessThan(1e-12);
    expect(relativeError(v, 2.652e7)).toBeLessThan(1e-3);
  });

  it('a proton cannot climb a potential hill higher than its kinetic energy allows', () => {
    // 1000 eV of kinetic energy cannot climb 1500 V
    const v0 = Math.sqrt((2 * fromEV(1000)) / M_PROTON);
    expect(speedAfter(E_CHARGE, M_PROTON, 1500, v0)).toBeNaN();
    expect(speedAfter(E_CHARGE, M_PROTON, 1000, v0)).toBeCloseTo(0, 3);
  });

  it('a 5 MeV alpha particle stops 4.5·10⁻¹⁴ m from a gold nucleus (Rutherford)', () => {
    const q = 2 * E_CHARGE;
    const Q = 79 * E_CHARGE;
    const m = 4 * M_PROTON;
    const v0 = Math.sqrt((2 * fromEV(5e6)) / m);
    expect(relativeError(closestApproach(q, Q, m, v0), (K * q * Q) / fromEV(5e6))).toBeLessThan(1e-12);
    expect(relativeError(closestApproach(q, Q, m, v0), 4.55e-14)).toBeLessThan(1e-3);
  });

  it('a conducting sphere is one potential inside and kQ/r outside; its field is zero inside', () => {
    const Q = 2 * uC;
    const R = 0.1;
    expect(spherePotentialAt(Q, R, 0)).toBe(spherePotentialAt(Q, R, R));
    expect(relativeError(spherePotentialAt(Q, R, 0.05), (K * Q) / R)).toBeLessThan(1e-12);
    expect(relativeError(spherePotentialAt(Q, R, 0.4), pointPotential(Q, 0.4))).toBeLessThan(1e-12);
    expect(sphereFieldAt(Q, R, 0.05)).toBe(0);
    expect(relativeError(sphereFieldAt(Q, R, 0.2), (K * Q) / 0.04)).toBeLessThan(1e-12);
  });

  it('the equipotential of a point charge at level V is a circle of radius kQ/V', () => {
    const Q = 2 * uC;
    const level = 6e4; // radius 0.3 m
    const f = (x: number, y: number) => pointPotential(Q, Math.hypot(x, y));
    const segs = contourSegments(f, { xmin: -1, xmax: 1, ymin: -1, ymax: 1 }, 120, 120, level);
    expect(segs.length).toBeGreaterThan(40);
    for (const [a, b] of segs) {
      for (const p of [a, b]) expect(relativeError(Math.hypot(p[0], p[1]), (K * Q) / level)).toBeLessThan(0.02);
    }
  });
});

describe('conservation', () => {
  it('the work of a point charge’s field does not depend on the path (conservative field)', () => {
    const src: PointCharge[] = [{ x: 0, y: 0, q: 2 * uC }];
    const field = (x: number, y: number) => fieldAt(src, x, y);
    const q = 1e-9;
    const A: Vec2 = [0.2, 0];
    const B: Vec2 = [0.6, 0.3];
    const straight = segment(A, B, 2000);
    const detour = [...segment(A, [-0.4, 0.5], 2000), ...segment([-0.4, 0.5], [0.3, -0.6], 2000).slice(1), ...segment([0.3, -0.6], B, 2000).slice(1)];
    const exact = fieldWork(q, pointPotential(2 * uC, 0.2), pointPotential(2 * uC, Math.hypot(0.6, 0.3)));
    expect(pathLength(detour)).toBeGreaterThan(3 * pathLength(straight));
    expect(relativeError(workAlongPath(q, field, straight), exact)).toBeLessThan(1e-4);
    expect(relativeError(workAlongPath(q, field, detour), exact)).toBeLessThan(1e-4);
  });

  it('around a closed loop the field does no net work', () => {
    const E = (_x: number, _y: number): Vec2 => [3000, -1000];
    const loop = [...segment([0, 0], [0.5, 0], 50), ...segment([0.5, 0], [0.5, 0.5], 50).slice(1), ...segment([0.5, 0.5], [0, 0], 50).slice(1)];
    expect(Math.abs(workAlongPath(2e-9, E, loop))).toBeLessThan(1e-18);
  });

  it('W_field = −ΔU: the work equals the drop in pair energy', () => {
    const Q = 3 * uC;
    const q = -2 * uC;
    const w = fieldWork(q, pointPotential(Q, 0.5), pointPotential(Q, 0.1));
    expect(relativeError(w, -(pairEnergy(Q, q, 0.1) - pairEnergy(Q, q, 0.5)))).toBeLessThan(1e-12);
  });

  it('a proton integrated through a point charge’s field keeps ½mv² + qV constant', () => {
    const Q = 1e-9;
    const E3 = (p: Vec3): Vec3 => {
      const [ex, ey] = fieldAt([{ x: 0, y: 0, q: Q }], p[0], p[1]);
      return [ex, ey, 0];
    };
    let b: Body = { pos: [0.02, 0.01, 0], vel: [-4e4, 0, 0], q: E_CHARGE, m: M_PROTON };
    const energy = (s: Body) => 0.5 * s.m * (s.vel[0] ** 2 + s.vel[1] ** 2) + s.q * pointPotential(Q, Math.hypot(s.pos[0], s.pos[1]));
    const e0 = energy(b);
    for (let i = 0; i < 16000; i++) b = rk4Step(b, (p) => E3(p), 0, 5e-9);
    expect(relativeError(energy(b), e0)).toBeLessThan(1e-6);
  });

  it('kinetic gain is −qΔV, and speedAfter is its inverse', () => {
    const v = speedAfter(E_CHARGE, M_PROTON, -500, 1e5);
    expect(relativeError(0.5 * M_PROTON * (v * v - 1e10), kineticGain(E_CHARGE, -500))).toBeLessThan(1e-9);
  });

  it('connected spheres share the charge (total conserved) and end at one potential', () => {
    const r = connectSpheres(6 * uC, 0.1, 0, 0.2);
    expect(relativeError(r.q1 + r.q2, 6 * uC)).toBeLessThan(1e-12);
    expect(relativeError(r.q1, 2 * uC)).toBeLessThan(1e-12);
    expect(relativeError(spherePotentialAt(r.q1, 0.1, 0.1), spherePotentialAt(r.q2, 0.2, 0.2))).toBeLessThan(1e-12);
    expect(relativeError(r.V, 1.8e5)).toBeLessThan(1e-12);
  });

  it('connecting two spheres never creates energy: some is lost in the wire', () => {
    const before = sphereEnergy(6 * uC, 0.1) + sphereEnergy(0, 0.2);
    const r = connectSpheres(6 * uC, 0.1, 0, 0.2);
    const after = sphereEnergy(r.q1, 0.1) + sphereEnergy(r.q2, 0.2);
    expect(after).toBeLessThan(before);
    // equal potentials to begin with: nothing flows, nothing is lost
    const same = connectSpheres(1 * uC, 0.1, 2 * uC, 0.2);
    expect(relativeError(same.q1, 1 * uC)).toBeLessThan(1e-12);
  });
});

describe('scaling (the dimensional proxy)', () => {
  it('potential is linear in Q and falls as 1/r (not 1/r²)', () => {
    expect(relativeError(pointPotential(2 * uC, 0.2), 2 * pointPotential(uC, 0.2))).toBeLessThan(1e-12);
    expect(relativeError(pointPotential(uC, 0.4), pointPotential(uC, 0.2) / 2)).toBeLessThan(1e-12);
  });

  it('final speed grows as √V: four times the voltage doubles the speed', () => {
    expect(relativeError(speedAfter(-E_CHARGE, M_ELECTRON, 4000), 2 * speedAfter(-E_CHARGE, M_ELECTRON, 1000))).toBeLessThan(1e-12);
  });

  it('electron-volts and joules convert by e, both ways', () => {
    expect(relativeError(fromEV(100), 1.6e-17)).toBeLessThan(1e-12);
    expect(relativeError(toEV(fromEV(37)), 37)).toBeLessThan(1e-12);
  });

  it('closest approach halves when the kinetic energy doubles', () => {
    const v = 1e6;
    expect(relativeError(closestApproach(E_CHARGE, E_CHARGE, M_PROTON, v * Math.SQRT2), closestApproach(E_CHARGE, E_CHARGE, M_PROTON, v) / 2)).toBeLessThan(1e-12);
  });

  it('a sphere twice as big takes twice the share of the charge', () => {
    const r = connectSpheres(3 * uC, 0.05, 0, 0.1);
    expect(relativeError(r.q2, 2 * r.q1)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('path-integrated work converges to the exact value at second order', () => {
    const src: PointCharge[] = [{ x: 0, y: 0, q: uC }];
    const field = (x: number, y: number) => fieldAt(src, x, y);
    const A: Vec2 = [0.1, 0.05];
    const B: Vec2 = [0.5, -0.2];
    const exact = fieldWork(1, pointPotential(uC, Math.hypot(...A)), pointPotential(uC, Math.hypot(...B)));
    const err = (n: number) => Math.abs(workAlongPath(1, field, segment(A, B, n)) - exact);
    const ratio = err(20) / err(40);
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });
});
