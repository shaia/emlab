import { describe, expect, it } from 'vitest';
import { MU0 } from '~/physics/constants';
import { circlePath, discFractionInside, edgeSums, rectPath, thickWireField, thickWireFieldAt } from '~/physics/coils';
import { straightWireField } from '~/physics/magnetism';
import { len, relativeError } from '~/physics/vec';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const w = { x: 0.01, y: -0.02, R: 0.1, I: 10 };
const f = (x: number, y: number) => thickWireFieldAt(w, x, y);

describe('analytic limit: the field of a thick wire', () => {
  it('is zero on the axis, grows as r inside, and matches the thin-wire field at and beyond the surface', () => {
    expect(len(f(w.x, w.y))).toBe(0);
    expect(relativeError(len(f(w.x + 0.05, w.y)), (MU0 * 10 * 0.05) / (2 * Math.PI * 0.01))).toBeLessThan(1e-12);
    expect(relativeError(thickWireField(10, 0.1, 0.1), straightWireField(10, 0.1))).toBeLessThan(1e-12);
    expect(relativeError(len(f(w.x, w.y + 0.3)), straightWireField(10, 0.3))).toBeLessThan(1e-12);
  });

  it('circles the axis counterclockwise for a current out of the page, like a thin wire', () => {
    const [bx, by] = f(w.x + 0.05, w.y);
    expect(Math.abs(bx)).toBeLessThan(1e-20);
    expect(by).toBeGreaterThan(0);
  });

  it('at half the radius the field equals the field at twice the radius; the maximum is at the surface', () => {
    expect(relativeError(thickWireField(10, 0.1, 0.05), thickWireField(10, 0.1, 0.2))).toBeLessThan(1e-12);
    for (const r of [0.02, 0.07, 0.13, 0.3]) expect(thickWireField(10, 0.1, r)).toBeLessThan(thickWireField(10, 0.1, 0.1));
  });
});

describe("conservation: Ampère's law with a current spread over the cross-section", () => {
  it('a circle of radius r < R around the axis encloses I·r²/R², and the sum is μ₀ times that', () => {
    const path = circlePath(w.x, w.y, 0.05, 360);
    expect(relativeError(discFractionInside(path, w.x, w.y, w.R), 0.25)).toBeLessThan(0.01);
    expect(relativeError(sum(edgeSums(f, path, 5e-4)), MU0 * 10 * 0.25)).toBeLessThan(1e-3);
  });

  it('any path, even one that cuts through the wire, sums to μ₀ times the part of the current inside it', () => {
    const path = rectPath(-0.05, -0.1, 0.2, 0.1);
    const frac = discFractionInside(path, w.x, w.y, w.R);
    expect(frac).toBeGreaterThan(0.3);
    expect(frac).toBeLessThan(0.9);
    expect(relativeError(sum(edgeSums(f, path, 5e-4)), MU0 * 10 * frac)).toBeLessThan(0.01);
  });

  it('a path that encloses the whole wire sums to μ₀I, and one beside it to zero', () => {
    expect(relativeError(sum(edgeSums(f, rectPath(-0.2, -0.2, 0.2, 0.2), 5e-4)), MU0 * 10)).toBeLessThan(1e-4);
    expect(Math.abs(sum(edgeSums(f, rectPath(0.15, -0.1, 0.3, 0.1), 5e-4)))).toBeLessThan(1e-4 * MU0);
  });
});

describe('scaling (the dimensional proxy)', () => {
  it('inside, doubling the radius of the wire at the same current quarters the field at a given r', () => {
    expect(relativeError(thickWireField(10, 0.2, 0.05), thickWireField(10, 0.1, 0.05) / 4)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the disc fraction converges as the grid is refined', () => {
    const path = circlePath(w.x, w.y, 0.06, 720);
    const err = (n: number) => Math.abs(discFractionInside(path, w.x, w.y, w.R, n) - 0.36);
    expect(err(400)).toBeLessThan(err(40) + 1e-12);
    expect(err(400)).toBeLessThan(0.005);
  });
});
