import { describe, expect, it } from 'vitest';
import { MU0 } from '~/physics/constants';
import {
  BS,
  circleElementsX,
  dipoleAxisField,
  elementField,
  elementFieldMagnitude,
  elementsField,
  loopMoment,
  polygonCenterField,
  polylineElementsN,
  polylineField,
  polylineFieldExact,
  regularPolygon,
  segmentField,
  segmentFieldAt,
  semiInfiniteWireField,
  solenoidAxisFraction,
  squareCenterField,
  stackedLoopsAxisField,
  symmetricSegmentField,
} from '~/physics/biotsavart';
import { finiteSolenoidAxisField, loopAxisField, loopCenterField, loopField, solenoidField, straightWireField } from '~/physics/magnetism';
import { curl3, divergence3 } from '~/physics/vectorcalc';
import type { Vec3 } from '~/physics/vec';
import { len3, relativeError } from '~/physics/vec';

const I = 5;
const square = (a: number): Vec3[] => [
  [-a / 2, -a / 2, 0],
  [a / 2, -a / 2, 0],
  [a / 2, a / 2, 0],
  [-a / 2, a / 2, 0],
];

describe('analytic limits', () => {
  it('a very long segment gives the infinite wire μ₀I/(2πs)', () => {
    expect(relativeError(symmetricSegmentField(I, 1e4, 0.05), straightWireField(I, 0.05))).toBeLessThan(1e-6);
    const B = segmentField(I, [-1e4, 0, 0], [1e4, 0, 0], [0, 0.05, 0]);
    expect(relativeError(len3(B), straightWireField(I, 0.05))).toBeLessThan(1e-6);
  });

  it('opposite the end of a very long wire the field is half the infinite wire', () => {
    expect(relativeError(segmentFieldAt(I, 0.05, 0, 1e4), straightWireField(I, 0.05) / 2)).toBeLessThan(1e-6);
    expect(relativeError(semiInfiniteWireField(I, 0.05), straightWireField(I, 0.05) / 2)).toBeLessThan(1e-12);
  });

  it('a segment much shorter than the distance acts as one element μ₀IL/(4πs²)', () => {
    const L = 1e-4;
    const s = 0.1;
    expect(relativeError(symmetricSegmentField(I, L, s), elementFieldMagnitude(I, L, s, Math.PI / 2))).toBeLessThan(1e-6);
  });

  it('the closed-form segment equals the converged midpoint sum, at an off-centre point', () => {
    const a: Vec3 = [-0.1, 0, 0];
    const b: Vec3 = [0.15, 0.02, 0];
    const p: Vec3 = [0.03, 0.07, 0.02];
    const exact = segmentField(I, a, b, p);
    const sum = polylineField(I, [a, b], p, 4000);
    for (let i = 0; i < 3; i++) expect(Math.abs(exact[i] - sum[i])).toBeLessThan(1e-7 * len3(exact));
  });

  it('the arc sum on the axis of a loop equals μ₀IR²/(2(R²+z²)^{3/2}) for any N ≥ 3', () => {
    for (const N of [3, 8, 40]) {
      for (const z of [0, 0.03, 0.2]) {
        const { total } = elementsField(I, circleElementsX(0.05, N), [z, 0, 0]);
        expect(relativeError(total[0], loopAxisField(I, 0.05, z))).toBeLessThan(1e-12);
        expect(Math.hypot(total[1], total[2])).toBeLessThan(1e-12 * total[0]);
      }
    }
  });

  it('off the axis, the converged arc sum matches the exact elliptic-integral loop field', () => {
    const R = 0.05;
    const { total } = elementsField(I, circleElementsX(R, 4000), [0.02, 0.03, 0]);
    const exact = loopField(I, R, 0.03, 0.02); // (ρ, z) in the loop's own frame: axis = our x
    expect(relativeError(total[0], exact.z)).toBeLessThan(1e-6);
    expect(relativeError(total[1], exact.rho)).toBeLessThan(1e-6);
  });

  it('the centre of a square loop: 2√2·μ₀I/(πa), from four exact segments and from the midpoint sum', () => {
    const a = 0.1;
    const exact = polylineFieldExact(I, square(a), [0, 0, 0], true);
    expect(relativeError(exact[2], squareCenterField(I, a))).toBeLessThan(1e-12);
    expect(relativeError(polylineField(I, square(a), [0, 0, 0], 2000, true)[2], squareCenterField(I, a))).toBeLessThan(1e-6);
  });

  it('a regular polygon tends to the circle: N·tan(π/N)/π → 1', () => {
    const R = 0.05;
    expect(relativeError(polylineFieldExact(I, regularPolygon(R, 6), [0, 0, 0], true)[2], polygonCenterField(I, R, 6))).toBeLessThan(1e-12);
    expect(relativeError(polygonCenterField(I, R, 4), squareCenterField(I, R * Math.SQRT2))).toBeLessThan(1e-12);
    expect(relativeError(polygonCenterField(I, R, 1e5), loopCenterField(I, R))).toBeLessThan(1e-8);
  });

  it('far along the axis a loop is a magnetic dipole, μ₀m/(2πz³) with m = IπR²', () => {
    const R = 0.05;
    expect(relativeError(loopAxisField(I, R, 100), dipoleAxisField(loopMoment(I, R), 100))).toBeLessThan(1e-6);
  });

  it('stacked loops converge to the finite solenoid, and a long one to μ₀nI', () => {
    const N = 400;
    const L = 0.4;
    const R = 0.02;
    const Iturn = 2;
    expect(relativeError(stackedLoopsAxisField(N, L, R, Iturn, 0), finiteSolenoidAxisField(N, L, R, Iturn, 0))).toBeLessThan(1e-4);
    expect(relativeError(stackedLoopsAxisField(N, L, R, Iturn, L / 2), finiteSolenoidAxisField(N, L, R, Iturn, L / 2))).toBeLessThan(1e-3);
    expect(relativeError(finiteSolenoidAxisField(N, 1e3, R, Iturn, 0), solenoidField(N, 1e3, Iturn))).toBeLessThan(1e-9);
    expect(relativeError(solenoidAxisFraction(L, R, 0), finiteSolenoidAxisField(N, L, R, Iturn, 0) / solenoidField(N, L, Iturn))).toBeLessThan(1e-12);
    // at the end of a long solenoid: half of the inside value
    expect(relativeError(solenoidAxisFraction(1e3, R, 500), 0.5)).toBeLessThan(1e-9);
  });
});

describe('identities', () => {
  const B = (p: Vec3) => polylineFieldExact(I, square(0.1), p, true);
  const points: Vec3[] = [
    [0.01, 0.02, 0.03],
    [0.12, -0.04, 0.05],
    [-0.02, 0.09, -0.04],
  ];

  it('∇·B = 0 everywhere off the wire (no magnetic charge)', () => {
    for (const p of points) {
      const scale = len3(B(p)) / 0.05;
      expect(Math.abs(divergence3(B, p, 1e-5))).toBeLessThan(1e-5 * scale);
    }
  });

  it('∇×B = 0 off the wire (Ampère in empty space), for the closed square circuit', () => {
    for (const p of points) {
      const scale = len3(B(p)) / 0.05;
      expect(len3(curl3(B, p, 1e-5))).toBeLessThan(1e-5 * scale);
    }
  });

  it('a planar circuit makes a field perpendicular to its plane at points in that plane', () => {
    const b = B([0.02, -0.01, 0]);
    expect(Math.hypot(b[0], b[1])).toBeLessThan(1e-12 * Math.abs(b[2]));
  });

  it('an element contributes nothing at a point on its own line, and its field is perpendicular to dl and r', () => {
    expect(len3(elementField(I, [0.001, 0, 0], [0, 0, 0], [0.3, 0, 0]))).toBe(0);
    const dl: Vec3 = [0.001, 0.0005, 0];
    const p: Vec3 = [0.02, 0.05, 0.01];
    const d = elementField(I, dl, [0, 0, 0], p);
    expect(Math.abs(d[0] * dl[0] + d[1] * dl[1] + d[2] * dl[2])).toBeLessThan(1e-12 * len3(d) * len3(dl));
    expect(Math.abs(d[0] * p[0] + d[1] * p[1] + d[2] * p[2])).toBeLessThan(1e-12 * len3(d) * len3(p));
  });

  it('the right-hand direction: current along +x, a point above (+y) gets a field out of the page (+z)', () => {
    expect(elementField(I, [0.001, 0, 0], [0, 0, 0], [0, 0.05, 0])[2]).toBeGreaterThan(0);
    expect(segmentField(I, [-0.1, 0, 0], [0.1, 0, 0], [0, -0.05, 0])[2]).toBeLessThan(0);
  });

  it('μ₀/(4π) is 10⁻⁷ T·m/A with the formula sheet’s μ₀', () => {
    expect(relativeError(BS, 1e-7)).toBeLessThan(1e-15);
    expect(relativeError(BS * 4 * Math.PI, MU0)).toBeLessThan(1e-15);
  });
});

describe('scaling', () => {
  it('doubling the current doubles B', () => {
    const p: Vec3 = [0.02, 0.06, 0];
    const b1 = polylineFieldExact(I, square(0.1), p, true);
    const b2 = polylineFieldExact(2 * I, square(0.1), p, true);
    expect(relativeError(b2[2], 2 * b1[2])).toBeLessThan(1e-12);
    expect(relativeError(symmetricSegmentField(2 * I, 0.2, 0.05), 2 * symmetricSegmentField(I, 0.2, 0.05))).toBeLessThan(1e-12);
  });

  it('scaling every length by k divides B by k (μ₀I has units of T·m)', () => {
    const k = 3;
    const p: Vec3 = [0.02, 0.06, 0.01];
    const b1 = polylineFieldExact(I, square(0.1), p, true);
    const b2 = polylineFieldExact(I, square(0.1 * k), [p[0] * k, p[1] * k, p[2] * k], true);
    for (let i = 0; i < 3; i++) expect(Math.abs(b2[i] - b1[i] / k)).toBeLessThan(1e-12 * len3(b1));
    expect(relativeError(loopAxisField(I, 0.05 * k, 0.03 * k), loopAxisField(I, 0.05, 0.03) / k)).toBeLessThan(1e-12);
  });

  it('far from a loop, doubling z divides B by 8 (1/z³), unlike a wire (1/s)', () => {
    expect(relativeError(loopAxisField(I, 0.01, 20) / loopAxisField(I, 0.01, 40), 8)).toBeLessThan(1e-5);
  });
});

describe('convergence', () => {
  it('the midpoint sum for a straight segment converges as O(1/N²)', () => {
    const a: Vec3 = [-0.1, 0, 0];
    const b: Vec3 = [0.1, 0, 0];
    const p: Vec3 = [0.06, 0.05, 0];
    const exact = segmentField(I, a, b, p)[2];
    const err = (N: number) => Math.abs(polylineField(I, [a, b], p, N)[2] - exact);
    for (const N of [16, 32, 64]) {
      const ratio = err(N) / err(2 * N);
      expect(ratio).toBeGreaterThan(3.8);
      expect(ratio).toBeLessThan(4.2);
    }
  });

  it('a regular polygon converges to the circle as O(1/N²)', () => {
    const R = 0.05;
    const err = (N: number) => Math.abs(polygonCenterField(I, R, N) - loopCenterField(I, R));
    for (const N of [16, 32, 64]) expect(err(N) / err(2 * N)).toBeCloseTo(4, 1);
  });

  it('cutting a polyline into N roughly equal pieces converges to the exact field', () => {
    const p: Vec3 = [0.01, 0.02, 0];
    const exact = polylineFieldExact(I, square(0.1), p, true)[2];
    const sum = (N: number) => elementsField(I, polylineElementsN(square(0.1), N, true), p).total[2];
    expect(relativeError(sum(400), exact)).toBeLessThan(1e-3);
    expect(relativeError(sum(400), exact)).toBeLessThan(relativeError(sum(40), exact));
  });
});
