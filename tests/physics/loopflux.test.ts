import { describe, expect, it } from 'vitest';
import { MU0 } from '~/physics/constants';
import { fluxUniform, wireRectFlux } from '~/physics/induction';
import {
  circleCrossings,
  cubeLoopFlux,
  latticeInside,
  lineSpacing,
  linesThrough,
  topFaceLoopFlux,
  wireB,
  wireStripSum,
  wireStrips,
} from '~/physics/loopflux';
import { traceLine } from '~/physics/magnetism';
import { barMagnetField, type BarMagnet } from '~/physics/magnets';
import { relativeError, type Vec2 } from '~/physics/vec';

const LINE = 5e-4; // the figure's flux per drawn line [Wb]
const deg = (d: number) => (d * Math.PI) / 180;

describe('analytic limits', () => {
  it('a loop facing a 0.2 T field, 20 cm on a side, is threaded by 16 lines of 0.5 mWb: Φ = BA = 8 mWb', () => {
    expect(linesThrough(0.2, 0.2, 0, LINE)).toBe(16);
    expect(relativeError(16 * LINE, fluxUniform(0.2, 0.04, 0))).toBeLessThan(1e-12);
  });

  it('tilted to 60°, the same loop is threaded by half the lines: Φ = BA·cos60° = 4 mWb', () => {
    expect(linesThrough(0.2, 0.2, deg(60), LINE)).toBe(8);
    expect(relativeError(fluxUniform(0.2, 0.04, deg(60)), 4e-3)).toBeLessThan(1e-12);
  });

  it('edge-on (θ = 90°) no line threads the loop, however strong the field', () => {
    expect(linesThrough(0.5, 0.2, deg(90), LINE)).toBe(0);
    expect(Math.abs(fluxUniform(0.5, 0.04, deg(90)))).toBeLessThan(1e-17);
  });

  it('a thin strip far from the wire carries B(r)·h·w: the uniform-field limit of the wire flux', () => {
    const exact = wireRectFlux(10, 0.2, 1, 1.001);
    expect(relativeError(exact, wireB(10, 1.0005) * 0.2 * 0.001)).toBeLessThan(1e-7);
  });

  it('one strip is the field at the middle times the area, and it underestimates the 1/r field', () => {
    const one = wireStripSum(10, 0.2, 0.05, 0.15, 1);
    expect(relativeError(one, wireB(10, 0.1) * 0.2 * 0.1)).toBeLessThan(1e-12);
    expect(one).toBeLessThan(wireRectFlux(10, 0.2, 0.05, 0.15));
  });

  it('the wire field is μ₀I/(2πr): 4·10⁻⁵ T at 5 cm from 10 A', () => {
    expect(relativeError(wireB(10, 0.05), 4e-5)).toBeLessThan(1e-12);
    expect(relativeError(wireB(10, 0.05), (MU0 * 10) / (2 * Math.PI * 0.05))).toBeLessThan(1e-15);
  });
});

describe('conservation (Gauss for B: no magnetic charge)', () => {
  const I = 2;
  const R = 0.1;

  it('the net flux of a current loop through a closed cube inside the loop is zero, though its faces carry flux', () => {
    const c: [number, number, number] = [0, 0, 0];
    const a = 0.08; // inside the ring of wire, threaded by its field
    const top = topFaceLoopFlux(I, R, c, a);
    expect(top).toBeGreaterThan(0);
    expect(Math.abs(cubeLoopFlux(I, R, c, a)) / top).toBeLessThan(1e-6);
  });

  it('a cube off the axis, above the loop, also has zero net flux', () => {
    const c: [number, number, number] = [0.07, 0.03, 0.06];
    const a = 0.05;
    const top = Math.abs(topFaceLoopFlux(I, R, c, a, 80));
    expect(top).toBeGreaterThan(0);
    expect(Math.abs(cubeLoopFlux(I, R, c, a, 80)) / top).toBeLessThan(1e-4);
  });

  it('every closed field line of a bar magnet leaves a circle around its north pole as often as it enters', () => {
    const m: BarMagnet = { x: 0, y: 0, angle: 0, L: 0.2, R: 0.025, NI: 400 };
    const f = (x: number, y: number) => barMagnetField(m, x, y);
    const bounds = { xmin: -0.6, xmax: 0.6, ymin: -0.45, ymax: 0.45 };
    let outs = 0;
    for (const off of [-0.015, -0.005, 0.005, 0.015]) {
      const seed: Vec2 = [0, off];
      const fwd = traceLine(f, seed, { bounds, step: 0.003, maxSteps: 4000, direction: 1 });
      const pts = fwd.end === 'closed' ? fwd.points : [...traceLine(f, seed, { bounds, step: 0.003, maxSteps: 4000, direction: -1 }).points.reverse(), ...fwd.points.slice(1)];
      const x = circleCrossings(pts, [0.1, 0], 0.06);
      expect(x.out).toBe(x.in);
      outs += x.out;
    }
    expect(outs).toBeGreaterThan(0);
  });

  it('a polyline that only passes through a circle enters once and leaves once', () => {
    const line: Vec2[] = Array.from({ length: 101 }, (_, i) => [-1 + i * 0.02, 0.1]);
    const x = circleCrossings(line, [0, 0], 0.5);
    expect(x).toMatchObject({ out: 1, in: 1 });
    expect(x.at[0].out).toBe(false);
  });
});

describe('scaling', () => {
  it('Φ ∝ B, ∝ A, and the line count follows: doubling B doubles the count (to within a row)', () => {
    expect(relativeError(fluxUniform(0.4, 0.04, 0), 2 * fluxUniform(0.2, 0.04, 0))).toBeLessThan(1e-12);
    const n1 = linesThrough(0.2, 0.2, 0, LINE);
    const n2 = linesThrough(0.4, 0.2, 0, LINE);
    expect(Math.abs(n2 - 2 * n1)).toBeLessThanOrEqual(2 * Math.ceil(0.2 / lineSpacing(0.4, LINE)) + 1);
  });

  it('the line count tracks Φ/Φ_line over every figure setting, to within one row and one column', () => {
    for (const B of [0.1, 0.2, 0.3, 0.4, 0.5]) {
      for (const s of [0.1, 0.15, 0.2, 0.25, 0.3]) {
        for (let t = 0; t <= 180; t += 5) {
          const n = linesThrough(B, s, deg(t), LINE);
          const ideal = fluxUniform(B, s * s, deg(t)) / LINE;
          const d = lineSpacing(B, LINE);
          const slack = s / d + (s * Math.abs(Math.cos(deg(t)))) / d + 1;
          expect(Math.abs(n - ideal)).toBeLessThanOrEqual(slack);
          expect(Math.sign(n) * Math.sign(ideal)).not.toBe(-1);
        }
      }
    }
  });

  it('reversing the chosen normal (θ → 180° − θ) reverses the flux and the signed line count', () => {
    expect(relativeError(fluxUniform(0.3, 0.05, deg(130)), -fluxUniform(0.3, 0.05, deg(50)))).toBeLessThan(1e-12);
    expect(linesThrough(0.3, 0.2, deg(130), LINE)).toBe(-linesThrough(0.3, 0.2, deg(50), LINE));
  });

  it('moving the rectangle so both its sides are twice as far from the wire leaves the flux unchanged', () => {
    expect(relativeError(wireRectFlux(10, 0.2, 0.1, 0.3), wireRectFlux(10, 0.2, 0.05, 0.15))).toBeLessThan(1e-12);
    expect(relativeError(wireStripSum(10, 0.2, 0.1, 0.3, 8), wireStripSum(10, 0.2, 0.05, 0.15, 8))).toBeLessThan(1e-12);
  });

  it('the wire flux is proportional to I and to h, and reverses with the current', () => {
    expect(relativeError(wireRectFlux(20, 0.2, 0.05, 0.15), 2 * wireRectFlux(10, 0.2, 0.05, 0.15))).toBeLessThan(1e-12);
    expect(relativeError(wireStripSum(10, 0.4, 0.05, 0.15, 4), 2 * wireStripSum(10, 0.2, 0.05, 0.15, 4))).toBeLessThan(1e-12);
    expect(wireStripSum(-10, 0.2, 0.05, 0.15, 4)).toBeLessThan(0);
  });

  it('of two equal halves of the rectangle, the half nearer the wire carries more flux', () => {
    const near = wireRectFlux(10, 0.2, 0.05, 0.1);
    const far = wireRectFlux(10, 0.2, 0.1, 0.15);
    expect(near).toBeGreaterThan(far);
    expect(relativeError(near + far, wireRectFlux(10, 0.2, 0.05, 0.15))).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the strip sum tends to μ₀Ih·ln(r2/r1)/(2π), its error falling as 1/n²', () => {
    const exact = wireRectFlux(10, 0.2, 0.05, 0.15);
    const err = (n: number) => Math.abs(wireStripSum(10, 0.2, 0.05, 0.15, n) - exact);
    for (const n of [4, 8, 16, 32]) expect(err(n) / err(2 * n)).toBeGreaterThan(3.8);
    expect(relativeError(wireStripSum(10, 0.2, 0.05, 0.15, 64), exact)).toBeLessThan(1e-4);
  });

  it('the strips tile the rectangle with no gap: their widths add to r2 − r1 and each uses its middle field', () => {
    const s = wireStrips(10, 0.05, 0.15, 4);
    expect(relativeError(s.reduce((a, p) => a + (p.x1 - p.x0), 0), 0.1)).toBeLessThan(1e-12);
    for (const p of s) expect(relativeError(p.height, wireB(10, (p.x0 + p.x1) / 2))).toBeLessThan(1e-12);
  });

  it('the net cube flux converges to zero as 1/n² as the face grid is refined, while one face converges to a fixed value', () => {
    const c: [number, number, number] = [0, 0, 0.02];
    const t20 = topFaceLoopFlux(2, 0.1, c, 0.06, 20);
    const t40 = topFaceLoopFlux(2, 0.1, c, 0.06, 40);
    expect(relativeError(t20, t40)).toBeLessThan(1e-3);
    const net = (n: number) => Math.abs(cubeLoopFlux(2, 0.1, c, 0.06, n));
    expect(net(10) / net(20)).toBeGreaterThan(3.8);
    expect(net(20) / net(40)).toBeGreaterThan(3.8);
    expect(net(40) / t40).toBeLessThan(1e-4);
  });

  it('the lattice rows inside a span grow with it and stay centred', () => {
    const d = 0.05;
    expect(latticeInside(d, 0.1)).toHaveLength(4);
    expect(latticeInside(d, 0.05)).toHaveLength(2);
    const r = latticeInside(d, 0.13);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
  });
});
