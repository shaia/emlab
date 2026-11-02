import { describe, expect, it } from 'vitest';
import { MU0 } from '~/physics/constants';
import { earthFieldFromSlope, horizontalField, needleDeflection, signedWireField, wireFieldAtNeedle, type CompassWire } from '~/physics/compass';
import { COMPASS_CURRENTS, COMPASS_R, compassReadings, DATASETS, fitLine, fitThroughOrigin, tanDeg } from '~/physics/lab';
import { compassDeflection, EARTH_B_HORIZONTAL, straightWireField } from '~/physics/magnetism';
import { relativeError } from '~/physics/vec';

const BE = EARTH_B_HORIZONTAL;
const DEG = Math.PI / 180;
const setup = (o: Partial<CompassWire> = {}): CompassWire => ({ I: 3, r: 0.03, azimuth: 0, BE, ...o });

describe('analytic limit: the tangent law', () => {
  it('a north–south wire gives tanθ = B_wire/B_E, the same as compassDeflection', () => {
    for (const I of [0.5, 2, 6, 40]) {
      const th = needleDeflection(setup({ I }));
      expect(relativeError(Math.tan(Math.abs(th)), straightWireField(I, 0.03) / BE)).toBeLessThan(1e-12);
      expect(relativeError(Math.abs(th), compassDeflection(straightWireField(I, 0.03), BE))).toBeLessThan(1e-12);
    }
  });
  it('B_wire = B_E turns the needle by exactly 45°', () => {
    const I = (BE * 2 * Math.PI * 0.03) / MU0;
    expect(relativeError(Math.abs(needleDeflection(setup({ I }))), Math.PI / 4)).toBeLessThan(1e-12);
  });
  it('no current, no deflection: the needle points north', () => {
    expect(Math.abs(needleDeflection(setup({ I: 0 })))).toBe(0);
  });
  it('the needle stays short of 90° however large the current (north–south wire)', () => {
    for (const I of [10, 1e3, 1e6]) expect(Math.abs(needleDeflection(setup({ I })))).toBeLessThan(Math.PI / 2);
  });
});

describe('directions (right-hand grip rule)', () => {
  it('current flowing north in a wire above the needle turns its north end west', () => {
    const w = wireFieldAtNeedle(setup());
    expect(w.east).toBeLessThan(0);
    expect(Math.abs(w.north)).toBeLessThan(1e-12 * Math.abs(w.east));
    expect(needleDeflection(setup())).toBeLessThan(0);
  });
  it('reversing the current, or putting the needle above the wire, turns it east by the same angle', () => {
    const west = needleDeflection(setup());
    expect(relativeError(needleDeflection(setup({ I: -3 })), -west)).toBeLessThan(1e-12);
    expect(relativeError(needleDeflection(setup({ below: false })), -west)).toBeLessThan(1e-12);
  });
  it('an east–west wire adds its field along the Earth’s: no deflection, or a full reversal', () => {
    // current east, needle below: û × (−ẑ) points north, along B_E
    const east = horizontalField(setup({ azimuth: 90 * DEG }));
    expect(Math.abs(east.east)).toBeLessThan(1e-12 * BE);
    expect(relativeError(east.north, BE + straightWireField(3, 0.03))).toBeLessThan(1e-12);
    expect(Math.abs(needleDeflection(setup({ azimuth: 90 * DEG })))).toBeLessThan(1e-9);
    // current west and stronger than B_E: the needle points south
    expect(relativeError(Math.abs(needleDeflection(setup({ azimuth: 90 * DEG, I: -10 }))), Math.PI)).toBeLessThan(1e-9);
  });
  it('the resultant vanishes when an east–west wire cancels the Earth’s field exactly', () => {
    const I = -(BE * 2 * Math.PI * 0.03) / MU0;
    expect(needleDeflection(setup({ azimuth: 90 * DEG, I }))).toBeNaN();
  });
});

describe('conservation: the wire’s field keeps its magnitude as the wire turns', () => {
  it('|B_wire| at the needle is μ₀I/(2πr) for every azimuth', () => {
    for (let a = 0; a < 360; a += 15) {
      const w = wireFieldAtNeedle(setup({ azimuth: a * DEG }));
      expect(relativeError(Math.hypot(w.east, w.north), straightWireField(3, 0.03))).toBeLessThan(1e-12);
    }
  });
});

describe('scaling', () => {
  it('doubling both the current and the height leaves the deflection unchanged', () => {
    expect(relativeError(needleDeflection(setup({ I: 6, r: 0.06 })), needleDeflection(setup()))).toBeLessThan(1e-12);
  });
  it('tanθ is linear in I: doubling the current doubles tanθ, not θ', () => {
    const t1 = needleDeflection(setup({ I: 2 }));
    const t2 = needleDeflection(setup({ I: 4 }));
    expect(relativeError(Math.tan(t2), 2 * Math.tan(t1))).toBeLessThan(1e-12);
    expect(Math.abs(t2)).toBeLessThan(2 * Math.abs(t1));
  });
  it('the slope inverts back to the Earth’s field: B_E = μ₀/(2πr·k)', () => {
    const k = signedWireField(1, 0.025) / BE;
    expect(relativeError(earthFieldFromSlope(k, 0.025), BE)).toBeLessThan(1e-12);
  });
});

describe('analytic limit: the lesson’s compass dataset', () => {
  it('readings are whole degrees within a degree and a half of the true deflection', () => {
    const deg = compassReadings(COMPASS_CURRENTS, COMPASS_R, BE, 1, 8);
    deg.forEach((d, i) => {
      expect(Number.isInteger(d)).toBe(true);
      expect(Math.abs(d - compassDeflection(straightWireField(COMPASS_CURRENTS[i], COMPASS_R), BE) / DEG)).toBeLessThanOrEqual(1.5);
    });
    expect(DATASETS['earth-field'].y).toEqual(deg.map(tanDeg));
  });
  it('tanθ against I is a line through the origin whose slope gives back B_E within 3%', () => {
    const d = DATASETS['earth-field'];
    const { slope, intercept } = fitLine(d.x, d.y);
    expect(Math.abs(intercept)).toBeLessThan(0.02);
    expect(relativeError(earthFieldFromSlope(slope, COMPASS_R), BE)).toBeLessThan(0.03);
    expect(relativeError(earthFieldFromSlope(fitThroughOrigin(d.x, d.y), COMPASS_R), BE)).toBeLessThan(0.03);
  });
  it('θ itself is not proportional to I: the last reading falls well short of six times the first', () => {
    const deg = compassReadings(COMPASS_CURRENTS, COMPASS_R, BE, 1, 8);
    expect(deg[5]).toBeLessThan(0.8 * 6 * deg[0]);
  });
});
