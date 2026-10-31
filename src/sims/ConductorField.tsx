/**
 * A conducting sphere, drawn as the z = 0 slice of a 3D sphere, built for lesson 1.9. Two situations:
 *   - 'external': a neutral sphere in a uniform field E₀ (surface charge σ = 3ε₀E₀cosθ, E = 0 inside);
 *   - 'charged': no applied field. A solid sphere with net charge Q, or (hollow) a neutral shell with a
 *     point charge Q at the centre of its cavity.
 * Every field and charge comes from src/physics/conductors.ts, the exact solutions.
 *
 * Field lines in 'external' mode are drawn from evenly spaced heights far to the left and right. Their
 * shape does not depend on E₀ (the field only scales), so the slider changes the probe arrow, the
 * readout and the size of the induced charges, not the lines: the lines show the shape of the field only.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { EPS0 } from '~/physics/constants';
import {
  cavityChargeField,
  chargedConductorField,
  inducedSigma,
  sphereFieldPlane,
  traceSphereLine,
  uniformSigma,
} from '~/physics/conductors';
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
const Q_STEPS = [1, 2, 3, 4];
const Q_UNIT = 1e-6;
/** px per (N/C) for the probe arrow: 5·10⁴ N/C draws 60 px */
const PX_PER_E = 60 / 5e4;
const ARROW_CAP = 150;
const PROBE_START: [number, number] = [0.7, 0.28];
/** the angle drawn as θ in the marked figure [rad] */
const THETA_MARK = (40 * Math.PI) / 180;

const TASK_LABEL: Record<string, string> = {
  'insert-conductor': 'הכניסו את המוליך לשדה (לחצו על "מוליך"). איפה נגמרים הקווים?',
  'probe-inside': 'גררו את מטען הבוחן אל תוך המוליך. מה השדה שם?',
  'raise-E0': 'כשמטען הבוחן בתוך המוליך, הגדילו את השדה החיצוני E₀. מה קורה לשדה בפנים?',
  'probe-pole': 'גררו את מטען הבוחן ממש ליד הקוטב הימני, מחוץ לכדור. השוו את E ל-E₀.',
  'probe-cavity': 'גררו את מטען הבוחן לתוך החלל, והגדילו את E₀. מה השדה בחלל?',
};

type Mode = 'external' | 'charged';

interface State {
  probe: [number, number];
  /** applied field in units of 10⁴ N/C */
  e0: number;
  /** charge in μC ('charged' mode) */
  q: number;
  mode: Mode;
  conductor: boolean;
  hollow: boolean;
  showLines: boolean;
  showCharges: boolean;
  showSigma: boolean;
  selected: boolean;
}

export interface ConductorFieldProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  mode?: Mode;
  conductor?: boolean;
  hollow?: boolean;
  showLines?: boolean;
  showCharges?: boolean;
  /** show σ in the readout (after the lesson has defined it) */
  showSigma?: boolean;
  /** mark θ, the poles and the equator on the sphere */
  markers?: boolean;
  tasks?: string[];
}

function initial(p: ConductorFieldProps): State {
  return {
    probe: PROBE_START,
    e0: 2,
    q: 2,
    mode: p.mode ?? 'external',
    conductor: p.conductor ?? true,
    hollow: p.hollow ?? false,
    showLines: p.showLines ?? true,
    showCharges: p.showCharges ?? true,
    showSigma: p.showSigma ?? false,
    selected: false,
  };
}

const hasMetal = (s: State) => s.conductor || s.mode === 'charged';

/** Classification of a point: inside the metal, inside the cavity, or in the air. */
function region(s: State, x: number, y: number): 'air' | 'metal' | 'cavity' {
  if (!hasMetal(s)) return 'air';
  const r = Math.hypot(x, y);
  if (r >= R) return 'air';
  return s.hollow && r < R_CAVITY ? 'cavity' : 'metal';
}

/** The field at a point, from the exact solutions. */
function fieldHere(s: State, x: number, y: number): [number, number] {
  if (s.mode === 'charged') {
    const Q = s.q * Q_UNIT;
    const [ex, ey] = s.hollow ? cavityChargeField(Q, R, R_CAVITY, [x, y, 0]) : chargedConductorField(Q, R, [x, y, 0]);
    return [ex, ey];
  }
  const E0 = s.e0 * E0_UNIT;
  if (!s.conductor) return [E0, 0];
  const [ex, ey] = sphereFieldPlane(E0, R, x, y);
  return [ex, ey];
}

type Line = [number, number][];

/** Field-line shapes in world metres. */
function buildLines(s: State): Line[] {
  const lines: Line[] = [];
  if (s.mode === 'charged') {
    const n = 16;
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * (k + 0.5)) / n;
      const u: [number, number] = [Math.cos(a), Math.sin(a)];
      lines.push([
        [R * u[0], R * u[1]],
        [1.4 * u[0], 1.4 * u[1]],
      ]);
    }
    return lines;
  }
  const bounds = { xmin: -1.05, xmax: 1.05, ymin: -0.8, ymax: 0.8 };
  for (let k = -7; k <= 7; k++) {
    const y = k * 0.1;
    if (!s.conductor) {
      lines.push([
        [-1.0, y],
        [1.0, y],
      ]);
      continue;
    }
    const fwd = traceSphereLine(1, R, [-1.0, y], 1, { bounds, maxStep: 0.02 });
    lines.push(fwd.points.map((p) => [p[0], p[1]] as [number, number]));
    // lines that leave the right-hand side of the sphere: trace them backward from the right edge
    const back = traceSphereLine(1, R, [1.0, y], -1, { bounds, maxStep: 0.02 });
    if (back.end === 'surface') lines.push(back.points.map((p) => [p[0], p[1]] as [number, number]).reverse());
  }
  return lines;
}

export default function ConductorField(props: ConductorFieldProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const start = useRef<State>(initial(props));
  const dragging = useRef(false);
  const linesCache = useRef<{ key: string; lines: Line[] } | null>(null);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          for (const k of ['conductor', 'hollow', 'showLines', 'showCharges', 'showSigma'] as const) {
            if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          }
          if (st.mode === 'external' || st.mode === 'charged') next.mode = st.mode;
          if (typeof st.e0 === 'number' && E0_STEPS.includes(st.e0)) next.e0 = st.e0;
          if (typeof st.q === 'number' && Q_STEPS.includes(st.q)) next.q = st.q;
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
    const external = s.mode === 'external';
    if (has('probe-inside') && external && where === 'metal' && !s.hollow) done('probe-inside');
    if (has('raise-E0') && external && where === 'metal' && s.e0 > start.current.e0) done('raise-E0');
    if (has('probe-cavity') && external && where === 'cavity') done('probe-cavity');
    const nearPole = Math.hypot(s.probe[0] - R, s.probe[1]) < 0.09 && where === 'air';
    if (has('probe-pole') && external && s.conductor && !s.hollow && nearPole) done('probe-pole');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p);

    if (s.showLines) {
      const key = `${s.mode}|${s.conductor}|${s.hollow && s.mode === 'charged'}`;
      if (!linesCache.current || linesCache.current.key !== key) {
        linesCache.current = { key, lines: buildLines(s) };
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

    if (hasMetal(s)) {
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
      ctx.restore();

      if (s.showCharges) {
        if (s.mode === 'external') drawInduced(ctx, view, p, s.e0 * E0_UNIT);
        else {
          drawRing(ctx, view, p, R, 16, 1, 6);
          if (s.hollow) drawRing(ctx, view, p, R_CAVITY, 12, -1, 5.5);
        }
      }
      if (s.mode === 'charged' && s.hollow) {
        // lines inside the cavity run from the point charge to the cavity wall; drawn after the cavity is painted
        if (s.showLines) {
          for (let k = 0; k < 16; k++) {
            const a = (2 * Math.PI * (k + 0.5)) / 16;
            const x0 = cx + 14 * Math.cos(a);
            const y0 = cy - 14 * Math.sin(a);
            const x1 = cx + R_CAVITY * view.ppm * Math.cos(a);
            const y1 = cy - R_CAVITY * view.ppm * Math.sin(a);
            polyline(ctx, [[x0, y0], [x1, y1]], p.efield, 1.6, { glow: p.efieldGlow, alpha: 0.9 });
            chevron(ctx, (x0 + x1) / 2, (y0 + y1) / 2, Math.cos(a), -Math.sin(a), 5, p.efield);
          }
        }
        chargeDisc(ctx, cx, cy, 11, 1, p, { label: '+q' });
      }
      if (props.markers && s.mode === 'external' && !s.hollow) drawMarkers(ctx, view, p);
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
    const [ex, ey] = fieldHere(st, st.probe[0], st.probe[1]);
    const E = Math.hypot(ex, ey);
    if (E === 0) return `${at} בתוך החלל. השדה אפס.`;
    return `${at} ${where === 'cavity' ? 'בתוך החלל. ' : ''}השדה ${sci(E)} ניוטון לקולון, ${directionHe(Math.atan2(ey, ex))}.`;
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
  const Q = s.q * Q_UNIT;
  const charged = s.mode === 'charged';
  const suffix = where === 'metal' ? ' (בתוך המתכת)' : E === 0 ? ' (בתוך החלל)' : ` (${directionHe(Math.atan2(ey, ex))})`;

  const situation = charged
    ? s.hollow
      ? `קליפת מתכת ניטרלית, ובמרכז החלל מטען נקודתי ${s.q} מיקרו-קולון.`
      : `כדור מתכת עם מטען עודף ${s.q} מיקרו-קולון, בלי שדה חיצוני.`
    : `כדור מתכת בשדה חשמלי אחיד ${sci(E0)} ניוטון לקולון שמצביע ימינה.`;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${situation} ${describe(s)} גררו את מטען הבוחן בעכבר או במגע; במקלדת: חיצים מזיזים.`}
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
          {charged ? (
            <span>
              {s.hollow ? 'מטען במרכז החלל' : 'מטען עודף על המוליך'}: <b class="q" dir="ltr">Q = {s.q} μC</b>
            </span>
          ) : (
            <span>
              שדה חיצוני: <b class="q">E₀ = {sci(E0)} N/C</b> (ימינה)
            </span>
          )}
          <span>
            שדה במקום <span class="q">q₀</span>: <b class="q">E = {sci(E)} N/C</b>
            {suffix}
          </span>
          {s.showSigma && !charged && s.conductor && (
            <span>
              צפיפות מטען משטחית בקוטב: <b class="q">σ = 3ε₀E₀ = {sci(3 * EPS0 * E0)} C/m²</b>
            </span>
          )}
          {s.showSigma && charged && !s.hollow && (
            <span>
              צפיפות מטען משטחית: <b class="q">σ = Q/(4πR²) = {sci(uniformSigma(Q, R))} C/m²</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מה להציג">
            {!charged && (
              <Toggle
                label="מוליך"
                on={s.conductor}
                onChange={(v) => {
                  setS({ ...s, conductor: v, hollow: v ? s.hollow : false });
                  if (v && props.tasks?.includes('insert-conductor')) markTask(`${props.id}:insert-conductor`);
                }}
              />
            )}
            {hasMetal(s) && <Toggle label="חלול" on={s.hollow} onChange={(v) => setS({ ...s, hollow: v })} />}
            <Toggle label="קווי שדה" on={s.showLines} swatch="var(--efield)" onChange={(v) => setS({ ...s, showLines: v })} />
            {hasMetal(s) && (
              <Toggle
                label={charged ? 'מטענים על המוליך' : 'מטענים מושרים'}
                on={s.showCharges}
                onChange={(v) => setS({ ...s, showCharges: v })}
              />
            )}
          </div>
          {charged ? (
            <Slider
              label="המטען Q"
              min={0}
              max={Q_STEPS.length - 1}
              step={1}
              value={Math.max(0, Q_STEPS.indexOf(s.q))}
              format={(i) => `${Q_STEPS[i]} μC`}
              onChange={(i) => setS({ ...s, q: Q_STEPS[i] })}
            />
          ) : (
            <Slider
              label="השדה החיצוני E₀"
              min={0}
              max={E0_STEPS.length - 1}
              step={1}
              value={Math.max(0, E0_STEPS.indexOf(s.e0))}
              format={(i) => `${sci(E0_STEPS[i] * E0_UNIT)} N/C`}
              onChange={(i) => setS({ ...s, e0: E0_STEPS[i] })}
            />
          )}
          <p class="hint hand">גררו את מטען הבוחן לכל מקום, גם לתוך המוליך.</p>
        </>
      }
    />
  );
}

function sign(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, positive: boolean, p: FrameInfo['palette']) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = positive ? p.pos : p.neg;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = p.ink;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.2, r * 0.22);
  ctx.lineCap = 'round';
  const g = r * 0.55;
  ctx.beginPath();
  ctx.moveTo(x - g, y);
  ctx.lineTo(x + g, y);
  if (positive) {
    ctx.moveTo(x, y - g);
    ctx.lineTo(x, y + g);
  }
  ctx.stroke();
  ctx.restore();
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
      sign(ctx, x, y, rMark, sigma > 0, p);
    }
  }
}

/** n equal signs on a circle of radius r [m]: uniform charge on a surface. */
function drawRing(ctx: CanvasRenderingContext2D, v: View, p: FrameInfo['palette'], r: number, n: number, sgn: 1 | -1, size: number) {
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    const [x, y] = toScreen(v, r * Math.cos(a), r * Math.sin(a));
    sign(ctx, x, y, size, sgn > 0, p);
  }
}

/** θ, the two poles on the field axis and the equator, labelled inside the sphere. */
function drawMarkers(ctx: CanvasRenderingContext2D, v: View, p: FrameInfo['palette']) {
  const [cx, cy] = toScreen(v, 0, 0);
  const rPx = R * v.ppm;
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.fillStyle = p.ink;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(cx - rPx, cy);
  ctx.lineTo(cx + rPx, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + rPx * Math.cos(THETA_MARK), cy - rPx * Math.sin(THETA_MARK));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rPx * 0.4, -THETA_MARK, 0);
  ctx.stroke();
  ctx.font = `italic 600 14px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('θ', cx + rPx * 0.55 * Math.cos(THETA_MARK / 2), cy - rPx * 0.55 * Math.sin(THETA_MARK / 2) - 2);
  ctx.font = `600 12px ${p.fontUi}`;
  ctx.direction = 'rtl';
  ctx.fillText('קוטב', cx + rPx * 0.72, cy + 12);
  ctx.fillText('קוטב', cx - rPx * 0.72, cy + 12);
  ctx.fillText('משווה', cx, cy - rPx + 20);
  ctx.restore();
}
