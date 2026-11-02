/**
 * Lesson 6.1's figure: a curve, a point P on it and a second point Q a step Δx away. The chord PQ
 * (the secant) has slope Δy/Δx, the average rate over the step. Shrinking the step slides Q toward P,
 * the chord turns into the tangent, and its slope readout settles on the derivative. A magnifier shows
 * the neighbourhood of P enlarged so the step always fills it: the closer Q, the straighter the curve looks.
 *
 * The curves are the course's own (free fall, the point-charge potential, an oscillator, a discharging
 * capacitor) plus the bare powers and sine the lesson derives rules for. Every number on screen comes
 * from src/physics/calculus.ts (`secantSlope`, `derivative`, `tangentLine`) and src/physics/rates.ts.
 * The figure shows the convergence; the lesson's algebra proves it.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { derivative, secantSlope, tangentLine, type Fn } from '~/physics/calculus';
import { dischargeCharge, fallPosition, oscillatorPosition, pointPotential, tangentZero } from '~/physics/rates';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { sci } from './core/format';
import { withAlpha } from './core/ink';
import { drawAxes, drawCurve, insetBox, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type CurveId = 'fall' | 'square' | 'cube' | 'sin' | 'potential' | 'oscillator' | 'discharge';

interface Curve {
  /** button label */
  name: string;
  /** accessible description */
  desc: string;
  f: Fn;
  /** plot window, also the domain Q may move in */
  x: [number, number];
  y: [number, number];
  xLabel: string;
  yLabel: string;
  /** the variable's symbol: Δt, Δx or Δr in the readout */
  xs: string;
  ys: string;
  xUnit: string;
  slopeUnit: string;
  /** starting P, the slider range for P and its step */
  x0: number;
  x0Range: [number, number];
  x0Step: number;
  /** the longest step offered */
  hMax: number;
  xTicks?: number[];
  xFormat?: (v: number) => string;
  /** a physical rate that is ± the derivative */
  rate?: { name: string; sign: 1 | -1; unit: string; symbol: string };
}

/** 1 nC: the potential curve; 1.2 mC on 100 μF through 20 kΩ (τ = 2 s): the discharge, in mC so slopes read in mA */
const Q_POT = 1e-9;
const Q0_MC = 1.2;
const TAU = 2;
const OSC_A = 0.5;
const OSC_W = 2;

const PI = Math.PI;
const piLabel = (v: number): string => {
  const k = Math.round((v / PI) * 2);
  if (Math.abs(v - (k * PI) / 2) > 1e-9) return sci(v, 3);
  if (k === 0) return '0';
  if (k === 2) return 'π';
  if (k % 2 === 0) return `${k / 2}π`;
  return k === 1 ? 'π/2' : `${k}π/2`;
};

export const CURVES: Record<CurveId, Curve> = {
  fall: {
    name: 'נפילה חופשית',
    desc: 'המקום של גוף בנפילה חופשית, x שווה 5 כפול t בריבוע',
    f: (t) => fallPosition(t),
    x: [0, 3],
    y: [0, 45],
    xLabel: 'הזמן t (s)',
    yLabel: 'המקום x (m)',
    xs: 't',
    ys: 'x',
    xUnit: 's',
    slopeUnit: 'm/s',
    x0: 1,
    x0Range: [0.5, 2.5],
    x0Step: 0.1,
    hMax: 1,
    rate: { name: 'המהירות', sign: 1, unit: 'm/s', symbol: 'v = dx/dt' },
  },
  square: {
    name: '⁦y = x²⁩',
    desc: 'הפרבולה y שווה x בריבוע',
    f: (x) => x * x,
    x: [-3, 3],
    y: [-1, 9],
    xLabel: 'x',
    yLabel: 'y',
    xs: 'x',
    ys: 'y',
    xUnit: '',
    slopeUnit: '',
    x0: 1,
    x0Range: [-2, 2],
    x0Step: 0.1,
    hMax: 1,
  },
  cube: {
    name: '⁦y = x³⁩',
    desc: 'הגרף y שווה x בשלישית',
    f: (x) => x ** 3,
    x: [-2.5, 2.5],
    y: [-16, 16],
    xLabel: 'x',
    yLabel: 'y',
    xs: 'x',
    ys: 'y',
    xUnit: '',
    slopeUnit: '',
    x0: 1,
    x0Range: [-2, 2],
    x0Step: 0.1,
    hMax: 0.5,
  },
  sin: {
    name: '⁦y = sin x⁩',
    desc: 'הגרף y שווה סינוס x, כש-x ברדיאנים',
    f: Math.sin,
    x: [-1.6, 7.9],
    y: [-1.4, 1.4],
    xLabel: 'x (רדיאנים)',
    yLabel: 'y',
    xs: 'x',
    ys: 'y',
    xUnit: '',
    slopeUnit: '',
    x0: 0,
    x0Range: [0, 2 * PI],
    x0Step: PI / 12,
    hMax: 1,
    xTicks: [0, PI / 2, PI, (3 * PI) / 2, 2 * PI],
    xFormat: piLabel,
  },
  potential: {
    name: 'פוטנציאל של מטען',
    desc: 'הפוטנציאל V שווה k Q חלקי r של מטען נקודתי של ננו-קולון אחד',
    f: (r) => pointPotential(r, Q_POT),
    x: [0.3, 3],
    y: [0, 30],
    xLabel: 'המרחק r (m)',
    yLabel: 'הפוטנציאל V (V)',
    xs: 'r',
    ys: 'V',
    xUnit: 'm',
    slopeUnit: 'V/m',
    x0: 1,
    x0Range: [0.8, 2.5],
    x0Step: 0.1,
    hMax: 0.5,
    rate: { name: 'השדה', sign: -1, unit: 'N/C', symbol: 'E = −dV/dr' },
  },
  oscillator: {
    name: 'מתנד',
    desc: 'המקום של מתנד, x שווה 0.5 כפול סינוס של 2t',
    f: (t) => oscillatorPosition(t, OSC_A, OSC_W),
    x: [-0.3, 6.5],
    y: [-0.7, 0.7],
    xLabel: 'הזמן t (s)',
    yLabel: 'המקום x (m)',
    xs: 't',
    ys: 'x',
    xUnit: 's',
    slopeUnit: 'm/s',
    x0: 0,
    x0Range: [0, 6],
    x0Step: 0.1,
    hMax: 0.5,
    rate: { name: 'המהירות', sign: 1, unit: 'm/s', symbol: 'v = dx/dt' },
  },
  discharge: {
    name: 'פריקת קבל',
    desc: 'המטען על קבל שמתפרק דרך נגד, q שווה 1.2 מיליקולון כפול e בחזקת מינוס t חלקי 2',
    f: (t) => dischargeCharge(t, Q0_MC, TAU),
    x: [0, 8],
    y: [0, 1.4],
    xLabel: 'הזמן t (s)',
    yLabel: 'המטען q (mC)',
    xs: 't',
    ys: 'q',
    xUnit: 's',
    slopeUnit: 'mC/s',
    x0: 0,
    x0Range: [0, 6],
    x0Step: 0.5,
    hMax: 2,
    rate: { name: 'הזרם', sign: -1, unit: 'mA', symbol: 'I = −dq/dt' },
  },
};

/** The steps offered, largest first: the slider walks Q toward P through them. */
export const STEPS = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];

const TASK_LABEL: Record<string, string> = {
  shrink: 'קרבו את Q אל P, עד מרחק של 0.01 או פחות, ועקבו אחרי שיפוע המיתר.',
  left: 'עכשיו העבירו את Q לצד השמאלי של P, וקרבו אותו שוב עד 0.01 או פחות.',
  'cube-slope': 'בגרף של ⁦y = x³⁩ הציבו את P ב-⁦x = 2⁩, וקרבו את Q עד 0.01 או פחות.',
  'sin-flat': 'בגרף של ⁦y = sin x⁩ הדליקו את המשיק, ומצאו נקודה שבה הוא אופקי.',
  'osc-start': 'בגרף של המתנד הציבו את P ב-⁦t = 0⁩, וקרבו את Q עד 0.01 או פחות.',
  'rc-tau': 'בגרף הפריקה הציבו את P ב-⁦t = 0⁩ והדליקו את המשיק.',
};

interface State {
  curve: CurveId;
  x0: number;
  /** index into STEPS */
  hi: number;
  side: 1 | -1;
  tangent: boolean;
  zoom: boolean;
}

export interface SecantToTangentProps {
  id: string;
  curve?: CurveId;
  /** the curves offered in the picker (none: no picker) */
  curves?: CurveId[];
  x0?: number;
  h?: number;
  tangent?: boolean;
  zoom?: boolean;
  tasks?: string[];
}

const nearestStep = (h: number) => {
  let best = 0;
  STEPS.forEach((v, i) => {
    if (Math.abs(Math.log(v / h)) < Math.abs(Math.log(STEPS[best] / h))) best = i;
  });
  return best;
};
const firstStep = (c: Curve) => STEPS.findIndex((v) => v <= c.hMax + 1e-12);

/** The step actually used: the chosen one, unless Q would leave the curve's window. */
function effectiveStep(s: State): number {
  const c = CURVES[s.curve];
  const room = s.side > 0 ? c.x[1] - s.x0 : s.x0 - c.x[0];
  let i = Math.max(s.hi, firstStep(c));
  while (i < STEPS.length - 1 && STEPS[i] > room + 1e-12) i++;
  return STEPS[i];
}

const snap = (v: number, step: number) => Math.round(v / step) * step;
/** a number for the readout: 5 significant figures, tiny round-off shown as 0 */
const num = (v: number, scale: number) => minus(sci(Math.abs(v) < 1e-9 * scale ? 0 : v, 5));
/** a typographic minus sign, not a hyphen, in front of negative numbers */
const minus = (t: string) => t.replace(/^-/, '−');

function fresh(p: SecantToTangentProps, curve: CurveId = p.curve ?? 'fall'): State {
  const c = CURVES[curve];
  return {
    curve,
    x0: curve === (p.curve ?? 'fall') && p.x0 !== undefined ? p.x0 : c.x0,
    hi: curve === (p.curve ?? 'fall') && p.h !== undefined ? nearestStep(p.h) : firstStep(c),
    side: 1,
    tangent: p.tangent ?? false,
    zoom: p.zoom ?? false,
  };
}

/** the four corners an inset of size `w×h` may take inside `box`, with room for the stage tools top-right */
function insetCorners(box: { x: number; y: number; w: number; h: number }, w: number, h: number) {
  const m = 8;
  return [
    { x: box.x + m, y: box.y + m },
    { x: box.x + box.w - w - m, y: box.y + m + 34 },
    { x: box.x + m, y: box.y + box.h - h - m },
    { x: box.x + box.w - w - m, y: box.y + box.h - h - m },
  ];
}

export default function SecantToTangent(props: SecantToTangentProps) {
  const [s, setS] = useState<State>(() => fresh(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const dragging = useRef(false);
  const plotRef = useRef<Plot | null>(null);

  const c = CURVES[s.curve];
  const h = effectiveStep(s) * s.side;
  const xQ = s.x0 + h;
  const yP = c.f(s.x0);
  const yQ = c.f(xQ);
  const secant = secantSlope(c.f, s.x0, h);
  const slope = derivative(c.f, s.x0);
  const scale = (c.y[1] - c.y[0]) / (c.x[1] - c.x[0]);
  const tanZero = s.curve === 'discharge' ? tangentZero(c.f, s.x0) : null;

  /** the student's own change: only these tick the tasks */
  const userSet = (patch: Partial<State>) => {
    const next = { ...s, ...patch };
    setS(next);
    const has = (t: string) => props.tasks?.includes(t);
    const step = effectiveStep(next);
    const at = (v: number) => Math.abs(next.x0 - v) < 1e-9;
    if (has('shrink') && step <= 0.01) markTask(`${props.id}:shrink`);
    if (has('left') && step <= 0.01 && next.side < 0) markTask(`${props.id}:left`);
    if (has('cube-slope') && next.curve === 'cube' && at(2) && step <= 0.01) markTask(`${props.id}:cube-slope`);
    if (has('sin-flat') && next.curve === 'sin' && next.tangent && Math.abs(Math.cos(next.x0)) < 1e-9) markTask(`${props.id}:sin-flat`);
    if (has('osc-start') && next.curve === 'oscillator' && at(0) && step <= 0.01) markTask(`${props.id}:osc-start`);
    if (has('rc-tau') && next.curve === 'discharge' && at(0) && next.tangent) markTask(`${props.id}:rc-tau`);
  };

  const pickCurve = (curve: CurveId) => {
    const f = fresh(props, curve);
    userSet({ curve, x0: f.x0, hi: f.hi });
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.curve === 'string' && st.curve in CURVES) {
            const curve = st.curve as CurveId;
            Object.assign(next, { curve, x0: CURVES[curve].x0, hi: firstStep(CURVES[curve]) });
          }
          if (typeof st.x0 === 'number') next.x0 = st.x0;
          if (typeof st.h === 'number') next.hi = nearestStep(st.h);
          if (st.side === 1 || st.side === -1) next.side = st.side;
          if (typeof st.tangent === 'boolean') next.tangent = st.tangent;
          if (typeof st.zoom === 'boolean') next.zoom = st.zoom;
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const id = setTimeout(() => {
      const parts = [`${c.ys} מול ${c.xs}. P ב-${c.xs} = ${num(s.x0, 1)}, המרחק ל-Q ${sci(Math.abs(h), 3)}, שיפוע המיתר ${num(secant, scale)}.`];
      if (s.tangent) parts.push(`שיפוע המשיק ${num(slope, scale)}.`);
      setLive(parts.join(' '));
    }, 300);
    return () => clearTimeout(id);
  }, [s]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const narrow = view.w < 420;
    const box = insetBox({ x: 0, y: 0, w: view.w, h: view.h }, { l: narrow ? 52 : 62, r: 14, t: 14, b: 46 });
    const plot = makePlot(
      box,
      { min: c.x[0], max: c.x[1], label: c.xLabel, ticks: c.xTicks, format: c.xFormat },
      { min: c.y[0], max: c.y[1], label: c.yLabel },
    );
    plotRef.current = plot;
    drawAxes(ctx, plot, p);

    // the horizontal axis y = 0 when it is inside the window
    if (c.y[0] < 0 && c.y[1] > 0) {
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(box.x, plot.py(0));
      ctx.lineTo(box.x + box.w, plot.py(0));
      ctx.stroke();
      ctx.restore();
    }

    const line = (m: number, x1: number, y1: number, color: string, width: number, dash: number[] = []) =>
      drawCurve(ctx, plot, (x) => y1 + m * (x - x1), { color, width, dash, samples: 2 });

    drawCurve(ctx, plot, c.f, { color: p.ink, width: 2.6, samples: 240 });

    // Δx and Δy legs
    const [sxP, syP] = [plot.px(s.x0), plot.py(yP)];
    const [sxQ, syQ] = [plot.px(xQ), plot.py(yQ)];
    if (Math.abs(sxQ - sxP) > 26) {
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sxP, syP);
      ctx.lineTo(sxQ, syP);
      ctx.lineTo(sxQ, syQ);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = p.ink2;
      ctx.font = `15px ${p.fontHand}`;
      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.textBaseline = syQ < syP ? 'top' : 'bottom';
      ctx.fillText(`Δ${c.xs}`, (sxP + sxQ) / 2, syP + (syQ < syP ? 4 : -4));
      if (Math.abs(syQ - syP) > 40) {
        ctx.textAlign = sxQ > sxP ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Δ${c.ys}`, sxQ + (sxQ > sxP ? 6 : -6), (syP + syQ) / 2);
      }
      ctx.restore();
    }

    line(secant, s.x0, yP, p.accent, 2.4);
    if (s.tangent) {
      line(slope, s.x0, yP, p.hand, 2.2, [8, 5]);
      if (tanZero !== null && tanZero <= c.x[1]) {
        const sx = plot.px(tanZero);
        const sy = plot.py(0);
        ctx.save();
        ctx.fillStyle = p.hand;
        ctx.beginPath();
        ctx.arc(sx, sy, 4.5, 0, 2 * PI);
        ctx.fill();
        ctx.font = `14px ${p.fontHand}`;
        ctx.direction = 'ltr';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`t = ${num(tanZero, 1)} s`, sx + 7, sy - 4);
        ctx.restore();
      }
    }

    const dot = (sx: number, sy: number, filled: boolean, label: string, color: string) => {
      ctx.save();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = color;
      ctx.fillStyle = filled ? color : p.paper;
      ctx.beginPath();
      ctx.arc(sx, sy, filled ? 6 : 5.5, 0, 2 * PI);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.ink;
      ctx.font = `600 13px ${p.fontUi}`;
      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, sx, sy - 9);
      ctx.restore();
    };
    const close = Math.abs(sxQ - sxP) < 14 && Math.abs(syQ - syP) < 14;
    if (!close) dot(sxQ, syQ, false, 'Q', p.accent);
    dot(sxP, syP, true, close ? 'P, Q' : 'P', p.accent);

    if (s.zoom) drawZoom(ctx, plot, p, narrow);
  };

  /** P's neighbourhood magnified so the step spans a third of the inset, the same factor on both axes */
  const drawZoom = (ctx: CanvasRenderingContext2D, plot: Plot, p: FrameInfo['palette'], narrow: boolean) => {
    const W = narrow ? 96 : 150;
    const H = W;
    const sxP = plot.px(s.x0);
    const syP = plot.py(yP);
    const stepPx = Math.abs(plot.px(xQ) - sxP);
    const M = Math.max(1, W / 3 / Math.max(stepPx, 1e-9));
    // pick the corner the curve and the points least cover
    const covered = (cx: number, cy: number) => {
      let n = 0;
      for (let i = 0; i <= 60; i++) {
        const x = c.x[0] + ((c.x[1] - c.x[0]) * i) / 60;
        const sx = plot.px(x);
        const sy = plot.py(c.f(x));
        if (sx > cx - 6 && sx < cx + W + 6 && sy > cy - 6 && sy < cy + H + 6) n++;
      }
      if (sxP > cx - 10 && sxP < cx + W + 10 && syP > cy - 10 && syP < cy + H + 10) n += 100;
      return n;
    };
    const corners = insetCorners(plot.box, W, H);
    const best = corners.reduce((a, b) => (covered(b.x, b.y) < covered(a.x, a.y) ? b : a));
    const { x: bx, y: by } = best;
    const cx = bx + W / 2;
    const cy = by + H / 2;
    const map = (x: number, y: number): [number, number] => [cx + (plot.px(x) - sxP) * M, cy + (plot.py(y) - syP) * M];

    ctx.save();
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(bx, by, W, H);
    ctx.fill();
    ctx.stroke();
    ctx.clip();
    // world half-width shown in the inset
    const half = (W / 2 / M) / plot.box.w * (c.x[1] - c.x[0]);
    const stroke = (pts: [number, number][], color: string, width: number, dash: number[] = []) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const curvePts: [number, number][] = [];
    for (let i = 0; i <= 80; i++) {
      const x = s.x0 - half + (2 * half * i) / 80;
      curvePts.push(map(x, c.f(x)));
    }
    // the chord wide and pale underneath, the tangent dashed, the curve thin on top: all three stay visible
    const sec = (x: number) => yP + secant * (x - s.x0);
    stroke([map(s.x0 - half, sec(s.x0 - half)), map(s.x0 + half, sec(s.x0 + half))], withAlpha(p.accent, 0.55), 5);
    if (s.tangent) {
      const t = tangentLine(c.f, s.x0);
      stroke([map(s.x0 - half, t(s.x0 - half)), map(s.x0 + half, t(s.x0 + half))], p.hand, 2, [7, 4]);
    }
    stroke(curvePts, p.ink, 1.6);
    const [qx, qy] = map(xQ, yQ);
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.accent;
    ctx.fillStyle = p.paper;
    ctx.beginPath();
    ctx.arc(qx, qy, 4.5, 0, 2 * PI);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, 2 * PI);
    ctx.fill();
    ctx.fillStyle = withAlpha(p.paper, 0.85);
    ctx.fillRect(bx, by + H - 20, W, 20);
    ctx.fillStyle = p.ink2;
    ctx.font = `12px ${p.fontUi}`;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`הגדלה פי ${sci(M, 2)}`, cx, by + H - 10);
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.5, worldHeight: 1.1, animate: false });
  useEffect(invalidate, [s]);

  const pointerX = (e: PointerEvent) => {
    const plot = plotRef.current;
    if (!plot) return null;
    const x = c.x[0] + ((e.offsetX - plot.box.x) / plot.box.w) * (c.x[1] - c.x[0]);
    return Math.min(c.x0Range[1], Math.max(c.x0Range[0], snap(x, c.x0Step)));
  };
  const onPointerDown = (e: PointerEvent) => {
    const plot = plotRef.current;
    if (!plot) return;
    if (Math.hypot(e.offsetX - plot.px(s.x0), e.offsetY - plot.py(yP)) < 26) {
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const x = pointerX(e);
    if (x !== null && Math.abs(x - s.x0) > 1e-12) userSet({ x0: x });
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const x = snap(s.x0 + (e.key === 'ArrowRight' ? 1 : -1) * c.x0Step, c.x0Step);
      userSet({ x0: Math.min(c.x0Range[1], Math.max(c.x0Range[0], x)) });
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const hi = Math.min(STEPS.length - 1, Math.max(firstStep(c), STEPS.indexOf(Math.abs(h)) + (e.key === 'ArrowDown' ? 1 : -1)));
      userSet({ hi });
    }
  };

  const hNow = STEPS.indexOf(Math.abs(h));
  const unit = (u: string) => (u ? ` ${u}` : '');
  const x0Text = s.curve === 'sin' && piLabel(s.x0).includes('π') ? `${piLabel(s.x0)} ≈ ${sci(s.x0, 3)}` : num(s.x0, 1);
  const rate = c.rate;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${c.desc}. הנקודה P ב-${c.xs} = ${num(s.x0, 1)}, והנקודה Q במרחק ${sci(Math.abs(h), 3)} ${s.side > 0 ? 'מימין' : 'משמאל'} לה. שיפוע המיתר PQ הוא ${num(secant, scale)}${s.tangent ? `, ושיפוע המשיק בנקודה P הוא ${num(slope, scale)}` : ''}. גררו את P; במקלדת: חץ ימינה ושמאלה מזיז את P, חץ למטה מקרב את Q.`}
      canvasRef={canvasRef}
      aspect={1.5 / 1.1}
      live={live}
      tasks={tasks}
      cursor="grab"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onReset={() => {
        setS(fresh(props));
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            המרחק בין P ל-Q: <b class="q">Δ{c.xs} = {minus(sci(h, 3))}{unit(c.xUnit)}</b>
          </span>
          <span>
            שיפוע המיתר: <b class="q" data-readout="secant">Δ{c.ys}/Δ{c.xs} = {num(secant, scale)}{unit(c.slopeUnit)}</b>
          </span>
          {s.tangent && (
            <span>
              שיפוע המשיק (הנגזרת): <b class="q" data-readout="tangent">d{c.ys}/d{c.xs} = {num(slope, scale)}{unit(c.slopeUnit)}</b>
            </span>
          )}
          {s.tangent && rate && (
            <span>
              {rate.name}: <b class="q" data-readout="rate">{rate.symbol} = {num(rate.sign * slope, scale)} {rate.unit}</b>
            </span>
          )}
          {s.tangent && tanZero !== null && (
            <span>
              המשיק חוצה את ציר הזמן ב-<b class="q">t = {num(tanZero, 1)} s</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          {props.curves && props.curves.length > 1 && (
            <div class="group" role="group" aria-label="הגרף">
              {props.curves.map((id) => (
                <Toggle key={id} label={CURVES[id].name} on={s.curve === id} onChange={() => pickCurve(id)} />
              ))}
            </div>
          )}
          <Slider
            label={`המקום של P (${c.xs})`}
            value={s.x0}
            min={c.x0Range[0]}
            max={c.x0Range[1]}
            step={c.x0Step}
            format={() => `${x0Text}${unit(c.xUnit)}`}
            onChange={(v) => userSet({ x0: Math.min(c.x0Range[1], Math.max(c.x0Range[0], snap(v, c.x0Step))) })}
          />
          <Slider
            label="המרחק בין P ל-Q"
            value={STEPS.length - 1 - hNow}
            min={0}
            max={STEPS.length - 1 - firstStep(c)}
            step={1}
            format={(v) => `${sci(STEPS[STEPS.length - 1 - Math.round(v)], 3)}${unit(c.xUnit)}`}
            onChange={(v) => userSet({ hi: STEPS.length - 1 - Math.round(v) })}
          />
          <div class="group" role="group" aria-label="הצד של Q">
            <Toggle label="Q מימין ל-P" on={s.side > 0} onChange={() => userSet({ side: 1 })} />
            <Toggle label="Q משמאל ל-P" on={s.side < 0} onChange={() => userSet({ side: -1 })} />
          </div>
          <div class="group">
            <Toggle label="משיק" swatch="var(--hand)" on={s.tangent} onChange={(on) => userSet({ tangent: on })} />
            <Toggle label="זכוכית מגדלת" on={s.zoom} onChange={(on) => userSet({ zoom: on })} />
          </div>
        </>
      }
    />
  );
}
