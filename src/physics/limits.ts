/**
 * The limit check (lesson 6.16): six closed forms the course derived, each next to the simpler formulas it
 * must reduce to at the two ends of its range, and next to a "suspect" formula that looks right but fails one
 * of those ends. Every exact value comes from the module that derived it (continuous.ts, magnetism.ts,
 * biotsavart.ts, dipole.ts); every limit is a formula the course already uses (Coulomb's kQ/r², the line's
 * 2kλ/r, the plane's σ/(2ε₀), the flat coil's μ₀NI/(2R), the long solenoid's μ₀nI, the long wire's μ₀I/(2πs),
 * the Biot–Savart element, the point dipole's 2kp/r³). Nothing here is a new approximation.
 *
 * MODEL SPECIFICATION
 * - System: one fixed body per case, with one length `x` free to vary over several decades:
 *   ring (charge Q, radius R) seen from a point on its axis at height x = z;
 *   rod (density λ, length x = L) seen from a point on its perpendicular bisector at distance r;
 *   disc (density σ, radius x = R) seen from a point on its axis at height z;
 *   solenoid (N turns, current I, radius R, length x = L) at its centre;
 *   straight segment (current I, length x = L) seen from a point on its bisector at distance s;
 *   dipole (charges ±q, separation d) on its axis at distance x = r from its centre, beyond +q.
 * - Dynamics: none (statics). Exact field = the closed form of the lesson that derived it.
 * - Boundary: fields vanish at infinity (finite bodies).
 * - Ignored: the thickness of every wire, ring and coil winding; the pitch of the solenoid (it is a
 *   current sheet, as in `finiteSolenoidAxisField`).
 * - Valid when: x stays inside the case's [min, max]. Each limit holds at its own end only: the ratio
 *   exact/limit tends to 1 there (the relative error falls as a power of x, or of x − d/2 at the dipole's
 *   near end; see `limitError`), and the
 *   limit is not meant to hold at the other end.
 * - Failure modes: the dipole's exact field diverges as x → d/2 (the point is on +q), so its range starts
 *   just beyond d/2. A suspect formula is wrong on purpose: it passes one end and fails the other.
 */

import { EPS0, K, MU0 } from './constants';
import { discAxisField, lineField, ringAxisField, rodBisectorField } from './continuous';
import { pointFieldMagnitude, planeField } from './electrostatics';
import { finiteSolenoidAxisField, loopCenterField, solenoidField, straightWireField } from './magnetism';
import { elementFieldMagnitude, symmetricSegmentField } from './biotsavart';
import { axisFieldExact, axisFieldFar, dipoleMoment } from './dipole';

export type LimitCaseId = 'ring' | 'rod' | 'disc' | 'solenoid' | 'wire' | 'dipole';
export type End = 'small' | 'large';

export interface LimitFormula {
  end: End;
  /** the field this end must reduce to, as a function of x [N/C or T] */
  f: (x: number) => number;
}

export interface LimitCase {
  id: LimitCaseId;
  /** 'E' for an electric field [N/C], 'B' for a magnetic field [T] */
  kind: 'E' | 'B';
  /** range of the free length [m] */
  min: number;
  max: number;
  exact: (x: number) => number;
  limits: [LimitFormula, LimitFormula];
  /** a plausible wrong formula: it agrees with `passes` and disagrees with the other end */
  suspect: { f: (x: number) => number; passes: End };
  /** the fixed length the free one is compared with [m] (R, r, z, R, s, d) */
  scale: number;
}

/* ------------------------------------------------------------ the six fixed bodies */

export const RING = { Q: 5e-9, R: 0.1 };
export const ROD = { lambda: 1e-8, r: 0.05 };
export const DISC = { sigma: 1e-8, z: 0.05 };
export const SOLENOID = { N: 200, I: 2, R: 0.05 };
export const WIRE = { I: 5, s: 0.05 };
export const DIPOLE = { q: 1e-9, d: 0.01 };

const ring: LimitCase = {
  id: 'ring',
  kind: 'E',
  min: 1e-3,
  max: 10,
  scale: RING.R,
  exact: (z) => ringAxisField(RING.Q, RING.R, z),
  limits: [
    // near the centre: the tangent line of 6.4, kQz/R³ (zero at the centre, by symmetry)
    { end: 'small', f: (z) => (K * RING.Q * z) / RING.R ** 3 },
    { end: 'large', f: (z) => pointFieldMagnitude(RING.Q, z) },
  ],
  // kQ/(z² + R²): right far away, but kQ/R² at the centre, where symmetry demands zero
  suspect: { f: (z) => (K * RING.Q) / (z * z + RING.R ** 2), passes: 'large' },
};

const rod: LimitCase = {
  id: 'rod',
  kind: 'E',
  min: 1e-3,
  max: 10,
  scale: ROD.r,
  exact: (L) => rodBisectorField(ROD.lambda, L, ROD.r),
  limits: [
    { end: 'small', f: (L) => pointFieldMagnitude(ROD.lambda * L, ROD.r) },
    { end: 'large', f: () => lineField(ROD.lambda, ROD.r) },
  ],
  // kλL/(r² + L²/4): a point charge when short, but it dies away as 4kλ/L for a long rod
  suspect: { f: (L) => (K * ROD.lambda * L) / (ROD.r ** 2 + (L * L) / 4), passes: 'small' },
};

const disc: LimitCase = {
  id: 'disc',
  kind: 'E',
  min: 1e-3,
  max: 10,
  scale: DISC.z,
  exact: (R) => discAxisField(DISC.sigma, R, DISC.z),
  limits: [
    { end: 'small', f: (R) => pointFieldMagnitude(DISC.sigma * Math.PI * R * R, DISC.z) },
    { end: 'large', f: () => planeField(DISC.sigma) },
  ],
  // σ/(2ε₀)·R/√(z² + R²): the plane when wide, but ∝ R (not ∝ R², the charge) when small
  suspect: { f: (R) => (DISC.sigma / (2 * EPS0)) * (R / Math.hypot(DISC.z, R)), passes: 'large' },
};

const solenoid: LimitCase = {
  id: 'solenoid',
  kind: 'B',
  min: 1e-3,
  max: 10,
  scale: SOLENOID.R,
  exact: (L) => finiteSolenoidAxisField(SOLENOID.N, L, SOLENOID.R, SOLENOID.I, 0),
  limits: [
    { end: 'small', f: () => loopCenterField(SOLENOID.I, SOLENOID.R, SOLENOID.N) },
    { end: 'large', f: (L) => solenoidField(SOLENOID.N, L, SOLENOID.I) },
  ],
  // μ₀NI/√(L² + R²): the long solenoid, but μ₀NI/R, twice the flat coil, when short
  suspect: { f: (L) => (MU0 * SOLENOID.N * SOLENOID.I) / Math.hypot(L, SOLENOID.R), passes: 'large' },
};

const wire: LimitCase = {
  id: 'wire',
  kind: 'B',
  min: 1e-3,
  max: 10,
  scale: WIRE.s,
  exact: (L) => symmetricSegmentField(WIRE.I, L, WIRE.s),
  limits: [
    // a short piece is one Biot–Savart element, at right angles to the line to the point
    { end: 'small', f: (L) => elementFieldMagnitude(WIRE.I, L, WIRE.s, Math.PI / 2) },
    { end: 'large', f: () => straightWireField(WIRE.I, WIRE.s) },
  ],
  // μ₀I/(4πs)·L/√(s² + L²): one element when short, but half the long wire's field when long
  suspect: { f: (L) => ((MU0 * WIRE.I) / (4 * Math.PI * WIRE.s)) * (L / Math.hypot(WIRE.s, L)), passes: 'small' },
};

const DIPOLE_P = dipoleMoment(DIPOLE.q, DIPOLE.d);
const dipole: LimitCase = {
  id: 'dipole',
  kind: 'E',
  min: 0.0055,
  max: 1,
  scale: DIPOLE.d,
  exact: (r) => axisFieldExact(DIPOLE.q, DIPOLE.d, r),
  limits: [
    // right next to +q its own field wins
    { end: 'small', f: (r) => pointFieldMagnitude(DIPOLE.q, r - DIPOLE.d / 2) },
    { end: 'large', f: (r) => axisFieldFar(DIPOLE_P, r) },
  ],
  // 2kqd/(r² − d²/4)^{3/2}: 2kp/r³ far away, but it grows only as (r − d/2)^{−3/2} next to +q
  suspect: { f: (r) => (2 * K * DIPOLE.q * DIPOLE.d) / (r * r - DIPOLE.d ** 2 / 4) ** 1.5, passes: 'large' },
};

export const LIMIT_CASES: Record<LimitCaseId, LimitCase> = { ring, rod, disc, solenoid, wire, dipole };

/** exact / limit at x: tends to 1 at the limit's own end */
export const limitRatio = (c: LimitCase, end: End, x: number): number => c.exact(x) / c.limits[end === 'small' ? 0 : 1].f(x);

/** suspect / limit at x */
export const suspectRatio = (c: LimitCase, end: End, x: number): number => c.suspect.f(x) / c.limits[end === 'small' ? 0 : 1].f(x);

/** |exact/limit − 1| at x */
export const limitError = (c: LimitCase, end: End, x: number): number => Math.abs(limitRatio(c, end, x) - 1);
