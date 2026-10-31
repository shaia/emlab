/**
 * Number formatting for the lesson 1.10 / 1.11 figures. `sci` in core/format.ts prints values
 * from 1000 to 9999 with toPrecision, which yields "5.00e+3"; this wrapper writes them as a·10³.
 */
import { sci, superscript } from './core/format';

export function sciFull(x: number, sig = 3): string {
  const ax = Math.abs(x);
  if (ax >= 1e3 && ax < 1e4) {
    const m = (x / 1e3).toPrecision(sig);
    return `${m.includes('.') ? m.replace(/\.?0+$/, '') : m}·10${superscript(3)}`;
  }
  return sci(x, sig);
}
