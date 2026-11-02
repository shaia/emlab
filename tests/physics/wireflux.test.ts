import { describe, expect, it } from 'vitest';
import { MU0 } from '~/physics/constants';
import { circulation, straightWireField, wireFieldAt, EARTH_B_HORIZONTAL, type Wire } from '~/physics/magnetism';
import { nullPointTwoWires, nullPointWireUniform, totalFieldAt, wireDistanceForField, wireFlux } from '~/physics/wireflux';
import { relativeError, type Vec2 } from '~/physics/vec';
import { contourLines } from '~/sims/core/contour';

const circle = (cx: number, cy: number, r: number, n = 64): Vec2[] =>
  Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n)] as Vec2);

/** B from the flux function by central differences: B = (∂A/∂y, −∂A/∂x). */
const curlOfFlux = (wires: Wire[], x: number, y: number, B0: Vec2 = [0, 0], h = 1e-6): Vec2 => [
  (wireFlux(wires, x, y + h, B0) - wireFlux(wires, x, y - h, B0)) / (2 * h),
  -(wireFlux(wires, x + h, y, B0) - wireFlux(wires, x - h, y, B0)) / (2 * h),
];

describe('analytic limits', () => {
  it('the field derived from the flux function is the Biot–Savart field of the wires plus the uniform field', () => {
    const wires: Wire[] = [
      { x: -0.08, y: 0, I: 10 },
      { x: 0.08, y: 0.02, I: -6 },
    ];
    const B0: Vec2 = [0, EARTH_B_HORIZONTAL];
    for (const [x, y] of [
      [0.01, 0.05],
      [-0.12, -0.03],
      [0.2, 0.1],
    ] as Vec2[]) {
      const [ax, ay] = curlOfFlux(wires, x, y, B0);
      const [bx, by] = totalFieldAt(wires, x, y, B0);
      expect(relativeError(ax, bx)).toBeLessThan(1e-6);
      expect(relativeError(ay, by)).toBeLessThan(1e-6);
    }
  });

  it('a single wire’s field lines are circles: the flux is the same all round a circle centred on it', () => {
    const w: Wire[] = [{ x: 0.03, y: -0.02, I: 7 }];
    const vals = circle(0.03, -0.02, 0.05).map(([x, y]) => wireFlux(w, x, y));
    for (const a of vals) expect(relativeError(a, vals[0])).toBeLessThan(1e-12);
  });

  it('the field of a 10 A wire 5 cm away is 4·10⁻⁵ T, comparable to the Earth’s horizontal field', () => {
    expect(relativeError(straightWireField(10, 0.05), 4e-5)).toBeLessThan(1e-12);
    expect(relativeError(wireDistanceForField(10, 4e-5), 0.05)).toBeLessThan(1e-12);
  });

  it('a wire with current out of the page (⊙) in a field pointing up the page has its null point to its left', () => {
    const w: Wire = { x: 0, y: 0, I: 10 };
    const B0: Vec2 = [0, 3.2e-5];
    const p = nullPointWireUniform(w, B0)!;
    expect(relativeError(p[0], -0.0625)).toBeLessThan(1e-12);
    expect(Math.abs(p[1])).toBeLessThan(1e-15);
    const [bx, by] = totalFieldAt([w], p[0], p[1], B0);
    expect(Math.hypot(bx, by)).toBeLessThan(1e-9 * 3.2e-5);
    // into the page (⊗): the null point moves to the other side
    const q = nullPointWireUniform({ ...w, I: -10 }, B0)!;
    expect(relativeError(q[0], 0.0625)).toBeLessThan(1e-12);
  });

  it('two parallel wires: the null point lies between them for like currents, beyond the weaker one for opposite currents', () => {
    const d = 0.12;
    const like = nullPointTwoWires(9, 3, d)!;
    expect(relativeError(like, 0.09)).toBeLessThan(1e-12);
    const opp = nullPointTwoWires(9, -3, d)!;
    expect(relativeError(opp, 0.18)).toBeLessThan(1e-12);
    const oppWeakFirst = nullPointTwoWires(3, -9, d)!;
    expect(relativeError(oppWeakFirst, -0.06)).toBeLessThan(1e-12);
    expect(nullPointTwoWires(5, -5, d)).toBeNull();
    for (const [I1, I2, x] of [
      [9, 3, like],
      [9, -3, opp],
      [3, -9, oppWeakFirst],
    ]) {
      const wires: Wire[] = [
        { x: 0, y: 0, I: I1 },
        { x: d, y: 0, I: I2 },
      ];
      const [bx, by] = wireFieldAt(wires, x, 0);
      expect(Math.hypot(bx, by)).toBeLessThan(1e-9 * straightWireField(9, d));
    }
  });
});

describe('conservation', () => {
  it('the flux function is single-valued: no net flux leaves any closed curve in the page', () => {
    const wires: Wire[] = [
      { x: 0, y: 0, I: 12 },
      { x: 0.05, y: 0.01, I: -4 },
    ];
    const B0: Vec2 = [1e-5, 3e-5];
    // ∮ B·n dl around a circle that encloses both wires, n the outward normal
    const n = 4000;
    const R = 0.1;
    let flux = 0;
    for (let k = 0; k < n; k++) {
      const th = ((k + 0.5) * 2 * Math.PI) / n;
      const [bx, by] = totalFieldAt(wires, R * Math.cos(th), R * Math.sin(th), B0);
      flux += (bx * Math.cos(th) + by * Math.sin(th)) * R * ((2 * Math.PI) / n);
    }
    expect(Math.abs(flux)).toBeLessThan(1e-9 * straightWireField(12, R) * R);
  });

  it('the circulation round a wire is μ₀I whatever the loop, and the uniform field adds nothing to it', () => {
    const wires: Wire[] = [{ x: 0, y: 0, I: 8 }];
    const field = (x: number, y: number) => totalFieldAt(wires, x, y, [0, EARTH_B_HORIZONTAL]);
    expect(relativeError(circulation(field, circle(0.01, 0, 0.06, 200), 50), MU0 * 8)).toBeLessThan(1e-4);
  });
});

describe('scaling', () => {
  it('B ∝ I/r: doubling the distance halves the field, doubling the current doubles it', () => {
    const B = straightWireField(10, 0.04);
    expect(relativeError(straightWireField(10, 0.08), B / 2)).toBeLessThan(1e-12);
    expect(relativeError(straightWireField(20, 0.04), 2 * B)).toBeLessThan(1e-12);
    expect(relativeError(straightWireField(30, 0.08), 1.5 * B)).toBeLessThan(1e-12);
  });

  it('equally spaced flux levels around one wire sit at radii in a fixed ratio, so line density ∝ 1/r ∝ B', () => {
    const I = 10;
    const step = ((MU0 * I) / (2 * Math.PI)) * Math.log(1.4);
    // A = −(μ₀I/2π)·ln r, so A = −k·step at r = 1.4^k
    for (const k of [-10, -8, -6]) {
      const r = 1.4 ** k;
      expect(relativeError(wireFlux([{ x: 0, y: 0, I }], r, 0), -k * step)).toBeLessThan(1e-9);
    }
  });

  it('the null point of a wire in a uniform field moves out in proportion to the current', () => {
    expect(relativeError(wireDistanceForField(20, 3.2e-5), 2 * wireDistanceForField(10, 3.2e-5))).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the drawn field line of a wire converges to the exact circle as the contour grid is refined', () => {
    const w: Wire[] = [{ x: 0, y: 0, I: 10 }];
    const step = ((MU0 * 10) / (2 * Math.PI)) * Math.log(1.4);
    const box = { xmin: -0.15, xmax: 0.15, ymin: -0.15, ymax: 0.15 };
    const errors = [30, 60, 120].map((n) => {
      const lines = contourLines((x, y) => wireFlux(w, x, y), box, { nx: n, ny: n, step, mask: (x, y) => Math.hypot(x, y) < 0.01 });
      // the level (k + 0.5)·step lies on the circle r = 1.4^−(k+0.5)
      const target = lines.filter((l) => l.closed).find((l) => {
        const r = 1.4 ** -(l.k + 0.5);
        return r > 0.04 && r < 0.08;
      })!;
      const r = 1.4 ** -(target.k + 0.5);
      return Math.max(...target.points.map(([x, y]) => Math.abs(Math.hypot(x, y) - r)));
    });
    expect(errors[1]).toBeLessThan(errors[0]);
    expect(errors[2]).toBeLessThan(errors[1]);
    expect(errors[2]).toBeLessThan(0.3 / 120 / 4);
  });

  it('every contour around a lone wire closes on itself', () => {
    const w: Wire[] = [{ x: 0, y: 0, I: -10 }];
    const step = ((MU0 * 10) / (2 * Math.PI)) * Math.log(1.4);
    const lines = contourLines((x, y) => wireFlux(w, x, y), { xmin: -0.2, xmax: 0.2, ymin: -0.2, ymax: 0.2 }, {
      nx: 80,
      ny: 80,
      step,
      mask: (x, y) => Math.hypot(x, y) < 0.012,
    });
    // away from the masked core (cells touching it are skipped) and from the box edges
    const inside = lines.filter((l) => l.points.every(([x, y]) => Math.hypot(x, y) < 0.19 && Math.hypot(x, y) > 0.025));
    expect(inside.length).toBeGreaterThan(3);
    for (const l of inside) expect(l.closed).toBe(true);
  });
});
