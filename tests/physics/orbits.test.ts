import { describe, expect, it } from 'vitest';
import { E_CHARGE, M_ELECTRON, M_PROTON } from '~/physics/constants';
import { circlePosition, orbitPeriod, orbitRadius, spectrometerRadius } from '~/physics/magnetism';
import { borisStep, NO_FIELD, type Body } from '~/physics/motion';
import { edgeCrossing, ionMass, isotopeSeparation, landingDistance } from '~/physics/orbits';
import { relativeError, type Vec2 } from '~/physics/vec';

const deg = Math.PI / 180;

describe('analytic limit: a charge entering a field edge', () => {
  it('perpendicular entry makes a half circle: it leaves one diameter away after half a period', () => {
    const v = 4e5;
    const B = 0.05;
    const e = edgeCrossing(E_CHARGE, M_PROTON, B, [0, 0], [v, 0]);
    expect(relativeError(e.chord, 2 * orbitRadius(M_PROTON, v, E_CHARGE, B))).toBeLessThan(1e-12);
    expect(relativeError(e.time, orbitPeriod(M_PROTON, E_CHARGE, B) / 2)).toBeLessThan(1e-12);
    expect(relativeError(e.arc, Math.PI)).toBeLessThan(1e-12);
  });

  it('a proton in a ⊙ field turns clockwise (exits below the entry); an electron turns the other way', () => {
    const p = edgeCrossing(E_CHARGE, M_PROTON, 0.05, [0, 0], [4e5, 0]);
    const el = edgeCrossing(-E_CHARGE, M_ELECTRON, 0.05, [0, 0], [4e5, 0]);
    expect(p.exit[1]).toBeLessThan(0);
    expect(el.exit[1]).toBeGreaterThan(0);
    // reversing the field reverses the side as well
    expect(edgeCrossing(E_CHARGE, M_PROTON, -0.05, [0, 0], [4e5, 0]).exit[1]).toBeGreaterThan(0);
  });

  it('entry at φ to the normal leaves a chord 2r·cosφ and turns through π ± 2φ', () => {
    const v = 3e5;
    const B = 0.1;
    const r = orbitRadius(M_PROTON, v, E_CHARGE, B);
    const phi = 30 * deg;
    // a proton in ⊗ turns counterclockwise: aimed upward, its centre lies outside the field and the arc is short
    const up = edgeCrossing(E_CHARGE, M_PROTON, -B, [0, 0], [v * Math.cos(phi), v * Math.sin(phi)]);
    const down = edgeCrossing(E_CHARGE, M_PROTON, -B, [0, 0], [v * Math.cos(phi), -v * Math.sin(phi)]);
    expect(relativeError(up.chord, 2 * r * Math.cos(phi))).toBeLessThan(1e-12);
    expect(relativeError(down.chord, 2 * r * Math.cos(phi))).toBeLessThan(1e-12);
    expect(relativeError(up.arc, Math.PI - 2 * phi)).toBeLessThan(1e-12);
    expect(relativeError(down.arc, Math.PI + 2 * phi)).toBeLessThan(1e-12);
  });

  it('the exit point lies on the analytic circle at the computed time', () => {
    const v0: Vec2 = [2e5, -1e5];
    const e = edgeCrossing(E_CHARGE, M_PROTON, 0.2, [0.01, 0.02], v0);
    const p = circlePosition(E_CHARGE, M_PROTON, 0.2, [0.01, 0.02], v0, e.time);
    expect(Math.hypot(p[0] - e.exit[0], p[1] - e.exit[1])).toBeLessThan(1e-9 * e.r);
  });

  it('a spectrometer lands an ion at 2√(2mU/q)/B, and the ion mass is A proton masses', () => {
    expect(relativeError(ionMass(20), 20 * M_PROTON)).toBeLessThan(1e-12);
    const m = ionMass(20);
    expect(relativeError(landingDistance(m, E_CHARGE, 2000, 0.2), (2 * Math.sqrt((2 * m * 2000) / E_CHARGE)) / 0.2)).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('the speed on leaving equals the speed on entering, and the exit angle mirrors the entry angle', () => {
    const v0: Vec2 = [2.5e5, 1.2e5];
    const e = edgeCrossing(-E_CHARGE, M_PROTON, 0.08, [0, 0], v0);
    expect(relativeError(Math.hypot(...e.vExit), Math.hypot(...v0))).toBeLessThan(1e-12);
    expect(e.vExit[0]).toBeLessThan(0); // it moves out of the field
    expect(e.vExit[1]).toBe(v0[1]);
  });

  it('a Boris integration through the sharp edge keeps |v| and comes out where the formula says', () => {
    const v0: Vec2 = [3e5, 1e5];
    const Bz = 0.1;
    const e = edgeCrossing(E_CHARGE, M_PROTON, Bz, [0, 0], v0);
    const B = (p: readonly number[]): [number, number, number] => [0, 0, p[0] >= 0 ? Bz : 0];
    let b: Body = { pos: [1e-9, 0, 0], vel: [v0[0], v0[1], 0], m: M_PROTON, q: E_CHARGE };
    const dt = orbitPeriod(M_PROTON, E_CHARGE, Bz) / 4000;
    let t = 0;
    while (b.pos[0] >= 0 && t < 2 * e.time) {
      b = borisStep(b, NO_FIELD, B, t, dt);
      t += dt;
    }
    expect(relativeError(Math.hypot(b.vel[0], b.vel[1]), Math.hypot(...v0))).toBeLessThan(1e-12);
    expect(Math.abs(b.pos[1] - e.exit[1])).toBeLessThan(0.01 * e.chord);
  });
});

describe('scaling', () => {
  it('a faster charge leaves farther away, after the same time', () => {
    const slow = edgeCrossing(E_CHARGE, M_PROTON, 0.05, [0, 0], [2e5, 0]);
    const fast = edgeCrossing(E_CHARGE, M_PROTON, 0.05, [0, 0], [4e5, 0]);
    expect(relativeError(fast.chord, 2 * slow.chord)).toBeLessThan(1e-12);
    expect(relativeError(fast.time, slow.time)).toBeLessThan(1e-12);
  });

  it('in a spectrometer the landing distance grows as √m and √U and falls as 1/B', () => {
    const base = landingDistance(ionMass(20), E_CHARGE, 2000, 0.2);
    expect(relativeError(landingDistance(ionMass(80), E_CHARGE, 2000, 0.2), 2 * base)).toBeLessThan(1e-12);
    expect(relativeError(landingDistance(ionMass(20), E_CHARGE, 8000, 0.2), 2 * base)).toBeLessThan(1e-12);
    expect(relativeError(landingDistance(ionMass(20), E_CHARGE, 2000, 0.4), base / 2)).toBeLessThan(1e-12);
    // a doubly charged ion of twice the mass lands with the singly charged light one
    expect(relativeError(landingDistance(ionMass(40), 2 * E_CHARGE, 2000, 0.2), base)).toBeLessThan(1e-12);
  });

  it('isotope separation is the difference of the two diameters', () => {
    const d = isotopeSeparation(ionMass(35), ionMass(37), E_CHARGE, 1000, 0.25);
    const expected = 2 * (spectrometerRadius(ionMass(37), E_CHARGE, 1000, 0.25) - spectrometerRadius(ionMass(35), E_CHARGE, 1000, 0.25));
    expect(relativeError(d, expected)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the Boris exit point approaches the analytic one as the step shrinks', () => {
    const v0: Vec2 = [3e5, 0];
    const Bz = 0.1;
    const e = edgeCrossing(E_CHARGE, M_PROTON, Bz, [0, 0], v0);
    const B = (p: readonly number[]): [number, number, number] => [0, 0, p[0] >= 0 ? Bz : 0];
    const missAt = (n: number) => {
      let b: Body = { pos: [1e-12, 0, 0], vel: [v0[0], 0, 0], m: M_PROTON, q: E_CHARGE };
      const dt = orbitPeriod(M_PROTON, E_CHARGE, Bz) / n;
      let t = 0;
      while (b.pos[0] >= 0) {
        b = borisStep(b, NO_FIELD, B, t, dt);
        t += dt;
      }
      // the step that crossed the edge: interpolate linearly back to x = 0
      const back = b.pos[0] / b.vel[0];
      const y = b.pos[1] - b.vel[1] * back;
      return Math.abs(y - e.exit[1]);
    };
    const coarse = missAt(100);
    const fine = missAt(1000);
    expect(fine).toBeLessThan(coarse / 5);
    expect(fine).toBeLessThan(1e-3 * e.chord);
  });
});
