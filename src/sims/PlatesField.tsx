/**
 * Plates field: one large charged plane, or two parallel planes, seen from the side. A probe
 * point slides along the axis and reads the field; an optional pillbox (Gaussian cylinder)
 * straddles the first plane. Built for lesson 1.8.
 *
 * The field at every point is the sum of the planes' fields, each σ/(2ε₀) pointing away from
 * a positive plane and toward a negative one (planesFieldX, src/physics/gauss.ts). It does not
 * depend on the distance from a plane: that is the lesson.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { planesFieldX } from '~/physics/gauss';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, paperGrid, withAlpha } from './core/ink';
import { sciN as sci } from './gaussFormat';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const uC = 1e-6;
const WORLD_W = 2;
const WORLD_H = 1.5;
const PLATE_HALF = 0.62;
const PROBE_Y = -0.5;
/** field that draws a 0.25 m arrow [N/C] (two plates, σ = 2 μC/m²) */
const E_REF = 2.26e5;

export type PlatesMode = 'one' | 'opposite' | 'same';

const MODE_LABEL: Record<PlatesMode, string> = {
  one: 'לוח אחד',
  opposite: 'שני לוחות: + ו-−',
  same: 'שני לוחות: שניהם +',
};

const TASK_LABEL: Record<string, string> = {
  'far-same': 'בלוח יחיד: הזיזו את נקודת המדידה קרוב ללוח ואחר כך רחוק ממנו. מה קרה לשדה?',
  'outside-zero': 'בשני לוחות + ו-−: מדדו את השדה מחוץ ללוחות. כמה הוא?',
  'same-between': 'בשני לוחות שניהם +: מדדו את השדה בין הלוחות ומחוץ להם. מה שונה מ-+ ו-−?',
};

export interface PlatesFieldProps {
  id: string;
  mode?: PlatesMode;
  /** surface charge density, μC/m² */
  sigma?: number;
  pillbox?: boolean;
  tasks?: string[];
}

interface State {
  mode: PlatesMode;
  sigma: number;
  pillbox: boolean;
  probe: number;
}

const planesFor = (mode: PlatesMode, sigma: number) => {
  const s = sigma * uC;
  if (mode === 'one') return [{ x: 0, sigma: s }];
  if (mode === 'opposite')
    return [
      { x: -0.3, sigma: s },
      { x: 0.3, sigma: -s },
    ];
  return [
    { x: -0.3, sigma: s },
    { x: 0.3, sigma: s },
  ];
};

const fieldWords = (e: number) => (Math.abs(e) < 1 ? 'E = 0' : `E = ${sci(Math.abs(e))} N/C, ${e > 0 ? 'ימינה' : 'שמאלה'}`);

export default function PlatesField(props: PlatesFieldProps) {
  const [s, setS] = useState<State>({ mode: props.mode ?? 'one', sigma: props.sigma ?? 2, pillbox: props.pillbox ?? false, probe: 0.45 });
  const [live, setLive] = useState('');
  const dragging = useRef(false);
  const seen = useRef({ near: false, far: false });
  // a state change that came from a text step must not tick a task: only the student's own controls do
  const fromStep = useRef(false);
  // the probe tasks need the student to move the probe, not just to pick a mode
  const probeMoved = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        fromStep.current = true;
        probeMoved.current = false;
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.mode === 'string' && st.mode in MODE_LABEL) next.mode = st.mode as PlatesMode;
          if (typeof st.sigma === 'number') next.sigma = st.sigma;
          if (typeof st.pillbox === 'boolean') next.pillbox = st.pillbox;
          if (typeof st.probe === 'number') next.probe = st.probe;
          return next;
        });
      }),
    [props.id],
  );

  const planes = planesFor(s.mode, s.sigma);
  const Eprobe = planesFieldX(planes, s.probe);
  const Eleft = planesFieldX(planes, -0.8);
  const Emid = planesFieldX(planes, 0);
  const Eright = planesFieldX(planes, 0.8);

  useEffect(() => {
    if (fromStep.current) {
      fromStep.current = false;
      return;
    }
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (!probeMoved.current) return;
    if (s.mode === 'one') {
      if (Math.abs(s.probe) < 0.2) seen.current.near = true;
      if (Math.abs(s.probe) > 0.7) seen.current.far = true;
      if (has('far-same') && seen.current.near && seen.current.far) done('far-same');
    }
    if (has('outside-zero') && s.mode === 'opposite' && Math.abs(s.probe) > 0.4) done('outside-zero');
    if (has('same-between') && s.mode === 'same' && Math.abs(s.probe) < 0.25) done('same-between');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p);
    const pxPerE = (0.25 * view.ppm) / E_REF;
    const maxLen = 0.45 * view.ppm;

    // pillbox around the first plane
    if (s.pillbox) {
      const [x0, y0] = toScreen(view, planes[0].x - 0.17, 0.0);
      const [x1, y1] = toScreen(view, planes[0].x + 0.17, -0.2);
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = p.accent;
      ctx.fillStyle = withAlpha(p.accent, 0.1);
      ctx.beginPath();
      ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.fill();
      ctx.stroke();
      // the two bases are the short sides facing left and right: draw them solid and name them
      ctx.setLineDash([]);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(Math.min(x0, x1), Math.min(y0, y1));
      ctx.lineTo(Math.min(x0, x1), Math.max(y0, y1));
      ctx.moveTo(Math.max(x0, x1), Math.min(y0, y1));
      ctx.lineTo(Math.max(x0, x1), Math.max(y0, y1));
      ctx.stroke();
      ctx.fillStyle = p.accent;
      ctx.font = `12px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.direction = 'rtl';
      ctx.fillText('בסיס', Math.min(x0, x1) - 16, Math.max(y0, y1) + 6);
      ctx.fillText('בסיס', Math.max(x0, x1) + 16, Math.max(y0, y1) + 6);
      ctx.textBaseline = 'middle';
      ctx.fillText('דופן', Math.max(x0, x1) + 22, Math.min(y0, y1));
      ctx.restore();
    }

    // field arrows in the regions
    const regions: [number, number][] =
      planes.length === 1
        ? [
            [-0.5, planesFieldX(planes, -0.5)],
            [0.5, planesFieldX(planes, 0.5)],
          ]
        : [
            [-0.65, planesFieldX(planes, -0.65)],
            [0, planesFieldX(planes, 0)],
            [0.65, planesFieldX(planes, 0.65)],
          ];
    for (const [rx, e] of regions) {
      for (const ry of [0.42, 0.2]) {
        const [cx, cy] = toScreen(view, rx, ry);
        if (Math.abs(e) < 1) {
          if (ry === 0.42) {
            ctx.save();
            ctx.fillStyle = p.ink2;
            ctx.font = `600 14px ${p.fontUi}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('E = 0', cx, cy + 14);
            ctx.restore();
          }
          continue;
        }
        const len = Math.min(maxLen, Math.abs(e) * pxPerE);
        const d = Math.sign(e);
        arrow(ctx, cx - (d * len) / 2, cy, cx + (d * len) / 2, cy, { color: p.efield, width: 2.8, head: 11 });
      }
    }

    // the plates
    planes.forEach((pl) => {
      const [x, ytop] = toScreen(view, pl.x, PLATE_HALF);
      const [, ybot] = toScreen(view, pl.x, -PLATE_HALF);
      ctx.save();
      ctx.fillStyle = withAlpha(pl.sigma > 0 ? p.pos : p.neg, 0.35);
      ctx.fillRect(x - 5, ytop, 10, ybot - ytop);
      ctx.strokeStyle = pl.sigma > 0 ? p.pos : p.neg;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x - 5, ytop, 10, ybot - ytop);
      ctx.fillStyle = p.ink;
      ctx.font = `700 15px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const glyph = pl.sigma > 0 ? '+' : '−';
      for (let y = PLATE_HALF - 0.08; y > -PLATE_HALF; y -= 0.16) {
        const [, gy] = toScreen(view, pl.x, y);
        ctx.fillText(glyph, x + (pl.sigma > 0 ? -14 : 14) * (planes.length === 1 ? 1 : 1), gy);
      }
      ctx.restore();
    });

    // the probe
    const [px, py] = toScreen(view, s.probe, PROBE_Y);
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.fillStyle = p.paper;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 4, py);
    ctx.lineTo(px + 4, py);
    ctx.moveTo(px, py - 4);
    ctx.lineTo(px, py + 4);
    ctx.stroke();
    if (Math.abs(Eprobe) >= 1) {
      const len = Math.min(maxLen, Math.abs(Eprobe) * pxPerE);
      const d = Math.sign(Eprobe);
      arrow(ctx, px, py - 20, px + d * len, py - 20, { color: p.efield, width: 3, head: 11 });
    }
    ctx.restore();
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const clampX = (x: number) => Math.max(-0.95, Math.min(0.95, x));
  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const [px, py] = toScreen(v, s.probe, PROBE_Y);
    if (Math.hypot(e.offsetX - px, e.offsetY - py) < 24) {
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!dragging.current || !v) return;
    const [wx] = toWorld(v, e.offsetX, e.offsetY);
    probeMoved.current = true;
    setS((prev) => ({ ...prev, probe: clampX(wx) }));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(`נקודת המדידה ב-${Math.round(s.probe * 100)} ס"מ. ${fieldWords(Eprobe)}.`);
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const d = e.key === 'ArrowRight' ? 1 : -1;
    setS((prev) => {
      probeMoved.current = true;
      const next = { ...prev, probe: clampX(prev.probe + d * (e.shiftKey ? 0.1 : 0.02)) };
      setLive(`נקודת המדידה ב-${Math.round(next.probe * 100)} ס"מ. ${fieldWords(planesFieldX(planes, next.probe))}.`);
      return next;
    });
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${MODE_LABEL[s.mode]}, צפיפות מטען ${s.sigma} מיקרו-קולון למטר רבוע. בנקודת המדידה ${fieldWords(Eprobe)}. גררו את נקודת המדידה; במקלדת: חיצים.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onReset={() => {
        setS({ mode: props.mode ?? 'one', sigma: props.sigma ?? 2, pillbox: props.pillbox ?? false, probe: 0.45 });
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            בנקודת המדידה: <b class="q">{fieldWords(Eprobe)}</b>
          </span>
          <span>
            {planes.length === 1 ? 'משמאל ללוח' : 'משמאל ללוחות'}: <b class="q">{fieldWords(Eleft)}</b>
          </span>
          {planes.length > 1 && (
            <span>
              בין הלוחות: <b class="q">{fieldWords(Emid)}</b>
            </span>
          )}
          <span>
            {planes.length === 1 ? 'מימין ללוח' : 'מימין ללוחות'}: <b class="q">{fieldWords(Eright)}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="סידור הלוחות">
            {(Object.keys(MODE_LABEL) as PlatesMode[]).map((k) => (
              <button type="button" key={k} class={`toggle ${s.mode === k ? 'on' : ''}`} aria-pressed={s.mode === k} onClick={() => setS({ ...s, mode: k })}>
                {MODE_LABEL[k]}
              </button>
            ))}
            <Toggle label="גליל גאוס" on={s.pillbox} onChange={(v) => setS({ ...s, pillbox: v })} />
          </div>
          <Slider label="צפיפות מטען σ" value={s.sigma} min={1} max={4} step={1} format={(v) => `${v} μC/m²`} onChange={(v) => setS({ ...s, sigma: v })} />
          <Slider
            label="נקודת המדידה"
            value={Math.round(s.probe * 100) / 100}
            min={-0.95}
            max={0.95}
            step={0.1}
            format={(v) => `${Math.round(v * 100)} cm`}
            onChange={(v) => {
              probeMoved.current = true;
              setS({ ...s, probe: v });
            }}
          />
        </>
      }
    />
  );
}
