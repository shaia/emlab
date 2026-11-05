/**
 * Flux, emf and current as time-aligned graphs, and the charge as the area under I(t). Built for lesson 5.5.
 *
 * Three views, chosen by `mode` (and the mode buttons when `modes` lists more than one):
 * - `strip`: a square loop (20 cm × 20 cm, R = 0.1 Ω) moves at a constant speed v through a 40 cm strip of
 *   field B = 0.5 T into the page (⊗). Under the scene three graphs share one time axis, Φ(t), ε(t), I(t), and
 *   they are drawn as the loop moves (play, drag the loop, or scrub the graphs). The time axis is fixed at
 *   16 s, so a faster pass gives taller, narrower pulses of the same area. The normal is chosen into the page,
 *   so Φ ≥ 0 and positive ε and I mean clockwise on the page. The forces show the braking magnetic force on
 *   the side inside the field and the push that keeps the speed constant. With the area on, I(t) is shaded
 *   and the readout gives the area next to −ΔΦ/R. A completed pass leaves a dashed ghost for comparison.
 * - `build`: a given piecewise-linear graph, Φ(t) or B(t) for a fixed loop, and an empty ε(t) graph. The
 *   learner sets the level of ε on each straight piece (click or drag in the ε graph, or the arrow keys),
 *   checks, and the I(t) graph follows as ε/R.
 * - `bell`: the flux of a magnet carried through a coil at constant speed (a bell-shaped model curve). A
 *   cursor moves along it with the tangent line drawn; ε(t) and I(t) are traced up to the cursor.
 *
 * Every number comes from src/physics/fluxgraphs.ts and induction.ts. The scene is to scale; arrows are not.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { riemann } from '~/physics/calculus';
import { chargeThrough } from '~/physics/induction';
import {
  bellEmf,
  bellFlux,
  bellSteepest,
  passCharge,
  passCurrent,
  passEmf,
  passFlux,
  passHeatPower,
  passPushForce,
  passPushPower,
  passTimes,
  pieceAt,
  pieceEmfs,
  pieces,
  piecewiseLinear,
  type Knot,
  type StripPass,
} from '~/physics/fluxgraphs';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, chevron, depthField, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Mode = 'strip' | 'build' | 'bell';
type Preset = 'flux' | 'field';

/* ------------------------------------------------------------------ the strip */

/** The strip pass of the lesson, without its speed. */
export const STRIP: Omit<StripPass, 'v'> = { B: 0.5, a: 0, b: 0.4, w: 0.2, h: 0.2, R: 0.1, N: 1, x0: -0.3 };
/** the loop's left side runs from x0 to here [m] */
const X_END = 0.5;
const PATH = X_END - STRIP.x0;
/** the fixed time axis of the strip graphs [s]: one pass at the slowest speed */
const T_AXIS = 16;
/** simulated seconds per real second while playing */
const RATE = 2;
const V_MIN = 0.05;
const V_MAX = 0.2;
const passOf = (v: number): StripPass => ({ ...STRIP, v });
const tEndOf = (v: number) => PATH / v;
/** the scene's world window [m] */
const XMIN = -0.34;
const XMAX = 0.74;
const SCENE_H = 0.4;

/** The moments where the strip graphs have corners, from 0 to the end of the pass. */
function stripBreaks(v: number): number[] {
  const T = passTimes(passOf(v));
  return [0, T.leadIn, T.trailIn, T.leadOut, T.trailOut, tEndOf(v)].filter((t, i, a) => t >= 0 && (i === 0 || t > a[i - 1]));
}

/** Σ I·Δt from 0 to t, piece by piece (a Riemann sum on each straight piece of the graph) [C]. */
function stripArea(v: number, t: number): number {
  const br = stripBreaks(v);
  const p = passOf(v);
  let q = 0;
  for (let i = 0; i + 1 < br.length && br[i] < t; i++) q += riemann((u) => passCurrent(p, u), br[i], Math.min(br[i + 1], t), 50);
  // the two pulses cancel to rounding noise after a full pass: show it as the zero it is
  return Math.abs(q) < 1e-12 ? 0 : q;
}

/* ------------------------------------------------------------------ build presets */

interface BuildPreset {
  src: 'flux' | 'field';
  /** the given graph in SI: flux per turn [Wb] or field [T] */
  knots: Knot[];
  /** area of a turn, turns B into Φ (field preset) [m²] */
  A: number;
  N: number;
  R: number;
  tMax: number;
  srcRange: [number, number];
  srcTicks: number[];
  /** the ε levels snap to this step [V] */
  emfStep: number;
  emfRange: [number, number];
}

const PRESETS: Record<Preset, BuildPreset> = {
  flux: {
    src: 'flux',
    knots: [
      [0, 0],
      [2, 6e-3],
      [3, 6e-3],
      [4, 2e-3],
      [8, -6e-3],
    ],
    A: 1,
    N: 10,
    R: 5,
    tMax: 8,
    srcRange: [-7e-3, 8e-3],
    srcTicks: [-6e-3, -4e-3, -2e-3, 0, 2e-3, 4e-3, 6e-3],
    emfStep: 0.01,
    emfRange: [-0.08, 0.08],
  },
  field: {
    src: 'field',
    knots: [
      [0, 0],
      [2, 0.04],
      [6, 0.04],
      [8, -0.04],
      [10, -0.04],
    ],
    A: 0.01,
    N: 100,
    R: 4,
    tMax: 10,
    srcRange: [-0.05, 0.05],
    srcTicks: [-0.04, -0.02, 0, 0.02, 0.04],
    emfStep: 0.01,
    emfRange: [-0.06, 0.06],
  },
};

const fluxKnots = (pr: BuildPreset): Knot[] => (pr.src === 'flux' ? pr.knots : pr.knots.map(([t, B]) => [t, B * pr.A] as Knot));
const trueEmfs = (pr: BuildPreset) => pieceEmfs(fluxKnots(pr), pr.N);

/* ------------------------------------------------------------------ the bell */

const BELL = { phi0: 4e-3, t0: 3, tau: 0.8, N: 200, R: 8, tMax: 6 };
const bellPhi = bellFlux(BELL.phi0, BELL.t0, BELL.tau);
const bellEps = bellEmf(BELL.phi0, BELL.t0, BELL.tau, BELL.N);
const BELL_TOL = 0.06;

/* ------------------------------------------------------------------ tasks */

const TASK_LABEL: Record<string, string> = {
  'full-pass': 'העבירו את הלולאה מעבר שלם דרך השדה. מתי זורם זרם, ומתי לא?',
  'pause-inside': 'עצרו את הזמן כשהלולאה כולה בתוך השדה. מה הזרם ברגע הזה?',
  faster: 'הכפילו את המהירות, ל-0.2 m/s, והעבירו את הלולאה שוב. מה קרה לכא"מ, ולזמן שבו זורם זרם?',
  'build-flux': 'בנו את גרף הכא"מ לגרף השטף, ולחצו "בדיקה".',
  'build-field': 'בנו את גרף הכא"מ לגרף השדה, ולחצו "בדיקה".',
  'bell-peak': 'הזיזו את הסמן לשיא של גרף השטף. כמה הכא"מ שם?',
  'bell-steepest': 'מצאו רגע שבו הכא"מ הכי גדול. מה מיוחד בגרף השטף שם?',
  'entry-charge': 'עצרו את הזמן כשהלולאה סיימה להיכנס לשדה, וקראו כמה מטען עבר.',
  'two-speeds': 'הכניסו את הלולאה לשדה בשתי מהירויות שונות, והשוו את המטען.',
  'net-zero': 'השלימו מעבר שלם, עם השטח מוצג. כמה מטען עבר בסך הכול?',
};

const MODE_NAME: Record<Mode, string> = {
  strip: 'לולאה ורצועת שדה',
  build: 'בונים את גרף הכא"מ',
  bell: 'מגנט עובר בסליל',
};

export interface FluxTimelineProps {
  id: string;
  mode?: Mode;
  modes?: Mode[];
  /** strip speed [m/s] */
  v?: number;
  /** strip or bell moment [s] */
  t?: number;
  showArea?: boolean;
  showForce?: boolean;
  /** the area toggle appears in the controls */
  areaControl?: boolean;
  preset?: Preset;
  /** the preset buttons appear in build mode */
  presetControl?: boolean;
  /** build: show the right ε levels */
  reveal?: boolean;
  tasks?: string[];
}

interface State {
  mode: Mode;
  v: number;
  t: number;
  playing: boolean;
  showArea: boolean;
  showForce: boolean;
  preset: Preset;
  levels: (number | null)[];
  sel: number;
  checked: boolean;
  reveal: boolean;
  /** the speed of the last completed pass, drawn dashed while the speed differs */
  ghostV: number | null;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, step: number) => Number((Math.round(x / step) * step).toFixed(10));
const tMaxOf = (s: State) => (s.mode === 'strip' ? tEndOf(s.v) : s.mode === 'bell' ? BELL.tMax : PRESETS[s.preset].tMax);
const sense = (I: number) => (I > 0 ? 'בכיוון השעון' : I < 0 ? 'נגד כיוון השעון' : '');
/** a value in milli-units with a fixed number of decimals, for the build readouts */
const milli = (x: number, digits = 0) => {
  const m = x * 1e3;
  const r = Number(m.toFixed(digits));
  return String(r === 0 ? 0 : r);
};

/* ------------------------------------------------------------------ plot geometry */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Plot {
  box: Box;
  tMax: number;
  lo: number;
  hi: number;
  px: (t: number) => number;
  py: (y: number) => number;
}
const mkPlot = (box: Box, tMax: number, lo: number, hi: number): Plot => ({
  box,
  tMax,
  lo,
  hi,
  px: (t) => box.x + (t / tMax) * box.w,
  py: (y) => box.y + ((hi - y) / (hi - lo)) * box.h,
});

function layout(W: number, H: number, mode: Mode): { scene: Box | null; plots: Box[] } {
  const L = W < 420 ? 44 : 54;
  const R = 12;
  const bottom = 30;
  const gap = 10;
  const sceneH = mode === 'strip' ? H * 0.3 : 0;
  const top = mode === 'strip' ? sceneH + 6 : 8;
  const ph = (H - top - bottom - 2 * gap) / 3;
  const plots = [0, 1, 2].map((i) => ({ x: L, y: top + i * (ph + gap), w: W - L - R, h: ph }));
  return { scene: mode === 'strip' ? { x: 6, y: 4, w: W - 12, h: sceneH - 4 } : null, plots };
}

function text(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center', size = 12, weight = 600, dir: CanvasDirection = 'ltr') {
  ctx.save();
  ctx.font = `${weight} ${size}px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.direction = dir;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** Grid, zero line, y tick numbers, the title in the top-right corner; t numbers only when asked. */
function axes(ctx: CanvasRenderingContext2D, p: Palette, pl: Plot, o: { yTicks: number[]; yFmt: (v: number) => string; title: string; color: string; tNums: boolean; tStep: number }) {
  const { box } = pl;
  ctx.save();
  ctx.fillStyle = withAlpha(p.paper2, 0.5);
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let t = 0; t <= pl.tMax + 1e-9; t += o.tStep) {
    const x = Math.round(pl.px(t)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, box.y);
    ctx.lineTo(x, box.y + box.h);
    ctx.stroke();
  }
  const thin = box.h < 90;
  o.yTicks.forEach((v, i) => {
    const y = Math.round(pl.py(v)) + 0.5;
    ctx.strokeStyle = v === 0 ? p.ink3 : p.rule;
    ctx.lineWidth = v === 0 ? 1.3 : 1;
    ctx.beginPath();
    ctx.moveTo(box.x, y);
    ctx.lineTo(box.x + box.w, y);
    ctx.stroke();
    if (!thin || v === 0 || i % 2 === o.yTicks.indexOf(0) % 2) text(ctx, p, o.yFmt(v), box.x - 5, y, p.ink2, 'right', 11, 400);
  });
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.stroke();
  ctx.restore();
  if (o.tNums) {
    const every = box.w / (pl.tMax / o.tStep) < 26 ? 2 : 1;
    let k = 0;
    for (let t = 0; t <= pl.tMax + 1e-9; t += o.tStep, k++) if (k % every === 0) text(ctx, p, sci(Number(t.toFixed(6))), pl.px(t), box.y + box.h + 9, p.ink2, 'center', 11, 400);
    text(ctx, p, 't (s)', box.x + box.w, box.y + box.h + 22, p.ink, 'right', 12);
  }
  // title, top left (the figure's tool buttons sit top right), on a paper backing
  ctx.save();
  ctx.font = `600 12px ${p.fontUi}`;
  const tw = ctx.measureText(o.title).width;
  ctx.fillStyle = withAlpha(p.paper, 0.85);
  ctx.fillRect(box.x + 3, box.y + 2, tw + 8, 17);
  ctx.restore();
  text(ctx, p, o.title, box.x + 7, box.y + 11, o.color, 'left', 12);
}

function polyline(ctx: CanvasRenderingContext2D, pl: Plot, pts: [number, number][], color: string, width = 2.4, dash: number[] = []) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(pl.box.x, pl.box.y - 2, pl.box.w + 2, pl.box.h + 4);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach(([t, y], i) => (i === 0 ? ctx.moveTo(pl.px(t), pl.py(y)) : ctx.lineTo(pl.px(t), pl.py(y))));
  ctx.stroke();
  ctx.restore();
}

function fillArea(ctx: CanvasRenderingContext2D, pl: Plot, pts: [number, number][], color: string) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pl.px(pts[0][0]), pl.py(0));
  for (const [t, y] of pts) ctx.lineTo(pl.px(t), pl.py(y));
  ctx.lineTo(pl.px(pts[pts.length - 1][0]), pl.py(0));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A step function f, constant between breaks, as points up to tUp (vertical jumps included). */
function steps(breaks: number[], f: (t: number) => number, tUp: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < breaks.length && breaks[i] < tUp; i++) {
    const y = f((breaks[i] + breaks[i + 1]) / 2);
    out.push([breaks[i], y], [Math.min(breaks[i + 1], tUp), y]);
  }
  return out;
}

/** A piecewise-linear f with corners at the breaks, as points up to tUp. */
function corners(breaks: number[], f: (t: number) => number, tUp: number): [number, number][] {
  const out: [number, number][] = [];
  for (const b of breaks) {
    if (b >= tUp) break;
    out.push([b, f(b)]);
  }
  out.push([tUp, f(tUp)]);
  return out;
}

/** A smooth f sampled from t0 to t1. */
function sample(f: (t: number) => number, t0: number, t1: number, n = 240): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    out.push([t, f(t)]);
  }
  return out;
}

/* ------------------------------------------------------------------ component */

export default function FluxTimeline(props: FluxTimelineProps) {
  const init = (): State => {
    const preset = props.preset ?? 'flux';
    return {
      mode: props.mode ?? 'strip',
      v: props.v ?? 0.1,
      t: props.t ?? 0,
      playing: false,
      showArea: props.showArea ?? false,
      showForce: props.showForce ?? true,
      preset,
      levels: pieces(fluxKnots(PRESETS[preset])).map(() => null),
      sel: 0,
      checked: false,
      reveal: props.reveal ?? false,
      ghostV: null,
    };
  };
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  /** a phone-width stage gets a taller aspect, set after mount (the server renders the desktop one) */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const f = () => setNarrow(window.innerWidth < 560);
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  const userActed = useRef(false);
  /** true while the strip is moving because the learner made it move (play or drag) */
  const userRun = useRef(false);
  const entered = useRef(new Set<number>());
  const lastPass = useRef<number | null>(null);
  const dragging = useRef<'scene' | 'plot' | 'emf' | null>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const modes = props.modes ?? [s.mode];
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const done = (t: string) => {
    if (has(t)) markTask(`${props.id}:${t}`);
  };

  /* -------- text steps: set the state, never tick a task */
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        userRun.current = false;
        setS((prev) => {
          const mode: Mode = st.mode === 'strip' || st.mode === 'build' || st.mode === 'bell' ? st.mode : prev.mode;
          const preset: Preset = st.preset === 'flux' || st.preset === 'field' ? st.preset : prev.preset;
          const n = pieces(fluxKnots(PRESETS[preset])).length;
          const next: State = {
            ...prev,
            mode,
            preset,
            v: typeof st.v === 'number' ? st.v : prev.v,
            showArea: typeof st.showArea === 'boolean' ? st.showArea : prev.showArea,
            showForce: typeof st.showForce === 'boolean' ? st.showForce : prev.showForce,
            reveal: typeof st.reveal === 'boolean' ? st.reveal : prev.reveal,
            playing: false,
            levels: preset !== prev.preset || prev.levels.length !== n ? Array(n).fill(null) : prev.levels,
            checked: false,
          };
          next.t = typeof st.t === 'number' ? clamp(st.t, 0, tMaxOf(next)) : clamp(prev.t, 0, tMaxOf(next));
          return next;
        });
      }),
    [props.id],
  );

  /* -------- strip: moving the time on */
  const advance = (prev: State, nt: number, user: boolean): State => {
    const tEnd = tEndOf(prev.v);
    const t1 = clamp(nt, 0, tEnd);
    if (user) {
      const T = passTimes(passOf(prev.v));
      if (prev.t < T.trailIn - 1e-9 && t1 >= T.trailIn - 1e-9) {
        entered.current.add(prev.v);
        if (prev.v >= 0.2 - 1e-9) done('faster');
        if (entered.current.size >= 2) done('two-speeds');
      }
      if (prev.t < tEnd - 1e-9 && t1 >= tEnd - 1e-9) {
        lastPass.current = prev.v;
        done('full-pass');
        if (prev.showArea) done('net-zero');
      }
    }
    return { ...prev, t: t1, playing: t1 >= tEnd - 1e-9 ? false : prev.playing };
  };

  /** the learner stopped the time at t: the checks that need a frozen moment */
  const stoppedAt = (st: State) => {
    if (st.mode === 'strip') {
      const T = passTimes(passOf(st.v));
      if (st.t >= T.trailIn - 1e-9 && st.t < T.leadOut) {
        done('pause-inside');
        if (st.showArea) done('entry-charge');
      }
    } else if (st.mode === 'bell') {
      if (Math.abs(st.t - BELL.t0) <= BELL_TOL) done('bell-peak');
      if (bellSteepest(BELL.t0, BELL.tau).some((ts) => Math.abs(st.t - ts) <= BELL_TOL)) done('bell-steepest');
    }
  };

  useEffect(() => {
    if (s.mode !== 'strip' || !s.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      setS((prev) => {
        if (!prev.playing) return prev;
        if (!motionAllowed()) return advance(prev, tEndOf(prev.v), userRun.current);
        return advance(prev, prev.t + dt * RATE, userRun.current);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.mode, s.playing]);

  const act = (patch: Partial<State>) => {
    userActed.current = true;
    setS((prev) => ({ ...prev, ...patch }));
  };

  const play = () => {
    userActed.current = true;
    userRun.current = true;
    setS((prev) => {
      if (prev.playing) {
        const next = { ...prev, playing: false };
        stoppedAt(next);
        return next;
      }
      const start = prev.t >= tEndOf(prev.v) - 1e-9 ? { ...prev, t: 0 } : prev;
      // still mode: no motion, so the pass is shown complete at once
      if (!motionAllowed()) return advance({ ...start, playing: false }, tEndOf(start.v), true);
      return { ...start, playing: true };
    });
  };

  const setSpeed = (v: number) => {
    userActed.current = true;
    userRun.current = false;
    setS((prev) => {
      const nv = clamp(round(v, 0.05), V_MIN, V_MAX);
      if (nv === prev.v) return prev;
      const ghostV = lastPass.current !== null && lastPass.current !== nv ? lastPass.current : null;
      return { ...prev, v: nv, t: 0, playing: false, ghostV };
    });
  };

  const scrub = (t: number) => {
    userActed.current = true;
    userRun.current = true;
    setS((prev) => {
      const next = prev.mode === 'strip' ? advance({ ...prev, playing: false }, t, true) : { ...prev, t: clamp(t, 0, tMaxOf(prev)) };
      stoppedAt(next);
      return next;
    });
  };

  /* -------- build */
  const pr = PRESETS[s.preset];
  const ps = pieces(fluxKnots(pr));
  const truth = trueEmfs(pr);
  const correctAt = (st: State, i: number) => st.levels[i] !== null && Math.abs((st.levels[i] as number) - trueEmfs(PRESETS[st.preset])[i]) < PRESETS[st.preset].emfStep / 2;
  const allRight = (st: State) => st.levels.every((_, i) => correctAt(st, i));

  const setLevel = (i: number, level: number) => {
    userActed.current = true;
    setS((prev) => {
      const P = PRESETS[prev.preset];
      const levels = prev.levels.slice();
      levels[i] = clamp(round(level, P.emfStep), P.emfRange[0], P.emfRange[1]);
      return { ...prev, levels, sel: i, checked: false };
    });
  };

  const check = () => {
    userActed.current = true;
    setS((prev) => {
      if (allRight(prev)) done(`build-${prev.preset}`);
      return { ...prev, checked: true };
    });
  };

  const setPreset = (preset: Preset) => {
    userActed.current = true;
    setS((prev) => (prev.preset === preset ? prev : { ...prev, preset, levels: pieces(fluxKnots(PRESETS[preset])).map(() => null), sel: 0, checked: false, reveal: false, t: 0 }));
  };

  const switchMode = (mode: Mode) => {
    userActed.current = true;
    userRun.current = false;
    setS((prev) => (prev.mode === mode ? prev : { ...prev, mode, t: 0, playing: false }));
  };

  /* -------- physics of the moment */
  const pass = passOf(s.v);
  const T = passTimes(pass);
  const tEnd = tEndOf(s.v);
  const phiNow = passFlux(pass, s.t);
  const epsNow = passEmf(pass, s.t);
  const iNow = passCurrent(pass, s.t);
  const push = passPushForce(pass, s.t);

  const describe = (): string => {
    if (s.mode === 'strip') {
      const where = s.t < T.leadIn ? 'עוד לפני השדה' : s.t < T.trailIn ? 'נכנסת לשדה' : s.t < T.leadOut ? 'כולה בתוך השדה' : s.t < T.trailOut ? 'יוצאת מהשדה' : 'כבר אחרי השדה';
      const cur = iNow === 0 ? 'אין זרם' : `זרם ${sci(Math.abs(iNow))} אמפר ${sense(iNow)}`;
      return `לולאה במהירות ${sci(s.v)} מטר לשנייה, ברגע ${sci(Number(s.t.toFixed(2)))} שניות: הלולאה ${where}. השטף ${sci(phiNow)} ובר, ${cur}.`;
    }
    if (s.mode === 'build') {
      const set = s.levels.filter((l) => l !== null).length;
      return `גרף ${pr.src === 'flux' ? 'השטף' : 'השדה'} נתון, ${ps.length} קטעים ישרים. נקבעו ${set} מדרגות של כא"מ${s.checked ? (allRight(s) ? ', כולן נכונות' : ', לא כולן נכונות') : ''}.`;
    }
    return `מגנט עובר בסליל: ברגע ${sci(Number(s.t.toFixed(2)))} שניות השטף ${sci(bellPhi(s.t))} ובר והכא"מ ${sci(bellEps(s.t))} וולט.`;
  };

  useEffect(() => {
    if (!userActed.current || s.playing) return;
    setLive(describe());
  }, [s]);

  /* ------------------------------------------------------------------ drawing */

  const drawScene = (ctx: CanvasRenderingContext2D, p: Palette, sc: Box) => {
    const k = Math.min(sc.w / (XMAX - XMIN), sc.h / SCENE_H);
    const ox = sc.x + (sc.w - k * (XMAX - XMIN)) / 2;
    const X = (x: number) => ox + (x - XMIN) * k;
    const yc = sc.y + sc.h / 2;
    // the strip
    const sx0 = X(STRIP.a);
    const sx1 = X(STRIP.b);
    ctx.save();
    ctx.fillStyle = withAlpha(p.bfield, 0.08);
    ctx.fillRect(sx0, sc.y, sx1 - sx0, sc.h);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = withAlpha(p.bfield, 0.7);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(sx0, sc.y);
    ctx.lineTo(sx0, sc.y + sc.h);
    ctx.moveTo(sx1, sc.y);
    ctx.lineTo(sx1, sc.y + sc.h);
    ctx.stroke();
    ctx.restore();
    depthField(ctx, { x: sx0, y: sc.y, w: sx1 - sx0, h: sc.h }, 'in', p.bfield, sc.h < 120 ? 18 : 24, 0.5);
    text(ctx, p, `B = ${sci(STRIP.B)} T ⊗`, sx1 - 4, sc.y + sc.h - 8, p.bfield, 'right', 12);
    // the loop
    const xl = X(STRIP.x0 + s.v * s.t);
    const xr = xl + STRIP.w * k;
    const yt = yc - (STRIP.h * k) / 2;
    const yb = yc + (STRIP.h * k) / 2;
    ctx.save();
    ctx.strokeStyle = iNow !== 0 ? p.current : p.ink2;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeRect(xl, yt, xr - xl, yb - yt);
    ctx.restore();
    if (iNow !== 0) {
      // positive = clockwise on the page (screen y down): top →, right ↓, bottom ←, left ↑
      const d = iNow > 0 ? 1 : -1;
      const c = withAlpha(p.ink, 0.9);
      chevron(ctx, (xl + xr) / 2, yt, d, 0, 7, c);
      chevron(ctx, xr, yc, 0, d, 7, c);
      chevron(ctx, (xl + xr) / 2, yb, -d, 0, 7, c);
      chevron(ctx, xl, yc, 0, -d, 7, c);
      text(ctx, p, 'I', xr + 10, yt + 8, p.current, 'left', 13);
    }
    // the speed
    const vy = yt - 11;
    if (vy > sc.y + 6) {
      arrow(ctx, (xl + xr) / 2 - 16, vy, (xl + xr) / 2 + 16, vy, { color: p.ink2, width: 1.6, head: 7 });
      text(ctx, p, 'v', (xl + xr) / 2 + 22, vy, p.ink2, 'left', 12);
    }
    // the forces: the magnetic force on the side inside the field, and the push
    if (s.showForce && push > 0) {
      const len = Math.max(16, Math.min(1, push / 0.02) * 46);
      const sideX = T.leadIn <= s.t && s.t < T.trailIn ? xr : xl;
      arrow(ctx, sideX, yc + 14, sideX - len, yc + 14, { color: p.force, width: 2.6, head: 9, glow: withAlpha(p.paper, 0.9) });
      const roomy = STRIP.w * k > 64;
      if (roomy) text(ctx, p, 'כוח מגנטי', sideX - len / 2, yc + 27, p.force, 'center', 11, 600, 'rtl');
      const hx = xl - 4;
      arrow(ctx, hx - len, yc - 14, hx, yc - 14, { color: p.hand, width: 2.6, head: 9 });
      if (roomy) text(ctx, p, 'דחיפה', hx - len - 4, yc - 14, p.hand, 'right', 11, 600, 'rtl');
    }
  };

  const drawStrip = (ctx: CanvasRenderingContext2D, p: Palette, plots: Box[]) => {
    const br = stripBreaks(s.v);
    const plPhi = mkPlot(plots[0], T_AXIS, -0.003, 0.025);
    const plE = mkPlot(plots[1], T_AXIS, -0.025, 0.025);
    const plI = mkPlot(plots[2], T_AXIS, -0.25, 0.25);
    axes(ctx, p, plPhi, { yTicks: [0, 0.01, 0.02], yFmt: (v) => sci(v), title: 'Φ (Wb)', color: p.bfield, tNums: false, tStep: 2 });
    axes(ctx, p, plE, { yTicks: [-0.02, -0.01, 0, 0.01, 0.02], yFmt: (v) => sci(v), title: 'ε (V)', color: p.efield, tNums: false, tStep: 2 });
    axes(ctx, p, plI, { yTicks: [-0.2, -0.1, 0, 0.1, 0.2], yFmt: (v) => sci(v), title: 'I (A)', color: p.current, tNums: true, tStep: 2 });
    // the ghost of the last completed pass
    if (s.ghostV !== null && s.ghostV !== s.v) {
      const gp = passOf(s.ghostV);
      const gb = stripBreaks(s.ghostV);
      const ge = tEndOf(s.ghostV);
      const c = withAlpha(p.ink3, 0.9);
      polyline(ctx, plPhi, corners(gb, (t) => passFlux(gp, t), ge), c, 1.6, [5, 4]);
      polyline(ctx, plE, steps(gb, (t) => passEmf(gp, t), ge), c, 1.6, [5, 4]);
      polyline(ctx, plI, steps(gb, (t) => passCurrent(gp, t), ge), c, 1.6, [5, 4]);
    }
    const iPts = steps(br, (t) => passCurrent(pass, t), s.t);
    if (s.showArea) {
      fillArea(ctx, plI, iPts, withAlpha(p.current, 0.28));
      // the charge of each completed pulse, written on it
      const lobes: [number, number][] = [
        [T.leadIn, T.trailIn],
        [T.leadOut, T.trailOut],
      ];
      for (const [a, b] of lobes) {
        if (s.t < b - 1e-9) continue;
        const q = passCharge(pass, a, b);
        const y = q < 0 ? plI.py(-0.25) - 8 : plI.py(0.25) + 8;
        text(ctx, p, `${q > 0 ? '+' : ''}${sci(q)} C`, plI.px((a + b) / 2), y, p.ink, 'center', 11);
      }
    }
    polyline(ctx, plPhi, corners(br, (t) => passFlux(pass, t), s.t), p.bfield, 2.6);
    polyline(ctx, plE, steps(br, (t) => passEmf(pass, t), s.t), p.efield, 2.6);
    polyline(ctx, plI, iPts, p.current, 2.6);
    // the moment
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink, 0.55);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    const x = Math.round(plPhi.px(s.t)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, plots[0].y);
    ctx.lineTo(x, plots[2].y + plots[2].h);
    ctx.stroke();
    ctx.restore();
    for (const [pl, y, c] of [
      [plPhi, phiNow, p.bfield],
      [plE, epsNow, p.efield],
      [plI, iNow, p.current],
    ] as const) {
      ctx.save();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(pl.px(s.t), pl.py(y), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const drawBuild = (ctx: CanvasRenderingContext2D, p: Palette, plots: Box[]) => {
    // the right / wrong marks use the page's own feedback colours, which readPalette does not carry
    const cs = canvasRef.current ? getComputedStyle(canvasRef.current) : null;
    const ok = cs?.getPropertyValue('--ok').trim() || p.ink;
    const bad = cs?.getPropertyValue('--bad').trim() || p.pos;
    const srcPl = mkPlot(plots[0], pr.tMax, pr.srcRange[0], pr.srcRange[1]);
    const ePl = mkPlot(plots[1], pr.tMax, pr.emfRange[0], pr.emfRange[1]);
    const iPl = mkPlot(plots[2], pr.tMax, pr.emfRange[0] / pr.R, pr.emfRange[1] / pr.R);
    const eTicks: number[] = [];
    for (let v = pr.emfRange[0]; v <= pr.emfRange[1] + 1e-9; v += 0.02) eTicks.push(Number(v.toFixed(6)));
    axes(ctx, p, srcPl, { yTicks: pr.srcTicks, yFmt: (v) => milli(v), title: pr.src === 'flux' ? 'Φ (mWb)' : 'B (mT)', color: p.bfield, tNums: false, tStep: 1 });
    axes(ctx, p, ePl, { yTicks: eTicks, yFmt: (v) => milli(v), title: 'ε (mV)', color: p.efield, tNums: false, tStep: 1 });
    axes(ctx, p, iPl, { yTicks: eTicks.map((v) => v / pr.R), yFmt: (v) => milli(v, 1), title: 'I (mA)', color: p.current, tNums: true, tStep: 1 });
    // the given graph
    polyline(ctx, srcPl, pr.knots.map(([t, y]) => [t, y] as [number, number]), p.bfield, 2.6);
    // the right answer, when shown
    if (s.reveal) {
      const br = [ps[0].t0, ...ps.map((q) => q.t1)];
      polyline(ctx, ePl, steps(br, (t) => truth[pieceAt(ps, t)], pr.tMax), withAlpha(p.ink, 0.6), 1.8, [6, 4]);
      polyline(ctx, iPl, steps(br, (t) => truth[pieceAt(ps, t)] / pr.R, pr.tMax), withAlpha(p.ink, 0.6), 1.8, [6, 4]);
    }
    // the selected piece
    const sp = ps[s.sel];
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.1);
    ctx.fillRect(ePl.px(sp.t0), plots[1].y, ePl.px(sp.t1) - ePl.px(sp.t0), plots[1].h);
    ctx.restore();
    // the learner's levels
    ps.forEach((q, i) => {
      const l = s.levels[i];
      if (l === null) {
        text(ctx, p, '?', ePl.px((q.t0 + q.t1) / 2), ePl.py(0) - 10, p.ink3, 'center', 13);
        return;
      }
      const right = correctAt(s, i);
      const c = s.checked && !right ? bad : p.efield;
      polyline(ctx, ePl, [
        [q.t0, l],
        [q.t1, l],
      ], c, 3);
      polyline(ctx, iPl, [
        [q.t0, l / pr.R],
        [q.t1, l / pr.R],
      ], p.current, 3);
      if (s.checked) text(ctx, p, right ? '✓' : '✗', ePl.px((q.t0 + q.t1) / 2), ePl.py(l) + (l >= 0 ? -10 : 10), right ? ok : bad, 'center', 14, 700);
    });
  };

  const drawBell = (ctx: CanvasRenderingContext2D, p: Palette, plots: Box[]) => {
    const phiPl = mkPlot(plots[0], BELL.tMax, -0.0005, 0.005);
    const ePl = mkPlot(plots[1], BELL.tMax, -1.1, 1.1);
    const iPl = mkPlot(plots[2], BELL.tMax, -1.1 / BELL.R, 1.1 / BELL.R);
    axes(ctx, p, phiPl, { yTicks: [0, 0.002, 0.004], yFmt: (v) => milli(v), title: 'Φ (mWb)', color: p.bfield, tNums: false, tStep: 1 });
    axes(ctx, p, ePl, { yTicks: [-1, -0.5, 0, 0.5, 1], yFmt: (v) => sci(v), title: 'ε (V)', color: p.efield, tNums: false, tStep: 1 });
    axes(ctx, p, iPl, { yTicks: [-0.1, -0.05, 0, 0.05, 0.1], yFmt: (v) => milli(v), title: 'I (mA)', color: p.current, tNums: true, tStep: 1 });
    polyline(ctx, phiPl, sample(bellPhi, 0, BELL.tMax), p.bfield, 2.6);
    // the tangent at the cursor: its slope is dΦ/dt, and ε = −N times it
    const slope = -bellEps(s.t) / BELL.N;
    const half = 0.7;
    polyline(ctx, phiPl, [
      [s.t - half, bellPhi(s.t) - slope * half],
      [s.t + half, bellPhi(s.t) + slope * half],
    ], p.hand, 2);
    const iOf = (t: number) => bellEps(t) / BELL.R;
    const iPts = sample(iOf, 0, s.t, Math.max(2, Math.round((s.t / BELL.tMax) * 240)));
    if (s.showArea) fillArea(ctx, iPl, iPts, withAlpha(p.current, 0.28));
    polyline(ctx, ePl, sample(bellEps, 0, s.t, Math.max(2, Math.round((s.t / BELL.tMax) * 240))), p.efield, 2.6);
    polyline(ctx, iPl, iPts, p.current, 2.6);
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink, 0.55);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    const x = Math.round(phiPl.px(s.t)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, plots[0].y);
    ctx.lineTo(x, plots[2].y + plots[2].h);
    ctx.stroke();
    ctx.restore();
    for (const [pl, y, c] of [
      [phiPl, bellPhi(s.t), p.bfield],
      [ePl, bellEps(s.t), p.efield],
      [iPl, iOf(s.t), p.current],
    ] as const) {
      ctx.save();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(pl.px(s.t), pl.py(y), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { scene, plots } = layout(view.w, view.h, s.mode);
    if (s.mode === 'strip') {
      if (scene) drawScene(ctx, p, scene);
      drawStrip(ctx, p, plots);
    } else if (s.mode === 'build') drawBuild(ctx, p, plots);
    else drawBell(ctx, p, plots);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  /* ------------------------------------------------------------------ pointer and keys */

  const at = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const pointer = (e: PointerEvent, phase: 'down' | 'move') => {
    const view = viewRef.current;
    if (!view) return;
    const [x, y] = at(e);
    const { scene, plots } = layout(view.w, view.h, s.mode);
    const last = plots[2];
    const inPlots = x >= plots[0].x - 4 && x <= plots[0].x + plots[0].w + 4 && y >= plots[0].y && y <= last.y + last.h;
    if (phase === 'down') {
      if (s.mode === 'strip' && scene && y <= scene.y + scene.h) dragging.current = 'scene';
      else if (s.mode === 'build' && y >= plots[1].y - 4 && y <= plots[1].y + plots[1].h + 4) dragging.current = 'emf';
      else if (s.mode !== 'build' && inPlots) dragging.current = 'plot';
      else return;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    const kind = dragging.current;
    if (!kind) return;
    if (kind === 'scene' && scene) {
      const k = Math.min(scene.w / (XMAX - XMIN), scene.h / SCENE_H);
      const ox = scene.x + (scene.w - k * (XMAX - XMIN)) / 2;
      const xw = XMIN + (x - ox) / k;
      scrub((xw - STRIP.w / 2 - STRIP.x0) / s.v);
    } else if (kind === 'plot') {
      const tMax = s.mode === 'strip' ? T_AXIS : BELL.tMax;
      const t = ((x - plots[0].x) / plots[0].w) * tMax;
      scrub(round(t, 0.01));
    } else if (kind === 'emf') {
      const t = ((x - plots[1].x) / plots[1].w) * pr.tMax;
      const i = pieceAt(ps, clamp(t, 0, pr.tMax - 1e-9));
      if (i < 0) return;
      const pl = mkPlot(plots[1], pr.tMax, pr.emfRange[0], pr.emfRange[1]);
      const level = pl.hi - ((y - plots[1].y) / plots[1].h) * (pl.hi - pl.lo);
      setLevel(i, level);
    }
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (s.mode === 'build') {
      if (e.key === 'ArrowRight') act({ sel: Math.min(ps.length - 1, s.sel + 1) });
      else if (e.key === 'ArrowLeft') act({ sel: Math.max(0, s.sel - 1) });
      else if (e.key === 'ArrowUp') setLevel(s.sel, (s.levels[s.sel] ?? 0) + pr.emfStep);
      else if (e.key === 'ArrowDown') setLevel(s.sel, (s.levels[s.sel] ?? 0) - pr.emfStep);
      else return;
      e.preventDefault();
    } else {
      const step = s.mode === 'strip' ? 0.1 : 0.05;
      if (e.key === 'ArrowRight') scrub(round(s.t + step, 0.01));
      else if (e.key === 'ArrowLeft') scrub(round(s.t - step, 0.01));
      else return;
      e.preventDefault();
    }
  };

  /* ------------------------------------------------------------------ panel */

  const stripReadout = () => {
    const area = stripArea(s.v, s.t);
    const q = passCharge(pass, 0, s.t);
    return (
      <>
        <span>
          הרגע <b class="q">t = {sci(Number(s.t.toFixed(2)))} s</b>; השטף <b class="q">Φ = {sci(phiNow)} Wb</b>; הכא"מ <b class="q">ε = {sci(epsNow)} V</b>
        </span>
        <span>
          {iNow === 0 ? (
            <>
              הזרם: <b class="q">I = 0</b>, אין זרם
            </>
          ) : (
            <>
              הזרם: <b class="q">I = {sci(iNow)} A</b>, {sense(iNow)}
            </>
          )}
        </span>
        {s.showForce && (
          <span>
            {push > 0 ? (
              <>
                הדחיפה הדרושה: <b class="q">F = {sci(push)} N</b>; ההספק שלה <b class="q">F·v = {sci(passPushPower(pass, s.t))} W</b>, וההספק שהופך לחום <b class="q">I²R = {sci(passHeatPower(pass, s.t))} W</b>
              </>
            ) : (
              <>לא צריך לדחוף: אין זרם, ולכן אין כוח מגנטי על הלולאה.</>
            )}
          </span>
        )}
        {s.showArea && (
          <span>
            המטען שעבר עד עכשיו: השטח מתחת לגרף <b class="q">Σ I·Δt = {sci(area)} C</b>, ומהשטף <b class="q">−ΔΦ/R = {sci(q)} C</b>
          </span>
        )}
        {s.ghostV !== null && s.ghostV !== s.v && <span>הקו המקווקו: המעבר הקודם, במהירות <b class="q">{sci(s.ghostV)} m/s</b></span>}
      </>
    );
  };

  const buildReadout = () => {
    const q = ps[s.sel];
    const l = s.levels[s.sel];
    const nRight = s.levels.filter((_, i) => correctAt(s, i)).length;
    return (
      <>
        <span>
          {pr.src === 'flux' ? (
            <>
              כריכה של <b class="q">N = {pr.N}</b> ליפופים, התנגדות <b class="q">R = {pr.R} Ω</b>; הגרף העליון הוא השטף דרך ליפוף אחד
            </>
          ) : (
            <>
              לולאה קבועה: <b class="q">N = {pr.N}</b> ליפופים, כל אחד בשטח <b class="q">A = {sci(pr.A)} m²</b>, ניצב לשדה; <b class="q">R = {pr.R} Ω</b>
            </>
          )}
        </span>
        <span>
          הקטע הנבחר: <b class="q">{sci(q.t0)}–{sci(q.t1)} s</b>; השיפוע שם{' '}
          <b class="q">
            {pr.src === 'flux' ? `ΔΦ/Δt = ${milli(q.slope)} mWb/s` : `ΔB/Δt = ${milli(q.slope / pr.A)} mT/s`}
          </b>
          ; הכא"מ שקבעתם <b class="q">{l === null ? '?' : `ε = ${milli(l)} mV`}</b>
        </span>
        {s.checked && (
          <span>
            {allRight(s) ? (
              <>כל המדרגות נכונות. גרף הזרם הוא אותן מדרגות, מחולקות ב-R.</>
            ) : (
              <>
                נכונות {nRight} מתוך {ps.length} מדרגות. בכל קטע הכא"מ הוא מינוס N כפול השיפוע{pr.src === 'field' ? ' של B, כפול A' : ''}.
              </>
            )}
          </span>
        )}
      </>
    );
  };

  const bellReadout = () => {
    const slope = -bellEps(s.t) / BELL.N;
    const I = bellEps(s.t) / BELL.R;
    return (
      <>
        <span>
          הרגע <b class="q">t = {sci(Number(s.t.toFixed(2)))} s</b>; השטף דרך ליפוף <b class="q">Φ = {milli(bellPhi(s.t), 2)} mWb</b>; שיפוע המשיק{' '}
          <b class="q">ΔΦ/Δt = {milli(slope, 2)} mWb/s</b>
        </span>
        <span>
          עם <b class="q">N = {BELL.N}</b> ליפופים: <b class="q">ε = {sci(Math.abs(bellEps(s.t)) < 5e-4 ? 0 : bellEps(s.t))} V</b>, ועם <b class="q">R = {BELL.R} Ω</b>: <b class="q">I = {Math.abs(I) < 5e-5 ? '0' : `${milli(I)} mA`}</b>
        </span>
        {s.showArea && (
          <span>
            המטען שעבר: השטח <b class="q">{sci(riemann((t) => bellEps(t) / BELL.R, 0, s.t, 400) || 0)} C</b>; ומהשטף{' '}
            <b class="q">−NΔΦ/R = {sci(chargeThrough(BELL.N, bellPhi(0), bellPhi(s.t), BELL.R))} C</b>
          </span>
        )}
      </>
    );
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${describe()}`}
      canvasRef={canvasRef}
      aspect={s.mode === 'strip' ? (narrow ? 0.78 : 1.1) : narrow ? 1 : 1.3}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => pointer(e, 'down')}
      onPointerMove={(e) => {
        if (dragging.current) pointer(e, 'move');
      }}
      onPointerUp={() => {
        dragging.current = null;
      }}
      cursor={s.mode === 'build' ? 'pointer' : 'ew-resize'}
      onReset={() => {
        userActed.current = false;
        userRun.current = false;
        entered.current.clear();
        lastPass.current = null;
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={s.mode === 'strip' ? stripReadout() : s.mode === 'build' ? buildReadout() : bellReadout()}
      controls={
        <>
          {modes.length > 1 && (
            <div class="group" role="group" aria-label="המצב">
              {modes.map((m) => (
                <button type="button" key={m} class={`toggle ${s.mode === m ? 'on' : ''}`} aria-pressed={s.mode === m} onClick={() => switchMode(m)}>
                  {MODE_NAME[m]}
                </button>
              ))}
            </div>
          )}
          {s.mode === 'strip' && (
            <>
              <div class="group" role="group" aria-label="הזמן">
                <button type="button" class="toggle" onClick={play}>
                  {s.playing ? 'עצרו' : s.t >= tEnd - 1e-9 ? 'שוב מההתחלה' : 'הפעילו'}
                </button>
                <Toggle label="הכוחות" on={s.showForce} onChange={(v) => act({ showForce: v })} />
                {props.areaControl && <Toggle label="השטח מתחת ל-I(t)" on={s.showArea} onChange={(v) => act({ showArea: v })} />}
              </div>
              <Slider label="המהירות v" value={s.v} min={V_MIN} max={V_MAX} step={0.05} format={(v) => `${sci(v)} m/s`} onChange={setSpeed} />
              <Slider label="הזמן t" value={Number(s.t.toFixed(2))} min={0} max={Number(tEnd.toFixed(2))} step={0.05} format={(v) => `${sci(v)} s`} onChange={(v) => scrub(v)} />
            </>
          )}
          {s.mode === 'build' && (
            <>
              {props.presetControl && (
                <div class="group" role="group" aria-label="הגרף הנתון">
                  {(
                    [
                      ['flux', 'גרף של השטף'],
                      ['field', 'גרף של השדה'],
                    ] as const
                  ).map(([k, name]) => (
                    <button type="button" key={k} class={`toggle ${s.preset === k ? 'on' : ''}`} aria-pressed={s.preset === k} onClick={() => setPreset(k)}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
              <div class="group" role="group" aria-label="מדרגות הכא״מ">
                <button type="button" class="toggle" onClick={() => act({ sel: Math.max(0, s.sel - 1) })} aria-label="הקטע הקודם">
                  ◀ קטע קודם
                </button>
                <button type="button" class="toggle" onClick={() => act({ sel: Math.min(ps.length - 1, s.sel + 1) })} aria-label="הקטע הבא">
                  קטע הבא ▶
                </button>
                <button type="button" class="toggle" onClick={() => setLevel(s.sel, (s.levels[s.sel] ?? 0) + pr.emfStep)}>
                  ε למעלה
                </button>
                <button type="button" class="toggle" onClick={() => setLevel(s.sel, (s.levels[s.sel] ?? 0) - pr.emfStep)}>
                  ε למטה
                </button>
              </div>
              <div class="group" role="group" aria-label="בדיקה">
                <button type="button" class="toggle" onClick={check}>
                  בדיקה
                </button>
                <Toggle label="הראו את התשובה" on={s.reveal} onChange={(v) => act({ reveal: v })} />
              </div>
            </>
          )}
          {s.mode === 'bell' && (
            <>
              <Slider label="הסמן t" value={Number(s.t.toFixed(2))} min={0} max={BELL.tMax} step={0.05} format={(v) => `${sci(v)} s`} onChange={(v) => scrub(v)} />
              {props.areaControl && (
                <div class="group" role="group" aria-label="השטח">
                  <Toggle label="השטח מתחת ל-I(t)" on={s.showArea} onChange={(v) => act({ showArea: v })} />
                </div>
              )}
            </>
          )}
        </>
      }
    />
  );
}
