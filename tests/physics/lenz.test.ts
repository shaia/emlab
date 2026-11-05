import { describe, expect, it } from 'vitest';
import { G, MU0 } from '~/physics/constants';
import { chargeThrough, lenzSense } from '~/physics/induction';
import { loopField } from '~/physics/magnetism';
import { riemann } from '~/physics/calculus';
import {
  coaxialMutual,
  dipoleRingFlux,
  dipoleRingFluxSlope,
  facingPole,
  fallStep,
  magnetMoment,
  magnetRingFlux,
  magnetRingFluxSlope,
  ringResistance,
  ringResponse,
  ringStackDrag,
  simulateFall,
  tubeDragAt,
  tubeDragDeep,
  tubeTerminalSpeed,
  tubeTimeConstant,
  wallCurrentDensity,
  type AxialMagnet,
  type Dipole,
  type FallState,
  type Ring,
  type Tube,
} from '~/physics/lenz';
import { relativeError } from '~/physics/vec';

const mag: AxialMagnet = { L: 0.08, R: 0.012, NI: 1500 };
const ring: Ring = { a: 0.03, R: 2e-4 };
const copper: Tube = { a: 0.008, wall: 0.0015, length: 0.4, sigma: 5.8e7 };
const neo: Dipole = { m: 1.3, mass: 0.01 };

describe('analytic limit: flux of a magnet through a ring', () => {
  it('two loops far apart link like two dipoles: M → μ₀πa²b²/(2d³)', () => {
    const [a, b, d] = [0.03, 0.012, 2];
    expect(relativeError(coaxialMutual(a, b, d), (MU0 * Math.PI * a * a * b * b) / (2 * d ** 3))).toBeLessThan(1e-3);
  });

  it('far from the ring the bar magnet acts as a point dipole of moment NI·πR²', () => {
    const u = -1.5;
    expect(relativeError(magnetRingFlux(mag, ring.a, u), dipoleRingFlux(magnetMoment(mag), ring.a, u))).toBeLessThan(2e-3);
  });

  it('the flux is largest, and stops changing, with the magnet centred in the ring', () => {
    const at0 = magnetRingFlux(mag, ring.a, 0);
    for (const u of [-0.2, -0.05, 0.05, 0.2]) expect(magnetRingFlux(mag, ring.a, u)).toBeLessThan(at0);
    expect(Math.abs(magnetRingFluxSlope(mag, ring.a, 0))).toBeLessThan(1e-12 * Math.abs(magnetRingFluxSlope(mag, ring.a, -0.05)));
    expect(ringResponse(mag, ring, 0, 0.3).current).toBeCloseTo(0, 9);
  });

  it('the exact slope 2πa·B_ρ agrees with differentiating the flux', () => {
    for (const u of [-0.25, -0.08, -0.03, 0.04, 0.15]) {
      const h = 1e-5;
      const numeric = (magnetRingFlux(mag, ring.a, u + h) - magnetRingFlux(mag, ring.a, u - h)) / (2 * h);
      expect(relativeError(magnetRingFluxSlope(mag, ring.a, u), numeric)).toBeLessThan(1e-6);
    }
    const u = 0.02;
    const numeric = (dipoleRingFlux(1, 0.01, u + 1e-7) - dipoleRingFlux(1, 0.01, u - 1e-7)) / 2e-7;
    expect(relativeError(dipoleRingFluxSlope(1, 0.01, u), numeric)).toBeLessThan(1e-6);
  });

  it('a ring of copper wire: R = ρ·2πa/A', () => {
    expect(relativeError(ringResistance(1.7e-8, 0.03, 1.6e-5), (1.7e-8 * 2 * Math.PI * 0.03) / 1.6e-5)).toBeLessThan(1e-12);
  });
});

describe("analytic limit: Lenz's law at the ring", () => {
  const left = -0.12; // magnet on the −axis side, N facing the ring
  it('the current agrees with the signed law of induction.ts (−dΦ/dt)', () => {
    for (const [u, w] of [
      [left, 0.3],
      [left, -0.3],
      [0.12, 0.3],
      [0.12, -0.3],
    ]) {
      const r = ringResponse(mag, ring, u, w);
      expect(Math.sign(r.current)).toBe(lenzSense(r.dPhiDt));
    }
  });

  it('an approaching N pole meets an N face and the ring is pushed away; a receding one meets an S face and the ring follows', () => {
    const approach = ringResponse(mag, ring, left, 0.3);
    expect(approach.dPhiDt).toBeGreaterThan(0);
    expect(facingPole(approach.current, left)).toBe('N');
    expect(approach.force).toBeGreaterThan(0); // along +axis: away from the magnet on the left
    const recede = ringResponse(mag, ring, left, -0.3);
    expect(recede.dPhiDt).toBeLessThan(0);
    expect(facingPole(recede.current, left)).toBe('S');
    expect(recede.force).toBeLessThan(0); // toward the magnet
  });

  it('the force on the ring always points along the relative velocity: it opposes the relative motion', () => {
    for (const u of [-0.3, -0.06, -0.01, 0.01, 0.06, 0.3])
      for (const w of [-0.5, 0.2]) expect(Math.sign(ringResponse(mag, ring, u, w).force)).toBe(Math.sign(w));
  });

  it('a magnet at rest induces nothing, wherever it is', () => {
    const r = ringResponse(mag, ring, -0.05, 0);
    expect(r.current).toBe(0);
    expect(r.force).toBe(0);
    expect(r.flux).toBeGreaterThan(0);
  });

  it('the force on the ring is the Lorentz force on its current, −2πa·I·B_ρ', () => {
    const u = -0.05;
    const r = ringResponse(mag, ring, u, 0.4);
    let Br = 0;
    for (let i = 0; i < 16; i++) Br += loopField(mag.NI / 16, mag.R, ring.a, -(u - mag.L / 2 + ((i + 0.5) * mag.L) / 16)).rho;
    expect(relativeError(r.force, -2 * Math.PI * ring.a * r.current * Br)).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('the power needed to keep the magnet moving equals the heat released in the ring, F·w = I²R', () => {
    for (const [u, w] of [
      [-0.2, 0.1],
      [-0.04, 0.7],
      [0.03, -0.5],
      [0.1, 0.25],
    ]) {
      const r = ringResponse(mag, ring, u, w);
      expect(r.handPower).toBeGreaterThan(0);
      expect(relativeError(r.handPower, r.heatRate)).toBeLessThan(1e-12);
    }
  });

  it('a magnet that passes right through the ring sends no net charge round it; half way, Φ(0)/R', () => {
    const w = 0.4;
    const T = 2 / w; // from u = −1 to u = +1
    const I = (t: number) => ringResponse(mag, ring, -1 + w * t, w).current;
    const full = riemann(I, 0, T, 4000);
    const half = riemann(I, 0, T / 2, 4000);
    const phi0 = magnetRingFlux(mag, ring.a, 0);
    expect(Math.abs(full)).toBeLessThan(1e-4 * Math.abs(half));
    expect(relativeError(half, chargeThrough(1, magnetRingFlux(mag, ring.a, -1), phi0, ring.R))).toBeLessThan(1e-4);
  });

  it('a falling magnet: the work of gravity becomes kinetic energy plus heat in the tube', () => {
    let st: FallState = { t: 0, s: -0.05, v: 0, heat: 0 };
    const dt = 2e-4;
    while (st.s < 0.3) st = fallStep(st, neo, copper, dt);
    const work = neo.mass * G * (st.s + 0.05);
    expect(relativeError(work, 0.5 * neo.mass * st.v * st.v + st.heat)).toBeLessThan(1e-6);
    expect(st.heat).toBeGreaterThan(0.99 * work); // at a terminal speed almost all of it is heat
  });

  it('in a plastic tube nothing is induced and the magnet falls freely', () => {
    const plastic = { ...copper, sigma: 0 };
    const run = simulateFall(neo, plastic, 0, 1e-3, 5);
    const last = run[run.length - 1];
    expect(relativeError(last.v, Math.sqrt(2 * G * last.s))).toBeLessThan(1e-9);
    expect(last.heat).toBe(0);
  });
});

describe('analytic limit: the tube', () => {
  it('deep inside a long tube the braking coefficient is 45μ₀²m²σw/(1024a⁴)', () => {
    const long = { ...copper, length: 100 };
    expect(relativeError(tubeDragAt(neo.m, long, 50), tubeDragDeep(neo.m, long))).toBeLessThan(1e-9);
  });

  it('with the magnet at the mouth of a long tube only half the rings brake it, and above the tube almost none', () => {
    const long = { ...copper, length: 100 };
    expect(relativeError(tubeDragAt(neo.m, long, 0), tubeDragDeep(neo.m, long) / 2)).toBeLessThan(1e-9);
    expect(tubeDragAt(neo.m, long, -0.2)).toBeLessThan(1e-4 * tubeDragDeep(neo.m, long));
  });

  it('starting at rest deep in a long tube, v(t) = v_T(1 − e^(−t/τ)), and the copper tube of the figure gives about 4 cm/s', () => {
    const long = { ...copper, length: 100 };
    const vT = tubeTerminalSpeed(neo, long);
    const tau = tubeTimeConstant(neo, long);
    let st: FallState = { t: 0, s: 50, v: 0, heat: 0 };
    for (let i = 0; i < 2000; i++) st = fallStep(st, neo, long, tau / 1000);
    expect(relativeError(st.v, vT * (1 - Math.exp(-2)))).toBeLessThan(1e-9);
    expect(vT).toBeGreaterThan(0.03);
    expect(vT).toBeLessThan(0.05);
    // the magnetic Reynolds number of the model's validity condition
    expect(MU0 * copper.sigma * copper.wall * vT).toBeLessThan(0.01);
  });

  it('a falling N-down magnet: the wall below it turns an N face up at it (repels), the wall above an N face down at its S (attracts)', () => {
    // anticlockwise from above (positive) = moment up = the ring's upper face is N
    expect(wallCurrentDensity(neo, copper, 0.2, 0.04, 0.21, true)).toBeGreaterThan(0); // below: upper face N, toward the magnet's N
    expect(wallCurrentDensity(neo, copper, 0.2, 0.04, 0.19, true)).toBeLessThan(0); // above: moment down, lower face N, toward the magnet's S
    expect(wallCurrentDensity(neo, copper, 0.2, 0.04, 0.2, true)).toBe(0);
  });
});

describe('scaling', () => {
  it('the ring force grows as w and as (NI)², and falls as 1/R', () => {
    const base = ringResponse(mag, ring, -0.07, 0.2).force;
    expect(relativeError(ringResponse(mag, ring, -0.07, 0.6).force, 3 * base)).toBeLessThan(1e-12);
    expect(relativeError(ringResponse({ ...mag, NI: 3000 }, ring, -0.07, 0.2).force, 4 * base)).toBeLessThan(1e-12);
    expect(relativeError(ringResponse(mag, { ...ring, R: 4e-4 }, -0.07, 0.2).force, base / 2)).toBeLessThan(1e-12);
  });

  it('the tube brakes as m², σ and w, and as 1/a⁴; the terminal speed grows as the mass', () => {
    const k = tubeDragDeep(neo.m, copper);
    expect(relativeError(tubeDragDeep(2 * neo.m, copper), 4 * k)).toBeLessThan(1e-12);
    expect(relativeError(tubeDragDeep(neo.m, { ...copper, sigma: copper.sigma / 2 }), k / 2)).toBeLessThan(1e-12);
    expect(relativeError(tubeDragDeep(neo.m, { ...copper, wall: 2 * copper.wall }), 2 * k)).toBeLessThan(1e-12);
    expect(relativeError(tubeDragDeep(neo.m, { ...copper, a: 2 * copper.a }), k / 16)).toBeLessThan(1e-12);
    expect(relativeError(tubeTerminalSpeed({ ...neo, mass: 3 * neo.mass }, copper), 3 * tubeTerminalSpeed(neo, copper))).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the stack of discrete rings converges to the integral as the rings get thinner', () => {
    const s = 0.15;
    const exact = tubeDragAt(neo.m, copper, s);
    const errs = [100, 200, 400].map((n) => Math.abs(ringStackDrag(neo.m, copper, s, n) - exact) / exact);
    expect(errs[2]).toBeLessThan(1e-4);
    expect(errs[1]).toBeLessThan(errs[0] / 3); // midpoint rule: second order
    expect(errs[2]).toBeLessThan(errs[1] / 3);
  });

  it('the mutual inductance equals the flux of one loop through the other, integrated over the disc', () => {
    const [a, b, d] = [0.03, 0.012, 0.05];
    const flux = (n: number) => riemann((r) => loopField(1, b, r, d).z * 2 * Math.PI * r, 0, a, n);
    const M = coaxialMutual(a, b, d);
    expect(relativeError(flux(400), M)).toBeLessThan(1e-5);
    expect(Math.abs(flux(400) - M)).toBeLessThan(Math.abs(flux(100) - M));
  });

  it('the magnet stand-in converges as its loops multiply', () => {
    const f = (n: number) => magnetRingFlux(mag, ring.a, -0.06, n);
    expect(Math.abs(f(64) - f(256))).toBeLessThan(Math.abs(f(16) - f(256)));
    expect(relativeError(f(16), f(256))).toBeLessThan(5e-3);
  });

  it('halving the time step does not change the fall through the figure tube', () => {
    const end = (dt: number) => {
      const run = simulateFall(neo, copper, -0.02, dt, 30, 0.02);
      return run[run.length - 1].t;
    };
    expect(relativeError(end(5e-4), end(2.5e-4))).toBeLessThan(1e-3);
  });
});
