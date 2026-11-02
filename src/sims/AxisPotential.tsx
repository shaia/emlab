/**
 * The easy route on an axis (lesson 6.6): a ring (charge Q) or a disc (density σ) seen from the
 * side, a point P on its axis, and under it two graphs that share the drawing's z axis:
 *
 * - V(z), the scalar potential (ringAxisPotential / discAxisPotential: a sum of kdq/r, no
 *   components), with the tangent at P;
 * - E_z(z) = −dV/dz, the slope of that graph with its sign flipped (ringAxisFieldFromV /
 *   discAxisFieldFromV, central differences on V), drawn solid, and over it, dashed, the field
 *   summed as vectors in lesson 6.4 (ringAxisField / discAxisField). The two curves coincide.
 *
 * The ring is drawn obliquely (an ellipse) and its height is drawn at a reduced scale, so a 30 cm
 * ring fits the strip; the z axis is to scale. The disc's field jumps by σ/ε₀ across its face, so
 * its curve is broken at z = 0.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { discAxisField, discAxisPotential, ringAxisField, ringAxisPeak, ringAxisPotential } from '~/physics/continuous';
import { EPS0 } from '~/physics/constants';
import { discAxisFieldFromV, ringAxisFieldFromV } from '~/physics/lineintegral';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, makePlot, niceTicks, type Box } from './core/plot';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

export type AxisShape = 'ring' | 'disc';

/** ring charge [C] and disc density [C/m²] */
const Q_RING = 5e-9;
const SIGMA = 1e-8;
const SHEET = SIGMA / (2 * EPS0);
const Z_MAX = 0.6;
const Z_TICKS = [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6];
const R_MAX_CM = 30;

const SHAPE_LABEL: Record<AxisShape, string> = { ring: 'טבעת', disc: 'דיסקה' };

const TASK_LABEL: Record<string, string> = {
  'ring-centre': 'בטבעת: הביאו את P למרכז הטבעת, z = 0. מה השיפוע של גרף V שם, ומה השדה?',
  'ring-peak': 'בטבעת: מצאו את המקום על הציר שבו השדה הכי חזק. מה מיוחד בגרף V שם?',
  'disc-wide': 'בדיסקה: שנו את הרדיוס ואת מקום P עד שהשדה ב-P יהיה בתוך 10% מ-σ/(2ε₀), השדה של לוח אינסופי.',
};

export interface AxisPotentialProps {
  id: string;
  shape?: AxisShape;
  /** radius [cm] */
  R?: number;
  /** P on the axis [cm] */
  z?: number;
  tasks?: string[];
}

interface State {
  shape: AxisShape;
  R: number;
  z: number;
}

const V = (s: State, z: number) => (s.shape === 'ring' ? ringAxisPotential(Q_RING, s.R / 100, z) : discAxisPotential(SIGMA, s.R / 100, z));
/** −dV/dz; the disc has no single value on its face */
const E = (s: State, z: number) =>
  s.shape === 'ring' ? ringAxisFieldFromV(Q_RING, s.R / 100, z) : z === 0 ? Number.NaN : discAxisFieldFromV(SIGMA, s.R / 100, z);
/** the field summed as vectors (lesson 6.4); the disc formula takes z ≥ 0 and is odd in z */
const Evec = (s: State, z: number) =>
  s.shape === 'ring' ? ringAxisField(Q_RING, s.R / 100, z) : z === 0 ? Number.NaN : Math.sign(z) * discAxisField(SIGMA, s.R / 100, Math.abs(z));
const eMax = (s: State) => (s.shape === 'ring' ? ringAxisField(Q_RING, s.R / 100, ringAxisPeak(s.R / 100)) : SHEET);

export default function AxisPotential(props: AxisPotentialProps) {
  const init = (): State => ({ shape: props.shape ?? 'ring', R: props.R ?? 20, z: props.z ?? 30 });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const dragging = useRef(false);
  const userMoved = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userMoved.current = false;
        setS((prev) => {
          const next = { ...prev };
          if (st.shape === 'ring' || st.shape === 'disc') next.shape = st.shape;
          if (typeof st.R === 'number') next.R = st.R;
          if (typeof st.z === 'number') next.z = st.z;
          return next;
        });
      }),
    [props.id],
  );

  const z = s.z / 100;
  const v0 = V(s, z);
  const e0 = E(s, z);
  const ev = Evec(s, z);
  const onFace = s.shape === 'disc' && s.z === 0;

  useEffect(() => {
    if (!userMoved.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (has('ring-centre') && s.shape === 'ring' && s.z === 0) done('ring-centre');
    if (has('ring-peak') && s.shape === 'ring' && Math.abs(Math.abs(z) - ringAxisPeak(s.R / 100)) < 0.015) done('ring-peak');
    if (has('disc-wide') && s.shape === 'disc' && !onFace && Math.abs(e0) >= 0.9 * SHEET) done('disc-wide');
  }, [s, props.id, props.tasks]);

  /** the three panels, in CSS px: the drawing strip, the V graph, the E graph */
  const layout = (w: number, h: number) => {
    const l = 54;
    const r = 14;
    const strip: Box = { x: l, y: 4, w: w - l - r, h: Math.round(h * 0.26) };
    const vBox: Box = { x: l, y: strip.y + strip.h + 10, w: strip.w, h: Math.round(h * 0.3) };
    const eTop = vBox.y + vBox.h + 24;
    const eBox: Box = { x: l, y: eTop, w: strip.w, h: h - eTop - 22 };
    return { strip, vBox, eBox };
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { strip, vBox, eBox } = layout(view.w, view.h);
    const vTop = V(s, 0) * 1.15;
    const em = eMax(s) * 1.2;
    const zAxis = { min: -Z_MAX, max: Z_MAX, ticks: Z_TICKS, format: (t: number) => String(Math.round(t * 100)) };
    const vPlot = makePlot(vBox, zAxis, { min: 0, max: vTop, ticks: niceTicks(0, vTop, 3) });
    const ePlot = makePlot(eBox, zAxis, { min: -em, max: em, ticks: niceTicks(-em, em, 4) });
    const sx = vPlot.px;

    // the strip: the axis, the ring or disc at z = 0, P, and E at P along the axis
    const yc = strip.y + strip.h / 2;
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    arrow(ctx, strip.x, yc, strip.x + strip.w, yc, { color: p.ink3, width: 1.2, head: 8 });
    ctx.fillStyle = p.ink2;
    ctx.font = `italic 13px ${p.fontUi}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('z (cm)', strip.x + strip.w - 2, yc + 5);
    ctx.restore();
    const ppm = strip.w / (2 * Z_MAX);
    // the height is drawn at a reduced scale so the largest ring fits the strip
    const k = Math.min(1, (strip.h / 2 - 8) / ((R_MAX_CM / 100) * ppm));
    const a = (s.R / 100) * ppm * k;
    const b = Math.max(4, a * 0.28);
    const x0 = sx(0);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x0, yc, b, a, 0, 0, Math.PI * 2);
    if (s.shape === 'disc') {
      ctx.fillStyle = withAlpha(p.pos, 0.22);
      ctx.fill();
    }
    ctx.strokeStyle = p.pos;
    ctx.lineWidth = s.shape === 'ring' ? 3.2 : 2;
    ctx.stroke();
    // the sign is never colour-only: + glyphs on the ring, or over the disc
    ctx.fillStyle = p.pos;
    ctx.font = `700 11px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const marks = s.shape === 'ring' ? [0, 1, 2, 3, 4, 5].map((i) => (i * Math.PI) / 3 + Math.PI / 6) : [];
    for (const t of marks) ctx.fillText('+', x0 + (b + 7) * Math.cos(t), yc - (a + 2) * Math.sin(t) * 1.04);
    if (s.shape === 'disc') for (const f of [-0.55, 0.55]) ctx.fillText('+', x0, yc + f * a);
    ctx.fillStyle = p.ink2;
    ctx.font = `600 11px ${p.fontUi}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`R = ${s.R} cm`, x0 - b - 8, yc - a + 10);
    ctx.restore();
    // P and E at P
    const px = sx(z);
    if (!onFace && Number.isFinite(e0) && Math.abs(e0) > 1e-9) {
      const L = 8 + 38 * Math.min(1, Math.abs(e0) / eMax(s));
      const dir = Math.sign(e0);
      arrow(ctx, px + dir * 9, yc, px + dir * (9 + L), yc, { color: p.efield, width: 3, head: 9 });
    }
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.fillStyle = p.paper;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(px, yc, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(px, yc, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 13px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('P', px, yc - 9);
    // a dotted guide from P down through both graphs
    ctx.strokeStyle = withAlpha(p.ink2, 0.6);
    ctx.setLineDash([1.5, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, yc + 9);
    ctx.lineTo(px, eBox.y + eBox.h);
    ctx.stroke();
    ctx.restore();

    // V(z) with the tangent at P
    drawAxes(ctx, vPlot, p);
    drawCurve(ctx, vPlot, (t) => V(s, t), { color: p.equip, width: 2.4, samples: 241 });
    if (!onFace) {
      const slope = -e0;
      const span = 0.14;
      ctx.save();
      ctx.beginPath();
      ctx.rect(vBox.x, vBox.y, vBox.w, vBox.h);
      ctx.clip();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(z - span), vPlot.py(v0 - slope * span));
      ctx.lineTo(sx(z + span), vPlot.py(v0 + slope * span));
      ctx.stroke();
      ctx.restore();
    }
    drawMarker(ctx, vPlot, z, v0, p.ink, { radius: 4.5 });

    // E_z(z): −dV/dz solid, the vector sum of 6.4 dashed over it
    drawAxes(ctx, ePlot, p);
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(eBox.x, ePlot.py(0));
    ctx.lineTo(eBox.x + eBox.w, ePlot.py(0));
    ctx.stroke();
    ctx.restore();
    drawCurve(ctx, ePlot, (t) => E(s, t), { color: p.efield, width: 2.6, samples: 240 });
    drawCurve(ctx, ePlot, (t) => Evec(s, t), { color: p.ink, width: 1.4, dash: [5, 5], samples: 240 });
    if (!onFace) drawMarker(ctx, ePlot, z, e0, p.ink, { radius: 4.5 });

    // panel titles, inside the top corner of each graph
    ctx.save();
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.fillStyle = p.ink;
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('V (V)', vBox.x + vBox.w - 4, vBox.y + 3);
    ctx.fillText('E_z (N/C)', eBox.x + eBox.w - 4, eBox.y + 3);
    ctx.restore();
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1.15, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  const setZ = (cm: number) => {
    userMoved.current = true;
    const zc = Math.max(-58, Math.min(58, Math.round(cm)));
    setS((prev) => ({ ...prev, z: zc }));
  };
  const zFromX = (x: number) => {
    const v = viewRef.current;
    if (!v) return s.z;
    const { strip } = layout(v.w, v.h);
    return ((x - strip.x) / strip.w) * 2 * Z_MAX * 100 - Z_MAX * 100;
  };
  const onPointerDown = (e: PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setZ(zFromX(e.offsetX));
  };
  const onPointerMove = (e: PointerEvent) => {
    if (dragging.current) setZ(zFromX(e.offsetX));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(`P ב-z = ${s.z} ס"מ: V = ${sci(v0)} V, השדה ${onFace ? 'קופץ על פני הדיסקה' : `${sci(e0)} N/C`}.`);
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    setZ(s.z + d * (e.shiftKey ? 5 : 1));
  };

  const ratio = s.shape === 'disc' && !onFace ? Math.abs(e0) / SHEET : null;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${SHAPE_LABEL[s.shape]} ברדיוס ${s.R} ס"מ, נקודה P על הציר ב-z = ${s.z} ס"מ. V = ${sci(v0)} V, השדה ${onFace ? 'קופץ על פני הדיסקה' : `${sci(e0)} N/C`}. גררו לאורך האיור כדי להזיז את P; במקלדת: חיצים.`}
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
        userMoved.current = false;
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            ב-P: <b class="q">V = {sci(v0)} V</b>
          </span>
          {onFace ? (
            <span>
              על פני הדיסקה השדה קופץ: <b class="q">{sci(-SHEET)} → {sci(SHEET)} N/C</b>
            </span>
          ) : (
            <>
              <span>
                שיפוע המשיק: <b class="q">dV/dz = {sci(-e0)} V/m</b>
              </span>
              <span>
                ומכאן: <b class="q">E_z = −dV/dz = {sci(e0)} N/C</b>
              </span>
              <span>
                מסכום וקטורי (שיעור 6.4): <b class="q">E_z = {sci(ev)} N/C</b>
              </span>
            </>
          )}
          {ratio !== null && (
            <span>
              יחסית ללוח אינסופי: <b class="q">E_z/(σ/2ε₀) = {ratio.toFixed(2)}</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="הגוף הטעון">
            {(Object.keys(SHAPE_LABEL) as AxisShape[]).map((k) => (
              <button
                type="button"
                key={k}
                class={`toggle ${s.shape === k ? 'on' : ''}`}
                aria-pressed={s.shape === k}
                onClick={() => {
                  userMoved.current = true;
                  setS({ ...s, shape: k });
                }}
              >
                {SHAPE_LABEL[k]}
              </button>
            ))}
          </div>
          <Slider
            label="הרדיוס R"
            value={s.R}
            min={5}
            max={R_MAX_CM}
            step={1}
            format={(v) => `${v} cm`}
            onChange={(v) => {
              userMoved.current = true;
              setS((prev) => ({ ...prev, R: v }));
            }}
          />
          <Slider label="המקום של P על הציר, z" value={s.z} min={-58} max={58} step={1} format={(v) => `${v} cm`} onChange={setZ} />
        </>
      }
    />
  );
}
