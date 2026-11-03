import { describe, expect, it } from 'vitest';
import { EPS0, K } from '~/physics/constants';
import { fieldAt, fieldAt3, potentialAt, type PointCharge3 } from '~/physics/electrostatics';
import {
  cubeFlux,
  curl2,
  curl3,
  divergence2,
  divergence3,
  expansionField,
  gradient2,
  gradient3,
  laplacian2,
  laplacian3,
  lineSource2,
  rotationField,
  shearField,
  squareCirculation,
  squareFlux,
  vortexField,
} from '~/physics/vectorcalc';
import { len3, relativeError, sub3, type Vec3 } from '~/physics/vec';

const q = 2e-9;
const charges3: PointCharge3[] = [
  { pos: [0, 0, 0], q },
  { pos: [0.3, 0.1, 0], q: -q / 2 },
];
const E3 = (p: Vec3) => fieldAt3(charges3, p);
const V3 = (p: Vec3) => charges3.reduce((s, c) => s + (K * c.q) / len3(sub3(p, c.pos)), 0);

describe('analytic limits', () => {
  it('the gradient of a linear potential is a constant vector', () => {
    const g = gradient2((x, y) => 3 * x - 2 * y + 5, 0.4, -1.2);
    expect(g[0]).toBeCloseTo(3, 8);
    expect(g[1]).toBeCloseTo(-2, 8);
  });

  it('E = −∇V for point charges (the 2D slice and full 3D)', () => {
    const cs = [
      { x: 0, y: 0, q },
      { x: 0.3, y: 0.1, q: -q / 2 },
    ];
    const g = gradient2((x, y) => potentialAt(cs, x, y), 0.12, 0.2, 1e-6);
    const e = fieldAt(cs, 0.12, 0.2);
    expect(relativeError(-g[0], e[0])).toBeLessThan(1e-6);
    expect(relativeError(-g[1], e[1])).toBeLessThan(1e-6);
    const g3 = gradient3(V3, [0.1, 0.2, 0.15], 1e-6);
    const e3 = E3([0.1, 0.2, 0.15]);
    for (const i of [0, 1, 2]) expect(relativeError(-g3[i], e3[i])).toBeLessThan(1e-6);
  });

  it('the teaching fields: shear curls without circles, a vortex circles without curl', () => {
    expect(curl2(shearField(2), 0.3, 0.7)).toBeCloseTo(-2, 8);
    expect(divergence2(shearField(2), 0.3, 0.7)).toBeCloseTo(0, 8);
    expect(curl2(rotationField(1.5), 0.3, 0.7)).toBeCloseTo(3, 8);
    expect(Math.abs(curl2(vortexField(1), 0.3, 0.7))).toBeLessThan(1e-6);
    expect(Math.abs(divergence2(vortexField(1), 0.3, 0.7))).toBeLessThan(1e-6);
    expect(divergence2(expansionField(1.5), -0.2, 0.4)).toBeCloseTo(3, 8);
  });
});

describe('identities', () => {
  it('∇·E = 0 in empty space around 3D point charges (but the 2D slice is not zero)', () => {
    const p: Vec3 = [0.12, 0.2, 0.05];
    const scale = len3(E3(p)) / 0.1;
    expect(Math.abs(divergence3(E3, p, 1e-5))).toBeLessThan(1e-5 * scale);
    // the trap the header warns about: in the z = 0 slice ∂Ez/∂z = kq/r³, so the in-plane divergence is −kq/r³, not 0
    const single = [{ x: 0, y: 0, q }];
    const r = 0.2;
    const d2 = divergence2((x, y) => fieldAt(single, x, y), r, 0, 1e-6);
    expect(relativeError(d2, (-K * q) / r ** 3)).toBeLessThan(1e-5);
  });

  it('∇·E = 0 in-plane around 2D line charges, away from the lines', () => {
    const F = (x: number, y: number) => {
      const a = lineSource2(1e-9, 0, 0)(x, y);
      const b = lineSource2(-2e-9, 0.4, 0)(x, y);
      return [a[0] + b[0], a[1] + b[1]] as const;
    };
    const scale = Math.hypot(...F(0.1, 0.3)) / 0.1;
    expect(Math.abs(divergence2(F, 0.1, 0.3, 1e-6))).toBeLessThan(1e-5 * scale);
  });

  it('∇×E = 0 for the Coulomb field', () => {
    const p: Vec3 = [0.12, 0.2, 0.05];
    const c = curl3(E3, p, 1e-5);
    const scale = len3(E3(p)) / 0.1;
    for (const i of [0, 1, 2]) expect(Math.abs(c[i])).toBeLessThan(1e-5 * scale);
  });

  it('∇²V = 0 in empty space (Laplace), in 3D', () => {
    const p: Vec3 = [0.12, 0.2, 0.05];
    const scale = Math.abs(V3(p)) / 0.01;
    expect(Math.abs(laplacian3(V3, p, 1e-4))).toBeLessThan(1e-5 * scale);
  });

  it('∇²V of a uniform ball’s inside potential is −ρ/ε₀ (Poisson)', () => {
    const rho = 1e-6;
    // V(r) = ρ(3R² − r²)/(6ε₀) inside a uniform ball of radius R
    const R = 0.3;
    const V = (p: Vec3) => (rho * (3 * R * R - (p[0] ** 2 + p[1] ** 2 + p[2] ** 2))) / (6 * EPS0);
    expect(relativeError(laplacian3(V, [0.05, 0.02, -0.04]), -rho / EPS0)).toBeLessThan(1e-6);
    expect(relativeError(laplacian2((x, y) => x * x + y * y, 0.3, -0.2), 4)).toBeLessThan(1e-6);
  });
});

describe('conservation (flux and circulation)', () => {
  it('flux out of a cube is q/ε₀ when the charge is inside, 0 when outside', () => {
    expect(relativeError(cubeFlux(E3, [0, 0, 0.01], 0.2, 40), q / EPS0)).toBeLessThan(5e-3);
    expect(Math.abs(cubeFlux(E3, [0, 0.5, 0], 0.2, 24))).toBeLessThan(1e-4 * (q / EPS0));
  });

  it('a uniform charge density: flux out of a small cube / volume = ρ/ε₀', () => {
    const rho = 1e-6;
    const E: (p: Vec3) => Vec3 = (p) => [(rho * p[0]) / (3 * EPS0), (rho * p[1]) / (3 * EPS0), (rho * p[2]) / (3 * EPS0)];
    const a = 0.01;
    expect(relativeError(cubeFlux(E, [0.1, -0.05, 0.02], a, 8) / a ** 3, rho / EPS0)).toBeLessThan(1e-9);
    expect(relativeError(divergence3(E, [0.1, -0.05, 0.02]), rho / EPS0)).toBeLessThan(1e-6);
  });

  it('a vortex: circulation is Γ around the core and 0 around any loop that misses it', () => {
    expect(relativeError(squareCirculation(vortexField(2), 0, 0, 0.5, 400), 2)).toBeLessThan(1e-4);
    expect(Math.abs(squareCirculation(vortexField(2), 1, 0.4, 0.5, 400))).toBeLessThan(1e-6);
  });

  it('a line source: flux per length is λ/ε₀ around the line and 0 elsewhere', () => {
    const lam = 1e-9;
    expect(relativeError(squareFlux(lineSource2(lam), 0, 0, 0.2, 400), lam / EPS0)).toBeLessThan(1e-4);
    expect(Math.abs(squareFlux(lineSource2(lam), 0.5, 0, 0.2, 400))).toBeLessThan(1e-6 * (lam / EPS0));
  });
});

describe('convergence (box and loop pictures → div and curl)', () => {
  it('flux per area of a shrinking square tends to the divergence, error ∝ a²', () => {
    const F = (x: number, y: number) => [x * x * y, Math.sin(x) + y * y * y] as const;
    const exact = divergence2(F, 0.4, 0.3, 1e-6);
    const err = (a: number) => Math.abs(squareFlux(F, 0.4, 0.3, a, 200) / (a * a) - exact);
    expect(err(0.1) / err(0.05)).toBeCloseTo(4, 0);
    expect(err(0.01)).toBeLessThan(1e-3);
  });

  it('circulation per area of a shrinking square tends to the curl, error ∝ a²', () => {
    const F = (x: number, y: number) => [x * y * y, Math.cos(y) * x * x] as const;
    const exact = curl2(F, 0.4, 0.3, 1e-6);
    const err = (a: number) => Math.abs(squareCirculation(F, 0.4, 0.3, a, 200) / (a * a) - exact);
    expect(err(0.1) / err(0.05)).toBeCloseTo(4, 0);
    expect(err(0.01)).toBeLessThan(1e-3);
  });
});

describe('scaling', () => {
  it('the operators are linear: doubling the field doubles div and curl', () => {
    const F = rotationField(1);
    const F2 = (x: number, y: number) => [2 * F(x, y)[0], 2 * F(x, y)[1]] as const;
    expect(curl2(F2, 0.1, 0.2)).toBeCloseTo(2 * curl2(F, 0.1, 0.2), 8);
    expect(divergence2(expansionField(2), 0, 0)).toBeCloseTo(2 * divergence2(expansionField(1), 0, 0), 8);
  });
});
