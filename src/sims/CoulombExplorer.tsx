/**
 * Coulomb explorer: two point charges whose values and separation the student changes. Equal
 * and opposite force arrows act on the two charges (Newton's third law), and a live F-r graph
 * shows the 1/r² law, with a ghost point at double the distance where F is a quarter.
 * Built for lesson 1.3.
 *
 * Arrows share one fixed scale (a fraction of the stage width per newton), so doubling a charge
 * visibly doubles an arrow. An arrow that would run into the other charge, or off the stage, is
 * cut short and marked with a break; the readout always shows the true value.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { coulombForce } from '~/physics/electrostatics';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, chargeDisc } from './core/ink';
import { directionHe, sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const uC = 1e-6;
const R = 15;
/** the stage shows separations up to this [cm]; the graph's x axis covers 10..R_PLOT_MAX */
const R_PLOT_MAX = 60;
const R_MIN = 10;
const R_MAX = 50;
const SCENE_FRAC = 0.4;
/** arrow length per newton, as a fraction of the stage width */
const PX_PER_N_FRAC = 0.11;
/** charge steps in μC; zero is excluded because then there is no force to study */
const Q_STEPS = [-4, -3, -2, -1, 1, 2, 3, 4];

const TASK_LABEL: Record<string, string> = {
  'double-r': 'הכפילו את המרחק r, והשאירו את המטענים כמו שהם. פי כמה השתנה הכוח?',
  'double-q': 'הכפילו את אחד המטענים, והשאירו את המרחק. פי כמה השתנה הכוח?',
  unequal: 'בחרו מטען אחד שגדול פי 4 מהשני, והשוו את שני החצים.',
  attract: 'הפכו את אחד המטענים לשלילי. מה קרה לכיוון החצים?',
};

interface State {
  q1: number;
  q2: number;
  r: number;
}

export interface CoulombExplorerProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  /** charges in μC (signed) and separation in cm at the start */
  q1?: number;
  q2?: number;
  r?: number;
  tasks?: string[];
}

const initial = (p: CoulombExplorerProps): State => ({ q1: p.q1 ?? 2, q2: p.q2 ?? 2, r: p.r ?? 20 });

const qText = (q: number) => `${q > 0 ? '+' : '−'}${Math.abs(q)} μC`;

/** Smallest of 1, 2, 5 × 10ⁿ that is at least v: a tidy top for the force axis. */
function niceCeil(v: number): number {
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}

const forceN = (s: State, rCm = s.r) => coulombForce(s.q1 * uC, s.q2 * uC, rCm / 100);

export default function CoulombExplorer(props: CoulombExplorerProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const start = useRef<State>(initial(props));
  const dragging = useRef(false);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.q1 === 'number') next.q1 = st.q1;
          if (typeof st.q2 === 'number') next.q2 = st.q2;
          if (typeof st.r === 'number') next.r = st.r;
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const st = start.current;
    const sameCharges = s.q1 === st.q1 && s.q2 === st.q2;
    if (has('double-r') && sameCharges && s.r >= 2 * st.r) done('double-r');
    if (has('double-q') && s.r === st.r && ((s.q1 === 2 * st.q1 && s.q2 === st.q2) || (s.q2 === 2 * st.q2 && s.q1 === st.q1))) done('double-q');
    if (has('unequal') && Math.max(Math.abs(s.q1), Math.abs(s.q2)) >= 3 * Math.min(Math.abs(s.q1), Math.abs(s.q2))) done('unequal');
    if (has('attract') && s.q1 * s.q2 < 0) done('attract');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { w, h } = view;
    const sceneH = h * SCENE_FRAC;
    const cy = sceneH * 0.5;
    const cx = w / 2;
    const rpx = (s.r / R_PLOT_MAX) * 0.84 * w;
    const x1 = cx - rpx / 2;
    const x2 = cx + rpx / 2;
    const F = forceN(s);
    const repel = F > 0;

    // the two charges, with their names above and values below
    chargeDisc(ctx, x1, cy, R, s.q1, p, { label: qText(s.q1) });
    chargeDisc(ctx, x2, cy, R, s.q2, p, { label: qText(s.q2) });
    ctx.save();
    ctx.font = `italic 600 14px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.direction = 'ltr';
    ctx.fillText('q₁', x1, cy - R - 6);
    ctx.fillText('q₂', x2, cy - R - 6);
    ctx.restore();

    // equal and opposite forces: F₁ acts on q₁, F₂ on q₂
    const pxPerN = PX_PER_N_FRAC * w;
    const want = Math.abs(F) * pxPerN;
    const room = repel ? (w - rpx) / 2 - R - 14 : rpx / 2 - R - 5;
    const L = Math.min(want, Math.max(0, room));
    const cut = want > room;
    const drawForce = (cxCharge: number, dirx: number, name: string) => {
      const x0 = cxCharge + dirx * R;
      if (L >= 1) {
        arrow(ctx, x0, cy, x0 + dirx * L, cy, { color: p.force, width: 3.2, head: Math.min(12, L * 0.8) });
        if (cut) {
          const bx = x0 + dirx * L * 0.5;
          ctx.save();
          ctx.strokeStyle = p.paper;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(bx - 2, cy - 6);
          ctx.lineTo(bx + 2, cy + 6);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (L >= 18) {
        ctx.save();
        ctx.font = `italic 700 14px ${p.fontUi}`;
        ctx.fillStyle = p.force;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.direction = 'ltr';
        ctx.fillText(name, x0 + (dirx * L) / 2, cy - 7);
        ctx.restore();
      }
    };
    drawForce(x1, repel ? -1 : 1, 'F₁');
    drawForce(x2, repel ? 1 : -1, 'F₂');

    // distance line under the charges, and the scale of the arrows
    const dy = cy + R + 30;
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.fillStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x1, dy - 4);
    ctx.lineTo(x1, dy + 4);
    ctx.moveTo(x1, dy);
    ctx.lineTo(x2, dy);
    ctx.moveTo(x2, dy - 4);
    ctx.lineTo(x2, dy + 4);
    ctx.stroke();
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`r = ${s.r} ס"מ`, cx, dy + 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const sx = 12;
    const sy = sceneH - 8;
    ctx.strokeStyle = p.ink2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 4);
    ctx.lineTo(sx, sy + 4);
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + pxPerN, sy);
    ctx.moveTo(sx + pxPerN, sy - 4);
    ctx.lineTo(sx + pxPerN, sy + 4);
    ctx.stroke();
    ctx.fillText('= 1 N', sx + pxPerN + 6, sy);
    ctx.restore();

    // F-r graph: |F| for the current charges, the current point, and the point at 2r
    const box = insetBox({ x: 0, y: sceneH + 6, w, h: h - sceneH - 6 }, { l: 58, r: 16, t: 10, b: 46 });
    const yMax = niceCeil(Math.abs(forceN(s, R_MIN)) * 1.05);
    const plot = makePlot(
      box,
      { min: R_MIN, max: R_PLOT_MAX, label: 'המרחק r בסנטימטרים', ticks: [10, 20, 30, 40, 50, 60], format: (v) => String(v) },
      { min: 0, max: yMax, label: 'גודל הכוח F בניוטון' },
    );
    drawAxes(ctx, plot, p);
    drawCurve(ctx, plot, (r) => Math.abs(forceN(s, r)), { color: p.force });
    const label = (text: string, xv: number, yv: number, color: string) => {
      ctx.save();
      ctx.font = `italic 700 13px ${p.fontUi}`;
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.direction = 'ltr';
      ctx.fillText(text, Math.min(plot.px(xv) + 8, box.x + box.w - 24), plot.py(yv) - 7);
      ctx.restore();
    };
    if (2 * s.r <= R_PLOT_MAX) {
      const f2 = Math.abs(forceN(s, 2 * s.r));
      drawMarker(ctx, plot, 2 * s.r, f2, p.ink3, { guides: true, radius: 4.5 });
      label('¼F', 2 * s.r, f2, p.ink2);
    }
    drawMarker(ctx, plot, s.r, Math.abs(F), p.force, { guides: true });
    label('F', s.r, Math.abs(F), p.force);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  const describe = (st: State) => {
    const F = Math.abs(forceN(st));
    return `המטענים ${qText(st.q1)} ו-${qText(st.q2)} במרחק ${st.r} ס"מ. הכוח על כל אחד מהם ${sci(F)} ניוטון, ${forceN(st) > 0 ? 'דחייה' : 'משיכה'}.`;
  };

  const setR = (r: number) => setS((prev) => ({ ...prev, r: Math.max(R_MIN, Math.min(R_MAX, Math.round(r))) }));

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const sceneH = v.h * SCENE_FRAC;
    const cy = sceneH * 0.5;
    const rpx = (s.r / R_PLOT_MAX) * 0.84 * v.w;
    for (const x of [v.w / 2 - rpx / 2, v.w / 2 + rpx / 2]) {
      if (Math.hypot(e.offsetX - x, e.offsetY - cy) < R + 12) {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v || !dragging.current) return;
    setR((Math.round(((Math.abs(e.offsetX - v.w / 2) * 2 * R_PLOT_MAX) / (0.84 * v.w)) / 5)) * 5);
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(describe(s));
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const r = Math.max(R_MIN, Math.min(R_MAX, s.r + d * 5));
    setS({ ...s, r });
    setLive(describe({ ...s, r }));
  };

  const F = forceN(s);
  const away = F > 0;
  const qIndex = (q: number) => Math.max(0, Q_STEPS.indexOf(q));

  return (
    <SimShell
      fig={props.id}
      label={`איור חי של חוק קולון. ${describe(s)} גררו מטען כדי לשנות את המרחק; במקלדת: חיצים.`}
      canvasRef={canvasRef}
      aspect={1}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(initial(props));
        setLive('האיור אופס.');
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor="ew-resize"
      readout={
        <>
          <span>
            הכוח על <span class="q">q₁</span>: <b class="q">F₁ = {sci(Math.abs(F))} N</b> ({directionHe(away ? Math.PI : 0)})
          </span>
          <span>
            הכוח על <span class="q">q₂</span>: <b class="q">F₂ = {sci(Math.abs(F))} N</b> ({directionHe(away ? 0 : Math.PI)})
          </span>
          <span>{away ? 'המטענים דוחים זה את זה' : 'המטענים מושכים זה את זה'}</span>
        </>
      }
      controls={
        <>
          <Slider
            label="המטען q₁"
            min={0}
            max={Q_STEPS.length - 1}
            step={1}
            value={qIndex(s.q1)}
            format={(i) => qText(Q_STEPS[i])}
            onChange={(i) => setS({ ...s, q1: Q_STEPS[i] })}
          />
          <Slider
            label="המטען q₂"
            min={0}
            max={Q_STEPS.length - 1}
            step={1}
            value={qIndex(s.q2)}
            format={(i) => qText(Q_STEPS[i])}
            onChange={(i) => setS({ ...s, q2: Q_STEPS[i] })}
          />
          <Slider
            label="המרחק r"
            min={R_MIN}
            max={R_MAX}
            step={5}
            value={s.r}
            format={(v) => `${v} ס"מ`}
            onChange={setR}
          />
        </>
      }
    />
  );
}
