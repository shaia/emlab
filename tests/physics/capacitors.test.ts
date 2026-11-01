import { describe, expect, it } from 'vitest';
import {
  chargeOf,
  energyCV,
  energyDensity,
  energyQC,
  fieldFromSigma,
  gapField,
  parallel,
  parallelBank,
  plateCapacitance,
  plateForce,
  plateSigma,
  plateState,
  series,
  seriesString,
  shareCharge,
} from '~/physics/capacitors';
import { EPS0_DISPLAY } from '~/physics/constants';
import { parallelPlatesField } from '~/physics/electrostatics';
import { relativeError } from '~/physics/vec';

const uF = 1e-6;

describe('analytic limits', () => {
  it('a 200 cm², 2 mm air capacitor is ε₀A/d = 88.5 pF (the formula sheet’s ε₀)', () => {
    expect(relativeError(plateCapacitance(0.02, 0.002), (8.85e-12 * 0.02) / 0.002)).toBeLessThan(1e-12);
    expect(relativeError(plateCapacitance(0.02, 0.002), 8.85e-11)).toBeLessThan(1e-12);
  });

  it('the field from the plate charge (Gauss) equals V/d', () => {
    const A = 0.03;
    const d = 0.004;
    const V = 300;
    const Q = chargeOf(plateCapacitance(A, d), V);
    expect(relativeError(fieldFromSigma(plateSigma(Q, A)), gapField(V, d))).toBeLessThan(1e-12);
    // with a dielectric the free charge is κ times larger, the field the same
    const Qk = chargeOf(plateCapacitance(A, d, 3), V);
    expect(relativeError(fieldFromSigma(plateSigma(Qk, A), 3), gapField(V, d))).toBeLessThan(1e-12);
  });

  it('agrees with the engine’s Gauss plate field to within the 0.1% ε₀ gap', () => {
    const sigma = 2e-6;
    expect(relativeError(fieldFromSigma(sigma), parallelPlatesField(sigma))).toBeLessThan(1.5e-3);
  });

  it('the three energy formulas agree, and equal the field energy density times the volume', () => {
    const A = 0.02;
    const d = 0.002;
    const C = plateCapacitance(A, d);
    const V = 200;
    const Q = C * V;
    expect(relativeError(energyCV(C, V), energyQC(Q, C))).toBeLessThan(1e-12);
    expect(relativeError(energyCV(C, V), 0.5 * Q * V)).toBeLessThan(1e-12);
    expect(relativeError(energyDensity(gapField(V, d)) * A * d, energyCV(C, V))).toBeLessThan(1e-12);
  });

  it('series and parallel formulas: two equal capacitors give 2C and C/2', () => {
    expect(relativeError(parallel(3 * uF, 3 * uF), 6 * uF)).toBeLessThan(1e-12);
    expect(relativeError(series(3 * uF, 3 * uF), 1.5 * uF)).toBeLessThan(1e-12);
    expect(relativeError(series(2 * uF, 6 * uF), 1.5 * uF)).toBeLessThan(1e-12);
  });

  it('a capacitor joined to an equal empty one: half the voltage, half the energy', () => {
    const s = shareCharge(4 * uF, 100, 4 * uF);
    expect(relativeError(s.V, 50)).toBeLessThan(1e-12);
    expect(relativeError(s.after, s.before / 2)).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('isolated (disconnected): pulling the plates apart keeps Q and E, raises V and U', () => {
    const A = 0.02;
    const near = plateState(A, 0.002, 1, { V: 200 });
    const far = plateState(A, 0.004, 1, { Q: near.Q });
    expect(relativeError(far.Q, near.Q)).toBeLessThan(1e-12);
    expect(relativeError(far.E, near.E)).toBeLessThan(1e-12);
    expect(relativeError(far.V, 2 * near.V)).toBeLessThan(1e-12);
    expect(relativeError(far.U, 2 * near.U)).toBeLessThan(1e-12);
  });

  it('isolated: the work done against the plate attraction is the energy gained, F·Δd = ΔU', () => {
    const A = 0.02;
    const near = plateState(A, 0.002, 1, { V: 200 });
    const far = plateState(A, 0.005, 1, { Q: near.Q });
    expect(relativeError(plateForce(near.Q, A) * 0.003, far.U - near.U)).toBeLessThan(1e-12);
  });

  it('connected to a battery: pulling the plates apart keeps V, lowers Q, E and U', () => {
    const A = 0.02;
    const near = plateState(A, 0.002, 1, { V: 200 });
    const far = plateState(A, 0.004, 1, { V: 200 });
    expect(relativeError(far.V, near.V)).toBeLessThan(1e-12);
    expect(relativeError(far.Q, near.Q / 2)).toBeLessThan(1e-12);
    expect(relativeError(far.U, near.U / 2)).toBeLessThan(1e-12);
  });

  it('sharing charge conserves charge and loses exactly C₁C₂V₀²/(2(C₁+C₂))', () => {
    const C1 = 6 * uF;
    const C2 = 3 * uF;
    const V0 = 12;
    const s = shareCharge(C1, V0, C2);
    expect(relativeError(s.q1 + s.q2, C1 * V0)).toBeLessThan(1e-12);
    expect(relativeError(s.before - s.after, (C1 * C2 * V0 * V0) / (2 * (C1 + C2)))).toBeLessThan(1e-12);
  });

  it('a series string shares one charge and its voltages add to the source', () => {
    const b = seriesString([2 * uF, 3 * uF, 6 * uF], 12);
    expect(new Set(b.map((x) => x.Q.toPrecision(12))).size).toBe(1);
    expect(relativeError(b.reduce((a, x) => a + x.V, 0), 12)).toBeLessThan(1e-12);
    expect(relativeError(b[0].Q, 12 * uF)).toBeLessThan(1e-12);
  });

  it('a parallel bank’s charges add to the equivalent capacitor’s charge', () => {
    const b = parallelBank([2 * uF, 3 * uF], 10);
    expect(relativeError(b[0].Q + b[1].Q, parallel(2 * uF, 3 * uF) * 10)).toBeLessThan(1e-12);
  });
});

describe('scaling (the dimensional proxy)', () => {
  it('C grows with A and κ, and falls as 1/d', () => {
    const C = plateCapacitance(0.01, 0.001);
    expect(relativeError(plateCapacitance(0.02, 0.001), 2 * C)).toBeLessThan(1e-12);
    expect(relativeError(plateCapacitance(0.01, 0.002), C / 2)).toBeLessThan(1e-12);
    expect(relativeError(plateCapacitance(0.01, 0.001, 4), 4 * C)).toBeLessThan(1e-12);
  });

  it('energy grows as V²: double the voltage, four times the energy', () => {
    expect(relativeError(energyCV(uF, 20), 4 * energyCV(uF, 10))).toBeLessThan(1e-12);
  });

  it('series is never more than the smallest, parallel never less than the largest', () => {
    const cs = [1 * uF, 4 * uF, 10 * uF];
    expect(series(...cs)).toBeLessThan(1 * uF);
    expect(parallel(...cs)).toBeGreaterThan(10 * uF);
  });

  it('ε₀ is the formula sheet’s value', () => {
    expect(plateCapacitance(1, 1)).toBe(EPS0_DISPLAY);
  });
});
