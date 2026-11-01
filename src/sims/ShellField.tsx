/**
 * Shell field: a thin uniformly charged spherical shell, a concentric Gaussian sphere the
 * learner resizes, and the field read off Gauss's law by symmetry. Cross-section on the left,
 * graph of E against r on the right. Built for lesson 1.8.
 *
 * The drawn arrows and the graph use shellField / shellEnclosed from src/physics; nothing is
 * integrated: the field on the Gaussian sphere is the same everywhere on it, so
 * E · 4πr² = q_enclosed/ε₀ (src/physics/gauss.ts, sphereFieldFromGauss).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { shellField } from '~/physics/electrostatics';
import { shellEnclosed } from '~/physics/gauss';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sciN as sci } from './gaussFormat';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const uC = 1e-6;
/** shell radius [m] */
const R = 0.4;
const R_MAX = 1.0;
const N_ARROWS = 12;

const TASK_LABEL: Record<string, string> = {
  'inside-zero': 'כווצו את משטח גאוס עד שהוא בתוך הקליפה. מה השדה שם?',
  'quarter-field': 'מצאו את הרדיוס שבו השדה חלש פי 4 מהשדה ממש מחוץ לקליפה (מיד אחרי הדופן).',
  'negative-shell': 'הפכו את מטען הקליפה לשלילי, והגדילו את משטח גאוס אל מחוץ לקליפה. לאן מצביעים החצים?',
};

export interface ShellFieldProps {
  id: string;
  /** shell charge, μC */
  Q?: number;
  /** Gaussian sphere radius [m] */
  r?: number;
  tasks?: string[];
}

interface State {
  Q: number;
  r: number;
}

const signed = (q: number) => `${q > 0 ? '+' : q < 0 ? '−' : ''}${Math.abs(q)} μC`;

export default function ShellField(props: ShellFieldProps) {
  const [s, setS] = useState<State>({ Q: props.Q ?? 2, r: props.r ?? 0.7 });
  const [live, setLive] = useState('');
  const dragging = useRef(false);
  // a state change that came from a text step must not tick a task: only the student's own controls do
  const fromStep = useRef(false);
  // the inside of the graph stays hidden until someone (or a step) takes the Gaussian sphere inside the shell
  const [reveal, setReveal] = useState(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        fromStep.current = true;
        setS((prev) => ({
          Q: typeof st.Q === 'number' ? st.Q : prev.Q,
          r: typeof st.r === 'number' ? st.r : prev.r,
        }));
      }),
    [props.id],
  );

  const Q = s.Q * uC;
  const qIn = shellEnclosed(Q, R, s.r);
  const E = shellField(Q, R, s.r);
  const Esurface = shellField(Q, R, R);

  useEffect(() => {
    if (s.r < R) setReveal(true);
    if (fromStep.current) {
      fromStep.current = false;
      return;
    }
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (has('inside-zero') && s.r < R - 0.04) done('inside-zero');
    if (has('quarter-field') && s.Q !== 0 && Math.abs(s.r - 2 * R) < 0.03) done('quarter-field');
    if (has('negative-shell') && s.Q < 0 && s.r > R + 0.1) done('negative-shell');
  }, [s, props.id, props.tasks]);

  /** geometry shared by drawing and hit-testing: cross-section on the left, graph on the right */
  const layout = (w: number, h: number) => {
    const cx = w * 0.26;
    const cy = h * 0.5;
    const rmax = Math.min(w * 0.235, h * 0.44);
    return { cx, cy, rmax, gx0: w * 0.56, gx1: w * 0.96, gy0: h * 0.12, gy1: h * 0.78 };
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { w, h } = view;
    const { cx, cy, rmax, gx0, gx1, gy0, gy1 } = layout(w, h);
    const k = rmax / R_MAX;
    ctx.save();
    // the shell: a ring with sign glyphs
    ctx.lineWidth = 6;
    ctx.strokeStyle = s.Q >= 0 ? p.pos : p.neg;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(cx, cy, R * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.paper;
    ctx.font = `700 ${Math.max(10, Math.round(R * k * 0.34))}px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      const a = (2 * Math.PI * i) / 8;
      ctx.fillStyle = p.ink;
      ctx.fillText(s.Q >= 0 ? '+' : '−', cx + Math.cos(a) * R * k * 1.0, cy + Math.sin(a) * R * k * 1.0 - 0.5);
    }

    // the Gaussian sphere
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = p.accent;
    ctx.fillStyle = withAlpha(p.accent, 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, s.r * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    // grab handle on the surface
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + s.r * k, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // the field on the Gaussian sphere: same length everywhere on it, by symmetry
    if (E !== 0) {
      const maxLen = rmax * 0.3;
      const len = Math.max(6, Math.min(maxLen, (Math.abs(E) / Math.abs(Esurface || E)) * maxLen));
      for (let i = 0; i < N_ARROWS; i++) {
        const a = (2 * Math.PI * i + Math.PI / N_ARROWS) / N_ARROWS;
        const ux = Math.cos(a);
        const uy = -Math.sin(a);
        const bx = cx + ux * s.r * k;
        const by = cy + uy * s.r * k;
        const out = E > 0 ? 1 : -1;
        if (out > 0) arrow(ctx, bx, by, bx + ux * len, by + uy * len, { color: p.efield, width: 2.4, head: 9 });
        else arrow(ctx, bx + ux * len, by + uy * len, bx, by, { color: p.efield, width: 2.4, head: 9 });
      }
    } else {
      ctx.fillStyle = p.ink;
      ctx.font = `600 15px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.fillText('E = 0', cx, cy);
    }

    // graph of E against r
    const Emax = Math.abs(Esurface) || 1;
    const gx = (r: number) => gx0 + (r / R_MAX) * (gx1 - gx0);
    const gy = (e: number) => gy1 - (Math.abs(e) / (Emax * 1.1)) * (gy1 - gy0);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gx0, gy0 - 4);
    ctx.lineTo(gx0, gy1);
    ctx.lineTo(gx1 + 4, gy1);
    ctx.stroke();
    ctx.fillStyle = p.ink2;
    ctx.font = `12px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('r (m)', (gx0 + gx1) / 2, gy1 + 20);
    for (const rt of [0, 1]) ctx.fillText(String(rt), gx(rt), gy1 + 4);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('|E|', gx0 - 6, gy0 - 2);
    // R marker
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    ctx.moveTo(gx(R), gy0);
    ctx.lineTo(gx(R), gy1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('R', gx(R), gy1 + 4);
    // curve
    if (s.Q !== 0) {
      ctx.strokeStyle = p.efield;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      if (reveal) {
        ctx.moveTo(gx(0), gy(0));
        ctx.lineTo(gx(R - 1e-6), gy(0));
        ctx.lineTo(gx(R), gy(0));
      } else {
        ctx.moveTo(gx(R), gy(shellField(Q, R, R)));
      }
      ctx.lineTo(gx(R), gy(shellField(Q, R, R)));
      for (let i = 1; i <= 80; i++) {
        const r = R + ((R_MAX - R) * i) / 80;
        ctx.lineTo(gx(r), gy(shellField(Q, R, r)));
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = p.efield;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(gx(0), gy1);
      ctx.lineTo(gx(R_MAX), gy1);
      ctx.stroke();
    }
    if (!reveal) {
      ctx.fillStyle = p.ink3;
      ctx.font = `600 22px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', gx(R / 2), gy1 - (gy1 - gy0) * 0.12);
    }
    // current point
    ctx.fillStyle = p.accent;
    ctx.strokeStyle = p.paper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gx(s.r), gy(E), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 3, worldHeight: 2, animate: false });
  useEffect(invalidate, [s]);

  const rFromPointer = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return null;
    const { cx, cy, rmax } = layout(v.w, v.h);
    return Math.hypot(e.offsetX - cx, e.offsetY - cy) / (rmax / R_MAX);
  };
  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    const r = rFromPointer(e);
    if (!v || r === null) return;
    const { rmax } = layout(v.w, v.h);
    // grab anywhere near the dashed circle
    if (Math.abs(r - s.r) * (rmax / R_MAX) < 16) {
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const r = rFromPointer(e);
    if (r === null) return;
    setS((prev) => ({ ...prev, r: Math.round(Math.max(0.1, Math.min(R_MAX, r)) * 100) / 100 }));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(describe(s));
    dragging.current = false;
  };
  const describe = (st: State) => {
    const q = shellEnclosed(st.Q * uC, R, st.r);
    return `משטח גאוס ברדיוס ${sci(st.r)} מטר. המטען בתוכו ${signed(q / uC)}. השדה עליו ${sci(shellField(st.Q * uC, R, st.r))} ניוטון לקולון.`;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
    setS((prev) => {
      const next = { ...prev, r: Math.round(Math.max(0.1, Math.min(R_MAX, prev.r + d * (e.shiftKey ? 0.1 : 0.02))) * 100) / 100 };
      setLive(describe(next));
      return next;
    });
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: קליפה כדורית ברדיוס ${R} מטר עם מטען ${signed(s.Q)}, ומשטח גאוס. ${describe(s)} גררו את המעגל המקווקו; במקלדת: חיצים משנים את הרדיוס.`}
      canvasRef={canvasRef}
      aspect={3 / 2}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onReset={() => {
        setS({ Q: props.Q ?? 2, r: props.r ?? 0.7 });
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            מטען בתוך משטח גאוס: <b class="q">q = {signed(qIn / uC)}</b>
          </span>
          <span>
            שדה על המשטח: <b class="q">E = {sci(Math.abs(E))} N/C</b> {E === 0 ? '' : E > 0 ? '(החוצה)' : '(פנימה)'}
          </span>
        </>
      }
      controls={
        <>
          <Slider label="רדיוס משטח גאוס" value={s.r} min={0.1} max={R_MAX} step={0.01} format={(v) => `${sci(v)} m`} onChange={(v) => setS({ ...s, r: v })} />
          <Slider label="מטען הקליפה" value={s.Q} min={-4} max={4} step={1} format={(v) => signed(v)} onChange={(v) => setS({ ...s, Q: v })} />
        </>
      }
    />
  );
}
