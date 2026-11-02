import { describe, expect, it } from 'vitest';
import { EPS0, K } from '~/physics/constants';
import {
  axisFieldExact,
  axisFieldFar,
  axisFieldFromCharge,
  bisectorFieldExact,
  bisectorFieldFar,
  dipoleCharges,
  dipoleDipoleEnergy,
  dipoleEnergy,
  dipoleFieldExact,
  dipoleForceNearCharge,
  dipoleForceNearChargeFar,
  dipoleMoment,
  dipolePotentialExact,
  dipoleTorqueZ,
  logSlope,
  pointDipoleField,
  pointDipoleMagnitude,
  pointDipolePolar,
  pointDipolePotential,
  polarisedSlab,
  slabSurfaceCharge,
  uniformFieldForces,
} from '~/physics/dipole';
import { planeField } from '~/physics/electrostatics';
import { derivative } from '~/physics/calculus';
import { curl2, gradient2 } from '~/physics/vectorcalc';
import { len, relativeError } from '~/physics/vec';

const q = 2e-9;
const d = 0.01;
const p = dipoleMoment(q, d);

describe('analytic limits', () => {
  it('far on the axis the exact two-charge field tends to 2kp/r³', () => {
    for (const r of [1, 10]) {
      const exact = dipoleFieldExact(q, d, r, 0);
      expect(relativeError(exact[0], axisFieldFar(p, r))).toBeLessThan(1e-4);
      expect(Math.abs(exact[1])).toBeLessThan(1e-12 * Math.abs(exact[0]));
    }
  });

  it('far on the bisector the exact field tends to kp/r³, pointing opposite to p', () => {
    const r = 5;
    const exact = dipoleFieldExact(q, d, 0, r);
    expect(relativeError(-exact[0], bisectorFieldFar(p, r))).toBeLessThan(1e-5);
    expect(exact[0]).toBeLessThan(0);
  });

  it('the closed-form axis and bisector fields equal the superposition of the two charges', () => {
    expect(relativeError(axisFieldExact(q, d, 0.03), dipoleFieldExact(q, d, 0.03, 0)[0])).toBeLessThan(1e-12);
    expect(relativeError(bisectorFieldExact(q, d, 0.02), len(dipoleFieldExact(q, d, 0, 0.02)))).toBeLessThan(1e-12);
  });

  it('the relative error of 2kp/r³ on the axis is d²/(2r²) to leading order (1% near r = 7d)', () => {
    for (const r of [0.05, 0.1, 0.3]) {
      const err = axisFieldExact(q, d, r) / axisFieldFar(p, r) - 1;
      expect(relativeError(err, (d * d) / (2 * r * r))).toBeLessThan(0.02);
    }
    const r1 = d / Math.sqrt(0.02);
    expect(axisFieldExact(q, d, r1) / axisFieldFar(p, r1) - 1).toBeCloseTo(0.01, 3);
  });

  it('close to the positive charge the field is that charge alone, kq/s²; far from it, 2kp/s³', () => {
    const s = 1e-5;
    expect(relativeError(axisFieldFromCharge(q, d, s), (K * q) / (s * s))).toBeLessThan(3e-3);
    const S = 100;
    expect(relativeError(axisFieldFromCharge(q, d, S), axisFieldFar(p, S))).toBeLessThan(2e-4);
  });

  it('the log-log slope is −2 close to one charge and −3 far from the dipole', () => {
    const f = (s: number) => axisFieldFromCharge(q, d, s);
    expect(logSlope(f, 1e-5)).toBeCloseTo(-2, 2);
    expect(logSlope(f, 10)).toBeCloseTo(-3, 2);
    const g = (r: number) => bisectorFieldExact(q, d, r);
    expect(logSlope(g, 1e-5)).toBeCloseTo(0, 2);
    expect(logSlope(g, 10)).toBeCloseTo(-3, 2);
  });

  it('the point-dipole magnitude reduces to 2kp/r³ on the axis and kp/r³ on the bisector', () => {
    expect(relativeError(pointDipoleMagnitude(p, 0.4, 0), axisFieldFar(p, 0.4))).toBeLessThan(1e-12);
    expect(relativeError(pointDipoleMagnitude(p, 0.4, Math.PI / 2), bisectorFieldFar(p, 0.4))).toBeLessThan(1e-12);
  });

  it('the field is perpendicular to p where tan²θ = 2 (θ ≈ 54.7°), with |E| = √2·kp/r³', () => {
    const th = Math.atan(Math.SQRT2);
    const E = pointDipoleField(p, Math.cos(th), Math.sin(th));
    expect(Math.abs(E[0])).toBeLessThan(1e-12 * Math.abs(E[1]));
    expect(relativeError(len(E), Math.SQRT2 * K * p)).toBeLessThan(1e-12);
  });

  it('a dipole near a point charge is pulled toward it with F → 2kQp/r³ far away', () => {
    const Q = 1e-6;
    const r = 2;
    expect(dipoleForceNearCharge(Q, q, d, r)).toBeLessThan(0);
    expect(relativeError(dipoleForceNearCharge(Q, q, d, r), dipoleForceNearChargeFar(Q, p, r))).toBeLessThan(1e-4);
  });

  it('a slab with κ = 1 is not polarised, and a large κ almost cancels the applied field', () => {
    expect(polarisedSlab(1e4, 1)).toEqual({ E: 1e4, P: 0, sigmaBound: 0 });
    expect(polarisedSlab(1e4, 1e6).E).toBeLessThan(1e-1);
  });
});

describe('identities', () => {
  it('E = −∇V: the gradient of kp·cosθ/r² is the point-dipole field', () => {
    for (const [x, y, phi] of [
      [0.3, 0.1, 0],
      [-0.2, 0.25, 0.7],
      [0.05, -0.4, 2],
    ]) {
      const V = (a: number, b: number) => pointDipolePotential(p, a, b, phi);
      const g = gradient2(V, x, y, 1e-6);
      const E = pointDipoleField(p, x, y, phi);
      expect(relativeError(-g[0], E[0])).toBeLessThan(1e-6);
      expect(relativeError(-g[1], E[1])).toBeLessThan(1e-6);
    }
  });

  it('E = −∇V for the exact two-charge potential and field as well', () => {
    const V = (a: number, b: number) => dipolePotentialExact(q, d, a, b);
    const g = gradient2(V, 0.02, 0.015, 1e-7);
    const E = dipoleFieldExact(q, d, 0.02, 0.015);
    expect(relativeError(-g[0], E[0])).toBeLessThan(1e-6);
    expect(relativeError(-g[1], E[1])).toBeLessThan(1e-6);
  });

  it('the polar components E_r = −∂V/∂r and E_θ = −(1/r)∂V/∂θ match the Cartesian field', () => {
    const r = 0.5;
    const th = 0.6;
    const Vr = (rr: number) => pointDipolePotential(p, rr * Math.cos(th), rr * Math.sin(th));
    const Vt = (tt: number) => pointDipolePotential(p, r * Math.cos(tt), r * Math.sin(tt));
    const { Er, Etheta } = pointDipolePolar(p, r, th);
    expect(relativeError(-derivative(Vr, r), Er)).toBeLessThan(1e-6);
    expect(relativeError(-derivative(Vt, th) / r, Etheta)).toBeLessThan(1e-6);
    const E = pointDipoleField(p, r * Math.cos(th), r * Math.sin(th));
    // r̂ = (cosθ, sinθ), θ̂ = (−sinθ, cosθ)
    expect(relativeError(E[0], Er * Math.cos(th) - Etheta * Math.sin(th))).toBeLessThan(1e-12);
  });

  it('the dipole field is curl-free (it is the gradient of a potential)', () => {
    const F = (a: number, b: number) => pointDipoleField(p, a, b, 0.4);
    const scale = len(F(0.3, 0.2)) / 0.3;
    expect(Math.abs(curl2(F, 0.3, 0.2, 1e-5))).toBeLessThan(1e-6 * scale);
  });

  it('in a uniform field the net force is zero and the torque of the two forces is p×E', () => {
    const E = 3e4;
    for (const th of [0.3, 1.2, 2.5, -0.8]) {
      const { force, torqueZ } = uniformFieldForces(q, d, th, [E, 0]);
      expect(Math.abs(force[0]) + Math.abs(force[1])).toBeLessThan(1e-12 * q * E);
      expect(relativeError(torqueZ, dipoleTorqueZ(p, E, th))).toBeLessThan(1e-12);
    }
  });

  it('the torque is minus the derivative of the energy: τ = −dU/dθ', () => {
    const E = 3e4;
    for (const th of [0.4, 1.5707963, 2.8]) {
      expect(relativeError(-derivative((t) => dipoleEnergy(p, E, t), th), dipoleTorqueZ(p, E, th))).toBeLessThan(1e-6);
    }
  });

  it('energy: minimum −pE at θ = 0 (stable), maximum +pE at θ = 180° (unstable); flipping costs 2pE', () => {
    const E = 3e4;
    expect(dipoleEnergy(p, E, 0)).toBeCloseTo(-p * E, 20);
    expect(dipoleEnergy(p, E, Math.PI)).toBeCloseTo(p * E, 20);
    // near θ = 0 the torque pulls back; near θ = 180° it pushes away
    expect(dipoleTorqueZ(p, E, 0.1)).toBeLessThan(0);
    expect(dipoleTorqueZ(p, E, Math.PI - 0.1)).toBeLessThan(0);
    expect(dipoleTorqueZ(p, E, Math.PI + 0.1)).toBeGreaterThan(0);
    expect(relativeError(dipoleEnergy(p, E, Math.PI) - dipoleEnergy(p, E, 0), 2 * p * E)).toBeLessThan(1e-12);
  });

  it('the slab: the bound surface charge cuts the field by σ_b/ε₀, so E = E₀ − σ_b/ε₀ = E₀/κ', () => {
    const E0 = 2e5;
    const s = polarisedSlab(E0, 3);
    expect(relativeError(E0 - s.sigmaBound / EPS0, s.E)).toBeLessThan(1e-12);
    // the field of the two bound layers is that of two plates: σ_b/ε₀ = 2 × σ_b/(2ε₀)
    expect(relativeError(2 * planeField(s.sigmaBound), E0 - s.E)).toBeLessThan(1e-12);
    expect(relativeError(slabSurfaceCharge(1e28, 2e-33), 2e-5)).toBeLessThan(1e-12);
  });
});

describe('two dipoles', () => {
  it('the point-dipole interaction energy equals the four Coulomb pair energies of two small dipoles far apart', () => {
    const a = dipoleCharges(q, d, 0.3, 0, 0);
    const b = dipoleCharges(q, d, 2.1, 0.4, 0.25);
    let W = 0;
    for (const c1 of a) for (const c2 of b) W += (K * c1.q * c2.q) / Math.hypot(c1.x - c2.x, c1.y - c2.y);
    expect(relativeError(W, dipoleDipoleEnergy(p, 0.3, p, 2.1, 0.4, 0.25))).toBeLessThan(2e-3);
  });

  it('head to tail on one line the energy is −2kp₁p₂/r³; side by side and antiparallel it is −kp₁p₂/r³', () => {
    expect(relativeError(dipoleDipoleEnergy(p, 0, 2 * p, 0, 0.3, 0), (-2 * K * p * 2 * p) / 0.3 ** 3)).toBeLessThan(1e-12);
    expect(relativeError(dipoleDipoleEnergy(p, Math.PI / 2, p, -Math.PI / 2, 0.3, 0), (-K * p * p) / 0.3 ** 3)).toBeLessThan(1e-12);
    // W = −p₂·E₁ with the field of p₁ at r
    const E1 = pointDipoleField(p, 0.3, 0.1, 0.5);
    const W = -(p * Math.cos(1.2) * E1[0] + p * Math.sin(1.2) * E1[1]);
    expect(relativeError(dipoleDipoleEnergy(p, 0.5, p, 1.2, 0.3, 0.1), W)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('the far field scales with p: doubling q or d doubles it', () => {
    const r = 3;
    const E1 = dipoleFieldExact(q, d, r, 0)[0];
    expect(relativeError(dipoleFieldExact(2 * q, d, r, 0)[0], 2 * E1)).toBeLessThan(1e-12);
    expect(relativeError(dipoleFieldExact(q, 2 * d, r, 0)[0], 2 * E1)).toBeLessThan(1e-4);
  });

  it('far away, doubling the distance cuts the field by 8, not by 4', () => {
    const r = 2;
    expect(dipoleFieldExact(q, d, r, 0)[0] / dipoleFieldExact(q, d, 2 * r, 0)[0]).toBeCloseTo(8, 3);
    expect(dipoleFieldExact(q, d, 0, r)[0] / dipoleFieldExact(q, d, 0, 2 * r)[0]).toBeCloseTo(8, 3);
  });

  it('the torque and the energy scale with p and with E', () => {
    expect(relativeError(dipoleTorqueZ(2 * p, 1e4, 0.7), 2 * dipoleTorqueZ(p, 1e4, 0.7))).toBeLessThan(1e-12);
    expect(relativeError(dipoleEnergy(p, 3e4, 0.7), 3 * dipoleEnergy(p, 1e4, 0.7))).toBeLessThan(1e-12);
  });

  it('the dipole charges sit d apart with +q at the head of p', () => {
    const [plus, minus] = dipoleCharges(q, d, Math.PI / 2, 1, 1);
    expect(plus.q).toBe(q);
    expect(minus.q).toBe(-q);
    expect(plus.y - minus.y).toBeCloseTo(d, 15);
  });
});

describe('convergence', () => {
  it('the error of the far-field formula shrinks as (d/r)²: ten times farther, a hundred times smaller', () => {
    const e1 = axisFieldExact(q, d, 0.1) / axisFieldFar(p, 0.1) - 1;
    const e2 = axisFieldExact(q, d, 1) / axisFieldFar(p, 1) - 1;
    expect(e1 / e2).toBeCloseTo(100, 0);
    const b1 = 1 - bisectorFieldExact(q, d, 0.1) / bisectorFieldFar(p, 0.1);
    const b2 = 1 - bisectorFieldExact(q, d, 1) / bisectorFieldFar(p, 1);
    expect(b1 / b2).toBeCloseTo(100, 0);
  });
});
