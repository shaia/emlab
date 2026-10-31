import { describe, expect, it } from 'vitest';
import { EPS0, K } from '~/physics/constants';
import {
  cavityChargeField,
  cavityField,
  chargedConductorField,
  uniformSigma,
  inducedChargeHemisphere,
  inducedChargeBetween,
  inducedChargeTotal,
  inducedSigma,
  sphereField,
  spherePotential,
  traceSphereLine,
} from '~/physics/conductors';
import { len3, relativeError, type Vec3 } from '~/physics/vec';

const E0 = 2e4;
const R = 0.35;
const at = (r: number, theta: number, phi = 0): Vec3 => [
  r * Math.cos(theta),
  r * Math.sin(theta) * Math.cos(phi),
  r * Math.sin(theta) * Math.sin(phi),
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('analytic limits', () => {
  it('the field is exactly zero everywhere inside the conductor', () => {
    for (const f of [0, 0.3, 0.7, 0.999]) {
      for (const th of [0, 0.6, 1.5, 2.8]) expect(len3(sphereField(E0, R, at(f * R, th, 0.4)))).toBe(0);
    }
  });

  it('the field at the surface is perpendicular to it', () => {
    for (const th of [0.1, 0.5, 1.0, 1.4, 2.0, 2.6, 3.0]) {
      const n = at(1, th);
      const e = sphereField(E0, R, at(R * (1 + 1e-12), th));
      const normal = dot(e, n);
      const tangential = Math.sqrt(Math.max(0, dot(e, e) - normal * normal));
      expect(tangential / Math.abs(normal)).toBeLessThan(1e-6);
    }
  });

  it('far from the sphere the field returns to E₀ along +x', () => {
    const e = sphereField(E0, R, at(1000 * R, 0.8, 0.3));
    expect(relativeError(e[0], E0)).toBeLessThan(1e-7);
    expect(Math.abs(e[1]) / E0).toBeLessThan(1e-7);
    expect(Math.abs(e[2]) / E0).toBeLessThan(1e-7);
  });

  it('the surface charge is σ = 3ε₀E₀cosθ: largest on the axis, zero on the equator, opposite signs on the two sides', () => {
    expect(relativeError(inducedSigma(E0, 0), 3 * EPS0 * E0)).toBeLessThan(1e-12);
    expect(Math.abs(inducedSigma(E0, Math.PI / 2))).toBeLessThan(1e-20);
    expect(inducedSigma(E0, Math.PI)).toBeLessThan(0);
  });

  it('σ equals ε₀ times the outward normal field just outside the surface (boundary condition)', () => {
    for (const th of [0.2, 0.9, 2.2, 3.0]) {
      const e = sphereField(E0, R, at(R * (1 + 1e-12), th));
      expect(relativeError(EPS0 * dot(e, at(1, th)), inducedSigma(E0, th))).toBeLessThan(1e-6);
    }
  });

  it('the potential is the same (zero) on the whole surface and inside', () => {
    for (const th of [0, 0.7, 1.9, 3.1]) {
      expect(Math.abs(spherePotential(E0, R, at(R, th)))).toBeLessThan(1e-9);
    }
    expect(spherePotential(E0, R, at(0.5 * R, 1))).toBe(0);
  });

  it('an empty cavity inside a conductor holds no field', () => {
    expect(len3(cavityField(E0, R, [0.01, 0.02, 0]))).toBe(0);
  });

  it('a field line that reaches the sphere ends on it, along the normal', () => {
    const line = traceSphereLine(E0, R, [-1, 0.12], 1, { bounds: { xmin: -1.1, xmax: 1.1, ymin: -1, ymax: 1 }, maxStep: 0.01 });
    expect(line.end).toBe('surface');
    const [x, y] = line.points.at(-1)!;
    expect(relativeError(Math.hypot(x, y), R)).toBeLessThan(1e-9);
    const [px, py] = line.points.at(-2)!;
    // the last small step points (nearly) along the radius
    const sx = x - px;
    const sy = y - py;
    const cross = Math.abs(sx * y - sy * x) / (Math.hypot(sx, sy) * Math.hypot(x, y));
    expect(cross).toBeLessThan(0.05);
  });
});

describe('conservation', () => {
  it('the total induced charge is zero: the conductor was neutral', () => {
    const scale = inducedChargeHemisphere(E0, R);
    expect(Math.abs(inducedChargeTotal(E0, R)) / scale).toBeLessThan(1e-9);
  });

  it('the two hemispheres carry equal and opposite charge, ±3πε₀E₀R²', () => {
    const half = inducedChargeHemisphere(E0, R);
    expect(relativeError(half, 3 * Math.PI * EPS0 * E0 * R * R)).toBeLessThan(1e-6);
    expect(relativeError(inducedChargeBetween(E0, R, Math.PI / 2, Math.PI), -half)).toBeLessThan(1e-9);
  });

  it('the net flux through a sphere around the conductor is zero (Gauss), midpoint rule over the sphere', () => {
    const rr = 2 * R;
    const n = 400;
    let flux = 0;
    let absFlux = 0;
    for (let i = 0; i < n; i++) {
      const th = ((i + 0.5) * Math.PI) / n;
      const e = sphereField(E0, R, at(rr, th));
      const eN = dot(e, at(1, th));
      flux += eN * 2 * Math.PI * rr * rr * Math.sin(th) * (Math.PI / n);
      absFlux += Math.abs(eN) * 2 * Math.PI * rr * rr * Math.sin(th) * (Math.PI / n);
    }
    expect(Math.abs(flux) / absFlux).toBeLessThan(1e-4);
  });

  it('the field is the negative gradient of the potential (outside)', () => {
    const p = at(1.7 * R, 0.9, 0.5);
    const h = 1e-6;
    const g = [0, 1, 2].map((i) => {
      const a = [...p] as [number, number, number];
      const b = [...p] as [number, number, number];
      a[i] += h;
      b[i] -= h;
      return -(spherePotential(E0, R, a) - spherePotential(E0, R, b)) / (2 * h);
    });
    const e = sphereField(E0, R, p);
    for (let i = 0; i < 3; i++) expect(Math.abs(g[i] - e[i]) / len3(e)).toBeLessThan(1e-6);
  });
});

describe('scaling', () => {
  it('every field value and σ are proportional to E₀', () => {
    const p = at(1.5 * R, 0.7, 0.2);
    const a = sphereField(E0, R, p);
    const b = sphereField(3 * E0, R, p);
    for (let i = 0; i < 3; i++) expect(Math.abs(b[i] - 3 * a[i]) / len3(b)).toBeLessThan(1e-12);
    expect(relativeError(inducedSigma(3 * E0, 0.4), 3 * inducedSigma(E0, 0.4))).toBeLessThan(1e-12);
  });

  it('the picture is the same at every size: scaling R and the position together leaves E unchanged', () => {
    const a = sphereField(E0, R, at(1.8 * R, 1.1, 0.3));
    const s = 7;
    const b = sphereField(E0, s * R, at(1.8 * s * R, 1.1, 0.3));
    for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i]) / len3(a)).toBeLessThan(1e-12);
  });

  it('the induced charge scales as E₀R²', () => {
    expect(relativeError(inducedChargeHemisphere(2 * E0, 3 * R), 2 * 9 * inducedChargeHemisphere(E0, R))).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the induced hemisphere charge converges to the analytic value as the grid is refined', () => {
    const exact = 3 * Math.PI * EPS0 * E0 * R * R;
    const e1 = relativeError(inducedChargeHemisphere(E0, R, 10), exact);
    const e2 = relativeError(inducedChargeHemisphere(E0, R, 100), exact);
    const e3 = relativeError(inducedChargeHemisphere(E0, R, 1000), exact);
    expect(e2).toBeLessThan(e1);
    expect(e3).toBeLessThan(e2);
    expect(e3).toBeLessThan(1e-6);
  });

  it('field lines traced with half the step end at the same place', () => {
    const o = { bounds: { xmin: -1.1, xmax: 1.1, ymin: -1, ymax: 1 } };
    const a = traceSphereLine(E0, R, [-1, 0.3], 1, { ...o, maxStep: 0.02 });
    const b = traceSphereLine(E0, R, [-1, 0.3], 1, { ...o, maxStep: 0.01 });
    const ea = a.points.at(-1)!;
    const eb = b.points.at(-1)!;
    expect(Math.hypot(ea[0] - eb[0], ea[1] - eb[1])).toBeLessThan(1e-3);
  });
});

describe('charged conductor and charge in a cavity', () => {
  const Q = 2e-6;
  const Rc = 0.2;

  it('a charged conductor has no field inside and kQ/r² outside', () => {
    expect(len3(chargedConductorField(Q, R, at(0.6 * R, 1.1, 0.2)))).toBe(0);
    const e = chargedConductorField(Q, R, at(2 * R, 0.7, 0.3));
    expect(relativeError(len3(e), (K * Q) / (2 * R) ** 2)).toBeLessThan(1e-12);
  });

  it('just outside the surface E = σ/ε₀ with σ = Q/(4πR²)', () => {
    const e = chargedConductorField(Q, R, at(R * (1 + 1e-12), 0.4));
    expect(relativeError(len3(e), uniformSigma(Q, R) / EPS0)).toBeLessThan(1e-9);
  });

  it('the field of a charged conductor points away from a positive charge and toward a negative one', () => {
    const p = at(2 * R, 0.5);
    expect(dot(chargedConductorField(Q, R, p), p)).toBeGreaterThan(0);
    expect(dot(chargedConductorField(-Q, R, p), p)).toBeLessThan(0);
  });

  it('with a point charge in the cavity the metal is field-free, and outside the field is kq/r²', () => {
    expect(len3(cavityChargeField(Q, R, Rc, at(0.27, 1, 0.1)))).toBe(0);
    const out = cavityChargeField(Q, R, Rc, at(3 * R, 0.9));
    expect(relativeError(len3(out), (K * Q) / (3 * R) ** 2)).toBeLessThan(1e-12);
    const inn = cavityChargeField(Q, R, Rc, at(0.5 * Rc, 0.9));
    expect(relativeError(len3(inn), (K * Q) / (0.5 * Rc) ** 2)).toBeLessThan(1e-12);
  });

  it('the flux through a sphere around the shell is q/ε₀, the same with or without the shell', () => {
    const rr = 2 * R;
    const n = 2000;
    let flux = 0;
    for (let i = 0; i < n; i++) {
      const th = ((i + 0.5) * Math.PI) / n;
      flux += dot(cavityChargeField(Q, R, Rc, at(rr, th)), at(1, th)) * 2 * Math.PI * rr * rr * Math.sin(th) * (Math.PI / n);
    }
    expect(relativeError(flux, Q / EPS0)).toBeLessThan(1e-6);
  });

  it('σ scales as Q and as 1/R²', () => {
    expect(relativeError(uniformSigma(3 * Q, 2 * R), (3 / 4) * uniformSigma(Q, R))).toBeLessThan(1e-12);
  });
});
