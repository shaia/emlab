import { describe, expect, it } from 'vitest';
import {
  angularSpeed,
  brushEmf,
  coilAngle,
  cycleMean,
  cycleRms,
  drivePower,
  dragTorque,
  fluxPerTurn,
  GRID_FREQUENCY,
  GRID_RMS_VOLTAGE,
  instantPower,
  peakOfRms,
  periodOf,
  rectifiedMean,
  sidesEmf,
} from '~/physics/generator';
import { acMeanPower, emfOf, generatorEmf, generatorFlux, generatorPeak, rms, type Generator } from '~/physics/induction';
import { relativeError } from '~/physics/vec';

// the figure's coil: 200 turns of 8 cm × 5 cm in 0.5 T, one turn per second, into a 10 Ω lamp
const a = 0.08;
const b = 0.05;
const g: Generator = { N: 200, B: 0.5, A: a * b, omega: angularSpeed(1) };
const R = 10;
const T = periodOf(g.omega);
const e0 = generatorPeak(g);
const times = Array.from({ length: 37 }, (_, k) => (k / 36) * T);

describe('analytic limit: what the brushes deliver', () => {
  it('slip rings pass the coil emf unchanged, positive and negative in turn', () => {
    for (const t of times) expect(brushEmf(g, t, 'slip')).toBe(generatorEmf(g, t));
    expect(brushEmf(g, T / 4, 'slip')).toBeCloseTo(e0, 9);
    expect(brushEmf(g, (3 * T) / 4, 'slip')).toBeCloseTo(-e0, 9);
  });

  it('the split ring gives |ε|: never negative, the same peak, and zero exactly where the flux is largest', () => {
    for (const t of times) {
      const out = brushEmf(g, t, 'split');
      expect(out).toBeGreaterThanOrEqual(0);
      expect(Math.abs(out - Math.abs(generatorEmf(g, t)))).toBeLessThan(1e-12 * e0);
    }
    expect(brushEmf(g, 0, 'split')).toBe(0);
    expect(Math.abs(fluxPerTurn(g, 0))).toBeCloseTo(g.B * g.A, 12);
    expect(Math.abs(brushEmf(g, T / 2, 'split'))).toBeLessThan(1e-12 * e0);
  });

  it('the split-ring output repeats every half period; the slip-ring output only every full period', () => {
    for (const t of times) {
      expect(Math.abs(brushEmf(g, t + T / 2, 'split') - brushEmf(g, t, 'split'))).toBeLessThan(1e-9 * e0);
      expect(Math.abs(brushEmf(g, t + T, 'slip') - brushEmf(g, t, 'slip'))).toBeLessThan(1e-9 * e0);
    }
    expect(relativeError(brushEmf(g, T / 4 + T / 2, 'slip'), -brushEmf(g, T / 4, 'slip'))).toBeLessThan(1e-12);
  });

  it('the emf is largest when the coil plane is along B (zero flux) and zero when the flux is largest', () => {
    // plane along B: the normal at 90° from B
    const tPlaneAlong = T / 4;
    expect(Math.abs(fluxPerTurn(g, tPlaneAlong))).toBeLessThan(1e-15);
    expect(relativeError(generatorEmf(g, tPlaneAlong), e0)).toBeLessThan(1e-12);
    expect(Math.abs(generatorEmf(g, 0))).toBe(0);
  });

  it('the moving sides give the same emf as the changing flux, at every angle', () => {
    for (const t of times) {
      const e = generatorEmf(g, t);
      const s = sidesEmf(g.N, g.B, a, b, g.omega, coilAngle(g, t));
      expect(Math.abs(s - e)).toBeLessThan(1e-12 * e0);
    }
  });

  it('the mean of the split-ring output is 2ε₀/π, below the effective value ε₀/√2', () => {
    const m = cycleMean((t) => brushEmf(g, t, 'split'), T, 20000);
    expect(relativeError(m, rectifiedMean(e0))).toBeLessThan(1e-6);
    expect(rectifiedMean(e0)).toBeLessThan(rms(e0));
  });

  it('the grid: 230 V effective is a peak of about 325 V, and 50 Hz is a period of 20 ms', () => {
    expect(relativeError(peakOfRms(GRID_RMS_VOLTAGE), 325.27)).toBeLessThan(1e-4);
    expect(relativeError(periodOf(angularSpeed(GRID_FREQUENCY)), 0.02)).toBeLessThan(1e-12);
    expect(relativeError(rms(peakOfRms(GRID_RMS_VOLTAGE)), GRID_RMS_VOLTAGE)).toBeLessThan(1e-12);
  });
});

describe('conservation: energy through the generator', () => {
  it('the drag torque of the induced current always opposes the rotation (Lenz), in either sense of turning', () => {
    for (const omega of [g.omega, -g.omega]) {
      const gg = { ...g, omega };
      for (const t of times) {
        const tau = dragTorque(gg, R, t);
        expect(tau * omega).toBeLessThanOrEqual(1e-15);
      }
    }
  });

  it('the drive supplies exactly the power the lamp takes, ε²/R, at every instant', () => {
    for (const t of times) {
      const p = instantPower(generatorEmf(g, t), R);
      expect(Math.abs(drivePower(g, R, t) - p)).toBeLessThan(1e-12 * instantPower(e0, R));
    }
  });

  it('over a cycle the drive and the lamp both average ε₀²/(2R), half the peak power', () => {
    const lamp = cycleMean((t) => instantPower(brushEmf(g, t, 'slip'), R), T);
    const drive = cycleMean((t) => drivePower(g, R, t), T);
    expect(relativeError(lamp, acMeanPower(e0, R))).toBeLessThan(1e-12);
    expect(relativeError(drive, acMeanPower(e0, R))).toBeLessThan(1e-12);
    expect(relativeError(acMeanPower(e0, R), instantPower(e0, R) / 2)).toBeLessThan(1e-12);
  });

  it('a commutator does not change the power: the lamp gets ε², whatever the sign', () => {
    const split = cycleMean((t) => instantPower(brushEmf(g, t, 'split'), R), T);
    expect(relativeError(split, acMeanPower(e0, R))).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the mean of sin² over a long window tends to ½ whatever the window, the error falling as 1/window', () => {
    const f = (t: number) => Math.sin(g.omega * t) ** 2;
    const errs = [1.3, 10.3, 100.3].map((k) => Math.abs(cycleMean(f, k * T, 40000) - 0.5));
    expect(errs[0]).toBeGreaterThan(1e-3);
    expect(errs[1] / errs[0]).toBeLessThan(0.15);
    expect(errs[2] / errs[1]).toBeLessThan(0.15);
    expect(errs[2]).toBeLessThan(1e-3);
  });

  it('the numerical effective value of ε over whole cycles is ε₀/√2, and the mean of ε is zero', () => {
    const e = (t: number) => generatorEmf(g, t);
    expect(relativeError(cycleRms(e, T, 12), rms(e0))).toBeLessThan(1e-12);
    expect(Math.abs(cycleMean(e, 3 * T, 300))).toBeLessThan(1e-12 * e0);
  });

  it('the slope of the flux graph, read numerically, converges to the emf as the step shrinks', () => {
    const phi = (t: number) => generatorFlux(g, t) / g.N;
    const t0 = 0.13 * T;
    const exact = generatorEmf(g, t0);
    const e1 = Math.abs(emfOf(phi, t0, g.N, 1e-2) - exact);
    const e2 = Math.abs(emfOf(phi, t0, g.N, 5e-3) - exact);
    expect(e2 / e1).toBeLessThan(0.3);
    expect(relativeError(emfOf(phi, t0, g.N, 1e-5), exact)).toBeLessThan(1e-6);
  });
});

describe('scaling (the dimensional proxy)', () => {
  it('turning twice as fast doubles the peak and halves the period; the flux does not change', () => {
    const g2 = { ...g, omega: 2 * g.omega };
    expect(relativeError(generatorPeak(g2), 2 * e0)).toBeLessThan(1e-12);
    expect(relativeError(periodOf(g2.omega), T / 2)).toBeLessThan(1e-12);
    expect(fluxPerTurn(g2, 0)).toBe(fluxPerTurn(g, 0));
  });

  it('the mean power goes as the square of the peak: twice the turns, four times the power', () => {
    const g2 = { ...g, N: 2 * g.N };
    expect(relativeError(acMeanPower(generatorPeak(g2), R), 4 * acMeanPower(e0, R))).toBeLessThan(1e-12);
    expect(relativeError(rms(generatorPeak(g2)), 2 * rms(e0))).toBeLessThan(1e-12);
  });

  it('the effective value has the units of the emf: ε_rms²/R is a power, equal to ε₀²/(2R)', () => {
    expect(relativeError(rms(e0) ** 2 / R, acMeanPower(e0, R))).toBeLessThan(1e-12);
  });
});
