/**
 * Gauss radial: a charged ball or an infinite charged cylinder whose density depends only on the
 * distance r from the centre (or axis), ρ ∝ (r/R)ⁿ, a coaxial Gaussian surface the learner resizes,
 * and the graph of E against r. Built for lesson 6.5.
 *
 * Every profile carries the same total charge (Q for the ball, λ per metre for the cylinder), so
 * outside the body the three curves coincide and inside they differ. Left: a cross-section of the ball,
 * or a side view of the cylinder with its Gaussian cylinder, where the area vectors on the caps lie
 * across the field (E·dA = 0) and on the side along it. Right: E(r) for the chosen profile (thick) and
 * the other two (thin, dashed).
 *
 * Every number comes from src/physics/surfaceflux.ts (powerBallField, powerBallEnclosed,
 * powerCylinderField, powerCylinderEnclosed, gaussCylinderPieces): Gauss's law with the symmetry.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { EPS0 } from '~/physics/constants';
import {
  gaussCylinderPieces,
  powerBallDensity,
  powerBallEnclosed,
  powerBallField,
  powerCylinderDensity,
  powerCylinderEnclosed,
  powerCylinderField,
} from '~/physics/surfaceflux';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

/** body radius [m] */
const R = 0.2;
const R_MAX = 0.5;
const R_MIN = 0.02;
/** ball: total charge [C]; cylinder: charge per metre [C/m]; Gaussian cylinder length [m] */
const Q_BALL = 2e-7;
const LAMBDA = 4e-7;
const L_GAUSS = 0.3;

export type Scene = 'ball' | 'cylinder';
export type Profile = 0 | 1 | -1;
const PROFILES: Profile[] = [0, 1, -1];
const PROFILE_LABEL: Record<string, string> = { '0': 'אחידה', '1': 'ρ ∝ r', '-1': 'ρ ∝ 1/r' };
const SCENE_LABEL: Record<Scene, string> = { ball: 'כדור', cylinder: 'גליל אינסופי' };

const TASK_LABEL: Record<string, string> = {
  'cyl-inside': 'בגליל: הקטינו את גליל גאוס עד שהוא בתוך הגליל הטעון. איך השדה תלוי ב-r שם?',
  'ball-peak': 'בכדור עם ρ ∝ r: מצאו את המרחק מהמרכז שבו השדה הכי חזק.',
  'same-outside': 'הגדילו את משטח גאוס אל מחוץ לגוף, והחליפו את פרופיל הצפיפות. מה קורה לשדה שם?',
};

export interface GaussRadialProps {
  id: string;
  scene?: Scene;
  profile?: Profile;
  /** Gaussian surface radius [m] */
  r?: number;
  tasks?: string[];
}

interface State {
  scene: Scene;
  profile: Profile;
  r: number;
}

const fieldOf = (scene: Scene, n: number, r: number) => (scene === 'ball' ? powerBallField(Q_BALL, R, n, r) : powerCylinderField(LAMBDA, R, n, r));
const densityOf = (scene: Scene, n: number, r: number) => (scene === 'ball' ? powerBallDensity(Q_BALL, R, n, r) : powerCylinderDensity(LAMBDA, R, n, r));
const clampR = (r: number) => Math.round(Math.max(R_MIN, Math.min(R_MAX, r)) * 100) / 100;
const isProfile = (v: unknown): v is Profile => v === 0 || v === 1 || v === -1;

export default function GaussRadial(props: GaussRadialProps) {
  const init = (): State => ({ scene: props.scene ?? 'ball', profile: props.profile ?? 0, r: clampR(props.r ?? 0.3) });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const dragging = useRef(false);
  // the state a text step produced: it must not tick a task, only the student's own controls do. A boolean flag is not
  // enough: on late hydration the step arrives synchronously during mount, and the mount render's effect consumed it.
  const stepState = useRef<State | null>(null);
  const prev = useRef<State | null>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((p) => {
          const next: State = {
            scene: st.scene === 'ball' || st.scene === 'cylinder' ? st.scene : p.scene,
            profile: isProfile(st.profile) ? st.profile : p.profile,
            r: typeof st.r === 'number' ? clampR(st.r) : p.r,
          };
          stepState.current = next;
          return next;
        });
      }),
    [props.id],
  );

  const E = fieldOf(s.scene, s.profile, s.r);
  const qIn = s.scene === 'ball' ? powerBallEnclosed(Q_BALL, R, s.profile, s.r) : powerCylinderEnclosed(LAMBDA, R, s.profile, s.r) * L_GAUSS;
  const pieces = gaussCylinderPieces(LAMBDA, R, s.profile, s.r, L_GAUSS);

  useEffect(() => {
    const before = prev.current;
    prev.current = s;
    // neither the props' starting state nor a step's state is the student's doing
    if (!before || s === stepState.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (has('cyl-inside') && s.scene === 'cylinder' && s.r <= R - 0.03) done('cyl-inside');
    if (has('ball-peak') && s.scene === 'ball' && s.profile === 1 && Math.abs(s.r - R) <= 0.011) done('ball-peak');
    if (has('same-outside') && before && before.scene === s.scene && before.profile !== s.profile && s.r >= R + 0.03) done('same-outside');
  }, [s, props.id, props.tasks]);

  const layout = (w: number, h: number) => {
    const gw = w * 0.5;
    return { cx: w * 0.25, cy: h * 0.5, rmax: Math.min(w * 0.23, h * 0.44), graph: insetBox({ x: gw, y: 0, w: w - gw, h }, { l: 52, r: 12, t: 14, b: 44 }) };
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { w, h } = view;
    const { cx, cy, rmax, graph } = layout(w, h);
    const k = rmax / R_MAX;
    // the density, sampled on rings / stripes: shading and + glyphs, so the sign is never colour alone
    const rings = 10;
    const dens = Array.from({ length: rings }, (_, i) => densityOf(s.scene, s.profile, ((i + 0.5) * R) / rings));
    const dmax = Math.max(...dens);
    ctx.save();
    if (s.scene === 'ball') {
      for (let i = rings - 1; i >= 0; i--) {
        ctx.fillStyle = withAlpha(p.pos, 0.07 + 0.38 * (dens[i] / dmax));
        ctx.beginPath();
        ctx.arc(cx, cy, ((i + 1) * R * k) / rings, 0, Math.PI * 2);
        ctx.arc(cx, cy, (i * R * k) / rings, 0, Math.PI * 2, true);
        ctx.fill();
      }
      ctx.strokeStyle = p.pos;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, R * k, 0, Math.PI * 2);
      ctx.stroke();
      // glyphs: how many per ring follows the charge in it (ρ × ring area in the slice)
      const weights = dens.map((d, i) => d * (i + 0.5));
      const wsum = weights.reduce((a, b) => a + b, 0);
      ctx.fillStyle = p.ink;
      ctx.font = `700 11px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let seed = 0;
      for (let i = 0; i < rings; i += 2) {
        const cnt = Math.round((36 * (weights[i] + (weights[i + 1] ?? 0))) / wsum);
        const rr = ((i + 1) * R * k) / rings;
        for (let j = 0; j < cnt; j++) {
          const t = (2 * Math.PI * j) / cnt + seed;
          ctx.fillText('+', cx + rr * Math.cos(t), cy + rr * Math.sin(t));
        }
        seed += 0.7;
      }
      // the Gaussian sphere and the field on it, equal everywhere by symmetry
      ctx.setLineDash([7, 6]);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = p.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, s.r * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const eRef = fieldOf(s.scene, 1, R);
      const len = Math.max(7, Math.min(rmax * 0.32, (E / eRef) * rmax * 0.28));
      for (let i = 0; i < 12; i++) {
        const a = (2 * Math.PI * (i + 0.5)) / 12;
        const ux = Math.cos(a);
        const uy = -Math.sin(a);
        const bx = cx + ux * s.r * k;
        const by = cy + uy * s.r * k;
        arrow(ctx, bx, by, bx + ux * len, by + uy * len, { color: p.efield, width: 2.2, head: 8 });
      }
      ctx.fillStyle = p.paper;
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + s.r * k, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // side view: the axis runs left to right across the panel
      const x0 = 8;
      const x1 = w * 0.5 - 8;
      for (let i = rings - 1; i >= 0; i--) {
        ctx.fillStyle = withAlpha(p.pos, 0.07 + 0.38 * (dens[i] / dmax));
        const y = (i * R * k) / rings;
        const hh = (R * k) / rings;
        ctx.fillRect(x0, cy - y - hh, x1 - x0, hh);
        ctx.fillRect(x0, cy + y, x1 - x0, hh);
      }
      ctx.strokeStyle = p.pos;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, cy - R * k);
      ctx.lineTo(x1, cy - R * k);
      ctx.moveTo(x0, cy + R * k);
      ctx.lineTo(x1, cy + R * k);
      ctx.stroke();
      ctx.fillStyle = p.ink;
      ctx.font = `700 11px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const wsum = dens.reduce((a, b) => a + b, 0);
      for (let i = 0; i < rings; i += 2) {
        const cnt = Math.max(1, Math.round((14 * (dens[i] + (dens[i + 1] ?? 0))) / wsum));
        const y = ((i + 1) * R * k) / rings;
        for (let j = 0; j < cnt; j++) {
          const x = x0 + ((j + 0.5 + (i % 4 ? 0.5 : 0)) * (x1 - x0)) / (cnt + 0.5);
          ctx.fillText('+', x, cy - y);
          ctx.fillText('+', x, cy + y);
        }
      }
      // the coaxial Gaussian cylinder, seen from the side: a dashed rectangle
      const hx = (L_GAUSS / 2) * k;
      const hy = s.r * k;
      ctx.setLineDash([7, 6]);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = p.accent;
      ctx.strokeRect(cx - hx, cy - hy, 2 * hx, 2 * hy);
      ctx.setLineDash([]);
      const eRef = fieldOf(s.scene, 1, R);
      const lenOf = (e: number) => Math.max(7, Math.min(rmax * 0.3, (e / eRef) * rmax * 0.26));
      const la = 16;
      // side: E and dA both point away from the axis
      for (const sx of [-0.6, 0, 0.6]) {
        for (const sy of [-1, 1]) {
          const bx = cx + sx * hx;
          const by = cy + sy * hy;
          arrow(ctx, bx + 6, by, bx + 6, by + sy * la, { color: p.ink, width: 1.5, head: 6 });
          arrow(ctx, bx - 4, by, bx - 4, by + sy * lenOf(E), { color: p.efield, width: 2.2, head: 8 });
        }
      }
      // caps: dA along the axis, E across it
      const eHalf = fieldOf(s.scene, s.profile, s.r / 2);
      for (const sx of [-1, 1]) {
        const bx = cx + sx * hx;
        arrow(ctx, bx, cy, bx + sx * la * 1.3, cy, { color: p.ink, width: 1.5, head: 6 });
        for (const sy of [-1, 1]) {
          const by = cy + (sy * hy) / 2;
          arrow(ctx, bx, by, bx, by + sy * lenOf(eHalf), { color: p.efield, width: 2, head: 7 });
        }
      }
      ctx.fillStyle = p.paper;
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy - hy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // graph of E against r
    let emax = 0;
    for (const n of PROFILES) for (let i = 1; i <= 100; i++) emax = Math.max(emax, fieldOf(s.scene, n, (R_MAX * i) / 100));
    const plot = makePlot(graph, { min: 0, max: R_MAX, label: 'r (m)', ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5], format: (v) => String(v) }, { min: 0, max: emax * 1.12, label: 'E (N/C)' });
    drawAxes(ctx, plot, p);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.px(R), plot.box.y);
    ctx.lineTo(plot.px(R), plot.box.y + plot.box.h);
    ctx.stroke();
    ctx.restore();
    for (const n of PROFILES) {
      if (n === s.profile) continue;
      drawCurve(ctx, plot, (r) => fieldOf(s.scene, n, r), { color: p.ink3, width: 1.4, dash: [5, 4], samples: 120 });
    }
    drawCurve(ctx, plot, (r) => fieldOf(s.scene, s.profile, r), { color: p.efield, width: 2.6, samples: 160 });
    drawMarker(ctx, plot, s.r, E, p.accent, { guides: true });
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 3, worldHeight: 2, animate: false });
  useEffect(invalidate, [s]);

  const describe = (st: State) => {
    const e = fieldOf(st.scene, st.profile, st.r);
    return `${SCENE_LABEL[st.scene]}, צפיפות ${PROFILE_LABEL[String(st.profile)]}. משטח גאוס ברדיוס ${sci(st.r)} מטר, ${st.r < R ? 'בתוך הגוף' : 'מחוץ לגוף'}. השדה עליו ${sci(e)} ניוטון לקולון.`;
  };

  /** the pointer's distance from the centre (ball) or from the axis (cylinder), in metres */
  const rFromPointer = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return null;
    const { cx, cy, rmax } = layout(v.w, v.h);
    const k = rmax / R_MAX;
    return s.scene === 'ball' ? Math.hypot(e.offsetX - cx, e.offsetY - cy) / k : Math.abs(e.offsetY - cy) / k;
  };
  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    const r = rFromPointer(e);
    if (!v || r === null || e.offsetX > v.w * 0.5) return;
    const { rmax } = layout(v.w, v.h);
    if (Math.abs(r - s.r) * (rmax / R_MAX) < 16) {
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const r = rFromPointer(e);
    if (r !== null) setS((p) => ({ ...p, r: clampR(r) }));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(describe(s));
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
    setS((p) => {
      const next = { ...p, r: clampR(p.r + d * (e.shiftKey ? 0.1 : 0.01)) };
      setLive(describe(next));
      return next;
    });
  };

  const fluxNow = s.scene === 'ball' ? E * 4 * Math.PI * s.r * s.r : pieces.side + 2 * pieces.caps;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${describe(s)} מימין גרף השדה כפונקציה של המרחק. גררו את משטח גאוס המקווקו; במקלדת: חיצים משנים את הרדיוס.`}
      canvasRef={canvasRef}
      aspect={3 / 2}
      live={live}
      tasks={tasks}
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
            {s.scene === 'ball' ? 'מטען בתוך משטח גאוס' : `מטען בתוך גליל גאוס (באורך ${L_GAUSS * 100} ס״מ)`}:{' '}
            <b class="q">Q<sub>in</sub> = {sci(qIn)} C</b>
          </span>
          {s.scene === 'cylinder' ? (
            <span>
              שטף דרך הדופן: <b class="q">E·2πrL = {sci(pieces.side)}</b> · דרך הבסיסים: <b class="q">0</b> · <b class="q">Q<sub>in</sub>/ε₀ = {sci(qIn / EPS0)} N·m²/C</b>
            </span>
          ) : (
            <span>
              שטף: <b class="q">E·4πr² = {sci(fluxNow)}</b> · <b class="q">Q<sub>in</sub>/ε₀ = {sci(qIn / EPS0)} N·m²/C</b>
            </span>
          )}
          <span>
            שדה על משטח גאוס: <b class="q">E = {sci(E)} N/C</b> ({s.r < R ? 'בתוך הגוף' : 'מחוץ לגוף'})
          </span>
        </>
      }
      controls={
        <>
          <Slider label="רדיוס משטח גאוס, r" value={s.r} min={R_MIN} max={R_MAX} step={0.01} format={(v) => `${sci(v)} m`} onChange={(v) => setS({ ...s, r: clampR(v) })} />
          <div class="group" role="group" aria-label="הגוף הטעון">
            {(Object.keys(SCENE_LABEL) as Scene[]).map((k) => (
              <button type="button" key={k} class={`toggle ${s.scene === k ? 'on' : ''}`} aria-pressed={s.scene === k} onClick={() => setS({ ...s, scene: k })}>
                {SCENE_LABEL[k]}
              </button>
            ))}
          </div>
          <div class="group" role="group" aria-label="פרופיל הצפיפות">
            {PROFILES.map((n) => (
              <button type="button" key={n} class={`toggle ${s.profile === n ? 'on' : ''}`} aria-pressed={s.profile === n} onClick={() => setS({ ...s, profile: n })}>
                {n === 0 ? PROFILE_LABEL['0'] : <bdi dir="ltr">{PROFILE_LABEL[String(n)]}</bdi>}
              </button>
            ))}
          </div>
        </>
      }
    />
  );
}
