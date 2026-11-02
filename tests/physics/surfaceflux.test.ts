import { describe, expect, it } from 'vitest';
import { EPS0, K } from '~/physics/constants';
import { ballEnclosed, ballField, cylinderField, lineField } from '~/physics/continuous';
import { fluxThroughCube } from '~/physics/electrostatics';
import {
  cubeFaceFluxes,
  cubePatchFluxes,
  facePatchFlux,
  facePatchNormals,
  gaussCylinderPieces,
  insideCube,
  powerBallDensity,
  powerBallEnclosed,
  powerBallField,
  powerBallRho0,
  powerCylinderDensity,
  powerCylinderEnclosed,
  powerCylinderField,
  rectSolidAngle,
} from '~/physics/surfaceflux';
import { relativeError, type Vec3 } from '~/physics/vec';

const q = 1e-9;
const O: Vec3 = [0, 0, 0];
const a = 0.4;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('analytic limits', () => {
  it('an infinite plane subtends half the sphere, 2π, from any height', () => {
    for (const h of [0.01, 1, 50]) expect(relativeError(rectSolidAngle(h, -1e9, 1e9, -1e9, 1e9), 2 * Math.PI)).toBeLessThan(1e-6);
  });

  it('a charge at the centre of a cube sends one sixth of q/ε₀ through each face', () => {
    for (const f of cubeFaceFluxes(q, O, O, a)) expect(relativeError(f, q / (6 * EPS0))).toBeLessThan(1e-12);
  });

  it('a charge just inside the middle of a face sends almost half of q/ε₀ through that face', () => {
    const f = cubeFaceFluxes(q, [a / 2 - 1e-6, 0, 0], O, a);
    expect(relativeError(f[0], q / (2 * EPS0))).toBeLessThan(1e-4);
  });

  it('a small face far away carries kqA/d², the flux of a nearly uniform field', () => {
    const d = 100;
    const f = cubeFaceFluxes(q, [-d, 0, 0], O, a);
    // the −x face faces the charge: the field enters through it
    expect(relativeError(-f[1], (K * q * a * a) / (d - a / 2) ** 2)).toBeLessThan(1e-4);
  });

  it('a uniform ball of charge Q gives E = kQr/R³ inside and kQ/r² outside', () => {
    const Q = 2e-7;
    const R = 0.2;
    expect(relativeError(powerBallField(Q, R, 0, 0.05), (K * Q * 0.05) / R ** 3)).toBeLessThan(1e-12);
    expect(relativeError(powerBallField(Q, R, 1, 0.7), (K * Q) / 0.49)).toBeLessThan(1e-12);
  });

  it('outside a cylinder the field is that of a line charge, 2kλ/r, whatever the profile', () => {
    for (const n of [0, 1, -1]) expect(relativeError(powerCylinderField(4e-7, 0.2, n, 0.5), lineField(4e-7, 0.5))).toBeLessThan(1e-12);
  });

  it('a ball with ρ ∝ 1/r and a cylinder with ρ ∝ 1/r have a constant field inside', () => {
    const e1 = powerBallField(2e-7, 0.2, -1, 0.03);
    const e2 = powerBallField(2e-7, 0.2, -1, 0.17);
    expect(relativeError(e1, e2)).toBeLessThan(1e-12);
    expect(relativeError(powerCylinderField(4e-7, 0.2, -1, 0.02), powerCylinderField(4e-7, 0.2, -1, 0.15))).toBeLessThan(1e-12);
  });
});

describe('conservation and identities', () => {
  it("Gauss's law: the six exact face fluxes add to q/ε₀ for any point inside, 0 for any point outside", () => {
    for (const p of [[0.1, -0.05, 0.03], [0.19, 0.19, -0.19], [-0.15, 0, 0]] as Vec3[]) {
      expect(insideCube(p, O, a)).toBe(true);
      expect(relativeError(sum(cubeFaceFluxes(q, p, O, a)), q / EPS0)).toBeLessThan(1e-12);
    }
    for (const p of [[0.3, 0, 0], [0.25, 0.25, 0.25], [-1, 2, 0.1]] as Vec3[]) {
      expect(Math.abs(sum(cubeFaceFluxes(q, p, O, a)))).toBeLessThan(1e-12 * (q / EPS0));
    }
  });

  it('the exact face fluxes agree with the independent midpoint integration of electrostatics.ts', () => {
    const p: Vec3 = [0.08, -0.05, 0.02];
    const total = fluxThroughCube([{ pos: p, q }], O, a, 120);
    expect(relativeError(total, sum(cubeFaceFluxes(q, p, O, a)))).toBeLessThan(1e-3);
  });

  it('a charge moved off centre changes every face flux but not the total', () => {
    const f = cubeFaceFluxes(q, [0.12, 0.05, 0], O, a);
    expect(f[0] / f[1]).toBeGreaterThan(3);
    expect(relativeError(sum(f), q / EPS0)).toBeLessThan(1e-12);
  });

  it('the closed forms equal the integral ∫ρ dV done numerically by continuous.ts', () => {
    const Q = 2e-7;
    const R = 0.2;
    for (const n of [0, 1, -1]) {
      const rho = (s: number) => powerBallDensity(Q, R, n, s);
      for (const r of [0.05, 0.13, 0.2, 0.35]) {
        expect(relativeError(powerBallEnclosed(Q, R, n, r), ballEnclosed(rho, Math.min(r, R), 4000))).toBeLessThan(2e-4);
        expect(relativeError(powerBallField(Q, R, n, r), ballField(rho, R, r, 4000))).toBeLessThan(2e-4);
      }
      const lam = 4e-7;
      const rc = (s: number) => powerCylinderDensity(lam, R, n, s);
      for (const r of [0.05, 0.13, 0.35]) expect(relativeError(powerCylinderField(lam, R, n, r), cylinderField(rc, R, r, 4000))).toBeLessThan(5e-4);
    }
  });

  it('the field is continuous at the surface, and the ρ ∝ r ball peaks there', () => {
    const Q = 2e-7;
    const R = 0.2;
    for (const n of [0, 1, -1]) {
      expect(relativeError(powerBallField(Q, R, n, R * (1 - 1e-9)), powerBallField(Q, R, n, R * (1 + 1e-9)))).toBeLessThan(1e-6);
      expect(relativeError(powerCylinderField(4e-7, R, n, R * (1 - 1e-9)), powerCylinderField(4e-7, R, n, R * (1 + 1e-9)))).toBeLessThan(1e-6);
    }
    const peak = powerBallField(Q, R, 1, R);
    for (const r of [0.05, 0.1, 0.19, 0.21, 0.3]) expect(powerBallField(Q, R, 1, r)).toBeLessThan(peak);
  });

  it('on a coaxial Gaussian cylinder the side alone carries λ_in·L/ε₀; the caps carry nothing', () => {
    const lam = 4e-7;
    const L = 0.3;
    for (const r of [0.07, 0.4]) {
      const { side, caps } = gaussCylinderPieces(lam, 0.2, 0, r, L);
      expect(caps).toBe(0);
      expect(relativeError(side, (powerCylinderEnclosed(lam, 0.2, 0, r) * L) / EPS0)).toBeLessThan(1e-12);
    }
  });

  it('ρ₀ makes the profiles carry the stated total charge', () => {
    expect(relativeError(powerBallRho0(2e-7, 0.2, 1), 2e-7 / (Math.PI * 0.2 ** 3))).toBeLessThan(1e-12);
    expect(relativeError(powerBallRho0(2e-7, 0.2, 0) * (4 / 3) * Math.PI * 0.008, 2e-7)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('doubling the charge doubles every face flux and every field', () => {
    const p: Vec3 = [0.05, 0.1, -0.02];
    const f1 = cubeFaceFluxes(q, p, O, a);
    const f2 = cubeFaceFluxes(2 * q, p, O, a);
    f1.forEach((f, i) => expect(relativeError(f2[i], 2 * f)).toBeLessThan(1e-12));
    expect(relativeError(powerBallField(4e-7, 0.2, 1, 0.1), 2 * powerBallField(2e-7, 0.2, 1, 0.1))).toBeLessThan(1e-12);
    expect(relativeError(powerCylinderField(8e-7, 0.2, 0, 0.1), 2 * powerCylinderField(4e-7, 0.2, 0, 0.1))).toBeLessThan(1e-12);
  });

  it('a cube scaled with the charge position keeps every face flux (flux is dimensionless in geometry)', () => {
    const p: Vec3 = [0.05, 0.1, -0.02];
    const f1 = cubeFaceFluxes(q, p, O, a);
    const f3 = cubeFaceFluxes(q, [0.15, 0.3, -0.06], O, 3 * a);
    f1.forEach((f, i) => expect(relativeError(f3[i], f)).toBeLessThan(1e-12));
  });

  it('inside a ρ ∝ rⁿ ball the field grows as r^{n+1}', () => {
    for (const n of [0, 1, 2]) {
      const ratio = powerBallField(2e-7, 0.2, n, 0.1) / powerBallField(2e-7, 0.2, n, 0.05);
      expect(relativeError(ratio, 2 ** (n + 1))).toBeLessThan(1e-12);
    }
  });
});

describe('convergence', () => {
  it('the patch sum converges to the exact face flux as O(1/n²)', () => {
    const p: Vec3 = [0.06, -0.04, 0.03];
    const exact = cubeFaceFluxes(q, p, O, a)[0];
    const e8 = Math.abs(facePatchFlux([{ pos: p, q }], O, a, 0, 8) - exact);
    const e16 = Math.abs(facePatchFlux([{ pos: p, q }], O, a, 0, 16) - exact);
    const e32 = Math.abs(facePatchFlux([{ pos: p, q }], O, a, 0, 32) - exact);
    expect(e8 / e16).toBeGreaterThan(3.5);
    expect(e16 / e32).toBeGreaterThan(3.5);
  });

  it('one patch per face overshoots badly for a centred charge (24kq instead of 4πkq); 12 patches are within 1%', () => {
    const one = sum(cubePatchFluxes([{ pos: O, q }], O, a, 1));
    expect(relativeError(one, 24 * K * q)).toBeLessThan(1e-12);
    const twelve = sum(cubePatchFluxes([{ pos: O, q }], O, a, 12));
    expect(relativeError(twelve, q / EPS0)).toBeLessThan(0.01);
  });

  it('on a face, E·n̂ is largest at the middle and smallest at the corners: it cannot be taken out of the integral', () => {
    const v = facePatchNormals([{ pos: O, q }], O, a, 0, 9);
    const mid = v[4 * 9 + 4];
    expect(Math.max(...v)).toBe(mid);
    expect(mid / Math.min(...v)).toBeGreaterThan(3);
  });
});
