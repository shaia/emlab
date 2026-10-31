import { describe, expect, it } from 'vitest';
import { EPS0, EPS0_DISPLAY } from '~/physics/constants';
import {
  diskAxisField,
  enclosedCharge,
  fluxFlat,
  lineCrossings,
  planeFieldFromGauss,
  planesFieldX,
  pointInPolygon,
  polygonArea,
  rayCrossings,
  polygonFlux,
  shellEnclosed,
  sphereFieldFromGauss,
} from '~/physics/gauss';
import {
  fibonacciSphere,
  fieldLines,
  fluxThroughCube,
  fluxThroughSphere,
  gaussFlux,
  parallelPlatesField,
  planeField,
  shellField,
  type PointCharge,
  type PointCharge3,
} from '~/physics/electrostatics';
import type { Vec2 } from '~/physics/vec';
import { relativeError } from '~/physics/vec';

const uC = 1e-6;

const circle = (cx: number, cy: number, r: number, n = 48): Vec2[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);

describe('analytic limits', () => {
  it('flux through a flat window is E·A·cosθ: full face-on, zero edge-on, negative when reversed', () => {
    expect(relativeError(fluxFlat(2000, 0.5, 0), 1000)).toBeLessThan(1e-12);
    expect(Math.abs(fluxFlat(2000, 0.5, Math.PI / 2))).toBeLessThan(1e-9);
    expect(relativeError(fluxFlat(2000, 0.5, Math.PI), -1000)).toBeLessThan(1e-12);
    expect(relativeError(fluxFlat(2000, 0.5, Math.PI / 3), 500)).toBeLessThan(1e-12);
  });

  it('a sphere around a point charge gives q/ε₀ by direct summation (engine consistency)', () => {
    const q: PointCharge3[] = [{ pos: [0.05, -0.1, 0.08], q: 3 * uC }];
    expect(relativeError(fluxThroughSphere(q, [0, 0, 0], 0.5), gaussFlux(3 * uC))).toBeLessThan(2e-3);
  });

  it('Gauss applied to a sphere reproduces the shell field outside, and zero inside', () => {
    const Q = 2 * uC;
    const R = 0.3;
    for (const r of [0.31, 0.5, 1.2]) {
      expect(relativeError(sphereFieldFromGauss(shellEnclosed(Q, R, r), r), shellField(Q, R, r))).toBeLessThan(1e-12);
    }
    expect(sphereFieldFromGauss(shellEnclosed(Q, R, 0.1), 0.1)).toBe(0);
  });

  it('a pillbox gives σ/(2ε₀) for one plane and the two-plate field σ/ε₀', () => {
    const sigma = 3 * uC;
    expect(relativeError(planeFieldFromGauss(sigma), planeField(sigma))).toBeLessThan(1e-12);
    const plates = [
      { x: 0, sigma },
      { x: 0.1, sigma: -sigma },
    ];
    expect(relativeError(planesFieldX(plates, 0.05), parallelPlatesField(sigma))).toBeLessThan(1e-12);
    expect(Math.abs(planesFieldX(plates, -0.2))).toBeLessThan(1e-3);
    expect(Math.abs(planesFieldX(plates, 0.3))).toBeLessThan(1e-3);
  });

  it('a single positive plane pushes the field away on both sides', () => {
    expect(planesFieldX([{ x: 0, sigma: uC }], 0.2)).toBeGreaterThan(0);
    expect(planesFieldX([{ x: 0, sigma: uC }], -0.2)).toBeLessThan(0);
  });

  it("the students' ε₀ differs from the engine's by under 0.1%", () => {
    expect(relativeError(EPS0, EPS0_DISPLAY)).toBeLessThan(1e-3);
  });
});

describe('conservation and shape independence', () => {
  const charges: PointCharge[] = [
    { x: 0, y: 0, q: 2 * uC },
    { x: 0.6, y: 0.1, q: -1 * uC },
    { x: -0.7, y: 0.5, q: 1 * uC },
  ];

  it('enclosed charge counts only what is inside, whatever the polygon looks like', () => {
    expect(enclosedCharge(charges, circle(0, 0, 0.3))).toBeCloseTo(2 * uC, 15);
    expect(enclosedCharge(charges, circle(0, 0, 0.8))).toBeCloseTo(1 * uC, 15);
    expect(enclosedCharge(charges, circle(0, 0, 0.1).map(([x, y]) => [x * 3, y * 0.5] as Vec2))).toBeCloseTo(2 * uC, 15);
  });

  it('flux is unchanged when a surface is stretched without crossing a charge', () => {
    const a = polygonFlux(charges, circle(0, 0, 0.3));
    const b = polygonFlux(charges, circle(0.05, -0.02, 0.45, 12));
    expect(relativeError(a, b)).toBeLessThan(1e-12);
  });

  it('flux through a cube equals flux through a sphere around the same charge (3D)', () => {
    const q: PointCharge3[] = [{ pos: [0.1, 0.05, -0.1], q: uC }];
    const cube = fluxThroughCube(q, [0, 0, 0], 1.1, 60);
    const sphere = fluxThroughSphere(q, [0, 0, 0], 0.55, 8000);
    expect(relativeError(cube, gaussFlux(uC))).toBeLessThan(2e-3);
    expect(relativeError(sphere, gaussFlux(uC))).toBeLessThan(2e-3);
  });

  it('a charge outside a closed surface adds no net flux (3D)', () => {
    const q: PointCharge3[] = [{ pos: [1.3, 0, 0], q: uC }];
    expect(Math.abs(fluxThroughSphere(q, [0, 0, 0], 0.55, 8000)) / gaussFlux(uC)).toBeLessThan(2e-3);
  });

  it('net outward field-line crossings equal the enclosed charge in lines (single charges and a symmetric dipole)', () => {
    const bounds = { xmin: -2, xmax: 2, ymin: -1.5, ymax: 1.5 };
    const perLine = 0.25 * uC;
    const cases: PointCharge[][] = [
      [{ x: 0.1, y: 0.05, q: 2 * uC }],
      [{ x: -0.3, y: 0.1, q: -1 * uC }],
      [
        { x: -0.45, y: 0, q: 2 * uC },
        { x: 0.45, y: 0, q: -2 * uC },
      ],
    ];
    for (const cs of cases) {
      const lines = fieldLines(cs, { bounds, coreRadius: 0.04, maxStep: 0.02, chargePerLine: perLine, minLines: 1 });
      // lines started on negative charges run against the field: mark them so crossings face the right way
      const marked = lines.map((l) => {
        const start = l.points[0];
        const c = cs.find((k) => k.x === start[0] && k.y === start[1])!;
        return { ...l, reversed: c.q < 0 };
      });
      for (const poly of [circle(0, 0, 0.25), circle(0, 0, 1.0), circle(0.5, 0, 0.7)]) {
        const x = lineCrossings(marked, poly);
        const net = x.filter((k) => k.outward).length - x.filter((k) => !k.outward).length;
        const expected = Math.round(enclosedCharge(cs, poly) / perLine);
        expect(net).toBe(expected);
      }
    }
  });

  it('a symmetric dipole inside a closed curve has equal crossings out and in (net zero), as in the figure', () => {
    const bounds = { xmin: -1, xmax: 1, ymin: -0.75, ymax: 0.75 };
    const cs: PointCharge[] = [
      { x: -0.2, y: 0, q: 2 * uC },
      { x: 0.2, y: 0, q: -2 * uC },
    ];
    const lines = fieldLines(cs, { bounds, coreRadius: 0.06, maxStep: 0.02, chargePerLine: 0.25 * uC, minLines: 1 });
    const marked = lines.map((l) => ({ ...l, reversed: cs.find((k) => k.x === l.points[0][0] && k.y === l.points[0][1])!.q < 0 }));
    const x = lineCrossings(marked, circle(0, 0, 0.5));
    expect(x.filter((k) => k.outward).length).toBe(x.filter((k) => !k.outward).length);
  });

  it('a charge outside a closed curve contributes equally many entering and leaving crossings', () => {
    const bounds = { xmin: -2, xmax: 2, ymin: -1.5, ymax: 1.5 };
    const cs: PointCharge[] = [{ x: 1.0, y: 0.1, q: 2 * uC }];
    const lines = fieldLines(cs, { bounds, coreRadius: 0.04, maxStep: 0.02, chargePerLine: 0.25 * uC, minLines: 1 });
    const x = lineCrossings(lines, circle(0, 0, 0.5));
    expect(x.length).toBeGreaterThan(0);
    expect(x.filter((k) => k.outward).length).toBe(x.filter((k) => !k.outward).length);
  });
});

describe('scaling', () => {
  it('flux scales with the enclosed charge, not with the size of the surface', () => {
    const one: PointCharge[] = [{ x: 0, y: 0, q: uC }];
    const two: PointCharge[] = [{ x: 0, y: 0, q: 2 * uC }];
    expect(relativeError(polygonFlux(two, circle(0, 0, 0.2)), 2 * polygonFlux(one, circle(0, 0, 0.9)))).toBeLessThan(1e-12);
  });

  it('flux of a uniform field scales linearly in E and A', () => {
    expect(relativeError(fluxFlat(4000, 0.4, 0.3), 2 * fluxFlat(2000, 0.4, 0.3))).toBeLessThan(1e-12);
    expect(relativeError(fluxFlat(2000, 0.8, 0.3), 2 * fluxFlat(2000, 0.4, 0.3))).toBeLessThan(1e-12);
  });

  it('shell field falls as 1/r² outside: doubling r quarters E', () => {
    const e1 = sphereFieldFromGauss(uC, 0.5);
    const e2 = sphereFieldFromGauss(uC, 1.0);
    expect(relativeError(e1, 4 * e2)).toBeLessThan(1e-12);
  });

  it('plane field does not depend on the distance', () => {
    const p = [{ x: 0, sigma: uC }];
    expect(relativeError(planesFieldX(p, 0.1), planesFieldX(p, 5))).toBeLessThan(1e-12);
  });

  it('polygon area is positive counter-clockwise and its sign flips with the order', () => {
    const sq: Vec2[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(polygonArea(sq)).toBeCloseTo(1, 12);
    expect(polygonArea([...sq].reverse())).toBeCloseTo(-1, 12);
    expect(pointInPolygon(sq, 0.5, 0.5)).toBe(true);
    expect(pointInPolygon(sq, 1.5, 0.5)).toBe(false);
  });
});

describe('convergence', () => {
  it('the field on the axis of a disc approaches the infinite-plane value as the disc grows', () => {
    const sigma = uC;
    const z = 0.01;
    let prev = Infinity;
    for (const R of [0.05, 0.5, 5, 50]) {
      const err = relativeError(diskAxisField(sigma, R, z), planeField(sigma));
      expect(err).toBeLessThan(prev);
      prev = err;
    }
    expect(prev).toBeLessThan(2e-3);
  });

  it('flux through a sphere converges to q/ε₀ as the sample count grows', () => {
    const q: PointCharge3[] = [{ pos: [0.2, 0, 0], q: uC }];
    const errs = [200, 2000, 20000].map((n) => relativeError(fluxThroughSphere(q, [0, 0, 0], 0.5, n), gaussFlux(uC)));
    expect(errs[2]).toBeLessThan(errs[0]);
    expect(errs[2]).toBeLessThan(1e-3);
  });
});

describe('rays through a closed surface (3D figure)', () => {
  const rays = fibonacciSphere(500);
  const count = (shape: 'sphere' | 'cube', origin: [number, number, number]) => {
    let out = 0;
    let inn = 0;
    for (const d of rays) {
      const c = rayCrossings(shape, [0, 0, 0], 0.55, origin, d);
      out += c.out;
      inn += c.in;
    }
    return { out, in: inn };
  };

  it('every ray from a charge inside leaves once and none enters, for a sphere and a cube', () => {
    for (const shape of ['sphere', 'cube'] as const) {
      expect(count(shape, [0.2, -0.1, 0.3])).toEqual({ out: rays.length, in: 0 });
    }
  });

  it('rays from a charge outside leave exactly as often as they enter, whatever the shape', () => {
    for (const shape of ['sphere', 'cube'] as const) {
      const c = count(shape, [1.2, 0.1, 0]);
      expect(c.in).toBe(c.out);
      expect(c.out).toBeGreaterThan(0);
      expect(c.out).toBeLessThan(rays.length);
    }
  });

  it('the fraction of rays from a distant charge that hit a sphere matches its solid angle', () => {
    const d = 2.5;
    const R = 0.55;
    const many = fibonacciSphere(20000);
    let hit = 0;
    for (const dir of many) hit += rayCrossings('sphere', [0, 0, 0], R, [d, 0, 0], dir).in;
    const expected = (1 - Math.sqrt(1 - (R / d) ** 2)) / 2;
    expect(relativeError(hit / many.length, expected)).toBeLessThan(0.02);
  });
});
