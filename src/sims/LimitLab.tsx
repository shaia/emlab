/**
 * The limit check (lesson 6.16). Six closed forms the chapter derived (ring on its axis, rod on its
 * bisector, disc on its axis, solenoid at its centre, a straight wire segment, a dipole on its axis) on a
 * log-log graph against the one length that is free to change. Over each curve, dashed, the two simpler
 * formulas it must reduce to, one at each end of the range; on a log-log graph each is a straight line, and
 * its slope is the power of the length in it. A slider walks the free length toward either end and the
 * readout gives exact / limit there. In "suspect" mode a plausible wrong formula is drawn as well: it
 * agrees with one end and misses the other.
 *
 * Every value is from src/physics/limits.ts, which takes each exact field from the module that derived it.
 * Tasks are ticked only in the handlers of the reader's own actions, never by a text step.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { logSlope } from '~/physics/dipole';
import { LIMIT_CASES, type End, type LimitCase, type LimitCaseId } from '~/physics/limits';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, chargeDisc, withAlpha } from './core/ink';
import { sci } from './core/format';
import { decadeTicks, drawAxes, drawCurve, drawMarker, makePlot, type Box, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

interface CaseText {
  /** chip label */
  chip: string;
  /** the free length's symbol, and the fixed one it is compared with */
  free: string;
  fixed: string;
  /** the fixed data, for the readout */
  data: string;
  /** the two limits: a Hebrew name and the formula, as drawn on the canvas */
  small: [string, string];
  large: [string, string];
  suspect: string;
}

const TEXT: Record<LimitCaseId, CaseText> = {
  ring: {
    chip: 'טבעת',
    free: 'z',
    fixed: 'R',
    data: 'Q = 5 nC, R = 10 cm',
    small: ['ליד המרכז', 'kQz/R³'],
    large: ['רחוק: מטען נקודתי', 'kQ/z²'],
    suspect: 'kQ/(z² + R²)',
  },
  rod: {
    chip: 'מוט',
    free: 'L',
    fixed: 'r',
    data: 'λ = 10 nC/m, r = 5 cm',
    small: ['מוט קצר: מטען נקודתי', 'kλL/r²'],
    large: ['מוט ארוך: קו טעון', '2kλ/r'],
    suspect: 'kλL/(r² + L²/4)',
  },
  disc: {
    chip: 'דיסקה',
    free: 'R',
    fixed: 'z',
    data: 'σ = 10 nC/m², z = 5 cm',
    small: ['דיסקה קטנה: מטען נקודתי', 'kσπR²/z²'],
    large: ['דיסקה רחבה: לוח אינסופי', 'σ/(2ε₀)'],
    suspect: 'σ/(2ε₀)·R/√(z² + R²)',
  },
  solenoid: {
    chip: 'סליל',
    free: 'L',
    fixed: 'R',
    data: 'N = 200, I = 2 A, R = 5 cm',
    small: ['סליל שטוח', 'μ₀NI/(2R)'],
    large: ['סליל ארוך', 'μ₀NI/L'],
    suspect: 'μ₀NI/√(L² + R²)',
  },
  wire: {
    chip: 'קטע תיל',
    free: 'L',
    fixed: 's',
    data: 'I = 5 A, s = 5 cm',
    small: ['קטע קצר: אלמנט ביו-סבר', 'μ₀IL/(4πs²)'],
    large: ['תיל ארוך', 'μ₀I/(2πs)'],
    suspect: 'μ₀IL/(4πs·√(s² + L²))',
  },
  dipole: {
    chip: 'דיפול',
    free: 'r',
    fixed: 'd',
    data: 'q = 1 nC, d = 1 cm',
    small: ['ליד המטען +q', 'kq/(r − d/2)²'],
    large: ['רחוק: דיפול נקודתי', '2kp/r³'],
    suspect: '2kqd/(r² − d²/4)^(3/2)',
  },
};

const ORDER: LimitCaseId[] = ['ring', 'rod', 'disc', 'solenoid', 'wire', 'dipole'];

const TASK_LABEL: Record<string, string> = {
  'far-ring': 'בטבעת: הרחיקו את הנקודה עד שהשדה המדויק יהיה בתוך 2% מ-kQ/z² של מטען נקודתי.',
  'wide-disc': 'בדיסקה: הגדילו את הרדיוס עד שהשדה יהיה בתוך 5% מ-σ/(2ε₀) של לוח אינסופי.',
  'flat-coil': 'בסליל: קצרו אותו עד שהשדה במרכזו יהיה בתוך 2% מ-μ₀NI/(2R) של סליל שטוח.',
  'long-solenoid': 'בסליל: האריכו אותו עד שהשדה במרכזו יהיה בתוך 2% מ-μ₀NI/L של סליל ארוך.',
  'catch-suspect': 'הדליקו "נוסחה חשודה". בגוף אחר מהסליל, מצאו מקום שבו השדה המדויק בתוך 5% מנוסחת הגבול, והנוסחה החשודה רחוקה מנוסחת הגבול ביותר מ-25%.',
};

export interface LimitLabProps {
  id: string;
  shape?: LimitCaseId;
  /** the free length [m] */
  x?: number;
  suspect?: boolean;
  tasks?: string[];
}

interface State {
  shape: LimitCaseId;
  /** log10 of the free length in metres */
  lx: number;
  suspect: boolean;
}

const clampLx = (c: LimitCase, lx: number) => Math.max(Math.log10(c.min), Math.min(Math.log10(c.max), lx));
const unitOf = (c: LimitCase) => (c.kind === 'E' ? 'N/C' : 'T');
const limitOf = (c: LimitCase, end: End) => c.limits[end === 'small' ? 0 : 1];
const fmtLen = (x: number) => (x >= 0.01 && x < 1 ? `${sci(x * 100, 3)} cm` : `${sci(x, 3)} m`);

/** the y range of the graph: the exact curve, with room above and below */
function yRange(c: LimitCase): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const x = c.min * (c.max / c.min) ** (i / 200);
    const v = c.exact(x);
    if (v > 0 && Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return [lo / 4, hi * 4];
}

export default function LimitLab(props: LimitLabProps) {
  const init = (): State => {
    const shape = props.shape ?? 'ring';
    const c = LIMIT_CASES[shape];
    return { shape, lx: clampLx(c, Math.log10(props.x ?? c.scale)), suspect: props.suspect ?? false };
  };
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const dragging = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const shape = typeof st.shape === 'string' && st.shape in LIMIT_CASES ? (st.shape as LimitCaseId) : prev.shape;
          const c = LIMIT_CASES[shape];
          const lx = typeof st.x === 'number' ? clampLx(c, Math.log10(st.x)) : shape !== prev.shape ? clampLx(c, Math.log10(c.scale)) : prev.lx;
          const suspect = typeof st.suspect === 'boolean' ? st.suspect : prev.suspect;
          return { shape, lx, suspect };
        });
      }),
    [props.id],
  );

  const c = LIMIT_CASES[s.shape];
  const t = TEXT[s.shape];
  const x = 10 ** s.lx;
  const exact = c.exact(x);
  const rSmall = exact / limitOf(c, 'small').f(x);
  const rLarge = exact / limitOf(c, 'large').f(x);
  const sus = c.suspect.f(x);
  const slope = logSlope(c.exact, x);

  /** tick the tasks a reader's own move completed */
  const check = (next: State) => {
    const has = (k: string) => props.tasks?.includes(k);
    const done = (k: string) => has(k) && markTask(`${props.id}:${k}`);
    const cc = LIMIT_CASES[next.shape];
    const xx = 10 ** next.lx;
    const ex = cc.exact(xx);
    const r = (end: End) => ex / limitOf(cc, end).f(xx);
    if (next.shape === 'ring' && Math.abs(r('large') - 1) <= 0.02) done('far-ring');
    if (next.shape === 'disc' && Math.abs(r('large') - 1) <= 0.05) done('wide-disc');
    if (next.shape === 'solenoid' && Math.abs(r('small') - 1) <= 0.02) done('flat-coil');
    if (next.shape === 'solenoid' && Math.abs(r('large') - 1) <= 0.02) done('long-solenoid');
    if (next.suspect && next.shape !== 'solenoid') {
      for (const end of ['small', 'large'] as const) {
        const lim = limitOf(cc, end).f(xx);
        if (Math.abs(ex / lim - 1) <= 0.05 && Math.abs(cc.suspect.f(xx) / lim - 1) > 0.25) done('catch-suspect');
      }
    }
  };
  const act = (f: (prev: State) => State) => {
    const next = f(s);
    setS(next);
    check(next);
  };

  /** the sketch strip and the graph, in CSS px */
  const layout = (w: number, h: number) => {
    const narrow = w < 480;
    const strip: Box = { x: 8, y: 6, w: w - 56, h: Math.round(h * 0.25) };
    const l = narrow ? 50 : 62;
    const top = strip.y + strip.h + 22;
    const graph: Box = { x: l, y: top, w: w - l - 14, h: h - top - (narrow ? 40 : 44) };
    return { strip, graph, narrow };
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { strip, graph, narrow } = layout(view.w, view.h);
    drawSketch(ctx, p, strip, c, s.shape, x);

    const [ylo, yhi] = yRange(c);
    const plot = makePlot(
      graph,
      { min: c.min, max: c.max, scale: 'log', ticks: decadeTicks(c.min, c.max, narrow ? 4 : 6), label: `${t.free} (m)` },
      { min: ylo, max: yhi, scale: 'log', ticks: decadeTicks(ylo, yhi, narrow ? 4 : 6) },
    );
    drawAxes(ctx, plot, p);
    const field = c.kind === 'E' ? p.efield : p.bfield;
    if (s.suspect) drawCurve(ctx, plot, c.suspect.f, { color: p.force, width: 2.2, dash: [10, 4, 2, 4], samples: 200 });
    drawCurve(ctx, plot, c.exact, { color: field, width: 3.2, samples: 240 });
    // the two limits, dashed over the exact curve, each from its own end to a little past the fixed length
    for (const end of ['small', 'large'] as const) {
      const f = limitOf(c, end).f;
      const inside = (x: number) => (end === 'small' ? x <= c.scale * 4 : x >= c.scale / 4);
      drawCurve(ctx, plot, (x) => (inside(x) ? f(x) : Number.NaN), { color: p.ink, width: 1.8, dash: [7, 5], samples: 240 });
    }
    drawLimitLabel(ctx, p, plot, limitOf(c, 'small').f, t.small[1], 'small', narrow);
    drawLimitLabel(ctx, p, plot, limitOf(c, 'large').f, t.large[1], 'large', narrow);

    // the reader's point
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink2, 0.6);
    ctx.setLineDash([1.5, 4]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(plot.px(x), graph.y);
    ctx.lineTo(plot.px(x), graph.y + graph.h);
    ctx.stroke();
    ctx.restore();
    if (s.suspect) drawMarker(ctx, plot, x, sus, p.force, { radius: 4 });
    drawMarker(ctx, plot, x, exact, p.ink, { radius: 5.5 });

    // the graph's title: the field and its unit
    ctx.save();
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.fillStyle = p.ink;
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${c.kind} (${unitOf(c)})`, graph.x - (narrow ? 44 : 56), graph.y - 6);
    ctx.restore();
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  const lo = Math.log10(c.min);
  const hi = Math.log10(c.max);
  const setLx = (v: number) => act((prev) => ({ ...prev, lx: clampLx(LIMIT_CASES[prev.shape], v) }));
  const lxFromX = (px: number) => {
    const v = viewRef.current;
    if (!v) return s.lx;
    const { graph } = layout(v.w, v.h);
    return lo + ((px - graph.x) / graph.w) * (hi - lo);
  };
  const onPointerDown = (e: PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setLx(lxFromX(e.offsetX));
  };
  const onPointerMove = (e: PointerEvent) => {
    if (dragging.current) setLx(lxFromX(e.offsetX));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(`${t.free} = ${fmtLen(x)}: השדה המדויק ${sci(exact)} ${unitOf(c)}.`);
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setLx(s.lx + d * (e.shiftKey ? 0.5 : 0.1));
  };

  const ratio = (r: number) => (r > 0.01 && r < 100 ? r.toFixed(3) : sci(r, 2));

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${t.chip}, ${t.data}. ${t.free} = ${fmtLen(x)}. השדה המדויק ${sci(exact)} ${unitOf(c)}; היחס לנוסחה של ${t.small[0]} ${ratio(rSmall)}, ולנוסחה של ${t.large[0]} ${ratio(rLarge)}. גררו לרוחב הגרף כדי לשנות את ${t.free}; במקלדת: חיצים.`}
      canvasRef={canvasRef}
      aspect={1.15}
      live={live}
      tasks={tasks}
      cursor="ew-resize"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onReset={() => {
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            {t.data}; <b class="q">{`${t.free} = ${fmtLen(x)}`}</b>, <b class="q">{`${t.free}/${t.fixed} = ${sci(x / c.scale)}`}</b>
          </span>
          <span>
            מדויק: <b class="q">{`${c.kind} = ${sci(exact)} ${unitOf(c)}`}</b>
          </span>
          <span>
            {t.small[0]}: <b class="q">{`${t.small[1]} = ${sci(limitOf(c, 'small').f(x))} ${unitOf(c)}`}</b>, יחס <b class="q">{ratio(rSmall)}</b>
          </span>
          <span>
            {t.large[0]}: <b class="q">{`${t.large[1]} = ${sci(limitOf(c, 'large').f(x))} ${unitOf(c)}`}</b>, יחס <b class="q">{ratio(rLarge)}</b>
          </span>
          <span>
            שיפוע הגרף בנקודה: <b class="q">{(Math.abs(slope) < 0.005 ? 0 : slope).toFixed(2)}</b>
          </span>
          {s.suspect && (
            <span>
              הנוסחה החשודה: <b class="q">{`${t.suspect} = ${sci(sus)} ${unitOf(c)}`}</b>, חלקי המדויק <b class="q">{ratio(sus / exact)}</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="הגוף">
            {ORDER.map((k) => (
              <button
                type="button"
                key={k}
                class={`toggle ${s.shape === k ? 'on' : ''}`}
                aria-pressed={s.shape === k}
                onClick={() => act((prev) => ({ ...prev, shape: k, lx: clampLx(LIMIT_CASES[k], Math.log10(LIMIT_CASES[k].scale)) }))}
              >
                {TEXT[k].chip}
              </button>
            ))}
          </div>
          <Slider label={`האורך ${t.free} (סולם לוגריתמי)`} value={s.lx} min={lo} max={hi} step={0.01} format={(v) => fmtLen(10 ** v)} onChange={setLx} />
          <Toggle label="נוסחה חשודה" on={s.suspect} onChange={(v) => act((prev) => ({ ...prev, suspect: v }))} swatch="var(--force)" />
        </>
      }
    />
  );
}

/** the formula of a limit, written along its dashed line near the end it belongs to */
function drawLimitLabel(ctx: CanvasRenderingContext2D, p: Palette, plot: Plot, f: (x: number) => number, text: string, end: End, narrow: boolean) {
  const { box } = plot;
  const xmin = plot.x.min;
  const xmax = plot.x.max;
  const frac = end === 'small' ? 0.1 : 0.88;
  const xv = xmin * (xmax / xmin) ** frac;
  let sy = plot.py(f(xv));
  sy = Math.max(box.y + 12, Math.min(box.y + box.h - 6, sy));
  ctx.save();
  ctx.font = `600 ${narrow ? 11 : 12}px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.textAlign = end === 'small' ? 'left' : 'right';
  ctx.textBaseline = 'bottom';
  const sx = end === 'small' ? box.x + 4 : box.x + box.w - 4;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = withAlpha(p.paper, 0.85);
  ctx.fillRect(end === 'small' ? sx - 2 : sx - w - 2, sy - 16, w + 4, 15);
  ctx.fillStyle = p.ink2;
  ctx.fillText(text, sx, sy - 3);
  ctx.restore();
}

/** a sketch of the body, not to scale beyond a factor of 4 either way */
function drawSketch(ctx: CanvasRenderingContext2D, p: Palette, b: Box, c: LimitCase, shape: LimitCaseId, x: number) {
  const u = x / c.scale;
  const vis = Math.max(0.2, Math.min(4, u));
  const F = Math.min(b.h * 0.34, b.w * 0.11);
  // before the first layout the canvas can be narrower than the margins
  if (!(F > 4)) return;
  const cy = b.y + b.h / 2;
  const cx = b.x + b.w * 0.42;
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, w = 1.2, dash: number[] = []) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };
  const label = (text: string, lx: number, ly: number, align: CanvasTextAlign = 'center') => {
    ctx.save();
    ctx.font = `italic 600 12px ${p.fontUi}`;
    ctx.direction = 'ltr';
    ctx.fillStyle = p.ink2;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx, ly);
    ctx.restore();
  };
  const point = (px: number, py: number) => {
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.fillStyle = p.paper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 12px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('P', px, py - 8);
    ctx.restore();
  };
  const plus = (px: number, py: number) => {
    ctx.save();
    ctx.fillStyle = p.pos;
    ctx.font = `700 11px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', px, py);
    ctx.restore();
  };
  const offScale = (px: number, py: number) => {
    if (u > 4 || u < 0.2) label(u > 4 ? '≫' : '≪', px, py);
  };

  if (shape === 'ring' || shape === 'disc') {
    // the axis, the body in perspective at cx, P on the axis
    const a = shape === 'ring' ? F : F * vis;
    const zpx = shape === 'ring' ? F * vis : F;
    const x0 = cx - (shape === 'ring' ? F * 1.2 : F * 0.6);
    line(b.x + 4, cy, b.x + b.w - 4, cy, p.ink3, 1.2, [4, 4]);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x0, cy, Math.max(3, a * 0.28), a, 0, 0, Math.PI * 2);
    if (shape === 'disc') {
      ctx.fillStyle = withAlpha(p.pos, 0.22);
      ctx.fill();
    }
    ctx.strokeStyle = p.pos;
    ctx.lineWidth = shape === 'ring' ? 3 : 2;
    ctx.stroke();
    ctx.restore();
    plus(x0 - a * 0.28 - 7, cy - a * 0.7);
    plus(x0 + a * 0.28 + 7, cy + a * 0.7);
    if (shape === 'disc') plus(x0, cy - a * 0.45);
    // the radius, and the height
    line(x0, cy, x0, cy - a, p.ink2, 1.2);
    label('R', x0 - Math.max(3, a * 0.28) - 14, cy - a / 2);
    if (shape === 'disc') offScale(x0 + 14, cy - a - 2);
    const px = x0 + zpx;
    arrow(ctx, x0, cy + 14, px, cy + 14, { color: p.ink2, width: 1.2, head: 6 });
    label('z', (x0 + px) / 2, cy + 26);
    if (shape === 'ring') offScale(px + 16, cy);
    point(px, cy);
  } else if (shape === 'rod' || shape === 'wire') {
    // a horizontal body, P above its middle at the fixed distance
    const half = (F * 1.4 * vis) / 2;
    const yb = cy + F * 0.55;
    const color = shape === 'rod' ? p.pos : p.current;
    line(cx - half, yb, cx + half, yb, color, shape === 'rod' ? 5 : 3);
    if (shape === 'rod') for (let i = -1; i <= 1; i++) plus(cx + i * half * 0.6, yb - 9);
    else arrow(ctx, cx - half * 0.5, yb + 9, cx + half * 0.5 + 6, yb + 9, { color: p.current, width: 1.6, head: 6 });
    label(shape === 'wire' ? 'I' : 'λ', cx + half + 12, yb);
    label('L', cx, yb + 20);
    offScale(cx + half + 26, yb);
    const py = yb - F * 1.1;
    line(cx, yb, cx, py, p.ink2, 1.2, [3, 3]);
    label(shape === 'rod' ? 'r' : 's', cx - 10, (yb + py) / 2);
    point(cx, py);
  } else if (shape === 'solenoid') {
    // turns seen from the side, P at the centre
    const half = (F * 1.4 * vis) / 2;
    const rad = F * 0.85;
    const n = Math.max(3, Math.min(14, Math.round(vis * 3.5)));
    for (let i = 0; i < n; i++) {
      const xi = n === 1 ? cx : cx - half + (2 * half * i) / (n - 1);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(xi, cy, Math.max(2.5, rad * 0.22), rad, 0, 0, Math.PI * 2);
      ctx.strokeStyle = p.current;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }
    line(b.x + 4, cy, b.x + b.w - 4, cy, p.ink3, 1.2, [4, 4]);
    arrow(ctx, cx - half, cy + rad + 10, cx + half, cy + rad + 10, { color: p.ink2, width: 1.2, head: 6 });
    label('L', cx, cy + rad + 20);
    line(cx + half + 10, cy, cx + half + 10, cy - rad, p.ink2, 1.2);
    label('R', cx + half + 20, cy - rad / 2);
    offScale(cx + half + 34, cy);
    point(cx, cy);
  } else {
    // the dipole: −q and +q a distance d apart, P on the axis beyond +q
    const dpx = F * 0.9;
    const xm = cx - F * 1.6;
    const xp = xm + dpx;
    line(b.x + 4, cy, b.x + b.w - 4, cy, p.ink3, 1.2, [4, 4]);
    chargeDisc(ctx, xm, cy, 9, -1, p);
    chargeDisc(ctx, xp, cy, 9, 1, p);
    label('d', (xm + xp) / 2, cy - 18);
    const xc = (xm + xp) / 2;
    const px = xc + dpx * Math.max(0.6, vis);
    arrow(ctx, xc, cy + 20, px, cy + 20, { color: p.ink2, width: 1.2, head: 6 });
    label('r', (xc + px) / 2, cy + 31);
    offScale(px + 16, cy);
    point(px, cy);
  }
}
