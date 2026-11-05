/**
 * Faraday's bench: a short coil of N turns wired to a zero-centre galvanometer, and on the coil's axis
 * either a bar magnet the learner drags (or pushes with a button) or a second coil with a battery and a
 * switch. Under the bench, two live graphs over the last few seconds: the flux through each turn, Φ(t),
 * and the induced emf, ε(t). Built for lesson 5.2.
 *
 * Every number is src/physics: the flux by `magnetFlux` / `coilCoilFlux` (faraday.ts), the emf of each
 * frame by `averageEmf` (induction.ts) over that frame, so ε is −N times the slope of the Φ graph by
 * construction; the slope readout on a frozen graph is `secantSlope` (calculus.ts) on the recorded Φ(t).
 *
 * Sign convention (chapter 5): the coil's normal n̂ points along +x unless flipped; its positive sense
 * is tied to n̂ by the right-hand rule, Φ is measured along n̂, and ε > 0 drives current in the positive
 * sense. Flipping n̂ flips the signs of Φ and ε on the graphs, never the galvanometer: the needle shows
 * the physical current (right = counter-clockwise seen from +x).
 *
 * Time runs while motion is allowed. In still mode a push or a switch is computed at once (the whole
 * trace appears), dragging records at the pace of the pointer, and nothing moves while the learner
 * does nothing.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { secantSlope } from '~/physics/calculus';
import { coilCoilFlux, magnetFlux } from '~/physics/faraday';
import { averageEmf } from '~/physics/induction';
import { solenoidFieldAt, traceLine } from '~/physics/magnetism';
import { barMagnetField, type BarMagnet } from '~/physics/magnets';
import type { Vec2 } from '~/physics/vec';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

/* ------------------------------------------------------------------ the apparatus */

/** width / height of the stage */
const ASPECT = 0.9;
/** world span drawn across the bench [m], and its left edge */
const WORLD_W = 0.44;
const X_LEFT = -0.25;
/** the coil: radius b, drawn length (its turns are packed in one plane in the model) */
const B_COIL = 0.03;
const COIL_LEN = 0.016;
/** the bar magnet */
const MAG_L = 0.08;
const MAG_R = 0.01;
const MAG_NI = 12000;
const X_MIN = -0.21;
const X_MAX = 0.15;
const X_FAR = -0.2;
/** the source coil of the second experiment: Np turns, radius a, I0 when the switch is closed */
const NP = 400;
const A_SRC = 0.025;
const I0 = 3;
const XS_MIN = -0.2;
const XS_MAX = -0.04;
const XS_START = -0.05;
/** the current in the source coil does not jump: it rises (or collapses) over a short time [s] */
const TAU_ON = 0.08;
const TAU_OFF = 0.04;
/** resistance of the whole circuit: coil, leads and meter [Ω] */
const R_CIRCUIT = 20;
/** a hand follows the pointer with this lag [s] */
const TAU_HAND = 0.06;
/** the graphs show this many seconds */
const WINDOW = 6;
const DT_SIM = 1 / 120;
/** graph scales per experiment: flux [Wb] and emf [V] */
const PHI_SCALE = { magnet: 6e-5, coils: 8e-6 };
const EMF_SCALE = { magnet: 0.3, coils: 0.04 };
/** the galvanometer reaches the end of its scale where the emf graph does (a more sensitive meter for the coils) [A] */
const iFull = (mode: Mode) => EMF_SCALE[mode] / R_CIRCUIT;
/** an emf this large counts as "the needle moved" for a task [V] */
const E_TASK = 0.01;

type Mode = 'magnet' | 'coils';

const TASK_LABEL: Record<string, string> = {
  'push-in': 'גררו את המגנט אל תוך הסליל, או לחצו "הכניסו את המגנט". לאיזה צד זז המחוג?',
  hold: 'השאירו את המגנט בתוך הסליל ועזבו אותו. מה מראה הגלוונומטר עכשיו?',
  'pull-out': 'הוציאו את המגנט מהסליל. לאיזה צד זז המחוג עכשיו?',
  faster: 'הכניסו את המגנט מהר יותר: קצרו את משך התנועה ל-0.2 שניות, או גררו מהר. מה קורה לכא״מ?',
  turns: 'שנו את מספר הכריכות N, והכניסו את המגנט שוב. מה קורה לכא״מ?',
  'switch-on': 'סגרו את המפסק של הסליל השמאלי. מתי זז המחוג, ומתי הוא חוזר לאפס?',
  'switch-off': 'אחרי שהזרם התייצב, פתחו את המפסק. לאיזה צד זז המחוג עכשיו?',
  'read-slope': 'עצרו את הגרף, והזיזו את הסמן לרגע שבו הכא״מ גדול. השוו את שיפוע הגרף של Φ לכא״מ.',
  'flip-normal': 'הפכו את האנך. מה קורה לסימנים של Φ ושל ε, ומה קורה למחוג?',
};

export interface FaradayBenchProps {
  id: string;
  mode?: Mode;
  /** turns of the coil on the bench */
  N?: number;
  /** magnet centre [m] (the coil is at 0) */
  x?: number;
  tasks?: string[];
}

interface Run {
  kind: 'move';
  from: number;
  to: number;
  /** duration [s] */
  T: number;
  /** time since the run started; negative while it waits */
  t: number;
  phi0: number;
}

interface Sample {
  t: number;
  /** flux through one turn along +x [Wb] */
  phi: number;
  /** emf along the +x normal's positive sense [V] */
  emf: number;
}

interface Sim {
  mode: Mode;
  N: number;
  flipMagnet: boolean;
  flipNormal: boolean;
  /** magnet centre, and the source coil's position [m] */
  x: number;
  xs: number;
  /** where the hand is pulling the dragged source to [m] */
  target: number;
  switchOn: boolean;
  Ip: number;
  run: Run | null;
  clock: number;
  samples: Sample[];
  frozen: boolean;
  /** cursor time on a frozen graph [s] */
  cursor: number;
  /** the learner, not a text step, produced the present motion: only then may a task tick */
  user: boolean;
  dragging: boolean;
  /** how long the magnet has rested inside the coil [s] */
  rest: number;
  pushedIn: boolean;
  last: { dPhi: number; T: number; emf: number } | null;
}

const magnetOf = (s: { x: number; flipMagnet: boolean }): BarMagnet => ({
  x: s.x,
  y: 0,
  angle: s.flipMagnet ? Math.PI : 0,
  L: MAG_L,
  R: MAG_R,
  NI: MAG_NI,
});

/** flux through one turn of the bench coil, along +x */
const fluxOf = (s: Sim): number =>
  s.mode === 'magnet' ? magnetFlux(magnetOf(s), B_COIL) : coilCoilFlux(NP, s.Ip, A_SRC, s.xs, B_COIL);

const clampX = (x: number) => Math.max(X_MIN, Math.min(X_MAX, x));
const clampXs = (x: number) => Math.max(XS_MIN, Math.min(XS_MAX, x));
const smooth = (u: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, u)))) / 2;

const mV = (e: number) => `${sci(Math.abs(e) < 5e-6 ? 0 : e * 1e3)} mV`;
const mA = (i: number) => `${sci(Math.abs(i) < 5e-7 ? 0 : i * 1e3)} mA`;
const uWb = (p: number) => `${sci(Math.abs(p) < 5e-10 ? 0 : p * 1e6)} μWb`;
const cm = (x: number) => `${sci(Math.round(x * 1000) / 10)} cm`;

/** Φ at time t on the record, by linear interpolation between samples */
function phiAt(samples: readonly Sample[], t: number): number {
  if (samples.length === 0) return 0;
  if (t <= samples[0].t) return samples[0].phi;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].t >= t) {
      const a = samples[i - 1];
      const b = samples[i];
      const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return a.phi + f * (b.phi - a.phi);
    }
  }
  return samples[samples.length - 1].phi;
}

/**
 * the emf at time t on the record: each sample's emf is the average over the step that ends at its
 * time, so it belongs to the middle of that step; interpolate between those middles
 */
function emfAt(samples: readonly Sample[], t: number): number {
  let prevMid = -Infinity;
  let prevEmf = 0;
  for (let i = 1; i < samples.length; i++) {
    const mid = (samples[i - 1].t + samples[i].t) / 2;
    const e = samples[i].emf;
    if (mid >= t) {
      if (!Number.isFinite(prevMid)) return e;
      const f = (t - prevMid) / (mid - prevMid);
      return prevEmf + f * (e - prevEmf);
    }
    prevMid = mid;
    prevEmf = e;
  }
  return prevEmf;
}

/** the slope of the recorded Φ(t) at t, as a secant across ±5 ms [Wb/s] */
const slopeAt = (samples: readonly Sample[], t: number): number => secantSlope((u) => phiAt(samples, u), t - 0.005, 0.01);

/** field lines of a source in its own frame (centred at 0), traced once */
function traceSourceLines(field: (x: number, y: number) => Vec2, halfWidth: number): Vec2[][] {
  const bounds = { xmin: -0.3, xmax: 0.3, ymin: -0.14, ymax: 0.14 };
  const out: Vec2[][] = [];
  for (const f of [0.2, 0.5, 0.8]) {
    for (const sgn of [1, -1]) {
      const seed: Vec2 = [0, sgn * f * halfWidth];
      const fwd = traceLine(field, seed, { bounds, step: 0.003, maxSteps: 900, direction: 1 });
      if (fwd.end === 'closed') {
        out.push(fwd.points);
        continue;
      }
      const back = traceLine(field, seed, { bounds, step: 0.003, maxSteps: 900, direction: -1 });
      out.push([...back.points.slice(1).reverse(), ...fwd.points]);
    }
  }
  return out;
}

export default function FaradayBench(props: FaradayBenchProps) {
  const N0 = props.N ?? 200;
  const fresh = (patch: Partial<Sim> = {}): Sim => {
    const s: Sim = {
      mode: props.mode ?? 'magnet',
      N: N0,
      flipMagnet: false,
      flipNormal: false,
      x: props.x ?? X_FAR,
      xs: XS_START,
      target: 0,
      switchOn: false,
      Ip: 0,
      run: null,
      clock: 0,
      samples: [],
      frozen: false,
      cursor: 0,
      user: false,
      dragging: false,
      rest: 0,
      pushedIn: false,
      last: null,
      ...patch,
    };
    s.Ip = s.switchOn ? I0 : 0;
    s.target = s.mode === 'magnet' ? s.x : s.xs;
    // a quiet stretch already on the record, so the graphs are never empty
    seed(s, 1.5);
    return s;
  };

  const sim = useRef<Sim | null>(null);
  if (!sim.current) sim.current = fresh();
  const [, setTick] = useState(0);
  const [live, setLive] = useState('');
  const [duration, setDuration] = useState(0.6);
  const lastClock = useRef(0);
  const lastSync = useRef(0);
  const lastPointer = useRef(0);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t);
  const done = (t: string) => {
    if (has(t)) markTask(`${props.id}:${t}`);
  };
  const sync = () => setTick((k) => k + 1);

  const magnetLines = useMemo(
    () => traceSourceLines((x, y) => barMagnetField({ x: 0, y: 0, angle: 0, L: MAG_L, R: MAG_R, NI: MAG_NI }, x, y), MAG_R),
    [],
  );
  const coilLines = useMemo(
    () => traceSourceLines((x, y) => solenoidFieldAt({ x0: 0, y0: 0, L: 0.012, R: A_SRC, N: NP, I: I0 }, x, y, 6), A_SRC),
    [],
  );

  /** advance the bench by dt of figure time and record a sample */
  function advance(s: Sim, dt: number) {
    if (dt <= 0) return;
    const phi0 = s.samples.length ? s.samples[s.samples.length - 1].phi : fluxOf(s);
    const x0 = s.x;
    if (s.run) {
      const r = s.run;
      r.t += dt;
      const pos = r.from + (r.to - r.from) * smooth(r.t / r.T);
      if (s.mode === 'magnet') s.x = pos;
      else s.xs = pos;
      s.target = pos;
      if (r.t >= r.T) {
        s.run = null;
        const phi1 = fluxOf(s);
        s.last = { dPhi: phi1 - r.phi0, T: r.T, emf: averageEmf(s.N, r.phi0, phi1, r.T) };
        if (s.user && r.T <= 0.25 + 1e-9 && Math.abs(r.to - r.from) >= 0.1) done('faster');
      }
    } else {
      const cur = s.mode === 'magnet' ? s.x : s.xs;
      if (cur !== s.target) {
        let nx = s.target + (cur - s.target) * Math.exp(-dt / TAU_HAND);
        if (Math.abs(nx - s.target) < 2e-5) nx = s.target;
        if (s.mode === 'magnet') s.x = nx;
        else s.xs = nx;
      }
    }
    const Itarget = s.mode === 'coils' && s.switchOn ? I0 : 0;
    if (s.Ip !== Itarget) {
      s.Ip = Itarget + (s.Ip - Itarget) * Math.exp(-dt / (s.switchOn ? TAU_ON : TAU_OFF));
      if (Math.abs(s.Ip - Itarget) < 1e-4 * I0) s.Ip = Itarget;
    }
    s.clock += dt;
    const phi1 = fluxOf(s);
    const emf = averageEmf(s.N, phi0, phi1, dt);
    s.samples.push({ t: s.clock, phi: phi1, emf: Math.abs(emf) < 1e-12 ? 0 : emf });
    while (s.samples.length > 2 && s.samples[1].t < s.clock - WINDOW - 0.2) s.samples.shift();
    if (s.user) checkMotion(s, phi0, phi1, emf, dt, (s.x - x0) / dt);
  }

  function seed(s: Sim, seconds: number) {
    const n = Math.round(seconds / DT_SIM);
    const user = s.user;
    s.user = false;
    for (let i = 0; i < n; i++) advance(s, DT_SIM);
    s.user = user;
  }

  /** the tasks a learner's own motion can complete */
  function checkMotion(s: Sim, phi0: number, phi1: number, emf: number, dt: number, v: number) {
    if (s.mode !== 'magnet') return;
    const big = Math.abs(emf) > E_TASK;
    if (big && Math.abs(phi1) > Math.abs(phi0)) {
      s.pushedIn = true;
      done('push-in');
      if (s.N !== N0) done('turns');
    }
    if (big && Math.abs(phi1) < Math.abs(phi0) && s.pushedIn) done('pull-out');
    // the standard push (0.6 s) peaks at about 0.5 m/s
    if (big && Math.abs(v) > 0.8) done('faster');
    if (Math.abs(s.x) < B_COIL && !s.run && !s.dragging && s.x === s.target) {
      s.rest += dt;
      if (s.rest >= 0.5) done('hold');
    } else s.rest = 0;
  }

  /** run the bench for `seconds` at once (still mode, or a step that must show its whole trace) */
  function runNow(s: Sim, seconds: number) {
    const n = Math.round(seconds / DT_SIM);
    for (let i = 0; i < n; i++) advance(s, DT_SIM);
  }

  /** the time a still-mode action plays: a run plus a quiet tail, or the switch settling */
  const settleTime = (s: Sim) => (s.run ? Math.max(0, -s.run.t) + s.run.T + 0.8 : 0.8);

  /** start a push of the source to `to`, after `delay` seconds */
  function startRun(s: Sim, to: number, T: number, delay = 0) {
    const from = s.mode === 'magnet' ? s.x : s.xs;
    s.run = { kind: 'move', from, to, T, t: -delay, phi0: 0 };
    // the average is taken over the motion itself, so remember the flux when it starts moving
    s.run.phi0 = fluxOf(s);
  }

  /** after a learner's action: in still mode play it at once */
  function afterAction(s: Sim) {
    if (!motionAllowed()) runNow(s, settleTime(s));
    sync();
  }

  // text steps: rebuild the bench from the step's state, never ticking a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        const patch: Partial<Sim> = {};
        if (st.mode === 'magnet' || st.mode === 'coils') patch.mode = st.mode;
        if (typeof st.N === 'number') patch.N = st.N;
        if (typeof st.x === 'number') patch.x = clampX(st.x);
        if (typeof st.xs === 'number') patch.xs = clampXs(st.xs);
        if (typeof st.flipMagnet === 'boolean') patch.flipMagnet = st.flipMagnet;
        if (typeof st.flipNormal === 'boolean') patch.flipNormal = st.flipNormal;
        if (typeof st.switch === 'boolean') patch.switchOn = st.switch;
        const s = fresh(patch);
        const T = typeof st.T === 'number' ? st.T : 0.6;
        if (st.run === 'in') startRun(s, 0, T, 0.5);
        else if (st.run === 'out') startRun(s, X_FAR, T, 0.5);
        else if (st.run === 'switch-on') s.switchOn = true;
        else if (st.run === 'switch-off') s.switchOn = false;
        if (st.frozen === true || !motionAllowed()) runNow(s, settleTime(s));
        if (st.frozen === true) {
          s.frozen = true;
          let peak = s.samples[0];
          for (const q of s.samples) if (Math.abs(q.emf) > Math.abs(peak.emf)) peak = q;
          s.cursor = peak.t;
        }
        setDuration(T);
        sim.current = s;
        sync();
      }),
    [props.id],
  );

  /* ------------------------------------------------------------------ drawing */

  const draw = ({ ctx, view, palette: p, t: clock }: FrameInfo) => {
    const s = sim.current!;
    const dt = Math.max(0, Math.min(0.05, clock - lastClock.current));
    lastClock.current = clock;
    if (!s.frozen && motionAllowed() && dt > 0) {
      // split a long frame so the hand and the switch stay smooth
      const k = Math.max(1, Math.ceil(dt / DT_SIM));
      for (let i = 0; i < k; i++) advance(s, dt / k);
      if (clock - lastSync.current > 0.15) {
        lastSync.current = clock;
        sync();
      }
    }
    const W = view.w;
    const H = view.h;
    const ppm = W / WORLD_W;
    const benchH = H * 0.47;
    const axisY = benchH * 0.66;
    const sx = (x: number) => (x - X_LEFT) * ppm;
    drawBench(ctx, p, s, { W, benchH, axisY, ppm, sx }, magnetLines, coilLines);
    drawGraphs(ctx, p, s, { W, H, top: benchH });
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_W / ASPECT, animate: true });
  useEffect(invalidate);

  /* ------------------------------------------------------------------ input */

  const s = sim.current!;
  const sourcePos = s.mode === 'magnet' ? s.x : s.xs;

  const hitSource = (ex: number, ey: number): boolean => {
    const v = viewRef.current;
    if (!v) return false;
    const ppm = v.w / WORLD_W;
    const axisY = v.h * 0.47 * 0.66;
    const cx = (sourcePos - X_LEFT) * ppm;
    const halfW = (s.mode === 'magnet' ? MAG_L / 2 : 0.012) * ppm + 14;
    const halfH = (s.mode === 'magnet' ? MAG_R : A_SRC) * ppm + 14;
    return Math.abs(ex - cx) <= halfW && Math.abs(ey - axisY) <= halfH;
  };

  const hitSwitch = (ex: number, ey: number): boolean => {
    const v = viewRef.current;
    if (!v || s.mode !== 'coils') return false;
    const sw = switchBox(v.w, v.h * 0.47, v.w / WORLD_W, s.xs);
    return Math.abs(ex - sw.x) < 26 && Math.abs(ey - sw.y) < 20;
  };

  const userAct = () => {
    const st = sim.current!;
    st.user = true;
    if (st.frozen) st.frozen = false;
    return st;
  };

  const toggleSwitch = () => {
    const st = userAct();
    st.switchOn = !st.switchOn;
    if (st.switchOn) done('switch-on');
    else if (st.Ip > 0.5 * I0) done('switch-off');
    setLive(st.switchOn ? 'המפסק נסגר: הזרם בסליל השמאלי עולה.' : 'המפסק נפתח: הזרם בסליל השמאלי נעלם.');
    afterAction(st);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (hitSwitch(e.offsetX, e.offsetY)) {
      toggleSwitch();
      return;
    }
    if (!hitSource(e.offsetX, e.offsetY)) return;
    const st = userAct();
    st.run = null;
    st.dragging = true;
    lastPointer.current = performance.now();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sync();
  };
  const onPointerMove = (e: PointerEvent) => {
    const st = sim.current!;
    const v = viewRef.current;
    if (!v || !st.dragging) return;
    const ppm = v.w / WORLD_W;
    const wx = X_LEFT + e.offsetX / ppm;
    st.target = st.mode === 'magnet' ? clampX(wx) : clampXs(wx);
    if (!motionAllowed()) {
      // still mode: record at the pace of the pointer
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastPointer.current) / 1000);
      lastPointer.current = now;
      const k = Math.max(1, Math.ceil(dt / DT_SIM));
      for (let i = 0; i < k; i++) advance(st, dt / k);
      sync();
    }
  };
  const onPointerUp = () => {
    const st = sim.current!;
    if (!st.dragging) return;
    st.dragging = false;
    if (!motionAllowed()) runNow(st, 0.8);
    setLive(describe(st));
    sync();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && sim.current!.mode === 'coils') {
      e.preventDefault();
      toggleSwitch();
      return;
    }
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const st = userAct();
    const cur = st.mode === 'magnet' ? st.x : st.xs;
    const to = st.mode === 'magnet' ? clampX(cur + d * (e.shiftKey ? 0.05 : 0.01)) : clampXs(cur + d * (e.shiftKey ? 0.05 : 0.01));
    startRun(st, to, e.shiftKey ? 0.3 : 0.15);
    afterAction(st);
    setLive(describe(st));
  };

  const push = (to: number) => {
    const st = userAct();
    if (st.mode !== 'magnet') return;
    startRun(st, to, duration);
    afterAction(st);
    setLive(describe(st));
  };

  /* ------------------------------------------------------------------ readouts */

  const sign = s.flipNormal ? -1 : 1;
  const now = s.samples[s.samples.length - 1];
  const phiShown = sign * (s.frozen ? phiAt(s.samples, s.cursor) : now.phi);
  const emfShown = sign * (s.frozen ? emfAt(s.samples, s.cursor) : now.emf);
  const slope = s.frozen ? sign * slopeAt(s.samples, s.cursor) : 0;
  const tStart = Math.max(0, s.clock - WINDOW);

  function describe(st: Sim): string {
    const e = st.samples[st.samples.length - 1];
    const where =
      st.mode === 'magnet'
        ? Math.abs(st.x) < B_COIL
          ? 'המגנט בתוך הסליל'
          : `המגנט במרחק ${cm(Math.abs(st.x))} ממרכז הסליל`
        : `הזרם בסליל השמאלי ${sci(st.Ip)} אמפר`;
    return `${where}. השטף דרך כל כריכה ${uWb((st.flipNormal ? -1 : 1) * e.phi)}, הכא״מ המושרה ${mV((st.flipNormal ? -1 : 1) * e.emf)}.`;
  }

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: סליל של ${s.N} כריכות מחובר לגלוונומטר, ${s.mode === 'magnet' ? 'ומגנט מוט על הציר שלו' : 'וסליל שני עם סוללה ומפסק על אותו ציר'}. מתחת: גרף של השטף דרך כל כריכה, וגרף של הכא״מ המושרה, בשש השניות האחרונות. ${describe(s)} גררו את ${s.mode === 'magnet' ? 'המגנט' : 'הסליל השמאלי'}; במקלדת: חיצים ימינה ושמאלה${s.mode === 'coils' ? ', ורווח סוגר או פותח את המפסק' : ''}.`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor="grab"
      onReset={() => {
        sim.current = fresh();
        setDuration(0.6);
        setLive('האיור אופס.');
        sync();
        invalidate();
      }}
      readout={
        <>
          <span>
            {s.mode === 'magnet' ? (
              <>
                המגנט: <b class="q">{Math.abs(s.x) < 5e-4 ? 'במרכז הסליל' : `${cm(Math.abs(s.x))} ${s.x < 0 ? 'משמאל למרכז הסליל' : 'מימין למרכז הסליל'}`}</b>
              </>
            ) : (
              <>
                הזרם בסליל השמאלי: <b class="q">{sci(Math.abs(s.Ip) < 1e-3 ? 0 : s.Ip)} A</b>
              </>
            )}
          </span>
          <span>
            {s.frozen ? 'ברגע שעל הסמן, ' : ''}השטף דרך כל כריכה: <b class="q">Φ = {uWb(phiShown)}</b>
          </span>
          <span>
            הכא״מ המושרה: <b class="q">ε = {mV(emfShown)}</b>
          </span>
          <span>
            הזרם המושרה: <b class="q">I = ε/R = {mA(emfShown / R_CIRCUIT)}</b> (R = {R_CIRCUIT} Ω)
          </span>
          {s.frozen && (
            <span>
              שיפוע הגרף של Φ על הסמן: <b class="q">ΔΦ/Δt = {sci(Math.abs(slope) < 1e-9 ? 0 : slope * 1e3)} mWb/s</b>, ולכן{' '}
              <b class="q">−N·ΔΦ/Δt = {mV(-s.N * slope)}</b>
            </span>
          )}
          {!s.frozen && s.mode === 'magnet' && s.last && (
            <span>
              התנועה האחרונה: <b class="q">ΔΦ = {uWb(sign * s.last.dPhi)}</b> ב-<b class="q">Δt = {sci(s.last.T)} s</b>, ממוצע{' '}
              <b class="q">−NΔΦ/Δt = {mV(sign * s.last.emf)}</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="הניסוי">
            {(['magnet', 'coils'] as Mode[]).map((m) => (
              <button
                type="button"
                key={m}
                class={`toggle ${s.mode === m ? 'on' : ''}`}
                aria-pressed={s.mode === m}
                onClick={() => {
                  if (s.mode === m) return;
                  sim.current = fresh({ mode: m, N: s.N, flipNormal: s.flipNormal, user: true });
                  sync();
                }}
              >
                {m === 'magnet' ? 'מגנט וסליל' : 'שני סלילים'}
              </button>
            ))}
          </div>
          {s.mode === 'magnet' ? (
            <div class="group" role="group" aria-label="המגנט">
              <button type="button" class="toggle" onClick={() => push(0)}>
                הכניסו את המגנט
              </button>
              <button type="button" class="toggle" onClick={() => push(X_FAR)}>
                הוציאו את המגנט
              </button>
              <button
                type="button"
                class={`toggle ${s.flipMagnet ? 'on' : ''}`}
                aria-pressed={s.flipMagnet}
                onClick={() => {
                  // pick the magnet up, turn it round and lay it down far from the coil again
                  sim.current = fresh({ N: s.N, flipNormal: s.flipNormal, flipMagnet: !s.flipMagnet, user: true });
                  sync();
                }}
              >
                הפכו את המגנט
              </button>
            </div>
          ) : (
            <div class="group" role="group" aria-label="המפסק">
              <button type="button" class={`toggle ${s.switchOn ? 'on' : ''}`} aria-pressed={s.switchOn} onClick={toggleSwitch}>
                {s.switchOn ? 'פתחו את המפסק' : 'סגרו את המפסק'}
              </button>
            </div>
          )}
          <div class="group" role="group" aria-label="הגרף והסימנים">
            <button
              type="button"
              class={`toggle ${s.flipNormal ? 'on' : ''}`}
              aria-pressed={s.flipNormal}
              onClick={() => {
                const st = sim.current!;
                st.user = true;
                st.flipNormal = !st.flipNormal;
                done('flip-normal');
                sync();
              }}
            >
              הפכו את האנך
            </button>
            <button
              type="button"
              class={`toggle ${s.frozen ? 'on' : ''}`}
              aria-pressed={s.frozen}
              onClick={() => {
                const st = sim.current!;
                st.frozen = !st.frozen;
                if (st.frozen) st.cursor = st.clock - 1;
                sync();
              }}
            >
              {s.frozen ? 'המשיכו להקליט' : 'עצרו את הגרף'}
            </button>
          </div>
          {s.frozen && (
            <Slider
              label="הסמן על הגרף, הזמן t"
              value={Math.round(s.cursor * 100) / 100}
              min={Math.round((tStart + 0.05) * 100) / 100}
              max={Math.round((s.clock - 0.05) * 100) / 100}
              step={0.01}
              format={(v) => `${sci(v)} s`}
              onChange={(v) => {
                const st = sim.current!;
                st.cursor = v;
                if (Math.abs(emfAt(st.samples, v)) > 0.003) done('read-slope');
                sync();
              }}
            />
          )}
          {s.mode === 'magnet' && (
            <Slider label="משך התנועה בלחיצה, Δt" value={duration} min={0.1} max={1.5} step={0.1} format={(v) => `${sci(v)} s`} onChange={setDuration} />
          )}
          <Slider
            label="מספר הכריכות N"
            value={s.N}
            min={50}
            max={400}
            step={50}
            format={(v) => String(v)}
            onChange={(v) => {
              const st = userAct();
              st.N = v;
              sync();
            }}
          />
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------ ink */

interface BenchLayout {
  W: number;
  benchH: number;
  axisY: number;
  ppm: number;
  sx: (x: number) => number;
}

/** where the switch of the source coil's circuit sits, in screen space */
function switchBox(W: number, benchH: number, ppm: number, xs: number) {
  const cx = (xs - X_LEFT) * ppm;
  return { x: (leftColumn(cx, ppm) + cx + 0.006 * ppm) / 2, y: benchH * 0.14 };
}

/** the left column of the source coil's circuit, kept on the canvas */
const leftColumn = (cx: number, ppm: number) => Math.max(12, cx - 0.07 * ppm);

/** half of a coil's turns, seen from the side: the back half (left of each ellipse) or the front half */
function coilHalf(ctx: CanvasRenderingContext2D, cx: number, cy: number, rPx: number, lenPx: number, turns: number, front: boolean, color: string, width: number) {
  const rz = rPx * 0.32;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (let i = 0; i < turns; i++) {
    const x = cx - lenPx / 2 + (turns === 1 ? lenPx / 2 : (i * lenPx) / (turns - 1));
    ctx.beginPath();
    if (front) ctx.ellipse(x, cy, rz, rPx, 0, -Math.PI / 2, Math.PI / 2);
    else ctx.ellipse(x, cy, rz, rPx, 0, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBench(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  s: Sim,
  L: BenchLayout,
  magnetLines: Vec2[][],
  coilLines: Vec2[][],
) {
  const { W, benchH, axisY, ppm, sx } = L;
  const sy = (y: number) => axisY - y * ppm;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, benchH);
  ctx.clip();

  // the axis
  ctx.strokeStyle = withAlpha(p.ink3, 0.6);
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, axisY);
  ctx.lineTo(W, axisY);
  ctx.stroke();
  ctx.setLineDash([]);

  // field lines of the source, moving with it
  const srcX = s.mode === 'magnet' ? s.x : s.xs;
  const lines = s.mode === 'magnet' ? magnetLines : coilLines;
  const strength = s.mode === 'magnet' ? 1 : s.Ip / I0;
  if (strength > 0.02) {
    ctx.strokeStyle = withAlpha(p.bfield, 0.45 * strength);
    ctx.lineWidth = 1.2;
    for (const line of lines) {
      ctx.beginPath();
      line.forEach(([x, y], i) => {
        const px = sx(srcX + x);
        const py = sy(y);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.stroke();
    }
  }

  const bPx = B_COIL * ppm;
  const lenPx = COIL_LEN * ppm;
  const cx = sx(0);
  const I = s.samples[s.samples.length - 1]?.emf / R_CIRCUIT || 0;
  const glow = Math.min(1, Math.abs(I) / (0.4 * iFull(s.mode)));

  // back halves of the coils
  coilHalf(ctx, cx, axisY, bPx, lenPx, 7, false, withAlpha(p.equip, 0.45), 2);
  if (s.mode === 'coils') coilHalf(ctx, sx(s.xs), axisY, A_SRC * ppm, 0.012 * ppm, 6, false, withAlpha(p.equip, 0.45), 2);

  // the magnet
  if (s.mode === 'magnet') {
    const x0 = sx(s.x - MAG_L / 2);
    const x1 = sx(s.x + MAG_L / 2);
    const xm = sx(s.x);
    const h = MAG_R * ppm;
    const northRight = !s.flipMagnet;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = p.bfield;
    // north half translucent blue, south half hollow (never colour alone: the letters say which is which)
    const nx0 = northRight ? xm : x0;
    const nx1 = northRight ? x1 : xm;
    const sx0 = northRight ? x0 : xm;
    const sx1 = northRight ? xm : x1;
    ctx.fillStyle = withAlpha(p.paper2, 0.95);
    ctx.fillRect(sx0, axisY - h, sx1 - sx0, 2 * h);
    ctx.strokeRect(sx0, axisY - h, sx1 - sx0, 2 * h);
    ctx.fillStyle = withAlpha(p.bfield, 0.35);
    ctx.fillRect(nx0, axisY - h, nx1 - nx0, 2 * h);
    ctx.strokeRect(nx0, axisY - h, nx1 - nx0, 2 * h);
    ctx.font = `700 ${Math.max(11, Math.min(16, h * 1.2))}px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    ctx.fillStyle = p.ink;
    ctx.fillText('N', (nx0 + nx1) / 2, axisY + 0.5);
    ctx.fillStyle = p.ink2;
    ctx.fillText('S', (sx0 + sx1) / 2, axisY + 0.5);
  }

  // front halves
  coilHalf(ctx, cx, axisY, bPx, lenPx, 7, true, p.equip, 2.2);
  if (glow > 0.02) coilHalf(ctx, cx, axisY, bPx, lenPx, 7, true, withAlpha(p.current, glow), 2.6);
  if (s.mode === 'coils') {
    const xsP = sx(s.xs);
    coilHalf(ctx, xsP, axisY, A_SRC * ppm, 0.012 * ppm, 6, true, p.equip, 2.2);
    const g2 = s.Ip / I0;
    if (g2 > 0.02) coilHalf(ctx, xsP, axisY, A_SRC * ppm, 0.012 * ppm, 6, true, withAlpha(p.current, g2), 2.6);
    drawSourceCircuit(ctx, p, s, L);
  }

  // the normal and the positive sense it fixes
  const n = s.flipNormal ? -1 : 1;
  const nLen = 0.05 * ppm;
  arrow(ctx, cx, axisY, cx + n * nLen, axisY, { color: p.accent, width: 2.4, head: 10 });
  ctx.font = `italic 700 14px ${p.fontUi}`;
  ctx.fillStyle = p.accent;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('n̂', cx + n * nLen * 0.75, axisY - 5);
  // on the front of the coil (drawn to the right of each ring) the positive sense runs down when n̂ = +x
  const rz = bPx * 0.32;
  const ex = cx + lenPx / 2;
  const a0 = n > 0 ? -1.15 : -0.35;
  const a1 = n > 0 ? -0.35 : -1.15;
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(ex, axisY, rz + 5, bPx + 5, 0, a0, a1, n < 0);
  ctx.stroke();
  const hx = ex + (rz + 5) * Math.cos(a1);
  const hy = axisY + (bPx + 5) * Math.sin(a1);
  const tx = -(rz + 5) * Math.sin(a1) * (n > 0 ? 1 : -1);
  const ty = (bPx + 5) * Math.cos(a1) * (n > 0 ? 1 : -1);
  const tl = Math.hypot(tx, ty) || 1;
  arrow(ctx, hx - (tx / tl) * 10, hy - (ty / tl) * 10, hx, hy, { color: p.accent, width: 2, head: 8 });
  ctx.font = `700 13px ${p.fontUi}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('+', ex + rz + 16, axisY - bPx * 0.75);

  // leads up to the galvanometer
  const gx = cx;
  const gr = Math.max(22, Math.min(38, W * 0.065));
  const gy = Math.max(gr + 6, benchH * 0.06 + gr);
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - lenPx / 2, axisY - bPx);
  ctx.lineTo(cx - lenPx / 2, gy + gr * 0.55);
  ctx.lineTo(gx - gr * 0.6, gy + gr * 0.55);
  ctx.moveTo(cx + lenPx / 2, axisY - bPx);
  ctx.lineTo(cx + lenPx / 2, gy + gr * 0.55);
  ctx.lineTo(gx + gr * 0.6, gy + gr * 0.55);
  ctx.stroke();
  galvanometer(ctx, p, gx, gy, gr, I / iFull(s.mode));
  ctx.restore();
}

/** a zero-centre meter: the needle swings right for current in the +x normal's positive sense */
function galvanometer(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, r: number, frac: number) {
  const f = Math.max(-1, Math.min(1, frac));
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(x - r, y - r * 0.85, 2 * r, r * 1.55, 6);
  ctx.fill();
  ctx.stroke();
  const py = y + r * 0.45;
  const R = r * 1.05;
  const span = (55 * Math.PI) / 180;
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1;
  for (let k = -5; k <= 5; k++) {
    const a = -Math.PI / 2 + (k / 5) * span;
    const r0 = k === 0 ? R * 0.72 : R * 0.82;
    ctx.beginPath();
    ctx.moveTo(x + r0 * Math.cos(a), py + r0 * Math.sin(a));
    ctx.lineTo(x + R * 0.92 * Math.cos(a), py + R * 0.92 * Math.sin(a));
    ctx.stroke();
  }
  const a = -Math.PI / 2 + f * span;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, py);
  ctx.lineTo(x + R * 0.88 * Math.cos(a), py + R * 0.88 * Math.sin(a));
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(x, py, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `700 11px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = p.ink2;
  ctx.fillText('G', x - r + 5, y + r * 0.66);
  ctx.restore();
}

/** the source coil's circuit, above it: a battery on the left column and a switch on the top rail */
function drawSourceCircuit(ctx: CanvasRenderingContext2D, p: Palette, s: Sim, L: BenchLayout) {
  const { benchH, axisY, ppm, sx } = L;
  const cx = sx(s.xs);
  const top = axisY - A_SRC * ppm;
  const lead = 0.006 * ppm;
  const sw = switchBox(L.W, benchH, ppm, s.xs);
  const yTop = sw.y;
  const yBot = yTop + 30;
  const xL = leftColumn(cx, ppm);
  const yBat = (yTop + yBot) / 2;
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  // coil → right column → top rail → switch
  ctx.moveTo(cx + lead, top);
  ctx.lineTo(cx + lead, yTop);
  ctx.lineTo(sw.x + 11, yTop);
  // switch pivot → left column → battery → bottom rail → coil
  ctx.moveTo(sw.x - 11, yTop);
  ctx.lineTo(xL, yTop);
  ctx.lineTo(xL, yBat - 4);
  ctx.moveTo(xL, yBat + 4);
  ctx.lineTo(xL, yBot);
  ctx.lineTo(cx - lead, yBot);
  ctx.lineTo(cx - lead, top);
  ctx.stroke();
  // battery: long plate (+) on top
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xL - 9, yBat - 4);
  ctx.lineTo(xL + 9, yBat - 4);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(xL - 5, yBat + 4);
  ctx.lineTo(xL + 5, yBat + 4);
  ctx.stroke();
  // the switch: a blade from the pivot to the contact, lifted when open
  const pivot: [number, number] = [sw.x - 11, yTop];
  const contact: [number, number] = [sw.x + 11, yTop];
  ctx.fillStyle = p.ink;
  for (const [x, y] of [pivot, contact]) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = s.switchOn ? p.current : p.ink;
  ctx.beginPath();
  ctx.moveTo(pivot[0], pivot[1]);
  if (s.switchOn) ctx.lineTo(contact[0], contact[1]);
  else ctx.lineTo(pivot[0] + 19, pivot[1] - 11);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ the graphs */

function drawGraphs(ctx: CanvasRenderingContext2D, p: Palette, s: Sim, g: { W: number; H: number; top: number }) {
  const { W, H, top } = g;
  const narrow = W < 480;
  const left = narrow ? 48 : 58;
  const tEnd = Math.max(WINDOW, s.clock);
  const tStart = tEnd - WINDOW;
  const sign = s.flipNormal ? -1 : 1;
  const span = H - top;
  const phiBox = insetBox({ x: 0, y: top + 4, w: W, h: span * 0.46 }, { l: left, r: 14, t: 10, b: 8 });
  const emfBox = insetBox({ x: 0, y: top + span * 0.48, w: W, h: span * 0.52 }, { l: left, r: 14, t: 10, b: narrow ? 34 : 38 });
  const phiMax = PHI_SCALE[s.mode] * 1e6;
  const emfMax = EMF_SCALE[s.mode] * 1e3;
  const xTicks: number[] = [];
  for (let k = Math.ceil(tStart); k <= tEnd + 1e-9; k++) xTicks.push(k);
  const phiPlot = makePlot(
    phiBox,
    { min: tStart, max: tEnd, ticks: xTicks, format: () => '' },
    { min: -phiMax, max: phiMax, label: 'Φ (μWb)', ticks: [-phiMax, -phiMax / 2, 0, phiMax / 2, phiMax] },
  );
  const emfPlot = makePlot(
    emfBox,
    { min: tStart, max: tEnd, ticks: xTicks, label: 'הזמן t (שניות)' },
    { min: -emfMax, max: emfMax, label: 'ε (mV)', ticks: [-emfMax, -emfMax / 2, 0, emfMax / 2, emfMax] },
  );
  drawAxes(ctx, phiPlot, p, { grid: true });
  drawAxes(ctx, emfPlot, p, { grid: true });
  for (const pl of [phiPlot, emfPlot]) {
    // the zero line, where the sign changes
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pl.box.x, pl.py(0));
    ctx.lineTo(pl.box.x + pl.box.w, pl.py(0));
    ctx.stroke();
    ctx.restore();
  }
  trace(ctx, phiPlot, s.samples, (q) => sign * q.phi * 1e6, p.bfield);
  trace(ctx, emfPlot, s.samples, (q) => sign * q.emf * 1e3, p.efield);

  if (s.frozen) {
    const t = s.cursor;
    const phi = sign * phiAt(s.samples, t);
    const slope = sign * slopeAt(s.samples, t);
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(phiPlot.px(t), phiBox.y);
    ctx.lineTo(phiPlot.px(t), emfBox.y + emfBox.h);
    ctx.stroke();
    ctx.setLineDash([]);
    // the tangent to Φ(t) at the cursor, across ±0.6 s
    ctx.strokeStyle = p.ink;
    ctx.beginPath();
    ctx.rect(phiBox.x, phiBox.y, phiBox.w, phiBox.h);
    ctx.clip();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(phiPlot.px(t - 0.6), phiPlot.py((phi - 0.6 * slope) * 1e6));
    ctx.lineTo(phiPlot.px(t + 0.6), phiPlot.py((phi + 0.6 * slope) * 1e6));
    ctx.stroke();
    ctx.restore();
    dot(ctx, phiPlot, t, phi * 1e6, p.bfield);
    dot(ctx, emfPlot, t, sign * emfAt(s.samples, t) * 1e3, p.efield);
  }

  // which graph is which, in the corner of each
  ctx.save();
  ctx.font = `600 12px ${p.fontUi}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = p.bfield;
  ctx.fillText('השטף דרך כל כריכה', phiBox.x + phiBox.w - 4, phiBox.y + 3);
  ctx.fillStyle = p.efield;
  ctx.fillText('הכא״מ המושרה', emfBox.x + emfBox.w - 4, emfBox.y + 3);
  ctx.restore();
}

function trace(ctx: CanvasRenderingContext2D, plot: Plot, samples: readonly Sample[], f: (q: Sample) => number, color: string) {
  const { box } = plot;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y - 2, box.w, box.h + 4);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  for (const q of samples) {
    if (q.t < plot.x.min - 0.05) continue;
    const x = plot.px(q.t);
    const y = plot.py(Math.max(plot.y.min * 1.05, Math.min(plot.y.max * 1.05, f(q))));
    if (started) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    started = true;
  }
  ctx.stroke();
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, plot: Plot, x: number, y: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(plot.px(x), plot.py(Math.max(plot.y.min, Math.min(plot.y.max, y))), 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
