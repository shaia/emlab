import { describe, expect, it } from 'vitest';
import { C_LIGHT, EPS0, MU0 } from '~/physics/constants';
import { relativeError } from '~/physics/vec';

describe('identities', () => {
  it('the speed of light follows from the engine constants: 1/√(μ₀ε₀) = 3·10⁸ m/s', () => {
    expect(relativeError(1 / Math.sqrt(MU0 * EPS0), C_LIGHT)).toBeLessThan(1e-12);
  });
});
