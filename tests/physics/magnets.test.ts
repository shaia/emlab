import { describe, expect, it } from 'vitest';
import { MU0 } from '~/physics/constants';
import { EARTH_B_HORIZONTAL, traceLine } from '~/physics/magnetism';
import {
  barMagnetField,
  breakMagnet,
  deflectionFromNorth,
  insideMagnet,
  magnetsFieldAt,
  needleAngle,
  poles,
  sumOfTwo,
  type BarMagnet,
} from '~/physics/magnets';
import { relativeError, type Vec2 } from '~/physics/vec';

const BAR: BarMagnet = { x: 0, y: 0, angle: 0, L: 0.12, R: 0.025, NI: 1500 };
const len = (b: Vec2) => Math.hypot(b[0], b[1]);
/** dipole moment of the solenoid stand-in, m = NI·πR² */
const moment = (m: BarMagnet) => m.NI * Math.PI * m.R * m.R;

describe('analytic limits', () => {
  it('far along its axis a bar magnet is a dipole: B → μ₀m/(2πd³), pointing from S to N', () => {
    const d = 1.2;
    const B = barMagnetField(BAR, d, 0);
    expect(relativeError(B[0], (MU0 * moment(BAR)) / (2 * Math.PI * d ** 3))).toBeLessThan(0.01);
    expect(Math.abs(B[1])).toBeLessThan(1e-6 * Math.abs(B[0]));
  });

  it('far on its perpendicular bisector the field is half as strong and points from N to S', () => {
    const d = 1.2;
    const B = barMagnetField(BAR, 0, d);
    expect(relativeError(-B[0], (MU0 * moment(BAR)) / (4 * Math.PI * d ** 3))).toBeLessThan(0.01);
  });

  it('inside the bar the field runs from S to N, and it is weaker than a long solenoid of the same NI/L', () => {
    const B = barMagnetField(BAR, 0, 0);
    const long = (MU0 * BAR.NI) / BAR.L;
    expect(B[0]).toBeGreaterThan(0.8 * long);
    expect(B[0]).toBeLessThan(long);
  });

  it('a compass needle points along B: its north end points the way the field points', () => {
    expect(needleAngle([0, 1e-5])).toBeCloseTo(Math.PI / 2, 12);
    expect(needleAngle([-2e-5, 0])).toBeCloseTo(Math.PI, 12);
  });

  it('perpendicular fields: tanθ = B_m/B_E, and equal fields turn the needle 45°', () => {
    expect(deflectionFromNorth(EARTH_B_HORIZONTAL, EARTH_B_HORIZONTAL)).toBeCloseTo(Math.PI / 4, 12);
    expect(Math.tan(deflectionFromNorth(2e-5, EARTH_B_HORIZONTAL))).toBeCloseTo(2e-5 / EARTH_B_HORIZONTAL, 12);
    const r = sumOfTwo(3e-5, 4e-5, Math.PI / 2);
    expect(relativeError(r.B, 5e-5)).toBeLessThan(1e-12);
    expect(sumOfTwo(3e-5, 3e-5, Math.PI).B).toBeLessThan(1e-18);
  });
});

describe('conservation (no magnetic poles on their own)', () => {
  it('a field line seeded inside the magnet closes on itself through the magnet', () => {
    const bounds = { xmin: -2, xmax: 2, ymin: -2, ymax: 2 };
    for (const v of [-0.012, 0.006, 0.015]) {
      const line = traceLine((x, y) => barMagnetField(BAR, x, y), [0, v], { bounds, step: 0.003, maxSteps: 6000 });
      expect(line.end).toBe('closed');
      // it leaves through the N end and comes back through the S end
      expect(Math.max(...line.points.map((p) => p[0]))).toBeGreaterThan(BAR.L / 2);
      expect(Math.min(...line.points.map((p) => p[0]))).toBeLessThan(-BAR.L / 2);
    }
  });

  it('breaking a magnet gives two whole magnets: the field in the crack still runs from S to N', () => {
    const [a, b] = breakMagnet(BAR, 0.04);
    expect(a.L).toBeCloseTo(BAR.L / 2, 12);
    expect(a.NI / a.L).toBeCloseTo(BAR.NI / BAR.L, 9);
    expect(poles(a).N[0]).toBeLessThan(poles(b).S[0]);
    const crack = magnetsFieldAt([a, b], 0, 0);
    expect(crack[0]).toBeGreaterThan(0);
    // and each half has its own closed lines
    const bounds = { xmin: -2, xmax: 2, ymin: -2, ymax: 2 };
    const line = traceLine((x, y) => barMagnetField(b, x, y), [b.x, 0.01], { bounds, step: 0.002, maxSteps: 6000 });
    expect(line.end).toBe('closed');
  });

  it('like poles facing each other: the fields cancel midway (a null point); unlike poles add', () => {
    const left: BarMagnet = { ...BAR, x: -0.16 };
    const like = magnetsFieldAt([left, { ...BAR, x: 0.16, angle: Math.PI }], 0, 0);
    expect(len(like)).toBeLessThan(1e-9 * len(barMagnetField(left, 0, 0)));
    const unlike = magnetsFieldAt([left, { ...BAR, x: 0.16 }], 0, 0);
    expect(relativeError(unlike[0], 2 * barMagnetField(left, 0, 0)[0])).toBeLessThan(1e-12);
  });
});

describe('scaling (the dimensional proxy)', () => {
  it('B is proportional to NI, and doubling the distance far away divides B by 8', () => {
    const p: Vec2 = [0.9, 0.4];
    const b1 = barMagnetField(BAR, ...p);
    const b2 = barMagnetField({ ...BAR, NI: 2 * BAR.NI }, ...p);
    expect(relativeError(len(b2), 2 * len(b1))).toBeLessThan(1e-12);
    const near = len(barMagnetField(BAR, 1.5, 0));
    const far = len(barMagnetField(BAR, 3, 0));
    expect(relativeError(near / far, 8)).toBeLessThan(0.01);
  });

  it('rotating the magnet rotates its field with it (flipping it reverses the field)', () => {
    const rot = Math.PI / 3;
    const p: Vec2 = [0.2, 0.05];
    const B = barMagnetField(BAR, ...p);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const q: Vec2 = [c * p[0] - s * p[1], s * p[0] + c * p[1]];
    const Br = barMagnetField({ ...BAR, angle: rot }, ...q);
    expect(relativeError(Br[0], c * B[0] - s * B[1])).toBeLessThan(1e-9);
    expect(relativeError(Br[1], s * B[0] + c * B[1])).toBeLessThan(1e-9);
    const flipped = barMagnetField({ ...BAR, angle: Math.PI }, ...p);
    expect(relativeError(flipped[0], -barMagnetField(BAR, -p[0], -p[1])[0])).toBeLessThan(1e-9);
  });

  it('a uniform field adds as a vector', () => {
    const p: Vec2 = [0.1, 0.15];
    const with_ = magnetsFieldAt([BAR], ...p, [0, EARTH_B_HORIZONTAL]);
    const without = magnetsFieldAt([BAR], ...p);
    expect(relativeError(with_[1] - without[1], EARTH_B_HORIZONTAL)).toBeLessThan(1e-9);
  });

  it('the rectangle test follows the rotation', () => {
    const m: BarMagnet = { ...BAR, angle: Math.PI / 2 };
    expect(insideMagnet(m, 0, 0.055)).toBe(true);
    expect(insideMagnet(m, 0.055, 0)).toBe(false);
  });
});

describe('convergence', () => {
  it('the field outside the bar converges as the number of loops grows (16 loops is within 1%)', () => {
    const p: Vec2 = [0.1, 0.05];
    const ref = barMagnetField(BAR, ...p, 160);
    const b16 = barMagnetField(BAR, ...p, 16);
    const b40 = barMagnetField(BAR, ...p, 40);
    expect(relativeError(len(b16), len(ref))).toBeLessThan(0.01);
    expect(relativeError(len(b40), len(ref))).toBeLessThan(relativeError(len(b16), len(ref)));
  });

  it('halving the tracing step does not change where a closed line reaches', () => {
    const bounds = { xmin: -2, xmax: 2, ymin: -2, ymax: 2 };
    const reach = (h: number) =>
      Math.max(...traceLine((x, y) => barMagnetField(BAR, x, y), [0, 0.01], { bounds, step: h, maxSteps: 20000 }).points.map((p) => p[1]));
    expect(relativeError(reach(0.002), reach(0.001))).toBeLessThan(0.01);
  });
});
