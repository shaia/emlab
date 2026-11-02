import { describe, expect, it } from 'vitest';
import { MU0 } from '~/physics/constants';
import {
  circlePath,
  coaxialTurns,
  combinedFieldAt,
  distanceToPath,
  edgeSums,
  enclosedCurrent,
  flatCoil,
  rectPath,
  segmentSum,
  signedArea,
  solenoidTurns,
  turnCuts,
  turnsFieldAt,
} from '~/physics/coils';
import { circulation, loopCenterField, solenoidField, solenoidFieldAt, straightWireField, wireFieldAt, type Solenoid } from '~/physics/magnetism';
import { len, relativeError } from '~/physics/vec';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

describe('analytic limit: coils in the plane through their axis', () => {
  it('a flat coil of N turns gives μ₀NI/(2R) at its centre, along +x for I > 0', () => {
    const [bx, by] = turnsFieldAt(flatCoil(0, 0, 0.05, 20, 2), 0, 0);
    expect(relativeError(bx, loopCenterField(2, 0.05, 20))).toBeLessThan(1e-12);
    expect(Math.abs(by)).toBeLessThan(1e-20);
    expect(bx).toBeGreaterThan(0);
  });

  it('the solenoid turns reproduce solenoidFieldAt exactly, so the drawn cuts match the drawn field', () => {
    const s: Solenoid = { x0: 0.1, y0: -0.05, L: 0.8, R: 0.08, N: 400, I: 2 };
    const turns = solenoidTurns(s, 32);
    for (const [x, y] of [[0, 0], [0.3, 0.02], [-0.5, 0.2], [0.55, -0.1]] as const) {
      const a = turnsFieldAt(turns, x, y);
      const b = solenoidFieldAt(s, x, y, 32);
      expect(relativeError(a[0], b[0])).toBeLessThan(1e-12);
      expect(Math.abs(a[1] - b[1])).toBeLessThanOrEqual(1e-12 * Math.abs(a[0]) + 1e-18);
    }
  });

  it('the top cut of a turn with I > 0 carries ⊙ and the bottom cut ⊗ (the right-hand rule)', () => {
    const cuts = turnCuts([{ x: 0, y0: 0, R: 0.1, I: 3 }]);
    expect(cuts).toEqual([
      { x: 0, y: 0.1, I: 3 },
      { x: 0, y: -0.1, I: -3 },
    ]);
    // the field of the two cuts as if they were long straight wires points along +x at the centre, like the turn's
    const [bx] = wireFieldAt(cuts, 0, 0);
    expect(bx).toBeGreaterThan(0);
  });

  it('inside a long solenoid of 32 drawn turns the field is uniform across the section to 1%', () => {
    const s: Solenoid = { x0: 0, y0: 0, L: 0.8, R: 0.08, N: 400, I: 2 };
    const turns = solenoidTurns(s, 32);
    const axis = turnsFieldAt(turns, 0, 0)[0];
    const nearWinding = turnsFieldAt(turns, 0, 0.7 * s.R)[0];
    expect(relativeError(axis, solenoidField(400, 0.8, 2))).toBeLessThan(0.02);
    expect(relativeError(nearWinding, axis)).toBeLessThan(0.01);
  });

  it('Σ B·Δℓ along a straight segment near a wire is μ₀I/(2π) times the angle it subtends', () => {
    const f = (x: number, y: number) => wireFieldAt([{ x: 0, y: 0, I: 5 }], x, y);
    // the segment x = 0.1 from y = −0.1 to y = 0.1 subtends 90° at the wire
    const s = segmentSum(f, [0.1, -0.1], [0.1, 0.1], 1e-4);
    expect(relativeError(s, (MU0 * 5) / 4)).toBeLessThan(1e-6);
  });

  it('a circle of radius r around a wire: B is the same all round, so the sum is B·2πr = μ₀I', () => {
    const f = (x: number, y: number) => wireFieldAt([{ x: 0, y: 0, I: 5 }], x, y);
    const r = 0.12;
    expect(relativeError(straightWireField(5, r) * 2 * Math.PI * r, MU0 * 5)).toBeLessThan(1e-12);
    expect(relativeError(sum(edgeSums(f, circlePath(0, 0, r, 360), 1e-3)), MU0 * 5)).toBeLessThan(1e-4);
  });
});

describe("conservation: the sum depends only on the enclosed current (Ampère's law)", () => {
  const wires = [
    { x: -0.2, y: 0, I: 6 },
    { x: 0.2, y: 0, I: -2 },
  ];
  const f = (x: number, y: number) => wireFieldAt(wires, x, y);

  it('around one wire, around both, around none: μ₀·6, μ₀·4, 0', () => {
    const cases: [ReturnType<typeof rectPath>, number][] = [
      [rectPath(-0.35, -0.15, -0.05, 0.2), 6],
      [rectPath(-0.4, -0.3, 0.4, 0.25), 4],
      [rectPath(-0.1, 0.1, 0.1, 0.3), 0],
    ];
    for (const [path, I] of cases) {
      expect(enclosedCurrent(wires, path)).toBe(I);
      const c = sum(edgeSums(f, path, 5e-4));
      if (I === 0) expect(Math.abs(c)).toBeLessThan(1e-4 * MU0);
      else expect(relativeError(c, MU0 * I)).toBeLessThan(1e-4);
    }
  });

  it('a path that encloses no current still has a field on it: zero sum does not mean zero field', () => {
    const path = rectPath(-0.1, 0.1, 0.1, 0.3);
    expect(enclosedCurrent(wires, path)).toBe(0);
    expect(len(f(0, 0.1))).toBeGreaterThan(1e-6);
  });

  it('running the path clockwise flips the sign of the sum and of the enclosed current together', () => {
    const ccw = rectPath(-0.35, -0.15, -0.05, 0.2);
    const cw = [...ccw].reverse();
    expect(signedArea(ccw)).toBeGreaterThan(0);
    expect(signedArea(cw)).toBeLessThan(0);
    expect(enclosedCurrent(wires, cw)).toBe(-6);
    expect(relativeError(sum(edgeSums(f, cw, 5e-4)), -MU0 * 6)).toBeLessThan(1e-4);
  });

  it('the edge sums add up to the same circulation magnetism.ts computes', () => {
    const path = rectPath(-0.4, -0.3, 0.4, 0.25);
    expect(relativeError(sum(edgeSums(f, path, 5e-4)), circulation(f, path, 2000))).toBeLessThan(1e-6);
  });

  it('a rectangle around the top row of a solenoid encloses (turns inside)·N·I/loops, and the sum agrees', () => {
    const s: Solenoid = { x0: 0, y0: 0, L: 0.8, R: 0.08, N: 400, I: 2 };
    const turns = solenoidTurns(s, 32);
    const cuts = turnCuts(turns);
    // x from −0.2 to 0.2 holds the 16 middle turns (spaced 2.5 cm, at ±0.0125, ±0.0375, … ±0.1875)
    const path = rectPath(-0.2, 0, 0.2, 0.2);
    const I = enclosedCurrent(cuts, path);
    expect(relativeError(I, (16 * (400 * 2)) / 32)).toBeLessThan(1e-12);
    const field = (x: number, y: number) => turnsFieldAt(turns, x, y);
    const edges = edgeSums(field, path, 5e-4);
    expect(relativeError(sum(edges), MU0 * I)).toBeLessThan(2e-3);
    // almost all of it comes from the bottom edge, on the axis inside the solenoid: B·ℓ ≈ μ₀nℓI
    expect(relativeError(edges[0], solenoidField(400, 0.8, 2) * 0.4)).toBeLessThan(0.03);
  });

  it('wires and turns together: the sum counts the cuts and the wires inside', () => {
    const turns = coaxialTurns(0, 0, 0.1, 1, 3, 0.05);
    const wires2 = [{ x: 0.3, y: 0.3, I: 4 }];
    const cuts = turnCuts(turns);
    const path = rectPath(-0.1, 0.05, 0.35, 0.35);
    const I = enclosedCurrent([...cuts, ...wires2], path);
    expect(I).toBe(3 + 4);
    const c = sum(edgeSums((x, y) => combinedFieldAt(turns, wires2, x, y), path, 5e-4));
    expect(relativeError(c, MU0 * 7)).toBeLessThan(1e-3);
  });
});

describe('scaling (the dimensional proxy)', () => {
  it('the sum is proportional to the current, and does not depend on the size of the circle', () => {
    const at = (I: number, r: number) => sum(edgeSums((x, y) => wireFieldAt([{ x: 0, y: 0, I }], x, y), circlePath(0, 0, r, 360), 1e-3));
    expect(relativeError(at(10, 0.1), 2 * at(5, 0.1))).toBeLessThan(1e-9);
    expect(relativeError(at(5, 0.3), at(5, 0.1))).toBeLessThan(1e-4);
  });

  it('a flat coil: B at the centre doubles with N and with I, and halves when R doubles', () => {
    const B = (N: number, I: number, R: number) => turnsFieldAt(flatCoil(0, 0, R, N, I), 0, 0)[0];
    expect(relativeError(B(2, 1, 0.1), 2 * B(1, 1, 0.1))).toBeLessThan(1e-12);
    expect(relativeError(B(1, 2, 0.1), 2 * B(1, 1, 0.1))).toBeLessThan(1e-12);
    expect(relativeError(B(1, 1, 0.2), B(1, 1, 0.1) / 2)).toBeLessThan(1e-12);
  });

  it('turns pulled close together make a uniform field inside; far apart, each turn keeps its own field', () => {
    const close = coaxialTurns(0, 0, 0.12, 5, 5, 0.03);
    const far = coaxialTurns(0, 0, 0.12, 5, 5, 0.2);
    const spread = (turns: ReturnType<typeof coaxialTurns>) => {
      const a = turnsFieldAt(turns, 0, 0)[0];
      const b = turnsFieldAt(turns, 0, 0.08)[0];
      return Math.abs(a - b) / Math.abs(a);
    };
    expect(spread(close)).toBeLessThan(spread(far));
  });
});

describe('convergence', () => {
  it('the edge sums converge as the pieces shrink, also for a path 1 cm from a cut', () => {
    const s: Solenoid = { x0: 0, y0: 0, L: 0.8, R: 0.08, N: 400, I: 2 };
    const turns = solenoidTurns(s, 32);
    const field = (x: number, y: number) => turnsFieldAt(turns, x, y);
    // the left and right edges, at x = ±0.2025, pass 1 cm from the cuts at ±0.2125
    const path = rectPath(-0.2025, -0.02, 0.2025, 0.15);
    const I = enclosedCurrent(turnCuts(turns), path);
    const err = (h: number) => relativeError(sum(edgeSums(field, path, h)), MU0 * I);
    expect(err(1e-3)).toBeLessThan(err(8e-3));
    expect(err(1e-3)).toBeLessThan(5e-3);
  });

  it('distanceToPath finds a cut sitting on an edge', () => {
    const path = rectPath(-0.2, 0, 0.2, 0.2);
    expect(distanceToPath(path, 0.2, 0.06)).toBeLessThan(1e-12);
    expect(relativeError(distanceToPath(path, 0, 0.06), 0.06)).toBeLessThan(1e-12);
  });
});
