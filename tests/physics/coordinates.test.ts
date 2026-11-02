import { describe, expect, it } from 'vitest';
import { K } from '~/physics/constants';
import {
  angleBetween,
  componentAlong,
  coulombField,
  coulombPotential,
  cylindricalBasis,
  differenceQuotient,
  fromCylindrical,
  fromSpherical,
  parallelogramArea,
  partial,
  separation,
  sphericalBasis,
  toCylindrical,
  toSpherical,
} from '~/physics/coordinates';
import { fieldAt, fieldAt3, potentialAt } from '~/physics/electrostatics';
import { cross3, dot3, len3, relativeError, type Vec3 } from '~/physics/vec';

const q = 2e-9;
const deg = Math.PI / 180;
const close3 = (a: Vec3, b: Vec3, tol = 1e-12) => {
  const m = Math.max(len3(a), len3(b), 1e-300);
  return len3([a[0] - b[0], a[1] - b[1], a[2] - b[2]]) / m < tol;
};

describe('analytic limits', () => {
  it('a point on the +z axis has s = 0 and θ = 0; a point in the plane z = 0 has θ = 90° and r = s', () => {
    expect(toCylindrical([0, 0, 3]).s).toBe(0);
    expect(toSpherical([0, 0, 3])).toMatchObject({ r: 3, theta: 0 });
    const p: Vec3 = [3, 4, 0];
    expect(toSpherical(p).theta).toBeCloseTo(Math.PI / 2, 14);
    expect(relativeError(toSpherical(p).r, toCylindrical(p).s)).toBeLessThan(1e-15);
  });

  it('the 3-4-12 point: s = 5, r = 13, cos θ = 12/13, tan φ = 4/3', () => {
    const p: Vec3 = [3, 4, 12];
    const c = toCylindrical(p);
    const s = toSpherical(p);
    expect(c.s).toBeCloseTo(5, 12);
    expect(s.r).toBeCloseTo(13, 12);
    expect(Math.cos(s.theta)).toBeCloseTo(12 / 13, 12);
    expect(Math.tan(c.phi)).toBeCloseTo(4 / 3, 12);
  });

  it('φ runs counter-clockwise from +x through [0, 2π): the −y axis is 270°', () => {
    expect(toCylindrical([0, 1, 0]).phi).toBeCloseTo(90 * deg, 14);
    expect(toCylindrical([-1, 0, 0]).phi).toBeCloseTo(180 * deg, 14);
    expect(toCylindrical([0, -1, 0]).phi).toBeCloseTo(270 * deg, 14);
  });

  it('with the source at the origin, the separation law is the Bagrut law E = kq/r², along r̂', () => {
    const r: Vec3 = [0.3, -0.4, 0];
    const E = coulombField(q, [0, 0, 0], r);
    expect(relativeError(len3(E), (K * q) / 0.25)).toBeLessThan(1e-14);
    expect(angleBetween(E, r)).toBeLessThan(1e-7);
  });

  it('far from an offset source, E points along r and has the size kq/|r|²', () => {
    const rs: Vec3 = [0.05, 0.02, 0];
    const r: Vec3 = [400, 300, 0];
    const E = coulombField(q, rs, r);
    expect(angleBetween(E, r)).toBeLessThan(2e-4);
    expect(relativeError(len3(E), (K * q) / dot3(r, r))).toBeLessThan(1e-3);
  });

  it('E_x = −∂V/∂x for a source off the origin: on the vertical line through the source ∂V/∂x = 0 while E ≠ 0', () => {
    const src = { x: 0.1, y: -0.05, q };
    const V = (x: number, y: number) => potentialAt([src], x, y);
    const [ex, ey] = fieldAt([src], 0.1, 0.25);
    expect(Math.abs(partial(V, 0.1, 0.25, 'x'))).toBeLessThan(1e-6 * Math.abs(ey));
    expect(Math.abs(ex)).toBe(0);
    expect(relativeError(-partial(V, 0.1, 0.25, 'y'), ey)).toBeLessThan(1e-8);
  });
});

describe('identities', () => {
  const pts: Vec3[] = [
    [3, 4, 12],
    [-0.2, 0.7, -1.1],
    [0.5, -0.5, 0.25],
    [-3, -1, 2],
  ];

  it('cylindrical and spherical coordinates round-trip to the same Cartesian point', () => {
    for (const p of pts) {
      expect(close3(fromCylindrical(toCylindrical(p)), p)).toBe(true);
      expect(close3(fromSpherical(toSpherical(p)), p)).toBe(true);
    }
  });

  it('s = r sin θ and z = r cos θ link the two systems', () => {
    for (const p of pts) {
      const c = toCylindrical(p);
      const s = toSpherical(p);
      expect(relativeError(c.s, s.r * Math.sin(s.theta))).toBeLessThan(1e-14);
      expect(relativeError(c.z, s.r * Math.cos(s.theta))).toBeLessThan(1e-14);
    }
  });

  it('the unit vectors of each system are orthonormal and right-handed (ŝ × φ̂ = ẑ, r̂ × θ̂ = φ̂)', () => {
    const c = cylindricalBasis(1.1);
    const s = sphericalBasis(0.7, 2.3);
    for (const [a, b] of [
      [c.s, c.phi],
      [c.phi, c.z],
      [s.r, s.theta],
      [s.theta, s.phi],
      [s.r, s.phi],
    ] as [Vec3, Vec3][]) {
      expect(Math.abs(dot3(a, b))).toBeLessThan(1e-15);
    }
    for (const v of [c.s, c.phi, s.r, s.theta, s.phi]) expect(len3(v)).toBeCloseTo(1, 14);
    expect(close3(cross3(c.s, c.phi), c.z)).toBe(true);
    expect(close3(cross3(s.r, s.theta), s.phi)).toBe(true);
  });

  it('r̂ at a point is that point divided by its distance', () => {
    const p: Vec3 = [-0.2, 0.7, -1.1];
    const sp = toSpherical(p);
    const rhat = sphericalBasis(sp.theta, sp.phi).r;
    expect(close3(rhat, [p[0] / sp.r, p[1] / sp.r, p[2] / sp.r])).toBe(true);
  });

  it('|a × b|² + (a·b)² = |a|²|b|² (sin² + cos² = 1), and a × b is perpendicular to both', () => {
    const a: Vec3 = [2, -1, 3];
    const b: Vec3 = [0.5, 4, -2];
    const c = cross3(a, b);
    expect(relativeError(dot3(c, c) + dot3(a, b) ** 2, dot3(a, a) * dot3(b, b))).toBeLessThan(1e-14);
    expect(Math.abs(dot3(c, a))).toBeLessThan(1e-12);
    expect(Math.abs(dot3(c, b))).toBeLessThan(1e-12);
    expect(close3(cross3(b, a), [-c[0], -c[1], -c[2]])).toBe(true);
  });

  it('the dot product gives the angle and the component: 3-4-5 against the x axis', () => {
    expect(angleBetween([3, 4, 0], [1, 0, 0])).toBeCloseTo(Math.acos(0.6), 14);
    expect(componentAlong([3, 4, 0], [2, 0, 0])).toBeCloseTo(3, 14);
    expect(parallelogramArea([3, 0, 0], [1, 2, 0])).toBeCloseTo(6, 14);
  });

  it('the separation-vector law agrees with the superposition engine (fieldAt3) and E_x = −∂V/∂x', () => {
    const rs: Vec3 = [0.3, 0, 0];
    const r: Vec3 = [0, 0.4, 0.1];
    expect(close3(coulombField(q, rs, r), fieldAt3([{ pos: rs, q }], r))).toBe(true);
    const V = (x: number, y: number) => coulombPotential(q, rs, [x, y, 0.1]);
    expect(relativeError(-partial(V, 0, 0.4, 'x'), coulombField(q, rs, r)[0])).toBeLessThan(1e-8);
  });

  it('r − r′ runs from the source to the field point: swapping them reverses it, not its length', () => {
    const a = separation([1, 2, 0], [4, 6, 0]);
    const b = separation([4, 6, 0], [1, 2, 0]);
    expect(a.dist).toBe(5);
    expect(close3(a.vec, [-3, -4, 0])).toBe(true);
    expect(close3(b.vec, [3, 4, 0])).toBe(true);
    expect(len3(a.unit)).toBeCloseTo(1, 15);
  });
});

describe('scaling', () => {
  it('the field depends only on r − r′: moving the source and the field point together changes nothing', () => {
    const rs: Vec3 = [0.1, -0.2, 0.05];
    const r: Vec3 = [-0.3, 0.2, 0.4];
    const d: Vec3 = [5, -7, 2];
    const shift = (v: Vec3): Vec3 => [v[0] + d[0], v[1] + d[1], v[2] + d[2]];
    expect(close3(coulombField(q, shift(rs), shift(r)), coulombField(q, rs, r))).toBe(true);
    expect(relativeError(coulombPotential(q, shift(rs), shift(r)), coulombPotential(q, rs, r))).toBeLessThan(1e-14);
  });

  it('doubling |r − r′| along the same line quarters E and halves V; doubling q doubles both', () => {
    const rs: Vec3 = [0.2, 0.1, 0];
    const E1 = len3(coulombField(q, rs, [0.5, 0.5, 0]));
    const E2 = len3(coulombField(q, rs, [0.8, 0.9, 0]));
    expect(relativeError(E1 / E2, 4)).toBeLessThan(1e-13);
    expect(relativeError(coulombPotential(q, rs, [0.5, 0.5, 0]) / coulombPotential(q, rs, [0.8, 0.9, 0]), 2)).toBeLessThan(1e-13);
    expect(relativeError(len3(coulombField(2 * q, rs, [0.5, 0.5, 0])), 2 * E1)).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  const V = (x: number, y: number) => potentialAt([{ x: 0, y: 0, q }], x, y);
  const exact = -fieldAt([{ x: 0, y: 0, q }], 0.3, 0.2)[0];

  it('the forward difference quotient tends to ∂V/∂x with an error O(h)', () => {
    const e = [0.04, 0.02, 0.01, 0.005].map((h) => Math.abs(differenceQuotient(V, 0.3, 0.2, 'x', h) - exact));
    for (let i = 1; i < e.length; i++) expect(e[i - 1] / e[i]).toBeGreaterThan(1.8);
    for (let i = 1; i < e.length; i++) expect(e[i - 1] / e[i]).toBeLessThan(2.3);
    expect(relativeError(differenceQuotient(V, 0.3, 0.2, 'x', 1e-6), exact)).toBeLessThan(1e-4);
  });

  it('the central quotient converges as O(h²)', () => {
    const c = (h: number) => Math.abs(partial(V, 0.3, 0.2, 'x', h) - exact);
    expect(c(0.02) / c(0.01)).toBeGreaterThan(3.5);
    expect(c(0.02) / c(0.01)).toBeLessThan(4.5);
  });
});
