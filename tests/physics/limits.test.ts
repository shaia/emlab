import { describe, expect, it } from 'vitest';
import { K, MU0 } from '~/physics/constants';
import { logSlope } from '~/physics/dipole';
import { DISC, DIPOLE, LIMIT_CASES, limitError, limitRatio, RING, ROD, SOLENOID, suspectRatio, WIRE, type End } from '~/physics/limits';
import { relativeError } from '~/physics/vec';

const cases = Object.values(LIMIT_CASES);
const endX = (c: (typeof cases)[number], end: End) => (end === 'small' ? c.min : c.max);

describe('analytic limits', () => {
  for (const c of cases) {
    for (const end of ['small', 'large'] as const) {
      it(`${c.id}: the exact field reduces to its ${end}-end formula at that end`, () => {
        expect(limitError(c, end, endX(c, end))).toBeLessThan(0.006);
      });
    }
  }

  it('a solenoid at its centre is μ₀NI/√(L² + 4R²): the flat coil μ₀NI/(2R) and the long solenoid μ₀NI/L are its two ends', () => {
    const c = LIMIT_CASES.solenoid;
    for (const L of [0.01, 0.1, 1]) {
      expect(relativeError(c.exact(L), (MU0 * SOLENOID.N * SOLENOID.I) / Math.hypot(L, 2 * SOLENOID.R))).toBeLessThan(1e-12);
    }
  });

  it('the disc of radius R far away carries its whole charge σπR² as a point charge', () => {
    const R = 1e-3;
    expect(relativeError(LIMIT_CASES.disc.exact(R), (K * DISC.sigma * Math.PI * R * R) / DISC.z ** 2)).toBeLessThan(1e-3);
  });
});

describe('convergence: the error of each limit shrinks monotonically toward its end, as a power law', () => {
  for (const c of cases) {
    for (const end of ['small', 'large'] as const) {
      it(`${c.id}, ${end} end`, () => {
        // ten log-spaced points, walking from the middle of the range to the end
        const mid = Math.sqrt(c.min * c.max);
        const to = endX(c, end);
        const errs = Array.from({ length: 10 }, (_, i) => limitError(c, end, mid * (to / mid) ** ((i + 1) / 10)));
        for (let i = 1; i < errs.length; i++) expect(errs[i]).toBeLessThan(errs[i - 1]);
      });
    }
  }

  it('ring far away: the relative error is (3/2)(R/z)² to leading order', () => {
    for (const z of [2, 5]) expect(relativeError(limitError(LIMIT_CASES.ring, 'large', z), 1.5 * (RING.R / z) ** 2)).toBeLessThan(0.02);
  });

  it('wide disc: the relative error is z/R to leading order', () => {
    for (const R of [2, 8]) expect(relativeError(limitError(LIMIT_CASES.disc, 'large', R), DISC.z / R)).toBeLessThan(0.03);
  });

  it('long solenoid: the relative error at its centre is 2(R/L)² to leading order', () => {
    for (const L of [2, 6]) expect(relativeError(limitError(LIMIT_CASES.solenoid, 'large', L), 2 * (SOLENOID.R / L) ** 2)).toBeLessThan(0.02);
  });

  it('dipole far on its axis: the relative error is d²/(2r²) to leading order', () => {
    for (const r of [0.1, 0.5]) expect(relativeError(limitError(LIMIT_CASES.dipole, 'large', r), DIPOLE.d ** 2 / (2 * r * r))).toBeLessThan(0.02);
  });
});

describe('scaling: the slope of each log-log graph is the power of its limit', () => {
  const slope = (id: keyof typeof LIMIT_CASES, x: number) => logSlope(LIMIT_CASES[id].exact, x);
  it('ring far: −2 (a point charge); near the centre: +1 (linear in z)', () => {
    expect(slope('ring', 8)).toBeCloseTo(-2, 1);
    expect(slope('ring', 2e-3)).toBeCloseTo(1, 2);
  });
  it('short rod: +1 (E ∝ Q = λL); long rod: 0 (2kλ/r does not depend on L)', () => {
    expect(slope('rod', 2e-3)).toBeCloseTo(1, 2);
    expect(Math.abs(slope('rod', 8))).toBeLessThan(0.01);
  });
  it('small disc: +2 (E ∝ Q ∝ R²); wide disc: 0 (σ/2ε₀)', () => {
    expect(slope('disc', 2e-3)).toBeCloseTo(2, 2);
    expect(Math.abs(slope('disc', 8))).toBeLessThan(0.01);
  });
  it('flat coil: 0; long solenoid: −1 (μ₀NI/L)', () => {
    expect(Math.abs(slope('solenoid', 2e-3))).toBeLessThan(0.01);
    expect(slope('solenoid', 8)).toBeCloseTo(-1, 2);
  });
  it('short wire: +1; long wire: 0', () => {
    expect(slope('wire', 2e-3)).toBeCloseTo(1, 2);
    expect(Math.abs(slope('wire', 8))).toBeLessThan(0.01);
  });
  it('dipole far: −3, not −2', () => {
    expect(slope('dipole', 0.5)).toBeCloseTo(-3, 3);
  });
  it('doubling the source doubles every exact field (linearity)', () => {
    const double = (Q: number, z: number) => (K * 2 * Q * z) / (z * z + RING.R ** 2) ** 1.5;
    expect(relativeError(double(RING.Q, 0.2), 2 * LIMIT_CASES.ring.exact(0.2))).toBeLessThan(1e-12);
  });
});

describe('a suspect formula passes one end and fails the other', () => {
  for (const c of cases) {
    const pass = c.suspect.passes;
    const fail: End = pass === 'small' ? 'large' : 'small';
    it(`${c.id}: suspect agrees at the ${pass} end and misses at the ${fail} end`, () => {
      expect(Math.abs(suspectRatio(c, pass, endX(c, pass)) - 1)).toBeLessThan(0.01);
      expect(Math.abs(suspectRatio(c, fail, endX(c, fail)) - 1)).toBeGreaterThan(0.4);
    });
  }

  it('the flat-coil miss of the solenoid suspect is a factor of exactly 2', () => {
    expect(suspectRatio(LIMIT_CASES.solenoid, 'small', 1e-6)).toBeCloseTo(2, 6);
  });
  it('the long-wire miss of the wire suspect is a factor of exactly 1/2', () => {
    expect(suspectRatio(LIMIT_CASES.wire, 'large', 1e4)).toBeCloseTo(0.5, 6);
  });
  it('the rod suspect fades as 4kλ/L instead of levelling at 2kλ/r', () => {
    const L = 100;
    expect(relativeError(LIMIT_CASES.rod.suspect.f(L), (4 * K * ROD.lambda) / L)).toBeLessThan(1e-6);
  });
  it('the ring suspect gives kQ/R² at the centre, where the exact field is zero', () => {
    expect(LIMIT_CASES.ring.exact(0)).toBe(0);
    expect(relativeError(LIMIT_CASES.ring.suspect.f(0), (K * RING.Q) / RING.R ** 2)).toBeLessThan(1e-12);
  });
  it('the wire suspect is still a Biot–Savart element when short', () => {
    // both differ from one element only at order (L/s)²
    const L = 1e-4;
    expect(Math.abs(limitRatio(LIMIT_CASES.wire, 'small', L) - 1)).toBeLessThan((L / WIRE.s) ** 2);
    expect(Math.abs(suspectRatio(LIMIT_CASES.wire, 'small', L) - 1)).toBeLessThan((L / WIRE.s) ** 2);
  });
});
