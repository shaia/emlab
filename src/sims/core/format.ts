/** Number formatting for readouts: scientific notation the way the Bagrut writes it (4·10⁵). */

const SUP: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

export const superscript = (n: number | string) =>
  String(n)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('');

/** 3 significant figures; plain decimals between 0.01 and 10⁴, otherwise a·10ⁿ. */
export function sci(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return '∞';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 0.01 && ax < 1e4) {
    return trim(x.toPrecision(sig));
  }
  const exp = Math.floor(Math.log10(ax));
  const mant = x / 10 ** exp;
  const m = trim(mant.toPrecision(sig));
  if (m === '10' || m === '-10') return `${m === '10' ? '1' : '-1'}·10${superscript(exp + 1)}`;
  return `${m}·10${superscript(exp)}`;
}

function trim(s: string) {
  return s.includes('.') && !s.includes('e') ? s.replace(/\.?0+$/, '') : s;
}

/** Format a charge in micro-coulombs, the unit lessons use. */
export const microC = (q: number) => `${trim((q * 1e6).toFixed(1))} μC`;

/** Compass name of a direction angle, in Hebrew, for screen readers and lens cards. */
export function directionHe(rad: number): string {
  const names = ['ימינה', 'ימינה-למעלה', 'למעלה', 'שמאלה-למעלה', 'שמאלה', 'שמאלה-למטה', 'למטה', 'ימינה-למטה'];
  const i = Math.round(((rad + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
  return names[i];
}
