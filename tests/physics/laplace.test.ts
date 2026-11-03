import { describe, expect, it } from 'vitest';
import { EPS0, K } from '~/physics/constants';
import {
  fix,
  imageField,
  imageForce,
  imagePotential,
  inducedDensity,
  jacobiStep,
  makeGrid,
  relax,
  residual,
  sorStep,
} from '~/physics/laplace';
import { riemann } from '~/physics/calculus';
import { relativeError } from '~/physics/vec';
import { gradient2, laplacian2 } from '~/physics/vectorcalc';

/** Two parallel plates: left column at V0, right column at 0, top and bottom edges ramped linearly. */
function platesGrid(n: number, V0: number) {
  const g = makeGrid(n, n, 0.01);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) fix(g, i, j, V0 * (1 - i / (n - 1)));
    }
  }
  return g;
}

describe('analytic limits', () => {
  it('between plates with a linear boundary the solution is the linear potential', () => {
    const n = 21;
    const g = platesGrid(n, 10);
    relax(g, 1e-10);
    for (const i of [3, 10, 17]) expect(g.V[10 * n + i]).toBeCloseTo(10 * (1 - i / (n - 1)), 6);
  });

  it('the image potential is zero on the plane and kq/r near the charge', () => {
    const qv = 1e-9;
    const d = 0.1;
    for (const x of [-0.3, 0, 0.05, 1]) expect(imagePotential(qv, d, x, 0)).toBeCloseTo(0, 12);
    const r = 1e-4;
    expect(relativeError(imagePotential(qv, d, r, d), (K * qv) / r)).toBeLessThan(1e-3);
  });

  it('the force toward the plane is the Coulomb force from the image at distance 2d', () => {
    const qv = 1e-9;
    const d = 0.1;
    expect(relativeError(imageForce(qv, d), (K * qv * qv) / (2 * d) ** 2)).toBeLessThan(1e-14);
  });

  it('the field just above the plane is perpendicular to it and equals σ/ε₀', () => {
    const qv = 1e-9;
    const d = 0.1;
    for (const s of [0, 0.05, 0.2]) {
      const e = imageField(qv, d, s, 1e-9);
      expect(Math.abs(e[0])).toBeLessThan(1e-6 * Math.abs(e[1]));
      expect(relativeError(e[1], inducedDensity(qv, d, s) / EPS0)).toBeLessThan(1e-6);
    }
  });
});

describe('identities', () => {
  it('the image potential satisfies Laplace’s equation above the plane (3D, by symmetry about the axis)', () => {
    // the in-page slice of a 3D potential: add the out-of-page term, which by rotational symmetry about x = 0 is (1/x)∂V/∂x
    const qv = 1e-9;
    const d = 0.1;
    const V = (x: number, y: number) => imagePotential(qv, d, x, y);
    const x = 0.07;
    const y = 0.04;
    const lap = laplacian2(V, x, y, 1e-4) + gradient2(V, x, y, 1e-6)[0] / x;
    expect(Math.abs(lap)).toBeLessThan(1e-5 * (Math.abs(V(x, y)) / (y * y)));
  });

  it('every free node is the average of its neighbours once relaxed (mean value)', () => {
    const g = makeGrid(25, 25, 0.01, 0);
    fix(g, 12, 12, 5);
    fix(g, 6, 18, -3);
    relax(g, 1e-12);
    const k = 9 * 25 + 15;
    expect(g.V[k]).toBeCloseTo((g.V[k - 1] + g.V[k + 1] + g.V[k - 25] + g.V[k + 25]) / 4, 9);
  });

  it('no interior maximum: a free node never exceeds the largest fixed potential', () => {
    const g = makeGrid(25, 25, 0.01, 0);
    fix(g, 12, 12, 5);
    relax(g, 1e-10);
    let max = -Infinity;
    for (let k = 0; k < g.V.length; k++) if (!g.fixed[k]) max = Math.max(max, g.V[k]);
    expect(max).toBeLessThan(5);
  });
});

describe('conservation', () => {
  it('the charge induced on the plane totals −q', () => {
    const qv = 1e-9;
    const d = 0.1;
    // ∫ σ·2πs ds from 0 to ∞; substitute s = d·tanθ to integrate over a finite range
    const total = riemann((t) => {
      const s = d * Math.tan(t);
      return inducedDensity(qv, d, s) * 2 * Math.PI * s * d / Math.cos(t) ** 2;
    }, 0, Math.PI / 2, 4000);
    expect(relativeError(total, -qv)).toBeLessThan(1e-6);
  });

  it('uniqueness: two different starting guesses relax to the same solution', () => {
    const a = makeGrid(21, 21, 0.01, 0);
    const b = makeGrid(21, 21, 0.01, 0);
    fix(a, 10, 10, 4);
    fix(b, 10, 10, 4);
    for (let k = 0; k < b.V.length; k++) if (!b.fixed[k]) b.V[k] = 7 * Math.sin(k);
    relax(a, 1e-12);
    relax(b, 1e-12);
    for (let k = 0; k < a.V.length; k++) expect(a.V[k]).toBeCloseTo(b.V[k], 8);
  });

  it('Poisson: a grid with uniform ρ relaxes to ∇²V = −ρ/ε₀', () => {
    const n = 31;
    const g = makeGrid(n, n, 0.01, 0);
    g.rho = new Float64Array(n * n).fill(1e-9);
    relax(g, 1e-12);
    expect(residual(g)).toBeLessThan(1e-6 * (1e-9 / EPS0));
  });
});

describe('convergence', () => {
  it('the largest Jacobi change shrinks monotonically sweep after sweep', () => {
    const g = makeGrid(21, 21, 0.01, 0);
    fix(g, 10, 10, 5);
    let last = Infinity;
    for (let n = 0; n < 200; n++) {
      const c = jacobiStep(g);
      expect(c).toBeLessThanOrEqual(last + 1e-15);
      last = c;
    }
  });

  it('over-relaxation reaches the same answer in fewer sweeps than Gauss–Seidel', () => {
    const mk = () => {
      const g = makeGrid(31, 31, 0.01, 0);
      fix(g, 15, 15, 5);
      return g;
    };
    const gs = mk();
    const sor = mk();
    const nGs = relax(gs, 1e-8, 50000, 1);
    const nSor = relax(sor, 1e-8, 50000, 1.85);
    expect(nSor).toBeLessThan(nGs / 3);
    expect(sor.V[10 * 31 + 10]).toBeCloseTo(gs.V[10 * 31 + 10], 5);
    expect(sorStep(sor)).toBeLessThan(1e-7);
  });
});

describe('scaling', () => {
  it('doubling every fixed potential doubles the solution (linearity)', () => {
    const a = makeGrid(21, 21, 0.01, 0);
    const b = makeGrid(21, 21, 0.01, 0);
    fix(a, 8, 8, 3);
    fix(b, 8, 8, 6);
    relax(a, 1e-12);
    relax(b, 1e-12);
    expect(b.V[12 * 21 + 12]).toBeCloseTo(2 * a.V[12 * 21 + 12], 8);
  });

  it('the image force falls as 1/d²', () => {
    expect(imageForce(1e-9, 0.2)).toBeCloseTo(imageForce(1e-9, 0.1) / 4, 20);
  });
});
