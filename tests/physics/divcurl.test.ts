import { describe, expect, it } from 'vitest';
import { EPS0, K, MU0 } from '~/physics/constants';
import {
  analyticLimit,
  boxReading,
  enclosesSingularity,
  FIELDS,
  GRADED_J0,
  gradedRodField,
  LINE_LAMBDA,
  loopReading,
  ratioCurve,
  ROD_R,
  ROD_RHO,
  rodField,
  SLAB_D,
  SLAB_J,
  splitProbe,
  THICK_I,
  thickWireB,
  WIRE_I,
} from '~/physics/divcurl';
import { relativeError } from '~/physics/vec';
import { curl2, divergence2, lineSource2 } from '~/physics/vectorcalc';

describe('analytic limits', () => {
  it('inside a uniformly charged rod the shrinking box reads ∇·E = ρ/ε₀, outside it reads 0', () => {
    const F = FIELDS.rod.F;
    const b = boxReading(F, 0.02, -0.01, 1e-3);
    expect(relativeError(b.ratio, ROD_RHO / EPS0)).toBeLessThan(1e-6);
    expect(relativeError(b.limit, ROD_RHO / EPS0)).toBeLessThan(1e-6);
    expect(Math.abs(boxReading(F, 0.08, 0.03, 1e-3).limit)).toBeLessThan(1e-6 * (ROD_RHO / EPS0));
  });

  it('at the centre of the rod E = 0, yet ∇·E = ρ/ε₀ (zero field is not zero divergence)', () => {
    const F = FIELDS.rod.F;
    expect(F(0, 0)).toEqual([0, 0]);
    expect(relativeError(boxReading(F, 0, 0, 0.01).ratio, ROD_RHO / EPS0)).toBeLessThan(1e-9);
  });

  it('in the graded rod the box ratio tends to ρ(s)/ε₀ = ρ₀s/(Rε₀)', () => {
    const f = FIELDS.graded;
    const r = boxReading(f.F, 0.03, 0.01, 2e-4).ratio;
    expect(relativeError(r, f.density(0.03, 0.01) / EPS0)).toBeLessThan(1e-4);
    expect(relativeError(analyticLimit(f, 0.03, 0.01, 'box'), f.density(0.03, 0.01) / EPS0)).toBe(0);
  });

  it('inside a thick wire with uniform J the shrinking loop reads ∇×B = μ₀J; outside, 0', () => {
    const F = FIELDS.thick.F;
    const J = THICK_I / (Math.PI * ROD_R ** 2);
    expect(relativeError(loopReading(F, 0.01, 0.02, 1e-3).ratio, MU0 * J)).toBeLessThan(1e-6);
    expect(Math.abs(loopReading(F, 0.09, 0.02, 1e-3).limit)).toBeLessThan(1e-6 * MU0 * J);
  });

  it('a slab of current: straight parallel B lines, curl μ₀J inside, 0 outside', () => {
    const F = FIELDS.slab.F;
    expect(F(0.05, 0.01)[1]).toBe(0);
    expect(relativeError(loopReading(F, 0.07, 0.005, 0.01).ratio, MU0 * SLAB_J)).toBeLessThan(1e-9);
    expect(loopReading(F, 0, SLAB_D + 0.02, 0.01).circulation).toBeCloseTo(0, 15);
    // B just outside the slab is μ₀Jd, the infinite-sheet value μ₀K/2 with K = 2Jd
    expect(relativeError(Math.abs(F(0, 0.1)[0]), (MU0 * 2 * SLAB_J * SLAB_D) / 2)).toBeLessThan(1e-12);
  });

  it('the rod field outside is the line-charge field 2kλ/s with λ = ρπR²', () => {
    const lam = ROD_RHO * Math.PI * ROD_R ** 2;
    const e = rodField(ROD_RHO, ROD_R)(0.1, 0);
    expect(relativeError(e[0], (2 * K * lam) / 0.1)).toBeLessThan(1e-12);
  });

  it('the thick wire outside is the thin wire μ₀I/(2πs); the graded wire carries the same total current', () => {
    expect(relativeError(thickWireB(THICK_I, ROD_R)(0.1, 0)[1], (MU0 * THICK_I) / (2 * Math.PI * 0.1))).toBeLessThan(1e-12);
    expect(relativeError((2 * Math.PI * GRADED_J0 * ROD_R ** 2) / 3, THICK_I)).toBeLessThan(1e-12);
    expect(relativeError(FIELDS.gradedWire.F(0.1, 0)[1], (MU0 * THICK_I) / (2 * Math.PI * 0.1))).toBeLessThan(1e-12);
  });
});

describe('conservation and identities', () => {
  it('Gauss on a box around the line charge: flux = λa/ε₀ whatever the size or position, so Φ/V grows like 1/a²', () => {
    const F = lineSource2(LINE_LAMBDA);
    for (const [cx, cy, a] of [
      [0.001, -0.002, 0.02],
      [0.01, 0.005, 0.04],
    ]) {
      const b = boxReading(F, cx, cy, a, 400);
      expect(relativeError(b.flux, (LINE_LAMBDA * a) / EPS0)).toBeLessThan(2e-3);
      expect(enclosesSingularity(FIELDS.line, cx, cy, a)).toBe(true);
    }
    expect(enclosesSingularity(FIELDS.line, 0.03, 0, 0.02)).toBe(false);
  });

  it('a box beside the line charge has zero net flux although E is strong there (∇·E = 0 is not E = 0)', () => {
    const F = lineSource2(LINE_LAMBDA);
    const b = boxReading(F, 0.03, 0.01, 0.02, 200);
    const E = Math.hypot(...F(0.03, 0.01));
    expect(Math.abs(b.flux) / (E * 0.02 * 0.02)).toBeLessThan(1e-4);
  });

  it('a box in the uniform field: flux in on one face, out on the other, net zero', () => {
    expect(boxReading(FIELDS.uniform.F, 0.04, -0.03, 0.05).flux).toBeCloseTo(0, 12);
  });

  it('electrostatic E has zero circulation round any loop, even one round the line charge (∇×E = 0)', () => {
    const F = lineSource2(LINE_LAMBDA);
    const scale = Math.hypot(...F(0.02, 0)) * 0.04;
    expect(Math.abs(loopReading(F, 0.003, -0.004, 0.04, 400).circulation) / scale).toBeLessThan(1e-6);
    expect(Math.abs(loopReading(FIELDS.rod.F, 0.02, 0.01, 0.03).circulation) / scale).toBeLessThan(1e-6);
    // central differences of a field of ~10⁴ N/C: compare with the field's own scale, |E|/s
    const Eg = Math.hypot(...FIELDS.graded.F(0.03, 0.02)) / Math.hypot(0.03, 0.02);
    expect(Math.abs(curl2(FIELDS.graded.F, 0.03, 0.02)) / Eg).toBeLessThan(1e-6);
  });

  it('Ampère: a loop round the thin wire has circulation μ₀I; one beside it, zero, though the lines are circles', () => {
    const F = FIELDS.wire.F;
    expect(relativeError(loopReading(F, 0.002, 0.001, 0.03, 400).circulation, MU0 * WIRE_I)).toBeLessThan(2e-3);
    const beside = loopReading(F, 0.05, 0.02, 0.02, 200);
    expect(Math.abs(beside.circulation) / (MU0 * WIRE_I)).toBeLessThan(1e-5);
    expect(Math.abs(beside.limit)).toBeLessThan(1e-9);
  });

  it('divergence theorem: the N×N small boxes’ fluxes add up to the big box’s flux (inner faces cancel)', () => {
    for (const id of ['rod', 'graded', 'line'] as const) {
      const s = splitProbe(FIELDS[id].F, 0.031, 0.012, 0.06, 4, 'box');
      expect(s.parts).toHaveLength(16);
      expect(relativeError(s.sum, s.whole)).toBeLessThan(1e-9);
    }
  });

  it('Stokes: the N×N small loops’ circulations add up to the big loop’s (shared edges cancel)', () => {
    for (const id of ['thick', 'slab', 'wire'] as const) {
      const s = splitProbe(FIELDS[id].F, 0.021, -0.013, 0.05, 3, 'loop');
      expect(relativeError(s.sum, s.whole)).toBeLessThan(1e-9);
    }
  });

  it('the divergence theorem as an integral: the flux out of a box inside the rod is (ρ/ε₀)·volume', () => {
    const b = boxReading(FIELDS.rod.F, 0.01, 0.005, 0.04);
    expect(relativeError(b.flux, (ROD_RHO / EPS0) * 0.04 ** 3)).toBeLessThan(1e-9);
  });
});

describe('scaling', () => {
  it('doubling ρ doubles ∇·E; doubling I doubles ∇×B', () => {
    const d1 = divergence2(rodField(ROD_RHO, ROD_R), 0.02, 0.01, 1e-6);
    const d2 = divergence2(rodField(2 * ROD_RHO, ROD_R), 0.02, 0.01, 1e-6);
    expect(relativeError(d2, 2 * d1)).toBeLessThan(1e-6);
    const c1 = curl2(thickWireB(THICK_I, ROD_R), 0.02, 0.01, 1e-6);
    const c2 = curl2(thickWireB(2 * THICK_I, ROD_R), 0.02, 0.01, 1e-6);
    expect(relativeError(c2, 2 * c1)).toBeLessThan(1e-6);
  });

  it('for a field linear in x and y (the uniform rod, the slab) the ratio does not depend on the probe size', () => {
    const big = boxReading(FIELDS.rod.F, 0, 0, 0.06).ratio;
    const small = boxReading(FIELDS.rod.F, 0, 0, 0.006).ratio;
    expect(relativeError(big, small)).toBeLessThan(1e-9);
    const lb = loopReading(FIELDS.slab.F, 0, 0, 0.05).ratio;
    const ls = loopReading(FIELDS.slab.F, 0, 0, 0.005).ratio;
    expect(relativeError(lb, ls)).toBeLessThan(1e-9);
  });

  it('the line charge’s box ratio, when the box holds the line, grows like 1/a² as the box shrinks', () => {
    const r1 = boxReading(FIELDS.line.F, 0, 0, 0.04, 400).ratio;
    const r2 = boxReading(FIELDS.line.F, 0, 0, 0.02, 400).ratio;
    expect(relativeError(r2 / r1, 4)).toBeLessThan(5e-3);
  });
});

describe('convergence', () => {
  it('graded rod: the box ratio converges to ρ/ε₀ at the centre point, with error O(a²)', () => {
    const f = FIELDS.graded;
    const [x, y] = [0.03, 0.01];
    const target = f.density(x, y) / EPS0;
    const err = (a: number) => Math.abs(boxReading(f.F, x, y, a, 200).ratio - target);
    const e1 = err(0.016);
    const e2 = err(0.008);
    expect(e1 / e2).toBeGreaterThan(3.5);
    expect(e1 / e2).toBeLessThan(4.5);
  });

  it('graded wire: the loop ratio converges to μ₀J at the centre point, with error O(a²)', () => {
    const f = FIELDS.gradedWire;
    const [x, y] = [0.02, -0.025];
    const target = MU0 * f.density(x, y);
    const err = (a: number) => Math.abs(loopReading(f.F, x, y, a, 200).ratio - target);
    const r = err(0.016) / err(0.008);
    expect(r).toBeGreaterThan(3.5);
    expect(r).toBeLessThan(4.5);
  });

  it('the ratio curve ends near the derivative value as a → 0', () => {
    const c = ratioCurve(gradedRodField(1.5e-6, ROD_R), 0.03, 0.01, 'box', 0.001, 0.05);
    expect(c).toHaveLength(41);
    expect(relativeError(c[0][1], FIELDS.graded.density(0.03, 0.01) / EPS0)).toBeLessThan(1e-3);
  });
});
