import { describe, expect, it } from 'vitest';
import { E_CHARGE } from '~/physics/constants';
import {
  CONTACT_FRACTION,
  chargeOfElectrons,
  distributeCharge,
  electronReceiver,
  electronsOfCharge,
  freshElectroscope,
  inducedShift,
  isQuantised,
  leafAngleDeg,
  nearestAllowedCharge,
  polarisationAttraction,
  polarisationShift,
  run,
  shareByContact,
  step,
  systemElectrons,
  transferElectrons,
  zones,
  type ElectroscopeAction,
} from '~/physics/charging';
import { relativeError } from '~/physics/vec';

// No convergence test: the model is algebraic (no integrator, no tracing step to refine).

describe('analytic limits: quantisation', () => {
  it('n electrons carry charge -n*e, and the count is recovered exactly', () => {
    for (const n of [1, 3, 25, 6.25e9]) {
      expect(relativeError(chargeOfElectrons(n), -n * E_CHARGE)).toBeLessThan(1e-12);
      expect(relativeError(electronsOfCharge(chargeOfElectrons(n)), n)).toBeLessThan(1e-12);
    }
  });

  it('1 microcoulomb is 6.25e12 electrons (1e-6 / 1.6e-19)', () => {
    expect(relativeError(electronsOfCharge(-1e-6), 6.25e12)).toBeLessThan(1e-12);
  });

  it('whole multiples of e are allowed; half an e and 1.0e-19 C are not', () => {
    expect(isQuantised(3.2e-19)).toBe(true);
    expect(isQuantised(-4.8e-19)).toBe(true);
    expect(isQuantised(0.8e-19)).toBe(false);
    expect(isQuantised(2.5 * E_CHARGE)).toBe(false);
    expect(isQuantised(1.0e-19)).toBe(false);
  });

  it('the nearest allowed charge to 5.0e-19 C is 3e (4.8e-19 C)', () => {
    expect(relativeError(nearestAllowedCharge(5.0e-19), 3 * E_CHARGE)).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('rubbing moves electrons and keeps the pair neutral overall', () => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 7; i++) [a, b] = transferElectrons(a, b, 1);
    expect([a, b]).toEqual([-7, 7]);
    expect(a + b).toBe(0);
  });

  it('transfer rejects a fractional electron', () => {
    expect(() => transferElectrons(0, 0, 0.5)).toThrow();
  });

  it('glass gives electrons to silk, and PVC takes them from wool', () => {
    expect(electronReceiver('glass', 'silk')).toBe('b');
    expect(electronReceiver('pvc', 'wool')).toBe('a');
    expect(electronReceiver('wool', 'wool')).toBeNull();
  });

  it('contact between conductors shares the total, in proportion to size', () => {
    expect(shareByContact(10, 0, 1, 1)).toEqual([5, 5]);
    const [c, d] = shareByContact(9, 0, 2, 1);
    expect(c + d).toBe(9);
    expect(c).toBe(6);
    const [e, f] = shareByContact(-7, 2, 1, 1);
    expect(e + f).toBe(-5);
  });

  it('spreading on a conductor and staying on an insulator both keep the total', () => {
    const dep = [0, 0, 5, 0, 0, 0, 0];
    for (const kind of ['conductor', 'insulator'] as const) {
      expect(distributeCharge(kind, dep).reduce((x, y) => x + y, 0)).toBe(5);
      expect(distributeCharge(kind, dep.map((x) => -x)).reduce((x, y) => x + y, 0)).toBe(-5);
    }
  });

  it('every electroscope action except a new rod conserves the electrons of the whole system', () => {
    const actions: ElectroscopeAction[] = [
      { type: 'approach', prox: 0.4 },
      { type: 'ground', on: true },
      { type: 'approach', prox: 1 },
      { type: 'touch' },
      { type: 'ground', on: false },
      { type: 'approach', prox: 0 },
      { type: 'touch' },
      { type: 'approach', prox: 1 },
      { type: 'touch' },
      { type: 'ground', on: true },
      { type: 'approach', prox: 0.6 },
      { type: 'ground', on: false },
    ];
    for (const rodN of [8, -8, 5, -3]) {
      let s = step(freshElectroscope(), { type: 'rod', n: rodN });
      const total = systemElectrons(s);
      for (const a of actions) {
        s = step(s, a);
        expect(systemElectrons(s)).toBe(total);
        expect(zones(s).leaves + zones(s).knob).toBe(s.n);
      }
    }
  });
});

describe('analytic limits: the charging methods give the textbook signs', () => {
  const sign = (x: number) => Math.sign(x) || 0;

  it('a neutral electroscope with a rod near has net charge 0 but charged leaves, of the rod sign', () => {
    for (const rodN of [8, -8]) {
      const s = run(freshElectroscope(rodN), [{ type: 'approach', prox: 1 }]);
      expect(s.n).toBe(0);
      const { leaves, knob } = zones(s);
      expect(sign(leaves)).toBe(sign(rodN));
      expect(knob).toBe(-leaves);
      expect(leafAngleDeg(leaves)).toBeGreaterThan(0);
    }
  });

  it('removing the rod brings the leaves back down', () => {
    const s = run(freshElectroscope(8), [
      { type: 'approach', prox: 1 },
      { type: 'approach', prox: 0 },
    ]);
    expect(zones(s).leaves).toBe(0);
    expect(leafAngleDeg(zones(s).leaves)).toBe(0);
  });

  it('contact leaves the electroscope with the SAME sign as the rod', () => {
    for (const rodN of [8, -8]) {
      const s = run(freshElectroscope(rodN), [
        { type: 'approach', prox: 1 },
        { type: 'touch' },
        { type: 'approach', prox: 0 },
      ]);
      expect(sign(s.n)).toBe(sign(rodN));
      expect(Math.abs(s.n)).toBe(Math.round(CONTACT_FRACTION * 8));
      expect(sign(s.rodN)).toBe(sign(rodN));
      expect(Math.abs(s.rodN)).toBeLessThan(8);
    }
  });

  it('induction (rod near, ground on, ground off, rod away) leaves the OPPOSITE sign; the rod keeps ALL its charge', () => {
    for (const rodN of [8, -8]) {
      const s = run(freshElectroscope(rodN), [
        { type: 'approach', prox: 1 },
        { type: 'ground', on: true },
        { type: 'ground', on: false },
        { type: 'approach', prox: 0 },
      ]);
      expect(sign(s.n)).toBe(-sign(rodN));
      expect(s.rodN).toBe(rodN);
      expect(zones(s).leaves).not.toBe(0);
      // electrons flow to the Earth for a negative rod, and come from it for a positive one
      expect(sign(s.earth)).toBe(sign(rodN));
    }
  });

  it('with the ground on and the rod near, the leaves are down and the net charge is already opposite', () => {
    const s = run(freshElectroscope(8), [
      { type: 'approach', prox: 1 },
      { type: 'ground', on: true },
    ]);
    expect(zones(s).leaves).toBe(0);
    expect(s.n).toBeLessThan(0);
  });

  it('removing the ground AFTER the rod leaves the electroscope neutral (the wrong order)', () => {
    const s = run(freshElectroscope(8), [
      { type: 'approach', prox: 1 },
      { type: 'ground', on: true },
      { type: 'approach', prox: 0 },
      { type: 'ground', on: false },
    ]);
    expect(s.n).toBe(0);
  });

  it('a charged electroscope: a rod of the same sign opens the leaves further, the opposite sign closes them', () => {
    const charged = run(freshElectroscope(8), [
      { type: 'approach', prox: 1 },
      { type: 'touch' },
      { type: 'approach', prox: 0 },
    ]);
    const base = Math.abs(zones(charged).leaves);
    const same = step(step(charged, { type: 'rod', n: 8 }), { type: 'approach', prox: 1 });
    const opposite = step(step(charged, { type: 'rod', n: -8 }), { type: 'approach', prox: 1 });
    expect(Math.abs(zones(same).leaves)).toBeGreaterThan(base);
    expect(Math.abs(zones(opposite).leaves)).toBeLessThan(base);
  });
});

describe('scaling and symmetry', () => {
  it('the leaf opening grows with the excess on the leaves, and ignores its sign', () => {
    let prev = -1;
    for (let n = 0; n <= 8; n++) {
      const a = leafAngleDeg(n);
      expect(a).toBeGreaterThanOrEqual(prev);
      expect(leafAngleDeg(-n)).toBe(a);
      prev = a;
    }
    expect(leafAngleDeg(100)).toBe(leafAngleDeg(8));
  });

  it('the induced shift is odd in the rod charge and grows as the rod approaches', () => {
    expect(inducedShift(-8, 0.7)).toBe(-inducedShift(8, 0.7));
    expect(inducedShift(8, 1)).toBeGreaterThan(inducedShift(8, 0.4));
    expect(inducedShift(8, 0)).toBe(0);
  });

  it('polarisation shift is linear in the rod charge and falls as 1/r^2; flipping the rod flips it', () => {
    expect(relativeError(polarisationShift(-6, 2), 2 * polarisationShift(-3, 2))).toBeLessThan(1e-12);
    expect(relativeError(polarisationShift(-4, 2), polarisationShift(-4, 1) / 4)).toBeLessThan(1e-12);
    expect(polarisationShift(5, 1.3)).toBe(-polarisationShift(-5, 1.3));
    expect(polarisationShift(-4, 1)).toBeGreaterThan(0);
  });

  it('the attraction on a neutral body scales as rodN^2/r^5 and is the same for both signs', () => {
    expect(polarisationAttraction(4, 1.5)).toBe(polarisationAttraction(-4, 1.5));
    expect(relativeError(polarisationAttraction(6, 1), 4 * polarisationAttraction(3, 1))).toBeLessThan(1e-12);
    expect(relativeError(polarisationAttraction(3, 2), polarisationAttraction(3, 1) / 32)).toBeLessThan(1e-12);
    expect(polarisationAttraction(0, 1)).toBe(0);
  });
});

describe('distribution on a conductor and an insulator', () => {
  it('an insulator keeps the charge where it was put', () => {
    const dep = [0, 0, 4, 0, 0];
    expect(distributeCharge('insulator', dep)).toEqual(dep);
  });

  it('a conductor spreads it to within one electron per site, with the remainder at the ends', () => {
    expect(distributeCharge('conductor', [0, 0, 6, 0, 0, 0])).toEqual([1, 1, 1, 1, 1, 1]);
    const out = distributeCharge('conductor', [0, 0, 8, 0, 0, 0]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(8);
    expect(Math.max(...out) - Math.min(...out)).toBeLessThanOrEqual(1);
    expect(out[0]).toBe(2);
    expect(out[out.length - 1]).toBe(2);
  });

  it('negative totals spread symmetrically to positive ones', () => {
    const pos = distributeCharge('conductor', [0, 7, 0, 0]);
    const neg = distributeCharge('conductor', [0, -7, 0, 0]);
    expect(neg).toEqual(pos.map((x) => -x));
  });
});
