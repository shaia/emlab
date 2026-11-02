import { describe, expect, it } from 'vitest';
import { E_CHARGE, M_ELECTRON, M_PROTON, MU0 } from '~/physics/constants';
import {
  circlePosition,
  circleCenter,
  circulation,
  compassDeflection,
  ellipticKE,
  finiteSolenoidAxisField,
  loopAxisField,
  loopCenterField,
  loopField,
  loopTorque,
  lorentzForce,
  lorentzMagnitude,
  orbitPeriod,
  orbitRadius,
  parallelWiresForce,
  selectorSpeed,
  solenoidField,
  solenoidFieldAt,
  spectrometerRadius,
  speedFromVoltage,
  straightWireField,
  traceLine,
  wireFieldAt,
  wireForce,
  wireForceVec,
  type Solenoid,
} from '~/physics/magnetism';
import { borisStep, uniformField, NO_FIELD, type Body } from '~/physics/motion';
import { dot3, len, len3, relativeError, type Vec2 } from '~/physics/vec';

const square = (cx: number, cy: number, h: number): Vec2[] => [
  [cx - h, cy - h],
  [cx + h, cy - h],
  [cx + h, cy + h],
  [cx - h, cy + h],
];

describe('analytic limit: the fields of wires, loops and solenoids', () => {
  it('a straight wire: 2 A at 4 cm gives 10⁻⁵ T', () => {
    expect(relativeError(straightWireField(2, 0.04), 1e-5)).toBeLessThan(1e-12);
  });

  it('a current out of the page makes a counterclockwise field (right-hand rule)', () => {
    const w = [{ x: 0, y: 0, I: 3 }];
    const [bx, by] = wireFieldAt(w, 0.05, 0); // to the right of the wire
    expect(Math.abs(bx)).toBeLessThan(1e-20);
    expect(by).toBeGreaterThan(0); // up
    const [ax] = wireFieldAt(w, 0, 0.05); // above the wire
    expect(ax).toBeLessThan(0); // to the left
    expect(relativeError(len(wireFieldAt(w, 0.05, 0)), straightWireField(3, 0.05))).toBeLessThan(1e-12);
  });

  it('midway between antiparallel wires the fields add; between parallel ones they cancel', () => {
    const anti = wireFieldAt([{ x: -0.05, y: 0, I: 4 }, { x: 0.05, y: 0, I: -4 }], 0, 0);
    expect(relativeError(len(anti), 2 * straightWireField(4, 0.05))).toBeLessThan(1e-12);
    const par = wireFieldAt([{ x: -0.05, y: 0, I: 4 }, { x: 0.05, y: 0, I: 4 }], 0, 0);
    expect(len(par)).toBeLessThan(1e-20);
  });

  it('the elliptic integrals match K(0) = E(0) = π/2 and tabulated values at m = 0.5', () => {
    const z = ellipticKE(0);
    expect(relativeError(z.K, Math.PI / 2)).toBeLessThan(1e-14);
    expect(relativeError(z.E, Math.PI / 2)).toBeLessThan(1e-14);
    const h = ellipticKE(0.5);
    expect(relativeError(h.K, 1.854074677301372)).toBeLessThan(1e-12);
    expect(relativeError(h.E, 1.350643881047675)).toBeLessThan(1e-12);
  });

  it('the exact loop field reduces to μ₀I/(2R) at the centre and to the axis formula on the axis', () => {
    expect(relativeError(loopField(5, 0.1, 0, 0).z, loopCenterField(5, 0.1))).toBeLessThan(1e-12);
    expect(relativeError(loopCenterField(5, 0.1, 20), (MU0 * 20 * 5) / 0.2)).toBeLessThan(1e-12);
    // just off the axis, the elliptic branch must join the axis formula continuously
    const off = loopField(5, 0.1, 1e-5, 0.07);
    expect(relativeError(off.z, loopAxisField(5, 0.1, 0.07))).toBeLessThan(1e-6);
    expect(Math.abs(off.rho)).toBeLessThan(1e-4 * Math.abs(off.z));
  });

  it('far from a loop its field is a dipole: on the axis B → μ₀IR²/(2z³), in the plane B → −μ₀IR²/(4ρ³)', () => {
    const I = 2;
    const R = 0.01;
    const d = 1;
    expect(relativeError(loopField(I, R, 0, d).z, (MU0 * I * R * R) / (2 * d ** 3))).toBeLessThan(1e-3);
    expect(relativeError(loopField(I, R, d, 0).z, (-MU0 * I * R * R) / (4 * d ** 3))).toBeLessThan(1e-3);
  });

  it('above the loop, off the axis, the lines spread outward: B_ρ > 0 for z > 0 and < 0 for z < 0', () => {
    expect(loopField(1, 0.1, 0.05, 0.05).rho).toBeGreaterThan(0);
    expect(loopField(1, 0.1, 0.05, -0.05).rho).toBeLessThan(0);
  });

  it('inside a long solenoid the stacked-loop field approaches μ₀NI/L, along +x for I > 0', () => {
    const s: Solenoid = { x0: 0, y0: 0, L: 1, R: 0.02, N: 1000, I: 2 };
    const [bx, by] = solenoidFieldAt(s, 0, 0, 400);
    expect(relativeError(bx, solenoidField(1000, 1, 2))).toBeLessThan(2e-3);
    expect(Math.abs(by)).toBeLessThan(1e-6 * bx);
    // the closed-form axis field agrees with the sum of loops
    expect(relativeError(bx, finiteSolenoidAxisField(1000, 1, 0.02, 2, 0))).toBeLessThan(1e-4);
  });

  it('at the end of a long solenoid the field on the axis is half the inside value', () => {
    const B = finiteSolenoidAxisField(500, 0.5, 0.01, 1, 0.25);
    expect(relativeError(B, solenoidField(500, 0.5, 1) / 2)).toBeLessThan(1e-3);
  });

  it('a short solenoid looks like a bar magnet: the field leaves its right end (north) and returns to the left', () => {
    const s: Solenoid = { x0: 0, y0: 0, L: 0.1, R: 0.025, N: 100, I: 1 };
    expect(solenoidFieldAt(s, 0.1, 0)[0]).toBeGreaterThan(0); // beyond the right end, pointing away
    expect(solenoidFieldAt(s, -0.1, 0)[0]).toBeGreaterThan(0); // beyond the left end, pointing in
    expect(solenoidFieldAt(s, 0, 0.08)[0]).toBeLessThan(0); // beside the magnet the field runs back
  });
});

describe('analytic limit: forces and orbits', () => {
  it('F = qv×B: a proton moving right in a field into the page is pushed up', () => {
    const F = lorentzForce(E_CHARGE, [1e5, 0, 0], [0, 0, -0.5]);
    expect(F[1]).toBeGreaterThan(0);
    expect(relativeError(len3(F), lorentzMagnitude(E_CHARGE, 1e5, 0.5))).toBeLessThan(1e-12);
  });

  it('the magnetic force is perpendicular to the velocity, and zero along the field', () => {
    const v: [number, number, number] = [3e5, -2e5, 1e5];
    const F = lorentzForce(-E_CHARGE, v, [0.2, 0.4, -0.1]);
    expect(Math.abs(dot3(F, v))).toBeLessThan(1e-12 * len3(F) * len3(v));
    expect(lorentzMagnitude(E_CHARGE, 1e6, 0.3, 0)).toBe(0);
    expect(relativeError(lorentzMagnitude(E_CHARGE, 1e6, 0.3, Math.PI / 6), 0.5 * E_CHARGE * 1e6 * 0.3)).toBeLessThan(1e-12);
  });

  it('an electron at 10⁷ m/s in 10⁻³ T circles with r = mv/(eB) ≈ 5.7 cm', () => {
    expect(relativeError(orbitRadius(M_ELECTRON, 1e7, -E_CHARGE, 1e-3), (M_ELECTRON * 1e7) / (E_CHARGE * 1e-3))).toBeLessThan(1e-12);
    expect(orbitRadius(M_ELECTRON, 1e7, -E_CHARGE, 0)).toBe(Infinity);
  });

  it('the analytic circle keeps its distance from its centre, and closes after one period', () => {
    const q = E_CHARGE;
    const m = M_PROTON;
    const Bz = 0.2;
    const v0: Vec2 = [2e5, 1e5];
    const c = circleCenter(q, m, Bz, [0, 0], v0);
    const r = orbitRadius(m, len(v0), q, Bz);
    const T = orbitPeriod(m, q, Bz);
    for (const f of [0.1, 0.37, 0.5, 0.9]) {
      const p = circlePosition(q, m, Bz, [0, 0], v0, f * T);
      expect(relativeError(Math.hypot(p[0] - c[0], p[1] - c[1]), r)).toBeLessThan(1e-9);
    }
    const back = circlePosition(q, m, Bz, [0, 0], v0, T);
    expect(Math.hypot(back[0], back[1])).toBeLessThan(1e-9 * r);
  });

  it('a positive charge in a field out of the page circles clockwise; a negative one counterclockwise', () => {
    const quarter = (q: number) => circlePosition(q, M_PROTON, 0.1, [0, 0], [1e5, 0], orbitPeriod(M_PROTON, q, 0.1) / 4);
    expect(quarter(E_CHARGE)[1]).toBeLessThan(0);
    expect(quarter(-E_CHARGE)[1]).toBeGreaterThan(0);
  });

  it('the spectrometer radius is √(2mU/q)/B, and agrees with speedFromVoltage', () => {
    const U = 1000;
    const B = 0.1;
    const v = speedFromVoltage(E_CHARGE, M_PROTON, U);
    expect(relativeError(0.5 * M_PROTON * v * v, E_CHARGE * U)).toBeLessThan(1e-12);
    expect(relativeError(spectrometerRadius(M_PROTON, E_CHARGE, U, B), Math.sqrt((2 * M_PROTON * U) / E_CHARGE) / B)).toBeLessThan(1e-12);
  });

  it('a charge at v = E/B crosses perpendicular E and B undeflected; a faster one is bent by B', () => {
    const E = 2e4;
    const B = 0.1;
    const v = selectorSpeed(E, B);
    const run = (speed: number) => {
      // E along −y, B into the page: qE is down, qv×B is up for a positive charge moving +x
      let b: Body = { pos: [0, 0, 0], vel: [speed, 0, 0], m: M_PROTON, q: E_CHARGE };
      const dt = 1e-10;
      for (let i = 0; i < 2000; i++) b = borisStep(b, uniformField([0, -E, 0]), uniformField([0, 0, -B]), i * dt, dt);
      return b.pos[1];
    };
    expect(Math.abs(run(v))).toBeLessThan(1e-9);
    expect(run(1.5 * v)).toBeGreaterThan(0);
    expect(run(0.5 * v)).toBeLessThan(0);
  });

  it('the force on a wire is BIL·sinθ, and IL×B points the way the right-hand rule says', () => {
    expect(relativeError(wireForce(3, 0.2, 0.5), 0.3)).toBeLessThan(1e-12);
    expect(relativeError(wireForce(3, 0.2, 0.5, Math.PI / 6), 0.15)).toBeLessThan(1e-12);
    // current to the right, field into the page: force up
    const F = wireForceVec(3, [0.2, 0, 0], [0, 0, -0.5]);
    expect(F[1]).toBeGreaterThan(0);
    expect(relativeError(F[1], 0.3)).toBeLessThan(1e-12);
  });

  it('parallel wires: 1 A in each, 1 m apart, feel 2·10⁻⁷ N per metre (the old definition of the ampere)', () => {
    expect(relativeError(parallelWiresForce(1, 1, 1), 2e-7)).toBeLessThan(1e-12);
    expect(parallelWiresForce(1, -1, 1)).toBeLessThan(0);
  });

  it('the force between two wires is the second wire\'s current times the first wire\'s field', () => {
    const I1 = 5;
    const I2 = 3;
    const d = 0.04;
    const B1 = straightWireField(I1, d);
    expect(relativeError(parallelWiresForce(I1, I2, d), B1 * I2)).toBeLessThan(1e-12);
  });

  it('the torque on a coil is NBIA·sinθ: largest when the coil\'s plane lies along B, zero when it faces B', () => {
    expect(relativeError(loopTorque(50, 2, 0.01, 0.4, Math.PI / 2), 0.4)).toBeLessThan(1e-12);
    expect(Math.abs(loopTorque(50, 2, 0.01, 0.4, 0))).toBe(0);
  });

  it('the torque equals the two side forces times their lever arm (a square coil, side a)', () => {
    const N = 10;
    const I = 1.5;
    const a = 0.05;
    const B = 0.2;
    const th = 0.6;
    const side = wireForce(N * I, a, B); // the sides perpendicular to B
    expect(relativeError(loopTorque(N, I, a * a, B, th), side * a * Math.sin(th))).toBeLessThan(1e-12);
  });

  it('a compass under a wire turns by θ with tanθ = B_wire/B_earth: 45° when they are equal', () => {
    expect(relativeError(compassDeflection(3e-5, 3e-5), Math.PI / 4)).toBeLessThan(1e-12);
    expect(compassDeflection(0, 3e-5)).toBe(0);
  });
});

describe('conservation', () => {
  it('the magnetic force does no work: the Boris push keeps the speed in a pure B field', () => {
    let b: Body = { pos: [0, 0, 0], vel: [3e5, 1e5, 2e4], m: M_PROTON, q: E_CHARGE };
    const v0 = len3(b.vel);
    const dt = orbitPeriod(M_PROTON, E_CHARGE, 0.3) / 200;
    for (let i = 0; i < 5000; i++) b = borisStep(b, NO_FIELD, uniformField([0, 0, 0.3]), i * dt, dt);
    expect(relativeError(len3(b.vel), v0)).toBeLessThan(1e-12);
  });

  it('a field line of a wire closes on itself: magnetic field lines have no ends', () => {
    const wires = [{ x: 0, y: 0, I: 2 }];
    const line = traceLine((x, y) => wireFieldAt(wires, x, y), [0.05, 0], {
      bounds: { xmin: -1, xmax: 1, ymin: -1, ymax: 1 },
      step: 0.002,
    });
    expect(line.end).toBe('closed');
    for (const p of line.points) expect(relativeError(Math.hypot(p[0], p[1]), 0.05)).toBeLessThan(1e-3);
  });

  it('a field line of a bar magnet passes through the magnet and closes', () => {
    const s: Solenoid = { x0: 0, y0: 0, L: 0.1, R: 0.025, N: 100, I: 1 };
    const line = traceLine((x, y) => solenoidFieldAt(s, x, y), [0, 0.01], {
      bounds: { xmin: -1, xmax: 1, ymin: -1, ymax: 1 },
      step: 0.002,
      maxSteps: 6000,
    });
    expect(line.end).toBe('closed');
  });
});

describe("convergence: Ampère's law from the field", () => {
  it('∮B·dl around a square enclosing a wire is μ₀I, whatever the square\'s size or position', () => {
    const wires = [{ x: 0.01, y: -0.02, I: 7 }];
    const f = (x: number, y: number) => wireFieldAt(wires, x, y);
    for (const [cx, cy, h] of [[0, 0, 0.05], [0.02, 0, 0.2], [-0.03, -0.01, 0.07]] as const) {
      expect(relativeError(circulation(f, square(cx, cy, h), 2000), MU0 * 7)).toBeLessThan(1e-5);
    }
  });

  it('the circulation counts only the enclosed current, with sign', () => {
    const wires = [
      { x: 0, y: 0, I: 5 },
      { x: 0.03, y: 0, I: -2 },
      { x: 0.5, y: 0, I: 100 },
    ];
    const f = (x: number, y: number) => wireFieldAt(wires, x, y);
    expect(relativeError(circulation(f, square(0.015, 0, 0.1), 2000), MU0 * 3)).toBeLessThan(1e-4);
  });

  it('the midpoint sum converges as the path is refined', () => {
    const wires = [{ x: 0, y: 0, I: 1 }];
    const f = (x: number, y: number) => wireFieldAt(wires, x, y);
    const err = (n: number) => relativeError(circulation(f, square(0, 0, 0.05), n), MU0);
    expect(err(400)).toBeLessThan(err(50));
    expect(err(400)).toBeLessThan(1e-4);
  });

  it('a rectangle half inside a long solenoid gives μ₀(N/L)·ℓ·I', () => {
    const s: Solenoid = { x0: 0, y0: 0, L: 2, R: 0.02, N: 2000, I: 1 };
    const ell = 0.1;
    const path: Vec2[] = [
      [-ell / 2, 0],
      [ell / 2, 0],
      [ell / 2, 0.3],
      [-ell / 2, 0.3],
    ];
    const c = circulation((x, y) => solenoidFieldAt(s, x, y, 2000), path, 60);
    expect(relativeError(c, MU0 * (2000 / 2) * ell * 1)).toBeLessThan(2e-2);
  });
});

describe('scaling (the dimensional proxy)', () => {
  it('a wire\'s field halves when the distance doubles and doubles with the current', () => {
    expect(relativeError(straightWireField(2, 0.1), straightWireField(2, 0.05) / 2)).toBeLessThan(1e-12);
    expect(relativeError(straightWireField(4, 0.1), 2 * straightWireField(2, 0.1))).toBeLessThan(1e-12);
  });

  it('a solenoid\'s field depends on turns per length, not on N or L separately', () => {
    expect(relativeError(solenoidField(200, 0.1, 1), solenoidField(400, 0.2, 1))).toBeLessThan(1e-12);
  });

  it('the orbit radius grows with the speed; the period does not depend on it', () => {
    expect(relativeError(orbitRadius(M_PROTON, 2e5, E_CHARGE, 0.1), 2 * orbitRadius(M_PROTON, 1e5, E_CHARGE, 0.1))).toBeLessThan(1e-12);
    // orbitPeriod has no speed argument by design; check it against 2πr/v at two speeds
    for (const v of [1e5, 7e5]) {
      expect(relativeError((2 * Math.PI * orbitRadius(M_PROTON, v, E_CHARGE, 0.1)) / v, orbitPeriod(M_PROTON, E_CHARGE, 0.1))).toBeLessThan(1e-12);
    }
  });

  it('in a spectrometer at fixed U and B, r ∝ √m: an ion four times heavier lands twice as far', () => {
    expect(relativeError(spectrometerRadius(4 * M_PROTON, E_CHARGE, 500, 0.2), 2 * spectrometerRadius(M_PROTON, E_CHARGE, 500, 0.2))).toBeLessThan(1e-12);
  });

  it('the force between parallel wires scales as I₁I₂/d', () => {
    expect(relativeError(parallelWiresForce(2, 3, 0.1), (6 / 0.1) * parallelWiresForce(1, 1, 1))).toBeLessThan(1e-12);
  });
});
