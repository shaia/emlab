import { describe, expect, it } from 'vitest';
import { EPS0, K, MU0 } from '~/physics/constants';
import { ROD_R, ROD_RHO, THICK_I } from '~/physics/divcurl';
import { loopField } from '~/physics/magnetism';
import {
  COIL_H,
  COIL_K,
  COIL_W,
  flatCoilB,
  GAP_A,
  GAP_DEDT,
  gapB,
  inducedE,
  leakDEdt,
  leakJ,
  leakTotalCurrent,
  maxwellScene,
  probeReading,
  SOL_DBDT,
  SOL_R,
  squareIntegral,
  stripB,
  type SceneId,
} from '~/physics/maxwell';
import { relativeError, type Vec3 } from '~/physics/vec';
import { curl2, curl3, divergence2, divergence3, squareCirculation, squareFlux, type Field3 } from '~/physics/vectorcalc';

const SCENES: SceneId[] = ['rod', 'coil', 'induced', 'wire', 'gap'];
const circle = (r: number, n = 2000) => {
  // counter-clockwise circulation of a planar field around a circle of radius r centred at the origin
  return (F: (x: number, y: number) => readonly [number, number]) => {
    let s = 0;
    for (let k = 0; k < n; k++) {
      const th = (2 * Math.PI * (k + 0.5)) / n;
      const [Fx, Fy] = F(r * Math.cos(th), r * Math.sin(th));
      s += (-Fx * Math.sin(th) + Fy * Math.cos(th)) * r * ((2 * Math.PI) / n);
    }
    return s;
  };
};

describe('analytic limits', () => {
  it('Faraday in a solenoid core: E = s·(dB/dt)/2 inside, R²(dB/dt)/(2s) outside, clockwise for a growing ⊙ field', () => {
    const E = inducedE(SOL_DBDT, SOL_R);
    const [ex, ey] = E(0.02, 0);
    expect(ex).toBe(0);
    expect(relativeError(-ey, (SOL_DBDT * 0.02) / 2)).toBeLessThan(1e-12); // at (s, 0) clockwise means down
    expect(relativeError(Math.hypot(...E(0, 0.08)), (SOL_DBDT * SOL_R ** 2) / (2 * 0.08))).toBeLessThan(1e-12);
  });

  it('the circulation of the induced E round any circle that holds the whole core is −dΦ_B/dt = −πR²·dB/dt', () => {
    for (const r of [0.05, 0.08, 0.2]) {
      expect(relativeError(circle(r)(inducedE(SOL_DBDT, SOL_R)), -Math.PI * SOL_R ** 2 * SOL_DBDT)).toBeLessThan(1e-9);
    }
  });

  it('in a capacitor gap B = μ₀ε₀(dE/dt)s/2 inside, and at the plate edge it is μ₀I_d/(2πa) with I_d = ε₀πa²·dE/dt', () => {
    const B = gapB(GAP_DEDT, GAP_A);
    expect(relativeError(Math.hypot(...B(0.03, 0)), (MU0 * EPS0 * GAP_DEDT * 0.03) / 2)).toBeLessThan(1e-12);
    const Id = EPS0 * Math.PI * GAP_A ** 2 * GAP_DEDT;
    expect(relativeError(Math.hypot(...B(GAP_A * (1 - 1e-12), 0)), (MU0 * Id) / (2 * Math.PI * GAP_A))).toBeLessThan(1e-9);
    expect(relativeError(Math.hypot(...B(0.09, 0)), (MU0 * Id) / (2 * Math.PI * 0.09))).toBeLessThan(1e-12);
  });

  it('a very tall flat coil has B = μ₀K inside, like a solenoid, and a very long strip seen up close is a sheet, μ₀K/2', () => {
    const tall = flatCoilB(COIL_K, COIL_W, 1e4);
    expect(relativeError(tall(0, 0)[1], MU0 * COIL_K)).toBeLessThan(1e-5);
    expect(Math.abs(tall(0.1, 0)[1])).toBeLessThan(1e-5 * MU0 * COIL_K);
    const sheet = stripB(COIL_K, 0, 1e4);
    expect(relativeError(Math.abs(sheet(1e-3, 0)[1]), (MU0 * COIL_K) / 2)).toBeLessThan(1e-5);
  });

  it('a strip far away looks like one wire carrying K·2h', () => {
    const B = stripB(COIL_K, 0, COIL_H);
    const I = COIL_K * 2 * COIL_H;
    expect(relativeError(Math.hypot(...B(50, 0)), (MU0 * I) / (2 * Math.PI * 50))).toBeLessThan(1e-6);
  });
});

describe('identities: the differential laws hold at every point', () => {
  it('∇·B = 0 for the flat coil everywhere off the strips, inside and outside, near the poles too', () => {
    const B = flatCoilB(COIL_K, COIL_W, COIL_H);
    const scale = (MU0 * COIL_K) / COIL_W; // a field change of μ₀K over the coil's half-width
    for (const [x, y] of [[0, 0], [0, COIL_H + 0.005], [0.01, -0.03], [0.05, 0.06], [-0.03, 0.049], [0.025, 0]]) {
      expect(Math.abs(divergence2(B, x, y, 1e-6))).toBeLessThan(1e-5 * scale);
    }
  });

  it('∇·B = 0 for the 3D field of a circular loop (magnetism.ts), off the wire', () => {
    const I = 3;
    const R = 0.05;
    const B: Field3 = ([x, y, z]) => {
      const rho = Math.hypot(x, y);
      const b = loopField(I, R, rho, z);
      return rho === 0 ? [0, 0, b.z] : [(b.rho * x) / rho, (b.rho * y) / rho, b.z];
    };
    const scale = (MU0 * I) / (2 * R) / R;
    for (const p of [[0.01, 0.02, 0.03], [0.07, -0.01, 0.0], [0.02, 0.02, -0.04]] as Vec3[]) {
      expect(Math.abs(divergence3(B, p, 1e-5))).toBeLessThan(1e-5 * scale);
    }
  });

  it('∇×E = −∂B/∂t: inside the core the curl is −dB/dt even on the axis where E = 0; outside it is 0 though E ≠ 0', () => {
    const E = inducedE(SOL_DBDT, SOL_R);
    expect(E(0, 0)).toEqual([0, 0]);
    expect(relativeError(curl2(E, 0, 0, 1e-6), -SOL_DBDT)).toBeLessThan(1e-6);
    expect(relativeError(curl2(E, 0.02, -0.01, 1e-6), -SOL_DBDT)).toBeLessThan(1e-6);
    expect(Math.hypot(...E(0.07, 0))).toBeGreaterThan(0);
    expect(Math.abs(curl2(E, 0.07, 0, 1e-6))).toBeLessThan(1e-6 * SOL_DBDT);
    expect(Math.abs(divergence2(E, 0.03, 0.01, 1e-6))).toBeLessThan(1e-6 * SOL_DBDT);
  });

  it('∇×B = μ₀ε₀∂E/∂t in the gap and 0 beyond the plates, with no conduction current anywhere', () => {
    const B = gapB(GAP_DEDT, GAP_A);
    expect(relativeError(curl2(B, 0.01, 0.02, 1e-6), MU0 * EPS0 * GAP_DEDT)).toBeLessThan(1e-6);
    expect(Math.abs(curl2(B, 0.08, 0.01, 1e-6))).toBeLessThan(1e-6 * MU0 * EPS0 * GAP_DEDT);
  });

  it('the divergence of a curl is zero (any smooth field), which is why ∇·J = −∂ρ/∂t follows from Ampère–Maxwell', () => {
    const F: Field3 = ([x, y, z]) => [x * y * z + Math.sin(y), Math.cos(x * z) + y * y * x, Math.exp(0.3 * x) * y - z * z * x];
    const curlF: Field3 = (p) => curl3(F, p, 1e-4);
    for (const p of [[0.3, -0.2, 0.5], [1, 0.4, -0.7]] as Vec3[]) {
      const c = curl3(F, p, 1e-4);
      expect(Math.hypot(...c)).toBeGreaterThan(0.1);
      expect(Math.abs(divergence3(curlF, p, 1e-3))).toBeLessThan(1e-5);
    }
  });

  it('every scene obeys its law twice: the probe integral equals the integral right-hand side, and the local values agree', () => {
    for (const id of SCENES) {
      const sc = maxwellScene(id);
      // probes inside a source, straddling its edge, and outside it; centres off every boundary and strip
      for (const [cx, cy, a] of [[0.01, 0.015, 0.03], [0.045, 0.0, 0.03], [0.07, 0.03, 0.02]]) {
        const r = probeReading(sc, cx, cy, a);
        const scale = Math.abs(sc.rhs(0, 0)) * a ** (sc.probe === 'box' ? 3 : 2) || MU0 * COIL_K * a;
        expect(Math.abs(r.lhs - r.rhs)).toBeLessThan(2e-3 * scale);
        const lscale = Math.abs(sc.rhs(0, 0)) || (MU0 * COIL_K) / COIL_W;
        expect(Math.abs(r.local - r.rhsLocal)).toBeLessThan(1e-4 * lscale);
      }
    }
  });
});

describe('conservation', () => {
  it('no magnetic charge: the net B flux out of a box round the coil\'s north pole is zero, though lines leave its top', () => {
    const B = flatCoilB(COIL_K, COIL_W, COIL_H);
    const a = 0.03;
    const net = a * squareFlux(B, 0, COIL_H, a, 2000);
    let out = 0; // flux out through the top face alone
    for (let i = 0; i < 2000; i++) out += B(-a / 2 + ((i + 0.5) * a) / 2000, COIL_H + a / 2)[1] * (a / 2000) * a;
    expect(out).toBeGreaterThan(0);
    expect(Math.abs(net)).toBeLessThan(2e-3 * out);
  });

  it('the static limit: with every time derivative zero, the induced E and the gap B vanish (∇×E = 0, ∇×B = μ₀J)', () => {
    expect(probeReading(maxwellScene('induced', true), 0.01, 0, 0.03).lhs).toBe(0);
    expect(probeReading(maxwellScene('gap', true), 0.01, 0, 0.03).lhs).toBe(0);
    const w = probeReading(maxwellScene('wire', true), 0.01, 0, 0.02);
    expect(relativeError(w.ratio, (MU0 * THICK_I) / (Math.PI * ROD_R ** 2))).toBeLessThan(1e-6);
  });

  it('a leaking charge: J + ε₀∂E/∂t = 0 everywhere, so B = 0 is consistent; and ∮J·dA = −dQ/dt', () => {
    const c = { Q: 2e-9, dQdt: -5e-10 };
    for (const p of [[0.1, 0.2, -0.05], [0.01, 0, 0], [-0.3, 0.4, 0.5]] as Vec3[]) {
      const J = leakJ(c, p);
      const tot = leakTotalCurrent(c, p);
      expect(Math.hypot(...tot)).toBeLessThan(1e-12 * MU0 * Math.hypot(...J));
      expect(Math.abs(divergence3((q) => leakJ(c, q), p, 1e-4 * Math.hypot(...p)))).toBeLessThan((1e-6 * Math.hypot(...J)) / Math.hypot(...p));
    }
    // flux of J through a sphere of radius r: J(r)·4πr² = −dQ/dt, for any r
    for (const r of [0.05, 1]) {
      expect(relativeError(Math.hypot(...leakJ(c, [r, 0, 0])) * 4 * Math.PI * r * r, -c.dQdt)).toBeLessThan(1e-12);
      // and ε₀·(flux of ∂E/∂t) = dQ/dt: the displacement current through the sphere cancels it
      expect(relativeError(EPS0 * leakDEdt(c, [r, 0, 0])[0] * 4 * Math.PI * r * r, c.dQdt)).toBeLessThan(1e-12);
    }
    expect(K * EPS0 * 4 * Math.PI).toBeCloseTo(1, 14);
  });
});

describe('scaling', () => {
  it('doubling dB/dt doubles the induced E everywhere; inside, E grows in proportion to the distance from the axis', () => {
    const E1 = inducedE(SOL_DBDT, SOL_R);
    const E2 = inducedE(2 * SOL_DBDT, SOL_R);
    for (const [x, y] of [[0.01, 0.02], [0.06, -0.03]]) expect(relativeError(Math.hypot(...E2(x, y)), 2 * Math.hypot(...E1(x, y)))).toBeLessThan(1e-12);
    expect(relativeError(Math.hypot(...E1(0.03, 0)), 3 * Math.hypot(...E1(0.01, 0)))).toBeLessThan(1e-12);
  });

  it('doubling the coil current doubles B; doubling dE/dt doubles the gap field', () => {
    expect(relativeError(flatCoilB(2 * COIL_K, COIL_W, COIL_H)(0.01, 0.07)[0], 2 * flatCoilB(COIL_K, COIL_W, COIL_H)(0.01, 0.07)[0])).toBeLessThan(1e-12);
    expect(relativeError(gapB(2 * GAP_DEDT, GAP_A)(0.02, 0)[1], 2 * gapB(GAP_DEDT, GAP_A)(0.02, 0)[1])).toBeLessThan(1e-12);
  });

  it('the rod scene: Φ/V inside equals ρ/ε₀ whatever the box size, and Q_in/ε₀ = ρa³/ε₀', () => {
    const sc = maxwellScene('rod');
    for (const a of [0.005, 0.02, 0.04]) {
      const r = probeReading(sc, 0.005, 0, a);
      expect(relativeError(r.ratio, ROD_RHO / EPS0)).toBeLessThan(1e-6);
      expect(relativeError(r.rhs, (ROD_RHO * a ** 3) / EPS0)).toBeLessThan(1e-9);
    }
  });
});

describe('convergence', () => {
  it('outside the core the loop ratio tends to the local curl, 0, as a² (the field is not linear there)', () => {
    const E = inducedE(SOL_DBDT, SOL_R);
    const r1 = Math.abs(squareCirculation(E, 0.08, 0.02, 0.02, 400)) / 0.02 ** 2;
    const r2 = Math.abs(squareCirculation(E, 0.08, 0.02, 0.01, 400)) / 0.01 ** 2;
    expect(r2).toBeLessThan(1e-6 * SOL_DBDT + r1); // never grows
    expect(r1).toBeLessThan(1e-6 * SOL_DBDT); // exactly 0 in fact: no curl anywhere inside the loop
  });

  it('the midpoint sum for the coil\'s flux converges as 1/n² for a box away from the strips', () => {
    const B = flatCoilB(COIL_K, COIL_W, COIL_H);
    const exact = squareFlux(B, 0.05, 0.02, 0.03, 4000);
    const e1 = Math.abs(squareFlux(B, 0.05, 0.02, 0.03, 20) - exact);
    const e2 = Math.abs(squareFlux(B, 0.05, 0.02, 0.03, 40) - exact);
    // the exact flux is 0 (no magnetic charge), and both sums approach it; the error falls about fourfold
    expect(Math.abs(exact)).toBeLessThan(1e-12);
    expect(e2).toBeLessThan(e1 / 3 + 1e-15);
  });

  it('the enclosed source integral converges to the exact enclosed charge for a box straddling the rod edge', () => {
    const rhs = maxwellScene('rod').rhs;
    const coarse = squareIntegral(rhs, ROD_R, 0, 0.02, 40);
    const fine = squareIntegral(rhs, ROD_R, 0, 0.02, 400);
    const finer = squareIntegral(rhs, ROD_R, 0, 0.02, 1600);
    expect(Math.abs(finer - fine)).toBeLessThan(Math.abs(fine - coarse));
  });
});
