/**
 * A conducting sphere in a uniform field E₀ (the z = 0 slice of a 3D sphere), built for lesson 1.9.
 * The field, the induced surface charge and the field lines all come from src/physics/conductors.ts,
 * the exact solution: E = 0 inside, the field meets the surface at right angles, σ = 3ε₀E₀cosθ.
 *
 * Field lines are drawn from evenly spaced starting heights far to the left and right. Their shape
 * does not depend on E₀ (the field only scales), so the slider changes the probe arrow, the readout
 * and the size of the induced charges, not the lines.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { EPS0 } from '~/physics/constants';
import { inducedSigma, sphereFieldPlane, traceSphereLine } from '~/physics/conductors';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { arrow, chargeDisc, chevron, paperGrid, polyline, scaleBar, withAlpha } from './core/ink';
import { directionHe, sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 2;
const WORLD_H = 1.5;
/** radius of the conductor [m] */
const R = 0.35;
/** radius of the cavity when the conductor is a hollow shell [m] */
const R_CAVITY = 0.2;
const PROBE_PX = 9;
const E0_STEPS = [1, 2, 3, 4];
const E0_UNIT = 1e4;
/** px per (N/C) for the probe arrow: 5·10⁴ N/C draws 60 px */
const PX_PER_E = 60 / 5e4;
const ARROW_CAP = 150;
const PROBE_START: [number, number] = [0.75, 0.42];

const TASK_LABEL: Record<string, string> = {
  'insert-conductor': 'הכניסו את המוליך לשדה. מה קרה לקווים שנכנסים אליו?',
  'probe-inside': 'גררו את מטען הבוחן אל תוך המוליך. מה השדה שם?',
  'raise-E0': 'כשמטען הבוחן בתוך המוליך, הגדילו את השדה החיצוני E₀. מה קורה לשדה בפנים?',
  'probe-cavity': 'הפכו את המוליך לחלול, וגררו את מטען הבוחן לתוך החלל. מה השדה בחלל?',
};

interface State {
  probe: [number, number];
  /** applied field in units of 10⁴ N/C */
  e0: number;
  conductor: boolean;
  hollow: boolean;
  showLines: boolean;
  showCharges: boolean;
  selected: boolean;
}

export interface ConductorFieldProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  conductor?: boolean;
  hollow?: boolean;
  showLines?: boolean;
  showCharges?: boolean;
  tasks?: string[];
}

function initial(p: ConductorFieldProps): State {
  return {
    probe: PROBE_START,
    e0: 2,
    conductor: p.conductor ?? true,
    hollow: p.hollow ?? false,
    showLines: p.showLines ?? true,
    showCharges: p.showCharges ?? true,
    selected: false,
  };
}

/** Classification of a point: inside the metal, inside the cavity, or in the air. */
function region(s: State, x: number, y: number): 'air' | 'metal' | 'cavity' {
  if (!s.conductor) return 'air';
  const r = Math.hypot(x, y);
  if (r >= R) return 'air';
  return s.hollow && r < R_CAVITY ? 'cavity' : 'metal';
}

/** The field at a point, E = 0 anywhere inside the conductor, or the uniform E₀ without it. */
function fieldHere(s: State, x: number, y: number): [number, number] {
  const E0 = s.e0 * E0_UNIT;
  if (!s.conductor) return [E0, 0];
  const [ex, ey] = sphereFieldPlane(E0, R, x, y);
  return [ex, ey];
}

/** Field-line shapes in world metres, for the sphere or the empty uniform field. */
function buildLines(conductor: boolean): [number, number][][] {
  const lines: [number, number][][] = [];
  const bounds = { xmin: -1.05, xmax: 1.05, ymin: -0.8, ymax: 0.8 };
  for (let k = -7; k <= 7; k++) {
    const y = k * 0.1;
    if (!conductor) {
      lines.push([
        [-1.0, y],
        [1.0, y],
      ]);
      continue;
    }
    const fwd = traceSphereLine(1, R, [-1.0, y], 1, { bounds, maxStep: 0.02 });
    lines.push(fwd.points.map((p) => [p[0], p[1]] as [number, number]));
    // the lines that leave the right-hand side of the sphere: trace them backward from the right edge
    const back = traceSphereLine(1, R, [1.0, y], -1, { bounds, maxStep: 0.02 });
    if (back.end === 'surface') lines.push(back.points.map((p) => [p[0], p[1]] as [number, number]).reverse());
  }
  return lines;
}

export default function ConductorField(props: ConductorFieldProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const start = useRef<State>(initial(props));
  const dragging = useRef(false);
  const linesCache = useRef<{ conductor: boolean; lines: [number, number][][] } | null>(null);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          for (const k of ['conductor', 'hollow', 'showLines', 'showCharges'] as const) {
            if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          }
          if (typeof st.e0 === 'number' && E0_STEPS.includes(st.e0)) next.e0 = st.e0;
          return next;
        });
      }),
    [props.id],
  );

  // task detection: only what the learner does counts, never what a text step sets
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const where = region(s, s.probe[0], s.probe[1]);
    if (has('probe-inside') && where === 'metal' && !s.hollow) done('probe-inside');
    if (has('raise-E0') && where === 'metal' && s.e0 > start.current.e0) done('raise-E0');
    if (has('probe-cavity') && where === 'cavity') done('probe-cavity');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p);

    if (s.showLines) {
      if (!linesCache.current || linesCache.current.conductor !== s.conductor) {
        linesCache.current = { conductor: s.conductor, lines: buildLines(s.conductor) };
      }
      for (const line of linesCache.current.lines) {
        const pts = line.map(([x, y]) => toScreen(view, x, y));
        polyline(ctx, pts, p.efield, 1.6, { glow: p.efieldGlow, alpha: 0.9 });
        let acc = 0;
        let next = 40;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i][0] - pts[i - 1][0];
          const dy = pts[i][1] - pts[i - 1][1];
          const seg = Math.hypot(dx, dy);
          while (seg > 0 && acc + seg >= next) {
            const f = (next - acc) / seg;
            chevron(ctx, pts[i - 1][0] + dx * f, pts[i - 1][1] + dy * f, dx / seg, dy / seg, 5, p.efield);
            next += 90;
          }
          acc += seg;
        }
      }
    }

    if (s.conductor) {
      const [cx, cy] = toScreen(view, 0, 0);
      const rPx = R * view.ppm;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(p.ink3, 0.28);
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = p.ink;
      ctx.stroke();
      if (s.hollow) {
        ctx.beginPath();
        ctx.arc(cx, cy, R_CAVITY * view.ppm, 0, Math.PI * 2);
        ctx.fillStyle = p.paper;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.font = `700 15px ${p.fontUi}`;
      ctx.fillStyle = p.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'ltr';
      ctx.fillText('E = 0', cx, cy);
      ctx.restore();

      if (s.showCharges) drawInduced(ctx, view, p, s.e0 * E0_UNIT);
    }

    // probe: a small test charge with the field arrow at its position
    const [px, py] = toScreen(view, s.probe[0], s.probe[1]);
    const [ex, ey] = fieldHere(s, s.probe[0], s.probe[1]);
    const E = Math.hypot(ex, ey);
    if (E > 0) {
      const len = Math.min(ARROW_CAP, E * PX_PER_E);
      arrow(ctx, px, py, px + (ex / E) * len, py - (ey / E) * len, { color: p.efield, width: 7, head: 16, alpha: 0.55 });
    }
    chargeDisc(ctx, px, py, PROBE_PX, 1, p, { selected: s.selected });
    ctx.save();
    ctx.font = `italic 600 13px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('q₀', px, py + 22);
    ctx.restore();

    scaleBar(ctx, view, p);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    animate: false,
  });
  useEffect(invalidate, [s]);

  const clampWorld = (x: number, y: number): [number, number] => [
    Math.max(-WORLD_W / 2 + 0.05, Math.min(WORLD_W / 2 - 0.05, x)),
    Math.max(-WORLD_H / 2 + 0.05, Math.min(WORLD_H / 2 - 0.05, y)),
  ];

  const describe = (st: State) => {
    const where = region(st, st.probe[0], st.probe[1]);
    const at = `מטען הבוחן ב-(${Math.round(st.probe[0] * 100)}, ${Math.round(st.probe[1] * 100)}) ס"מ.`;
    if (where === 'metal') return `${at} בתוך המתכת. השדה אפס.`;
    if (where === 'cavity') return `${at} בתוך החלל. השדה אפס.`;
    const [ex, ey] = fieldHere(st, st.probe[0], st.probe[1]);
    return `${at} השדה ${sci(Math.hypot(ex, ey))} ניוטון לקולון, ${directionHe(Math.atan2(ey, ex))}.`;
  };

  const hitProbe = (v: View, sx: number, sy: number) => {
    const [px, py] = toScreen(v, s.probe[0], s.probe[1]);
    return Math.hypot(sx - px, sy - py) < PROBE_PX + 12;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hitProbe(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (!h) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v || !dragging.current) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, probe: clampWorld(wx, wy) }));
  };

  const onPointerUp = () => {
    if (dragging.current) setLive(describe(s));
    dragging.current = false;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.1 : 0.02;
    setS((prev) => {
      const next = { ...prev, selected: true, probe: clampWorld(prev.probe[0] + d[0] * step, prev.probe[1] + d[1] * step) };
      setLive(describe(next));
      return next;
    });
  };

  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const where = region(s, s.probe[0], s.probe[1]);
  const [ex, ey] = fieldHere(s, s.probe[0], s.probe[1]);
  const E = Math.hypot(ex, ey);
  const E0 = s.e0 * E0_UNIT;
  const sigmaMax = 3 * EPS0 * E0;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: כדור מוליך בשדה חשמלי אחיד ${sci(E0)} ניוטון לקולון שמצביע ימינה. ${describe(s)} גררו את מטען הבוחן בעכבר או במגע; במקלדת: חיצים מזיזים.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={dragging.current ? 'grabbing' : 'grab'}
      readout={
        <>
          <span>
            שדה חיצוני: <b class="q">E₀ = {sci(E0)} N/C</b> (ימינה)
          </span>
          <span>
            שדה במקום <span class="q">q₀</span>:{' '}
            <b class="q">E = {where === 'air' ? sci(E) : '0'} N/C</b>
            {where === 'air' ? ` (${directionHe(Math.atan2(ey, ex))})` : where === 'metal' ? ' (בתוך המתכת)' : ' (בתוך החלל)'}
          </span>
          {s.conductor && (
            <span>
              מטען מושרה בקוטב: <b class="q">σ = 3ε₀E₀ = {sci(sigmaMax)} C/m²</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle
              label="מוליך"
              on={s.conductor}
              onChange={(v) => {
                setS({ ...s, conductor: v, hollow: v ? s.hollow : false });
                if (v && props.tasks?.includes('insert-conductor')) markTask(`${props.id}:insert-conductor`);
              }}
            />
            {s.conductor && <Toggle label="חלול" on={s.hollow} onChange={(v) => setS({ ...s, hollow: v })} />}
            <Toggle label="קווי שדה" on={s.showLines} swatch="var(--efield)" onChange={(v) => setS({ ...s, showLines: v })} />
            {s.conductor && <Toggle label="מטענים מושרים" on={s.showCharges} onChange={(v) => setS({ ...s, showCharges: v })} />}
          </div>
          <Slider
            label="השדה החיצוני E₀"
            min={0}
            max={E0_STEPS.length - 1}
            step={1}
            value={E0_STEPS.indexOf(s.e0)}
            format={(i) => `${sci(E0_STEPS[i] * E0_UNIT)} N/C`}
            onChange={(i) => setS({ ...s, e0: E0_STEPS[i] })}
          />
          <p class="hint hand">גררו את מטען הבוחן לכל מקום, גם לתוך המוליך.</p>
        </>
      }
    />
  );
}

/** Induced surface charges on the outer surface: + on the side the field leaves, − where it enters. Area ∝ |σ|. */
function drawInduced(ctx: CanvasRenderingContext2D, v: View, p: FrameInfo['palette'], E0: number) {
  const full = Math.abs(inducedSigma(4 * E0_UNIT, 0));
  for (const z of [-1, -0.8, -0.6, -0.4, -0.2, 0.2, 0.4, 0.6, 0.8, 1]) {
    const theta = Math.acos(z);
    const sigma = inducedSigma(E0, theta);
    const rMark = Math.max(3, 9 * Math.sqrt(Math.abs(sigma) / full));
    for (const side of Math.abs(z) === 1 ? [1] : [1, -1]) {
      const [x, y] = toScreen(v, R * Math.cos(theta), side * R * Math.sin(theta));
      const color = sigma > 0 ? p.pos : p.neg;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, rMark, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = p.ink;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2, rMark * 0.22);
      ctx.lineCap = 'round';
      const g = rMark * 0.55;
      ctx.beginPath();
      ctx.moveTo(x - g, y);
      ctx.lineTo(x + g, y);
      if (sigma > 0) {
        ctx.moveTo(x, y - g);
        ctx.lineTo(x, y + g);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}
