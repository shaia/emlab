import { describe, expect, it } from 'vitest';
import { derivative, riemann } from '~/physics/calculus';
import { rcCharge } from '~/physics/circuits';
import { C_LIGHT, EPS0, MU0 } from '~/physics/constants';
import {
  acDisplacement,
  ampereMaxwell,
  ampereOld,
  capacitanceOf,
  discDisplacement,
  discFlux,
  gapField,
  gapFieldFromDEdt,
  gapState,
  leakyCurrents,
  leakyTimeConstant,
  plateArea,
  surfaceCurrents,
  timeConstant,
  type ChargingCapacitor,
} from '~/physics/displacement';
import { circulation, straightWireField } from '~/physics/magnetism';
import { relativeError, type Vec2 } from '~/physics/vec';

const cap: ChargingCapacitor = { emf: 12, R: 1e4, a: 0.1, d: 1e-3 };
const tau = timeConstant(cap);
const times = [0, 0.1, 0.5, 1, 2, 3.7].map((k) => k * tau);

/** The azimuthal field between the plates as a 2D vector field in the plane of a coaxial disc (axis = z). */
const gapFieldAt = (I: number, a: number) => (x: number, y: number): Vec2 => {
  const r = Math.hypot(x, y);
  if (r === 0) return [0, 0];
  const B = gapField(I, r, a);
  return [(-B * y) / r, (B * x) / r];
};
const circle = (r: number, n = 720): Vec2[] => Array.from({ length: n }, (_, k) => [r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n)] as Vec2);

describe('conservation: the displacement current between the plates equals the current in the wire', () => {
  it('ε₀·dΦ_E/dt through the whole gap equals I(t) at every instant', () => {
    for (const t of times) {
      const s = gapState(cap, t);
      expect(relativeError(s.Id, s.I)).toBeLessThan(1e-12);
    }
  });

  it('a numerical derivative of the flux, not the formula, gives the same current', () => {
    const flux = (t: number) => gapState(cap, t).flux;
    for (const t of times.slice(1)) {
      const Id = EPS0 * derivative(flux, t, 1e-4 * tau);
      expect(relativeError(Id, rcCharge(t, cap.emf, cap.R, capacitanceOf(cap)).I)).toBeLessThan(1e-6);
    }
  });

  it('both surfaces on one loop carry the same total current, around the wire and in the gap, for any radius', () => {
    const I = 3e-3;
    for (const r of [0.01, 0.05, 0.0999, 0.1, 0.17]) {
      for (const at of ['wire', 'gap'] as const) {
        const flat = surfaceCurrents(at, 'flat', r, 0.1, I);
        const bulge = surfaceCurrents(at, 'bulge', r, 0.1, I);
        expect(relativeError(ampereMaxwell(flat), ampereMaxwell(bulge))).toBeLessThan(1e-12);
      }
    }
  });

  it('without Maxwell\'s term the two surfaces around the wire disagree: μ₀I through one, zero through the other', () => {
    const I = 3e-3;
    expect(ampereOld(surfaceCurrents('wire', 'flat', 0.05, 0.1, I))).toBeCloseTo(MU0 * I, 15);
    expect(ampereOld(surfaceCurrents('wire', 'bulge', 0.05, 0.1, I))).toBe(0);
  });

  it('the circulation of the gap field around a coaxial circle is μ₀ times the displacement current inside it', () => {
    const s = gapState(cap, 0.4 * tau);
    for (const r of [0.03, 0.08, 0.15]) {
      const loop = circulation(gapFieldAt(s.I, cap.a), circle(r), 4);
      expect(relativeError(loop, MU0 * discDisplacement(s.dEdt, r, cap.a))).toBeLessThan(1e-4);
    }
  });

  it('Stokes: around a square inside the plates the circulation is μ₀ε₀·(dE/dt)·(area), whatever the shape', () => {
    const s = gapState(cap, 0.4 * tau);
    const h = 0.03;
    const square: Vec2[] = [[0.01, -0.02], [0.01 + h, -0.02], [0.01 + h, -0.02 + h], [0.01, -0.02 + h]];
    const loop = circulation(gapFieldAt(s.I, cap.a), square, 400);
    expect(relativeError(loop, MU0 * EPS0 * s.dEdt * h * h)).toBeLessThan(1e-6);
  });

  it('a leaky capacitor: conduction and displacement current cancel through every disc, so B = 0 in its gap', () => {
    for (const r of [0.01, 0.05, 0.1]) {
      const s = leakyCurrents(2e-3, r, 0.1);
      expect(s.conduction + s.displacement).toBe(0);
    }
  });
});

describe('analytic limits', () => {
  it('beyond the plates the field is that of the straight wire, μ₀I/(2πr)', () => {
    for (const r of [0.1, 0.2, 1]) expect(relativeError(gapField(5e-3, r, 0.1), straightWireField(5e-3, r))).toBeLessThan(1e-12);
  });

  it('the field is continuous at the plate edge r = a', () => {
    const a = 0.1;
    expect(relativeError(gapField(5e-3, a * (1 - 1e-9), a), gapField(5e-3, a, a))).toBeLessThan(1e-8);
  });

  it('on the axis the field is zero', () => {
    expect(gapField(5e-3, 0, 0.1)).toBe(0);
    expect(gapField(5e-3, 1e-12, 0.1)).toBeLessThan(1e-17);
  });

  it('inside, the Ampère–Maxwell field equals μ₀ε₀(r/2)·dE/dt = (r/2c²)·dE/dt', () => {
    const s = gapState(cap, 0.7 * tau);
    for (const r of [0.01, 0.05, 0.09]) {
      expect(relativeError(gapField(s.I, r, cap.a), gapFieldFromDEdt(s.dEdt, r))).toBeLessThan(1e-12);
      expect(relativeError(gapFieldFromDEdt(s.dEdt, r), (r * s.dEdt) / (2 * C_LIGHT ** 2))).toBeLessThan(1e-12);
    }
  });

  it('at the switch the displacement current is ε/R; long after, it dies away while the field is at its largest', () => {
    expect(relativeError(gapState(cap, 0).Id, cap.emf / cap.R)).toBeLessThan(1e-12);
    const late = gapState(cap, 30 * tau);
    expect(late.Id / (cap.emf / cap.R)).toBeLessThan(1e-12);
    expect(relativeError(late.E, cap.emf / cap.d)).toBeLessThan(1e-9);
  });

  it('a disc wider than the plates catches all the flux: Φ = q/ε₀ (Gauss)', () => {
    const s = gapState(cap, tau);
    expect(relativeError(discFlux(s.E, 0.3, cap.a), s.q / EPS0)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('inside the plates B grows linearly with r', () => {
    expect(relativeError(gapField(5e-3, 0.04, 0.1), 2 * gapField(5e-3, 0.02, 0.1))).toBeLessThan(1e-12);
  });

  it('doubling the current doubles B everywhere', () => {
    for (const r of [0.03, 0.2]) expect(relativeError(gapField(1e-2, r, 0.1), 2 * gapField(5e-3, r, 0.1))).toBeLessThan(1e-12);
  });

  it('plates twice as wide, same current: B at a fixed r inside drops to a quarter', () => {
    expect(relativeError(gapField(5e-3, 0.05, 0.2), gapField(5e-3, 0.05, 0.1) / 4)).toBeLessThan(1e-12);
  });

  it('a disc of half the plate radius carries a quarter of the displacement current', () => {
    const s = gapState(cap, tau);
    expect(relativeError(discDisplacement(s.dEdt, cap.a / 2, cap.a), s.Id / 4)).toBeLessThan(1e-12);
  });

  it('the leaky capacitor\'s time constant is ρε₀, independent of its plates', () => {
    const rho = 2e3;
    const A = plateArea(0.05);
    const d = 2e-3;
    expect(relativeError(((rho * d) / A) * ((EPS0 * A) / d), leakyTimeConstant(rho))).toBeLessThan(1e-12);
  });

  it('an AC capacitor: the displacement current is C·V₀·ω·cos(ωt), the derivative of the charge C·V₀·sin(ωt)', () => {
    const C = 2e-9;
    const V0 = 10;
    const w = 2 * Math.PI * 1e4;
    for (const t of [0, 1e-5, 3.3e-5]) {
      const dq = derivative((x) => C * V0 * Math.sin(w * x), t, 1e-9);
      expect(relativeError(acDisplacement(C, V0, w, t), dq)).toBeLessThan(1e-6);
    }
  });
});

describe('convergence', () => {
  it('summing I·Δt over the charging gives ε₀ times the change of flux, with midpoint error O(1/N²)', () => {
    const T = 2 * tau;
    const exact = EPS0 * gapState(cap, T).flux;
    const err = (n: number) => Math.abs(riemann((t) => gapState(cap, t).I, 0, T, n, 'mid') - exact) / exact;
    const e1 = err(20);
    const e2 = err(40);
    expect(e1).toBeLessThan(1e-3);
    expect(e1 / e2).toBeGreaterThan(3.8);
    expect(e1 / e2).toBeLessThan(4.2);
  });
});
