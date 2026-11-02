import { describe, expect, it } from 'vitest';
import {
  coilSideForces,
  coilSides,
  coilTorqueZ,
  commutatorSign,
  meterDeflection,
  rotorEnergy,
  rotorStep,
  type Rotor,
  type RotorParams,
} from '~/physics/coil';
import { loopTorque, wireForce } from '~/physics/magnetism';
import { relativeError } from '~/physics/vec';

const N = 20;
const I = 2;
const a = 0.08;
const b = 0.05;
const A = a * b;
const B = 0.5;

const torqueFromForces = (phi: number) =>
  coilSideForces(N, I, a, b, B, phi).reduce((s, f) => s + f.at[0] * f.F[1] - f.at[1] * f.F[0], 0);

const run = (s0: Rotor, p: RotorParams, T: number, dt: number) => {
  let s = s0;
  for (let k = 0; k < Math.round(T / dt); k++) s = rotorStep(s, p, dt);
  return s;
};

describe('coil in a uniform field: analytic limits', () => {
  it('the net force on the coil is zero at every angle', () => {
    for (const phi of [0, 0.3, 1, Math.PI / 2, 2.5, Math.PI, -1.2]) {
      const net = coilSideForces(N, I, a, b, B, phi).reduce((s, f) => [s[0] + f.F[0], s[1] + f.F[1], s[2] + f.F[2]], [0, 0, 0]);
      const scale = wireForce(N * I, a, B);
      expect(Math.hypot(...net) / scale).toBeLessThan(1e-12);
    }
  });

  it('the force on each side parallel to the axle is NBIa, perpendicular to B, at every angle', () => {
    for (const phi of [0, 0.7, Math.PI / 2, 2]) {
      const [out, , inn] = coilSideForces(N, I, a, b, B, phi);
      expect(relativeError(out.F[1], wireForce(N * I, a, B))).toBeLessThan(1e-12);
      expect(relativeError(inn.F[1], -wireForce(N * I, a, B))).toBeLessThan(1e-12);
      expect(out.F[0]).toBe(0);
    }
  });

  it('the other two sides are pushed along the axle, so they add no torque about it', () => {
    const [, top, , bottom] = coilSideForces(N, I, a, b, B, 0.9);
    expect(top.F[0]).toBeCloseTo(0, 14);
    expect(top.F[1]).toBeCloseTo(0, 14);
    expect(relativeError(top.F[2], -bottom.F[2])).toBeLessThan(1e-12);
    // their size is NBIb·|cos φ|, from the angle between that side and B
    expect(relativeError(Math.abs(top.F[2]), wireForce(N * I, b, B) * Math.abs(Math.cos(0.9)))).toBeLessThan(1e-12);
  });

  it('the side forces times their lever arms give τ = NBIA·sinθ, θ between the normal and B', () => {
    for (const phi of [0.2, 0.9, Math.PI / 2, 2.4, -0.6]) {
      expect(relativeError(torqueFromForces(phi), coilTorqueZ(N, I, A, B, phi))).toBeLessThan(1e-12);
      expect(relativeError(Math.abs(coilTorqueZ(N, I, A, B, phi)), Math.abs(loopTorque(N, I, A, B, phi)))).toBeLessThan(1e-12);
    }
  });

  it('the torque is largest when the plane lies along B (θ = 90°) and zero when it faces B (θ = 0, 180°)', () => {
    expect(relativeError(Math.abs(coilTorqueZ(N, I, A, B, Math.PI / 2)), N * B * I * A)).toBeLessThan(1e-12);
    expect(Math.abs(coilTorqueZ(N, I, A, B, 0))).toBe(0);
    expect(Math.abs(coilTorqueZ(N, I, A, B, Math.PI))).toBeLessThan(1e-15);
  });

  it('the torque turns the normal toward B: φ = 0 is stable, φ = 180° unstable', () => {
    expect(coilTorqueZ(N, I, A, B, 0.1)).toBeLessThan(0);
    expect(coilTorqueZ(N, I, A, B, -0.1)).toBeGreaterThan(0);
    expect(coilTorqueZ(N, I, A, B, Math.PI - 0.1)).toBeLessThan(0); // pushes further from 180°
    expect(coilTorqueZ(N, I, A, B, Math.PI + 0.1)).toBeGreaterThan(0);
  });

  it('the ⊙ side sits where the right-hand rule puts it: normal up, ⊙ side on the left', () => {
    const s = coilSides(Math.PI / 2, b);
    expect(s.out[0]).toBeCloseTo(-b / 2, 15);
    expect(s.in[0]).toBeCloseTo(b / 2, 15);
  });

  it('a small swing about the stable position has the period 2π·√(J/NBIA)', () => {
    const p: RotorParams = { N, I, A, B, J: 1e-3, c: 0, commutator: false };
    const T = 2 * Math.PI * Math.sqrt(p.J / (N * B * I * A));
    const s = run({ phi: 1e-3, omega: 0 }, p, T, T / 2000);
    expect(relativeError(s.phi, 1e-3)).toBeLessThan(1e-5);
  });

  it('the moving-coil meter deflects in proportion to the current', () => {
    const k = 2e-3;
    expect(relativeError(meterDeflection(N, 2 * I, A, B, k), 2 * meterDeflection(N, I, A, B, k))).toBeLessThan(1e-12);
    expect(relativeError(meterDeflection(N, I, A, B, k), (N * B * I * A) / k)).toBeLessThan(1e-12);
  });
});

describe('coil in a uniform field: conservation', () => {
  it('without friction or commutator, ½Jω² − NIAB·cos φ stays constant through a large swing', () => {
    const p: RotorParams = { N, I, A, B, J: 1e-3, c: 0, commutator: false };
    const s0: Rotor = { phi: 2.5, omega: 0 };
    const E0 = rotorEnergy(p, s0);
    const s = run(s0, p, 3, 1e-3);
    expect(Math.abs(rotorEnergy(p, s) - E0) / (N * I * A * B)).toBeLessThan(1e-8);
  });

  it('with friction and no commutator the coil settles at the stable position, plane perpendicular to B', () => {
    const p: RotorParams = { N, I, A, B, J: 1e-3, c: 5e-3, commutator: false };
    const s = run({ phi: 2.5, omega: 0 }, p, 20, 2e-3);
    expect(Math.abs(s.phi)).toBeLessThan(1e-3);
    expect(Math.abs(s.omega)).toBeLessThan(1e-3);
  });

  it('with a commutator the torque never changes sense, and the motor keeps turning one way', () => {
    for (let phi = -6; phi < 6; phi += 0.05) expect(coilTorqueZ(N, I * commutatorSign(phi), A, B, phi)).toBeGreaterThanOrEqual(0);
    const p: RotorParams = { N, I, A, B, J: 1e-3, c: 5e-3, commutator: true };
    const s = run({ phi: 1, omega: 0 }, p, 20, 2e-3);
    expect(s.phi).toBeGreaterThan(1 + 4 * Math.PI);
    // at steady speed the mean driving torque (2/π)·NBIA balances friction cω
    expect(relativeError(s.omega, ((2 / Math.PI) * N * B * I * A) / p.c)).toBeLessThan(0.1);
  });
});

describe('coil in a uniform field: scaling', () => {
  it('the torque is proportional to N, I, A and B', () => {
    const t = coilTorqueZ(N, I, A, B, 1);
    expect(relativeError(coilTorqueZ(2 * N, I, A, B, 1), 2 * t)).toBeLessThan(1e-12);
    expect(relativeError(coilTorqueZ(N, 3 * I, A, B, 1), 3 * t)).toBeLessThan(1e-12);
    expect(relativeError(coilTorqueZ(N, I, 4 * A, B, 1), 4 * t)).toBeLessThan(1e-12);
    expect(relativeError(coilTorqueZ(N, I, A, 0.5 * B, 1), 0.5 * t)).toBeLessThan(1e-12);
    expect(relativeError(coilTorqueZ(N, -I, A, B, 1), -t)).toBeLessThan(1e-12);
  });

  it('only the area counts: a long thin coil and a square one of the same area feel the same torque', () => {
    const sq = Math.sqrt(A);
    const t1 = coilSideForces(N, I, sq, sq, B, 1).reduce((s, f) => s + f.at[0] * f.F[1] - f.at[1] * f.F[0], 0);
    expect(relativeError(t1, torqueFromForces(1))).toBeLessThan(1e-12);
  });
});

describe('coil in a uniform field: convergence', () => {
  it('RK4: halving the step cuts the error by about 16', () => {
    const p: RotorParams = { N, I, A, B, J: 1e-3, c: 2e-3, commutator: false };
    const s0: Rotor = { phi: 2, omega: 0 };
    const ref = run(s0, p, 1, 1e-4).phi;
    const e1 = Math.abs(run(s0, p, 1, 0.02).phi - ref);
    const e2 = Math.abs(run(s0, p, 1, 0.01).phi - ref);
    expect(e1 / e2).toBeGreaterThan(12);
    expect(e1 / e2).toBeLessThan(20);
  });
});
