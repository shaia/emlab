import { describe, expect, it } from 'vitest';
import { K, EPS0 } from '~/physics/constants';
import {
  coulombForce,
  fieldAt,
  fieldLines,
  fluxThroughCube,
  fluxThroughSphere,
  forceOn,
  gaussFlux,
  potentialAt,
  shellField,
  traceFieldLine,
  type PointCharge,
  type PointCharge3,
} from '~/physics/electrostatics';
import { relativeError } from '~/physics/vec';

const uC = 1e-6;
const bounds = { xmin: -1, xmax: 1, ymin: -1, ymax: 1 };

describe('analytic limits', () => {
  it('point-charge field is kq/r² along the radius', () => {
    const q = 2 * uC;
    const [ex, ey] = fieldAt([{ x: 0, y: 0, q }], 0.3, 0.4);
    const r = 0.5;
    expect(relativeError(Math.hypot(ex, ey), (K * q) / (r * r))).toBeLessThan(1e-12);
    expect(relativeError(ex / ey, 0.3 / 0.4)).toBeLessThan(1e-12);
  });

  it('negative charge field points toward the charge', () => {
    const [ex] = fieldAt([{ x: 0, y: 0, q: -uC }], 0.2, 0);
    expect(ex).toBeLessThan(0);
  });

  it('Coulomb force is repulsive (positive) for like charges and matches k q1 q2 / r²', () => {
    expect(coulombForce(uC, uC, 0.1)).toBeGreaterThan(0);
    expect(coulombForce(uC, -uC, 0.1)).toBeLessThan(0);
    expect(relativeError(coulombForce(uC, 2 * uC, 0.1), (K * 2 * uC * uC) / 0.01)).toBeLessThan(1e-12);
  });

  it('dipole field on the bisector is parallel to the dipole axis', () => {
    const dipole: PointCharge[] = [
      { x: -0.1, y: 0, q: uC },
      { x: 0.1, y: 0, q: -uC },
    ];
    const [ex, ey] = fieldAt(dipole, 0, 0.3);
    expect(Math.abs(ey / ex)).toBeLessThan(1e-12);
    expect(ex).toBeGreaterThan(0); // from + toward −
  });

  it('potential of a point charge is kq/r and zero midway between ±q', () => {
    expect(relativeError(potentialAt([{ x: 0, y: 0, q: uC }], 0.2, 0), (K * uC) / 0.2)).toBeLessThan(1e-12);
    const v = potentialAt(
      [
        { x: -0.1, y: 0, q: uC },
        { x: 0.1, y: 0, q: -uC },
      ],
      0,
      0.25,
    );
    expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it('field between equal like charges vanishes at the midpoint', () => {
    const [ex, ey] = fieldAt(
      [
        { x: -0.2, y: 0, q: uC },
        { x: 0.2, y: 0, q: uC },
      ],
      0,
      0,
    );
    expect(Math.hypot(ex, ey)).toBeLessThan(1e-6);
  });

  it('shell field is zero inside and kQ/r² outside', () => {
    expect(shellField(uC, 0.3, 0.1)).toBe(0);
    expect(relativeError(shellField(uC, 0.3, 0.6), (K * uC) / 0.36)).toBeLessThan(1e-12);
  });
});

describe('scaling (dimensional proxy)', () => {
  it('doubling the charge doubles E; doubling distance quarters it', () => {
    const e1 = Math.hypot(...fieldAt([{ x: 0, y: 0, q: uC }], 0.2, 0));
    const e2 = Math.hypot(...fieldAt([{ x: 0, y: 0, q: 2 * uC }], 0.2, 0));
    const e3 = Math.hypot(...fieldAt([{ x: 0, y: 0, q: uC }], 0.4, 0));
    expect(relativeError(e2 / e1, 2)).toBeLessThan(1e-12);
    expect(relativeError(e1 / e3, 4)).toBeLessThan(1e-12);
  });

  it('force on a test charge is qE (superposition of forces = force from superposed field)', () => {
    const sources: PointCharge[] = [
      { x: 0, y: 0, q: uC },
      { x: 0.3, y: 0.1, q: -2 * uC },
    ];
    const test: PointCharge = { x: 0.1, y: 0.25, q: 0.5 * uC };
    const [fx, fy] = forceOn(sources, test);
    const [ex, ey] = fieldAt(sources, test.x, test.y);
    expect(relativeError(fx, test.q * ex)).toBeLessThan(1e-12);
    expect(relativeError(fy, test.q * ey)).toBeLessThan(1e-12);
  });
});

describe("conservation: Gauss's law", () => {
  const inside: PointCharge3[] = [
    { pos: [0.02, -0.01, 0.03], q: 3 * uC },
    { pos: [-0.03, 0.02, 0], q: -1 * uC },
  ];
  const outside: PointCharge3[] = [{ pos: [0.5, 0, 0], q: 5 * uC }];

  it('flux through a sphere equals q_enclosed/ε₀', () => {
    const flux = fluxThroughSphere([...inside, ...outside], [0, 0, 0], 0.2, 40000);
    expect(relativeError(flux, gaussFlux(2 * uC))).toBeLessThan(5e-3);
  });

  it('flux through a cube is the same as through a sphere: shape does not matter', () => {
    const flux = fluxThroughCube([...inside, ...outside], [0, 0, 0], 0.3, 160);
    expect(relativeError(flux, gaussFlux(2 * uC))).toBeLessThan(5e-3);
  });

  it('a charge outside contributes zero net flux', () => {
    const flux = fluxThroughSphere(outside, [0, 0, 0], 0.2, 40000);
    expect(Math.abs(flux) / gaussFlux(5 * uC)).toBeLessThan(5e-3);
  });

  it('ε₀ is consistent with k = 1/(4πε₀)', () => {
    expect(relativeError(1 / (4 * Math.PI * EPS0), K)).toBeLessThan(1e-12);
  });
});

describe('convergence: field-line tracing', () => {
  it('a line from + ends on − for a dipole', () => {
    const dipole: PointCharge[] = [
      { x: -0.2, y: 0, q: uC },
      { x: 0.2, y: 0, q: -uC },
    ];
    const line = traceFieldLine(dipole, [-0.18, 0.01], {
      direction: 1,
      bounds,
      coreRadius: 0.02,
      maxStep: 0.01,
    });
    expect(line.end).toBe('charge');
    expect(line.endCharge).toBe(1);
  });

  it('field lines of a lone positive charge are straight radial rays', () => {
    const line = traceFieldLine([{ x: 0, y: 0, q: uC }], [0.03, 0.04], {
      direction: 1,
      bounds,
      coreRadius: 0.02,
      maxStep: 0.02,
    });
    expect(line.end).toBe('bounds');
    for (const [x, y] of line.points) {
      expect(Math.abs(y / x - 4 / 3)).toBeLessThan(1e-9);
    }
  });

  it('line count is proportional to charge', () => {
    const lines = fieldLines([{ x: 0, y: 0, q: 3 * uC }], {
      bounds,
      coreRadius: 0.02,
      maxStep: 0.02,
      chargePerLine: uC / 4,
    });
    expect(lines.length).toBe(12);
  });

  it('a ±q dipole draws each connecting line once', () => {
    const dipole: PointCharge[] = [
      { x: -0.2, y: 0, q: uC },
      { x: 0.2, y: 0, q: -uC },
    ];
    const lines = fieldLines(dipole, { bounds, coreRadius: 0.02, maxStep: 0.01, chargePerLine: uC / 8 });
    const fromPositive = lines.filter((l) => l.end === 'charge').length;
    expect(lines.length).toBeLessThan(16 + 4); // no duplicate of every connecting line
    expect(fromPositive).toBeGreaterThan(4);
  });
});
