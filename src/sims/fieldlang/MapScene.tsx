/**
 * Figure 6.3א: one point charge seen two ways. As a scalar field, a number (V, in volts) at every
 * point of a grid, like the temperatures on a weather map; as a vector field, an arrow (E) at every
 * point. A probe P and a second point P′ a step Δ away along x (or y) give the difference quotient
 * ΔV/Δx; the strip under the map is V along the dashed line through P (the other coordinate held
 * fixed), with the chord through P and P′ and the tangent at P, so shrinking Δ turns the chord into
 * the tangent and ΔV/Δx into ∂V/∂x. All numbers come from coordinates.ts and electrostatics.ts.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { differenceQuotient, partial } from '~/physics/coordinates';
import { fieldAt, potentialAt, type PointCharge } from '~/physics/electrostatics';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type View } from '../core/canvas';
import { arrow, chargeDisc, withAlpha } from '../core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from '../core/SimShell';
import { useTouched } from './touch';
import { dashed, dot, handle, label, num, vecText } from './draw';

const Q = 1e-9;
const CHARGES: PointCharge[] = [{ x: 0, y: 0, q: Q }];
const V = (x: number, y: number) => potentialAt(CHARGES, x, y);

/** the map is 1.2 m × 0.72 m; the strip under it takes 0.38 m of the height */
const MAP_W = 1.2;
const MAP_H = 0.72;
const STRIP_H = 0.4;
const WORLD_H = MAP_H + STRIP_H;
const X_LIM = 0.56;
const Y_LIM = 0.32;
/** the probe stays this far from the charge [m] */
const CORE = 0.06;
const H_STEPS = [0.2, 0.1, 0.05, 0.02, 0.01, 0.005];
const GRID = [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45];
const GRID_Y = [-0.3, -0.15, 0, 0.15, 0.3];

export type Axis = 'x' | 'y';

const TASK_LABEL: Record<string, string> = {
  'zero-x': 'מצאו נקודה P, לא ליד המטען, שבה הנגזרת החלקית לפי x היא אפס. האם השדה שם אפס?',
  shrink: 'הקטינו את הצעד עד הסוף, והשוו את מנת ההפרשים לנגזרת החלקית. מה קרה למיתר בגרף?',
  'zero-y': 'עברו לנגזרת לפי y, ומצאו נקודה שבה היא אפס.',
};

interface State {
  p: [number, number];
  axis: Axis;
  hIndex: number;
  showNumbers: boolean;
  showArrows: boolean;
  selected: boolean;
}

export interface MapSceneProps {
  id: string;
  tasks?: string[];
  probe?: [number, number];
  axis?: Axis;
  showNumbers?: boolean;
  showArrows?: boolean;
}

function initial(p: MapSceneProps): State {
  return {
    p: p.probe ?? [0.15, 0.22],
    axis: p.axis ?? 'x',
    hIndex: 2,
    showNumbers: p.showNumbers ?? true,
    showArrows: p.showArrows ?? false,
    selected: false,
  };
}

const cm = (m: number) => `${num(m * 100)} cm`;

/** Screen layout: the map on top, the strip below, both centred. */
function layout(v: View) {
  const ppm = v.ppm;
  const top = (v.h - WORLD_H * ppm) / 2;
  const cx = v.w / 2;
  const cy = top + (MAP_H / 2) * ppm;
  const strip = {
    l: cx - (MAP_W / 2) * ppm + 40,
    r: cx + (MAP_W / 2) * ppm - 14,
    t: top + (MAP_H + 0.07) * ppm,
    b: top + WORLD_H * ppm - 22,
  };
  const toMap = (x: number, y: number): [number, number] => [cx + x * ppm, cy - y * ppm];
  const fromMap = (sx: number, sy: number): [number, number] => [(sx - cx) / ppm, (cy - sy) / ppm];
  return { ppm, top, cx, cy, strip, toMap, fromMap };
}

export default function MapScene(props: MapSceneProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const drag = useRef(false);
  const [live, setLive] = useState('');
  const { touched, handlers } = useTouched();
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({
    id,
    label: TASK_LABEL[id] ?? id,
  }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        touched.current = false;
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.showNumbers === 'boolean') next.showNumbers = st.showNumbers;
          if (typeof st.showArrows === 'boolean') next.showArrows = st.showArrows;
          if (st.axis === 'x' || st.axis === 'y') next.axis = st.axis;
          if (Array.isArray(st.probe) && st.probe.length === 2) next.p = [Number(st.probe[0]), Number(st.probe[1])];
          return next;
        });
      }),
    [props.id],
  );

  const h = H_STEPS[s.hIndex];
  const [px, py] = s.p;
  const vP = V(px, py);
  const E = fieldAt(CHARGES, px, py);
  const Emag = Math.hypot(E[0], E[1]);
  const dq = differenceQuotient(V, px, py, s.axis, h);
  const d = partial(V, px, py, s.axis);
  const ax = s.axis;

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    if (!touched.current) return;
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const r = Math.hypot(px, py);
    if (has('zero-x') && ax === 'x' && r >= 0.08 && Math.abs(d) < 0.03 * Emag) done('zero-x');
    if (has('zero-y') && ax === 'y' && r >= 0.08 && Math.abs(d) < 0.03 * Emag) done('zero-y');
    if (has('shrink') && s.hIndex === H_STEPS.length - 1) done('shrink');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const L = layout(view);
    const { toMap, ppm } = L;
    const [x0, y0] = toMap(-MAP_W / 2, MAP_H / 2);
    const mapW = MAP_W * ppm;
    const mapH = MAP_H * ppm;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, mapW, mapH);
    ctx.clip();

    // scalar field: soft shading by V, then the numbers
    if (s.showNumbers) {
      const c = 0.03;
      for (let x = -MAP_W / 2; x < MAP_W / 2; x += c) {
        for (let y = -MAP_H / 2; y < MAP_H / 2; y += c) {
          const v = V(x + c / 2, y + c / 2);
          const a = Math.min(1, v / 150) ** 0.8 * 0.32;
          const [sx, sy] = toMap(x, y + c);
          ctx.fillStyle = withAlpha(p.efield, a);
          ctx.fillRect(sx, sy, c * ppm + 0.6, c * ppm + 0.6);
        }
      }
    }
    // the dashed line through P along the derivative's axis: the slice drawn in the strip
    const [spx, spy] = toMap(px, py);
    if (ax === 'x') dashed(ctx, x0, spy, x0 + mapW, spy, withAlpha(p.accent, 0.8), 1.4);
    else dashed(ctx, spx, y0, spx, y0 + mapH, withAlpha(p.accent, 0.8), 1.4);

    for (const gx of GRID) {
      for (const gy of GRID_Y) {
        if (gx === 0 && gy === 0) continue;
        const [sx, sy] = toMap(gx, gy);
        if (s.showArrows) {
          const [ex, ey] = fieldAt(CHARGES, gx, gy);
          const m = Math.hypot(ex, ey);
          const len = (0.03 + 0.08 * Math.min(1, Math.sqrt(m / 400))) * ppm;
          arrow(ctx, sx, sy, sx + (ex / m) * len, sy - (ey / m) * len, {
            color: p.efield,
            width: 2,
            head: 8,
          });
        }
        if (s.showNumbers) {
          ctx.save();
          ctx.font = `600 ${ppm > 400 ? 13 : 11}px ${p.fontUi}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = s.showArrows ? 'bottom' : 'middle';
          ctx.fillStyle = p.ink2;
          ctx.fillText(String(Math.round(V(gx, gy))), sx, s.showArrows ? sy - 3 : sy);
          ctx.restore();
          if (s.showArrows) dot(ctx, sx, sy, p.ink3, 1.6);
        }
      }
    }

    const [cx, cy] = toMap(0, 0);
    chargeDisc(ctx, cx, cy, 11, Q, p, { label: '+1 nC' });

    // P and P′
    const [qx, qy] = ax === 'x' ? toMap(px + h, py) : toMap(px, py + h);
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(spx, spy);
    ctx.lineTo(qx, qy);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.fillStyle = p.paper;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(qx, qy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (Math.hypot(qx - spx, qy - spy) > 22) label(ctx, 'P′', qx + (ax === 'x' ? 0 : 14), qy + (ax === 'x' ? -14 : 0), p.accent, p, 13);
    dot(ctx, spx, spy, p.accent, 4.5);
    handle(ctx, spx, spy, p.accent, s.selected, p, 10);
    label(ctx, 'P', spx - 14, spy - 14, p.accent, p);
    ctx.restore();

    // frame of the map
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, mapW, mapH);
    ctx.restore();

    strip(ctx, L, p);
  };

  /** The slice V(u) along the dashed line, with the chord P–P′ and the tangent at P. */
  const strip = (ctx: CanvasRenderingContext2D, L: ReturnType<typeof layout>, p: FrameInfo['palette']) => {
    const { l, r, t, b } = L.strip;
    const u0 = ax === 'x' ? -MAP_W / 2 : -MAP_H / 2;
    const u1 = -u0;
    const uP = ax === 'x' ? px : py;
    const fixed = ax === 'x' ? py : px;
    const slice = (u: number) => (ax === 'x' ? V(u, fixed) : V(fixed, u));
    // the scale fits the slice's peak (capped near the charge, where the slice shoots up), with headroom for the caption
    let peak = 0;
    for (let i = 0; i <= 60; i++) {
      const u = u0 + ((u1 - u0) * i) / 60;
      if (Math.hypot(ax === 'x' ? u : fixed, ax === 'x' ? fixed : u) >= 0.03) peak = Math.max(peak, slice(u));
    }
    const vTop = Math.max(60, Math.ceil((1.6 * Math.min(peak, 3 * Math.max(vP, slice(uP + h)))) / 20) * 20);
    const X = (u: number) => l + ((u - u0) / (u1 - u0)) * (r - l);
    const Y = (v: number) => b - (v / vTop) * (b - t);
    ctx.save();
    // axes
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(l, t - 4);
    ctx.lineTo(l, b);
    ctx.lineTo(r, b);
    ctx.stroke();
    ctx.font = `12px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${vTop} V`, l - 4, t);
    ctx.fillText('0', l - 4, b);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const u of ax === 'x' ? [-0.5, 0, 0.5] : [-0.3, 0, 0.3]) {
      ctx.fillText(u === 0 ? '0' : `${num(u)} m`, X(u), b + 3);
    }
    ctx.font = `italic 600 13px ${p.fontUi}`;
    ctx.textAlign = 'left';
    ctx.fillText(ax, r - 10, b - 18);
    // the slice
    ctx.beginPath();
    ctx.rect(l, t - 2, r - l, b - t + 2);
    ctx.clip();
    ctx.strokeStyle = p.efield;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let pen = false;
    const N = 300;
    for (let i = 0; i <= N; i++) {
      const u = u0 + ((u1 - u0) * i) / N;
      if (Math.hypot(ax === 'x' ? u : fixed, ax === 'x' ? fixed : u) < 0.012) {
        pen = false;
        continue;
      }
      const sx = X(u);
      const sy = Math.max(t - 10, Y(slice(u)));
      if (pen) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
      pen = true;
    }
    ctx.stroke();
    // tangent at P (slope ∂V/∂u) and chord P–P′ (slope ΔV/Δu), each drawn across ±0.22 m
    const w = 0.22;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(X(uP - w), Y(vP - d * w));
    ctx.lineTo(X(uP + w), Y(vP + d * w));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(uP - w), Y(vP - dq * w));
    ctx.lineTo(X(uP + h + w), Y(vP + dq * (h + w)));
    ctx.stroke();
    dot(ctx, X(uP), Y(vP), p.accent, 4);
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(uP + h), Y(slice(uP + h)), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // caption of the strip, in the page's language
    ctx.save();
    ctx.font = `12px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`V לאורך הקו המקווקו (${ax === 'x' ? 'y' : 'x'} קבוע)`, r, t - 2);
    ctx.restore();
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: MAP_W,
    worldHeight: WORLD_H,
    animate: false,
  });
  useEffect(invalidate, [s]);

  const clampProbe = (x: number, y: number): [number, number] => {
    let nx = Math.round(Math.max(-X_LIM, Math.min(X_LIM, x)) * 100) / 100;
    let ny = Math.round(Math.max(-Y_LIM, Math.min(Y_LIM, y)) * 100) / 100;
    const r = Math.hypot(nx, ny);
    if (r < CORE) {
      // push out along the same direction, then snap outward to the centimetre grid
      const ux = r === 0 ? 1 : nx / r;
      const uy = r === 0 ? 0 : ny / r;
      nx = Math.round(ux * CORE * 100 + Math.sign(ux) * 0.49) / 100;
      ny = Math.round(uy * CORE * 100 + Math.sign(uy) * 0.49) / 100;
    }
    return [nx, ny];
  };

  const describe = (st: State) => {
    const vq = V(st.p[0], st.p[1]);
    const dd = partial(V, st.p[0], st.p[1], st.axis);
    return `P בנקודה ${vecText(st.p)} מטר. הפוטנציאל שם ${num(vq)} וולט, והנגזרת החלקית לפי ${st.axis} היא ${num(dd)} וולט למטר.`;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const [sx, sy] = layout(v).toMap(px, py);
    const hit = Math.hypot(e.offsetX - sx, e.offsetY - sy) < 24;
    setS((prev) => ({ ...prev, selected: hit }));
    if (!hit) return;
    drag.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v || !drag.current) return;
    const [x, y] = layout(v).fromMap(e.offsetX, e.offsetY);
    const np = clampProbe(x, y);
    if (np[0] !== px || np[1] !== py) setS((prev) => ({ ...prev, p: np }));
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const dd = dirs[e.key];
    if (!dd) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.05 : 0.01;
    setS((prev) => {
      const next = {
        ...prev,
        selected: true,
        p: clampProbe(prev.p[0] + dd[0] * step, prev.p[1] + dd[1] * step),
      };
      setLive(describe(next));
      return next;
    });
  };
  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const D = ax === 'x' ? 'Δx' : 'Δy';
  return (
    <div {...handlers}>
      <SimShell
        fig={props.id}
        label={`איור חי: מטען נקודתי של ננו-קולון אחד. השדה הסקלרי מוצג כמספרים (פוטנציאל בוולט) ברשת נקודות, והשדה הווקטורי כחצים. ${describe(s)} גררו את P, או הזיזו אותו בחיצים.`}
        canvasRef={canvasRef}
        aspect={MAP_W / WORLD_H}
        live={live}
        tasks={tasks}
        onReset={reset}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        cursor={drag.current ? 'grabbing' : 'grab'}
        readout={
          <>
            <span class="q">P = {vecText(s.p)} m</span>
            <b class="q">V(P) = {num(vP)} V</b>
            <span class="q">E = {vecText(E)} N/C</span>
            <span class="q">
              {D} = {cm(h)}
            </span>
            <span class="q">
              ΔV/{D} = {num(dq)} V/m
            </span>
            <b class="q">
              ∂V/∂{ax} = {num(d)} V/m
            </b>
            <span class="q">
              −∂V/∂{ax} = {num(-d)} V/m
            </span>
          </>
        }
        controls={
          <>
            <div class="group" role="group" aria-label="איך מציגים את השדה">
              <Toggle label="מספרים: V" on={s.showNumbers} swatch="var(--efield)" onChange={(v) => setS({ ...s, showNumbers: v })} />
              <Toggle label="חצים: E" on={s.showArrows} swatch="var(--efield)" onChange={(v) => setS({ ...s, showArrows: v })} />
            </div>
            <div class="group" role="group" aria-label="לפי איזה משתנה גוזרים">
              {(['x', 'y'] as const).map((k) => (
                <button
                  type="button"
                  key={k}
                  class={`toggle ${ax === k ? 'on' : ''}`}
                  aria-pressed={ax === k}
                  onClick={() => setS({ ...s, axis: k })}
                >
                  <bdi dir="ltr">∂/∂{k}</bdi>
                </button>
              ))}
            </div>
            <Slider
              label={`הצעד ${D}`}
              min={0}
              max={H_STEPS.length - 1}
              step={1}
              value={s.hIndex}
              format={(i) => cm(H_STEPS[i])}
              onChange={(i) => setS({ ...s, hIndex: i })}
            />
            <p class="hint hand">גררו את P. בגרף שמתחת למפה: המיתר (רציף) והמשיק (מקווקו).</p>
          </>
        }
      />
    </div>
  );
}
