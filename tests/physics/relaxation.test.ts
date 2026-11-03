import { describe, expect, it } from 'vitest';
import { EPS0, K } from '~/physics/constants';
import { riemann } from '~/physics/calculus';
import { relax, residual } from '~/physics/laplace';
import { earthedSphereCharge } from '~/physics/potential';
import {
  boxSeries,
  buildScene,
  freeExtremes,
  lineImageField,
  lineImageForce,
  lineImagePotential,
  lineInducedDensity,
  lineInducedWithin,
  maxDifference,
  neighbourMean,
  SCENE_H,
  SCENE_NX,
  SCENE_NY,
  SCENE_V0,
  sphereImage,
  sphereImageForce,
  sphereImagePotential,
  touchesFixed,
} from '~/physics/relaxation';
import { imageForce } from '~/physics/laplace';
import { relativeError } from '~/physics/vec';
import { gradient2, laplacian2 } from '~/physics/vectorcalc';

const LAMBDA = 1e-9;
const D = 0.12;

/** relative error of the relaxed image scene against 2kλ·ln(r₂/r₁) at node offsets from the source */
function imageErrors(nx: number, ny: number, h: number, offsets: [number, number][]) {
  const s = buildScene('image', nx, ny, h);
  relax(s.grid, 1e-10, 40000, 1.9);
  const src = s.source!;
  return offsets.map(([dx, dy]) => {
    const i = src.i + Math.round(dx / h);
    const j = src.j + Math.round(dy / h);
    const exact = lineImagePotential(src.lambda, src.d, s.x0 + i * h, s.y0 + j * h);
    return relativeError(s.grid.V[j * nx + i], exact);
  });
}

describe('analytic limits', () => {
  it('the line-charge image potential is zero on the plane and grows like 2kλ·ln(2d/r) next to the line', () => {
    for (const x of [-0.5, 0, 0.03, 2]) expect(lineImagePotential(LAMBDA, D, x, 1e-12)).toBeCloseTo(0, 6);
    const r = 1e-5;
    expect(relativeError(lineImagePotential(LAMBDA, D, r, D), 2 * K * LAMBDA * Math.log((2 * D) / r))).toBeLessThan(1e-6);
  });

  it('far from the plane the line and its image look like a line dipole: V → 4kλd·y/r²', () => {
    const x = 30;
    const y = 40;
    const r2 = x * x + y * y;
    expect(relativeError(lineImagePotential(LAMBDA, D, x, y), (4 * K * LAMBDA * D * y) / r2)).toBeLessThan(1e-4);
  });

  it('the relaxed box matches the Fourier-series solution of Laplace’s equation', () => {
    const s = buildScene('box');
    relax(s.grid, 1e-10, 40000, 1.9);
    const a = (SCENE_NX - 1) * SCENE_H;
    const b = (SCENE_NY - 1) * SCENE_H;
    for (const [i, j] of [[40, 25], [20, 40], [10, 10], [70, 45]]) {
      expect(relativeError(s.grid.V[j * SCENE_NX + i], boxSeries(SCENE_V0, a, b, i * SCENE_H, j * SCENE_H))).toBeLessThan(2e-3);
    }
  });

  it('the sphere image makes every point of the grounded sphere V = 0', () => {
    const q = 2e-9;
    const Dc = 0.3;
    const R = 0.1;
    for (const th of [0, 0.4, 1.3, 2.2, Math.PI]) {
      const x = R * 1.0000001 * Math.cos(th);
      const y = R * 1.0000001 * Math.sin(th);
      expect(Math.abs(sphereImagePotential(q, Dc, R, x, y))).toBeLessThan(1e-4 * ((K * q) / (Dc - R)));
    }
  });

  it('a huge sphere seen from close by is a plane: the sphere force tends to kq²/(2s)²', () => {
    const q = 1e-9;
    const s = 0.05;
    const R = 1e4;
    expect(relativeError(sphereImageForce(q, R + s, R), imageForce(q, s))).toBeLessThan(1e-4);
  });
});

describe('identities', () => {
  it('the line-charge image potential satisfies Laplace’s equation above the plane', () => {
    const V = (x: number, y: number) => lineImagePotential(LAMBDA, D, x, y);
    for (const [x, y] of [[0.05, 0.04], [-0.2, 0.3], [0.1, 0.12]]) {
      expect(Math.abs(laplacian2(V, x, y, 1e-4))).toBeLessThan(1e-4 * (Math.abs(V(x, y)) / (y * y)));
    }
  });

  it('the image field is minus the gradient of the image potential', () => {
    const V = (x: number, y: number) => lineImagePotential(LAMBDA, D, x, y);
    const [x, y] = [0.07, 0.05];
    const g = gradient2(V, x, y, 1e-7);
    const E = lineImageField(LAMBDA, D, x, y);
    expect(relativeError(E[0], -g[0])).toBeLessThan(1e-5);
    expect(relativeError(E[1], -g[1])).toBeLessThan(1e-5);
  });

  it('just above the plane the field is perpendicular to it and equals σ/ε₀', () => {
    for (const x of [0, 0.05, 0.4]) {
      const E = lineImageField(LAMBDA, D, x, 1e-9);
      expect(Math.abs(E[0])).toBeLessThan(1e-6 * Math.abs(E[1]));
      expect(relativeError(E[1], lineInducedDensity(LAMBDA, D, x) / EPS0)).toBeLessThan(1e-6);
    }
  });

  it('the force per metre on the line is λ times the field of its image', () => {
    expect(relativeError(lineImageForce(LAMBDA, D), LAMBDA * ((2 * K * LAMBDA) / (2 * D)))).toBeLessThan(1e-14);
  });

  it('relaxed, every free node is the mean of its neighbours, and the largest free value touches a conductor', () => {
    const s = buildScene('plates');
    relax(s.grid, 1e-11, 40000, 1.9);
    expect(s.grid.V[25 * SCENE_NX + 40]).toBeCloseTo(neighbourMean(s.grid, 40, 25), 8);
    const { max, min } = freeExtremes(s.grid);
    expect(max.V).toBeLessThan(SCENE_V0);
    expect(min.V).toBeGreaterThan(-SCENE_V0);
    expect(touchesFixed(s.grid, max.i, max.j)).toBe(true);
    expect(touchesFixed(s.grid, min.i, min.j)).toBe(true);
  });

  it('lesson 2.5’s earthed-sphere charge is the sphere image, sitting at R²/D', () => {
    const im = sphereImage(3e-9, 0.4, 0.1);
    expect(im.q).toBe(earthedSphereCharge(3e-9, 0.4, 0.1));
    expect(relativeError(im.at, 0.025)).toBeLessThan(1e-14);
  });
});

describe('conservation', () => {
  it('the charge induced on the plane totals −λ per metre of length', () => {
    // ∫ σ dx over the whole plane, with x = d·tanθ
    const total = riemann((t) => lineInducedDensity(LAMBDA, D, D * Math.tan(t)) * (D / Math.cos(t) ** 2), -Math.PI / 2, Math.PI / 2, 4000);
    expect(relativeError(total, -LAMBDA)).toBeLessThan(1e-6);
    expect(relativeError(lineInducedWithin(LAMBDA, D, 1e9), -LAMBDA)).toBeLessThan(1e-8);
  });

  it('the strip formula is the integral of σ over the strip', () => {
    const X = 0.3;
    expect(relativeError(riemann((x) => lineInducedDensity(LAMBDA, D, x), -X, X, 4000), lineInducedWithin(LAMBDA, D, X))).toBeLessThan(1e-6);
  });

  it('uniqueness: with the same boundary values, the relaxed grid reproduces the image solution', () => {
    const errs = imageErrors(SCENE_NX, SCENE_NY, SCENE_H, [[0.03, 0], [0, 0.05], [0.1, 0], [0, -0.06], [0.2, 0.1], [-0.3, 0.2]]);
    for (const e of errs) expect(e).toBeLessThan(0.006);
  });

  it('uniqueness: a scrambled starting guess relaxes to the same potential', () => {
    const a = buildScene('plates');
    const b = buildScene('plates');
    for (let k = 0; k < b.grid.V.length; k++) if (!b.grid.fixed[k]) b.grid.V[k] = 80 * Math.sin(7 * k);
    relax(a.grid, 1e-11, 40000, 1.9);
    relax(b.grid, 1e-11, 40000, 1.9);
    expect(maxDifference(a.grid.V, b.grid.V)).toBeLessThan(1e-7);
  });
});

describe('scaling', () => {
  it('the force per metre on a line charge falls as 1/d, not 1/d²', () => {
    expect(relativeError(lineImageForce(LAMBDA, 0.2), lineImageForce(LAMBDA, 0.1) / 2)).toBeLessThan(1e-14);
  });

  it('doubling λ doubles the potential everywhere', () => {
    expect(relativeError(lineImagePotential(2 * LAMBDA, D, 0.1, 0.07), 2 * lineImagePotential(LAMBDA, D, 0.1, 0.07))).toBeLessThan(1e-14);
  });

  it('the sphere force grows as q²', () => {
    expect(relativeError(sphereImageForce(2e-9, 0.3, 0.1), 4 * sphereImageForce(1e-9, 0.3, 0.1))).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  it('halving the grid spacing shrinks the error at a fixed point near the line charge', () => {
    // the same physical box, 0.8 m × 0.5 m: 81 × 51 nodes 1 cm apart, then 161 × 101 nodes 5 mm apart
    const coarse = imageErrors(81, 51, 0.01, [[0.02, 0]])[0];
    const fine = imageErrors(161, 101, 0.005, [[0.02, 0]])[0];
    expect(fine).toBeLessThan(coarse / 2);
  });

  it('relaxation drives the residual down by many orders of magnitude', () => {
    const s = buildScene('image');
    const r0 = residual(s.grid);
    relax(s.grid, 1e-10, 40000, 1.9);
    expect(residual(s.grid)).toBeLessThan(1e-6 * r0);
  });
});
