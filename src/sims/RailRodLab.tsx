/**
 * A rod on rails in a magnetic field: the motional emf ε = BLv, the current BLv/R, the braking force
 * BIL, the approach to the terminal speed and the energy on the way. Built for lessons 5.4 (flat rails)
 * and 5.5 (inclined and vertical rails, a hanging mass).
 *
 * Four views, chosen by `mode` (and the mode buttons when `modes` lists more than one):
 * - `flat`: the rails seen from above, horizontal, in a uniform field ⊗ (or ⊙). A resistor R closes
 *   the rails on the left; a rod of length L = 0.5 m lies across them and is pulled to the right by a
 *   constant force F, which can be removed and put back. The shaded part of the rails is the circuit:
 *   its area, and so the flux through it, grows as the rod moves. The current (gold, with chevrons)
 *   and the two forces on the rod, the pull F and the magnetic force F_B, are drawn live.
 * - `incline`: a side view of rails inclined at α, the rod seen end-on (its current ⊗ or ⊙). Gravity
 *   drives it down the slope; the field is perpendicular to the rails or vertical (then only B·cosα
 *   makes an emf, and the magnetic force is horizontal: its component along the rails brakes).
 * - `fall`: vertical rails seen from the front, the resistor at the top, the field ⊗; the rod falls
 *   under its whole weight m·g, and the speed graph shows free fall, v = g·t, beside it.
 * - `pulley`: a side view of horizontal rails on a table, the field vertical (up), the rod end-on
 *   (its current ⊙); a string over a pulley at the table's edge and a hanging mass M drive it. The pair
 *   moves as one body of mass m + M driven by M·g (`pulleyRod`).
 *
 * Changing a mass starts a new run from rest (the energy bars then stay a true balance).
 *
 * Under the scene: the speed against the time, with the terminal speed v_T dashed and τ marked, and
 * energy bars: what went in (the kinetic energy at the start plus the work of the drive) beside where
 * it is now (kinetic energy plus heat in the resistor). A run is a list of segments; changing a
 * parameter starts a new segment from the present speed (railrod.ts). Every number is computed in
 * closed form from src/physics (railAt, runAt, runWork, railTerminalSpeed, railCurrent, …). Time runs
 * faster than real time when τ is long (the readout says by how much); in still mode it does not run,
 * and the time slider moves it by hand. The x direction is not to scale: the rails' 10 m fill the
 * width, while the rod is 0.5 m long.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { motionalEmf, railBrakingForce, railCurrent, railTerminalSpeed, railTimeConstant, type RailRod } from '~/physics/induction';
import { fallRod, freeFallSpeed, inclineRod, kinetic, pulleyRod, pulleyTension, railPowers, runAt, runWork, type InclineField, type RailSegment } from '~/physics/railrod';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, chevron, depthField, depthGlyph, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawMarker, insetBox, makePlot, niceTicks } from './core/plot';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const ASPECT = 1.05;
/** the rod's length, the distance between the rails [m] */
export const L_ROD = 0.5;
/** metres of rail across the scene's width (flat view) and along the slope (incline view) */
const SPAN = 10;
/** where the rod starts, measured from the resistor [m] */
const START = 1;
/** a force drawn at the full arrow length [N] */
const F_REF = 1;
const DEG = Math.PI / 180;
const AXIS_STEPS = [2, 3, 4, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60];

type Mode = 'flat' | 'incline' | 'fall' | 'pulley';

const MODE_NAME: Record<Mode, string> = { flat: 'מסילות אופקיות', incline: 'מסילות משופעות', fall: 'מסילות אנכיות', pulley: 'משקולת וגלגלת' };

/** each view's own starting values (the mode buttons reset to them) */
const MODE_DEFAULTS: Record<Mode, { m: number; B: number; R: number }> = {
  flat: { m: 0.2, B: 0.8, R: 2 },
  incline: { m: 0.1, B: 1, R: 1 },
  fall: { m: 0.1, B: 1, R: 1 },
  pulley: { m: 0.1, B: 0.5, R: 0.5 },
};

/** the drive's name in the readout */
const DRIVE_NAME: Record<Mode, string> = { flat: 'F', incline: 'mg·sinα', fall: 'mg', pulley: 'Mg' };

const TASK_LABEL: Record<string, string> = {
  terminal: 'הפעילו את התנועה וחכו עד שהמהירות כמעט לא משתנה. מה המהירות הסופית, ומה ההספק בנגד?',
  'double-R': 'אחרי שהמוט הגיע למהירות הסופית, הכפילו את ההתנגדות R וחכו שוב. פי כמה גדלה המהירות הסופית?',
  'flip-field': 'הפכו את כיוון השדה בזמן שהמוט נע. מה קרה לזרם, ומה קרה לכוח המגנטי?',
  'pull-off': 'כשהמוט נע מהר, הסירו את הכוח F וחכו. מה קורה למהירות?',
  incline: 'במסילות המשופעות, שחררו את המוט וחכו שיגיע למהירות סופית.',
  vertical: 'במסילות המשופעות, הפכו את השדה לאנכי והגיעו שוב למהירות סופית. האם היא גדלה או קטנה?',
  fall: 'עברו למסילות האנכיות, שחררו את המוט וחכו שיגיע למהירות סופית. השוו את הגרף לקו של נפילה חופשית.',
  'fall-mass': 'במסילות האנכיות, הכפילו את מסת המוט והגיעו שוב למהירות סופית. פי כמה היא גדלה?',
  pulley: 'עברו למשקולת ולגלגלת, שחררו את המערכת וחכו שתגיע למהירות סופית. האם המהירות הסופית תלויה במסת המוט?',
};

export interface RailRodLabProps {
  id: string;
  mode?: Mode;
  modes?: Mode[];
  /** pull [N], field [T], resistance [Ω], rod mass [kg], incline angle [deg], hanging mass [kg] */
  F?: number;
  B?: number;
  R?: number;
  m?: number;
  alpha?: number;
  M?: number;
  field?: InclineField;
  dirB?: 'in' | 'out';
  tasks?: string[];
}

interface State {
  mode: Mode;
  F: number;
  B: number;
  R: number;
  m: number;
  alpha: number;
  /** the hanging mass (pulley view) [kg] */
  M: number;
  field: InclineField;
  dirB: 'in' | 'out';
  /** the pull is applied (flat view) */
  pull: boolean;
  running: boolean;
  /** time since the run started [s] */
  T: number;
  segs: RailSegment[];
}

type Params = Omit<State, 'running' | 'T' | 'segs'>;

const round = (x: number, step: number) => Number((Math.round(x / step) * step).toFixed(6));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** The RailRod of a state: the pull on flat rails, gravity on the incline. */
function rodOf(st: Params): RailRod {
  if (st.mode === 'incline') return inclineRod(st.m, L_ROD, st.B, st.R, st.alpha * DEG, st.field);
  if (st.mode === 'fall') return fallRod(st.m, L_ROD, st.B, st.R);
  if (st.mode === 'pulley') return pulleyRod(st.m, st.M, L_ROD, st.B, st.R);
  return { m: st.m, L: L_ROD, B: st.B, R: st.R, F: st.pull ? st.F : 0 };
}

/** A new run from rest with the parameters of `st`. */
function freshRun(st: Params): State {
  return { ...st, running: false, T: 0, segs: [{ t0: 0, s0: { x: 0, v: 0, heat: 0 }, p: rodOf(st) }] };
}

/** The same run, with new parameters from the present moment on (later segments are dropped). */
function withParams(prev: State, patch: Partial<Params>): State {
  const next = { ...prev, ...patch };
  const segs = prev.segs.filter((s) => s.t0 <= prev.T);
  const p = rodOf(next);
  const last = segs[segs.length - 1];
  if (last.t0 === prev.T) segs[segs.length - 1] = { ...last, p };
  else segs.push({ t0: prev.T, s0: runAt(prev.segs, prev.T), p });
  return { ...next, segs };
}

const segAt = (segs: readonly RailSegment[], T: number): RailSegment => {
  let k = 0;
  while (k + 1 < segs.length && segs[k + 1].t0 <= T) k++;
  return segs[k];
};

/** The time axis: long enough for every segment to come within 1% of its terminal speed. */
function axisOf(segs: readonly RailSegment[], T: number): number {
  let need = T;
  for (const s of segs) need = Math.max(need, s.t0 + 5 * railTimeConstant(s.p));
  return AXIS_STEPS.find((a) => a >= need - 1e-9) ?? AXIS_STEPS[AXIS_STEPS.length - 1];
}

/** The speed axis: room for every terminal speed and every starting speed. */
function vAxisOf(segs: readonly RailSegment[]): number {
  let v = 1;
  for (const s of segs) v = Math.max(v, railTerminalSpeed(s.p), s.s0.v);
  const ticks = niceTicks(0, v * 1.15, 4);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : v;
  return Math.ceil((v * 1.12) / step) * step;
}

/** Sim seconds per real second: a whole axis plays in about ten seconds. */
const rateOf = (axis: number) => clamp(axis / 10, 0.4, 6);

export default function RailRodLab(props: RailRodLabProps) {
  const params = (): Params => {
    const mode = props.mode ?? 'flat';
    const d = MODE_DEFAULTS[mode];
    return {
      mode,
      F: props.F ?? 0.4,
      B: props.B ?? d.B,
      R: props.R ?? d.R,
      m: props.m ?? d.m,
      alpha: props.alpha ?? 30,
      M: props.M ?? 0.05,
      field: props.field ?? 'normal',
      dirB: props.dirB ?? 'in',
      pull: true,
    };
  };
  const [s, setS] = useState<State>(() => freshRun(params()));
  const [live, setLive] = useState('');
  const sRef = useRef(s);
  sRef.current = s;
  /** the run was started or changed by the learner (a text step clears it), so it may tick tasks */
  const userRun = useRef(false);
  /** terminal speeds reached by the learner, keyed by the parameters other than R */
  const reached = useRef<Set<string>>(new Set());
  /** the speed when the learner removed the pull */
  const pullOffV = useRef<number | null>(null);
  const lastClock = useRef(0);
  const lastPush = useRef(0);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const modes = props.modes ?? [s.mode];
  const has = (t: string) => props.tasks?.includes(t);
  const done = (t: string) => {
    if (has(t)) markTask(`${props.id}:${t}`);
  };

  /** Tasks that depend on where the run has got to. Only a run the learner owns may tick them. */
  const checkProgress = (st: State) => {
    if (!userRun.current) return;
    const seg = segAt(st.segs, st.T);
    const cur = runAt(st.segs, st.T);
    const vT = railTerminalSpeed(seg.p);
    if (seg.p.F > 0 && vT > 0 && Math.abs(cur.v - vT) < 0.02 * vT) {
      if (st.mode === 'flat') {
        done('terminal');
        const key = (R: number) => `${st.F}|${st.B}|${st.m}|${sci(R)}`;
        if (reached.current.has(key(st.R / 2))) done('double-R');
        reached.current.add(key(st.R));
      } else if (st.mode === 'incline') {
        done('incline');
        if (st.field === 'vertical') done('vertical');
      } else if (st.mode === 'fall') {
        done('fall');
        const key = (m: number) => `fall|${st.B}|${st.R}|${sci(m)}`;
        if (reached.current.has(key(st.m / 2))) done('fall-mass');
        reached.current.add(key(st.m));
      } else {
        done('pulley');
      }
    }
    if (pullOffV.current !== null && cur.v < 0.5 * pullOffV.current) done('pull-off');
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userRun.current = false;
        pullOffV.current = null;
        setS((prev) => {
          const num = (k: 'F' | 'B' | 'R' | 'm' | 'alpha' | 'M', dflt: number) => (typeof st[k] === 'number' ? (st[k] as number) : dflt);
          const mode: Mode = st.mode === 'flat' || st.mode === 'incline' || st.mode === 'fall' || st.mode === 'pulley' ? st.mode : prev.mode;
          const base: Params = {
            mode,
            F: num('F', prev.F),
            B: num('B', prev.B),
            R: num('R', prev.R),
            m: num('m', prev.m),
            alpha: num('alpha', prev.alpha),
            M: num('M', prev.M),
            field: st.field === 'normal' || st.field === 'vertical' ? st.field : prev.field,
            dirB: st.dirB === 'in' || st.dirB === 'out' ? st.dirB : prev.dirB,
            pull: true,
          };
          let next = freshRun(base);
          // a step may show the pull removed at a moment of the run
          if (typeof st.offAt === 'number') {
            next = { ...next, T: st.offAt as number };
            next = withParams(next, { pull: false });
          }
          if (typeof st.T === 'number') next = { ...next, T: st.T as number };
          return next;
        });
      }),
    [props.id],
  );

  const act = (f: (prev: State) => State) => {
    userRun.current = true;
    setS((prev) => {
      const next = f(prev);
      checkProgress(next);
      return next;
    });
  };

  const setParam = (patch: Partial<Params>) => act((prev) => withParams(prev, patch));
  /** a new mass is a new body: the run starts again from rest */
  const setMass = (patch: Partial<Params>) =>
    act((prev) => {
      pullOffV.current = null;
      return freshRun({ ...prev, ...patch });
    });

  /* ------------------------------------------------------------------ what is happening now */

  const seg = segAt(s.segs, s.T);
  const p = seg.p;
  const cur = runAt(s.segs, s.T);
  const vT = railTerminalSpeed(p);
  const tau = railTimeConstant(p);
  const emf = motionalEmf(p.B, p.L, cur.v);
  const I = railCurrent(p, cur.v);
  const FB = railBrakingForce(p, cur.v);
  const pw = railPowers(p, cur.v);
  const W = runWork(s.segs, s.T);
  // the inertia of the run (rod and hanging mass in the pulley view)
  const K0 = kinetic(s.segs[0].p.m, s.segs[0].s0.v);
  const K = kinetic(p.m, cur.v);
  const axis = axisOf(s.segs, s.T);
  const atTerminal = p.F > 0 && Math.abs(cur.v - vT) < 0.02 * vT;
  /** flat view, field ⊗ and the rod moving right: the current goes up the rod (counter-clockwise) */
  const currentUp = s.dirB === 'in';

  const describe = (): string => {
    const where = `אחרי ${sci(s.T)} שניות המוט נע ב-${sci(cur.v)} מטרים לשנייה`;
    const drive =
      s.mode === 'flat'
        ? p.F > 0
          ? `מושכים אותו בכוח של ${sci(p.F)} ניוטון`
          : 'אין כוח שמושך אותו'
        : s.mode === 'incline'
          ? `רכיב הכובד במורד המדרון ${sci(p.F)} ניוטון`
          : s.mode === 'fall'
            ? `המשקל שלו ${sci(p.F)} ניוטון`
            : `משקולת של ${sci(s.M)} קילוגרם מושכת אותו בחוט, ומשקלה ${sci(p.F)} ניוטון`;
    return `${MODE_NAME[s.mode]}: ${where}; ${drive}. הזרם ${sci(I)} אמפר, והכוח המגנטי ${sci(FB)} ניוטון, נגד התנועה. המהירות הסופית ${sci(vT)} מטרים לשנייה.`;
  };

  useEffect(() => {
    if (!userRun.current) return;
    setLive(describe());
  }, [s.mode, s.F, s.B, s.R, s.m, s.M, s.alpha, s.field, s.dirB, s.pull, s.running]);

  /* ------------------------------------------------------------------ drawing */

  const label = (ctx: CanvasRenderingContext2D, pal: Palette, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center', size = 13) => {
    ctx.save();
    ctx.font = `600 ${size}px ${pal.fontUi}`;
    ctx.fillStyle = color;
    ctx.direction = 'ltr';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  const forceLen = (F: number, full: number) => (F < 1e-9 ? 0 : Math.max(10, Math.min(1, F / F_REF) * full));

  const drawFlat = (ctx: CanvasRenderingContext2D, pal: Palette, Wd: number, Hs: number, st: State, now: ReturnType<typeof runAt>, P: RailRod) => {
    const yTop = Hs * 0.36;
    const yBot = Hs * 0.8;
    /** on a phone the numbers live in the readout, and the canvas keeps only the names */
    const narrow = Wd < 450;
    const left = Wd * 0.05;
    const ppx = (Wd * 0.9) / SPAN;
    const X = START + now.x;
    // the camera follows the rod once it passes this point (further left on a phone, clear of the tool buttons)
    const cam = Math.max(0, X - (narrow ? 0.45 : 0.62) * SPAN);
    const sx = (x: number) => left + (x - cam) * ppx;
    const rodX = sx(X);
    const resX = sx(0);
    // the field over the rails
    depthField(ctx, { x: 0, y: yTop - Hs * 0.18, w: Wd, h: yBot - yTop + Hs * 0.3 }, st.dirB, pal.bfield, 26, 0.45);
    label(ctx, pal, `B ${st.dirB === 'in' ? '⊗' : '⊙'} = ${sci(st.B)} T`, 8, Hs * 0.08, pal.bfield, 'left');
    // the circuit: the area between the resistor and the rod, whose flux grows
    const cx0 = Math.max(0, resX);
    ctx.save();
    ctx.fillStyle = withAlpha(pal.bfield, 0.1);
    ctx.fillRect(cx0, yTop, rodX - cx0, yBot - yTop);
    ctx.restore();
    // rails, with a tick every metre
    ctx.save();
    ctx.strokeStyle = pal.ink2;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(Math.max(0, resX), yTop);
    ctx.lineTo(Wd, yTop);
    ctx.moveTo(Math.max(0, resX), yBot);
    ctx.lineTo(Wd, yBot);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.ink3;
    for (let k = Math.ceil(cam); k <= cam + SPAN + 1; k++) {
      const x = sx(k);
      if (x < resX) continue;
      ctx.beginPath();
      ctx.moveTo(x, yBot + 4);
      ctx.lineTo(x, yBot + (k % 5 === 0 ? 12 : 8));
      ctx.stroke();
      if (k % 5 === 0 && k > 0) label(ctx, pal, `${k} m`, x, yBot + 20, pal.ink3, 'center', 10);
    }
    ctx.restore();
    // the resistor, a zigzag joining the rails
    if (resX > -10) {
      ctx.save();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const zy0 = yTop + (yBot - yTop) * 0.25;
      const zy1 = yBot - (yBot - yTop) * 0.25;
      ctx.moveTo(resX, yTop);
      ctx.lineTo(resX, zy0);
      const n = 6;
      for (let i = 1; i <= n; i++) ctx.lineTo(resX + (i % 2 ? 8 : -8), zy0 + ((zy1 - zy0) * (i - 0.5)) / n);
      ctx.lineTo(resX, zy1);
      ctx.lineTo(resX, yBot);
      ctx.stroke();
      ctx.restore();
      label(ctx, pal, `R = ${sci(st.R)} Ω`, resX + 14, (yTop + yBot) / 2, pal.ink, 'left', 12);
    }
    // the current: up (or down) the rod, round the circuit
    if (now.v > 1e-6) {
      const up = st.dirB === 'in' ? 1 : -1;
      const c = pal.current;
      ctx.save();
      ctx.strokeStyle = withAlpha(c, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, resX), yTop);
      ctx.lineTo(rodX, yTop);
      ctx.moveTo(Math.max(0, resX), yBot);
      ctx.lineTo(rodX, yBot);
      ctx.stroke();
      ctx.restore();
      const mid = (Math.max(0, resX) + rodX) / 2;
      // up the rod → left along the top rail → down the resistor → right along the bottom rail
      chevron(ctx, mid, yTop, -up, 0, 7, c);
      chevron(ctx, mid, yBot, up, 0, 7, c);
      if (resX > 0) chevron(ctx, resX, yTop + (yBot - yTop) * 0.12, 0, up, 6, c);
      label(ctx, pal, narrow ? 'I' : `I = ${sci(railCurrent(P, now.v))} A`, mid, yTop - 12, c, 'center', 12);
    }
    // the rod
    ctx.save();
    ctx.strokeStyle = pal.equip;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rodX, yTop - 9);
    ctx.lineTo(rodX, yBot + 9);
    ctx.stroke();
    ctx.restore();
    if (now.v > 1e-6) {
      const up = st.dirB === 'in' ? 1 : -1;
      chevron(ctx, rodX, (yTop + yBot) / 2 - up * 10, 0, -up, 7, pal.paper);
      chevron(ctx, rodX, (yTop + yBot) / 2 + up * 14, 0, -up, 7, pal.paper);
    }
    if (!narrow) label(ctx, pal, 'L', rodX - 12, yTop + (yBot - yTop) * 0.2, pal.equip, 'right', 13);
    // forces at the rod's middle: the pull to the right, the magnetic force to the left
    const ym = (yTop + yBot) / 2;
    const full = Wd * 0.2;
    if (P.F > 0) {
      const l = forceLen(P.F, full);
      arrow(ctx, rodX + 5, ym - 9, rodX + 5 + l, ym - 9, { color: pal.force, width: 3, head: 11, glow: withAlpha(pal.paper, 0.9) });
      label(ctx, pal, narrow ? 'F' : `F = ${sci(P.F)} N`, rodX + 10 + l, ym - 9, pal.force, 'left', 12);
    }
    const fb = railBrakingForce(P, now.v);
    if (fb > 1e-6) {
      const l = forceLen(fb, full);
      arrow(ctx, rodX - 5, ym + 9, rodX - 5 - l, ym + 9, { color: pal.force, width: 3, head: 11, glow: withAlpha(pal.paper, 0.9) });
      label(ctx, pal, narrow ? 'F_B' : `F_B = ${sci(fb)} N`, rodX - 10 - l, ym + 9, pal.force, 'right', 12);
    }
    // the velocity, above the rod
    if (now.v > 1e-6) {
      const l = Math.min(1, now.v / Math.max(1, vAxisOf(st.segs))) * Wd * 0.14 + 8;
      arrow(ctx, rodX, yTop - 22, rodX + l, yTop - 22, { color: pal.ink, width: 2, head: 8 });
      label(ctx, pal, narrow ? 'v' : `v = ${sci(now.v)} m/s`, rodX + l + 6, yTop - 22, pal.ink, 'left', 12);
    }
  };

  const drawIncline = (ctx: CanvasRenderingContext2D, pal: Palette, Wd: number, Hs: number, st: State, now: ReturnType<typeof runAt>, P: RailRod) => {
    const a = st.alpha * DEG;
    const narrow = Wd < 450;
    const ux = -Math.cos(a);
    const uy = Math.sin(a); // down the slope, in screen coordinates (y down)
    const ppx = (Wd * 0.8) / SPAN;
    // the rod starts near the upper right and moves down; past the middle the slope scrolls instead
    const maxRun = SPAN * 0.45;
    const shown = Math.min(now.x, maxRun);
    // on a phone the rod starts further left and lower, clear of the figure's buttons in the top-right corner
    const ax = Wd * (narrow ? 0.7 : 0.86);
    const ay = Hs * 0.92 - Math.sin(a) * Wd * 0.8 * (narrow ? 0.4 : 0.55);
    const rx = ax + ux * shown * ppx;
    const ry = ay + uy * shown * ppx;
    // the slope line through the rod, across the scene
    const far = Wd * 1.5;
    // the slope's outward normal, up and to the left (screen y grows downward)
    const nX = -Math.sin(a);
    const nY = -Math.cos(a);
    const r = 9;
    const bx = rx - nX * r;
    const by = ry - nY * r; // contact point on the slope
    ctx.save();
    ctx.fillStyle = withAlpha(pal.ink3, 0.18);
    ctx.beginPath();
    ctx.moveTo(bx - ux * far, by - uy * far);
    ctx.lineTo(bx + ux * far, by + uy * far);
    ctx.lineTo(bx + ux * far, Hs + far);
    ctx.lineTo(bx - ux * far, Hs + far);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.ink2;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx - ux * far, by - uy * far);
    ctx.lineTo(bx + ux * far, by + uy * far);
    ctx.stroke();
    // ticks every metre along the slope, from the release point
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.ink3;
    for (let k = Math.floor(now.x - SPAN); k <= now.x + SPAN; k++) {
      if (k < 0) continue;
      const d = (k - now.x) * ppx;
      const tx = bx + ux * d;
      const ty = by + uy * d;
      if (tx < -5 || tx > Wd + 5) continue;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - nX * 8, ty - nY * 8);
      ctx.stroke();
    }
    ctx.restore();
    // the angle, at the bottom of the visible slope
    label(ctx, pal, `α = ${st.alpha}°`, Wd * 0.06, Hs * 0.93, pal.hand, 'left', 13);
    // the field
    const bcol = withAlpha(pal.bfield, 0.7);
    for (let k = 0; k < 5; k++) {
      const fx = Wd * (0.12 + 0.19 * k);
      const fy = Hs * 0.42;
      const len = Hs * 0.2;
      const [dx, dy] = st.field === 'vertical' ? [0, -1] : [nX, nY];
      arrow(ctx, fx - (dx * len) / 2, fy - (dy * len) / 2, fx + (dx * len) / 2, fy + (dy * len) / 2, { color: bcol, width: 1.6, head: 8 });
    }
    label(ctx, pal, `B = ${sci(st.B)} T`, 8, Hs * 0.08, pal.bfield, 'left');
    // the rod, end-on: its current is into the page while it slides down (field up or normal)
    const moving = now.v > 1e-6;
    depthGlyph(ctx, rx, ry, r, 'in', moving ? pal.current : pal.equip, { fill: pal.paper, width: 2.4 });
    if (moving) label(ctx, pal, narrow ? 'I ⊗' : `I = ${sci(railCurrent(P, now.v))} A ⊗`, rx + 14, ry + 16, pal.current, 'left', 12);
    // forces: gravity's part down the slope, and the magnetic force
    const full = Wd * 0.2;
    const lg = forceLen(P.F, full);
    arrow(ctx, rx, ry, rx + ux * lg, ry + uy * lg, { color: pal.force, width: 3, head: 11, glow: withAlpha(pal.paper, 0.9) });
    label(ctx, pal, narrow ? 'mg·sinα' : `mg·sinα = ${sci(P.F)} N`, rx + ux * lg - 6, ry + uy * lg + 14, pal.force, 'right', 12);
    const fb = railBrakingForce(P, now.v);
    if (fb > 1e-6) {
      if (st.field === 'normal') {
        const l = forceLen(fb, full);
        const ox = rx + nX * 16;
        const oy = ry + nY * 16;
        arrow(ctx, ox, oy, ox - ux * l, oy - uy * l, { color: pal.force, width: 3, head: 11 });
        label(ctx, pal, narrow ? 'F_B' : `F_B = ${sci(fb)} N`, ox - ux * l + 6, oy - uy * l - 12, pal.force, 'left', 12);
      } else {
        // horizontal, of size BIL with the full B; its part along the slope, F_B·cosα, brakes
        const Fh = st.B * railCurrent(P, now.v) * L_ROD;
        const l = forceLen(Fh, full);
        arrow(ctx, rx, ry - 16, rx + l, ry - 16, { color: pal.force, width: 3, head: 11 });
        label(ctx, pal, narrow ? 'F_B' : `F_B = ${sci(Fh)} N`, rx + l + 6, ry - 16, pal.force, 'left', 12);
        const lc = forceLen(fb, full);
        ctx.save();
        ctx.setLineDash([4, 3]);
        arrow(ctx, rx, ry, rx - ux * lc, ry - uy * lc, { color: pal.force, width: 1.6, head: 8, alpha: 0.85 });
        ctx.restore();
      }
    }
  };

  /** Vertical rails from the front: the resistor at the top, the rod falling, the field ⊗. */
  const drawFall = (ctx: CanvasRenderingContext2D, pal: Palette, Wd: number, Hs: number, st: State, now: ReturnType<typeof runAt>, P: RailRod) => {
    const narrow = Wd < 450;
    const xL = Wd * 0.34;
    const xR = Wd * 0.66;
    const yRes = Hs * 0.18;
    /** metres of rail down the scene's height */
    const span = 4;
    const ppy = (Hs * 0.85) / span;
    const Y = START * 0.5 + now.x;
    // the camera follows the rod once it is past this depth
    const cam = Math.max(0, Y - 0.62 * span);
    const sy = (y: number) => yRes + (y - cam) * ppy;
    const rodY = sy(Y);
    const resY = sy(0);
    depthField(ctx, { x: 0, y: 0, w: Wd, h: Hs }, 'in', pal.bfield, 26, 0.45);
    label(ctx, pal, `B ⊗ = ${sci(st.B)} T`, 8, Hs * 0.06, pal.bfield, 'left');
    // the circuit: between the resistor and the rod
    const cy0 = Math.max(0, resY);
    ctx.save();
    ctx.fillStyle = withAlpha(pal.bfield, 0.1);
    ctx.fillRect(xL, cy0, xR - xL, rodY - cy0);
    ctx.restore();
    // rails, a tick every metre
    ctx.save();
    ctx.strokeStyle = pal.ink2;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xL, cy0);
    ctx.lineTo(xL, Hs);
    ctx.moveTo(xR, cy0);
    ctx.lineTo(xR, Hs);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.ink3;
    for (let k = Math.ceil(cam); k <= cam + span + 1; k++) {
      const y = sy(k);
      if (y < resY || k === 0) continue;
      ctx.beginPath();
      ctx.moveTo(xR + 4, y);
      ctx.lineTo(xR + 10, y);
      ctx.stroke();
      if (!narrow) label(ctx, pal, `${k} m`, xR + 14, y, pal.ink3, 'left', 10);
    }
    ctx.restore();
    // the resistor across the top
    if (resY > -10) {
      ctx.save();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      const zx0 = xL + (xR - xL) * 0.3;
      const zx1 = xR - (xR - xL) * 0.3;
      ctx.beginPath();
      ctx.moveTo(xL, resY);
      ctx.lineTo(zx0, resY);
      const n = 6;
      for (let i = 1; i <= n; i++) ctx.lineTo(zx0 + ((zx1 - zx0) * (i - 0.5)) / n, resY + (i % 2 ? -7 : 7));
      ctx.lineTo(zx1, resY);
      ctx.lineTo(xR, resY);
      ctx.stroke();
      ctx.restore();
      // left of the resistor, below the field's label (the top-right corner holds the figure's buttons)
      label(ctx, pal, `R = ${sci(st.R)} Ω`, xL - 8, resY, pal.ink, 'right', 12);
    }
    // the current: to the right along the rod, up the right rail, left through R, down the left rail
    if (now.v > 1e-6) {
      const c = pal.current;
      ctx.save();
      ctx.strokeStyle = withAlpha(c, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xL, cy0);
      ctx.lineTo(xL, rodY);
      ctx.moveTo(xR, cy0);
      ctx.lineTo(xR, rodY);
      ctx.stroke();
      ctx.restore();
      const mid = (cy0 + rodY) / 2;
      chevron(ctx, xR, mid, 0, -1, 7, c);
      chevron(ctx, xL, mid, 0, 1, 7, c);
      if (resY > 0) chevron(ctx, xL + (xR - xL) * 0.15, resY, -1, 0, 6, c);
      label(ctx, pal, narrow ? 'I' : `I = ${sci(railCurrent(P, now.v))} A`, xL - 8, mid, c, 'right', 12);
    }
    // the rod
    ctx.save();
    ctx.strokeStyle = pal.equip;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xL - 9, rodY);
    ctx.lineTo(xR + 9, rodY);
    ctx.stroke();
    ctx.restore();
    if (now.v > 1e-6) {
      chevron(ctx, (xL + xR) / 2 - 30, rodY, 1, 0, 7, pal.paper);
      chevron(ctx, (xL + xR) / 2 + 30, rodY, 1, 0, 7, pal.paper);
    }
    if (!narrow) label(ctx, pal, 'L', xL + (xR - xL) * 0.22, rodY - 12, pal.equip, 'center', 13);
    // forces at the rod's middle: the weight down, the magnetic force up
    const xm = (xL + xR) / 2;
    const full = Hs * 0.3;
    const lg = forceLen(P.F, full);
    arrow(ctx, xm - 10, rodY + 5, xm - 10, rodY + 5 + lg, { color: pal.force, width: 3, head: 11, glow: withAlpha(pal.paper, 0.9) });
    label(ctx, pal, narrow ? 'mg' : `mg = ${sci(P.F)} N`, xm - 16, rodY + 5 + lg - 4, pal.force, 'right', 12);
    const fb = railBrakingForce(P, now.v);
    if (fb > 1e-6) {
      const l = forceLen(fb, full);
      arrow(ctx, xm + 10, rodY - 5, xm + 10, rodY - 5 - l, { color: pal.force, width: 3, head: 11, glow: withAlpha(pal.paper, 0.9) });
      label(ctx, pal, narrow ? 'F_B' : `F_B = ${sci(fb)} N`, xm + 16, rodY - 5 - l + 4, pal.force, 'left', 12);
    }
    // the velocity, beside the right rail
    if (now.v > 1e-6) {
      const l = Math.min(1, now.v / Math.max(1, vAxisOf(st.segs))) * Hs * 0.25 + 8;
      const vx = Math.min(Wd - 12, xR + (narrow ? 22 : 46));
      arrow(ctx, vx, rodY, vx, rodY + l, { color: pal.ink, width: 2, head: 8 });
      label(ctx, pal, 'v', vx + 6, rodY + l - 4, pal.ink, 'left', 12);
    }
  };

  /** Horizontal rails from the side, on a table; a string over a pulley to a hanging mass; the field up. */
  const drawPulley = (ctx: CanvasRenderingContext2D, pal: Palette, Wd: number, Hs: number, st: State, now: ReturnType<typeof runAt>, P: RailRod) => {
    const narrow = Wd < 450;
    const yT = Hs * 0.56;
    const xe = Wd * 0.8;
    const r = 9;
    const rp = 11;
    const rx = Wd * 0.3;
    const ry = yT - r;
    const ppx = (Wd * 0.75) / SPAN;
    // the table, and its edge
    ctx.save();
    ctx.fillStyle = withAlpha(pal.ink3, 0.18);
    ctx.fillRect(0, yT, xe, Hs - yT);
    ctx.strokeStyle = pal.ink2;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, yT);
    ctx.lineTo(xe, yT);
    ctx.lineTo(xe, Hs);
    ctx.stroke();
    // ticks every metre along the rails: they slide past as the rod moves
    ctx.lineWidth = 1;
    ctx.strokeStyle = pal.ink3;
    for (let k = Math.floor(now.x - SPAN); k <= now.x + SPAN; k++) {
      if (k < 0) continue;
      const x = rx + (k - now.x) * ppx;
      if (x < 2 || x > xe - 4) continue;
      ctx.beginPath();
      ctx.moveTo(x, yT);
      ctx.lineTo(x, yT + 8);
      ctx.stroke();
    }
    ctx.restore();
    // the field, vertical, up
    const bcol = withAlpha(pal.bfield, 0.7);
    for (let k = 0; k < 4; k++) {
      const fx = Wd * (0.08 + 0.19 * k);
      const len = Hs * 0.2;
      arrow(ctx, fx, Hs * 0.34 + len / 2, fx, Hs * 0.34 - len / 2, { color: bcol, width: 1.6, head: 8 });
    }
    label(ctx, pal, `B = ${sci(st.B)} T`, 8, Hs * 0.08, pal.bfield, 'left');
    // the pulley at the table's corner, the string, and the hanging mass
    const pcx = xe;
    const pcy = ry + rp;
    const mx = pcx + rp;
    const my = Hs * 0.8;
    ctx.save();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(pcx, ry);
    ctx.arc(pcx, pcy, rp, -Math.PI / 2, 0);
    ctx.lineTo(mx, my - 13);
    ctx.stroke();
    // a break in the string: it is longer than drawn
    const bxm = (rx + pcx) / 2;
    ctx.strokeStyle = pal.ink2;
    for (const d of [-3, 3]) {
      ctx.beginPath();
      ctx.moveTo(bxm + d - 3, ry + 6);
      ctx.lineTo(bxm + d + 3, ry - 6);
      ctx.stroke();
    }
    ctx.strokeStyle = pal.equip;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pcx, pcy, rp, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = withAlpha(pal.equip, 0.25);
    ctx.fillRect(mx - 15, my - 13, 30, 26);
    ctx.strokeRect(mx - 15, my - 13, 30, 26);
    ctx.restore();
    label(ctx, pal, 'M', mx, my, pal.ink, 'center', 13);
    // the rod, end-on: moving right in a field up, its current is out of the page
    const moving = now.v > 1e-6;
    depthGlyph(ctx, rx, ry, r, 'out', moving ? pal.current : pal.equip, { fill: pal.paper, width: 2.4 });
    if (moving) label(ctx, pal, narrow ? 'I ⊙' : `I = ${sci(railCurrent(P, now.v))} A ⊙`, rx, ry + 26, pal.current, 'center', 12);
    // forces: the string's pull on the rod, the magnetic force, the hanging weight
    const full = Wd * 0.18;
    const T = pulleyTension(P, st.M, now.v);
    const lt = forceLen(T, full);
    arrow(ctx, rx + r + 2, ry - 12, rx + r + 2 + lt, ry - 12, { color: pal.force, width: 3, head: 11, glow: withAlpha(pal.paper, 0.9) });
    label(ctx, pal, narrow ? 'T' : `T = ${sci(T)} N`, rx + r + 6 + lt, ry - 12, pal.force, 'left', 12);
    const fb = railBrakingForce(P, now.v);
    if (fb > 1e-6) {
      const l = forceLen(fb, full);
      arrow(ctx, rx - r - 2, ry - 12, rx - r - 2 - l, ry - 12, { color: pal.force, width: 3, head: 11, glow: withAlpha(pal.paper, 0.9) });
      label(ctx, pal, narrow ? 'F_B' : `F_B = ${sci(fb)} N`, rx - r - 6 - l, ry - 12, pal.force, 'right', 12);
    }
    const lg = forceLen(P.F, Hs * 0.16);
    arrow(ctx, mx, my + 14, mx, my + 14 + lg, { color: pal.force, width: 3, head: 10 });
    label(ctx, pal, narrow ? 'Mg' : `Mg = ${sci(P.F)} N`, mx - 18, my + 14 + lg * 0.6, pal.force, 'right', 12);
  };

  const drawGraph = (ctx: CanvasRenderingContext2D, pal: Palette, box: { x: number; y: number; w: number; h: number }, st: State) => {
    const narrow = box.w < 300;
    const inner = insetBox(box, { l: 50, r: 8, t: 10, b: narrow ? 36 : 40 });
    const ax = axisOf(st.segs, st.T);
    const vmax = vAxisOf(st.segs);
    const plot = makePlot(inner, { min: 0, max: ax, label: 'הזמן t (שניות)', ticks: niceTicks(0, ax, narrow ? 4 : 5) }, { min: 0, max: vmax, label: 'v (מטר לשנייה)', ticks: niceTicks(0, vmax, 4) });
    drawAxes(ctx, plot, pal, { grid: true });
    // v_T and τ of the present segment
    const sg = segAt(st.segs, st.T);
    const vt = railTerminalSpeed(sg.p);
    ctx.save();
    ctx.strokeStyle = withAlpha(pal.accent, 0.85);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.px(sg.t0), plot.py(vt));
    ctx.lineTo(inner.x + inner.w, plot.py(vt));
    ctx.stroke();
    const tt = sg.t0 + railTimeConstant(sg.p);
    if (tt < ax) {
      ctx.strokeStyle = withAlpha(pal.hand, 0.5);
      ctx.beginPath();
      ctx.moveTo(plot.px(tt), inner.y + inner.h);
      ctx.lineTo(plot.px(tt), inner.y);
      ctx.stroke();
    }
    ctx.restore();
    label(ctx, pal, 'v_T', inner.x + inner.w - 4, plot.py(vt) - 9, pal.accent, 'right', 12);
    if (tt < ax) label(ctx, pal, 'τ', plot.px(tt) + 6, inner.y + 8, pal.hand, 'left', 13);
    // the run so far
    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y - 2, inner.w, inner.h + 4);
    ctx.clip();
    if (st.mode === 'fall') {
      // free fall from rest, v = g·t, for comparison
      const tEnd = Math.min(ax, vmax / freeFallSpeed(1));
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.ink2, 0.8);
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(plot.px(0), plot.py(0));
      ctx.lineTo(plot.px(tEnd), plot.py(freeFallSpeed(tEnd)));
      ctx.stroke();
      ctx.restore();
      // a legend in the empty bottom-right corner (the curve rises fast and stays high)
      ctx.save();
      ctx.font = `600 11px ${pal.fontUi}`;
      const lx = inner.x + inner.w - 4;
      const ly = inner.y + inner.h - 10;
      const tw = ctx.measureText('נפילה חופשית').width;
      ctx.fillStyle = pal.ink2;
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('נפילה חופשית', lx, ly);
      ctx.strokeStyle = withAlpha(pal.ink2, 0.8);
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(lx - tw - 26, ly);
      ctx.lineTo(lx - tw - 6, ly);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = pal.hand;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const n = 200;
    for (let i = 0; i <= n; i++) {
      const t = (st.T * i) / n;
      const v = runAt(st.segs, t).v;
      if (i === 0) ctx.moveTo(plot.px(t), plot.py(v));
      else ctx.lineTo(plot.px(t), plot.py(v));
    }
    ctx.stroke();
    ctx.restore();
    drawMarker(ctx, plot, st.T, runAt(st.segs, st.T).v, pal.hand, { radius: 4.5 });
  };

  const drawBars = (ctx: CanvasRenderingContext2D, pal: Palette, box: { x: number; y: number; w: number; h: number }, st: State, now: ReturnType<typeof runAt>) => {
    const W0 = runWork(st.segs, st.T);
    const k0 = kinetic(st.segs[0].p.m, st.segs[0].s0.v);
    const k = kinetic(segAt(st.segs, st.T).p.m, now.v);
    const total = Math.max(k0 + W0, 1e-9);
    const top = box.y + 30;
    const base = box.y + box.h - 40;
    const hmax = base - top;
    const bw = Math.min(46, box.w * 0.28);
    const cols: { x: number; name: string; parts: [number, string, string][] }[] = [
      { x: box.x + box.w * 0.3, name: 'נכנס', parts: [[k0, pal.accent, 'K₀'], [W0, pal.force, 'W']] },
      { x: box.x + box.w * 0.72, name: 'עכשיו', parts: [[k, pal.accent, 'K'], [now.heat, pal.efield, 'Q']] },
    ];
    ctx.save();
    ctx.strokeStyle = pal.ink3;
    ctx.beginPath();
    ctx.moveTo(box.x + 4, base);
    ctx.lineTo(box.x + box.w - 4, base);
    ctx.stroke();
    ctx.restore();
    for (const c of cols) {
      let y = base;
      for (const [val, color, name] of c.parts) {
        const h = (Math.max(0, val) / total) * hmax;
        if (h > 0.5) {
          ctx.save();
          ctx.fillStyle = withAlpha(color, 0.7);
          ctx.strokeStyle = color;
          ctx.fillRect(c.x - bw / 2, y - h, bw, h);
          ctx.strokeRect(c.x - bw / 2, y - h, bw, h);
          ctx.restore();
          if (h > 15) label(ctx, pal, name, c.x, y - h / 2, pal.ink, 'center', 12);
        }
        y -= h;
      }
      ctx.save();
      ctx.font = `600 12px ${pal.fontUi}`;
      ctx.fillStyle = pal.ink;
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(c.name, c.x, base + 6);
      ctx.restore();
    }
    label(ctx, pal, `${sci(total)} J`, box.x + box.w * 0.51, top - 14, pal.ink2, 'center', 11);
    label(ctx, pal, '=', box.x + box.w * 0.51, base - hmax / 2, pal.ink2, 'center', 16);
  };

  const draw = ({ ctx, view, palette: pal, t: clock }: FrameInfo) => {
    const st = sRef.current;
    const dt = Math.max(0, Math.min(0.1, clock - lastClock.current));
    lastClock.current = clock;
    if (st.running && motionAllowed() && dt > 0) {
      const ax = axisOf(st.segs, st.T);
      st.T = Math.min(ax, st.T + dt * rateOf(ax));
      checkProgress(st);
      if (clock - lastPush.current > 0.1 || st.T >= ax) {
        lastPush.current = clock;
        const T = st.T;
        setS((prev) => ({ ...prev, T, running: prev.running && T < ax }));
      }
    }
    const Wd = view.w;
    const H = view.h;
    const Hs = H * 0.47;
    const now = runAt(st.segs, st.T);
    const P = segAt(st.segs, st.T).p;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, Wd, Hs + 2);
    ctx.clip();
    if (st.mode === 'flat') drawFlat(ctx, pal, Wd, Hs, st, now, P);
    else if (st.mode === 'incline') drawIncline(ctx, pal, Wd, Hs, st, now, P);
    else if (st.mode === 'fall') drawFall(ctx, pal, Wd, Hs, st, now, P);
    else drawPulley(ctx, pal, Wd, Hs, st, now, P);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = pal.rule;
    ctx.beginPath();
    ctx.moveTo(0, Hs + 4);
    ctx.lineTo(Wd, Hs + 4);
    ctx.stroke();
    ctx.restore();
    drawGraph(ctx, pal, { x: 0, y: Hs + 8, w: Wd * 0.68, h: H - Hs - 8 }, st);
    drawBars(ctx, pal, { x: Wd * 0.68, y: Hs + 8, w: Wd * 0.32, h: H - Hs - 8 }, st, now);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: s.running });
  useEffect(invalidate, [s]);

  /* ------------------------------------------------------------------ panel */

  const start = () =>
    act((prev) => {
      if (prev.running) return { ...prev, running: false };
      const ax = axisOf(prev.segs, prev.T);
      if (prev.T >= ax - 1e-9) {
        pullOffV.current = null;
        return { ...freshRun(prev), running: true };
      }
      return { ...prev, running: true };
    });

  const togglePull = () =>
    act((prev) => {
      const v = runAt(prev.segs, prev.T).v;
      pullOffV.current = prev.pull && v > 0.2 ? v : null;
      return withParams(prev, { pull: !prev.pull });
    });

  const flipField = () =>
    act((prev) => {
      if (runAt(prev.segs, prev.T).v > 0.1) done('flip-field');
      return withParams(prev, { dirB: prev.dirB === 'in' ? 'out' : 'in' });
    });

  const rate = rateOf(axis);
  const driveName = s.mode === 'flat' ? 'עבודת הכוח F' : s.mode === 'pulley' ? 'עבודת הכובד על M' : 'עבודת הכובד';
  const sliderB = <Slider label="השדה B" value={s.B} min={0.4} max={1} step={0.1} format={(v) => `${sci(v)} T`} onChange={(v) => setParam({ B: round(v, 0.1) })} />;
  const sliderR = <Slider label="ההתנגדות R" value={s.R} min={0.5} max={4} step={0.5} format={(v) => `${sci(v)} Ω`} onChange={(v) => setParam({ R: round(v, 0.5) })} />;
  const sliderM = <Slider label="מסת המוט m" value={s.m} min={0.05} max={0.5} step={0.05} format={(v) => `${sci(v)} kg`} onChange={(v) => setMass({ m: round(v, 0.05) })} />;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${describe()}`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onReset={() => {
        userRun.current = false;
        pullOffV.current = null;
        setS(freshRun(params()));
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            <b class="q">t = {sci(s.T)} s</b>, <b class="q">v = {sci(cur.v)} m/s</b>
            {rate > 1.05 && <> (הזמן באיור רץ מהר פי {sci(rate, 2)})</>}
            {rate < 0.95 && <> (הזמן באיור רץ לאט פי {sci(1 / rate, 2)})</>}
          </span>
          <span>
            הכא״מ <b class="q">ε = {s.mode === 'incline' && s.field === 'vertical' ? 'B·cosα·Lv' : 'BLv'} = {sci(emf)} V</b>, הזרם <b class="q">I = ε/R = {sci(I)} A</b>
            {s.mode === 'flat' && cur.v > 1e-6 && <> ({currentUp ? 'במוט למעלה בדף, נגד כיוון השעון' : 'במוט למטה בדף, עם כיוון השעון'})</>}
          </span>
          <span>
            הכוח המגנטי על המוט, נגד התנועה: <b class="q">F_B = {sci(FB)} N</b>; הכוח המניע <b class="q">{DRIVE_NAME[s.mode]} = {sci(p.F)} N</b>
            {s.mode === 'pulley' && <>, המתיחות בחוט <b class="q">T = {sci(pulleyTension(p, s.M, cur.v))} N</b></>}
          </span>
          <span>
            המהירות הסופית <b class="q">v_T = {sci(vT)} m/s</b>, <b class="q">τ = {sci(tau)} s</b>
            {atTerminal && <> · המוט כמעט במהירות הסופית</>}
          </span>
          <span>
            ההספק: <b class="q">{DRIVE_NAME[s.mode]}·v = {sci(pw.drive)} W</b>, בנגד <b class="q">I²R = {sci(pw.joule)} W</b>
          </span>
          <span>
            האנרגיה: <b class="q">K₀ + W = {sci(K0 + W)} J</b> ({driveName} <b class="q">W = {sci(W)} J</b>), <b class="q">K + Q = {sci(K + cur.heat)} J</b> (חום בנגד <b class="q">Q = {sci(cur.heat)} J</b>)
          </span>
        </>
      }
      controls={
        <>
          {modes.length > 1 && (
            <div class="group" role="group" aria-label="המצב">
              {modes.map((m) => (
                <button
                  type="button"
                  key={m}
                  class={`toggle ${s.mode === m ? 'on' : ''}`}
                  aria-pressed={s.mode === m}
                  onClick={() =>
                    act((prev) => {
                      pullOffV.current = null;
                      const q: Params = { ...prev, mode: m, ...MODE_DEFAULTS[m], M: 0.05, pull: true };
                      return freshRun(q);
                    })
                  }
                >
                  {MODE_NAME[m]}
                </button>
              ))}
            </div>
          )}
          <div class="group" role="group" aria-label="התנועה">
            <button type="button" class={`toggle ${s.running ? 'on' : ''}`} aria-pressed={s.running} onClick={start}>
              {s.running ? 'עצרו' : s.T >= axis - 1e-9 ? 'מההתחלה' : s.mode === 'flat' ? 'הפעילו' : s.mode === 'pulley' ? 'שחררו את המערכת' : 'שחררו את המוט'}
            </button>
            {s.mode === 'flat' && (
              <>
                <button type="button" class="toggle" onClick={togglePull}>
                  {s.pull ? 'הסירו את הכוח F' : 'החזירו את הכוח F'}
                </button>
                <button type="button" class="toggle" onClick={flipField}>
                  השדה: {s.dirB === 'in' ? '⊗ לתוך הדף' : '⊙ החוצה מהדף'}
                </button>
              </>
            )}
            {s.mode === 'incline' && (
              <button type="button" class="toggle" onClick={() => setParam({ field: s.field === 'normal' ? 'vertical' : 'normal' })}>
                השדה: {s.field === 'normal' ? 'ניצב למסילות' : 'אנכי'}
              </button>
            )}
          </div>
          <Slider
            label="הזמן t"
            value={Math.min(s.T, axis)}
            min={0}
            max={axis}
            step={axis / 200}
            format={(v) => `${sci(v)} s`}
            onChange={(v) =>
              act((prev) => {
                const T = clamp(v, 0, axisOf(prev.segs, prev.T));
                return { ...prev, T, running: false };
              })
            }
          />
          {s.mode === 'flat' && <Slider label="הכוח F" value={s.F} min={0.1} max={1} step={0.1} format={(v) => `${sci(v)} N`} onChange={(v) => setParam({ F: round(v, 0.1) })} />}
          {s.mode === 'incline' && (
            <Slider label="זווית השיפוע α" value={s.alpha} min={10} max={45} step={5} format={(v) => `${v}°`} onChange={(v) => setParam({ alpha: round(v, 5) })} />
          )}
          {s.mode === 'pulley' && (
            <Slider label="המסה התלויה M" value={s.M} min={0.02} max={0.2} step={0.01} format={(v) => `${sci(v)} kg`} onChange={(v) => setMass({ M: round(v, 0.01) })} />
          )}
          {sliderB}
          {sliderR}
          {sliderM}
        </>
      }
    />
  );
}
