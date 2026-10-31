/**
 * Torsion-balance data and the graph that reveals the law: measured force F against r, 1/r or
 * 1/r². Only the graph against 1/r² is a straight line, and its slope is k·q₁·q₂. Built for the
 * chapter review (lesson 1.11).
 *
 * The data come from src/physics/lab-data.ts (a fixed seed, 4% measurement error); the fit and
 * R² are computed there too. The figure supports the reading of a graph; the law itself comes
 * from Coulomb's experiment and the derivation in lesson 1.3.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { coulombAxis, coulombRun, linearFit } from '~/physics/lab-data';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { polyline, withAlpha } from './core/ink';
import { sciFull as sci } from './core-sci';
import SimShell, { Toggle, type TaskDef } from './core/SimShell';

export type Axis = 'r' | 'r2' | 'inv' | 'inv2';

/** the sphere charges are given in the lesson; the run is fixed so text and figure agree */
export const Q1 = 2e-7;
export const Q2 = 3e-7;
const RADII = [0.05, 0.075, 0.1, 0.125, 0.15, 0.2, 0.25];
const RUN = coulombRun(Q1, Q2, RADII, 0.04, 3);

const AXES: Record<Axis, { p: number; label: string; name: string; unit: string }> = {
  r: { p: 1, label: 'r (m)', name: '⁦r⁩', unit: 'm' },
  r2: { p: 2, label: 'r² (m²)', name: '⁦r²⁩', unit: 'm²' },
  inv: { p: -1, label: '1/r (m⁻¹)', name: '⁦1/r⁩', unit: 'm⁻¹' },
  inv2: { p: -2, label: '1/r² (m⁻²)', name: '⁦1/r²⁩', unit: 'm⁻²' },
};
const AXIS_IDS = Object.keys(AXES) as Axis[];

const TASK_LABEL: Record<string, string> = {
  'try-all': 'לחצו על כל אחד מארבעת הצירים האופקיים ובדקו אם הנקודות מתיישרות.',
  straight: 'בחרו בעצמכם את הציר האופקי שבו הנקודות מתיישרות על קו ישר אחד.',
};

interface State {
  axis: Axis;
  fit: boolean;
  seen: Axis[];
}

export interface CoulombGraphProps {
  id: string;
  axis?: Axis;
  tasks?: string[];
}

/** A tick step of 1, 2 or 5 · 10ⁿ that gives about 4–6 ticks up to `max`. */
function tickStep(max: number): number {
  const raw = max / 5;
  const e = Math.floor(Math.log10(raw));
  const m = raw / 10 ** e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * 10 ** e;
}

export default function CoulombGraph(props: CoulombGraphProps) {
  const first = props.axis ?? 'r';
  const [s, setS] = useState<State>({ axis: first, fit: true, seen: [first] });
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const startRef = useRef(first);

  /** a step in the text only shows an axis; it never counts as the student's own try */
  const showAxis = (axis: Axis) => setS((prev) => ({ ...prev, axis }));
  /** the student picks an axis: only this ticks the tasks */
  const pickAxis = (axis: Axis) => {
    const seen = s.seen.includes(axis) ? s.seen : [...s.seen, axis];
    setS({ ...s, axis, seen });
    if (props.tasks?.includes('try-all') && AXIS_IDS.every((a) => seen.includes(a))) markTask(`${props.id}:try-all`);
    if (props.tasks?.includes('straight') && axis === 'inv2') markTask(`${props.id}:straight`);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        if (st.axis === 'r' || st.axis === 'r2' || st.axis === 'inv' || st.axis === 'inv2') showAxis(st.axis);
        if (typeof st.fit === 'boolean') setS((prev) => ({ ...prev, fit: st.fit as boolean }));
      }),
    [props.id],
  );

  const xs = coulombAxis(RUN, AXES[s.axis].p);
  const fit = linearFit(xs, RUN.F);


  useEffect(() => {
    const id = setTimeout(
      () => setLive(`הציר האופקי: ${AXES[s.axis].name}. מדד ההתאמה R בריבוע ${fit.r2.toFixed(3)}.`),
      300,
    );
    return () => clearTimeout(id);
  }, [s.axis]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const ml = 62;
    const mr = 18;
    const mt = 18;
    const mb = 46;
    const W = view.w - ml - mr;
    const H = view.h - mt - mb;
    const xmax = Math.max(...xs) * 1.08;
    const ymax = Math.max(...RUN.F) * 1.1;
    const X = (x: number) => ml + (x / xmax) * W;
    const Y = (y: number) => mt + H - (y / ymax) * H;

    ctx.save();
    ctx.font = `12px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    // grid and ticks
    const sx = tickStep(xmax);
    const sy = tickStep(ymax);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (let x = 0; x <= xmax; x += sx) {
      ctx.beginPath();
      ctx.moveTo(X(x), mt);
      ctx.lineTo(X(x), mt + H);
      ctx.stroke();
      ctx.fillText(sci(x, 2), X(x), mt + H + 5);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = 0; y <= ymax; y += sy) {
      ctx.beginPath();
      ctx.moveTo(ml, Y(y));
      ctx.lineTo(ml + W, Y(y));
      ctx.stroke();
      ctx.fillText(sci(y, 2), ml - 6, Y(y));
    }
    // axes
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ml, mt);
    ctx.lineTo(ml, mt + H);
    ctx.lineTo(ml + W, mt + H);
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.font = `italic 600 13px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(AXES[s.axis].label, ml + W / 2, view.h - 4);
    ctx.save();
    ctx.translate(14, mt + H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top';
    ctx.fillText('F (N)', 0, 0);
    ctx.restore();
    ctx.restore();

    if (s.fit && Number.isFinite(fit.slope)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(ml, mt, W, H);
      ctx.clip();
      polyline(ctx, [[X(0), Y(fit.intercept)], [X(xmax), Y(fit.intercept + fit.slope * xmax)]], p.accent, 2, { dash: [7, 5], alpha: 0.9 });
      ctx.restore();
    }
    xs.forEach((x, i) => {
      ctx.save();
      ctx.fillStyle = p.paper;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(x), Y(RUN.F[i]), 5.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.efield, 0.5);
      ctx.beginPath();
      ctx.arc(X(x), Y(RUN.F[i]), 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1.2, animate: false });
  useEffect(invalidate, [s]);

  const straight = fit.r2 > 0.99;

  return (
    <SimShell
      fig={props.id}
      label={`גרף של הכוח F מול ${AXES[s.axis].name}, שבע נקודות מדידה. ${straight ? 'הנקודות קרובות מאוד לקו ישר.' : 'הנקודות אינן על קו ישר.'}`}
      canvasRef={canvasRef}
      aspect={1.6 / 1.2}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS({ axis: startRef.current, fit: true, seen: [startRef.current] });
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            מדד ההתאמה לקו ישר: <b class="q">R² = {fit.r2.toFixed(3)}</b>
          </span>
          <span>
            <b>{straight ? 'הנקודות על קו ישר' : 'הנקודות אינן על קו ישר'}</b>
          </span>
          {s.axis === 'inv2' && (
            <span>
              שיפוע הקו: <b class="q">{sci(fit.slope, 3)} N·m²</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="הציר האופקי">
            {AXIS_IDS.map((a) => (
              <Toggle key={a} label={`⁦F⁩ מול ${AXES[a].name}`} on={s.axis === a} onChange={() => pickAxis(a)} />
            ))}
          </div>
          <div class="group">
            <Toggle label="קו מגמה" on={s.fit} swatch="var(--accent)" onChange={(on) => setS((prev) => ({ ...prev, fit: on }))} />
          </div>
        </>
      }
    />
  );
}
