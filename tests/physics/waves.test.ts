import { describe, expect, it } from 'vitest';
import { derivative } from '~/physics/calculus';
import { C_LIGHT, EPS0, MU0 } from '~/physics/constants';
import {
  amplitudeB,
  amplitudeFromIntensity,
  angularFrequency,
  capacitorEdgeFlow,
  capacitorEnergy,
  curlSides,
  energyDensity,
  energyDensityB,
  energyDensityE,
  intensity,
  intensityAtDistance,
  maxwellResiduals,
  meanEnergyDensity,
  meanPoynting,
  poynting,
  poyntingAt,
  solenoidB,
  solenoidWork,
  speedFromConstants,
  waveAt,
  waveNumber,
  wavelength,
  wireSurfaceFlow,
  type PlaneWave,
} from '~/physics/waves';
import { relativeError, type Vec3 } from '~/physics/vec';

const radio: PlaneWave = { E0: 20, f: 1e8 };
const T = 1 / radio.f;

describe('identities: the plane wave satisfies both curl equations of empty space only at v = c', () => {
  it('c follows from the constants of electricity and magnetism: 1/√(μ₀ε₀) = 3·10⁸ m/s', () => {
    expect(relativeError(speedFromConstants(), C_LIGHT)).toBeLessThan(1e-12);
  });

  it('the true wave satisfies Faraday (∇×E = −∂B/∂t) and Ampère–Maxwell (∇×B = μ₀ε₀∂E/∂t) at every point, numerically', () => {
    for (const t of [0, 0.13 * T, 0.6 * T]) {
      for (const dir of [1, -1] as const) {
        const r = maxwellResiduals({ ...radio, dir }, t);
        expect(r.faraday).toBeLessThan(1e-6);
        expect(r.ampere).toBeLessThan(1e-6);
      }
    }
  });

  it('a trial wave at the wrong speed keeps Faraday (B₀ = E₀/v) but breaks Ampère–Maxwell by 1 − v²/c²', () => {
    for (const k of [0.5, 0.8, 1.25]) {
      const r = maxwellResiduals({ ...radio, v: k * C_LIGHT }, 0.2 * T);
      expect(r.faraday).toBeLessThan(1e-6);
      // left = kB₀ = E₀k/v, right = μ₀ε₀ωE₀: their gap relative to the larger is |1 − (v/c)²| / max(1, (v/c)²)
      const expected = Math.abs(1 - k * k) / Math.max(1, k * k);
      expect(relativeError(r.ampere, expected)).toBeLessThan(1e-4);
    }
  });

  it('a B a quarter period out of step with E breaks both laws', () => {
    const r = maxwellResiduals({ ...radio, lag: Math.PI / 2 }, 0.1 * T);
    expect(r.faraday).toBeGreaterThan(0.5);
    expect(r.ampere).toBeGreaterThan(0.5);
  });

  it('the wave equation ∂²E/∂x² = μ₀ε₀·∂²E/∂t² holds for the true wave, and fails for a trial at 0.8c', () => {
    const second = (f: (s: number) => number, s0: number, h: number) => (f(s0 + h) - 2 * f(s0) + f(s0 - h)) / (h * h);
    for (const [v, holds] of [[C_LIGHT, true], [0.8 * C_LIGHT, false]] as const) {
      const w = { ...radio, v };
      const x0 = 0.3 * wavelength(w);
      const t0 = 0.05 * T;
      const Exx = second((x) => waveAt(w, x, t0).E, x0, wavelength(w) * 1e-3);
      const Ett = second((t) => waveAt(w, x0, t).E, t0, T * 1e-3);
      const err = relativeError(Exx, MU0 * EPS0 * Ett);
      if (holds) expect(err).toBeLessThan(1e-5);
      else expect(err).toBeGreaterThan(0.3);
    }
  });

  it('the electric and magnetic energy densities are equal at every point of the wave: u_E = u_B', () => {
    for (const x of [0.1, 0.77, 1.9]) {
      const { E, B } = waveAt(radio, x, 0.31 * T);
      expect(relativeError(energyDensityE(E), energyDensityB(B))).toBeLessThan(1e-12);
    }
  });

  it('the energy flows at c: S = u·c at every point, and S points along E×B', () => {
    for (const x of [0.2, 1.1, 2.4]) {
      const { E, B } = waveAt(radio, x, 0.4 * T);
      if (Math.abs(E) < 1e-6) continue;
      expect(relativeError(poyntingAt(radio, x, 0.4 * T), energyDensity(E, B) * C_LIGHT)).toBeLessThan(1e-12);
    }
    // E along y, B along z: S along +x; flipping B sends it along −x
    const S = poynting([0, 3, 0], [0, 0, 1e-8]);
    expect(S[0]).toBeGreaterThan(0);
    expect(Math.abs(S[1]) + Math.abs(S[2])).toBe(0);
    const back = { ...radio, dir: -1 as const };
    expect(poyntingAt(back, 0.4, 0.1 * T)).toBeLessThan(0);
  });

  it('E points along y and B along z for the wave: S has no sideways component (transverse wave)', () => {
    const { E, B } = waveAt(radio, 0.9, 0.2 * T);
    const S = poynting([0, E, 0] as Vec3, [0, 0, B] as Vec3);
    expect(S[1]).toBe(0);
    expect(S[2]).toBe(0);
  });

  it('a thinner resistor at the same V and I has a larger S on its surface, in inverse proportion to the radius', () => {
    expect(relativeError(wireSurfaceFlow(20, 4, 2.5e-4, 2).S, 2 * wireSurfaceFlow(20, 4, 5e-4, 2).S)).toBeLessThan(1e-12);
  });

  it('S·2πaL through the side of a resistor wire is the power VI, whatever its radius', () => {
    for (const a of [1e-4, 5e-4, 2e-3]) {
      const flow = wireSurfaceFlow(20, 4, a, 2);
      expect(relativeError(flow.power, 80)).toBeLessThan(1e-12);
    }
  });

  it('the Poynting flow into a charging capacitor equals the growth rate of ε₀E²/2 times its volume', () => {
    const flow = capacitorEdgeFlow(0.1, 1e-3, 5e3, 2e9);
    expect(relativeError(flow.power, flow.dUdt)).toBeLessThan(1e-12);
  });
});

describe('analytic limits', () => {
  it('E₀ = cB₀ for the true wave', () => {
    expect(relativeError(radio.E0 / amplitudeB(radio), C_LIGHT)).toBeLessThan(1e-12);
  });

  it('a crest moves at ω/k: following kx − ωt = π/2 from t to t + dt covers (ω/k)·dt', () => {
    const k = waveNumber(radio);
    const om = angularFrequency(radio.f);
    const crest = (t: number) => (Math.PI / 2 + om * t) / k;
    expect(relativeError(derivative(crest, 0.3 * T, 1e-3 * T), C_LIGHT)).toBeLessThan(1e-9);
    expect(waveAt(radio, crest(0.3 * T), 0.3 * T).E).toBeCloseTo(radio.E0, 9);
  });

  it('λ = c/f and λ·k = 2π', () => {
    expect(relativeError(wavelength(radio), 3)).toBeLessThan(1e-12);
    expect(relativeError(wavelength(radio) * waveNumber(radio), 2 * Math.PI)).toBeLessThan(1e-12);
  });

  it('the intensity is the time average of S over a period, cε₀E₀²/2, and equals c·⟨u⟩', () => {
    const N = 400;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += poyntingAt(radio, 0.37, ((i + 0.5) / N) * T);
    expect(relativeError(sum / N, intensity(radio.E0))).toBeLessThan(1e-9);
    expect(relativeError(intensity(radio.E0), C_LIGHT * meanEnergyDensity(radio.E0))).toBeLessThan(1e-12);
    expect(relativeError(meanPoynting(radio), intensity(radio.E0))).toBeLessThan(1e-12);
  });

  it('a B a quarter period out of step with E carries no energy on average: ⟨S⟩ = 0', () => {
    const w = { ...radio, lag: Math.PI / 2 };
    const N = 400;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += poyntingAt(w, 0.37, ((i + 0.5) / N) * T);
    expect(Math.abs(sum / N)).toBeLessThan(1e-12 * intensity(radio.E0) + 1e-15);
    expect(Math.abs(meanPoynting(w))).toBeLessThan(1e-12 * intensity(radio.E0));
  });

  it('sunlight at 1360 W/m²: E₀ ≈ 1.01·10³ V/m and B₀ ≈ 3.37 μT (3.38 with the engine ε₀); amplitudeFromIntensity inverts intensity', () => {
    const E0 = amplitudeFromIntensity(1360);
    expect(relativeError(E0, 1012)).toBeLessThan(2e-3);
    expect(relativeError(E0 / C_LIGHT, 3.375e-6)).toBeLessThan(2e-3);
    expect(relativeError(intensity(E0), 1360)).toBeLessThan(1e-12);
  });

  it('a capacitor stores ε₀E²/2 per unit volume: ½CV² = u_E·Ad', () => {
    const A = 0.02;
    const d = 1e-3;
    const V = 300;
    expect(relativeError(capacitorEnergy(A, d, V), energyDensityE(V / d) * A * d)).toBeLessThan(1e-12);
  });

  it('a 1 T field stores ≈ 4·10⁵ J/m³; a field of 3·10⁶ V/m (air breakdown) about 40 J/m³', () => {
    expect(relativeError(energyDensityB(1), 1 / (8 * Math.PI * 1e-7))).toBeLessThan(1e-12);
    expect(relativeError(energyDensityE(3e6), 39.8)).toBeLessThan(1e-3);
  });

  it('a lagging B reaches its crest a quarter period after E, at either direction of travel', () => {
    for (const dir of [1, -1] as const) {
      const w = { ...radio, dir, lag: Math.PI / 2 };
      const x = 0.4;
      // E at its crest at t₀; B at its crest (signed by dir) T/4 later
      const k = waveNumber(w);
      const om = angularFrequency(w.f);
      const t0 = (k * x - Math.PI / 2) / (dir * om);
      expect(waveAt(w, x, t0).E).toBeCloseTo(w.E0, 9);
      expect(relativeError(dir * waveAt(w, x, t0 + T / 4).B, amplitudeB(w))).toBeLessThan(1e-9);
    }
  });
});

describe('scaling', () => {
  it('doubling E₀ quadruples the intensity and the energy density', () => {
    expect(relativeError(intensity(40), 4 * intensity(20))).toBeLessThan(1e-12);
    expect(relativeError(meanEnergyDensity(40), 4 * meanEnergyDensity(20))).toBeLessThan(1e-12);
  });

  it('doubling the frequency halves the wavelength and leaves the speed and B₀ unchanged', () => {
    const w2 = { ...radio, f: 2 * radio.f };
    expect(relativeError(wavelength(w2), wavelength(radio) / 2)).toBeLessThan(1e-12);
    expect(relativeError(amplitudeB(w2), amplitudeB(radio))).toBeLessThan(1e-12);
  });

  it('twice as far from a point source, a quarter of the intensity and half the amplitude', () => {
    const I1 = intensityAtDistance(100, 5);
    const I2 = intensityAtDistance(100, 10);
    expect(relativeError(I2, I1 / 4)).toBeLessThan(1e-12);
    expect(relativeError(amplitudeFromIntensity(I2), amplitudeFromIntensity(I1) / 2)).toBeLessThan(1e-12);
  });

  it('the solenoid field grows linearly with the current, its energy as the square', () => {
    expect(relativeError(solenoidB(1000, 2), 2 * solenoidB(1000, 1))).toBeLessThan(1e-12);
    expect(relativeError(energyDensityB(solenoidB(1000, 2)), 4 * energyDensityB(solenoidB(1000, 1)))).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the work to ramp up a solenoid, summed step by step from Faraday\'s back-emf, converges to B²/(2μ₀)·Aℓ', () => {
    const n = 2000;
    const A = 4e-4;
    const len = 0.5;
    const I = 3;
    const exact = energyDensityB(solenoidB(n, I)) * A * len;
    let prev = Infinity;
    for (const steps of [4, 16, 64, 256]) {
      const err = relativeError(solenoidWork(n, A, len, I, steps), exact);
      expect(err).toBeLessThanOrEqual(prev);
      prev = err;
    }
    expect(prev).toBeLessThan(1e-4);
  });

  it('the central-difference curl reproduces the analytic slope ∂E/∂x = kE₀cos(kx − ωt)', () => {
    const x = 0.4;
    const t = 0.2 * T;
    const exact = waveNumber(radio) * radio.E0 * Math.cos(waveNumber(radio) * x - angularFrequency(radio.f) * t);
    const s = curlSides(radio, x, t);
    expect(relativeError(s.curlE, exact)).toBeLessThan(1e-6);
  });
});
