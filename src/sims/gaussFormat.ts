import { sci } from './core/format';

/**
 * `sci` from core/format prints 1000–9999 as "1.00e+3" (toPrecision(3) switches to exponent form).
 * Whole numbers in that range are printed as they are; everything else goes through `sci`.
 */
export function sciN(x: number, sig = 3): string {
  const a = Math.abs(x);
  if (a >= 1000 && a < 1e4) return String(Math.round(x));
  return sci(x, sig);
}
