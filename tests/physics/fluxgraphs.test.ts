import { describe, expect, it } from 'vitest';
import { derivative, riemann } from '~/physics/calculus';
import { chargeThrough, emfOf } from '~/physics/induction';
import {
  bellEmf,
  bellFlux,
  bellPeakEmf,
  bellSteepest,
  passCharge,
  passCurrent,
  passEmf,
  passFlux,
  passHeatPower,
  passMagneticForce,
  passPushForce,
  passPushPower,
  passTimes,
  passWork,
  pieceAt,
  pieceEmfs,
  pieces,
  piecewiseLinear,
  stepEmf,
  type Knot,
  type StripPass,
} from '~/physics/fluxgraphs';
import { relativeError } from '~/physics/vec';

/** The lesson's strip: B = 0.5 T, a 20 cm × 20 cm loop, a 40 cm strip, R = 0.1 Ω, v = 0.1 m/s. */
const pass: StripPass = { B: 0.5, a: 0, b: 0.4, w: 0.2, h: 0.2, v: 0.1, R: 0.1, N: 1, x0: -0.3 };
/** The lesson's step graph in Wb: rise, hold, fast fall through zero, slower fall, hold. */
const knots: Knot[] = [
  [0, 0],
  [2, 6e-3],
  [4, 6e-3],
  [5, 0],
  [7, -4e-3],
  [8, -4e-3],
];
const T_END = (pass.b - pass.x0) / pass.v;

describe('analytic limit: emf from the slope of a flux graph', () => {
  it('each straight piece gives the constant emf −N·slope, and a flat piece gives none', () => {
    const e = pieceEmfs(knots, 10);
    const want = [-0.03, 0, 0.06, 0.02, 0];
    e.forEach((v, i) => (want[i] === 0 ? expect(v).toBe(0) : expect(relativeError(v, want[i])).toBeLessThan(1e-12)));
  });

  it('the step emf matches the derivative of the graph inside every piece', () => {
    const phi = piecewiseLinear(knots);
    const eps = stepEmf(knots, 10);
    for (const p of pieces(knots)) {
      const t = (p.t0 + p.t1) / 2;
      const d = emfOf(phi, t, 10);
      if (p.slope === 0) expect(Math.abs(d)).toBeLessThan(1e-9);
      else expect(relativeError(eps(t), d)).toBeLessThan(1e-6);
    }
  });

  it('the emf keeps its sign where the flux passes through zero, and changes sign only where the slope does', () => {
    const eps = stepEmf(knots, 1);
    // the flux is zero at t = 5 s, inside a falling stretch: the emf on both sides is positive
    expect(eps(4.99)).toBeGreaterThan(0);
    expect(eps(5.01)).toBeGreaterThan(0);
    expect(eps(1)).toBeLessThan(0);
  });

  it('a corner belongs to the piece that starts there, and outside the graph the emf is zero', () => {
    const ps = pieces(knots);
    expect(pieceAt(ps, 2)).toBe(1);
    expect(pieceAt(ps, 8)).toBe(4);
    expect(pieceAt(ps, -1)).toBe(-1);
    expect(stepEmf(knots)(9)).toBe(0);
  });

  it('the bell has zero emf at its peak and its largest emf where it is steepest, of size √2·e^(−½)·NΦ₀/τ', () => {
    const [phi0, t0, tau, N] = [4e-3, 3, 0.5, 200];
    const phi = bellFlux(phi0, t0, tau);
    const eps = bellEmf(phi0, t0, tau, N);
    expect(Math.abs(eps(t0))).toBeLessThan(1e-15);
    const [t1, t2] = bellSteepest(t0, tau);
    expect(relativeError(Math.abs(eps(t1)), bellPeakEmf(phi0, tau, N))).toBeLessThan(1e-12);
    expect(eps(t1)).toBeLessThan(0); // flux rising: the emf is negative
    expect(eps(t2)).toBeGreaterThan(0); // flux falling: positive
    for (const t of [2.2, 2.8, 3.4]) expect(relativeError(eps(t), emfOf(phi, t, N, 1e-6))).toBeLessThan(1e-6);
    // the steepest moment is a maximum of |ε|: a small step either side gives less
    expect(Math.abs(eps(t1 + 0.01))).toBeLessThan(Math.abs(eps(t1)));
    expect(Math.abs(eps(t1 - 0.01))).toBeLessThan(Math.abs(eps(t1)));
  });

  it('these graphs are not fooled by the shape: a doubled flux doubles the emf, a halved time doubles it', () => {
    const a = pieceEmfs(knots, 1);
    const twice = pieceEmfs(knots.map(([t, v]) => [t, 2 * v] as Knot), 1);
    const fast = pieceEmfs(knots.map(([t, v]) => [t / 2, v] as Knot), 1);
    a.forEach((v, i) => {
      if (v === 0) return;
      expect(relativeError(twice[i], 2 * v)).toBeLessThan(1e-12);
      expect(relativeError(fast[i], 2 * v)).toBeLessThan(1e-12);
    });
  });

  it('bad knot lists throw', () => {
    expect(() => pieces([[0, 1]])).toThrow(RangeError);
    expect(() => pieces([[0, 1], [0, 2]])).toThrow(RangeError);
  });
});

describe('analytic limit: a loop pushed through a strip of field', () => {
  it('the flux rises to B·h·w, holds, and falls back to zero', () => {
    const { leadIn, trailIn, leadOut, trailOut } = passTimes(pass);
    expect([leadIn, trailIn, leadOut, trailOut].map((t) => Number(t.toFixed(9)))).toEqual([1, 3, 5, 7]);
    expect(passFlux(pass, 0.5)).toBe(0);
    expect(relativeError(passFlux(pass, 2), 0.01)).toBeLessThan(1e-12);
    expect(relativeError(passFlux(pass, 4), 0.02)).toBeLessThan(1e-12);
    expect(passFlux(pass, 7.5)).toBe(0);
  });

  it('the emf is −Bhv entering, zero fully inside (the loop still moves in the field), +Bhv leaving', () => {
    const bhv = pass.B * pass.h * pass.v;
    expect(relativeError(passEmf(pass, 2), -bhv)).toBeLessThan(1e-12);
    expect(passEmf(pass, 4)).toBe(0);
    expect(relativeError(passEmf(pass, 6), bhv)).toBeLessThan(1e-12);
    expect(relativeError(passCurrent(pass, 2), -0.1)).toBeLessThan(1e-12); // counter-clockwise
    expect(relativeError(passCurrent(pass, 6), 0.1)).toBeLessThan(1e-12); // clockwise
  });

  it('the magnetic force opposes the motion both entering and leaving, and the push is B²h²v/R = 0.01 N', () => {
    expect(passMagneticForce(pass, 2)).toBeLessThan(0);
    expect(passMagneticForce(pass, 6)).toBeLessThan(0);
    expect(passMagneticForce(pass, 4)).toBe(0);
    const want = (pass.B ** 2 * pass.h ** 2 * pass.v) / pass.R;
    expect(relativeError(want, 0.01)).toBeLessThan(1e-12);
    expect(relativeError(passPushForce(pass, 2), want)).toBeLessThan(1e-12);
    expect(relativeError(passPushForce(pass, 6), want)).toBeLessThan(1e-12);
    expect(passPushForce(pass, 0.5)).toBe(0);
  });

  it('with N turns the emf grows N times and the push N² times', () => {
    const p5 = { ...pass, N: 5 };
    expect(relativeError(passEmf(p5, 2), 5 * passEmf(pass, 2))).toBeLessThan(1e-12);
    expect(relativeError(passPushForce(p5, 2), 25 * passPushForce(pass, 2))).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('the power of the push equals the Joule power I²R at every instant', () => {
    for (let t = 0; t <= T_END; t += 0.137) {
      const P = passPushPower(pass, t);
      const H = passHeatPower(pass, t);
      if (H === 0) expect(P).toBe(0);
      else expect(relativeError(P, H)).toBeLessThan(1e-12);
    }
  });

  it('over a whole pass the work of the push is the heat, 2·B²h²·v·w/R', () => {
    const heat = riemann((t) => passHeatPower(pass, t), 0, T_END, 80000);
    expect(relativeError(heat, passWork(pass))).toBeLessThan(1e-3);
    expect(relativeError(passWork(pass), 4e-3)).toBeLessThan(1e-12);
  });

  it('the charge is −NΔΦ/R: 0.2 C entering, −0.2 C leaving, zero for the whole pass', () => {
    const { trailIn, leadOut } = passTimes(pass);
    expect(relativeError(passCharge(pass, 0, trailIn), -0.2)).toBeLessThan(1e-12);
    expect(relativeError(passCharge(pass, leadOut, T_END), 0.2)).toBeLessThan(1e-12);
    expect(Math.abs(passCharge(pass, 0, T_END))).toBeLessThan(1e-15);
  });

  it('a flux graph that returns to its start passes no net charge, however it wanders', () => {
    const loopKnots: Knot[] = [...knots, [9, 0]];
    const I = (t: number) => stepEmf(loopKnots, 10)(t) / 5;
    expect(Math.abs(riemann(I, 0, 9, 90000))).toBeLessThan(1e-7);
  });
});

describe('scaling (the dimensional proxy)', () => {
  it('pushing faster raises the current and the push, shortens the pulse, and leaves the charge unchanged', () => {
    for (const k of [0.5, 2, 4]) {
      const fast = { ...pass, v: pass.v * k };
      const tf = (fast.a - fast.x0) / fast.v;
      expect(relativeError(passCurrent(fast, tf * 0.75 + 0.25 * passTimes(fast).leadIn), k * passCurrent(pass, 2))).toBeLessThan(1e-12);
      expect(relativeError(passPushForce(fast, passTimes(fast).leadIn + 1e-9), k * passPushForce(pass, 2))).toBeLessThan(1e-12);
      const qFast = riemann((t) => passCurrent(fast, t), 0, tf, 40000);
      const qSlow = riemann((t) => passCurrent(pass, t), 0, passTimes(pass).trailIn, 40000);
      expect(relativeError(qFast, qSlow)).toBeLessThan(2e-3);
      expect(relativeError(passWork(fast), k * passWork(pass))).toBeLessThan(1e-12);
    }
  });

  it('the charge scales as N and ΔΦ and as 1/R, and not at all with the time the change takes', () => {
    expect(relativeError(chargeThrough(50, 0, 4e-3, 10), -0.02)).toBeLessThan(1e-12);
    expect(relativeError(chargeThrough(100, 0, 4e-3, 10), 2 * chargeThrough(50, 0, 4e-3, 10))).toBeLessThan(1e-12);
    expect(relativeError(chargeThrough(50, 0, 4e-3, 20), 0.5 * chargeThrough(50, 0, 4e-3, 10))).toBeLessThan(1e-12);
    const slow = riemann((t) => stepEmf([[0, 0], [4, 4e-3]], 50)(t) / 10, 0, 4, 4000);
    const quick = riemann((t) => stepEmf([[0, 0], [0.1, 4e-3]], 50)(t) / 10, 0, 0.1, 4000);
    expect(relativeError(slow, quick)).toBeLessThan(1e-9);
  });
});

describe('convergence', () => {
  it('the area under I(t) of the bell converges to −NΔΦ/R as the Riemann sum is refined', () => {
    const [phi0, t0, tau, N, R] = [4e-3, 3, 0.5, 200, 8];
    const I = (t: number) => bellEmf(phi0, t0, tau, N)(t) / R;
    const exact = chargeThrough(N, bellFlux(phi0, t0, tau)(0), bellFlux(phi0, t0, tau)(t0), R);
    const errs = [20, 40, 80].map((n) => Math.abs(riemann(I, 0, t0, n) - exact));
    // midpoint rule: second order
    expect(errs[0] / errs[1]).toBeGreaterThan(3.5);
    expect(errs[1] / errs[2]).toBeGreaterThan(3.5);
    expect(relativeError(riemann(I, 0, t0, 4000), exact)).toBeLessThan(1e-6);
  });

  it('the numerical derivative of the bell converges to its closed-form emf', () => {
    const phi = bellFlux(4e-3, 3, 0.5);
    const want = bellEmf(4e-3, 3, 0.5)(2.6);
    const errs = [1e-2, 5e-3, 2.5e-3].map((h) => Math.abs(-derivative(phi, 2.6, h) - want));
    expect(errs[0] / errs[1]).toBeGreaterThan(3.5);
    expect(errs[1] / errs[2]).toBeGreaterThan(3.5);
  });
});
