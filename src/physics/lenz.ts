/**
 * Lenz's law with moving magnets, for lesson 5.3: a bar magnet moving along the axis of a conducting
 * ring (the induced current, the pole it makes, the force on the ring and the energy it takes), and a
 * magnet falling down a conducting tube (eddy currents, magnetic braking, a terminal speed).
 *
 * MODEL SPECIFICATION
 * - System: (1) A thin conducting ring of radius a and resistance R, on the axis of a bar magnet that
 *   moves along that axis. The magnet is lesson 4.1's stand-in (magnets.ts): a short solenoid of
 *   `loops` coaxial current loops of radius R_m sharing NI, which outside the bar has the bar's field.
 *   (2) A magnet falling along the axis of a long vertical tube of mean radius a, wall thickness
 *   w ≪ a and conductivity σ. Here the magnet is a point dipole of moment m, and the tube is a stack
 *   of independent thin rings, each of height dz and resistance 2πa/(σ·w·dz).
 * - Coordinates and signs: one axis, positive one way (to the right in the ring figure, up in the
 *   tube). The magnet's moment points along +axis when its N pole faces +axis. u is the position of
 *   the magnet's centre minus the ring's. The flux Φ is measured along +axis, and a current or an emf
 *   is positive when it circulates in the right-hand sense about +axis (the convention of
 *   induction.ts with n̂ = +axis).
 * - Dynamics: Φ(u) per ring; ε = −dΦ/dt = −Φ'(u)·w with w = du/dt, the magnet's velocity relative to
 *   the ring; I = ε/R. Φ'(u) = 2πa·B_ρ at the ring (from ∇·B = 0), so the axial force on the ring from
 *   I·dl × B is F = −I·Φ'(u) = Φ'(u)²·w/R: it points along w, so the ring is pushed ahead of an
 *   approaching magnet and dragged after a receding one, and the magnet feels −F. The power needed to
 *   keep the magnet moving, F·w, equals the Joule heat I²R exactly. Tube: the braking force on the
 *   magnet is c(s)·v with c = Σ Φ'(u_k)²/R_k → (σw/2πa)·∫Φ'(u)²dz over the wall; deep inside a long tube
 *   c = k = 45μ₀²m²σw/(1024a⁴). The fall obeys M·dv/dt = Mg − c(s)·v, so a terminal speed v_T = Mg/k
 *   is reached with time constant τ = M/k.
 * - Boundary: fields vanish far from the magnet; the tube's rings end at its two ends (no ring above
 *   the top or below the bottom), so the braking fades as the magnet enters or leaves.
 * - Ignored: self- and mutual inductance of the rings (the current follows the emf instantly, and the
 *   tube's rings do not drive one another); any change of the magnet's magnetisation; air drag and
 *   friction with the wall; the magnet tilting or touching the wall; eddy currents that close inside
 *   the wall instead of going round the axis (a slit tube is outside the model).
 * - Valid when: the ring's L_self/R is much shorter than the time the flux takes to change (about
 *   5·10⁻⁴ s for the ring of the figure, against a/w ≈ 0.1 s); in the tube μ₀σ·w·v ≪ 1 (about 5·10⁻³
 *   for the copper tube of the figure at its terminal speed). The point dipole is an order-of-magnitude
 *   model for a magnet nearly as wide as the tube: it overestimates the braking, by up to a factor of
 *   about 2. Directions and the proportionalities (∝ v, ∝ m², ∝ σw, ∝ 1/a⁴) do not depend on it.
 * - Failure modes: R = 0 (a superconducting ring) makes the current infinite in this model; callers
 *   keep R > 0. A ring of the same radius as the magnet's loops is singular when it passes a loop;
 *   callers keep a > R_m. σ = 0 (plastic) gives no braking and free fall, which is right.
 */

import { G, MU0 } from './constants';
import { ellipticKE, loopField } from './magnetism';

/* ------------------------------------------------------------------ the ring and the bar magnet */

/** Loops in the magnet's stand-in solenoid: as in magnets.ts. */
export const RING_MAGNET_LOOPS = 16;

/** A bar magnet on the axis: length L, radius R (of the stand-in loops), ampere-turns NI. */
export interface AxialMagnet {
  L: number;
  R: number;
  NI: number;
}

/** A conducting ring: radius a, resistance R. */
export interface Ring {
  a: number;
  R: number;
}

/** Resistance of a ring of radius a made of a wire of cross-section `area` and resistivity rho [Ω]. */
export const ringResistance = (rho: number, a: number, area: number): number => (rho * 2 * Math.PI * a) / area;

/** Magnetic moment of the stand-in solenoid, m = NI·πR² [A·m²]. */
export const magnetMoment = (mag: AxialMagnet): number => mag.NI * Math.PI * mag.R * mag.R;

/**
 * Mutual inductance of two coaxial circular loops of radii a and b, a distance d apart along their
 * common axis (Maxwell's formula with complete elliptic integrals, m = k²) [H].
 */
export function coaxialMutual(a: number, b: number, d: number): number {
  const m = (4 * a * b) / ((a + b) * (a + b) + d * d);
  const k = Math.sqrt(m);
  const { K, E } = ellipticKE(m);
  return MU0 * Math.sqrt(a * b) * ((2 / k - k) * K - (2 / k) * E);
}

/** Axial position of the magnet's loop i relative to the magnet's centre [m]. */
const loopOffset = (mag: AxialMagnet, i: number, loops: number): number => -mag.L / 2 + ((i + 0.5) * mag.L) / loops;

/** Flux of the magnet through the ring, the magnet's centre at u from the ring's (N toward +axis) [Wb]. */
export function magnetRingFlux(mag: AxialMagnet, a: number, u: number, loops = RING_MAGNET_LOOPS): number {
  const Iper = mag.NI / loops;
  let phi = 0;
  for (let i = 0; i < loops; i++) phi += Iper * coaxialMutual(a, mag.R, u + loopOffset(mag, i, loops));
  return phi;
}

/**
 * dΦ/du for `magnetRingFlux` [Wb/m], exactly: for each loop dΦ/du = 2πa·B_ρ(ρ = a), the radial field at
 * the ring, with the ring at axial position −(u + offset) from the loop.
 */
export function magnetRingFluxSlope(mag: AxialMagnet, a: number, u: number, loops = RING_MAGNET_LOOPS): number {
  const Iper = mag.NI / loops;
  let s = 0;
  for (let i = 0; i < loops; i++) s += 2 * Math.PI * a * loopField(Iper, mag.R, a, -(u + loopOffset(mag, i, loops))).rho;
  return s;
}

/** Everything the ring does at one instant, magnet at u moving at w = du/dt relative to the ring. */
export interface RingResponse {
  /** flux through the ring along +axis [Wb] */
  flux: number;
  /** dΦ/dt [Wb/s] */
  dPhiDt: number;
  /** emf, positive in the right-hand sense about +axis [V] */
  emf: number;
  /** induced current, same sign convention [A] */
  current: number;
  /** axial force on the ring [N]; the magnet feels the opposite */
  force: number;
  /** Joule heat released per second in the ring [W] */
  heatRate: number;
  /** power the hand must supply to keep the magnet at constant velocity, F·w [W] */
  handPower: number;
}

export function ringResponse(mag: AxialMagnet, ring: Ring, u: number, w: number, loops = RING_MAGNET_LOOPS): RingResponse {
  const flux = magnetRingFlux(mag, ring.a, u, loops);
  const slope = magnetRingFluxSlope(mag, ring.a, u, loops);
  const dPhiDt = slope * w;
  const emf = dPhiDt === 0 ? 0 : -dPhiDt;
  const current = emf / ring.R;
  const force = current === 0 ? 0 : -current * slope;
  return { flux, dPhiDt, emf, current, force, heatRate: current * current * ring.R, handPower: force * w };
}

/**
 * The pole of the ring that faces the magnet: the ring's current makes it a flat magnet whose N face is
 * the +axis face when the current is positive. null when no current flows.
 */
export function facingPole(current: number, u: number): 'N' | 'S' | null {
  if (current === 0 || u === 0) return null;
  // the magnet sits on the +axis side of the ring when u > 0
  return Math.sign(current) * Math.sign(u) > 0 ? 'N' : 'S';
}

/* ------------------------------------------------------------------ the tube and the falling magnet */

/** A vertical conducting tube: mean radius a, wall thickness `wall`, length, conductivity sigma [S/m]. */
export interface Tube {
  a: number;
  wall: number;
  length: number;
  sigma: number;
}

/** A falling magnet as a point dipole: moment m [A·m²], mass [kg]. */
export interface Dipole {
  m: number;
  mass: number;
}

/** Flux of a point dipole m (along the axis) through a coaxial ring of radius a at offset u [Wb]. */
export const dipoleRingFlux = (m: number, a: number, u: number): number => (MU0 * m * a * a) / (2 * Math.pow(a * a + u * u, 1.5));

/** dΦ/du for `dipoleRingFlux` [Wb/m]. */
export const dipoleRingFluxSlope = (m: number, a: number, u: number): number =>
  (-1.5 * MU0 * m * a * a * u) / Math.pow(a * a + u * u, 2.5);

/** Braking coefficient deep inside a long tube, k = 45μ₀²m²σw/(1024a⁴) [kg/s]: the force is k·v. */
export const tubeDragDeep = (m: number, t: Tube): number => (45 * MU0 * MU0 * m * m * t.sigma * t.wall) / (1024 * t.a ** 4);

/** ∫cosⁿθ dθ from 0 (n even), by the reduction formula. */
function cosPowInt(n: number, th: number): number {
  if (n === 0) return th;
  return (Math.cos(th) ** (n - 1) * Math.sin(th)) / n + ((n - 1) / n) * cosPowInt(n - 2, th);
}
/** ∫sin²θ·cos⁶θ dθ = ∫(cos⁶θ − cos⁸θ) dθ, from 0. */
const sin2cos6 = (th: number): number => cosPowInt(6, th) - cosPowInt(8, th);

/**
 * Braking coefficient with the magnet's centre at depth s below the tube's top (s < 0: above it) [kg/s]:
 * the integral (σw/2πa)·∫₀ᴸ Φ'(z − s)² dz over the wall, in closed form (u = a·tanθ).
 */
export function tubeDragAt(m: number, t: Tube, s: number): number {
  if (t.sigma === 0) return 0;
  const th1 = Math.atan(-s / t.a);
  const th2 = Math.atan((t.length - s) / t.a);
  return ((9 * t.sigma * t.wall * MU0 * MU0 * m * m) / (8 * Math.PI * t.a ** 4)) * (sin2cos6(th2) - sin2cos6(th1));
}

/** The same coefficient as a sum over n discrete rings, Σ Φ'(u_k)²/R_k (the model itself, for tests). */
export function ringStackDrag(m: number, t: Tube, s: number, n: number): number {
  if (t.sigma === 0) return 0;
  const dz = t.length / n;
  const Rk = (2 * Math.PI * t.a) / (t.sigma * t.wall * dz);
  let c = 0;
  for (let k = 0; k < n; k++) c += dipoleRingFluxSlope(m, t.a, (k + 0.5) * dz - s) ** 2 / Rk;
  return c;
}

/** Terminal speed deep inside the tube, v_T = Mg/k [m/s] (Infinity for a tube that does not conduct). */
export const tubeTerminalSpeed = (d: Dipole, t: Tube): number => (d.mass * G) / tubeDragDeep(d.m, t);

/** Time constant of the approach to v_T, τ = M/k [s]. */
export const tubeTimeConstant = (d: Dipole, t: Tube): number => d.mass / tubeDragDeep(d.m, t);

/**
 * Induced current per unit height of the wall [A/m] at depth z, with the magnet at depth s falling at
 * speed v (downward positive). Sign: positive circulates anticlockwise seen from above. `northDown`
 * says which way the magnet points.
 */
export function wallCurrentDensity(d: Dipole, t: Tube, s: number, v: number, z: number, northDown: boolean): number {
  const mUp = northDown ? -d.m : d.m;
  // up-axis: u = z − s, du/dt = −v; per unit height the ring's resistance is 2πa/(σw)
  const K = (mUp * dipoleRingFluxSlope(1, t.a, z - s) * v * t.sigma * t.wall) / (2 * Math.PI * t.a);
  return K === 0 ? 0 : K;
}

export interface FallState {
  /** time since release [s] */
  t: number;
  /** depth of the magnet's centre below the tube's top [m] */
  s: number;
  /** downward speed [m/s] */
  v: number;
  /** Joule heat released in the tube so far [J] */
  heat: number;
}

/** One RK4 step of M·dv/dt = Mg − c(s)·v, with the heat c(s)·v² integrated alongside. */
export function fallStep(st: FallState, d: Dipole, t: Tube, dt: number): FallState {
  const acc = (s: number, v: number): number => G - (tubeDragAt(d.m, t, s) * v) / d.mass;
  const heat = (s: number, v: number): number => tubeDragAt(d.m, t, s) * v * v;
  const k1s = st.v;
  const k1v = acc(st.s, st.v);
  const k1h = heat(st.s, st.v);
  const s2 = st.s + (dt / 2) * k1s;
  const v2 = st.v + (dt / 2) * k1v;
  const k2s = v2;
  const k2v = acc(s2, v2);
  const k2h = heat(s2, v2);
  const s3 = st.s + (dt / 2) * k2s;
  const v3 = st.v + (dt / 2) * k2v;
  const k3s = v3;
  const k3v = acc(s3, v3);
  const k3h = heat(s3, v3);
  const s4 = st.s + dt * k3s;
  const v4 = st.v + dt * k3v;
  const k4s = v4;
  const k4v = acc(s4, v4);
  const k4h = heat(s4, v4);
  return {
    t: st.t + dt,
    s: st.s + (dt / 6) * (k1s + 2 * k2s + 2 * k3s + k4s),
    v: st.v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v),
    heat: st.heat + (dt / 6) * (k1h + 2 * k2h + 2 * k3h + k4h),
  };
}

/**
 * The whole fall from rest at depth s0 until the magnet's centre leaves the bottom (s > length + exit)
 * or tMax passes. Returns the states every `dt` (the figure plays them back).
 */
export function simulateFall(d: Dipole, t: Tube, s0: number, dt: number, tMax: number, exit = 0): FallState[] {
  const out: FallState[] = [{ t: 0, s: s0, v: 0, heat: 0 }];
  let st = out[0];
  while (st.t < tMax && st.s < t.length + exit) {
    st = fallStep(st, d, t, dt);
    out.push(st);
  }
  return out;
}
