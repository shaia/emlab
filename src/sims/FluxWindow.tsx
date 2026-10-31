/**
 * Flux window: a flat surface in a uniform field, seen from the side. The learner tilts it,
 * resizes it and changes the field, and sees how many field lines pass through and what
 * Φ = E·A·cosθ gives. Built for lesson 1.7.
 *
 * Scale: each drawn line carries LINE_FLUX of flux per metre of depth, so the field lines
 * are spaced LINE_FLUX/E apart and the number of lines through the window is Φ/LINE_FLUX
 * for a window 1 m deep (A = L · 1 m). The count is an integer, Φ is not: the readout shows Φ.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { fluxFlat } from '~/physics/gauss';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, paperGrid, polyline, withAlpha } from './core/ink';
import { sciN as sci } from './gaussFormat';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const WORLD_W = 2;
const WORLD_H = 1.5;
/** flux carried by one drawn line, per metre of window depth [N·m²/C] */
const LINE_FLUX = 250;
const DEPTH = 1;
const TIP_PX = 16;

const TASK_LABEL: Record<string, string> = {
  'edge-on': 'הטו את החלון עד שהוא מקביל לשדה (θ = 90°). כמה קווים עוברים דרכו?',
  reverse: 'הטו את החלון מעבר ל-90°. מה קרה לסימן של השטף?',
  'double-A': 'הגדילו את שטח החלון פי 2 כשהוא פונה אל השדה (θ קטנה מ-30°). מה קרה לשטף?',
};

export interface FluxWindowProps {
  id: string;
  /** angle between the window's normal and the field, degrees */
  theta?: number;
  E?: number;
  length?: number;
  tasks?: string[];
}

interface State {
  /** signed angle of the normal from the field direction, radians */
  ang: number;
  E: number;
  L: number;
}

function initial(p: FluxWindowProps): State {
  return { ang: ((p.theta ?? 0) * Math.PI) / 180, E: p.E ?? 2000, L: p.length ?? 0.5 };
}

const deg = (r: number) => Math.round((Math.abs(r) * 180) / Math.PI);

export default function FluxWindow(props: FluxWindowProps) {
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
          if (typeof st.theta === 'number') next.ang = (st.theta * Math.PI) / 180;
          if (typeof st.E === 'number') next.E = st.E;
          if (typeof st.length === 'number') next.L = st.length;
          return next;
        });
      }),
    [props.id],
  );

  const A = s.L * DEPTH;
  const rawFlux = fluxFlat(s.E, A, s.ang);
  // cos(90°) is 6·10⁻¹⁷ in floating point: show the zero it stands for
  const flux = Math.abs(rawFlux) < 1e-9 ? 0 : rawFlux;

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const d = deg(s.ang);
    if (has('edge-on') && d >= 85 && d <= 95) done('edge-on');
    if (has('reverse') && d >= 110) done('reverse');
    if (has('double-A') && s.L >= 2 * start.current.L - 1e-9 && d < 30) done('double-A');
  }, [s, props.id, props.tasks]);

  const lineGap = LINE_FLUX / s.E / DEPTH;
  const halfSpan = (s.L / 2) * Math.abs(Math.cos(s.ang));
  /** lines are at y = (k + ½)·gap; those inside the window's vertical extent pass through it */
  const through = (y: number) => Math.abs(y) < halfSpan;

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    paperGrid(ctx, view, p);
    const xmin = -WORLD_W / 2 + 0.04;
    const xmax = WORLD_W / 2 - 0.04;
    const kmax = Math.ceil(WORLD_H / 2 / lineGap);
    let count = 0;
    for (let k = -kmax; k <= kmax; k++) {
      const y = (k + 0.5) * lineGap;
      if (Math.abs(y) > WORLD_H / 2 - 0.04) continue;
      const hitWin = through(y);
      if (hitWin) count++;
      const a = toScreen(view, xmin, y);
      const b = toScreen(view, xmax, y);
      polyline(ctx, [a, b], p.efield, hitWin ? 2.4 : 1.2, {
        alpha: hitWin ? 1 : 0.5,
        glow: hitWin ? p.efieldGlow : undefined,
        dash: [9, 11],
        dashOffset: -t * 40,
      });
    }

    // the window: a thick bar seen edge-on, with its normal
    const nx = Math.cos(s.ang);
    const ny = Math.sin(s.ang);
    const tx = -ny;
    const ty = nx;
    const [x1, y1] = toScreen(view, (tx * s.L) / 2, (ty * s.L) / 2);
    const [x2, y2] = toScreen(view, (-tx * s.L) / 2, (-ty * s.L) / 2);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = withAlpha(p.accent, 0.25);
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    const [cx, cy] = toScreen(view, 0, 0);
    const normalLen = 0.32 * view.ppm;
    arrow(ctx, cx, cy, cx + nx * normalLen, cy - ny * normalLen, { color: p.ink, width: 2.2, head: 11 });
    ctx.save();
    ctx.font = `italic 600 14px ${p.fontUi}`;
    ctx.fillStyle = p.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('n', cx + nx * (normalLen + 14), cy - ny * (normalLen + 14));
    // the angle arc
    if (Math.abs(s.ang) > 0.05) {
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 0.14 * view.ppm, 0, -s.ang, s.ang > 0);
      ctx.stroke();
      const mid = s.ang / 2;
      ctx.fillStyle = p.ink2;
      ctx.fillText('θ', cx + Math.cos(mid) * 0.22 * view.ppm, cy - Math.sin(mid) * 0.22 * view.ppm);
    }
    // field label
    ctx.fillStyle = p.efield;
    ctx.font = `italic 600 15px ${p.fontUi}`;
    ctx.textAlign = 'left';
    const [lx, ly] = toScreen(view, xmin + 0.02, WORLD_H / 2 - 0.12);
    ctx.fillText('E →', lx, ly);
    ctx.restore();
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: true });
  useEffect(invalidate, [s]);

  const tip = () => {
    const v = viewRef.current;
    if (!v) return null;
    const [cx, cy] = toScreen(v, 0, 0);
    const len = 0.32 * v.ppm;
    return [cx + Math.cos(s.ang) * len, cy - Math.sin(s.ang) * len] as const;
  };

  const onPointerDown = (e: PointerEvent) => {
    const t = tip();
    if (!t) return;
    if (Math.hypot(e.offsetX - t[0], e.offsetY - t[1]) < TIP_PX + 8) {
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!dragging.current || !v) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, ang: Math.round((Math.atan2(wy, wx) * 180) / Math.PI / 5) * ((5 * Math.PI) / 180) }));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(`הזווית ${deg(s.ang)} מעלות. השטף ${sci(flux)} ניוטון מטר בריבוע לקולון.`);
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
    e.preventDefault();
    const sgn = k === 'ArrowLeft' || k === 'ArrowDown' ? -1 : 1;
    const step = ((e.shiftKey ? 15 : 5) * Math.PI) / 180;
    setS((prev) => {
      const next = { ...prev, ang: Math.max(-Math.PI, Math.min(Math.PI, prev.ang + sgn * step)) };
      setLive(`הזווית ${deg(next.ang)} מעלות.`);
      return next;
    });
  };

  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };
  const nThrough = (() => {
    const kmax = Math.ceil(WORLD_H / 2 / lineGap);
    let n = 0;
    for (let k = -kmax; k <= kmax; k++) {
      const y = (k + 0.5) * lineGap;
      if (Math.abs(y) <= WORLD_H / 2 - 0.04 && through(y)) n++;
    }
    return n;
  })();

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: חלון שטוח בשדה אחיד. שטח ${sci(A)} מטר רבוע, שדה ${sci(s.E)} ניוטון לקולון, זווית ${deg(s.ang)} מעלות, שטף ${sci(flux)}. גררו את חץ האנך בעכבר או במגע; במקלדת: חיצים מסובבים.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor="default"
      readout={
        <>
          <span>
            שטח: <b class="q">A = {sci(A)} m²</b> · זווית: <b class="q">θ = {deg(s.ang)}°</b>
          </span>
          <span>
            קווים שעוברים: <b class="q">{nThrough}</b>
          </span>
          <span>
            שטף: <b class="q">Φ = E·A·cosθ = {sci(flux)} N·m²/C</b>
          </span>
        </>
      }
      controls={
        <>
          <Slider
            label="זווית θ"
            value={deg(s.ang)}
            min={0}
            max={180}
            step={5}
            format={(v) => `${v}°`}
            onChange={(v) => setS({ ...s, ang: ((s.ang < 0 ? -v : v) * Math.PI) / 180 })}
          />
          <Slider
            label="שדה E"
            value={s.E}
            min={1000}
            max={4000}
            step={500}
            format={(v) => `${sci(v)} N/C`}
            onChange={(v) => setS({ ...s, E: v })}
          />
          <Slider
            label="אורך החלון"
            value={s.L}
            min={0.2}
            max={1}
            step={0.1}
            format={(v) => `${sci(Math.round(v * 10) / 10)} m`}
            onChange={(v) => setS({ ...s, L: Math.round(v * 10) / 10 })}
          />
        </>
      }
    />
  );
}
