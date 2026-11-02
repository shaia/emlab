import { describe, expect, it } from 'vitest';
import { C_LIGHT, EPS0, K, MU0 } from '~/physics/constants';
import { lineField } from '~/physics/continuous';
import { straightWireField } from '~/physics/magnetism';
import {
  chargeFrameElectricForce,
  chargeFrameField,
  contractedLength,
  gammaSmallSpeed,
  labCurrent,
  labField,
  labMagneticForce,
  lorentzGamma,
  movingLineDensity,
  netLineDensity,
  netLineDensitySmallSpeed,
  relativeVelocity,
  restLineDensity,
  transverseForceInLab,
  wireSeenFrom,
} from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

const c = C_LIGHT;
const lambda0 = 1e-6; // C/m, the figure's thought-experiment wire
const r = 0.02;
const q = 1e-9;
/** speeds as fractions of c, both signs, including u = v (the charge rides with the electrons) */
const SPEEDS = [-0.9, -0.6, -0.25, -0.01, 0.01, 0.3, 0.6, 0.8, 0.95].map((b) => b * c);

describe('analytic limits: the Lorentz factor', () => {
  it('γ = 1 at rest, 1.25 at 0.6c and 5/3 at 0.8c (the 3-4-5 speeds)', () => {
    expect(lorentzGamma(0)).toBe(1);
    expect(relativeError(lorentzGamma(0.6 * c), 1.25)).toBeLessThan(1e-14);
    expect(relativeError(lorentzGamma(0.8 * c), 5 / 3)).toBeLessThan(1e-14);
    expect(lorentzGamma(-0.6 * c)).toBe(lorentzGamma(0.6 * c));
  });

  it('there is no frame at or beyond the speed of light: γ throws', () => {
    expect(() => lorentzGamma(c)).toThrow(RangeError);
    expect(() => lorentzGamma(-1.2 * c)).toThrow(RangeError);
  });

  it('a moving rod is shorter by γ, and a moving line of charges denser by γ', () => {
    expect(relativeError(contractedLength(1, 0.6 * c), 0.8)).toBeLessThan(1e-14);
    expect(relativeError(movingLineDensity(lambda0, 0.6 * c), 1.25 * lambda0)).toBeLessThan(1e-14);
    expect(relativeError(restLineDensity(movingLineDensity(lambda0, 0.8 * c), 0.8 * c), lambda0)).toBeLessThan(1e-14);
  });

  it('nothing reaches c by composing velocities, and light keeps speed c in every frame', () => {
    expect(Math.abs(relativeVelocity(-0.9 * c, 0.9 * c))).toBeLessThan(c);
    for (const v of SPEEDS) expect(relativeError(Math.abs(relativeVelocity(c, v)), c)).toBeLessThan(1e-12);
  });
});

describe('analytic limits: the lab frame is the textbook magnetic force', () => {
  it('the lab field is μ₀I/(2πr), with I = λ₀u', () => {
    const u = 0.6 * c;
    expect(relativeError(labCurrent(lambda0, u), -180)).toBeLessThan(1e-12);
    expect(relativeError(Math.abs(labField(lambda0, u, r)), straightWireField(labCurrent(lambda0, u), r))).toBeLessThan(1e-12);
  });

  it('the lab force is qvB, and currents parallel to the charge’s velocity attract it', () => {
    const u = -0.3 * c; // electrons move down, so the current flows up (+axis)
    const v = 0.5 * c; // the charge moves up, along the current
    const F = labMagneticForce(q, v, lambda0, u, r);
    expect(relativeError(Math.abs(F), q * v * straightWireField(labCurrent(lambda0, u), r))).toBeLessThan(1e-12);
    expect(F).toBeLessThan(0); // toward the wire
    expect(labMagneticForce(q, -v, lambda0, u, r)).toBeGreaterThan(0); // against the current: repelled
  });

  it('the charge-frame field is the infinite line charge 2kλ′/r of lesson 6.4', () => {
    const u = 0.6 * c;
    const v = 0.6 * c;
    expect(relativeError(chargeFrameField(lambda0, u, v, r), lineField(wireSeenFrom(lambda0, u, v).net, r))).toBeLessThan(1e-12);
  });
});

describe('identities: one force, two descriptions', () => {
  it('μ₀/(2π) = 2k/c², because μ₀ε₀ = 1/c²', () => {
    expect(relativeError(MU0 / (2 * Math.PI), (2 * K) / c ** 2)).toBeLessThan(1e-12);
    expect(relativeError(MU0 * EPS0, 1 / c ** 2)).toBeLessThan(1e-12);
  });

  it('the wire is neutral in the lab: v = 0 is the lab frame', () => {
    for (const u of SPEEDS) expect(Math.abs(wireSeenFrom(lambda0, u, 0).net)).toBeLessThan(1e-12 * lambda0);
  });

  it('without a current the wire is neutral in every frame: both lines contract alike', () => {
    for (const v of SPEEDS) {
      const w = wireSeenFrom(lambda0, 0, v);
      expect(Math.abs(w.net)).toBeLessThan(1e-12 * lambda0);
      expect(Math.abs(chargeFrameElectricForce(q, v, lambda0, 0, r))).toBeLessThan(1e-12 * Math.abs((q * 2 * K * lambda0) / r));
      expect(labMagneticForce(q, v, lambda0, 0, r) === 0).toBe(true);
    }
  });

  it('the net line charge in the charge’s frame is exactly γ(v)·λ₀·uv/c²', () => {
    for (const u of SPEEDS)
      for (const v of SPEEDS) {
        expect(relativeError(wireSeenFrom(lambda0, u, v).net, netLineDensity(lambda0, u, v))).toBeLessThan(1e-9);
      }
  });

  it('riding with the electrons (v = u): ions γλ₀, electrons λ₀/γ, net λ₀(γ − 1/γ) = γβ²λ₀', () => {
    const v = 0.6 * c;
    const w = wireSeenFrom(lambda0, v, v);
    expect(relativeError(w.ions, 1.25 * lambda0)).toBeLessThan(1e-12);
    expect(relativeError(w.electrons, -0.8 * lambda0)).toBeLessThan(1e-12);
    expect(Math.abs(w.electronVelocity)).toBeLessThan(1e-6);
    expect(relativeError(w.net, 1.25 * 0.36 * lambda0)).toBeLessThan(1e-12);
  });

  it('velocities compose so that γ(u′) = γ(u)γ(v)(1 − uv/c²)', () => {
    for (const u of SPEEDS)
      for (const v of SPEEDS) {
        const g = lorentzGamma(u) * lorentzGamma(v) * (1 - (u * v) / c ** 2);
        expect(relativeError(lorentzGamma(relativeVelocity(u, v)), g)).toBeLessThan(1e-9);
      }
  });

  it('transverse-force transformation: the electric force in the charge’s frame is γ(v) times the lab magnetic force', () => {
    for (const u of SPEEDS)
      for (const v of SPEEDS) {
        const F = labMagneticForce(q, v, lambda0, u, r);
        const Fp = chargeFrameElectricForce(q, v, lambda0, u, r);
        expect(relativeError(Fp, lorentzGamma(v) * F)).toBeLessThan(1e-9);
        expect(relativeError(transverseForceInLab(Fp, v), F)).toBeLessThan(1e-9);
      }
  });

  it('charge is invariant: λ·(spacing) is the same in both frames for each line', () => {
    const u = 0.8 * c;
    const v = -0.3 * c;
    const w = wireSeenFrom(lambda0, u, v);
    // the electrons' rest density, read back from either frame, is the same number
    expect(relativeError(restLineDensity(w.electrons, w.electronVelocity), restLineDensity(-lambda0, u))).toBeLessThan(1e-12);
    expect(relativeError(restLineDensity(w.ions, w.ionVelocity), lambda0)).toBeLessThan(1e-12);
  });
});

describe('small-speed limit: everyday speeds', () => {
  it('γ ≈ 1 + v²/(2c²), with an error that falls as (v/c)⁴', () => {
    for (const b of [1e-1, 3e-2, 1e-2]) {
      const err = lorentzGamma(b * c) - gammaSmallSpeed(b * c);
      expect(relativeError(err / b ** 4, 3 / 8)).toBeLessThan(0.02);
    }
  });

  it('for v, u ≪ c the two forces agree, F′/F − 1 ≈ v²/(2c²)', () => {
    for (const b of [1e-2, 1e-3]) {
      const v = b * c;
      const u = -2 * v;
      const ratio = chargeFrameElectricForce(q, v, lambda0, u, r) / labMagneticForce(q, v, lambda0, u, r);
      expect(relativeError(ratio - 1, b ** 2 / 2)).toBeLessThan(1e-3);
    }
  });

  it('λ′ ≈ −Iv/c² for small speeds: the net charge depends only on the current, not on λ₀ and u apart', () => {
    const v = 1e6;
    const I = 10;
    for (const l0 of [1.36e4, 1e2, 1]) {
      const u = -I / l0; // I = −λ₀u
      // the exact value carries the extra factor γ(v) ≈ 1 + v²/(2c²): 5.6·10⁻⁶ at 10⁶ m/s
      expect(relativeError(netLineDensity(l0, u, v), netLineDensitySmallSpeed(I, v))).toBeLessThan(1.01 * (v / c) ** 2 / 2);
    }
  });

  it('a real copper wire: 10 A drifting at ~0.7 mm/s gives λ′/λ₀ ≈ 10⁻¹⁵ for a charge at 10⁶ m/s', () => {
    const lam = 8.5e28 * 1.6e-19 * 1e-6; // n·e·A for 1 mm² of copper
    const u = 10 / lam;
    expect(relativeError(u, 7.35e-4)).toBeLessThan(1e-3);
    expect(relativeError(netLineDensity(lam, u, 1e6) / lam, 8.17e-15)).toBeLessThan(2e-3);
  });
});

describe('scaling', () => {
  it('both forces are proportional to the current, to the charge’s speed (at small speed) and to 1/r', () => {
    const u = -1e5;
    const v = 2e5;
    const F = (uu: number, vv: number, rr: number) => chargeFrameElectricForce(q, vv, lambda0, uu, rr);
    const L = (uu: number, vv: number, rr: number) => labMagneticForce(q, vv, lambda0, uu, rr);
    for (const f of [F, L]) {
      expect(relativeError(f(2 * u, v, r), 2 * f(u, v, r))).toBeLessThan(1e-6);
      expect(relativeError(f(u, 2 * v, r), 2 * f(u, v, r))).toBeLessThan(1e-6);
      expect(relativeError(f(u, v, 2 * r), f(u, v, r) / 2)).toBeLessThan(1e-12);
    }
  });

  it('reversing the charge’s velocity reverses the force in both frames', () => {
    for (const v of SPEEDS) {
      const u = 0.4 * c;
      expect(Math.sign(labMagneticForce(q, -v, lambda0, u, r))).toBe(-Math.sign(labMagneticForce(q, v, lambda0, u, r)));
      expect(Math.sign(chargeFrameElectricForce(q, -v, lambda0, u, r))).toBe(-Math.sign(chargeFrameElectricForce(q, v, lambda0, u, r)));
    }
  });
});
