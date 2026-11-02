/**
 * Div/curl probe (lessons 6.7 and 6.8): a small square probe that the learner drags through a field and
 * shrinks.
 * - Box mode: the square is the face of a cube of side a; the readout gives the net outward flux Φ, the
 *   volume a³, the ratio Φ/V, and the divergence the ratio tends to as a → 0. Arrows on each edge show the
 *   field's normal component, out or in.
 * - Loop mode: the square is a loop walked counter-clockwise; the readout gives the circulation, the area a²,
 *   their ratio, and the curl it tends to. A paddle wheel at the centre turns with the circulation per area
 *   (counter-clockwise when it is positive), and arrows along each edge show the field's tangential component.
 * - Split: the probe cut into N×N smaller probes, each marked with the sign of its own flux or circulation,
 *   and the sum compared with the big probe's (the divergence theorem, Stokes' theorem).
 * - An inset plots the ratio against the probe size a, down to a → 0, with the derivative value as the end point.
 *
 * Every field is z-independent (src/physics/divcurl.ts), so the 2D picture is an honest 3D box. Every number
 * comes from src/physics/divcurl.ts and vectorcalc.ts.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  boxReading,
  enclosesSingularity,
  FIELDS,
  GRADED_RHO0,
  LINE_LAMBDA,
  loopReading,
  ratioCurve,
  ROD_R,
  ROD_RHO,
  SLAB_D,
  SLAB_J,
  splitProbe,
  THICK_I,
  UNIFORM_E,
  WIRE_I,
  GRADED_J0,
  type FieldId,
} from '~/physics/divcurl';
import { EPS0, K, MU0 } from '~/physics/constants';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { arrow, chargeDisc, depthGlyph, paperGrid, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const WORLD_W = 0.24;
const WORLD_H = 0.18;
const GRID = 0.02;
const A_MIN = 0.005;
const A_MAX = 0.08;
/** midpoint samples per edge for the readouts */
const SAMPLES = 400;

type Mode = 'box' | 'loop';
type Vec2 = [number, number];

const FIELD_LABEL: Record<FieldId, string> = {
  uniform: 'שדה אחיד',
  line: 'קו טעון',
  rod: 'מוט טעון',
  graded: 'מוט, צפיפות שגדלה',
  wire: 'תיל דק',
  thick: 'תיל עבה',
  gradedWire: 'תיל עבה, צפיפות שגדלה',
  slab: 'שכבת זרם',
};

/** the field magnitude that draws a full-length arrow, and the ratio that turns the paddle wheel at full speed */
const REF: Record<FieldId, { F: number; ratio: number }> = {
  uniform: { F: UNIFORM_E, ratio: ROD_RHO / EPS0 },
  line: { F: (2 * K * LINE_LAMBDA) / 0.04, ratio: ROD_RHO / EPS0 },
  rod: { F: (ROD_RHO * ROD_R) / (2 * EPS0), ratio: ROD_RHO / EPS0 },
  graded: { F: (GRADED_RHO0 * ROD_R) / (3 * EPS0), ratio: GRADED_RHO0 / EPS0 },
  wire: { F: (MU0 * WIRE_I) / (2 * Math.PI * 0.04), ratio: (MU0 * WIRE_I) / 0.04 ** 2 },
  thick: { F: (MU0 * THICK_I) / (2 * Math.PI * ROD_R), ratio: (MU0 * THICK_I) / (Math.PI * ROD_R ** 2) },
  gradedWire: { F: (MU0 * GRADED_J0 * ROD_R) / 3, ratio: MU0 * GRADED_J0 },
  slab: { F: MU0 * SLAB_J * SLAB_D, ratio: MU0 * SLAB_J },
};

const TASK_LABEL: Record<string, string> = {
  'uniform-zero': 'בשדה האחיד: הזיזו את התיבה או שנו את גודלה. השדה לא אפס; מה השטף נטו?',
  'line-outside': 'ליד הקו הטעון: קרבו את התיבה לקו, עד 3 סנטימטרים ממנו, בלי שהקו יעבור בתוכה. מה Φ/V?',
  'rod-centre': 'במוט הטעון: הביאו את מרכז התיבה לציר של המוט, שם השדה אפס. האם גם השטף נטו אפס?',
  'graded-shrink': 'במוט שצפיפותו גדלה: מרכז התיבה בתוך המוט, והקטינו את התיבה לצלע של 1 סנטימטר או פחות. לאיזה מספר מתקרב Φ/V?',
  'split-box': 'חלקו את התיבה ל-3×3×3 קוביות או יותר, והשוו את סכום השטפים שלהן לשטף של התיבה הגדולה.',
  'line-zero': 'סביב הקו הטעון: הזיזו את הלולאה כך שתקיף את הקו. מה הסירקולציה?',
  'slab-turns': 'בשכבת הזרם: הכניסו את הלולאה כולה לתוך השכבה. קווי השדה ישרים; האם הגלגל מסתובב?',
  'wire-still': 'ליד התיל הדק: קרבו את הלולאה לתיל, עד 3 סנטימטרים ממנו, בלי שתקיף אותו. הקווים מעגלים; האם הגלגל מסתובב?',
  'graded-loop': 'בתיל שצפיפות הזרם בו גדלה: מרכז הלולאה בתוך התיל, והקטינו אותה לצלע של 1 סנטימטר או פחות. לאיזה מספר מתקרב היחס?',
  'split-loop': 'חלקו את הלולאה ל-3×3 לולאות או יותר, והשוו את סכום הסירקולציות שלהן לסירקולציה של הלולאה הגדולה.',
};

export interface DivCurlProbeProps {
  id: string;
  mode?: Mode;
  /** the mode buttons to offer; one mode (or none) hides them */
  modes?: Mode[];
  field?: FieldId;
  /** the field buttons to offer */
  fields?: FieldId[];
  /** probe centre [m] */
  at?: Vec2;
  /** probe side [m] */
  a?: number;
  /** N×N split; shown only with `split` */
  N?: number;
  split?: boolean;
  tasks?: string[];
}

interface State {
  mode: Mode;
  field: FieldId;
  at: Vec2;
  a: number;
  N: number;
}

function initial(p: DivCurlProbeProps): State {
  return { mode: p.mode ?? 'box', field: p.field ?? 'uniform', at: p.at ?? [0.06, 0.02], a: p.a ?? 0.04, N: p.N ?? 1 };
}

const snap = (v: number, q = 0.0025) => Math.round(v / q) * q;
const clampAt = (x: number, y: number): Vec2 => [
  Math.max(-WORLD_W / 2 + 0.005, Math.min(WORLD_W / 2 - 0.005, snap(x))),
  Math.max(-WORLD_H / 2 + 0.005, Math.min(WORLD_H / 2 - 0.005, snap(y))),
];
const cm = (m: number) => `${sci(Math.round(m * 1000) / 10)} cm`;
/** is the point p within 3 mm of the edge of the square of side a centred at (cx, cy)? */
function nearEdge(p: readonly [number, number], cx: number, cy: number, a: number) {
  const dx = Math.abs(p[0] - cx);
  const dy = Math.abs(p[1] - cy);
  const h = a / 2;
  const tol = 0.003;
  return (Math.abs(dx - h) < tol && dy < h + tol) || (Math.abs(dy - h) < tol && dx < h + tol);
}
/** a value that is zero up to rounding, shown as zero */
const clean = (v: number, scale: number) => (Math.abs(v) < 1e-4 * Math.abs(scale) ? 0 : v);

export default function DivCurlProbe(props: DivCurlProbeProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const spin = useRef({ angle: 0, lastT: 0 });
  const modes = props.modes ?? [];
  const fields = props.fields ?? [];
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (st.mode === 'box' || st.mode === 'loop') next.mode = st.mode;
          if (typeof st.field === 'string' && st.field in FIELDS) next.field = st.field as FieldId;
          if (Array.isArray(st.at) && st.at.length === 2) next.at = [Number(st.at[0]), Number(st.at[1])];
          if (typeof st.a === 'number') next.a = st.a;
          if (typeof st.N === 'number') next.N = st.N;
          return next;
        });
      }),
    [props.id],
  );

  const f = FIELDS[s.field];
  const ref = REF[s.field];
  const [cx, cy] = s.at;
  // fine sampling: a probe a few centimetres from a line source needs it for the zero to come out as zero
  const box = useMemo(() => (s.mode === 'box' ? boxReading(f.F, cx, cy, s.a, SAMPLES) : null), [s.mode, s.field, cx, cy, s.a]);
  const loop = useMemo(() => (s.mode === 'loop' ? loopReading(f.F, cx, cy, s.a, SAMPLES) : null), [s.mode, s.field, cx, cy, s.a]);
  const curve = useMemo(
    () =>
      ratioCurve(f.F, cx, cy, s.mode, A_MIN, A_MAX, 30, 160)
        // drop the sizes whose edge runs through a line source or thin wire: the midpoint sum is meaningless there
        .filter(([a]) => !f.singular || !nearEdge(f.singular, cx, cy, a))
        .map(([a, r]) => [a, clean(r, REF[s.field].ratio)] as const),
    [s.mode, s.field, cx, cy],
  );
  const singular = enclosesSingularity(f, cx, cy, s.a);
  const ratio = clean(box ? box.ratio : loop!.ratio, ref.ratio);
  const limit = clean(box ? box.limit : loop!.limit, ref.ratio);
  const integral = clean(box ? box.flux : loop!.circulation, ref.ratio * s.a ** (box ? 3 : 2));
  const split = useMemo(() => (props.split && s.N > 1 ? splitProbe(f.F, cx, cy, s.a, s.N, s.mode, 60) : null), [props.split, s.mode, s.field, cx, cy, s.a, s.N]);
  const Fc = f.F(cx, cy);
  const Fmag = Math.hypot(Fc[0], Fc[1]);

  /** a change made by the learner (never a text step): check the tasks against the new state */
  const user = (next: State) => {
    setS(next);
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const fl = FIELDS[next.field];
    const [x, y] = next.at;
    const inBox = enclosesSingularity(fl, x, y, next.a);
    const r = Math.hypot(x, y);
    if (next.mode === 'box') {
      if (has('uniform-zero') && next.field === 'uniform') done('uniform-zero');
      if (has('line-outside') && next.field === 'line' && !inBox && r <= 0.03 + 1e-9) done('line-outside');
      if (has('rod-centre') && next.field === 'rod' && r < 0.003) done('rod-centre');
      if (has('graded-shrink') && next.field === 'graded' && r < ROD_R && next.a <= 0.01 + 1e-9) done('graded-shrink');
      if (has('split-box') && next.N >= 3) done('split-box');
    } else {
      if (has('line-zero') && next.field === 'line' && inBox) done('line-zero');
      if (has('slab-turns') && next.field === 'slab' && Math.abs(y) + next.a / 2 <= SLAB_D + 1e-9) done('slab-turns');
      if (has('wire-still') && next.field === 'wire' && !inBox && r <= 0.03 + 1e-9) done('wire-still');
      if (has('graded-loop') && next.field === 'gradedWire' && r < ROD_R && next.a <= 0.01 + 1e-9) done('graded-loop');
      if (has('split-loop') && next.N >= 3) done('split-loop');
    }
  };

  /* ------------------------------------------------------------------ draw */

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    paperGrid(ctx, view, p, GRID);
    const fieldColor = f.kind === 'E' ? p.efield : p.bfield;
    const px = (m: number) => m * view.ppm;

    // the source
    ctx.save();
    if (s.field === 'rod' || s.field === 'graded') {
      const [ox, oy] = toScreen(view, 0, 0);
      ctx.fillStyle = withAlpha(p.pos, 0.1);
      ctx.strokeStyle = withAlpha(p.pos, 0.7);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ox, oy, px(ROD_R), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      plusMarks(ctx, view, p.pos, s.field === 'graded');
    } else if (s.field === 'line') {
      const [ox, oy] = toScreen(view, 0, 0);
      chargeDisc(ctx, ox, oy, 8, 1, p);
    } else if (s.field === 'wire') {
      const [ox, oy] = toScreen(view, 0, 0);
      depthGlyph(ctx, ox, oy, 8, 'out', p.current, { fill: p.paper, width: 2 });
    } else if (s.field === 'thick' || s.field === 'gradedWire') {
      const [ox, oy] = toScreen(view, 0, 0);
      ctx.fillStyle = withAlpha(p.current, 0.12);
      ctx.strokeStyle = withAlpha(p.current, 0.8);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ox, oy, px(ROD_R), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      dotMarks(ctx, view, p.current, (x, y) => x * x + y * y < ROD_R * ROD_R * 0.92, s.field === 'gradedWire');
    } else if (s.field === 'slab') {
      const [, top] = toScreen(view, 0, SLAB_D);
      const [, bot] = toScreen(view, 0, -SLAB_D);
      ctx.fillStyle = withAlpha(p.current, 0.12);
      ctx.fillRect(0, top, view.w, bot - top);
      ctx.strokeStyle = withAlpha(p.current, 0.8);
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(view.w, top);
      ctx.moveTo(0, bot);
      ctx.lineTo(view.w, bot);
      ctx.stroke();
      ctx.setLineDash([]);
      dotMarks(ctx, view, p.current, (_x, y) => Math.abs(y) < SLAB_D * 0.8, false);
    }
    ctx.restore();

    // the field: an arrow per grid point, length ∝ |F| up to a cap
    const full = px(GRID) * 0.8;
    for (let gx = -WORLD_W / 2 + GRID / 2; gx < WORLD_W / 2; gx += GRID) {
      for (let gy = -WORLD_H / 2 + GRID / 2; gy < WORLD_H / 2; gy += GRID) {
        const v = f.F(gx, gy);
        const m = Math.hypot(v[0], v[1]);
        if (m === 0) continue;
        const L = full * Math.min(1, m / ref.F);
        if (L < 3) continue;
        const [sx, sy] = toScreen(view, gx, gy);
        const ux = v[0] / m;
        const uy = -v[1] / m;
        arrow(ctx, sx - (ux * L) / 2, sy - (uy * L) / 2, sx + (ux * L) / 2, sy + (uy * L) / 2, { color: fieldColor, width: 1.6, head: 6, alpha: 0.7 });
      }
    }

    // the probe
    const h = s.a / 2;
    const [l, top] = toScreen(view, cx - h, cy + h);
    const side = px(s.a);
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.07);
    ctx.fillRect(l, top, side, side);
    if (split) {
      const b = side / s.N;
      const big = Math.max(...split.parts.map(Math.abs)) || 1;
      ctx.font = `600 ${Math.min(16, b * 0.5)}px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      split.parts.forEach((v, k) => {
        const i = k % s.N;
        const j = Math.floor(k / s.N);
        const x0 = l + i * b;
        const y0 = top + side - (j + 1) * b;
        const w = clean(v, big * 1e3);
        if (w !== 0) {
          ctx.fillStyle = withAlpha(w > 0 ? p.pos : p.neg, 0.08 + 0.25 * Math.min(1, Math.abs(w) / big));
          ctx.fillRect(x0, y0, b, b);
        }
        if (b >= 16) {
          ctx.fillStyle = p.ink2;
          ctx.fillText(w > 0 ? '+' : w < 0 ? '−' : '0', x0 + b / 2, y0 + b / 2);
        }
      });
      ctx.strokeStyle = withAlpha(p.accent, 0.7);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (let k = 1; k < s.N; k++) {
        ctx.moveTo(l + k * b, top);
        ctx.lineTo(l + k * b, top + side);
        ctx.moveTo(l, top + k * b);
        ctx.lineTo(l + side, top + k * b);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(l, top, side, side);
    ctx.restore();

    // arrows on the edges: the normal component (box) or the tangential component (loop)
    const edgeLen = Math.min(px(0.018), side * 0.45);
    const per = side >= 60 ? 4 : side >= 30 ? 2 : 1;
    const edges: { n: Vec2; t: Vec2; at: (u: number) => Vec2 }[] = [
      { n: [0, -1], t: [1, 0], at: (u) => [cx + u, cy - h] }, // bottom, walked →
      { n: [1, 0], t: [0, 1], at: (u) => [cx + h, cy + u] }, // right, walked ↑
      { n: [0, 1], t: [-1, 0], at: (u) => [cx - u, cy + h] }, // top, walked ←
      { n: [-1, 0], t: [0, -1], at: (u) => [cx - h, cy - u] }, // left, walked ↓
    ];
    for (const e of edges) {
      for (let k = 0; k < per; k++) {
        const u = -h + ((k + 0.5) * s.a) / per;
        const [wx, wy] = e.at(u);
        const v = f.F(wx, wy);
        const dir = s.mode === 'box' ? e.n : e.t;
        const c = v[0] * dir[0] + v[1] * dir[1];
        const L = edgeLen * Math.min(1, Math.abs(c) / ref.F);
        if (L < 2.5) continue;
        const [sx, sy] = toScreen(view, wx, wy);
        const dx = dir[0] * Math.sign(c) * L;
        const dy = -dir[1] * Math.sign(c) * L;
        if (s.mode === 'box') {
          // outward: from the edge out; inward: from outside to the edge
          if (c > 0) arrow(ctx, sx, sy, sx + dx, sy + dy, { color: p.ink, width: 2.2, head: 7 });
          else arrow(ctx, sx - dx, sy - dy, sx, sy, { color: p.ink, width: 2.2, head: 7 });
        } else {
          arrow(ctx, sx - dx / 2, sy - dy / 2, sx + dx / 2, sy + dy / 2, { color: p.ink, width: 2.2, head: 7 });
        }
      }
    }

    if (s.mode === 'loop') {
      // the walking direction: small chevrons at the corners' midpoints, counter-clockwise
      ctx.save();
      ctx.fillStyle = p.accent;
      for (const e of edges) {
        const [wx, wy] = e.at(h * 0.999);
        const [sx, sy] = toScreen(view, wx, wy);
        const ux = e.t[0];
        const uy = -e.t[1];
        ctx.beginPath();
        ctx.moveTo(sx + ux * 6, sy + uy * 6);
        ctx.lineTo(sx - ux * 4 - uy * 5, sy - uy * 4 + ux * 5);
        ctx.lineTo(sx - ux * 4 + uy * 5, sy - uy * 4 - ux * 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // the paddle wheel turns with the circulation per area: counter-clockwise when positive
      const omega = singular ? Math.sign(ratio) * 3 : Math.max(-3, Math.min(3, (2 * ratio) / ref.ratio));
      const moving = motionAllowed();
      const dt = t - spin.current.lastT;
      spin.current.lastT = t;
      if (moving && dt > 0 && dt < 0.2) spin.current.angle += omega * dt;
      paddle(ctx, toScreen(view, cx, cy), Math.min(side * 0.38, 34), spin.current.angle, p.ink, p.paper);
    }

    inset(ctx, view, p);
  };

  /** "+" marks inside the rod: evenly spread, or denser towards the surface when ρ grows with s */
  function plusMarks(ctx: CanvasRenderingContext2D, view: View, color: string, graded: boolean) {
    ctx.save();
    ctx.strokeStyle = withAlpha(color, 0.75);
    ctx.lineWidth = 1.4;
    const d = 3;
    const rings = graded ? [0.35, 0.62, 0.85] : [0, 0.4, 0.75];
    const counts = graded ? [3, 8, 14] : [1, 6, 11];
    rings.forEach((rr, i) => {
      for (let k = 0; k < counts[i]; k++) {
        const th = (2 * Math.PI * k) / counts[i] + i * 0.4;
        const [x, y] = toScreen(view, rr * ROD_R * Math.cos(th), rr * ROD_R * Math.sin(th));
        ctx.beginPath();
        ctx.moveTo(x - d, y);
        ctx.lineTo(x + d, y);
        ctx.moveTo(x, y - d);
        ctx.lineTo(x, y + d);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  /** small ⊙ marks for current out of the page, on a lattice (or denser towards the surface when graded) */
  function dotMarks(ctx: CanvasRenderingContext2D, view: View, color: string, inside: (x: number, y: number) => boolean, graded: boolean) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    const marks: Vec2[] = [];
    if (graded) {
      [0.35, 0.62, 0.85].forEach((rr, i) => {
        const n = [3, 8, 14][i];
        for (let k = 0; k < n; k++) {
          const th = (2 * Math.PI * k) / n + i * 0.4;
          marks.push([rr * ROD_R * Math.cos(th), rr * ROD_R * Math.sin(th)]);
        }
      });
    } else {
      for (let x = -WORLD_W / 2 + 0.01; x < WORLD_W / 2; x += 0.02) for (let y = -WORLD_H / 2 + 0.01; y < WORLD_H / 2; y += 0.02) if (inside(x, y)) marks.push([x, y]);
    }
    for (const [x, y] of marks) {
      const [sx, sy] = toScreen(view, x, y);
      depthGlyph(ctx, sx, sy, 3.5, 'out', color, { width: 1.1 });
    }
    ctx.restore();
  }

  /** the convergence inset: the ratio against the probe side a, from A_MAX down to a → 0 */
  function inset(ctx: CanvasRenderingContext2D, view: View, p: FrameInfo['palette']) {
    const w = Math.max(118, view.w * 0.3);
    const hgt = Math.max(84, view.h * 0.3);
    // top-left: the stage's tool buttons sit top-right
    const x0 = 8;
    const y0 = 8;
    const vals = curve.filter(([a]) => !singular || a >= 0.02).map(([, r]) => r);
    vals.push(limit, ratio);
    let lo = Math.min(0, ...vals);
    let hi = Math.max(0, ...vals);
    if (hi - lo < 1e-30) {
      hi = ref.ratio;
      lo = -ref.ratio;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const L = x0 + 26;
    const R = x0 + w - 8;
    const T = y0 + 16;
    const B = y0 + hgt - 16;
    const X = (a: number) => L + ((R - L) * a) / A_MAX;
    const Y = (r: number) => B - ((B - T) * (Math.max(lo, Math.min(hi, r)) - lo)) / (hi - lo);
    ctx.save();
    ctx.fillStyle = withAlpha(p.paper, 0.92);
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, hgt, 6);
    ctx.fill();
    ctx.stroke();
    // axes
    ctx.strokeStyle = p.ink3;
    ctx.beginPath();
    ctx.moveTo(L, T - 4);
    ctx.lineTo(L, B);
    ctx.lineTo(R, B);
    ctx.stroke();
    // zero line
    if (lo < 0 && hi > 0) {
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(L, Y(0));
      ctx.lineTo(R, Y(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // the curve
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    curve.forEach(([a, r], k) => (k ? ctx.lineTo(X(a), Y(r)) : ctx.moveTo(X(a), Y(r))));
    ctx.stroke();
    // the limit at a = 0
    if (!singular) {
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(L, Y(limit), 4, 0, Math.PI * 2);
      ctx.fillStyle = p.paper;
      ctx.fill();
      ctx.stroke();
    }
    // the probe now
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(X(s.a), Y(ratio), 3.5, 0, Math.PI * 2);
    ctx.fill();
    // labels
    ctx.fillStyle = p.ink2;
    ctx.font = `11px ${p.fontUi}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillText('a', R, B + 3);
    ctx.textAlign = 'left';
    ctx.fillText('0', L - 3, B + 3);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s.mode === 'box' ? 'Φ/V' : '∮/A', x0 + 6, y0 + 13);
    ctx.restore();
  }

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: s.mode === 'loop' });
  useEffect(invalidate, [s]);

  /* ---------------------------------------------------------------- input */

  const describe = (st: State) =>
    `${st.mode === 'box' ? 'תיבה' : 'לולאה'} בצלע ${cm(st.a)}, במרכז (${cm(st.at[0])}, ${cm(st.at[1])}).`;

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const h = s.a / 2 + 6 / v.ppm;
    if (Math.abs(wx - cx) <= h && Math.abs(wy - cy) <= h) {
      drag.current = { dx: cx - wx, dy: cy - wy };
    } else {
      drag.current = { dx: 0, dy: 0 };
      user({ ...s, at: clampAt(wx, wy) });
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const at = clampAt(wx + d.dx, wy + d.dy);
    if (at[0] !== s.at[0] || at[1] !== s.at[1]) user({ ...s, at });
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const dirs: Record<string, Vec2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.02 : 0.005;
    const next = { ...s, at: clampAt(cx + d[0] * step, cy + d[1] * step) };
    user(next);
    setLive(describe(next));
  };
  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  /* -------------------------------------------------------------- readout */

  const isE = f.kind === 'E';
  const sym = isE ? 'E' : 'B';
  const unit = isE ? 'N/C' : 'T';
  const intUnit = s.mode === 'box' ? (isE ? 'N·m²/C' : 'T·m²') : isE ? 'V' : 'T·m';
  const ratioUnit = isE ? (s.mode === 'box' ? 'N/(C·m)' : 'V/m²') : 'T/m';
  const opName = s.mode === 'box' ? `∇·${sym}` : `(∇×${sym})z`;
  const wheel = ratio > 0 ? 'מסתובב נגד כיוון השעון' : ratio < 0 ? 'מסתובב עם כיוון השעון' : 'לא מסתובב';

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${FIELD_LABEL[s.field]}, ${s.mode === 'box' ? 'תיבה' : 'לולאה'} בצלע ${cm(s.a)}. ${
        s.mode === 'box' ? `השטף נטו חלקי הנפח ${sci(ratio)}` : `הסירקולציה חלקי השטח ${sci(ratio)}`
      }. גררו את ה${s.mode === 'box' ? 'תיבה' : 'לולאה'} בעכבר או במגע, או הקישו במקום כלשהו; במקלדת: חיצים מזיזים.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={
        <>
          <span>
            {s.mode === 'box' ? 'תיבה (קובייה)' : 'לולאה ריבועית'} בצלע <b class="q">a = {cm(s.a)}</b>,{' '}
            {s.mode === 'box' ? (
              <>
                ונפחה <b class="q">V = a³ = {sci(s.a ** 3)} m³</b>
              </>
            ) : (
              <>
                ושטחה <b class="q">A = a² = {sci(s.a ** 2)} m²</b>
              </>
            )}
          </span>
          <span>
            {s.mode === 'box' ? 'שטף נטו החוצה' : 'סירקולציה, נגד כיוון השעון'}:{' '}
            <b class="q">
              {s.mode === 'box' ? 'Φ' : `∮${sym}·dl`} = {sci(integral)} {intUnit}
            </b>
          </span>
          <span>
            היחס: <b class="q">{s.mode === 'box' ? 'Φ/V' : `∮${sym}·dl/A`} = {sci(ratio)} {ratioUnit}</b>
          </span>
          {singular ? (
            <span>
              <b>{s.field === 'line' ? 'הקו הטעון עובר בתוך הבדיקה' : 'התיל עובר בתוך הלולאה'}.</b>{' '}
              {s.mode === 'box' && s.field === 'line'
                ? 'השטף λa/ε₀ קטן כמו a, הנפח כמו a³, והיחס גדל בלי גבול כשהתיבה קטנה: אין כאן גבול.'
                : s.mode === 'loop' && s.field === 'wire'
                  ? 'הסירקולציה נשארת μ₀I, השטח קטן, והיחס גדל בלי גבול: אין כאן גבול.'
                  : 'אין כאן גבול.'}
            </span>
          ) : (
            <span>
              הגבול כש-<b class="q">a → 0</b>: <b class="q">{opName} = {sci(limit)} {ratioUnit}</b>
            </span>
          )}
          <span>
            השדה במרכז: <b class="q">|{sym}| = {sci(Fmag)} {unit}</b>
          </span>
          {s.mode === 'loop' && (
            <span>
              גלגל המשוטים: <b>{wheel}</b>
            </span>
          )}
          {split && (
            <span>
              {s.mode === 'box' ? `${s.N}×${s.N}×${s.N} קוביות קטנות, סכום השטפים שלהן` : `${s.N}×${s.N} לולאות קטנות, סכום הסירקולציות שלהן`}:{' '}
              <b class="q">{sci(clean(split.sum, ref.ratio * s.a ** (s.mode === 'box' ? 3 : 2)))} {intUnit}</b> · של הגדולה:{' '}
              <b class="q">{sci(clean(split.whole, ref.ratio * s.a ** (s.mode === 'box' ? 3 : 2)))} {intUnit}</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          {modes.length > 1 && (
            <div class="group" role="group" aria-label="סוג הבדיקה">
              {modes.map((m) => (
                <button type="button" key={m} class={`toggle ${s.mode === m ? 'on' : ''}`} aria-pressed={s.mode === m} onClick={() => user({ ...s, mode: m })}>
                  {m === 'box' ? 'תיבה' : 'לולאה'}
                </button>
              ))}
            </div>
          )}
          {fields.length > 1 && (
            <div class="group" role="group" aria-label="השדה">
              {fields.map((k) => (
                <button
                  type="button"
                  key={k}
                  class={`toggle ${s.field === k ? 'on' : ''}`}
                  aria-pressed={s.field === k}
                  onClick={() => {
                    user({ ...s, field: k });
                    setLive(`מוצג: ${FIELD_LABEL[k]}.`);
                  }}
                >
                  {FIELD_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          <Slider
            label={s.mode === 'box' ? 'צלע התיבה a' : 'צלע הלולאה a'}
            value={s.a}
            min={A_MIN}
            max={A_MAX}
            step={0.0025}
            format={cm}
            onChange={(v) => user({ ...s, a: Math.round(v * 4000) / 4000 })}
          />
          {props.split && (
            <Slider
              label={s.mode === 'box' ? 'חלוקה לקוביות N' : 'חלוקה ללולאות N'}
              value={s.N}
              min={1}
              max={5}
              step={1}
              format={(v) => (s.mode === 'box' ? `${v}×${v}×${v}` : `${v}×${v}`)}
              onChange={(v) => user({ ...s, N: v })}
            />
          )}
        </>
      }
    />
  );
}

/** a four-armed paddle wheel at (x, y), radius r, turned by `angle` (counter-clockwise on screen) */
function paddle(ctx: CanvasRenderingContext2D, [x, y]: [number, number], r: number, angle: number, ink: string, paper: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);
  ctx.strokeStyle = ink;
  ctx.fillStyle = paper;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.rotate((k * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    // the blade, so the turning is visible
    ctx.beginPath();
    ctx.rect(r * 0.55, -r * 0.16, r * 0.45, r * 0.32);
    ctx.fillStyle = k === 0 ? ink : paper;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2.5, r * 0.12), 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.restore();
}
