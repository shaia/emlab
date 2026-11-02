/**
 * Riemann sums: the area under a graph cut into N rectangles (left, right or midpoint height) or N
 * trapezoids, next to the exact integral F(b) − F(a) and the error between them. Built for lesson 6.2.
 *
 * Under the graph, one of two panels:
 * - 'error': the relative error of each rule against N on log–log axes. Left/right fall as 1/N (a line
 *   of slope −1), midpoint/trapezoid as 1/N² (slope −2); on a straight line midpoint and trapezoid are
 *   exact, and the panel says so.
 * - 'accum': the area function A(b) = ∫ₐᵇ f, with its tangent at b. The tangent's slope is f(b): the
 *   fundamental theorem, seen.
 *
 * Sums come from src/physics/calculus.ts, exact areas and the physics cases (Coulomb work, a velocity
 * graph, a discharge current, a capacitor's V(q)) from src/physics/integrals.ts. Nothing moves on its
 * own, so still mode needs nothing extra. The figure supports intuition; the theorem comes from the
 * derivation in the text.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { derivative, riemann, riemannPieces, type RiemannRule } from '~/physics/calculus';
import { CASES, areaParts, exactIntegral, unsignedArea, type CaseId } from '~/physics/integrals';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, insetBox, makePlot, niceTicks, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Panel = 'error' | 'accum' | 'none';

const N_MAX = 200;
const RULES: RiemannRule[] = ['left', 'right', 'mid', 'trapezoid'];
const RULE_NAME: Record<RiemannRule, string> = { left: 'שמאלי', right: 'ימני', mid: 'נקודת אמצע', trapezoid: 'טרפז' };
const PHYSICS: FigureCase[] = ['coulomb', 'velocity', 'discharge', 'capacitor'];

interface Meta {
  /** display scale: shown value = SI value × scale */
  xs: number;
  ys: number;
  xLabel: string;
  yLabel: string;
  xUnit: string;
  /** what the area means, and its display unit */
  areaName: string;
  areaUnit: string;
  /** what the unsigned area means, where the graph crosses the axis */
  unsignedName?: string;
  chip: string;
  /** a short description for screen readers */
  said: string;
}

/** the cases the figure offers (integrals.ts also has `sine`, which the lesson does not draw) */
export type FigureCase = Exclude<CaseId, 'sine'>;

const META: Record<FigureCase, Meta> = {
  accel: {
    xs: 1, ys: 1, xLabel: 'הזמן t (שניות)', yLabel: 'v (מטר לשנייה)', xUnit: 's',
    areaName: 'הדרך', areaUnit: 'm', chip: 'מהירות עולה', said: 'גרף מהירות שעולה באחידות, ⁦v = 2t⁩',
  },
  parabola: {
    xs: 1, ys: 1, xLabel: 'x', yLabel: 'f(x) = x²', xUnit: '',
    areaName: 'השטח', areaUnit: '', chip: '⁦x²⁩', said: 'הגרף של ⁦x²⁩',
  },
  velocity: {
    xs: 1, ys: 1, xLabel: 'הזמן t (שניות)', yLabel: 'v (מטר לשנייה)', xUnit: 's',
    areaName: 'ההעתק', areaUnit: 'm', unsignedName: 'הדרך שהמכונית עברה', chip: 'מהירות: הלוך וחזור', said: 'גרף מהירות ⁦v = 4 − 2t⁩',
  },
  coulomb: {
    xs: 1, ys: 1, xLabel: 'המרחק r (מטר)', yLabel: 'F (ניוטון)', xUnit: 'm',
    areaName: 'עבודת הכוח החשמלי', areaUnit: 'J', chip: 'כוח קולון', said: 'גרף הכוח החשמלי בין שני מטענים כפונקציה של המרחק',
  },
  discharge: {
    xs: 1, ys: 1e3, xLabel: 'הזמן t (שניות)', yLabel: 'i (מיליאמפר)', xUnit: 's',
    areaName: 'המטען שעבר', areaUnit: 'mC', chip: 'זרם פריקה', said: 'גרף זרם הפריקה של קבל כפונקציה של הזמן',
  },
  capacitor: {
    xs: 1e6, ys: 1, xLabel: 'המטען q (מיקרו-קולון)', yLabel: 'V (וולט)', xUnit: 'μC',
    areaName: 'האנרגיה האגורה', areaUnit: 'μJ', chip: 'מתח על קבל', said: 'גרף המתח על קבל כפונקציה של המטען',
  },
};

const TASK_LABEL: Record<string, string> = {
  'left-1pct': 'בכלל השמאלי, הגדילו את N עד שהשגיאה קטנה מ-1%.',
  'all-rules': 'נסו את ארבעת הכללים: שמאלי, ימני, נקודת אמצע וטרפז.',
  'double-mid': 'בגרף של ⁦x²⁩ ובכלל נקודת האמצע, לחצו על "N כפול" וקראו פי כמה קטנה השגיאה.',
  'return-time': 'בגרף המהירות (הלוך וחזור), הזיזו את b עד שההעתק מתאפס: באיזה רגע המכונית חוזרת לנקודת המוצא?',
  'physics-units': 'עברו בין ארבעת הגרפים הפיזיקליים, וקראו בכל אחד מה מודד השטח ובאילו יחידות.',
  peak: 'בגרף המהירות (הלוך וחזור), הזיזו את b לרגע שבו ⁦A(b)⁩ הגדול ביותר. מה הגובה ⁦f(b)⁩ שם?',
};

export interface RiemannSumProps {
  id: string;
  preset?: FigureCase;
  /** cases offered as buttons; none or one: no chooser */
  presets?: FigureCase[];
  rule?: RiemannRule;
  n?: number;
  /** the upper end; default: the case's own */
  b?: number;
  /** offer a slider for b */
  showB?: boolean;
  panel?: Panel;
  tasks?: string[];
}

interface State {
  preset: FigureCase;
  rule: RiemannRule;
  n: number;
  b: number;
  seenRules: RiemannRule[];
  seenPresets: FigureCase[];
}

const fmt = (v: number, unit: string) => `${sci(Math.abs(v) < 1e-12 ? 0 : v, 3)}${unit ? ` ${unit}` : ''}`;
const pct = (r: number) => (r === 0 ? '0%' : r >= 0.001 ? `${sci(r * 100, 2)}%` : `${sci(r * 100, 1)}%`);
/** relative-error tick labels: 100%, 10%, 1%, 0.1%… */
const pctTick = (v: number) => `${Number((v * 100).toPrecision(1))}%`;

const bStep = (id: FigureCase) => (CASES[id].bMax - CASES[id].a) / 200;
const clampB = (id: FigureCase, b: number) => {
  const c = CASES[id];
  return Math.min(c.bMax, Math.max(c.a + bStep(id), b));
};

export default function RiemannSum(props: RiemannSumProps) {
  const panel: Panel = props.panel ?? 'error';
  const init = (): State => {
    const preset = props.preset ?? 'parabola';
    const rule = props.rule ?? 'left';
    return { preset, rule, n: props.n ?? 6, b: clampB(preset, props.b ?? CASES[preset].b), seenRules: [rule], seenPresets: [preset] };
  };
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const sRef = useRef(s);
  sRef.current = s;
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t);
  const done = (t: string) => markTask(`${props.id}:${t}`);

  // a text step shows a state; it never counts as the student's own try
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.preset === 'string' && st.preset in META) {
            next.preset = st.preset as FigureCase;
            next.b = CASES[next.preset].b;
          }
          if (typeof st.rule === 'string' && (RULES as string[]).includes(st.rule)) next.rule = st.rule as RiemannRule;
          if (typeof st.n === 'number') next.n = Math.max(1, Math.min(N_MAX, Math.round(st.n)));
          if (typeof st.b === 'number') next.b = clampB(next.preset, st.b);
          return next;
        });
      }),
    [props.id],
  );

  const c = CASES[s.preset];
  const m = META[s.preset];
  const areaScale = m.xs * m.ys;
  const exact = exactIntegral(c, c.a, s.b);
  const sum = riemann(c.f, c.a, s.b, s.n, s.rule);
  const scale = unsignedArea(c, c.a, s.b);
  const relErr = scale > 0 ? Math.abs(sum - exact) / scale : 0;
  const errOf = (n: number, rule: RiemannRule) => {
    const r = Math.abs(riemann(c.f, c.a, s.b, n, rule) - exact) / scale;
    return r < 1e-12 ? 0 : r;
  };
  const ratio = (() => {
    const e1 = errOf(s.n, s.rule);
    const e2 = errOf(2 * s.n, s.rule);
    return e1 > 0 && e2 > 0 ? e1 / e2 : null;
  })();
  const parts = areaParts(c, c.a, s.b);
  const crosses = parts.above > 1e-9 * scale && parts.below > 1e-9 * scale;
  const A = (x: number) => exactIntegral(c, c.a, x);
  const slopeAtB = derivative(A, s.b, 1e-6 * (c.bMax - c.a));

  /** relative error of every rule at every N, for the error panel */
  const curves = useMemo(() => {
    if (panel !== 'error') return null;
    const out = {} as Record<RiemannRule, number[]>;
    for (const rule of RULES) {
      const arr: number[] = [];
      for (let n = 1; n <= N_MAX; n++) arr.push(errOf(n, rule));
      out[rule] = arr;
    }
    return out;
  }, [s.preset, s.b, panel]);

  /** the student acts: apply, then tick whatever the new state completes */
  const act = (f: (prev: State) => State, how: 'double' | 'other' = 'other') => {
    const prev = sRef.current;
    const next = f(prev);
    setS(next);
    const cc = CASES[next.preset];
    const ex = exactIntegral(cc, cc.a, next.b);
    const sc = unsignedArea(cc, cc.a, next.b);
    const err = sc > 0 ? Math.abs(riemann(cc.f, cc.a, next.b, next.n, next.rule) - ex) / sc : 0;
    if (has('left-1pct') && next.rule === 'left' && err <= 0.01 + 1e-9) done('left-1pct');
    if (has('all-rules') && RULES.every((r) => next.seenRules.includes(r))) done('all-rules');
    if (has('double-mid') && how === 'double' && next.rule === 'mid' && next.preset === 'parabola') done('double-mid');
    if (has('return-time') && next.preset === 'velocity' && next.b > 2.5 && Math.abs(ex) < 0.15) done('return-time');
    if (has('physics-units') && PHYSICS.every((p) => next.seenPresets.includes(p))) done('physics-units');
    if (has('peak') && next.preset === 'velocity' && Math.abs(next.b - 2) < 0.03) done('peak');
    const nm = META[next.preset];
    setLive(
      panel === 'accum'
        ? `b = ${fmt(next.b * nm.xs, nm.xUnit)}. השטח עד b: ${fmt(ex * nm.xs * nm.ys, nm.areaUnit)}.`
        : `${next.n} חתיכות, כלל ${RULE_NAME[next.rule]}: סכום רימן ${fmt(riemann(cc.f, cc.a, next.b, next.n, next.rule) * nm.xs * nm.ys, nm.areaUnit)}, האינטגרל ${fmt(ex * nm.xs * nm.ys, nm.areaUnit)}.`,
    );
  };

  const pickRule = (rule: RiemannRule) =>
    act((p) => ({ ...p, rule, seenRules: p.seenRules.includes(rule) ? p.seenRules : [...p.seenRules, rule] }));
  const pickPreset = (preset: FigureCase) =>
    act((p) => ({
      ...p,
      preset,
      b: CASES[preset].b,
      seenPresets: p.seenPresets.includes(preset) ? p.seenPresets : [...p.seenPresets, preset],
    }));

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const st = sRef.current;
    const cs = CASES[st.preset];
    const mt = META[st.preset];
    const W = view.w;
    const H = view.h;
    const narrow = W < 480;
    const ml = narrow ? 50 : 60;
    const topH = panel === 'none' ? H : H * 0.56;
    const box = insetBox({ x: 0, y: 0, w: W, h: topH }, { l: ml, r: 14, t: 48, b: 42 });

    // y range of f over the whole interval, always including 0
    let lo = 0;
    let hi = 0;
    for (let i = 0; i <= 240; i++) {
      const v = cs.f(cs.a + ((cs.bMax - cs.a) * i) / 240);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const pad = 0.08 * (hi - lo);
    const plot = makePlot(
      box,
      {
        min: cs.a * mt.xs,
        max: cs.bMax * mt.xs,
        label: mt.xLabel,
      },
      { min: (lo < 0 ? lo - pad : 0) * mt.ys, max: (hi + pad) * mt.ys, label: mt.yLabel },
    );
    drawAxes(ctx, plot, p, { grid: true });
    zeroLine(ctx, plot, p);

    if (panel === 'accum') {
      // the exact area from a to b, shaded by sign, without rectangles
      const pieces = riemannPieces(cs.f, cs.a, st.b, 240, 'mid');
      for (const pc of pieces) drawPiece(ctx, plot, p, mt, pc.x0, pc.x1, pc.height, pc.height, false, false);
    } else {
      const pieces = riemannPieces(cs.f, cs.a, st.b, st.n, st.rule);
      const outline = st.n <= 60;
      for (const pc of pieces) drawPiece(ctx, plot, p, mt, pc.x0, pc.x1, pc.y0, pc.y1, outline, st.rule === 'trapezoid');
      if (st.n <= 30 && st.rule !== 'trapezoid') {
        const off = st.rule === 'left' ? 0 : st.rule === 'right' ? 1 : 0.5;
        ctx.save();
        ctx.fillStyle = p.ink;
        for (const pc of pieces) {
          const xi = pc.x0 + off * (pc.x1 - pc.x0);
          ctx.beginPath();
          ctx.arc(plot.px(xi * mt.xs), plot.py(pc.height * mt.ys), 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
    drawCurve(ctx, plot, (x) => cs.f(x / mt.xs) * mt.ys, { color: p.ink, width: 2.4, samples: 320 });
    if (props.showB || panel === 'accum') bLine(ctx, plot, p, st.b * mt.xs);

    if (panel === 'error' && curves) drawErrorPanel(ctx, p, W, H, ml, narrow, st.rule, st.n);
    if (panel === 'accum') drawAccumPanel(ctx, p, W, H, ml, st);
  };

  const drawErrorPanel = (ctx: CanvasRenderingContext2D, p: Palette, W: number, H: number, ml: number, narrow: boolean, rule: RiemannRule, n: number) => {
    if (!curves) return;
    const box = insetBox({ x: 0, y: H * 0.58, w: W, h: H * 0.42 }, { l: ml, r: 14, t: 8, b: 42 });
    const yMin = 1e-6;
    const plot = makePlot(
      box,
      { min: 1, max: N_MAX, scale: 'log', label: 'מספר החתיכות N', ticks: [1, 10, 100], format: (v) => String(Math.round(v)) },
      { min: yMin, max: 1, scale: 'log', label: narrow ? 'השגיאה' : 'השגיאה היחסית', ticks: [1, 1e-2, 1e-4, 1e-6], format: pctTick },
    );
    drawAxes(ctx, plot, p, { grid: true });
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y - 2, box.w, box.h + 4);
    ctx.clip();
    for (const r of RULES) {
      const on = r === rule;
      ctx.strokeStyle = on ? p.accent : withAlpha(p.ink3, 0.8);
      ctx.lineWidth = on ? 2.6 : 1.2;
      ctx.setLineDash(on ? [] : [5, 4]);
      ctx.beginPath();
      let started = false;
      curves[r].forEach((e, i) => {
        if (!(e >= yMin)) {
          started = false;
          return;
        }
        const x = plot.px(i + 1);
        const y = plot.py(e);
        if (started) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        started = true;
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const e = curves[rule][n - 1];
    if (e >= yMin) {
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(plot.px(n), plot.py(e), 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.ink2;
      ctx.font = `600 13px ${p.fontUi}`;
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('בכלל הזה השגיאה אפס: הגרף ישר', box.x + box.w / 2, box.y + box.h / 2);
    }
    ctx.restore();
  };

  const drawAccumPanel = (ctx: CanvasRenderingContext2D, p: Palette, W: number, H: number, ml: number, st: State) => {
    const cs = CASES[st.preset];
    const mt = META[st.preset];
    const sc = mt.xs * mt.ys;
    const box = insetBox({ x: 0, y: H * 0.58, w: W, h: H * 0.42 }, { l: ml, r: 14, t: 8, b: 42 });
    const Af = (x: number) => exactIntegral(cs, cs.a, x);
    let lo = 0;
    let hi = 0;
    for (let i = 0; i <= 240; i++) {
      const v = Af(cs.a + ((cs.bMax - cs.a) * i) / 240);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const pad = 0.1 * (hi - lo || 1);
    const yr = { min: (lo < 0 ? lo - pad : 0) * sc, max: (hi + pad) * sc };
    const plot = makePlot(
      box,
      { min: cs.a * mt.xs, max: cs.bMax * mt.xs, label: mt.xLabel },
      { ...yr, label: 'A(b)', ticks: niceTicks(yr.min, yr.max, 4) },
    );
    drawAxes(ctx, plot, p, { grid: true });
    zeroLine(ctx, plot, p);
    drawCurve(ctx, plot, (x) => Af(x / mt.xs) * sc, { color: p.hand, width: 2.4, samples: 240 });
    // the tangent at b: slope f(b) in display units
    const bx = st.b * mt.xs;
    const by = Af(st.b) * sc;
    const k = cs.f(st.b) * mt.ys;
    const half = 0.12 * (cs.bMax - cs.a) * mt.xs;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(plot.px(bx - half), plot.py(by - k * half));
    ctx.lineTo(plot.px(bx + half), plot.py(by + k * half));
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(plot.px(bx), plot.py(by), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  const showRules = panel !== 'accum';
  const chooser = (props.presets ?? []).length > 1;
  const label =
    panel === 'accum'
      ? `${m.said}, והשטח מתחתיו מ-${fmt(c.a * m.xs, m.xUnit)} עד ${fmt(s.b * m.xs, m.xUnit)}. מתחת לגרף, השטח ⁦A(b)⁩ כפונקציה של הקצה b, והמשיק שלו ב-b.`
      : `${m.said}, והשטח מתחתיו מחולק ל-${s.n} ${s.rule === 'trapezoid' ? 'טרפזים' : 'מלבנים'} לפי כלל ${RULE_NAME[s.rule]}.${panel === 'error' ? ' מתחת לגרף, השגיאה היחסית של כל כלל כפונקציה של מספר החתיכות, בצירים לוגריתמיים.' : ''}`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={panel === 'none' ? 1.5 : 1.05}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        panel === 'accum' ? (
          <>
            <span>
              הקצה: <b class="q">b = {fmt(s.b * m.xs, m.xUnit)}</b>
            </span>
            <span>
              השטח עד b: <b class="q">A(b) = {fmt(exact * areaScale, m.areaUnit)}</b>
            </span>
            <span>
              גובה הגרף ב-b: <b class="q">f(b) = {fmt(c.f(s.b) * m.ys, '')}</b>
            </span>
            <span>
              השיפוע של ⁦A⁩ ב-b: <b class="q">{fmt(slopeAtB * m.ys, '')}</b>
            </span>
          </>
        ) : (
          <>
            <span>
              <b class="q">N = {s.n}</b>, רוחב כל חתיכה <b class="q">Δx = {fmt(((s.b - c.a) / s.n) * m.xs, m.xUnit)}</b>
            </span>
            <span>
              סכום רימן, כלל {RULE_NAME[s.rule]}: <b class="q">{fmt(sum * areaScale, m.areaUnit)}</b>
            </span>
            <span>
              השטח המדויק ({m.areaName}): <b class="q">{fmt(exact * areaScale, m.areaUnit)}</b>
            </span>
            <span>
              השגיאה: <b class="q">{fmt(Math.abs(sum - exact) * areaScale, m.areaUnit)}</b> (<b class="q">{pct(relErr < 1e-12 ? 0 : relErr)}</b>)
            </span>
            {crosses && m.unsignedName && (
              <span>
                {m.unsignedName}: <b class="q">{fmt(scale * areaScale, m.areaUnit)}</b>
              </span>
            )}
            {panel === 'error' && (
              <span>
                {ratio ? (
                  <>
                    כש-N מוכפל, השגיאה קטנה פי <b class="q">{sci(ratio, 3)}</b>
                  </>
                ) : (
                  'בכלל הזה השגיאה אפס'
                )}
              </span>
            )}
          </>
        )
      }
      controls={
        <>
          {chooser && (
            <div class="group" role="group" aria-label="הגרף">
              {(props.presets ?? []).map((id) => (
                <Toggle key={id} label={META[id].chip} on={s.preset === id} onChange={() => pickPreset(id)} />
              ))}
            </div>
          )}
          {showRules && (
            <div class="group" role="group" aria-label="הכלל">
              {RULES.map((r) => (
                <Toggle key={r} label={RULE_NAME[r]} on={s.rule === r} onChange={() => pickRule(r)} />
              ))}
            </div>
          )}
          {showRules && (
            <div class="group">
              <Slider label="מספר החתיכות N" value={s.n} min={1} max={N_MAX} step={1} format={(v) => String(v)} onChange={(v) => act((p) => ({ ...p, n: v }))} />
              <button
                type="button"
                class="toggle"
                disabled={s.n * 2 > N_MAX}
                onClick={() => act((p) => ({ ...p, n: Math.min(N_MAX, p.n * 2) }), 'double')}
              >
                N כפול
              </button>
            </div>
          )}
          {(props.showB || panel === 'accum') && (
            <div class="group">
              <Slider
                label="הקצה הימני b"
                value={s.b}
                min={c.a + bStep(s.preset)}
                max={c.bMax}
                step={bStep(s.preset)}
                format={(v) => fmt(v * m.xs, m.xUnit)}
                onChange={(v) => act((p) => ({ ...p, b: clampB(p.preset, v) }))}
              />
            </div>
          )}
        </>
      }
    />
  );
}

/** The x axis itself (y = 0), drawn when the graph dips below it. */
function zeroLine(ctx: CanvasRenderingContext2D, plot: Plot, p: Palette) {
  if (!(plot.y.min < 0 && plot.y.max > 0)) return;
  const y = plot.py(0);
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(plot.box.x, y);
  ctx.lineTo(plot.box.x + plot.box.w, y);
  ctx.stroke();
  ctx.restore();
}

/** The vertical line at the upper end b, labelled. */
function bLine(ctx: CanvasRenderingContext2D, plot: Plot, p: Palette, bx: number) {
  const x = plot.px(bx);
  ctx.save();
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x, plot.box.y);
  ctx.lineTo(x, plot.box.y + plot.box.h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = p.accent;
  ctx.font = `italic 700 14px ${p.fontUi}`;
  ctx.textAlign = x > plot.box.x + plot.box.w - 20 ? 'right' : 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('b', x + (ctx.textAlign === 'right' ? -4 : 4), plot.box.y + 2);
  ctx.restore();
}

/**
 * One piece: a rectangle (y0 = y1) or a trapezoid, from the axis to the heights. A piece above the axis
 * is filled in the accent colour; below the axis it is filled differently and hatched, so the sign is
 * never told by colour alone.
 */
function drawPiece(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  p: Palette,
  mt: Meta,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  outline: boolean,
  trapezoid: boolean,
) {
  const X0 = plot.px(x0 * mt.xs);
  const X1 = plot.px(x1 * mt.xs);
  const Z = plot.py(0);
  const Y0 = plot.py(y0 * mt.ys);
  const Y1 = plot.py(y1 * mt.ys);
  const neg = (y0 + y1) / 2 < 0;
  const col = neg ? p.neg : p.accent;
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(X0, Z);
    ctx.lineTo(X0, Y0);
    ctx.lineTo(X1, trapezoid ? Y1 : Y0);
    ctx.lineTo(X1, Z);
    ctx.closePath();
  };
  ctx.save();
  shape();
  ctx.fillStyle = withAlpha(col, neg ? 0.2 : 0.3);
  ctx.fill();
  if (neg) {
    ctx.clip();
    ctx.strokeStyle = withAlpha(col, 0.55);
    ctx.lineWidth = 1;
    const top = Math.min(Z, Y0, Y1);
    const bot = Math.max(Z, Y0, Y1);
    for (let k = X0 - (bot - top); k < X1; k += 7) {
      ctx.beginPath();
      ctx.moveTo(k, bot);
      ctx.lineTo(k + (bot - top), top);
      ctx.stroke();
    }
  }
  if (outline) {
    shape();
    ctx.strokeStyle = withAlpha(col, 0.9);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}
