import { describe, expect, it } from 'vitest';
import {
  advance,
  COPPER_N,
  driftCurrent,
  driftSpeed,
  elementPowers,
  filamentBulb,
  loopCurrent,
  parallelR,
  powerIR,
  powerVI,
  powerVR,
  ratedResistance,
  rcCharge,
  rcDischarge,
  RESISTIVITY,
  roundArea,
  seriesR,
  solveCircuit,
  terminalVoltage,
  wireResistance,
  type Circuit,
  type Solution,
} from '~/physics/circuits';
import { relativeError } from '~/physics/vec';

type Ok = Extract<Solution, { ok: true }>;
const solved = (c: Circuit): Ok => {
  const s = solveCircuit(c);
  if (!s.ok) throw new Error(`circuit did not solve: ${s.reason}`);
  return s;
};

/** battery ε (r) across a chain of resistors: nodes 0 = −, 1 = +, then one node per resistor */
const chain = (emf: number, r: number, rs: number[]): Circuit => ({
  nodes: rs.length + 1,
  elements: [
    { kind: 'battery', a: 0, b: 1, emf, r },
    ...rs.map((R, i) => ({ kind: 'R' as const, a: i + 1, b: (i + 2) % (rs.length + 1), R })),
  ],
});

/** A two-battery, two-junction network (lesson 3.8's figure): ε₁ = 12 V with R₁ = 3 Ω, ε₂ = 3 V with R₂ = 3 Ω, R₃ = 6 Ω across the junctions. */
const twoBattery: Circuit = {
  nodes: 4,
  elements: [
    { kind: 'battery', a: 0, b: 1, emf: 12, r: 0 },
    { kind: 'R', a: 1, b: 2, R: 3 },
    { kind: 'R', a: 2, b: 0, R: 6 },
    { kind: 'R', a: 2, b: 3, R: 3 },
    { kind: 'battery', a: 0, b: 3, emf: 3, r: 0 },
  ],
};

describe('analytic limits', () => {
  it('a battery with internal resistance drives I = ε/(R + r), and its terminal voltage is ε − Ir', () => {
    const s = solved(chain(12, 1, [5]));
    expect(relativeError(s.I[0], loopCurrent(12, 1, 5))).toBeLessThan(1e-12);
    expect(relativeError(s.I[0], 2)).toBeLessThan(1e-12);
    expect(relativeError(s.V[1] - s.V[0], terminalVoltage(12, 1, 2))).toBeLessThan(1e-12);
  });

  it('resistors in series carry one current, and the equivalent resistance is the sum', () => {
    const s = solved(chain(12, 0, [2, 4, 6]));
    for (const k of [1, 2, 3]) expect(relativeError(s.I[k], 12 / seriesR(2, 4, 6))).toBeLessThan(1e-12);
    // the voltage divides in proportion to the resistances
    expect(relativeError(s.V[1] - s.V[2], 2)).toBeLessThan(1e-12);
    expect(relativeError(s.V[3] - s.V[0], 6)).toBeLessThan(1e-12);
  });

  it('resistors in parallel share one voltage, and the currents add to ε/R_parallel', () => {
    const c: Circuit = {
      nodes: 2,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 12, r: 0 },
        { kind: 'R', a: 1, b: 0, R: 3 },
        { kind: 'R', a: 1, b: 0, R: 6 },
      ],
    };
    const s = solved(c);
    expect(relativeError(s.I[1], 4)).toBeLessThan(1e-12);
    expect(relativeError(s.I[2], 2)).toBeLessThan(1e-12);
    expect(relativeError(s.I[0], 12 / parallelR(3, 6))).toBeLessThan(1e-12);
    expect(relativeError(parallelR(3, 6), 2)).toBeLessThan(1e-12);
  });

  it('a balanced Wheatstone bridge carries no current across its middle', () => {
    // 0 = −, 1 = +; arms 1→2→0 and 1→3→0 in the same ratio; bridge 2–3
    const c: Circuit = {
      nodes: 4,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 10, r: 0.5 },
        { kind: 'R', a: 1, b: 2, R: 2 },
        { kind: 'R', a: 2, b: 0, R: 4 },
        { kind: 'R', a: 1, b: 3, R: 3 },
        { kind: 'R', a: 3, b: 0, R: 6 },
        { kind: 'R', a: 2, b: 3, R: 7 },
      ],
    };
    expect(Math.abs(solved(c).I[5])).toBeLessThan(1e-12);
  });

  it('the two-battery network matches the hand solution by Kirchhoff’s rules', () => {
    // junction rule I₁ + I₂ = I₃; loops 12 = 3I₁ + 6I₃ and 3 = 3I₂ + 6I₃ → I₁ = 2, I₂ = −1, I₃ = 1 A:
    // I₂ < 0 means the current runs into the + terminal of the 3 V battery, which is being charged
    const s = solved(twoBattery);
    expect(relativeError(s.I[1], 2)).toBeLessThan(1e-12);
    expect(relativeError(-s.I[3], -1)).toBeLessThan(1e-12);
    expect(relativeError(s.I[2], 1)).toBeLessThan(1e-12);
    // the junction potential, read through R₃ to the common − terminal
    expect(relativeError(s.V[2] - s.V[0], 6)).toBeLessThan(1e-12);
  });

  it('an ideal ammeter (a wire) reads the series current; an ideal voltmeter (open) reads without disturbing', () => {
    const c: Circuit = {
      nodes: 3,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 9, r: 0 },
        { kind: 'wire', a: 1, b: 2 },
        { kind: 'R', a: 2, b: 0, R: 3 },
        { kind: 'open', a: 2, b: 0 },
      ],
    };
    const s = solved(c);
    expect(relativeError(s.I[1], 3)).toBeLessThan(1e-12);
    expect(s.I[3]).toBe(0);
    expect(relativeError(s.V[2] - s.V[0], 9)).toBeLessThan(1e-12);
  });

  it('a real voltmeter across a resistor lowers the voltage it reads', () => {
    // 12 V across 10 kΩ + 10 kΩ; a 10 kΩ voltmeter on the lower one reads 4 V, not 6 V
    const c: Circuit = {
      nodes: 3,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 12, r: 0 },
        { kind: 'R', a: 1, b: 2, R: 1e4 },
        { kind: 'R', a: 2, b: 0, R: 1e4 },
        { kind: 'R', a: 2, b: 0, R: 1e4 },
      ],
    };
    expect(relativeError(solved(c).V[2] - 0, 4)).toBeLessThan(1e-12);
  });

  it('wires that form a loop share the current, and every wire node sits at one potential', () => {
    const c: Circuit = {
      nodes: 4,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 6, r: 0 },
        { kind: 'wire', a: 1, b: 2 },
        { kind: 'wire', a: 1, b: 3 },
        { kind: 'wire', a: 2, b: 3 },
        { kind: 'R', a: 3, b: 0, R: 2 },
      ],
    };
    const s = solved(c);
    expect(relativeError(s.I[4], 3)).toBeLessThan(1e-12);
    expect(relativeError(s.I[1] + s.I[2], 3)).toBeLessThan(1e-12);
    expect(s.V[1]).toBe(s.V[2]);
    expect(s.V[2]).toBe(s.V[3]);
  });

  it('an RC circuit charges to 63% of ε after one time constant, and discharges to 37%', () => {
    const tau = 1000 * 100e-6;
    expect(relativeError(rcCharge(tau, 10, 1000, 100e-6).vC, 10 * (1 - Math.exp(-1)))).toBeLessThan(1e-12);
    expect(relativeError(rcCharge(0, 10, 1000, 100e-6).I, 10 / 1000)).toBeLessThan(1e-12);
    expect(relativeError(rcDischarge(tau, 10, 1000, 100e-6).vC, 10 * Math.exp(-1))).toBeLessThan(1e-12);
    expect(rcCharge(50 * tau, 10, 1000, 100e-6).I).toBeLessThan(1e-20);
  });

  it('a filament bulb draws its rated current at its rated voltage, and is ohmic with its cold resistance near zero volts', () => {
    const rated = filamentBulb(6, 3, 6);
    expect(relativeError(rated.I, 0.5)).toBeLessThan(1e-9);
    expect(relativeError(rated.R, ratedResistance(3, 6))).toBeLessThan(1e-9);
    // radiation carries little heat at room temperature, so the filament warms even at millivolts
    const cold = filamentBulb(1e-5, 3, 6);
    expect(relativeError(cold.R, (ratedResistance(3, 6) * 300) / 2800)).toBeLessThan(1e-6);
  });

  it('a 1 mm² copper wire carrying 1 A drifts at under 0.1 mm/s', () => {
    const v = driftSpeed(1, COPPER_N, 1e-6);
    expect(relativeError(v, 1 / (8.5e28 * 1.6e-19 * 1e-6))).toBeLessThan(1e-12);
    expect(v).toBeLessThan(1e-4);
    expect(relativeError(driftCurrent(COPPER_N, v, 1e-6), 1)).toBeLessThan(1e-12);
  });

  it('10 m of 0.5 mm copper wire has R = ρL/A ≈ 0.87 Ω', () => {
    const R = wireResistance(RESISTIVITY.copper, 10, roundArea(0.5e-3));
    expect(relativeError(R, (1.7e-8 * 10) / ((Math.PI * 0.25e-6) / 4))).toBeLessThan(1e-12);
    expect(R).toBeGreaterThan(0.86);
    expect(R).toBeLessThan(0.88);
  });
});

describe('conservation', () => {
  /** a mixed network: two batteries with internal resistance, five resistors, an ammeter wire */
  const mixed: Circuit = {
    nodes: 6,
    elements: [
      { kind: 'battery', a: 0, b: 1, emf: 9, r: 0.5 },
      { kind: 'R', a: 1, b: 2, R: 3 },
      { kind: 'R', a: 2, b: 3, R: 4 },
      { kind: 'R', a: 2, b: 4, R: 6 },
      { kind: 'wire', a: 4, b: 5 },
      { kind: 'R', a: 3, b: 5, R: 2 },
      { kind: 'R', a: 5, b: 0, R: 1 },
      { kind: 'battery', a: 3, b: 0, emf: 1.5, r: 0.2 },
    ],
  };

  it('the junction rule holds at every node (charge is conserved)', () => {
    const s = solved(mixed);
    const net = new Array(mixed.nodes).fill(0);
    mixed.elements.forEach((e, k) => {
      net[e.a] -= s.I[k];
      net[e.b] += s.I[k];
    });
    for (const x of net) expect(Math.abs(x)).toBeLessThan(1e-12);
  });

  it('the power the batteries deliver equals the power dissipated in all resistances', () => {
    const s = solved(mixed);
    const absorbed = elementPowers(mixed, s);
    expect(Math.abs(absorbed.reduce((a, p) => a + p, 0))).toBeLessThan(1e-12);
    // each resistor's absorbed power is I²R and V²/R
    mixed.elements.forEach((e, k) => {
      if (e.kind !== 'R') return;
      expect(relativeError(absorbed[k], powerIR(s.I[k], e.R))).toBeLessThan(1e-9);
      expect(relativeError(absorbed[k], powerVR(s.V[e.a] - s.V[e.b], e.R))).toBeLessThan(1e-9);
    });
    // a battery delivers εI and loses I²r inside
    const b = mixed.elements[0] as Extract<Circuit['elements'][number], { kind: 'battery' }>;
    expect(relativeError(-absorbed[0], powerVI(b.emf, s.I[0]) - powerIR(s.I[0], b.r))).toBeLessThan(1e-12);
  });

  it('the loop rule: potential changes around a closed loop add to zero', () => {
    const s = solved(twoBattery);
    // loop 0 → 1 (battery up 12) → 2 (R₁) → 0 (R₃)
    const up = 12;
    const drops = 3 * s.I[1] + 6 * s.I[2];
    expect(relativeError(drops, up)).toBeLessThan(1e-12);
  });

  it('charging a capacitor through R turns exactly half the battery’s work into heat', () => {
    // ε = 10 V, R = 100 Ω, C = 100 μF: battery work εQ = CE², stored ½CE², heat ½CE²
    const c: Circuit = {
      nodes: 3,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 10, r: 0 },
        { kind: 'R', a: 1, b: 2, R: 100 },
        { kind: 'C', a: 2, b: 0, C: 100e-6 },
      ],
    };
    const tau = 100 * 100e-6;
    const dt = tau / 4000;
    let vC = [0, 0, 0];
    let heat = 0;
    for (let i = 0; i < 4000 * 20; i++) {
      const r = advance(c, vC, dt);
      if (!r.s.ok) throw new Error('no solution');
      heat += powerIR(r.s.I[1], 100) * dt;
      vC = r.vC;
    }
    const stored = 0.5 * 100e-6 * 100;
    expect(relativeError(vC[2], 10)).toBeLessThan(1e-6);
    expect(relativeError(heat, stored)).toBeLessThan(1e-3);
  });
});

describe('scaling', () => {
  it('doubling every EMF doubles every current (the network is linear)', () => {
    const s1 = solved(twoBattery);
    const double: Circuit = {
      ...twoBattery,
      elements: twoBattery.elements.map((e) => (e.kind === 'battery' ? { ...e, emf: 2 * e.emf } : e)),
    };
    const s2 = solved(double);
    s1.I.forEach((I, k) => expect(relativeError(s2.I[k], 2 * I)).toBeLessThan(1e-12));
  });

  it('multiplying every resistance by k divides every current by k', () => {
    const s1 = solved(twoBattery);
    const k = 3;
    const big: Circuit = { ...twoBattery, elements: twoBattery.elements.map((e) => (e.kind === 'R' ? { ...e, R: k * e.R } : e)) };
    const s2 = solved(big);
    s1.I.forEach((I, j) => expect(relativeError(s2.I[j], I / k)).toBeLessThan(1e-12));
  });

  it('R = ρL/A: twice the length doubles R, twice the diameter quarters it', () => {
    const R = wireResistance(RESISTIVITY.nichrome, 1, roundArea(0.4e-3));
    expect(relativeError(wireResistance(RESISTIVITY.nichrome, 2, roundArea(0.4e-3)), 2 * R)).toBeLessThan(1e-12);
    expect(relativeError(wireResistance(RESISTIVITY.nichrome, 1, roundArea(0.8e-3)), R / 4)).toBeLessThan(1e-12);
  });

  it('far above its rating a filament bulb’s current grows as V^0.6 (R ∝ T, radiation ∝ T⁴)', () => {
    const a = filamentBulb(600, 3, 6).I;
    const b = filamentBulb(1200, 3, 6).I;
    expect(Math.abs(Math.log(b / a) / Math.log(2) - 0.6)).toBeLessThan(0.01);
  });

  it('the RC curve depends on time only through t/RC', () => {
    expect(relativeError(rcCharge(0.2, 10, 1000, 100e-6).vC, rcCharge(0.4, 10, 2000, 100e-6).vC)).toBeLessThan(1e-12);
    expect(relativeError(rcCharge(0.2, 10, 1000, 100e-6).vC, rcCharge(0.4, 10, 1000, 200e-6).vC)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the backward-Euler capacitor converges to the exact RC curve at first order in Δt', () => {
    const c: Circuit = {
      nodes: 3,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 10, r: 0 },
        { kind: 'R', a: 1, b: 2, R: 1000 },
        { kind: 'C', a: 2, b: 0, C: 100e-6 },
      ],
    };
    const tau = 0.1;
    const errAt = (n: number) => {
      const dt = tau / n;
      let vC = [0, 0, 0];
      for (let i = 0; i < n; i++) vC = advance(c, vC, dt).vC;
      return Math.abs(vC[2] - rcCharge(tau, 10, 1000, 100e-6).vC);
    };
    const e1 = errAt(100);
    const e2 = errAt(200);
    const e3 = errAt(400);
    expect(e1).toBeLessThan(0.02);
    expect(Math.abs(e1 / e2 - 2)).toBeLessThan(0.05);
    expect(Math.abs(e2 / e3 - 2)).toBeLessThan(0.05);
  });

  it('the filament bisection settles: more iterations would not move the current', () => {
    const p = filamentBulb(4.5, 3, 6);
    const V = 4.5;
    expect(relativeError(p.I, V / p.R)).toBeLessThan(1e-12);
    // energy balance at the solution: V²/R equals the radiated power
    const sigma = 3 / (2800 ** 4 - 300 ** 4);
    expect(relativeError((V * V) / p.R, sigma * (p.T ** 4 - 300 ** 4))).toBeLessThan(1e-9);
  });
});

describe('failure modes', () => {
  it('an ideal battery shorted by a wire is reported, not solved', () => {
    const c: Circuit = {
      nodes: 2,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 6, r: 0 },
        { kind: 'wire', a: 1, b: 0 },
      ],
    };
    expect(solveCircuit(c)).toMatchObject({ ok: false, reason: 'short', element: 0 });
  });

  it('a battery with internal resistance shorted by a wire drives the short-circuit current ε/r', () => {
    const c: Circuit = {
      nodes: 2,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 6, r: 0.5 },
        { kind: 'wire', a: 1, b: 0 },
      ],
    };
    const s = solved(c);
    expect(relativeError(s.I[0], 12)).toBeLessThan(1e-12);
    expect(relativeError(s.I[1], 12)).toBeLessThan(1e-12);
  });

  it('two different ideal batteries in parallel are a conflict', () => {
    const c: Circuit = {
      nodes: 2,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 6, r: 0 },
        { kind: 'battery', a: 0, b: 1, emf: 9, r: 0 },
      ],
    };
    expect(solveCircuit(c)).toMatchObject({ ok: false, reason: 'conflict' });
  });

  it('an open circuit carries no current, and the whole EMF appears across the gap', () => {
    const c: Circuit = {
      nodes: 3,
      elements: [
        { kind: 'battery', a: 0, b: 1, emf: 6, r: 0.5 },
        { kind: 'R', a: 1, b: 2, R: 10 },
        { kind: 'open', a: 2, b: 0 },
      ],
    };
    const s = solved(c);
    for (const I of s.I) expect(Math.abs(I)).toBeLessThan(1e-15);
    expect(relativeError(s.V[2] - s.V[0], 6)).toBeLessThan(1e-12);
  });
});
