import { describe, expect, it } from 'vitest';
import { sci } from '~/sims/core/format';

describe('sci', () => {
  it.each([
    [0, '0'],
    [0.0123, '0.0123'],
    [3.6, '3.6'],
    [72000, '7.2·10⁴'],
    [5000, '5000'],
    [1234, '1230'],
    [9999, '1·10⁴'],
    [999.9, '1000'],
    [-2500, '-2500'],
    [1.6e-19, '1.6·10⁻¹⁹'],
  ])('%d → %s', (x, s) => {
    expect(sci(x)).toBe(s);
  });
});
