import { describe, expect, it } from 'vitest';
import { inducedCircleEmf, inducedFieldStrength } from '~/physics/induction';
import {
  arcWork,
  areaInCore,
  beadStart,
  beadStep,
  circleOverlap,
  loopCirculation,
  loopEmf,
  loopFluxRate,
  tangentialE,
  type Bead,
  type Loop,
} from '~/physics/inducedfield';
import { inducedE } from '~/physics/maxwell';
import { relativeError } from '~/physics/vec';

/** the figure's defaults (and lesson 6.13's): a core of radius 4 cm, B_z growing at 2 T/s */
const A = 0.04;
const K = 2;

/** run the bead until it has turned through `laps` full laps (either way) or `T` seconds have passed */
function runBead(loop: Loop, dBdt: number, qm: number, laps: number, dt: number, T: number) {
  const phi0 = beadStart(dBdt, A, loop);
  let b: Bead = { phi: phi0, omega: 0 };
  let t = 0;
  let maxTurn = 0;
  while (t < T) {
    const next = beadStep(b, dBdt, A, loop, qm, dt);
    const target = phi0 + Math.sign(next.phi - phi0) * laps * 2 * Math.PI;
    if (Math.abs(next.phi - phi0) >= laps * 2 * Math.PI) {
      // step back to the exact lap by linear interpolation of the last step
      const f = (target - b.phi) / (next.phi - b.phi);
      return { done: true, omega: b.omega + f * (next.omega - b.omega), phi0, maxTurn: laps * 2 * Math.PI };
    }
    b = next;
    t += dt;
    maxTurn = Math.max(maxTurn, Math.abs(b.phi - phi0));
  }
  return { done: false, omega: b.omega, phi0, maxTurn };
}

describe('analytic limit: the emf round a circle, inside, outside and beside the core', () => {
  it('a loop centred on the axis inside the core: |ε| = πr²·dB/dt, as induction.ts gives', () => {
    const loop = { cx: 0, cy: 0, r: 0.02 };
    expect(relativeError(Math.abs(loopEmf(K, A, loop)), Math.PI * 0.02 ** 2 * K)).toBeLessThan(1e-12);
    expect(relativeError(Math.abs(loopEmf(K, A, loop)), inducedCircleEmf(K, A, 0.02))).toBeLessThan(1e-12);
  });

  it('every loop that holds the whole core has the same emf, πa²·dB/dt, wherever its centre is', () => {
    for (const loop of [
      { cx: 0, cy: 0, r: 0.08 },
      { cx: 0.03, cy: -0.02, r: 0.09 },
      { cx: -0.05, cy: 0.01, r: 0.1 },
    ])
      expect(relativeError(Math.abs(loopEmf(K, A, loop)), Math.PI * A * A * K)).toBeLessThan(1e-12);
  });

  it('a loop beside the core, not overlapping it, has zero emf, though the field on it is not zero', () => {
    const loop = { cx: 0.1, cy: 0, r: 0.03 };
    expect(loopEmf(K, A, loop)).toBe(0);
    expect(Math.abs(tangentialE(K, A, loop, Math.PI))).toBeGreaterThan(0.01);
  });

  it('a loop inside the core but off the axis has the emf of its own area, πr²·dB/dt', () => {
    const loop = { cx: 0.02, cy: 0.01, r: 0.012 };
    expect(relativeError(Math.abs(loopEmf(K, A, loop)), Math.PI * 0.012 ** 2 * K)).toBeLessThan(1e-12);
  });

  it('a loop whose edge passes through the axis, with the same radius as the core, holds the lens of two equal discs', () => {
    // two discs of radius a whose centres are a apart overlap in (2π/3 − √3/2)·a²
    expect(relativeError(circleOverlap(A, A, A), (2 * Math.PI / 3 - Math.sqrt(3) / 2) * A * A)).toBeLessThan(1e-12);
  });

  it('a positive dB/dt drives a positive charge clockwise (Lenz; lesson 6.13); a negative one counter-clockwise', () => {
    const loop = { cx: 0, cy: 0, r: 0.02 };
    expect(loopEmf(K, A, loop)).toBeLessThan(0);
    expect(loopEmf(-K, A, loop)).toBeGreaterThan(0);
    // right of the axis, the induced E points down (clockwise)
    expect(inducedE(K, A)(0.02, 0)[1]).toBeLessThan(0);
  });
});

describe('scaling: what the emf and the field are proportional to', () => {
  it('inside the core, doubling the loop radius quadruples the emf; outside, it changes nothing', () => {
    const e = (r: number) => Math.abs(loopEmf(K, A, { cx: 0, cy: 0, r }));
    expect(relativeError(e(0.02) / e(0.01), 4)).toBeLessThan(1e-12);
    expect(relativeError(e(0.12) / e(0.06), 1)).toBeLessThan(1e-12);
  });

  it('the emf is proportional to dB/dt and reverses with it, and is minus the flux rate', () => {
    const loop = { cx: 0.01, cy: 0, r: 0.05 };
    expect(loopEmf(K, A, loop)).toBe(-loopFluxRate(K, A, loop));
    expect(relativeError(loopEmf(3 * K, A, loop), 3 * loopEmf(K, A, loop))).toBeLessThan(1e-12);
    expect(relativeError(loopEmf(-K, A, loop), -loopEmf(K, A, loop))).toBeLessThan(1e-12);
  });

  it('the overlap grows smoothly from 0 to the whole smaller disc as the loop slides onto the core', () => {
    let last = -1;
    for (let d = 0.12; d >= 0; d -= 0.002) {
      const s = areaInCore(A, { cx: d, cy: 0, r: 0.06 });
      expect(s).toBeGreaterThanOrEqual(last - 1e-15);
      last = s;
    }
    expect(relativeError(last, Math.PI * A * A)).toBeLessThan(1e-12);
    // continuity at both touching distances
    expect(circleOverlap(A, 0.06, 0.1 - 1e-12)).toBeLessThan(1e-12);
    expect(relativeError(circleOverlap(A, 0.06, 0.02 + 1e-12), Math.PI * A * A)).toBeLessThan(1e-6);
  });
});

describe("convergence: Σ E∥·Δℓ round the loop, from the field, equals −dΦ/dt from the flux (Faraday's law)", () => {
  const loops: Loop[] = [
    { cx: 0, cy: 0, r: 0.02 },
    { cx: 0.025, cy: 0.01, r: 0.01 },
    { cx: 0.03, cy: 0, r: 0.03 }, // straddles the edge
    { cx: -0.02, cy: 0.05, r: 0.04 }, // straddles the edge
    { cx: 0.02, cy: -0.01, r: 0.09 }, // holds the whole core
    { cx: 0.11, cy: 0.02, r: 0.04 }, // beside it
  ];
  it('for loops inside, across the edge, round the core and beside it, at n = 2000, to 10⁻⁶', () => {
    for (const loop of loops) {
      const c = loopCirculation(K, A, loop);
      const e = loopEmf(K, A, loop);
      if (e === 0) expect(Math.abs(c)).toBeLessThan(1e-9);
      else expect(relativeError(c, e)).toBeLessThan(1e-6);
    }
  });

  it('the error falls as the number of arcs grows, for a loop across the edge', () => {
    const loop = loops[2];
    const err = (n: number) => relativeError(loopCirculation(K, A, loop, n), loopEmf(K, A, loop));
    expect(err(400)).toBeLessThan(err(50));
    expect(err(2000)).toBeLessThan(1e-6);
  });

  it('round a centred circle, the field is tangent and of strength E(r), so Σ E∥·Δℓ = E·2πr', () => {
    for (const r of [0.02, 0.07]) {
      const loop = { cx: 0, cy: 0, r };
      expect(relativeError(Math.abs(loopCirculation(K, A, loop)), inducedFieldStrength(K, A, r) * 2 * Math.PI * r)).toBeLessThan(1e-9);
    }
  });
});

describe('conservation: the work the field does on a charge round a closed path', () => {
  it('two halves of a centred ring give opposite work per unit charge from A to B: no potential difference exists', () => {
    const loop = { cx: 0, cy: 0, r: 0.08 };
    const upper = arcWork(K, A, loop, 0, Math.PI); // A at φ = 0 to B at φ = π, counter-clockwise over the top
    const lower = arcWork(K, A, loop, 0, -Math.PI); // A to B clockwise under the bottom
    expect(relativeError(upper, -lower)).toBeLessThan(1e-9);
    expect(relativeError(upper - lower, loopEmf(K, A, loop))).toBeLessThan(1e-9);
  });

  it('a bead released from rest on a loop round the core gains q·|ε| of kinetic energy on every lap', () => {
    const qm = 50; // C/kg, illustrative
    for (const loop of [
      { cx: 0, cy: 0, r: 0.02 },
      { cx: 0.01, cy: 0.005, r: 0.07 },
      { cx: 0.025, cy: 0, r: 0.01 }, // inside the core, beside the axis: the push reverses on part of the loop
    ]) {
      const eps = Math.abs(loopEmf(K, A, loop));
      for (const laps of [1, 3]) {
        const res = runBead(loop, K, qm, laps, 2e-4, 200);
        expect(res.done).toBe(true);
        const ke = 0.5 * (loop.r * res.omega) ** 2; // per unit mass
        expect(relativeError(ke, qm * laps * eps)).toBeLessThan(1e-4);
      }
    }
  });

  it('it goes round in the sense of the emf: clockwise for a growing ⊙ field', () => {
    const loop = { cx: 0, cy: 0, r: 0.02 };
    let b: Bead = { phi: beadStart(K, A, loop), omega: 0 };
    for (let i = 0; i < 200; i++) b = beadStep(b, K, A, loop, 50, 1e-3);
    expect(b.omega).toBeLessThan(0);
  });

  it('on a loop beside the core it swings back and forth and never completes a lap: the work round it is zero', () => {
    const loop = { cx: 0.1, cy: 0, r: 0.03 };
    const res = runBead(loop, K, 50, 1, 2e-4, 60);
    expect(res.done).toBe(false);
    expect(res.maxTurn).toBeGreaterThan(0.1);
  });
});
