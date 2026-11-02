/**
 * Magnetostatics and magnetic forces for chapter 4: the fields of a straight wire, a circular loop
 * and a solenoid; the force on a moving charge and on a current-carrying wire; circular orbits,
 * the mass spectrometer and the velocity selector; the torque on a loop; the compass.
 *
 * MODEL SPECIFICATION
 * - System: steady currents in thin wires (straight, circular loops, solenoids made of loops) and
 *   point charges moving through prescribed uniform or wire-made fields. Figure coordinates: x to
 *   the right, y up, z out of the page (⊙). A straight wire perpendicular to the page carries
 *   I > 0 out of the page (⊙), I < 0 into it (⊗).
 * - Dynamics: Biot–Savart results in closed form. Straight wire B = μ₀I/(2πr), circling the wire
 *   by the right-hand rule. Circular loop: the exact off-axis field through the complete elliptic
 *   integrals K and E (evaluated by the arithmetic–geometric mean), with the on-axis and centre
 *   formulas as limits. A solenoid is a stack of loops; the ideal long solenoid B = μ₀NI/L.
 *   Forces: F = qv×B, F = IL×B. Orbits in a uniform B: r = mv/(|q|B), T = 2πm/(|q|B).
 *   Torque on a flat coil: τ = NBIA·sinθ, θ between the coil's normal and B.
 * - Boundary: fields vanish at infinity; no magnetic materials (μ = μ₀ everywhere).
 * - Ignored: the wire's thickness (the field inside a wire is not modelled), the leads that bring
 *   current to a loop or a solenoid, the pitch of a solenoid's winding (each turn is a closed loop),
 *   induced fields of moving charges, radiation and relativity.
 * - Valid when: the distance to a wire is much larger than its thickness; speeds v ≪ c; fields
 *   steady.
 * - Failure modes: every field is singular on its own wire (r = 0, or a point on a loop); callers
 *   keep a core radius. A charge with v ∥ B feels no force and does not orbit (radius → ∞ only when
 *   B = 0, which orbitRadius reports as Infinity).
 */

import { MU0 } from './constants';
import type { Vec2, Vec3 } from './vec';
import { cross3 } from './vec';

/* ------------------------------------------------------------------ sources */

/**
 * The horizontal component of the Earth's magnetic field in Israel, about 3.2·10⁻⁵ T (IGRF:
 * total field ≈ 4.4·10⁻⁵ T at an inclination of ≈ 44°). Not on the formula sheet: Bagrut questions
 * give their own value. Used by the compass figures as a default.
 */
export const EARTH_B_HORIZONTAL = 3.2e-5;

/** Field of a long straight wire at distance r, B = μ₀I/(2πr) [T]. */
export const straightWireField = (I: number, r: number): number => (MU0 * Math.abs(I)) / (2 * Math.PI * r);

/** A long straight wire perpendicular to the page at (x, y); I > 0 flows out of the page (⊙). */
export interface Wire {
  x: number;
  y: number;
  I: number;
}

/**
 * Field in the page plane of straight wires perpendicular to it [T]. Each wire's field circles it
 * counterclockwise when its current is out of the page (right-hand rule), with magnitude μ₀I/(2πr).
 */
export function wireFieldAt(wires: readonly Wire[], x: number, y: number): Vec2 {
  let bx = 0;
  let by = 0;
  for (const w of wires) {
    const dx = x - w.x;
    const dy = y - w.y;
    const r2 = dx * dx + dy * dy;
    if (r2 === 0) continue;
    const k = (MU0 * w.I) / (2 * Math.PI * r2);
    bx += -k * dy;
    by += k * dx;
  }
  return [bx, by];
}

/** Field at the centre of a flat circular coil of N turns, B = μ₀NI/(2R) [T]. */
export const loopCenterField = (I: number, R: number, N = 1): number => (MU0 * N * Math.abs(I)) / (2 * R);

/** Field on the axis of a circular loop at distance z from its centre, B = μ₀IR²/(2(R²+z²)^{3/2}) [T]. */
export const loopAxisField = (I: number, R: number, z: number, N = 1): number =>
  (MU0 * N * I * R * R) / (2 * Math.pow(R * R + z * z, 1.5));

/** Complete elliptic integrals K(m) and E(m), parameter m = k², by the arithmetic–geometric mean. */
export function ellipticKE(m: number): { K: number; E: number } {
  let a = 1;
  let b = Math.sqrt(1 - m);
  let c = Math.sqrt(m);
  let sum = 0.5 * c * c; // 2^{n−1}·c_n² for n = 0
  let pow = 0.5;
  for (let i = 0; i < 40 && Math.abs(c) > 1e-16; i++) {
    const an = (a + b) / 2;
    const bn = Math.sqrt(a * b);
    c = (a - b) / 2;
    a = an;
    b = bn;
    pow *= 2;
    sum += pow * c * c;
  }
  const K = Math.PI / (2 * a);
  return { K, E: K * (1 - sum) };
}

/**
 * Exact field of a circular loop of radius R in the plane z = 0, centred on the z axis, carrying I
 * counterclockwise as seen from +z (so B points along +z at the centre) [T]. Returns the axial and
 * the radial components at cylindrical position (ρ, z).
 */
export function loopField(I: number, R: number, rho: number, z: number): { z: number; rho: number } {
  const r = Math.abs(rho);
  if (r < 1e-9 * R) return { z: loopAxisField(I, R, z), rho: 0 };
  const sp = (R + r) * (R + r) + z * z;
  const sm = (R - r) * (R - r) + z * z;
  const m = (4 * R * r) / sp;
  const { K, E } = ellipticKE(m);
  const c = (MU0 * I) / (2 * Math.PI * Math.sqrt(sp));
  const bz = c * (K + ((R * R - r * r - z * z) / sm) * E);
  const br = ((c * z) / r) * (-K + ((R * R + r * r + z * z) / sm) * E);
  return { z: bz, rho: Math.sign(rho) * br };
}

/** Field inside a long ideal solenoid, B = μ₀NI/L [T]. */
export const solenoidField = (N: number, L: number, I: number): number => (MU0 * N * Math.abs(I)) / L;

/**
 * On-axis field of a finite solenoid (N turns over length L, radius R, centred at z = 0) at axial
 * position z [T]: B = (μ₀NI/2L)(cos α₁ + cos α₂), the angles to the two ends seen from the point.
 */
export function finiteSolenoidAxisField(N: number, L: number, R: number, I: number, z: number): number {
  const a = L / 2 - z;
  const b = L / 2 + z;
  return ((MU0 * N * I) / (2 * L)) * (a / Math.hypot(a, R) + b / Math.hypot(b, R));
}

/**
 * A solenoid drawn in the page: its axis lies along x through (x0, y0), so the page cuts every turn
 * at y0 ± R. With I > 0 the field inside points along +x (the turns' top cuts carry ⊙, the bottom
 * ones ⊗) and the right end is the north pole. A short, wide solenoid stands in for a bar magnet:
 * outside, the two fields have the same shape.
 */
export interface Solenoid {
  x0: number;
  y0: number;
  /** length along the axis [m] */
  L: number;
  /** radius of the turns [m] */
  R: number;
  /** number of turns */
  N: number;
  I: number;
}

/**
 * Field in the page plane of a solenoid, as a sum of `loops` equally spaced circular loops that
 * share its N·I [T]. More loops converge to the continuous winding; 40 is plenty for a figure.
 */
export function solenoidFieldAt(s: Solenoid, x: number, y: number, loops = 40): Vec2 {
  const Iper = (s.N * s.I) / loops;
  const rho = y - s.y0;
  let bx = 0;
  let by = 0;
  for (let i = 0; i < loops; i++) {
    const xi = s.x0 - s.L / 2 + ((i + 0.5) * s.L) / loops;
    const f = loopField(Iper, s.R, rho, x - xi);
    bx += f.z;
    by += f.rho;
  }
  return [bx, by];
}

/* ------------------------------------------------------------------ field lines and Ampère's law */

export interface LineOptions {
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number };
  /** step length [m] */
  step: number;
  maxSteps?: number;
  /** +1 follows B, −1 runs against it */
  direction?: 1 | -1;
  /** points the line must not enter (wires, loop cuts): it stops at their radius */
  avoid?: readonly { x: number; y: number; r: number }[];
}

export interface FieldLine {
  points: Vec2[];
  /** closed: came back to its start (magnetic field lines have no ends); bounds: left the view */
  end: 'closed' | 'bounds' | 'avoid' | 'null' | 'steps';
}

/** Trace one field line of any planar field by RK4 on the unit direction, until it closes or leaves. */
export function traceLine(field: (x: number, y: number) => Vec2, start: Vec2, o: LineOptions): FieldLine {
  const sgn = o.direction ?? 1;
  const h = o.step;
  const maxSteps = o.maxSteps ?? 3000;
  const dir = (x: number, y: number): Vec2 | null => {
    const [bx, by] = field(x, y);
    const m = Math.hypot(bx, by);
    return m === 0 || !Number.isFinite(m) ? null : [(sgn * bx) / m, (sgn * by) / m];
  };
  const pts: Vec2[] = [start];
  let [x, y] = start;
  let travelled = 0;
  const { xmin, xmax, ymin, ymax } = o.bounds;
  for (let i = 0; i < maxSteps; i++) {
    const k1 = dir(x, y);
    if (!k1) return { points: pts, end: 'null' };
    const k2 = dir(x + (h / 2) * k1[0], y + (h / 2) * k1[1]);
    if (!k2) return { points: pts, end: 'null' };
    const k3 = dir(x + (h / 2) * k2[0], y + (h / 2) * k2[1]);
    if (!k3) return { points: pts, end: 'null' };
    const k4 = dir(x + h * k3[0], y + h * k3[1]);
    if (!k4) return { points: pts, end: 'null' };
    x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    pts.push([x, y]);
    travelled += h;
    if (travelled > 4 * h && Math.hypot(x - start[0], y - start[1]) < 0.75 * h) {
      pts.push(start);
      return { points: pts, end: 'closed' };
    }
    if (o.avoid?.some((a) => Math.hypot(x - a.x, y - a.y) < a.r)) return { points: pts, end: 'avoid' };
    if (x < xmin || x > xmax || y < ymin || y > ymax) return { points: pts, end: 'bounds' };
  }
  return { points: pts, end: 'steps' };
}

/**
 * The circulation ∮B·dl around a closed polygon (the last vertex joins the first), by the midpoint
 * rule on `sub` pieces per edge [T·m]. Ampère's law: it equals μ₀ times the current through the path.
 */
export function circulation(field: (x: number, y: number) => Vec2, path: readonly Vec2[], sub = 200): number {
  let sum = 0;
  for (let i = 0; i < path.length; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[(i + 1) % path.length];
    const dx = (bx - ax) / sub;
    const dy = (by - ay) / sub;
    for (let k = 0; k < sub; k++) {
      const [fx, fy] = field(ax + (k + 0.5) * dx, ay + (k + 0.5) * dy);
      sum += fx * dx + fy * dy;
    }
  }
  return sum;
}

/* ------------------------------------------------------------------ forces on charges */

/** Magnetic (Lorentz) force on a moving charge, F = q v×B [N]. */
export const lorentzForce = (q: number, v: Vec3, B: Vec3): Vec3 => {
  const c = cross3(v, B);
  return [q * c[0], q * c[1], q * c[2]];
};

/** Magnitude of the magnetic force, F = |q|vB·sinθ, θ between v and B [N]. */
export const lorentzMagnitude = (q: number, v: number, B: number, theta = Math.PI / 2): number =>
  Math.abs(q * v * B * Math.sin(theta));

/** Radius of the circle a charge moving perpendicular to a uniform B follows, r = mv/(|q|B) [m]. */
export const orbitRadius = (m: number, v: number, q: number, B: number): number =>
  B === 0 ? Infinity : (m * Math.abs(v)) / Math.abs(q * B);

/** Period of that circle, T = 2πm/(|q|B), independent of the speed [s]. */
export const orbitPeriod = (m: number, q: number, B: number): number => (2 * Math.PI * m) / Math.abs(q * B);

/**
 * Position at time t of a charge in a uniform field B_z perpendicular to the page (B_z > 0 is ⊙),
 * starting at p0 with in-plane velocity v0 [m]. The velocity turns at ω = −qB_z/m (counterclockwise
 * positive): a positive charge in a ⊙ field circles clockwise.
 */
export function circlePosition(q: number, m: number, Bz: number, p0: Vec2, v0: Vec2, t: number): Vec2 {
  const w = (-q * Bz) / m;
  if (w === 0) return [p0[0] + v0[0] * t, p0[1] + v0[1] * t];
  const s = Math.sin(w * t);
  const c = Math.cos(w * t);
  return [p0[0] + (v0[0] * s + v0[1] * (c - 1)) / w, p0[1] + (v0[0] * (1 - c) + v0[1] * s) / w];
}

/** Centre of that circle [m]: a quarter-turn from p0, on the side the force points to. */
export function circleCenter(q: number, m: number, Bz: number, p0: Vec2, v0: Vec2): Vec2 {
  const w = (-q * Bz) / m;
  // the force direction is v0 rotated by +90° when ω > 0, by −90° when ω < 0
  return [p0[0] - v0[1] / w, p0[1] + v0[0] / w];
}

/** Speed gained from rest through a potential difference U, v = √(2|q|U/m) [m/s]. */
export const speedFromVoltage = (q: number, m: number, U: number): number => Math.sqrt((2 * Math.abs(q * U)) / m);

/** Mass spectrometer: radius in B of an ion accelerated from rest through U, r = √(2mU/|q|)/B [m]. */
export const spectrometerRadius = (m: number, q: number, U: number, B: number): number =>
  orbitRadius(m, speedFromVoltage(q, m, U), q, B);

/** Velocity selector: the speed that crosses perpendicular E and B undeflected, v = E/B [m/s]. */
export const selectorSpeed = (E: number, B: number): number => E / B;

/* ------------------------------------------------------------------ forces on currents */

/** Force on a straight wire of length L carrying I in a uniform B, F = BIL·sinθ [N]. */
export const wireForce = (I: number, L: number, B: number, theta = Math.PI / 2): number =>
  Math.abs(B * I * L * Math.sin(theta));

/** Force on a straight wire as a vector, F = I L×B, with L along the current [N]. */
export const wireForceVec = (I: number, L: Vec3, B: Vec3): Vec3 => {
  const c = cross3(L, B);
  return [I * c[0], I * c[1], I * c[2]];
};

/**
 * Force per unit length between two long parallel wires a distance d apart, μ₀I₁I₂/(2πd) [N/m].
 * Signed: positive means attraction (currents in the same direction), negative repulsion.
 */
export const parallelWiresForce = (I1: number, I2: number, d: number): number => (MU0 * I1 * I2) / (2 * Math.PI * d);

/** Magnetic moment of a flat coil, μ = NIA [A·m²]. */
export const magneticMoment = (N: number, I: number, A: number): number => N * I * A;

/**
 * Torque on a flat coil in a uniform B, τ = NBIA·sinθ [N·m], θ the angle between the coil's normal
 * and B. It turns the coil toward θ = 0, where the coil's plane is perpendicular to B.
 */
export const loopTorque = (N: number, I: number, A: number, B: number, theta: number): number =>
  N * B * I * A * Math.sin(theta);

/**
 * A compass under a wire: the needle settles along the sum of the Earth's horizontal field and the
 * wire's field, which are perpendicular when the wire runs north–south. Its deflection from north
 * is θ with tanθ = B_wire/B_earth [rad].
 */
export const compassDeflection = (Bwire: number, Bearth: number): number => Math.atan2(Bwire, Bearth);
