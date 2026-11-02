import { describe, expect, it } from 'vitest';
import { E_CHARGE, M_PROTON } from '~/physics/constants';
import {
  bainbridgeRadius,
  crossedForceY,
  electricForceY,
  magneticForceY,
  traceSelector,
  type SelectorFields,
  type SelectorGeometry,
  type SelectorPath,
} from '~/physics/crossed-fields';
import { orbitRadius, selectorSpeed } from '~/physics/magnetism';
import { relativeError } from '~/physics/vec';

// the geometry of figure 4.7
const GEO: SelectorGeometry = {
  plateLength: 0.1,
  halfGap: 0.015,
  slitX: 0.11,
  slitHalf: 0.0015,
  sourceX: -0.03,
  box: { xMin: -0.035, xMax: 0.3, yMin: -0.2, yMax: 0.2 },
};
const E = 5e4; // V/m, pointing down (top plate +)
const B = 0.1; // T, ⊗
const SEL: SelectorFields = { Ey: -E, Bz: -B, B2z: null };
const V0 = selectorSpeed(E, B); // 5·10⁵ m/s

const ions = {
  proton: { q: E_CHARGE, m: M_PROTON },
  deuteron: { q: E_CHARGE, m: 2 * M_PROTON },
  alpha: { q: 2 * E_CHARGE, m: 4 * M_PROTON },
  // a negative ion with exactly the proton's mass, so a mirror image is exact
  antiproton: { q: -E_CHARGE, m: M_PROTON },
};

/** y where the path crosses x (linear interpolation between steps). */
function yAt(p: SelectorPath, x: number): number {
  for (let i = 1; i < p.points.length; i++) {
    const [x0, y0] = p.points[i - 1];
    const [x1, y1] = p.points[i];
    if (x0 <= x && x1 >= x) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  throw new Error(`the path never reaches x = ${x}`);
}

describe('analytic limit: the selection condition v = E/B', () => {
  it('the transverse force vanishes at v = E/B and nowhere else', () => {
    expect(crossedForceY(E_CHARGE, V0, -E, -B)).toBe(0);
    expect(crossedForceY(E_CHARGE, 1.2 * V0, -E, -B)).toBeGreaterThan(0);
    expect(crossedForceY(E_CHARGE, 0.8 * V0, -E, -B)).toBeLessThan(0);
  });

  it('top plate +, B ⊗: on a positive ion the electric force points down and the magnetic force up (palm rule)', () => {
    expect(electricForceY(E_CHARGE, -E)).toBeLessThan(0);
    expect(magneticForceY(E_CHARGE, V0, -B)).toBeGreaterThan(0);
    expect(relativeError(magneticForceY(E_CHARGE, V0, -B), -electricForceY(E_CHARGE, -E))).toBeLessThan(1e-12);
  });

  it('a proton, a deuteron, an alpha particle and a negative ion all pass straight at v = E/B', () => {
    for (const ion of Object.values(ions)) {
      const p = traceSelector(ion.q, ion.m, V0, GEO, SEL);
      expect(p.passed).toBe(true);
      expect(p.outcome).toBe('through');
      for (const [, y] of p.points) expect(Math.abs(y)).toBeLessThan(1e-12);
      expect(relativeError(p.endSpeed, V0)).toBeLessThan(1e-12);
    }
  });

  it('a slightly fast proton follows the exact trochoid y = (u/ω)(1 − cos ωt), u = v − E/B', () => {
    const v = 1.1 * V0;
    const { q, m } = ions.proton;
    const p = traceSelector(q, m, v, GEO, SEL, 2e-5);
    const w = (q * B) / m;
    const u = v - V0;
    // time at which the ion reaches the end of the plates, x(t) = (E/B)t + (u/ω)sin ωt = L
    let lo = 0;
    let hi = GEO.plateLength / V0;
    for (let k = 0; k < 80; k++) {
      const t = (lo + hi) / 2;
      if (V0 * t + (u / w) * Math.sin(w * t) < GEO.plateLength) lo = t;
      else hi = t;
    }
    const yExact = (u / w) * (1 - Math.cos(w * lo));
    expect(yExact).toBeGreaterThan(0);
    expect(relativeError(yAt(p, GEO.plateLength), yExact)).toBeLessThan(2e-3);
  });

  it('electric field alone: the proton bends down onto the plate; magnetic field alone: up', () => {
    const { q, m } = ions.proton;
    const eOnly = traceSelector(q, m, V0, GEO, { Ey: -E, Bz: 0, B2z: null });
    expect(eOnly.outcome).toBe('plate');
    expect(eOnly.end[1]).toBeLessThan(0);
    const bOnly = traceSelector(q, m, V0, GEO, { Ey: 0, Bz: -B, B2z: null });
    expect(bOnly.outcome).toBe('plate');
    expect(bOnly.end[1]).toBeGreaterThan(0);
  });

  it('reversing E makes both forces point the same way: no speed passes', () => {
    const { q, m } = ions.proton;
    for (const f of [0.5, 1, 1.5, 2]) {
      const p = traceSelector(q, m, f * V0, GEO, { Ey: +E, Bz: -B, B2z: null });
      expect(p.passed).toBe(false);
    }
  });
});

describe('direction: faster ions bend toward the magnetic force, slower toward the electric force', () => {
  it('for a proton: faster → up (magnetic side), slower → down (electric side)', () => {
    const { q, m } = ions.proton;
    const fast = traceSelector(q, m, 1.2 * V0, GEO, SEL);
    const slow = traceSelector(q, m, 0.8 * V0, GEO, SEL);
    expect(fast.passed).toBe(false);
    expect(slow.passed).toBe(false);
    expect(fast.end[1]).toBeGreaterThan(GEO.slitHalf);
    expect(slow.end[1]).toBeLessThan(-GEO.slitHalf);
  });

  it('a negative ion is the mirror image: both forces reverse together', () => {
    for (const f of [0.8, 1.2]) {
      const pos = traceSelector(ions.proton.q, ions.proton.m, f * V0, GEO, SEL);
      const neg = traceSelector(ions.antiproton.q, ions.antiproton.m, f * V0, GEO, SEL);
      expect(neg.outcome).toBe(pos.outcome);
      expect(relativeError(neg.end[1], -pos.end[1])).toBeLessThan(1e-12);
    }
  });
});

describe('scaling: the bending of a wrong speed grows with q/m', () => {
  it('while the transit is short next to the cyclotron period, half the q/m bends half as much', () => {
    // a 1 cm selector: ωt ≈ 0.19 rad for the proton, so the path is still the parabola ½(F/m)t²
    const short: SelectorGeometry = { ...GEO, plateLength: 0.01, slitX: 0.011 };
    const v = 1.05 * V0;
    const yp = yAt(traceSelector(ions.proton.q, ions.proton.m, v, short, SEL, 5e-6), 0.01);
    for (const ion of [ions.alpha, ions.deuteron]) {
      const y = yAt(traceSelector(ion.q, ion.m, v, short, SEL, 5e-6), 0.01);
      expect(relativeError(yp / y, 2)).toBeLessThan(0.02);
    }
  });

  it('the Bainbridge radius r = mE/(qBB′) agrees with r = mv/(qB′) at v = E/B, and scales with m/q', () => {
    for (const ion of Object.values(ions)) {
      expect(relativeError(bainbridgeRadius(ion.m, ion.q, E, B, 0.2), orbitRadius(ion.m, V0, ion.q, 0.2))).toBeLessThan(1e-12);
    }
    const rp = bainbridgeRadius(M_PROTON, E_CHARGE, E, B, 0.2);
    expect(relativeError(bainbridgeRadius(2 * M_PROTON, E_CHARGE, E, B, 0.2), 2 * rp)).toBeLessThan(1e-12);
    expect(relativeError(bainbridgeRadius(4 * M_PROTON, 2 * E_CHARGE, E, B, 0.2), 2 * rp)).toBeLessThan(1e-12);
    expect(relativeError(bainbridgeRadius(M_PROTON, E_CHARGE, 2 * E, B, 0.2), 2 * rp)).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('in the second stage the magnetic force does no work: the ion lands with its entry speed', () => {
    for (const ion of Object.values(ions)) {
      const p = traceSelector(ion.q, ion.m, V0, GEO, { ...SEL, B2z: -0.2 });
      expect(p.outcome).toBe('detector');
      expect(relativeError(p.endSpeed, V0)).toBeLessThan(1e-12);
    }
  });

  it('in the selector only the electric force does work: ½m(v² − v₀²) = qE_y·Δy', () => {
    const { q, m } = ions.proton;
    for (const f of [0.7, 1.3]) {
      const v = f * V0;
      const p = traceSelector(q, m, v, GEO, SEL, 2e-5);
      expect(p.outcome).toBe('plate');
      const dK = 0.5 * m * (p.endSpeed ** 2 - v ** 2);
      expect(relativeError(dK, q * -E * p.end[1])).toBeLessThan(5e-3);
    }
  });
});

describe('convergence: the detector position approaches 2r', () => {
  it('a selected proton lands 2r above the slit, an anti-proton 2r below; the error shrinks with the step', () => {
    const B2 = 0.2;
    const r = bainbridgeRadius(M_PROTON, E_CHARGE, E, B, B2);
    const err = (step: number) => {
      const p = traceSelector(E_CHARGE, M_PROTON, V0, GEO, { ...SEL, B2z: -B2 }, step);
      return relativeError(p.end[1], 2 * r);
    };
    const e1 = err(8e-4);
    const e2 = err(2e-4);
    expect(e2).toBeLessThan(e1);
    expect(e2).toBeLessThan(1e-3);
    const neg = traceSelector(-E_CHARGE, M_PROTON, V0, GEO, { ...SEL, B2z: -B2 });
    expect(neg.outcome).toBe('detector');
    expect(relativeError(neg.end[1], -2 * r)).toBeLessThan(1e-3);
  });
});
