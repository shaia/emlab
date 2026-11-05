import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { riemann } from '~/physics/calculus';
import {
  acMeanPower,
  averageEmf,
  chargeThrough,
  emfOf,
  fluxUniform,
  generatorEmf,
  generatorFlux,
  generatorPeak,
  inclineDrive,
  inducedCircleEmf,
  inducedFieldStrength,
  lenzSense,
  motionalEmf,
  railBrakingForce,
  railCurrent,
  railDistance,
  railSpeed,
  railStep,
  railTerminalSpeed,
  railTimeConstant,
  rms,
  stripEmf,
  stripFlux,
  stripFluxSlope,
  wireRectFlux,
  type Generator,
  type RailRod,
  type RailState,
} from '~/physics/induction';
import { circulation, straightWireField } from '~/physics/magnetism';
import { circlePath } from '~/physics/coils';
import { inducedE } from '~/physics/maxwell';
import { relativeError } from '~/physics/vec';

const rod: RailRod = { m: 0.05, L: 0.4, B: 0.5, R: 2, F: 0.3 };
const gen: Generator = { N: 200, B: 0.08, A: 0.01, omega: 2 * Math.PI * 50 };

function runRail(p: RailRod, v0: number, T: number, steps: number): RailState {
  let s: RailState = { x: 0, v: v0, heat: 0 };
  const dt = T / steps;
  for (let i = 0; i < steps; i++) s = railStep(s, p, dt);
  return s;
}

describe('analytic limit: flux', () => {
  it('the flux is B·A when the field is along the normal, zero when it lies in the loop, and reverses past 90°', () => {
    expect(fluxUniform(0.2, 0.03)).toBeCloseTo(6e-3, 15);
    expect(Math.abs(fluxUniform(0.2, 0.03, Math.PI / 2))).toBeLessThan(1e-18);
    expect(relativeError(fluxUniform(0.2, 0.03, Math.PI), -6e-3)).toBeLessThan(1e-12);
    expect(relativeError(fluxUniform(0.2, 0.03, Math.PI / 3), 3e-3)).toBeLessThan(1e-12);
  });

  it('a strip of field: zero flux outside, B·h·w fully inside, B·h·(b−a) for a loop wider than the strip', () => {
    const B = 0.4;
    const h = 0.1;
    expect(stripFlux(B, 0, 0.3, -0.5, 0.2, h)).toBe(0);
    expect(relativeError(stripFlux(B, 0, 0.3, 0.05, 0.2, h), B * h * 0.2)).toBeLessThan(1e-12);
    expect(relativeError(stripFlux(B, 0, 0.3, -0.1, 0.5, h), B * h * 0.3)).toBeLessThan(1e-12);
  });

  it('the emf of a loop crossing a strip is −Bhv entering, +Bhv leaving, zero fully inside', () => {
    const [B, h, v] = [0.4, 0.1, 2];
    expect(relativeError(stripEmf(B, 0, 0.3, -0.1, 0.2, h, v), -B * h * v)).toBeLessThan(1e-12);
    expect(stripEmf(B, 0, 0.3, 0.05, 0.2, h, v)).toBe(0);
    expect(relativeError(stripEmf(B, 0, 0.3, 0.2, 0.2, h, v), B * h * v)).toBeLessThan(1e-12);
  });
});

describe("analytic limit: Faraday's law and Lenz's sense", () => {
  it('a flux that grows linearly gives a constant emf of −N·slope, whether averaged or differentiated', () => {
    const phi = (t: number): number => 0.002 + 0.005 * t;
    expect(relativeError(averageEmf(50, phi(1), phi(3), 2), -0.25)).toBeLessThan(1e-12);
    expect(relativeError(emfOf(phi, 2, 50), -0.25)).toBeLessThan(1e-8);
  });

  it('the induced current opposes the change: against the positive sense when the flux grows, with it when the flux falls', () => {
    expect(lenzSense(+3)).toBe(-1);
    expect(lenzSense(-0.1)).toBe(1);
    expect(lenzSense(0)).toBe(0);
  });

  it('the charge through a loop depends only on the change of flux: a flip of B·A through 180° passes 2NBA/R', () => {
    const [N, B, A, R] = [100, 0.05, 4e-3, 8];
    const q = chargeThrough(N, fluxUniform(B, A, 0), fluxUniform(B, A, Math.PI), R);
    expect(relativeError(q, (2 * N * B * A) / R)).toBeLessThan(1e-12);
  });
});

describe('analytic limit: rod on rails', () => {
  it('the braking force at the terminal speed balances the drive', () => {
    const vT = railTerminalSpeed(rod);
    expect(relativeError(railBrakingForce(rod, vT), rod.F)).toBeLessThan(1e-12);
    expect(relativeError(railCurrent(rod, vT), motionalEmf(rod.B, rod.L, vT) / rod.R)).toBeLessThan(1e-12);
  });

  it('the speed starts at v0, has risen 1 − 1/e of the way after one time constant, and tends to v_T', () => {
    const vT = railTerminalSpeed(rod);
    const tau = railTimeConstant(rod);
    expect(railSpeed(rod, 0, 0)).toBe(0);
    expect(relativeError(railSpeed(rod, 0, tau), vT * (1 - Math.exp(-1)))).toBeLessThan(1e-12);
    expect(relativeError(railSpeed(rod, 0, 30 * tau), vT)).toBeLessThan(1e-12);
  });

  it('a rod coasting with no drive stops after travelling v0·τ', () => {
    const coast = { ...rod, F: 0 };
    expect(relativeError(railDistance(coast, 3, 50 * railTimeConstant(coast)), 3 * railTimeConstant(coast))).toBeLessThan(1e-12);
  });

  it('on an incline the drive is m·g·sinα', () => {
    expect(relativeError(inclineDrive(0.2, Math.PI / 6), 0.2 * G * 0.5)).toBeLessThan(1e-12);
  });
});

describe('analytic limit: induced electric field and generator', () => {
  it('the induced field grows as r inside the core, falls as 1/r outside, and is continuous at the edge', () => {
    const [k, a] = [2, 0.04];
    expect(relativeError(inducedFieldStrength(k, a, 0.02), 0.02)).toBeLessThan(1e-12);
    expect(relativeError(inducedFieldStrength(k, a, 0.08), (k * a * a) / (2 * 0.08))).toBeLessThan(1e-12);
    expect(relativeError(inducedFieldStrength(k, a, a * (1 - 1e-12)), inducedFieldStrength(k, a, a))).toBeLessThan(1e-9);
    expect(inducedFieldStrength(k, a, 0)).toBe(0);
  });

  it('the generator emf peaks at NBAω when the coil plane is along B, and is zero when the flux is largest', () => {
    const T = (2 * Math.PI) / gen.omega;
    expect(Math.abs(generatorEmf(gen, 0))).toBeLessThan(1e-12);
    expect(relativeError(generatorFlux(gen, 0), gen.N * gen.B * gen.A)).toBeLessThan(1e-12);
    expect(relativeError(generatorEmf(gen, T / 4), generatorPeak(gen))).toBeLessThan(1e-12);
    expect(relativeError(rms(generatorPeak(gen)), generatorPeak(gen) / Math.sqrt(2))).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('rod on rails: the work of the drive is the kinetic energy plus the Joule heat', () => {
    const v0 = 0.5;
    const T = 4 * railTimeConstant(rod);
    const s = runRail(rod, v0, T, 4000);
    const work = rod.F * s.x;
    const kinetic = 0.5 * rod.m * (s.v * s.v - v0 * v0);
    expect(relativeError(work, kinetic + s.heat)).toBeLessThan(1e-9);
  });

  it('rod on rails: the charge that passed is ΔΦ/R = BLx/R, as for any change of flux', () => {
    const T = 3 * railTimeConstant(rod);
    const q = riemann((t) => railCurrent(rod, railSpeed(rod, 0, t)), 0, T, 4000);
    const x = railDistance(rod, 0, T);
    expect(relativeError(q, Math.abs(chargeThrough(1, 0, rod.B * rod.L * x, rod.R)))).toBeLessThan(1e-7);
  });

  it('a loop pushed through a strip of field: the net charge is zero, and the charge in on entry equals the charge out', () => {
    const [B, h, w, R, v] = [0.4, 0.1, 0.2, 5, 1.5];
    const xAt = (t: number): number => -0.3 + v * t;
    const I = (t: number): number => stripEmf(B, 0, 0.5, xAt(t), w, h, v) / R;
    const tFull = (0.3 + 0.5 + 0.2 + 0.1) / v;
    const entry = riemann(I, 0, 0.3 / v + w / v, 6000);
    expect(relativeError(Math.abs(entry), (B * h * w) / R)).toBeLessThan(1e-3);
    expect(Math.abs(riemann(I, 0, tFull, 12000))).toBeLessThan(1e-3 * Math.abs(entry));
  });

  it('generator: the mean power over a cycle is ε₀²/(2R) = ε_rms²/R', () => {
    const R = 40;
    const T = (2 * Math.PI) / gen.omega;
    const mean = riemann((t) => generatorEmf(gen, t) ** 2 / R, 0, T, 2000) / T;
    expect(relativeError(mean, acMeanPower(generatorPeak(gen), R))).toBeLessThan(1e-9);
    expect(relativeError(mean, rms(generatorPeak(gen)) ** 2 / R)).toBeLessThan(1e-9);
  });
});

describe('convergence', () => {
  it('the RK4 rail integrator converges to the closed form at fourth order', () => {
    const T = 2 * railTimeConstant(rod);
    const err = (n: number): number => Math.abs(runRail(rod, 0, T, n).v - railSpeed(rod, 0, T));
    const ratio = err(10) / err(20);
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
    expect(relativeError(runRail(rod, 0, T, 400).x, railDistance(rod, 0, T))).toBeLessThan(1e-9);
  });

  it("the wire's flux through a rectangle is the sum of μ₀I/(2πr) over thin strips", () => {
    const [I, h, r1, r2] = [10, 0.2, 0.05, 0.15];
    const sum = riemann((r) => straightWireField(I, r) * h, r1, r2, 2000);
    expect(relativeError(sum, wireRectFlux(I, h, r1, r2))).toBeLessThan(1e-6);
  });

  it('the circulation of the induced field round a circle converges to π·min(r,a)²·dB/dt, inside and outside', () => {
    const [k, a] = [2, 0.04];
    for (const r of [0.025, 0.07]) {
      const c = circulation(inducedE(k, a), circlePath(0, 0, r, 400));
      expect(relativeError(Math.abs(c), inducedCircleEmf(k, a, r))).toBeLessThan(1e-3);
      expect(c).toBeLessThan(0); // positive dB/dt (⊙) drives E clockwise, against the positive sense
    }
  });

  it('the numerical emf of the generator converges to NBAω·sin(ωt) at second order in the step', () => {
    const t = 0.0013;
    const phi = (s: number): number => generatorFlux(gen, s);
    const err = (h: number): number => relativeError(emfOf(phi, t, 1, h), generatorEmf(gen, t));
    const ratio = err(1e-5) / err(5e-6);
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
    expect(err(1e-7)).toBeLessThan(1e-8);
  });
});

describe('scaling (the dimensional proxy)', () => {
  it('the emf scales with N and with the rate of change; the charge does not depend on the rate', () => {
    expect(relativeError(averageEmf(200, 0, 1e-3, 0.01), 2 * averageEmf(100, 0, 1e-3, 0.01))).toBeLessThan(1e-12);
    expect(relativeError(averageEmf(100, 0, 1e-3, 0.005), 2 * averageEmf(100, 0, 1e-3, 0.01))).toBeLessThan(1e-12);
    // the same change of flux, fast and linear or slow and smooth: the integrated current is the same
    const [N, R, dPhi] = [100, 10, 1e-3];
    const fast = riemann((t) => emfOf((s) => (dPhi * s) / 0.001, t, N) / R, 0, 0.001, 400);
    const slow = riemann((t) => emfOf((s) => (dPhi * (1 - Math.cos((Math.PI * s) / 0.5))) / 2, t, N, 1e-6) / R, 0, 0.5, 4000);
    expect(relativeError(fast, chargeThrough(N, 0, dPhi, R))).toBeLessThan(1e-6);
    expect(relativeError(slow, chargeThrough(N, 0, dPhi, R))).toBeLessThan(1e-6);
  });

  it('doubling B quarters the terminal speed and the time constant; doubling R doubles both', () => {
    const vT = railTerminalSpeed(rod);
    const tau = railTimeConstant(rod);
    expect(relativeError(railTerminalSpeed({ ...rod, B: 2 * rod.B }), vT / 4)).toBeLessThan(1e-12);
    expect(relativeError(railTimeConstant({ ...rod, B: 2 * rod.B }), tau / 4)).toBeLessThan(1e-12);
    expect(relativeError(railTerminalSpeed({ ...rod, R: 2 * rod.R }), 2 * vT)).toBeLessThan(1e-12);
    expect(relativeError(railTimeConstant({ ...rod, R: 2 * rod.R }), 2 * tau)).toBeLessThan(1e-12);
  });

  it('the generator peak is linear in N, B, A and ω; the wire flux is linear in I and h', () => {
    const p = generatorPeak(gen);
    expect(relativeError(generatorPeak({ ...gen, omega: 3 * gen.omega }), 3 * p)).toBeLessThan(1e-12);
    expect(relativeError(generatorPeak({ ...gen, N: 2 * gen.N, A: 2 * gen.A }), 4 * p)).toBeLessThan(1e-12);
    expect(relativeError(wireRectFlux(20, 0.4, 0.1, 0.3), 4 * wireRectFlux(10, 0.2, 0.1, 0.3))).toBeLessThan(1e-12);
    expect(relativeError(wireRectFlux(10, 0.2, 0.2, 0.6), wireRectFlux(10, 0.2, 0.1, 0.3))).toBeLessThan(1e-12);
  });

  it('the strip slope is ±B·h, independent of the loop width while one side is inside', () => {
    expect(stripFluxSlope(0.4, 0, 1, -0.05, 0.1, 0.2)).toBeCloseTo(0.08, 15);
    expect(stripFluxSlope(0.4, 0, 1, -0.25, 0.3, 0.2)).toBeCloseTo(0.08, 15);
  });
});
