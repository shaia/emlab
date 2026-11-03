/**
 * Maxwell's equations in differential form (lesson 6.13): the five scenes of figure MaxwellTable, one
 * per term of the four equations, each with a probe (a small box for the divergence laws, a small loop
 * for the curl laws) whose integral and whose ratio are compared with the right-hand side of the
 * equation, in its integral form (over the whole probe) and in its differential form (at the centre).
 * Also the charge-conservation example of the lesson: a point charge that leaks away radially.
 *
 * MODEL SPECIFICATION
 * - System: fields that do not depend on z (the axis out of the page), drawn in the z = 0 plane, so that
 *   the in-plane divergence and the z component of the curl are the full ∇· and (∇×)_z (divcurl.ts header):
 *   - 'rod': a long rod of radius R with a uniform charge density ρ (divcurl.ts `rodField`): ∇·E = ρ/ε₀.
 *   - 'coil': a long flat coil standing upright, which acts like a bar magnet: two strips |y| < h at
 *     x = ∓w carrying a surface current K (A/m) out of the page on the left and into it on the right.
 *     Each strip is a sum of thin wires; integrated in closed form. Inside, B points up (north pole at
 *     the top); outside, the lines return. ∇·B = 0 everywhere, the strips included.
 *   - 'induced': a uniform B along z inside a circle of radius R (the core of a long solenoid), growing
 *     at dB/dt. The induced E is azimuthal: E = −(dB/dt)·s/2 inside and −(dB/dt)·R²/(2s) outside, so
 *     that (∇×E)_z = −∂B_z/∂t inside and 0 outside (Faraday). Positive dB/dt turns E clockwise (Lenz).
 *   - 'wire': a thick wire of radius R with a uniform current density J along z (divcurl.ts
 *     `thickWireB`): (∇×B)_z = μ₀J inside.
 *   - 'gap': the gap of a parallel-plate capacitor with circular plates of radius a, seen face-on: a
 *     uniform E along z inside r < a, growing at dE/dt, no conduction current. The Ampère–Maxwell law
 *     gives B = μ₀ε₀(dE/dt)·s/2 inside and μ₀ε₀(dE/dt)·a²/(2s) outside (lesson 6.12, displacement.ts),
 *     counter-clockwise for positive dE/dt: (∇×B)_z = μ₀ε₀ ∂E_z/∂t inside, 0 outside.
 *   `static: true` sets every time derivative to zero: the induced E and the gap's B vanish.
 * - Dynamics: none beyond the given constant rates (a snapshot at one instant).
 * - Boundary: every source is infinitely long along z. The 'coil' strips have finite height 2h.
 * - Ignored: the solenoid's own windings and the capacitor's plates and wires (only the region drawn
 *   matters); retardation (quasi-static: the fields follow the rates instantly, valid when the region
 *   is much smaller than c times the time over which the rates change).
 * - Valid when: the probe does not run along a strip of the coil (its field has a log singularity at a
 *   strip's ends, and the midpoint sum is noisy there).
 * - Failure modes: s = 0 in a 1/s branch is guarded (the field is 0 on the axis).
 *
 * Leaking charge (`leakingCharge`): a point charge Q(t) at the origin whose charge flows away radially
 * and evenly in every direction (through a weakly conducting medium, say). J = −(dQ/dt)/(4πr²) r̂ and
 * E = kQ/r² r̂, so J + ε₀∂E/∂t = 0 at every r > 0: the conduction and displacement currents cancel,
 * and by symmetry B = 0, as the Ampère–Maxwell law requires. Without the displacement term the law
 * would demand ∇×B = μ₀J ≠ 0 for a field that symmetry forces to vanish.
 */

import { EPS0, K, MU0 } from './constants';
import { rodField, ROD_R, ROD_RHO, THICK_I, thickWireB } from './divcurl';
import type { Vec2, Vec3 } from './vec';
import { curl2, divergence2, squareCirculation, squareFlux, type Field2 } from './vectorcalc';

export type SceneId = 'rod' | 'coil' | 'induced' | 'wire' | 'gap';

/* ---------------------------------------------------------- the sources (SI) */

/** the flat coil: half-width w, half-height h, surface current K */
export const COIL_W = 0.02; // m
export const COIL_H = 0.05; // m
export const COIL_K = 1000; // A/m
/** the solenoid core of the 'induced' scene */
export const SOL_R = 0.04; // m
export const SOL_B = 0.05; // T, the field at the instant drawn
export const SOL_DBDT = 2; // T/s
/** the capacitor gap */
export const GAP_A = 0.05; // m
export const GAP_E = 1e5; // V/m, the field at the instant drawn
export const GAP_DEDT = 1e12; // V/(m·s)

/* -------------------------------------------------------------- the fields */

/** B of a strip at x = x0, |y| < h, carrying surface current K along +z (out of the page) [T]. */
export function stripB(Ks: number, x0: number, h: number): Field2 {
  const c = (MU0 * Ks) / (2 * Math.PI);
  return (x, y) => {
    const d = x - x0;
    const up = y + h;
    const dn = y - h;
    // Bx = −(μ₀K/4π)·ln[(d² + (y+h)²)/(d² + (y−h)²)];  By = (μ₀K/2π)·[atan((y+h)/d) − atan((y−h)/d)]
    const num = d * d + up * up;
    const den = d * d + dn * dn;
    const Bx = num > 0 && den > 0 ? -(c / 2) * Math.log(num / den) : 0;
    // on the strip itself (d = 0, |y| < h) By jumps by μ₀K, like an infinite sheet: return the mean, 0
    const By = d === 0 ? 0 : c * (Math.atan(up / d) - Math.atan(dn / d));
    return [Bx, By];
  };
}

/**
 * The flat coil (a 2D bar magnet): strips at x = −w (current out of the page) and x = +w (into it),
 * both |y| < h. Between them B points up; far inside a tall coil it tends to μ₀K, like a solenoid.
 */
export function flatCoilB(Ks: number, w: number, h: number): Field2 {
  const left = stripB(Ks, -w, h);
  const right = stripB(-Ks, w, h);
  return (x, y) => {
    const a = left(x, y);
    const b = right(x, y);
    return [a[0] + b[0], a[1] + b[1]];
  };
}

/** E induced by a uniform B_z inside a circle of radius R, growing at dBdt [T/s] (Faraday) [V/m]. */
export function inducedE(dBdt: number, R: number): Field2 {
  return (x, y) => {
    const s2 = x * x + y * y;
    if (s2 === 0) return [0, 0];
    // E_φ = −(dB/dt)·s/2 inside, −(dB/dt)·R²/(2s) outside; times the unit tangent (−y, x)/s
    const k = s2 < R * R ? -dBdt / 2 : (-dBdt * R * R) / (2 * s2);
    return [-k * y, k * x];
  };
}

/** B in the mid-plane of a circular-plate capacitor gap of radius a, where E_z grows at dEdt [T]. */
export function gapB(dEdt: number, a: number): Field2 {
  const c = MU0 * EPS0 * dEdt;
  return (x, y) => {
    const s2 = x * x + y * y;
    if (s2 === 0) return [0, 0];
    const k = s2 < a * a ? c / 2 : (c * a * a) / (2 * s2);
    return [-k * y, k * x];
  };
}

/* -------------------------------------------------------------- the scenes */

export interface MaxwellScene {
  id: SceneId;
  /** a box measures the net flux (divergence laws), a loop the circulation (curl laws) */
  probe: 'box' | 'loop';
  /** the field the probe measures */
  kind: 'E' | 'B';
  F: Field2;
  /**
   * The right-hand side of the differential law at (x, y), in the units of the probe's ratio:
   * ρ/ε₀ (rod), 0 (coil), −∂B_z/∂t (induced), μ₀J_z (wire), μ₀ε₀ ∂E_z/∂t (gap).
   */
  rhs: (x: number, y: number) => number;
  /** the radius of the round source, or the coil's half-width and half-height, for drawing */
  size: Vec2;
}

const inCircle = (x: number, y: number, R: number) => x * x + y * y < R * R;

/** Build a scene. `still` sets every time derivative to zero (the static limit). */
export function maxwellScene(id: SceneId, still = false): MaxwellScene {
  const dB = still ? 0 : SOL_DBDT;
  const dE = still ? 0 : GAP_DEDT;
  switch (id) {
    case 'rod':
      return { id, probe: 'box', kind: 'E', F: rodField(ROD_RHO, ROD_R), rhs: (x, y) => (inCircle(x, y, ROD_R) ? ROD_RHO / EPS0 : 0), size: [ROD_R, ROD_R] };
    case 'coil':
      return { id, probe: 'box', kind: 'B', F: flatCoilB(COIL_K, COIL_W, COIL_H), rhs: () => 0, size: [COIL_W, COIL_H] };
    case 'induced':
      return { id, probe: 'loop', kind: 'E', F: inducedE(dB, SOL_R), rhs: (x, y) => (inCircle(x, y, SOL_R) ? -dB : 0), size: [SOL_R, SOL_R] };
    case 'wire':
      return {
        id,
        probe: 'loop',
        kind: 'B',
        F: thickWireB(THICK_I, ROD_R),
        rhs: (x, y) => (inCircle(x, y, ROD_R) ? (MU0 * THICK_I) / (Math.PI * ROD_R * ROD_R) : 0),
        size: [ROD_R, ROD_R],
      };
    case 'gap':
      return { id, probe: 'loop', kind: 'B', F: gapB(dE, GAP_A), rhs: (x, y) => (inCircle(x, y, GAP_A) ? MU0 * EPS0 * dE : 0), size: [GAP_A, GAP_A] };
  }
}

/* ---------------------------------------------------------------- the probe */

/** ∫∫ f dA over the square of side a centred at (cx, cy), an n×n midpoint sum. */
export function squareIntegral(f: (x: number, y: number) => number, cx: number, cy: number, a: number, n = 80): number {
  const d = a / n;
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += f(cx - a / 2 + (i + 0.5) * d, cy - a / 2 + (j + 0.5) * d);
  return s * d * d;
}

export interface ProbeReading {
  /** box: the net outward flux through the cube of side a; loop: the counter-clockwise circulation */
  lhs: number;
  /**
   * the integral form's right-hand side over the same probe: Q_in/ε₀ (rod), 0 (coil), −dΦ_B/dt (induced),
   * μ₀I_in (wire), μ₀ε₀ dΦ_E/dt (gap)
   */
  rhs: number;
  /** lhs divided by the volume a³ (box) or the area a² (loop) */
  ratio: number;
  /** ∇·F (box) or (∇×F)_z (loop) at the centre, by central differences */
  local: number;
  /** the differential form's right-hand side at the centre */
  rhsLocal: number;
}

/**
 * The probe of side a centred at (cx, cy). A box is a cube two of whose faces lie parallel to the page
 * and carry no flux, so its flux is a·squareFlux and its enclosed source is a·∫∫rhs dA.
 */
export function probeReading(sc: MaxwellScene, cx: number, cy: number, a: number, n = 200): ProbeReading {
  const box = sc.probe === 'box';
  const lhs = box ? a * squareFlux(sc.F, cx, cy, a, n) : squareCirculation(sc.F, cx, cy, a, n);
  const area = squareIntegral(sc.rhs, cx, cy, a, Math.min(n, 120));
  const rhs = box ? a * area : area;
  const local = box ? divergence2(sc.F, cx, cy, 1e-6) : curl2(sc.F, cx, cy, 1e-6);
  return { lhs, rhs, ratio: lhs / (box ? a ** 3 : a ** 2), local, rhsLocal: sc.rhs(cx, cy) };
}

/* -------------------------------------------------------- conservation of charge */

/** A point charge Q at the origin leaking away radially at dQdt (< 0 when it leaks). */
export interface LeakingCharge {
  Q: number;
  dQdt: number;
}

/** E = kQ r̂/r² [N/C]. */
export function leakE(c: LeakingCharge, p: Vec3): Vec3 {
  const r2 = p[0] ** 2 + p[1] ** 2 + p[2] ** 2;
  const k = (K * c.Q) / (r2 * Math.sqrt(r2));
  return [k * p[0], k * p[1], k * p[2]];
}

/** ∂E/∂t = k(dQ/dt) r̂/r² [V/(m·s)]. */
export function leakDEdt(c: LeakingCharge, p: Vec3): Vec3 {
  return leakE({ Q: c.dQdt, dQdt: 0 }, p);
}

/** J = −(dQ/dt) r̂/(4πr²): the charge that leaves, spread evenly over a sphere [A/m²]. */
export function leakJ(c: LeakingCharge, p: Vec3): Vec3 {
  const r2 = p[0] ** 2 + p[1] ** 2 + p[2] ** 2;
  const k = -c.dQdt / (4 * Math.PI * r2 * Math.sqrt(r2));
  return [k * p[0], k * p[1], k * p[2]];
}

/** μ₀(J + ε₀∂E/∂t): what the Ampère–Maxwell law sets equal to ∇×B. Zero for the leaking charge. */
export function leakTotalCurrent(c: LeakingCharge, p: Vec3): Vec3 {
  const J = leakJ(c, p);
  const D = leakDEdt(c, p);
  return [MU0 * (J[0] + EPS0 * D[0]), MU0 * (J[1] + EPS0 * D[1]), MU0 * (J[2] + EPS0 * D[2])];
}
