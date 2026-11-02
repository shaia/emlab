import { describe, expect, it } from 'vitest';
import { MU0 } from '~/physics/constants';
import { parallelWiresForce, straightWireField, type Wire } from '~/physics/magnetism';
import { fieldAtWire, netForcePerLength, pairForcePerLength } from '~/physics/wires';
import { dot, len, relativeError, sub, type Vec2 } from '~/physics/vec';

// Closed forms only (no integrator or tracer), so there is no convergence category here. The figure's
// field lines come from wireFlux (src/physics/wireflux.ts, lesson 4.2), which has its own convergence test.

const unit = (a: Vec2): Vec2 => [a[0] / len(a), a[1] / len(a)];

describe('analytic limit: two wires', () => {
  it('the historic ampere: 1 A in each wire, 1 m apart, gives 2·10⁻⁷ N per metre', () => {
    const w: Wire[] = [
      { x: 0, y: 0, I: 1 },
      { x: 1, y: 0, I: 1 },
    ];
    expect(relativeError(len(pairForcePerLength(w, 1, 0)), 2e-7)).toBeLessThan(1e-12);
  });

  it('the size is μ₀I₁I₂/(2πd), the formula-sheet law, for unequal currents', () => {
    const w: Wire[] = [
      { x: -0.02, y: 0.01, I: 8 },
      { x: 0.03, y: 0.01, I: 12 },
    ];
    const f = len(pairForcePerLength(w, 1, 0));
    expect(relativeError(f, (MU0 * 8 * 12) / (2 * Math.PI * 0.05))).toBeLessThan(1e-12);
    expect(relativeError(f, parallelWiresForce(8, 12, 0.05))).toBeLessThan(1e-12);
    // it is B of wire 1 at wire 2 times I₂ (F = BIL with L = 1 m)
    expect(relativeError(f, straightWireField(8, 0.05) * 12)).toBeLessThan(1e-12);
  });

  it('currents in the same direction attract: the force on each points at the other', () => {
    for (const I of [5, -5]) {
      const w: Wire[] = [
        { x: 0, y: 0, I },
        { x: 0.1, y: 0, I: 2 * I },
      ];
      expect(pairForcePerLength(w, 1, 0)[0]).toBeLessThan(0); // wire 2 pulled left, toward wire 1
      expect(pairForcePerLength(w, 0, 1)[0]).toBeGreaterThan(0); // wire 1 pulled right
    }
  });

  it('opposite currents repel: the force on each points away from the other', () => {
    const w: Wire[] = [
      { x: 0, y: 0, I: 10 },
      { x: 0, y: 0.06, I: -4 },
    ];
    expect(pairForcePerLength(w, 1, 0)[1]).toBeGreaterThan(0); // the upper wire is pushed up
    expect(pairForcePerLength(w, 0, 1)[1]).toBeLessThan(0);
  });

  it('the field that pushes wire 2 is wire 1’s field, perpendicular to the force', () => {
    const w: Wire[] = [
      { x: 0, y: 0, I: 10 },
      { x: 0.1, y: 0, I: 10 },
    ];
    const B = fieldAtWire(w, 1);
    expect(B[1]).toBeGreaterThan(0); // up, by the grip rule for ⊙
    expect(relativeError(len(B), straightWireField(10, 0.1))).toBeLessThan(1e-12);
    expect(Math.abs(dot(B, netForcePerLength(w, 1)))).toBeLessThan(1e-30);
  });

  it('three equal currents at the corners of an equilateral triangle pull each wire toward the centre, √3 times one pair', () => {
    const a = 0.1;
    const w: Wire[] = [
      { x: 0, y: 0, I: 10 },
      { x: a, y: 0, I: 10 },
      { x: a / 2, y: (a * Math.sqrt(3)) / 2, I: 10 },
    ];
    const c: Vec2 = [a / 2, a / (2 * Math.sqrt(3))];
    for (let i = 0; i < 3; i++) {
      const f = netForcePerLength(w, i);
      expect(relativeError(len(f), Math.sqrt(3) * parallelWiresForce(10, 10, a))).toBeLessThan(1e-12);
      const toC = unit(sub(c, [w[i].x, w[i].y]));
      expect(dot(unit(f), toC)).toBeGreaterThan(1 - 1e-12);
    }
  });

  it('a wire midway between two equal, same-direction currents feels no net force', () => {
    const w: Wire[] = [
      { x: -0.08, y: 0, I: 10 },
      { x: 0, y: 0, I: 7 },
      { x: 0.08, y: 0, I: 10 },
    ];
    expect(len(netForcePerLength(w, 1))).toBeLessThan(1e-12 * parallelWiresForce(10, 7, 0.08));
  });
});

describe('conservation: Newton’s third law (total momentum of the wires does not change)', () => {
  it('the two forces of a pair are equal and opposite even when the currents differ', () => {
    const w: Wire[] = [
      { x: 0.01, y: -0.02, I: 30 },
      { x: 0.05, y: 0.01, I: -5 },
    ];
    const f12 = pairForcePerLength(w, 1, 0);
    const f21 = pairForcePerLength(w, 0, 1);
    expect(relativeError(len(f12), len(f21))).toBeLessThan(1e-12);
    expect(len([f12[0] + f21[0], f12[1] + f21[1]])).toBeLessThan(1e-12 * len(f12));
  });

  it('the net forces on all the wires of a set add up to zero', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let trial = 0; trial < 20; trial++) {
      const n = 2 + (trial % 4);
      const w: Wire[] = Array.from({ length: n }, () => ({ x: 0.2 * rand(), y: 0.2 * rand(), I: 20 * rand() }));
      let sx = 0;
      let sy = 0;
      let scale = 0;
      for (let i = 0; i < n; i++) {
        const f = netForcePerLength(w, i);
        sx += f[0];
        sy += f[1];
        scale = Math.max(scale, len(f));
      }
      expect(Math.hypot(sx, sy)).toBeLessThan(1e-12 * scale);
    }
  });

  it('the net force is the sum of the pair forces (superposition)', () => {
    const w: Wire[] = [
      { x: 0, y: 0, I: 10 },
      { x: 0.03, y: 0, I: 15 },
      { x: 0, y: 0.04, I: -20 },
    ];
    const net = netForcePerLength(w, 0);
    const a = pairForcePerLength(w, 0, 1);
    const b = pairForcePerLength(w, 0, 2);
    expect(relativeError(net[0], a[0] + b[0])).toBeLessThan(1e-12);
    expect(relativeError(net[1], a[1] + b[1])).toBeLessThan(1e-12);
    // worked example 4.9-5: 10⁻³ N/m toward B and 10⁻³ N/m away from C
    expect(relativeError(net[0], 1e-3)).toBeLessThan(1e-12);
    expect(relativeError(net[1], -1e-3)).toBeLessThan(1e-12);
  });
});

describe('scaling: F/L ∝ I₁I₂/d', () => {
  const base: Wire[] = [
    { x: 0, y: 0, I: 6 },
    { x: 0.04, y: 0.03, I: 9 },
  ];
  const f0 = len(pairForcePerLength(base, 1, 0));

  it('doubling one current doubles the force on both wires', () => {
    const w = [base[0], { ...base[1], I: 18 }];
    expect(relativeError(len(pairForcePerLength(w, 1, 0)), 2 * f0)).toBeLessThan(1e-12);
    expect(relativeError(len(pairForcePerLength(w, 0, 1)), 2 * f0)).toBeLessThan(1e-12);
  });

  it('doubling the distance halves the force (1/d, not 1/d²)', () => {
    const w = [base[0], { ...base[1], x: 0.08, y: 0.06 }];
    expect(relativeError(len(pairForcePerLength(w, 1, 0)), f0 / 2)).toBeLessThan(1e-12);
  });

  it('reversing both currents leaves every force unchanged', () => {
    const w = base.map((b) => ({ ...b, I: -b.I }));
    const a = pairForcePerLength(w, 1, 0);
    const b = pairForcePerLength(base, 1, 0);
    expect(relativeError(a[0], b[0])).toBeLessThan(1e-12);
    expect(relativeError(a[1], b[1])).toBeLessThan(1e-12);
  });
});
