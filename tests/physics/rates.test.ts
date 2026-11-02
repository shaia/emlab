import { describe, expect, it } from 'vitest';
import { derivative, secantSlope } from '~/physics/calculus';
import { G, K } from '~/physics/constants';
import { pointFieldMagnitude } from '~/physics/electrostatics';
import {
  binomial,
  dischargeCharge,
  dischargeCurrent,
  expSlopeFactor,
  fallPosition,
  fallVelocity,
  oscillatorAcceleration,
  oscillatorPosition,
  oscillatorVelocity,
  pointPotential,
  pointRadialField,
  powerSecant,
  sinSlopeFactor,
  tangentZero,
} from '~/physics/rates';
import { relativeError } from '~/physics/vec';

const Q0 = 1.2e-3; // C: 100 μF charged to 12 V
const TAU = 2; // s: 20 kΩ · 100 μF

describe('analytic limits', () => {
  it('the secant slope of the fall shrinks to v = gt (at t = 1 s, to 10 m/s)', () => {
    const f = (t: number) => fallPosition(t);
    // the secant of ½gt² from t to t+h is gt + ½gh exactly
    for (const h of [1, 0.1, 0.01]) expect(relativeError(secantSlope(f, 1, h), G * 1 + 0.5 * G * h)).toBeLessThan(1e-12);
    expect(relativeError(secantSlope(f, 1, 1e-6), fallVelocity(1))).toBeLessThan(1e-6);
    expect(fallVelocity(1)).toBe(10);
  });

  it('the discharge current is −dq/dt, and at t = 0 it is Q₀/τ = V₀/R (Ohm, lesson 3.9)', () => {
    const q = (t: number) => dischargeCharge(t, Q0, TAU);
    for (const t of [0.5, 2, 5]) expect(relativeError(-derivative(q, t), dischargeCurrent(t, Q0, TAU))).toBeLessThan(1e-8);
    expect(relativeError(dischargeCurrent(0, Q0, TAU), 12 / 20e3)).toBeLessThan(1e-12);
  });

  it('the field is minus the slope of the potential: −dV/dr = kQ/r², Coulomb’s field of lesson 1.5', () => {
    const Q = 1e-9;
    const V = (r: number) => pointPotential(r, Q);
    for (const r of [0.5, 1, 3]) {
      expect(relativeError(-derivative(V, r), pointRadialField(r, Q))).toBeLessThan(1e-8);
      expect(relativeError(pointRadialField(r, Q), pointFieldMagnitude(Q, r))).toBeLessThan(1e-12);
    }
    expect(pointPotential(1, Q)).toBeCloseTo(K * Q, 12);
  });

  it('the oscillator: v = Aω·cos(ωt) and a = −ω²x, the derivative of the derivative', () => {
    const A = 0.05;
    const w = 4 * Math.PI;
    const x = (t: number) => oscillatorPosition(t, A, w);
    const v = (t: number) => oscillatorVelocity(t, A, w);
    for (const t of [0, 0.07, 0.3]) {
      expect(Math.abs(derivative(x, t) - v(t))).toBeLessThan(1e-7 * A * w);
      expect(Math.abs(derivative(v, t) - oscillatorAcceleration(t, A, w))).toBeLessThan(1e-6 * A * w * w);
      expect(oscillatorAcceleration(t, A, w)).toBeCloseTo(-w * w * x(t), 9);
    }
    // the largest speed is Aω, the speed of the circular motion it is the shadow of
    expect(relativeError(v(0), A * w)).toBeLessThan(1e-12);
  });

  it('the slope factors (e^h − 1)/h and sin(h)/h tend to 1, which makes (eˣ)′ = eˣ and (sin x)′ at 0 equal 1', () => {
    for (const f of [expSlopeFactor, sinSlopeFactor]) {
      expect(Math.abs(f(1e-1) - 1)).toBeLessThan(0.06);
      expect(Math.abs(f(1e-3) - 1)).toBeLessThan(6e-4);
      expect(Math.abs(f(1e-6) - 1)).toBeLessThan(1e-6);
    }
    expect(Number.isNaN(expSlopeFactor(0))).toBe(true); // h = 0 is 0/0: the derivative is the limit, not the value
  });

  it('the tangent to the discharge curve at any t₀ crosses the time axis at t₀ + τ', () => {
    const q = (t: number) => dischargeCharge(t, Q0, TAU);
    for (const t0 of [0, 1, 3.7]) expect(relativeError(tangentZero(q, t0), t0 + TAU)).toBeLessThan(1e-8);
  });
});

describe('identities (conservation)', () => {
  it('the expansion of the secant slope of xⁿ equals the secant slope itself', () => {
    for (const n of [0, 1, 2, 3, 4, 7]) {
      for (const [x, h] of [[1.3, 0.2], [-2, 0.05], [0.4, -0.3]]) {
        const direct = n === 0 ? 0 : secantSlope((t) => t ** n, x, h);
        expect(Math.abs(powerSecant(n, x, h) - direct)).toBeLessThan(1e-9 * Math.max(1, Math.abs(direct)));
      }
    }
  });

  it('as h → 0 the expansion leaves only n·xⁿ⁻¹ (the power rule)', () => {
    for (const n of [1, 2, 3, 5]) expect(relativeError(powerSecant(n, 1.5, 1e-9), n * 1.5 ** (n - 1))).toBeLessThan(1e-7);
  });

  it('the binomial coefficients: n ways to pick the one bracket that gives h', () => {
    expect([0, 1, 2, 3, 4].map((k) => binomial(4, k))).toEqual([1, 4, 6, 4, 1]);
    for (const n of [2, 5, 9]) expect(binomial(n, 1)).toBe(n);
  });

  it('the charge that leaves the capacitor is all the charge it had: the area under I(t) is Q₀', () => {
    // a midpoint sum of I over [0, 20τ]; the tail beyond 20τ is e^(−20) ≈ 2·10⁻⁹ of Q₀
    const n = 20000;
    const T = 20 * TAU;
    let s = 0;
    for (let i = 0; i < n; i++) s += dischargeCurrent((i + 0.5) * (T / n), Q0, TAU) * (T / n);
    expect(relativeError(s, Q0)).toBeLessThan(1e-6);
  });
});

describe('scaling', () => {
  it('doubling Q₀ doubles the current; doubling τ halves the starting current', () => {
    expect(relativeError(dischargeCurrent(0.3, 2 * Q0, TAU), 2 * dischargeCurrent(0.3, Q0, TAU))).toBeLessThan(1e-12);
    expect(relativeError(dischargeCurrent(0, Q0, 2 * TAU), dischargeCurrent(0, Q0, TAU) / 2)).toBeLessThan(1e-12);
  });

  it('doubling ω doubles the top speed and quadruples the top acceleration (the chain rule’s factor ω)', () => {
    const A = 0.1;
    expect(relativeError(oscillatorVelocity(0, A, 6), 2 * oscillatorVelocity(0, A, 3))).toBeLessThan(1e-12);
    const aMax = (w: number) => Math.abs(oscillatorAcceleration(Math.PI / (2 * w), A, w));
    expect(relativeError(aMax(6), 4 * aMax(3))).toBeLessThan(1e-12);
  });

  it('the field from the slope of V scales as 1/r²: twice as far, a quarter of the field', () => {
    const Q = 2e-9;
    const E = (r: number) => -derivative((s) => pointPotential(s, Q), r);
    expect(relativeError(E(2), E(1) / 4)).toBeLessThan(1e-8);
  });
});

describe('convergence', () => {
  it('the secant error shrinks in proportion to h: ten times smaller h, ten times smaller error', () => {
    const q = (t: number) => dischargeCharge(t, Q0, TAU);
    const exact = -dischargeCurrent(1, Q0, TAU);
    const err = (h: number) => Math.abs(secantSlope(q, 1, h) - exact);
    for (const h of [0.1, 0.01]) expect(err(h) / err(h / 10)).toBeGreaterThan(9.5);
    for (const h of [0.1, 0.01]) expect(err(h) / err(h / 10)).toBeLessThan(10.5);
  });

  it('secants from the left and from the right close in on the same slope from both sides', () => {
    const f = (t: number) => fallPosition(t);
    for (const h of [0.5, 0.05, 0.005]) {
      expect(secantSlope(f, 1, h)).toBeGreaterThan(10);
      expect(secantSlope(f, 1, -h)).toBeLessThan(10);
      expect(Math.abs(secantSlope(f, 1, h) + secantSlope(f, 1, -h) - 20)).toBeLessThan(1e-9);
    }
  });
});
