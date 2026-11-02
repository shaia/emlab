/**
 * A charge in a uniform magnetic field perpendicular to the page, built for lesson 4.5.
 *
 * Preset `orbit`: an electron, a proton or an alpha particle is injected with a chosen speed into a
 * ⊙ or ⊗ field. With the field everywhere (`region: 'full'`) it goes round a full circle; with the
 * field only to the right of an edge (`region: 'edge'`) it enters, turns through an arc and leaves.
 * An optional second particle at twice the speed shows that the period does not depend on v.
 *
 * Preset `spectrometer`: ions start at rest, are accelerated through U between two plates, enter a
 * ⊙ field through a slit and land one diameter away on a detector with a centimetre scale.
 *
 * Every number comes from src/physics (orbitRadius, orbitPeriod, circlePosition, circleCenter,
 * speedFromVoltage, spectrometerRadius in magnetism.ts; edgeCrossing, ionMass, landingDistance in
 * orbits.ts). The motion on screen is slowed by a fixed factor per particle, so changing B or the
 * particle changes the period on screen in proportion; the readout gives the real period.
 */

import { useEffect, useState } from 'preact/hooks';
import { E_CHARGE, M_ELECTRON, M_PROTON } from '~/physics/constants';
import { circleCenter, circlePosition, orbitPeriod, orbitRadius, speedFromVoltage } from '~/physics/magnetism';
import { edgeCrossing, ionMass, isotopeSeparation, landingDistance } from '~/physics/orbits';
import type { Vec2 } from '~/physics/vec';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { sci, superscript } from './core/format';
import { arrow, chargeDisc, depthField, depthGlyph, polyline, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type ParticleId = 'electron' | 'proton' | 'alpha';
export type IsotopeSet = 'neon' | 'chlorine' | 'carbon';

interface ParticleDef {
  q: number;
  m: number;
  name: string;
  /** the speed slider runs over SPEEDS × vUnit, the field slider over FIELDS × bUnit */
  vUnit: number;
  bUnit: number;
  /** the particle whose period sets the slow-motion factor (alpha shares the proton's) */
  clock: 'electron' | 'proton';
}

const PARTICLES: Record<ParticleId, ParticleDef> = {
  electron: { q: -E_CHARGE, m: M_ELECTRON, name: 'אלקטרון', vUnit: 1e6, bUnit: 1e-4, clock: 'electron' },
  proton: { q: E_CHARGE, m: M_PROTON, name: 'פרוטון', vUnit: 1e5, bUnit: 1e-2, clock: 'proton' },
  alpha: { q: 2 * E_CHARGE, m: 4 * M_PROTON, name: 'חלקיק אלפא', vUnit: 1e5, bUnit: 1e-2, clock: 'proton' },
};
const SPEEDS = [1, 2, 3, 4, 5, 6, 8, 10];
const FIELDS = [2, 3, 4, 5, 6, 8, 10, 15, 20];
const ANGLES = [-60, -45, -30, -15, 0, 15, 30, 45, 60];

/** slow motion: at five field units the period on screen is 4 s */
const SCREEN_PERIOD = 4;
const timeScale = (pid: ParticleId) => {
  const c = PARTICLES[PARTICLES[pid].clock];
  return SCREEN_PERIOD / orbitPeriod(c.m, c.q, 5 * c.bUnit);
};

const ISOTOPES: Record<IsotopeSet, { name: string; symbol: string; A: number[] }> = {
  neon: { name: 'נאון', symbol: 'Ne', A: [20, 22] },
  chlorine: { name: 'כלור', symbol: 'Cl', A: [35, 37] },
  carbon: { name: 'פחמן', symbol: 'C', A: [12, 13, 14] },
};
const VOLTAGES = Array.from({ length: 15 }, (_, i) => 500 + 250 * i); // 500 … 4000 V
const SPEC_FIELDS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];
/** the detector runs along the field edge from the slit to DET_END [m] */
const DET_END = 0.54;
const HIT_TARGET = 0.25;
/** slow motion in the spectrometer: ²⁰Ne⁺ at 0.2 T takes 2.5 s for its half circle */
const SPEC_SCALE = 2.5 / (orbitPeriod(ionMass(20), E_CHARGE, 0.2) / 2);
/** accelerating gap: ions start at rest at the lower plate and leave the upper plate with full speed */
const PLATE_LOW = -0.115;
const PLATE_HIGH = -0.045;

/* world boxes [m] */
const ORBIT_W = 0.4;
const ORBIT_H = 0.28;
const EDGE_X0 = 0.06; // in edge mode the view is centred here: x from −0.14 to 0.26
const Y_LAUNCH = 0.12;
const Y_EDGE = 0.1;
const GUN_DIST = 0.12;
const SPEC_W = 0.66;
const SPEC_H = 0.46;
const SPEC_X0 = 0.24; // x from −0.09 to 0.57
const SPEC_Y0 = 0.06; // y from −0.17 to 0.29

const TASK_LABEL: Record<string, string> = {
  race: 'הפעילו "חלקיק שני במהירות כפולה". איזה מהשניים משלים סיבוב ראשון?',
  'half-T': 'שנו את השדה כך שזמן המחזור יקטן פי 2 לפחות. מה קרה לרדיוס?',
  'flip-sign': 'החליפו את החלקיק בחלקיק שהמטען שלו בסימן הפוך. לאיזה כיוון הוא מסתובב עכשיו?',
  'edge-double': 'הכפילו את המרחק בין נקודת הכניסה לנקודת היציאה, בלי להחליף חלקיק.',
  'edge-angle': 'שנו את זווית הכניסה. השוו את הזווית שבה החלקיק יוצא לזווית שבה נכנס.',
  separate: 'בחרו כלור, והגדילו את המרחק בין נקודות הנחיתה של שני האיזוטופים ל-1 ס"מ לפחות, כששניהם עדיין נוחתים על הגלאי.',
  'hit-mark': 'בחרו נאון, וכוונו את המתח ואת השדה כך שהאיזוטופ הקל, נאון-20, ינחת על הסימן של 25 ס"מ.',
};

interface State {
  particle: ParticleId;
  /** multiple of the particle's speed unit (one of SPEEDS) */
  speed: number;
  /** multiple of the particle's field unit (one of FIELDS) */
  field: number;
  dir: 'in' | 'out';
  region: 'full' | 'edge';
  /** entry angle from the edge's normal, degrees, positive = aimed upward */
  angle: number;
  race: boolean;
  set: IsotopeSet;
  U: number;
  B: number;
}

export interface MagneticOrbitProps {
  id: string;
  preset?: 'orbit' | 'spectrometer';
  particle?: ParticleId;
  speed?: number;
  field?: number;
  dir?: 'in' | 'out';
  region?: 'full' | 'edge';
  angle?: number;
  race?: boolean;
  set?: IsotopeSet;
  U?: number;
  B?: number;
  tasks?: string[];
}

const nearest = (list: number[], x: number) => list.reduce((b, s) => (Math.abs(s - x) < Math.abs(b - x) ? s : b), list[0]);

function initial(p: MagneticOrbitProps): State {
  return {
    particle: p.particle ?? 'proton',
    speed: nearest(SPEEDS, p.speed ?? 4),
    field: nearest(FIELDS, p.field ?? 5),
    dir: p.dir ?? 'in',
    region: p.region ?? 'full',
    angle: nearest(ANGLES, p.angle ?? 0),
    race: p.race ?? false,
    set: p.set ?? 'neon',
    U: nearest(VOLTAGES, p.U ?? 1000),
    B: nearest(SPEC_FIELDS, p.B ?? 0.2),
  };
}

/* ------------------------------------------------------------------ orbit geometry */

interface OrbitSolution {
  P: ParticleDef;
  v: number;
  B: number;
  Bz: number;
  r: number;
  T: number;
  ccw: boolean;
  /** full mode: launch point and velocity */
  p0: Vec2;
  v0: Vec2;
  /** edge mode */
  edge?: {
    gun: Vec2;
    entry: Vec2;
    v0: Vec2;
    exit: Vec2;
    vExit: Vec2;
    end: Vec2;
    tIn: number;
    tField: number;
    tOut: number;
    center: Vec2;
    chord: number;
    arc: number;
  };
}

function solveOrbit(s: State): OrbitSolution {
  const P = PARTICLES[s.particle];
  const v = s.speed * P.vUnit;
  const B = s.field * P.bUnit;
  const Bz = s.dir === 'out' ? B : -B;
  const r = orbitRadius(P.m, v, P.q, B);
  const T = orbitPeriod(P.m, P.q, B);
  const ccw = -P.q * Bz > 0;
  const p0: Vec2 = [0, ccw ? -Y_LAUNCH : Y_LAUNCH];
  const v0: Vec2 = [v, 0];
  const sol: OrbitSolution = { P, v, B, Bz, r, T, ccw, p0, v0 };
  if (s.region === 'edge') {
    const phi = (s.angle * Math.PI) / 180;
    const u: Vec2 = [Math.cos(phi), Math.sin(phi)];
    const vIn: Vec2 = [v * u[0], v * u[1]];
    // put the entry point on the side away from where the arc goes, so the arc stays in view
    const below = circleCenter(P.q, P.m, Bz, [0, 0], vIn)[1] < 0;
    const entry: Vec2 = [0, below ? Y_EDGE : -Y_EDGE];
    let L = GUN_DIST / u[0];
    const yLim = ORBIT_H / 2 - 0.012;
    const gy = entry[1] - L * u[1];
    if (Math.abs(gy) > yLim) L = Math.abs((Math.sign(gy) * yLim - entry[1]) / u[1]);
    const gun: Vec2 = [entry[0] - L * u[0], entry[1] - L * u[1]];
    const e = edgeCrossing(P.q, P.m, Bz, entry, vIn);
    // after leaving, a straight line to the edge of the view
    const xLeft = EDGE_X0 - ORBIT_W / 2;
    const dir: Vec2 = [e.vExit[0] / v, e.vExit[1] / v];
    let L2 = (e.exit[0] - xLeft) / -dir[0];
    if (dir[1] !== 0) L2 = Math.min(L2, Math.abs((Math.sign(dir[1]) * ORBIT_H) / 2 - e.exit[1]) / Math.abs(dir[1]));
    const end: Vec2 = [e.exit[0] + L2 * dir[0], e.exit[1] + L2 * dir[1]];
    sol.edge = {
      gun,
      entry,
      v0: vIn,
      exit: e.exit,
      vExit: e.vExit,
      end,
      tIn: L / v,
      tField: e.time,
      tOut: L2 / v,
      center: e.center,
      chord: e.chord,
      arc: e.arc,
    };
  }
  return sol;
}

/** velocity at time t on the circle that starts with v0 (ω = −qB_z/m, counterclockwise positive) */
function velocityAt(sol: OrbitSolution, v0: Vec2, t: number): Vec2 {
  const w = (-sol.P.q * sol.Bz) / sol.P.m;
  const c = Math.cos(w * t);
  const s = Math.sin(w * t);
  return [v0[0] * c - v0[1] * s, v0[0] * s + v0[1] * c];
}

/** position and velocity at real time τ along the edge-mode path */
function edgeState(sol: OrbitSolution, tau: number): { pos: Vec2; vel: Vec2; inField: boolean } {
  const e = sol.edge!;
  const { P, Bz, v } = sol;
  if (tau < e.tIn) {
    const k = tau * v;
    const u: Vec2 = [e.v0[0] / v, e.v0[1] / v];
    return { pos: [e.gun[0] + k * u[0], e.gun[1] + k * u[1]], vel: e.v0, inField: false };
  }
  if (tau < e.tIn + e.tField) {
    const t = tau - e.tIn;
    return { pos: circlePosition(P.q, P.m, Bz, e.entry, e.v0, t), vel: velocityAt(sol, e.v0, t), inField: true };
  }
  const t = Math.min(tau - e.tIn - e.tField, e.tOut);
  return { pos: [e.exit[0] + e.vExit[0] * t, e.exit[1] + e.vExit[1] * t], vel: e.vExit, inField: false };
}

/* ------------------------------------------------------------------ spectrometer */

interface Ion {
  A: number;
  m: number;
  v: number;
  r: number;
  land: number;
  onDetector: boolean;
}

function solveSpec(s: State) {
  const set = ISOTOPES[s.set];
  const ions: Ion[] = set.A.map((A) => {
    const m = ionMass(A);
    const land = landingDistance(m, E_CHARGE, s.U, s.B);
    return { A, m, v: speedFromVoltage(E_CHARGE, m, s.U), r: land / 2, land, onDetector: land <= DET_END };
  });
  const first = ions[0];
  const last = ions[ions.length - 1];
  const sep = isotopeSeparation(first.m, last.m, E_CHARGE, s.U, s.B);
  return { set, ions, sep };
}

/** position of an ion at real time τ after leaving the lower plate at rest */
function ionPos(ion: Ion, B: number, tau: number): Vec2 | null {
  const d = PLATE_HIGH - PLATE_LOW;
  const t1 = (2 * d) / ion.v;
  const t2 = -PLATE_HIGH / ion.v;
  const tHalf = orbitPeriod(ion.m, E_CHARGE, B) / 2;
  if (tau < 0) return null;
  if (tau < t1) {
    const a = ion.v / t1;
    return [0, PLATE_LOW + 0.5 * a * tau * tau];
  }
  if (tau < t1 + t2) return [0, PLATE_HIGH + ion.v * (tau - t1)];
  if (tau < t1 + t2 + tHalf) return circlePosition(E_CHARGE, ion.m, B, [0, 0], [0, ion.v], tau - t1 - t2);
  return null;
}

const ionLabel = (symbol: string, A: number) => `${superscript(A)}${symbol}⁺`;

/* ------------------------------------------------------------------ drawing helpers */

function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, o: { color?: string; size?: number; italic?: boolean; align?: CanvasTextAlign; base?: CanvasTextBaseline; rtl?: boolean } = {}) {
  ctx.save();
  ctx.font = `${o.italic ? 'italic ' : ''}700 ${o.size ?? 14}px ${p.fontUi}`;
  ctx.fillStyle = o.color ?? p.ink;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.base ?? 'middle';
  ctx.direction = o.rtl ? 'rtl' : 'ltr';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function vfArrows(ctx: CanvasRenderingContext2D, p: Palette, sx: number, sy: number, vel: Vec2, toCenter: Vec2 | null) {
  const vl = Math.hypot(vel[0], vel[1]);
  if (vl > 0) {
    const ux = vel[0] / vl;
    const uy = -vel[1] / vl;
    arrow(ctx, sx, sy, sx + ux * 36, sy + uy * 36, { color: p.ink, width: 2.2, head: 9 });
    label(ctx, p, 'v', sx + ux * 46, sy + uy * 46, { italic: true });
  }
  if (toCenter) {
    const L = Math.hypot(toCenter[0], toCenter[1]);
    if (L > 0) {
      const ux = toCenter[0] / L;
      const uy = -toCenter[1] / L;
      arrow(ctx, sx, sy, sx + ux * 32, sy + uy * 32, { color: p.force, width: 2.6, head: 10 });
      label(ctx, p, 'F', sx + ux * 42, sy + uy * 42, { italic: true, color: p.force });
    }
  }
}

function fieldLegend(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, dir: 'in' | 'out') {
  // a paper card under the legend, so the field lattice does not run through the text
  ctx.save();
  ctx.font = `700 12px ${p.fontUi}`;
  const w = 44 + ctx.measureText(dir === 'in' ? 'לתוך הדף' : 'החוצה מהדף').width + 8;
  ctx.fillStyle = withAlpha(p.paper, 0.92);
  ctx.beginPath();
  ctx.roundRect(x - 14, y - 13, w, 26, 6);
  ctx.fill();
  ctx.restore();
  depthGlyph(ctx, x, y, 9, dir, p.bfield, { fill: p.paper });
  label(ctx, p, 'B', x + 18, y, { italic: true, color: p.bfield, align: 'left' });
  label(ctx, p, dir === 'in' ? 'לתוך הדף' : 'החוצה מהדף', x + 32, y, { color: p.bfield, size: 12, align: 'left', rtl: false });
}

function scaleBarCm(ctx: CanvasRenderingContext2D, view: View, p: Palette, cm: number, right = false) {
  const L = (cm / 100) * view.ppm;
  const x = right ? view.w - 14 - L : 14;
  const y = view.h - 14;
  ctx.save();
  // a paper card, so the bar reads over the field lattice and the paths
  ctx.fillStyle = withAlpha(p.paper, 0.9);
  ctx.beginPath();
  ctx.roundRect(x - 6, y - 26, L + 12, 30, 6);
  ctx.fill();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y);
  ctx.lineTo(x + L, y);
  ctx.lineTo(x + L, y - 4);
  ctx.stroke();
  ctx.restore();
  label(ctx, p, `${cm} cm`, x + L / 2, y - 10, { color: p.ink2, size: 12, base: 'bottom' });
}

/* ------------------------------------------------------------------ component */

export default function MagneticOrbit(props: MagneticOrbitProps) {
  const preset = props.preset ?? 'orbit';
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (st.particle === 'electron' || st.particle === 'proton' || st.particle === 'alpha') next.particle = st.particle;
          if (typeof st.speed === 'number') next.speed = nearest(SPEEDS, st.speed);
          if (typeof st.field === 'number') next.field = nearest(FIELDS, st.field);
          if (st.dir === 'in' || st.dir === 'out') next.dir = st.dir;
          if (st.region === 'full' || st.region === 'edge') next.region = st.region;
          if (typeof st.angle === 'number') next.angle = nearest(ANGLES, st.angle);
          if (typeof st.race === 'boolean') next.race = st.race;
          if (st.set === 'neon' || st.set === 'chlorine' || st.set === 'carbon') next.set = st.set;
          if (typeof st.U === 'number') next.U = nearest(VOLTAGES, st.U);
          if (typeof st.B === 'number') next.B = nearest(SPEC_FIELDS, st.B);
          return next;
        });
      }),
    [props.id],
  );

  const orbit = solveOrbit(s);
  const spec = solveSpec(s);
  const init = initial(props);

  /** Tasks tick only when the student changes a control: steps in the text never complete them. */
  const checkTasks = (prev: State, next: State) => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (preset === 'orbit') {
      const o = solveOrbit(next);
      if (has('race') && next.race && !prev.race && next.region === 'full') done('race');
      if (has('half-T')) {
        const P = PARTICLES[next.particle];
        const T0 = orbitPeriod(P.m, P.q, init.field * P.bUnit);
        if (o.T <= T0 / 2 + 1e-12 * T0) done('half-T');
      }
      if (has('flip-sign') && PARTICLES[next.particle].q * PARTICLES[prev.particle].q < 0) done('flip-sign');
      if (has('edge-double') && next.region === 'edge' && next.particle === init.particle) {
        const c0 = solveOrbit({ ...init, region: 'edge' }).edge!.chord;
        if (o.edge && o.edge.chord >= 2 * c0 * (1 - 1e-9)) done('edge-double');
      }
      if (has('edge-angle') && next.region === 'edge' && next.angle !== 0 && next.angle !== prev.angle) done('edge-angle');
    } else {
      const sp = solveSpec(next);
      if (has('separate') && next.set === 'chlorine' && sp.sep >= 0.01 && sp.ions.every((i) => i.onDetector)) done('separate');
      if (has('hit-mark') && next.set === 'neon' && Math.abs(sp.ions[0].land - HIT_TARGET) <= 0.005) done('hit-mark');
    }
  };

  const describe = () => {
    if (preset === 'spectrometer') {
      const parts = spec.ions.map((i) =>
        i.onDetector ? `${ISOTOPES[s.set].name}-${i.A} נוחת ${sci(i.land * 100)} ס"מ מהסדק` : `${ISOTOPES[s.set].name}-${i.A} מחטיא את הגלאי`,
      );
      return `מתח מאיץ ${sci(s.U)} וולט, שדה ${sci(s.B)} טסלה. ${parts.join('; ')}.`;
    }
    const { P, r, T, ccw } = orbit;
    const sense = ccw ? 'נגד כיוון השעון' : 'עם כיוון השעון';
    const field = s.dir === 'in' ? 'לתוך הדף' : 'החוצה מהדף';
    if (s.region === 'edge' && orbit.edge)
      return `${P.name} נכנס לשדה ${field}, מסתובב ${sense} ויוצא ${sci(orbit.edge.chord * 100)} ס"מ מנקודת הכניסה, אחרי ${sci(orbit.edge.tField)} שניות בשדה.`;
    return `${P.name} בשדה ${field}: מסתובב ${sense} במעגל ברדיוס ${sci(r * 100)} ס"מ, זמן מחזור ${sci(T)} שניות.`;
  };

  /* ---------------- drawing: orbit preset */
  const drawOrbit = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const edge = s.region === 'edge';
    const X0 = edge ? EDGE_X0 : 0;
    const P = (x: number, y: number) => toScreen(view, x - X0, y);
    const sol = orbit;
    const { P: part, r, T } = sol;
    const color = part.q < 0 ? p.neg : p.pos;
    const scale = timeScale(s.particle);
    const still = !motionAllowed();

    // the field region
    const [bx0, by0] = P(edge ? 0 : X0 - ORBIT_W / 2 - 0.02, ORBIT_H / 2 + 0.02);
    const [bx1, by1] = P(X0 + ORBIT_W / 2 + 0.02, -ORBIT_H / 2 - 0.02);
    ctx.save();
    ctx.fillStyle = withAlpha(p.bfield, 0.06);
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    ctx.restore();
    depthField(ctx, { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }, s.dir, p.bfield, 30, 0.45);
    if (edge) {
      polyline(ctx, [[bx0, by0], [bx0, by1]], p.bfield, 2, { dash: [7, 5], alpha: 0.9 });
      label(ctx, p, 'גבול השדה', bx0 + 6, view.h - 12, { color: p.bfield, size: 12, align: 'left', base: 'bottom', rtl: false });
    }
    fieldLegend(ctx, p, edge ? bx0 + 20 : 22, 22, s.dir);
    scaleBarCm(ctx, view, p, 5, edge);

    if (!edge) {
      // the circle and its centre
      const c = circleCenter(part.q, part.m, sol.Bz, sol.p0, sol.v0);
      const [cx, cy] = P(c[0], c[1]);
      const rp = r * view.ppm;
      ctx.save();
      ctx.strokeStyle = withAlpha(color, 0.85);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, rp, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      polyline(ctx, [[cx - 5, cy], [cx + 5, cy]], p.ink2, 1.5);
      polyline(ctx, [[cx, cy - 5], [cx, cy + 5]], p.ink2, 1.5);

      // the gun on the tangent line, to the left of the launch point
      const [gx, gy] = P(sol.p0[0], sol.p0[1]);
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.3);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(gx - 46, gy - 7, 34, 14);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // the second particle at twice the speed: same centre side, twice the radius, same period
      const v2: Vec2 = [2 * sol.v, 0];
      if (s.race) {
        const c2 = circleCenter(part.q, part.m, sol.Bz, sol.p0, v2);
        const [c2x, c2y] = P(c2[0], c2[1]);
        ctx.save();
        ctx.strokeStyle = withAlpha(color, 0.7);
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c2x, c2y, 2 * rp, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // the beads: real time = screen time / scale
      const tau = still ? 0.3 * T : (t / scale) % T;
      const pos = circlePosition(part.q, part.m, sol.Bz, sol.p0, sol.v0, tau);
      const [sx, sy] = P(pos[0], pos[1]);
      // the radius to the bead
      polyline(ctx, [[cx, cy], [sx, sy]], p.ink2, 1.2, { dash: [4, 4] });
      {
        // the label sits beside the middle of the radius, on the side away from the force arrow
        const dx = sx - cx;
        const dy = sy - cy;
        const L = Math.hypot(dx, dy) || 1;
        label(ctx, p, 'r', (cx + sx) / 2 + (dy / L) * 12, (cy + sy) / 2 - (dx / L) * 12, { italic: true, color: p.ink2 });
      }
      if (s.race) {
        const pos2 = circlePosition(part.q, part.m, sol.Bz, sol.p0, v2, tau);
        const [s2x, s2y] = P(pos2[0], pos2[1]);
        chargeDisc(ctx, s2x, s2y, 8, part.q, p, { label: '2v' });
      }
      vfArrows(ctx, p, sx, sy, velocityAt(sol, sol.v0, tau), [c[0] - pos[0], c[1] - pos[1]]);
      chargeDisc(ctx, sx, sy, 9, part.q, p, {});
      return;
    }

    // edge mode
    const e = sol.edge!;
    const pts: [number, number][] = [];
    pts.push(P(e.gun[0], e.gun[1]));
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const q = circlePosition(part.q, part.m, sol.Bz, e.entry, e.v0, (e.tField * i) / N);
      pts.push(P(q[0], q[1]));
    }
    pts.push(P(e.end[0], e.end[1]));
    polyline(ctx, pts, color, 2.2, { alpha: 0.85 });

    // the gun
    {
      const [gx, gy] = P(e.gun[0], e.gun[1]);
      const a = Math.atan2(-e.v0[1], e.v0[0]);
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(a);
      ctx.fillStyle = withAlpha(p.equip, 0.3);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(-34, -7, 34, 14);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // entry and exit marks and the chord between them
    const [ex0, ey0] = P(e.entry[0], e.entry[1]);
    const [ex1, ey1] = P(e.exit[0], e.exit[1]);
    for (const [x, y] of [[ex0, ey0], [ex1, ey1]]) {
      ctx.save();
      ctx.fillStyle = p.paper;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    {
      const xl = ex0 - 16;
      polyline(ctx, [[xl, ey0], [xl, ey1]], p.ink2, 1.3);
      polyline(ctx, [[xl - 4, ey0], [xl + 4, ey0]], p.ink2, 1.3);
      polyline(ctx, [[xl - 4, ey1], [xl + 4, ey1]], p.ink2, 1.3);
      label(ctx, p, `d = ${sci(e.chord * 100)} cm`, xl - 6, (ey0 + ey1) / 2, { size: 13, align: 'right' });
    }
    // the centre of the arc
    {
      const [cx, cy] = P(e.center[0], e.center[1]);
      polyline(ctx, [[cx - 5, cy], [cx + 5, cy]], p.ink2, 1.5);
      polyline(ctx, [[cx, cy - 5], [cx, cy + 5]], p.ink2, 1.5);
    }

    // the bead: approach, arc, leave, pause, repeat
    const total = e.tIn + e.tField + e.tOut;
    const loop = total * scale + 1;
    const tau = still ? e.tIn + e.tField / 2 : Math.min(((t % loop) + loop) % loop, total * scale) / scale;
    const st = edgeState(sol, tau);
    const [sx, sy] = P(st.pos[0], st.pos[1]);
    vfArrows(ctx, p, sx, sy, st.vel, st.inField ? [e.center[0] - st.pos[0], e.center[1] - st.pos[1]] : null);
    chargeDisc(ctx, sx, sy, 9, part.q, p, {});
  };

  /* ---------------- drawing: spectrometer preset */
  const drawSpec = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const P = (x: number, y: number) => toScreen(view, x - SPEC_X0, y - SPEC_Y0);
    const still = !motionAllowed();
    const xL = SPEC_X0 - SPEC_W / 2;
    const xR = SPEC_X0 + SPEC_W / 2;
    const yT = SPEC_Y0 + SPEC_H / 2;

    // field region above the detector line
    const [fx0, fy0] = P(xL - 0.02, yT + 0.02);
    const [fx1, fy1] = P(xR + 0.02, 0);
    ctx.save();
    ctx.fillStyle = withAlpha(p.bfield, 0.06);
    ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    ctx.restore();
    depthField(ctx, { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 }, 'out', p.bfield, 30, 0.45);
    fieldLegend(ctx, p, 22, 22, 'out');

    // detector strip with a centimetre scale, and the wall left of the slit
    const strip = (xa: number, xb: number) => {
      const [a, ya] = P(xa, 0);
      const [b] = P(xb, 0);
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.35);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(a, ya, b - a, 7);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    strip(xL - 0.02, -0.012);
    strip(0.012, DET_END);
    {
      const [, y0] = P(0, 0);
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1;
      for (let cm = 1; cm <= Math.floor(DET_END * 100); cm++) {
        const [x] = P(cm / 100, 0);
        const major = cm % 5 === 0;
        ctx.beginPath();
        ctx.moveTo(x, y0 + 7);
        ctx.lineTo(x, y0 + 7 + (major ? 7 : 3));
        ctx.stroke();
        if (major && cm % 10 === 0) label(ctx, p, String(cm), x, y0 + 22, { size: 11, color: p.ink2 });
      }
      ctx.restore();
      const [xe] = P(DET_END, 0);
      label(ctx, p, 'cm', xe + 4, y0 + 22, { size: 11, color: p.ink2, align: 'left' });
      label(ctx, p, 'גלאי', xe - 4, y0 - 10, { size: 12, color: p.ink2, align: 'right', rtl: true });
    }
    if (props.tasks?.includes('hit-mark')) {
      const [x, y0] = P(HIT_TARGET, 0);
      ctx.save();
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.moveTo(x, y0 + 15);
      ctx.lineTo(x - 5, y0 + 24);
      ctx.lineTo(x + 5, y0 + 24);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // accelerating plates (lower +, upper −) with holes, the voltage, and the source
    const plate = (y: number, positive: boolean) => {
      for (const [xa, xb] of [[-0.07, -0.008], [0.008, 0.07]]) {
        const [a, ya] = P(xa, y + 0.004);
        const [b, yb] = P(xb, y - 0.004);
        ctx.save();
        ctx.fillStyle = withAlpha(p.equip, 0.3);
        ctx.strokeStyle = p.equip;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.rect(a, ya, b - a, yb - ya);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        label(ctx, p, positive ? '+' : '−', (a + b) / 2, (ya + yb) / 2, { color: positive ? p.pos : p.neg, size: 13 });
      }
    };
    plate(PLATE_LOW, true);
    plate(PLATE_HIGH, false);
    {
      const [xa, ya] = P(0.085, PLATE_HIGH);
      const [, yb] = P(0.085, PLATE_LOW);
      polyline(ctx, [[xa - 4, ya], [xa, ya], [xa, yb], [xa - 4, yb]], p.ink2, 1.3);
      label(ctx, p, 'U', xa + 6, (ya + yb) / 2, { size: 14, italic: true, align: 'left' });
      const [sxa, sya] = P(-0.03, PLATE_LOW - 0.012);
      const [sxb, syb] = P(0.03, PLATE_LOW - 0.04);
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.25);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(sxa, sya, sxb - sxa, syb - sya);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      label(ctx, p, 'מקור יונים', sxb + 6, (sya + syb) / 2, { size: 12, color: p.ink2, align: 'left', rtl: true });
    }

    // the ion paths: up through the plates and the slit, then a half circle onto the detector
    const dashes: number[][] = [[], [8, 5], [2, 4]];
    spec.ions.forEach((ion, k) => {
      const pts: [number, number][] = [P(0, PLATE_LOW), P(0, 0)];
      const N = 120;
      for (let i = 1; i <= N; i++) {
        const a = (Math.PI * i) / N;
        pts.push(P(ion.r - ion.r * Math.cos(a), ion.r * Math.sin(a)));
      }
      polyline(ctx, pts, p.pos, 2, { dash: dashes[k], alpha: 0.85 });
      const [lx, ly] = P(ion.land, 0);
      if (ion.onDetector) {
        ctx.save();
        ctx.fillStyle = p.current;
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // the label sits under the scale, stepped down so neighbours never overlap
      const yl = ly + 38 + 16 * k;
      polyline(ctx, [[lx, ly + 7], [lx, yl - 7]], p.ink3, 1, { dash: [2, 2] });
      label(ctx, p, ionLabel(ISOTOPES[s.set].symbol, ion.A), lx, yl, { size: 12 });
    });

    // beads: a stream of ions on each path
    const gap = 0.7;
    spec.ions.forEach((ion) => {
      const d = PLATE_HIGH - PLATE_LOW;
      const total = (2 * d) / ion.v - PLATE_HIGH / ion.v + orbitPeriod(ion.m, E_CHARGE, s.B) / 2;
      const span = total * SPEC_SCALE;
      const t0 = still ? 1.9 : t;
      for (let k = 0; k * gap < span + gap; k++) {
        const ts = ((t0 - k * gap) % (span + gap) + (span + gap)) % (span + gap);
        const pos = ionPos(ion, s.B, ts / SPEC_SCALE);
        if (!pos) continue;
        const [bx, by] = P(pos[0], pos[1]);
        ctx.save();
        ctx.fillStyle = p.pos;
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    });
  };

  const draw = preset === 'spectrometer' ? drawSpec : drawOrbit;
  const world = preset === 'spectrometer' ? { worldWidth: SPEC_W, worldHeight: SPEC_H } : { worldWidth: ORBIT_W, worldHeight: ORBIT_H };
  const { canvasRef, invalidate } = useFigureCanvas(draw, { ...world, animate: true });
  useEffect(invalidate, [s]);

  useEffect(() => {
    const id = setTimeout(() => setLive(describe()), 400);
    return () => clearTimeout(id);
  }, [s]);

  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const change = (next: Partial<State>) => {
    const merged = { ...s, ...next };
    setS(merged);
    checkTasks(s, merged);
  };

  if (preset === 'spectrometer') {
    const sym = ISOTOPES[s.set].symbol;
    return (
      <SimShell
        fig={props.id}
        label={`איור חי: ספקטרומטר מסות. יוני ${ISOTOPES[s.set].name} מואצים ממנוחה במתח ${sci(s.U)} וולט, נכנסים דרך סדק לשדה מגנטי אחיד החוצה מהדף, ${sci(s.B)} טסלה, ונוחתים על גלאי. ${describe()}`}
        canvasRef={canvasRef}
        aspect={SPEC_W / SPEC_H}
        live={live}
        tasks={tasks}
        onReset={reset}
        readout={
          <>
            {spec.ions.map((i) => (
              <span key={i.A}>
                <b class="q">{ionLabel(sym, i.A)}</b>: <span class="q">v = {sci(i.v)} m/s, r = {sci(i.r * 100)} cm</span>
                {i.onDetector ? (
                  <>
                    {' '}· נוחת ב-<b class="q">{sci(i.land * 100)} cm</b>
                  </>
                ) : (
                  <> · מחטיא את הגלאי</>
                )}
              </span>
            ))}
            <span>
              המרחק בין <b class="q">{ionLabel(sym, spec.ions[0].A)}</b> לבין <b class="q">{ionLabel(sym, spec.ions[spec.ions.length - 1].A)}</b>:{' '}
              <b class="q">Δx = {sci(spec.sep * 100)} cm</b>
            </span>
          </>
        }
        controls={
          <>
            <div class="group" role="group" aria-label="היסוד">
              {(Object.keys(ISOTOPES) as IsotopeSet[]).map((k) => (
                <Toggle key={k} label={ISOTOPES[k].name} on={s.set === k} onChange={() => change({ set: k })} />
              ))}
            </div>
            <Slider
              label="המתח המאיץ U"
              min={0}
              max={VOLTAGES.length - 1}
              step={1}
              value={Math.max(0, VOLTAGES.indexOf(s.U))}
              format={(i) => `${VOLTAGES[i]} V`}
              onChange={(i) => change({ U: VOLTAGES[i] })}
            />
            <Slider
              label="השדה המגנטי B"
              min={0}
              max={SPEC_FIELDS.length - 1}
              step={1}
              value={Math.max(0, SPEC_FIELDS.indexOf(s.B))}
              format={(i) => `${SPEC_FIELDS[i]} T`}
              onChange={(i) => change({ B: SPEC_FIELDS[i] })}
            />
          </>
        }
      />
    );
  }

  const { P: part, v, B, r, T, ccw } = orbit;
  const fmtB = (b: number) => (b < 1e-2 ? `${sci(b * 1000)} mT` : `${sci(b)} T`);
  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${part.name} בשדה מגנטי אחיד ${s.dir === 'in' ? 'לתוך הדף' : 'החוצה מהדף'}, ${s.region === 'edge' ? 'רק מימין לגבול' : 'בכל האיור'}. מהירות ${sci(v)} מטר לשנייה, שדה ${fmtB(B)}. ${describe()}`}
      canvasRef={canvasRef}
      aspect={ORBIT_W / ORBIT_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span>
            רדיוס: <b class="q">r = mv/(|q|B) = {sci(r * 100)} cm</b>
          </span>
          <span>
            זמן מחזור: <b class="q">T = 2πm/(|q|B) = {sci(T)} s</b>
          </span>
          <span>
            כיוון הסיבוב: <b>{ccw ? 'נגד כיוון השעון' : 'עם כיוון השעון'}</b>
          </span>
          {s.region === 'edge' && orbit.edge ? (
            <span>
              יוצא במרחק <b class="q">d = {sci(orbit.edge.chord * 100)} cm</b> מנקודת הכניסה, אחרי <b class="q">{sci(orbit.edge.tField)} s</b> בשדה
            </span>
          ) : (
            <span>
              גודל המהירות לא משתנה: <b class="q">v = {sci(v)} m/s</b>
            </span>
          )}
          {s.race && s.region === 'full' && (
            <span>
              החלקיק השני: <b class="q">r = {sci(2 * r * 100)} cm, T = {sci(T)} s</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="החלקיק">
            {(Object.keys(PARTICLES) as ParticleId[]).map((k) => (
              <Toggle
                key={k}
                label={PARTICLES[k].name}
                on={s.particle === k}
                swatch={PARTICLES[k].q < 0 ? 'var(--neg)' : 'var(--pos)'}
                onChange={() => change({ particle: k })}
              />
            ))}
          </div>
          <div class="group" role="group" aria-label="כיוון השדה">
            <Toggle label="⊗ השדה לתוך הדף" on={s.dir === 'in'} onChange={() => change({ dir: 'in' })} />
            <Toggle label="⊙ השדה החוצה מהדף" on={s.dir === 'out'} onChange={() => change({ dir: 'out' })} />
          </div>
          <div class="group" role="group" aria-label="אזור השדה">
            <Toggle label="שדה בכל האיור" on={s.region === 'full'} onChange={() => change({ region: 'full' })} />
            <Toggle label="שדה רק מימין לגבול" on={s.region === 'edge'} onChange={() => change({ region: 'edge' })} />
            {s.region === 'full' && <Toggle label="חלקיק שני במהירות כפולה" on={s.race} onChange={(on) => change({ race: on })} />}
          </div>
          <Slider
            label="המהירות v"
            min={0}
            max={SPEEDS.length - 1}
            step={1}
            value={Math.max(0, SPEEDS.indexOf(s.speed))}
            format={(i) => `${sci(SPEEDS[i] * part.vUnit)} m/s`}
            onChange={(i) => change({ speed: SPEEDS[i] })}
          />
          <Slider
            label="השדה B"
            min={0}
            max={FIELDS.length - 1}
            step={1}
            value={Math.max(0, FIELDS.indexOf(s.field))}
            format={(i) => fmtB(FIELDS[i] * part.bUnit)}
            onChange={(i) => change({ field: FIELDS[i] })}
          />
          {s.region === 'edge' && (
            <Slider
              label="זווית הכניסה φ"
              min={0}
              max={ANGLES.length - 1}
              step={1}
              value={Math.max(0, ANGLES.indexOf(s.angle))}
              format={(i) => `${ANGLES[i]}°`}
              onChange={(i) => change({ angle: ANGLES[i] })}
            />
          )}
        </>
      }
    />
  );
}
