import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import { derivative } from '~/physics/calculus';
import { fluxUniform, motionalEmf, railBrakingForce, railCurrent, railDistance, railSpeed, railStep, railTerminalSpeed, railTimeConstant, type RailRod, type RailState } from '~/physics/induction';
import { lorentzForce, wireForceVec } from '~/physics/magnetism';
import { fallRod, freeFallSpeed, inclineRod, kinetic, perpendicularField, pulleyRod, pulleyTension, railAcceleration, railAt, railPowers, railTimeToFraction, runAt, runWork, type RailSegment } from '~/physics/railrod';
import { relativeError } from '~/physics/vec';

/** the lesson's default rod: v_T = 5 m/s, τ = 2.5 s */
const rod: RailRod = { m: 0.2, L: 0.5, B: 0.8, R: 2, F: 0.4 };
const rest: RailState = { x: 0, v: 0, heat: 0 };
const deg = Math.PI / 180;

function integrate(p: RailRod, s: RailState, T: number, n: number): RailState {
  const dt = T / n;
  for (let i = 0; i < n; i++) s = railStep(s, p, dt);
  return s;
}

describe('analytic limit: the motional emf and the terminal speed', () => {
  it('the work of the Lorentz force per unit charge along the rod is BLv, the emf of a growing circuit of flux B·L·x', () => {
    // rod along y, moving at v along x, field into the page (−z): force on +q along the rod is qvB
    const v = 3;
    const f = lorentzForce(1, [v, 0, 0], [0, 0, -rod.B]);
    expect(f[1]).toBeGreaterThan(0); // up the rod: the current circulates counter-clockwise
    expect(relativeError(f[1] * rod.L, motionalEmf(rod.B, rod.L, v))).toBeLessThan(1e-12);
    // the flux through the circuit grows as the rod moves: dΦ/dt at x = v·t
    const phi = (t: number) => fluxUniform(rod.B, rod.L * v * t);
    expect(relativeError(derivative(phi, 1.3), motionalEmf(rod.B, rod.L, v))).toBeLessThan(1e-8);
  });

  it('the force on the induced current opposes the motion (Lenz), whichever way the field points', () => {
    for (const Bz of [-rod.B, rod.B]) {
      const v = 2;
      const up = Math.sign(lorentzForce(1, [v, 0, 0], [0, 0, Bz])[1]); // the induced current's direction along the rod
      const F = wireForceVec(railCurrent(rod, v), [0, up * rod.L, 0], [0, 0, Bz]);
      expect(F[0]).toBeLessThan(0);
      expect(relativeError(-F[0], railBrakingForce(rod, v))).toBeLessThan(1e-12);
    }
  });

  it('a rod pulled from rest starts with acceleration F/m and ends at v_T with no acceleration', () => {
    expect(relativeError(railAcceleration(rod, 0), rod.F / rod.m)).toBeLessThan(1e-12);
    expect(Math.abs(railAcceleration(rod, railTerminalSpeed(rod)))).toBeLessThan(1e-12);
    expect(railTerminalSpeed(rod)).toBeCloseTo(5, 12);
    expect(railTimeConstant(rod)).toBeCloseTo(2.5, 12);
    // after one τ the rod has 63% of v_T; the time to 99% is τ·ln 100
    expect(relativeError(railSpeed(rod, 0, railTimeToFraction(rod, 0.99)), 0.99 * 5)).toBeLessThan(1e-12);
  });

  it('with the pull removed the rod slows to rest, and coasts exactly v₀·τ', () => {
    const coast = { ...rod, F: 0 };
    const s = railAt(coast, { x: 0, v: 5, heat: 0 }, 40 * railTimeConstant(coast));
    expect(s.v).toBeLessThan(1e-12);
    expect(relativeError(s.x, 5 * railTimeConstant(coast))).toBeLessThan(1e-12);
    expect(relativeError(s.heat, kinetic(rod.m, 5))).toBeLessThan(1e-12);
  });

  it('on an incline with the field perpendicular to the rails, v_T = mgR·sinα/(B²L²)', () => {
    const p = inclineRod(0.1, 0.5, 1, 1, 30 * deg, 'normal');
    expect(relativeError(railTerminalSpeed(p), (0.1 * G * 1 * Math.sin(30 * deg)) / (1 * 0.25))).toBeLessThan(1e-12);
  });

  it('between vertical rails the rod reaches v_T = mgR/(B²L²), the incline at α = 90°, with τ = v_T/g', () => {
    const p = fallRod(0.1, 0.5, 1, 1);
    expect(relativeError(railTerminalSpeed(p), (0.1 * G * 1) / 0.25)).toBeLessThan(1e-12);
    expect(relativeError(railTerminalSpeed(p), railTerminalSpeed(inclineRod(0.1, 0.5, 1, 1, Math.PI / 2, 'normal')))).toBeLessThan(1e-12);
    expect(relativeError(railTimeConstant(p), railTerminalSpeed(p) / G)).toBeLessThan(1e-12);
    // released from rest it starts in free fall: a = g, and for t ≪ τ the speed is g·t
    expect(relativeError(railAcceleration(p, 0), G)).toBeLessThan(1e-12);
    const t = 1e-4 * railTimeConstant(p);
    expect(relativeError(railSpeed(p, 0, t), freeFallSpeed(t))).toBeLessThan(1e-4);
    // and it always falls slower than a free body
    for (const s of [0.1, 0.4, 1, 3]) expect(railSpeed(p, 0, s)).toBeLessThan(freeFallSpeed(s));
  });

  it('a rod pulled by a hanging mass M starts at a = Mg/(m + M), ends at v_T = MgR/(B²L²), and the string then holds Mg', () => {
    const m = 0.1;
    const M = 0.05;
    const p = pulleyRod(m, M, 0.5, 0.5, 0.5);
    expect(relativeError(railAcceleration(p, 0), (M * G) / (m + M))).toBeLessThan(1e-12);
    expect(relativeError(railTerminalSpeed(p), (M * G * 0.5) / 0.0625)).toBeLessThan(1e-12);
    expect(relativeError(railTimeConstant(p), ((m + M) * 0.5) / 0.0625)).toBeLessThan(1e-12);
    expect(relativeError(pulleyTension(p, M, railTerminalSpeed(p)), M * G)).toBeLessThan(1e-12);
    // at any speed the rod's own equation holds: T − F_B = m·a
    const v = 1.3;
    expect(relativeError(pulleyTension(p, M, v) - railBrakingForce(p, v), m * railAcceleration(p, v))).toBeLessThan(1e-12);
  });

  it('with a vertical field, the full Lorentz force gives the braking of a field B·cosα along the rails', () => {
    // side view: the incline rises to the right at α, the rod (along z) slides down it at v; B vertical (+y)
    const alpha = 30 * deg;
    const B = 1;
    const v = 1.7;
    const vel = [-v * Math.cos(alpha), -v * Math.sin(alpha), 0] as const;
    const fq = lorentzForce(1, vel, [0, B, 0]);
    const emf = Math.abs(fq[2]) * 0.5; // along the rod, times L
    const p = inclineRod(0.1, 0.5, B, 1, alpha, 'vertical');
    expect(relativeError(emf, motionalEmf(p.B, p.L, v))).toBeLessThan(1e-12);
    const I = emf / p.R;
    const F = wireForceVec(I, [0, 0, Math.sign(fq[2]) * 0.5], [0, B, 0]);
    expect(Math.abs(F[1])).toBeLessThan(1e-12); // horizontal
    const alongUp = F[0] * Math.cos(alpha) + F[1] * Math.sin(alpha);
    expect(alongUp).toBeGreaterThan(0); // up the slope: against the motion
    expect(relativeError(alongUp, railBrakingForce(p, v))).toBeLessThan(1e-12);
    expect(relativeError(perpendicularField(B, alpha, 'vertical'), B * Math.cos(alpha))).toBeLessThan(1e-12);
  });
});

describe('conservation: energy of the rod on rails', () => {
  it('at the terminal speed the drive power equals the Joule power, F·v = I²R', () => {
    const { drive, joule } = railPowers(rod, railTerminalSpeed(rod));
    expect(relativeError(drive, joule)).toBeLessThan(1e-12);
    expect(drive).toBeCloseTo(2, 12);
  });

  it('the closed-form heat of a segment equals the I²R the RK4 integrator accumulates', () => {
    for (const v0 of [0, 3, 8]) {
      const T = 3 * railTimeConstant(rod);
      const exact = railAt(rod, { x: 0, v: v0, heat: 0 }, T);
      const num = integrate(rod, { x: 0, v: v0, heat: 0 }, T, 4000);
      expect(relativeError(num.heat, exact.heat)).toBeLessThan(1e-9);
      expect(relativeError(num.x, exact.x)).toBeLessThan(1e-9);
    }
  });

  it('falling or pulled by a mass, the work of gravity becomes kinetic energy of everything that moves plus heat', () => {
    const fall = fallRod(0.1, 0.5, 1, 1);
    const pulley = pulleyRod(0.1, 0.05, 0.5, 0.5, 0.5);
    for (const p of [fall, pulley]) {
      for (const T of [0.3, 1, 4]) {
        const s = railAt(p, rest, T);
        // the drive is gravity on the falling body: F·x is m·g·h (or M·g·h); the inertia p.m is all of it
        expect(Math.abs(p.F * s.x - kinetic(p.m, s.v) - s.heat)).toBeLessThan(1e-12);
        const num = integrate(p, rest, T, 4000);
        expect(relativeError(num.heat, s.heat)).toBeLessThan(1e-8);
      }
      const { drive, joule } = railPowers(p, railTerminalSpeed(p));
      expect(relativeError(drive, joule)).toBeLessThan(1e-12);
    }
  });

  it('a run in segments keeps K₀ + W = K + Q across every change of parameters', () => {
    const segs: RailSegment[] = [{ t0: 0, s0: rest, p: rod }];
    const t1 = 6;
    segs.push({ t0: t1, s0: runAt(segs, t1), p: { ...rod, F: 0 } }); // the pull removed
    const t2 = 9;
    segs.push({ t0: t2, s0: runAt(segs, t2), p: { ...rod, R: 4 } }); // pulled again, R doubled
    for (const T of [0, 2, 6, 7.5, 9, 15]) {
      const s = runAt(segs, T);
      const W = runWork(segs, T);
      expect(Math.abs(W - kinetic(rod.m, s.v) - s.heat)).toBeLessThan(1e-12 + 1e-12 * W);
    }
    // the speed is continuous at each joint
    expect(relativeError(runAt(segs, t1).v, railSpeed(rod, 0, t1))).toBeLessThan(1e-12);
  });
});

describe('scaling: what sets the terminal speed and the time constant', () => {
  it('v_T ∝ F·R and ∝ 1/(B²L²); τ ∝ m·R and does not depend on F', () => {
    const vT = railTerminalSpeed(rod);
    const tau = railTimeConstant(rod);
    expect(relativeError(railTerminalSpeed({ ...rod, R: 2 * rod.R }), 2 * vT)).toBeLessThan(1e-12);
    expect(relativeError(railTerminalSpeed({ ...rod, B: 2 * rod.B }), vT / 4)).toBeLessThan(1e-12);
    expect(relativeError(railTerminalSpeed({ ...rod, L: 2 * rod.L }), vT / 4)).toBeLessThan(1e-12);
    expect(relativeError(railTerminalSpeed({ ...rod, m: 2 * rod.m }), vT)).toBeLessThan(1e-12);
    expect(relativeError(railTimeConstant({ ...rod, m: 2 * rod.m }), 2 * tau)).toBeLessThan(1e-12);
    expect(relativeError(railTimeConstant({ ...rod, F: 3 * rod.F }), tau)).toBeLessThan(1e-12);
  });

  it('on an incline the mass sets v_T (the drive grows with m), and a vertical field brakes less', () => {
    const a = inclineRod(0.1, 0.5, 1, 1, 30 * deg, 'normal');
    const b = inclineRod(0.2, 0.5, 1, 1, 30 * deg, 'normal');
    const c = inclineRod(0.1, 0.5, 1, 1, 30 * deg, 'vertical');
    expect(relativeError(railTerminalSpeed(b), 2 * railTerminalSpeed(a))).toBeLessThan(1e-12);
    expect(relativeError(railTerminalSpeed(c), railTerminalSpeed(a) / Math.cos(30 * deg) ** 2)).toBeLessThan(1e-12);
  });
  it('between vertical rails v_T ∝ m; pulled by a hanging mass, v_T ∝ M and the rod mass only sets τ', () => {
    const a = fallRod(0.1, 0.5, 1, 1);
    expect(relativeError(railTerminalSpeed(fallRod(0.2, 0.5, 1, 1)), 2 * railTerminalSpeed(a))).toBeLessThan(1e-12);
    const p = pulleyRod(0.1, 0.05, 0.5, 0.5, 0.5);
    const heavyRod = pulleyRod(0.2, 0.05, 0.5, 0.5, 0.5);
    const heavyMass = pulleyRod(0.1, 0.1, 0.5, 0.5, 0.5);
    expect(relativeError(railTerminalSpeed(heavyRod), railTerminalSpeed(p))).toBeLessThan(1e-12);
    expect(railTimeConstant(heavyRod)).toBeGreaterThan(railTimeConstant(p));
    expect(relativeError(railTerminalSpeed(heavyMass), 2 * railTerminalSpeed(p))).toBeLessThan(1e-12);
  });
});

describe('convergence: the integrated run approaches the closed form', () => {
  it('the heat from RK4 converges at fourth order', () => {
    const T = 2 * railTimeConstant(rod);
    const exact = railAt(rod, rest, T).heat;
    const err = (n: number) => Math.abs(integrate(rod, rest, T, n).heat - exact);
    const order = Math.log2(err(20) / err(40));
    expect(order).toBeGreaterThan(3.5);
    expect(railDistance(rod, 0, T)).toBeGreaterThan(0);
  });
});
