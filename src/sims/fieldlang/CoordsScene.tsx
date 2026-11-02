/**
 * Figure 6.3ב: one point P in three coordinate languages. An oblique drawing of 3D space (z up,
 * y to the right, x toward the reader, down-left) shows P and what each system measures:
 * Cartesian x, y, z (a box of projections), cylindrical s, φ, z (the distance from the z axis, the
 * angle around it, the height; the cylinder of radius s through P) and spherical r, θ, φ (the
 * distance from the origin, the angle from the z axis, the same φ). The sliders speak the chosen
 * language; the readout always shows all three. Optional unit vectors at P show that ŝ, φ̂, r̂, θ̂
 * change direction from point to point while x̂, ŷ, ẑ do not. Numbers from coordinates.ts.
 */

import { useEffect, useState } from 'preact/hooks';
import { cylindricalBasis, fromCylindrical, fromSpherical, sphericalBasis, toCylindrical, toSpherical } from '~/physics/coordinates';
import type { Vec3 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette, type View } from '../core/canvas';
import { arrow, withAlpha } from '../core/ink';
import SimShell, { Slider, type TaskDef } from '../core/SimShell';
import { useTouched } from './touch';
import { dashed, degText, dot, label, num, sideLabel } from './draw';

export type CoordSystem = 'cart' | 'cyl' | 'sph';

const SYSTEM_HE: Record<CoordSystem, string> = {
  cart: 'קרטזיות',
  cyl: 'גליליות',
  sph: 'כדוריות',
};
const WORLD_W = 11;
const WORLD_H = 9.4;
/** the x axis is drawn foreshortened, down-left at this angle */
const K_X = 0.5;
const A_X = (35 * Math.PI) / 180;
const DEG = Math.PI / 180;

const TASK_LABEL: Record<string, string> = {
  'cyl-target': 'בקואורדינטות גליליות, הביאו את P ל-⁦s = 2 m⁩, ⁦φ = 90°⁩, ⁦z = 1 m⁩. מה הם x ו-y?',
  equator: 'בקואורדינטות כדוריות, קבעו ⁦θ = 90°⁩. איפה נמצאות כל הנקודות האלה?',
  axis: 'הביאו את P אל ציר z (אבל לא לראשית). מה קורה לזווית φ?',
};

interface State {
  p: Vec3;
  system: CoordSystem;
  showBasis: boolean;
}

export interface CoordsSceneProps {
  id: string;
  tasks?: string[];
  point?: [number, number, number];
  system?: CoordSystem;
  showBasis?: boolean;
}

function initial(p: CoordsSceneProps): State {
  return {
    p: p.point ?? [2, 1.5, 2],
    system: p.system ?? 'cart',
    showBasis: p.showBasis ?? false,
  };
}

/** Oblique projection to screen-plane world units: x down-left, y right, z up. */
const flat = (q: Vec3): [number, number] => [q[1] - K_X * q[0] * Math.cos(A_X), q[2] - K_X * q[0] * Math.sin(A_X)];

/** Screen centre sits a little right of and below the origin, so the positive octant has room. */
function project(v: View) {
  return (q: Vec3): [number, number] => {
    const [X, Y] = flat(q);
    return [v.w / 2 + (X - 0.2) * v.ppm, v.h / 2 - (Y - 0.6) * v.ppm];
  };
}

const m = (x: number) => `${num(x)} m`;
const angleDeg = (rad: number) => Math.round(rad / DEG);

export default function CoordsScene(props: CoordsSceneProps) {
  const [s, setS] = useState<State>(() => initial(props));
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
          if (st.system === 'cart' || st.system === 'cyl' || st.system === 'sph') next.system = st.system;
          if (typeof st.showBasis === 'boolean') next.showBasis = st.showBasis;
          if (Array.isArray(st.point) && st.point.length === 3) next.p = [Number(st.point[0]), Number(st.point[1]), Number(st.point[2])];
          return next;
        });
      }),
    [props.id],
  );

  const cyl = toCylindrical(s.p);
  const sph = toSpherical(s.p);

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    if (!touched.current) return;
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    if (has('cyl-target') && s.system === 'cyl' && near(cyl.s, 2) && near(cyl.phi, 90 * DEG) && near(cyl.z, 1)) done('cyl-target');
    if (has('equator') && s.system === 'sph' && sph.r > 0 && near(sph.theta, 90 * DEG)) done('equator');
    if (has('axis') && cyl.s < 1e-9 && Math.abs(s.p[2]) > 1e-9) done('axis');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const P = project(view);
    const O = P([0, 0, 0]);
    const foot: Vec3 = [s.p[0], s.p[1], 0];

    // the x–y plane as a faint grid of 1 m squares
    ctx.save();
    ctx.strokeStyle = withAlpha(p.rule, 0.9);
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      const a = P([i, -3, 0]);
      const b = P([i, 3, 0]);
      const c = P([-3, i, 0]);
      const d = P([3, i, 0]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.stroke();
    }
    ctx.restore();

    // axes
    const axis = (to: Vec3, from: Vec3, name: string) => {
      const [x1, y1] = P(from);
      const [x2, y2] = P(to);
      arrow(ctx, x1, y1, x2, y2, { color: p.ink3, width: 1.5, head: 10 });
      const [lx, ly] = P([to[0] * 1.08, to[1] * 1.08, to[2] * 1.08]);
      label(ctx, name, lx, ly, p.ink2, p, 15);
    };
    axis([4, 0, 0], [-3.2, 0, 0], 'x');
    axis([0, 4.3, 0], [0, -3.4, 0], 'y');
    axis([0, 0, 4.2], [0, 0, -3.2], 'z');

    const sys = s.system;
    const [fx, fy] = P(foot);
    const [ppx, ppy] = P(s.p);
    const colA = p.accent;
    const colB = p.force;

    if (sys === 'cart') {
      const xa = P([s.p[0], 0, 0]);
      const ya = P([0, s.p[1], 0]);
      dashed(ctx, fx, fy, xa[0], xa[1], withAlpha(colA, 0.9), 1.6);
      dashed(ctx, fx, fy, ya[0], ya[1], withAlpha(colA, 0.9), 1.6);
      dashed(ctx, fx, fy, ppx, ppy, withAlpha(colA, 0.9), 1.6);
      if (Math.abs(s.p[0]) > 0.2) label(ctx, `x = ${num(s.p[0])}`, xa[0] - 22, xa[1] + 12, colA, p, 13);
      if (Math.abs(s.p[1]) > 0.2) label(ctx, `y = ${num(s.p[1])}`, ya[0], ya[1] + 16, colA, p, 13);
      if (Math.abs(s.p[2]) > 0.2) sideLabel(ctx, `z = ${num(s.p[2])}`, fx, fy, ppx, ppy, colA, p, -30);
    }

    if (sys === 'cyl') {
      // the cylinder of radius s about the z axis, from the plane up to P's height
      ring(ctx, P, cyl.s, 0, withAlpha(colB, 0.45));
      ring(ctx, P, cyl.s, s.p[2], withAlpha(colB, 0.7));
      // s: from the z axis to the foot; then z straight up to P
      const axisFoot = P([0, 0, 0]);
      ctx.save();
      ctx.strokeStyle = colA;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(axisFoot[0], axisFoot[1]);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.restore();
      if (cyl.s > 0.3) sideLabel(ctx, 's', axisFoot[0], axisFoot[1], fx, fy, colA, p, 13);
      dashed(ctx, fx, fy, ppx, ppy, colA, 2, [6, 3]);
      const zTop = P([0, 0, s.p[2]]);
      dashed(ctx, zTop[0], zTop[1], ppx, ppy, withAlpha(colA, 0.6), 1.2);
      if (Math.abs(s.p[2]) > 0.3) sideLabel(ctx, 'z', fx, fy, ppx, ppy, colA, p, -12);
      if (cyl.s > 0.05) azimuthArc(ctx, P, Math.min(1, cyl.s * 0.6), cyl.phi, colB, p);
    }

    if (sys === 'sph') {
      // the great circle through P and the z axis, and the equator: the sphere of radius r
      meridian(ctx, P, sph.r, sph.phi, withAlpha(colB, 0.55));
      ring(ctx, P, sph.r, 0, withAlpha(colB, 0.35));
      ctx.save();
      ctx.strokeStyle = colA;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(O[0], O[1]);
      ctx.lineTo(ppx, ppy);
      ctx.stroke();
      ctx.restore();
      if (sph.r > 0.3) sideLabel(ctx, 'r', O[0], O[1], ppx, ppy, colA, p, -13);
      dashed(ctx, fx, fy, ppx, ppy, withAlpha(colA, 0.5), 1.2);
      dashed(ctx, O[0], O[1], fx, fy, withAlpha(colA, 0.5), 1.2);
      if (sph.r > 0.05) {
        polarArc(ctx, P, Math.min(1.1, sph.r * 0.55), sph.theta, sph.phi, colA, p);
        if (cyl.s > 0.05) azimuthArc(ctx, P, Math.min(0.9, cyl.s * 0.55), cyl.phi, colB, p);
      }
    }

    if (s.showBasis) {
      const B: [Vec3, string][] =
        sys === 'cart'
          ? [
              [[1, 0, 0], 'x̂'],
              [[0, 1, 0], 'ŷ'],
              [[0, 0, 1], 'ẑ'],
            ]
          : sys === 'cyl'
            ? (() => {
                const b = cylindricalBasis(cyl.phi);
                return [
                  [b.s, 'ŝ'],
                  [b.phi, 'φ̂'],
                  [b.z, 'ẑ'],
                ] as [Vec3, string][];
              })()
            : (() => {
                const b = sphericalBasis(sph.theta, sph.phi);
                return [
                  [b.r, 'r̂'],
                  [b.theta, 'θ̂'],
                  [b.phi, 'φ̂'],
                ] as [Vec3, string][];
              })();
      for (const [u, name] of B) {
        const tip = P([s.p[0] + u[0], s.p[1] + u[1], s.p[2] + u[2]]);
        arrow(ctx, ppx, ppy, tip[0], tip[1], {
          color: p.efield,
          width: 2.4,
          head: 10,
        });
        const far = P([s.p[0] + 1.3 * u[0], s.p[1] + 1.3 * u[1], s.p[2] + 1.3 * u[2]]);
        label(ctx, name, far[0], far[1], p.efield, p, 14);
      }
    }

    dot(ctx, fx, fy, withAlpha(p.ink2, 0.6), 2.6);
    dot(ctx, ppx, ppy, p.ink, 5.5);
    label(ctx, 'P', ppx + 14, ppy - 12, p.ink, p, 15);
    label(ctx, 'O', O[0] - 12, O[1] + 10, p.ink3, p, 12);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    animate: false,
  });
  useEffect(invalidate, [s]);

  const describe = (st: State) => {
    const c = toCylindrical(st.p);
    const q = toSpherical(st.p);
    return `הנקודה P: בקרטזיות x = ${num(st.p[0])}, y = ${num(st.p[1])}, z = ${num(st.p[2])} מטר. בגליליות s = ${num(c.s)} מטר, φ = ${angleDeg(c.phi)} מעלות. בכדוריות r = ${num(q.r)} מטר, θ = ${angleDeg(q.theta)} מעלות.`;
  };

  const setPoint = (pt: Vec3) => {
    // round away floating-point dust so readouts and task checks see clean numbers
    const clean = pt.map((c) => (Math.abs(c) < 1e-9 ? 0 : Math.round(c * 1e9) / 1e9)) as unknown as Vec3;
    setS((prev) => {
      const next = { ...prev, p: clean };
      setLive(describe(next));
      return next;
    });
  };

  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const sliders = () => {
    if (s.system === 'cart') {
      return (['x', 'y', 'z'] as const).map((k, i) => (
        <Slider
          key={k}
          label={k}
          min={-3}
          max={3}
          step={0.5}
          value={s.p[i]}
          format={m}
          onChange={(v) => setPoint(s.p.map((c, j) => (j === i ? v : c)) as unknown as Vec3)}
        />
      ));
    }
    if (s.system === 'cyl') {
      return (
        <>
          <Slider
            label="s"
            min={0}
            max={3.5}
            step={0.5}
            value={cyl.s}
            format={m}
            onChange={(v) => setPoint(fromCylindrical({ ...cyl, s: v }))}
          />
          <Slider
            label="φ"
            min={0}
            max={345}
            step={15}
            value={angleDeg(cyl.phi)}
            format={(v) => `${v}°`}
            onChange={(v) => setPoint(fromCylindrical({ ...cyl, phi: v * DEG }))}
          />
          <Slider
            label="z"
            min={-3}
            max={3}
            step={0.5}
            value={cyl.z}
            format={m}
            onChange={(v) => setPoint(fromCylindrical({ ...cyl, z: v }))}
          />
        </>
      );
    }
    return (
      <>
        <Slider label="r" min={0} max={4} step={0.5} value={sph.r} format={m} onChange={(v) => setPoint(fromSpherical({ ...sph, r: v }))} />
        <Slider
          label="θ"
          min={0}
          max={180}
          step={15}
          value={angleDeg(sph.theta)}
          format={(v) => `${v}°`}
          onChange={(v) => setPoint(fromSpherical({ ...sph, theta: v * DEG }))}
        />
        <Slider
          label="φ"
          min={0}
          max={345}
          step={15}
          value={angleDeg(sph.phi)}
          format={(v) => `${v}°`}
          onChange={(v) => setPoint(fromSpherical({ ...sph, phi: v * DEG }))}
        />
      </>
    );
  };

  const phiText = cyl.s < 1e-9 ? 'לא מוגדרת' : degText(cyl.phi);
  return (
    <div {...handlers}>
      <SimShell
        fig={props.id}
        label={`איור חי: מרחב תלת-ממדי, ציר z למעלה, ציר y ימינה וציר x אל הקורא. ${describe(s)} שנו את הקואורדינטות במחוונים שמתחת לאיור.`}
        canvasRef={canvasRef}
        aspect={WORLD_W / WORLD_H}
        live={live}
        tasks={tasks}
        onReset={reset}
        readout={
          <>
            <span>
              קרטזיות:{' '}
              <b class="q">
                (x, y, z) = ({num(s.p[0])}, {num(s.p[1])}, {num(s.p[2])}) m
              </b>
            </span>
            <span>
              גליליות: <b class="q">s = {m(cyl.s)}</b> <b class="q">φ = {phiText}</b> <b class="q">z = {m(cyl.z)}</b>
            </span>
            <span>
              כדוריות: <b class="q">r = {m(sph.r)}</b> <b class="q">θ = {sph.r === 0 ? 'לא מוגדרת' : degText(sph.theta)}</b>{' '}
              <b class="q">φ = {phiText}</b>
            </span>
          </>
        }
        controls={
          <>
            <div class="group" role="group" aria-label="באיזו מערכת קואורדינטות">
              {(['cart', 'cyl', 'sph'] as const).map((k) => (
                <button
                  type="button"
                  key={k}
                  class={`toggle ${s.system === k ? 'on' : ''}`}
                  aria-pressed={s.system === k}
                  onClick={() => setS({ ...s, system: k })}
                >
                  {SYSTEM_HE[k]}
                </button>
              ))}
            </div>
            {sliders()}
            <div class="group" role="group" aria-label="תוספות">
              <button
                type="button"
                class={`toggle ${s.showBasis ? 'on' : ''}`}
                aria-pressed={s.showBasis}
                onClick={() => setS({ ...s, showBasis: !s.showBasis })}
              >
                <span class="swatch" style={{ background: 'var(--efield)' }} aria-hidden="true" />
                וקטורי יחידה ב-P
              </button>
            </div>
          </>
        }
      />
    </div>
  );
}

type Proj = (q: Vec3) => [number, number];

/** A horizontal circle of radius R at height z about the z axis (an ellipse in the oblique view). */
function ring(ctx: CanvasRenderingContext2D, P: Proj, R: number, z: number, color: string) {
  if (R < 0.02) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * 2 * Math.PI;
    const [x, y] = P([R * Math.cos(a), R * Math.sin(a), z]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** The great circle of radius R through the z axis at azimuth φ. */
function meridian(ctx: CanvasRenderingContext2D, P: Proj, R: number, phi: number, color: string) {
  if (R < 0.02) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * 2 * Math.PI;
    const [x, y] = P([R * Math.sin(t) * Math.cos(phi), R * Math.sin(t) * Math.sin(phi), R * Math.cos(t)]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** The angle φ in the x–y plane, from +x round to the foot of P, with its name. */
function azimuthArc(ctx: CanvasRenderingContext2D, P: Proj, R: number, phi: number, color: string, p: Palette) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const n = Math.max(8, Math.round((phi / (2 * Math.PI)) * 64));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * phi;
    const [x, y] = P([R * Math.cos(a), R * Math.sin(a), 0]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  const [lx, ly] = P([1.45 * R * Math.cos(phi / 2), 1.45 * R * Math.sin(phi / 2), 0]);
  label(ctx, 'φ', lx, ly, color, p, 15);
}

/** The angle θ from the +z axis down to the line OP, in the vertical plane through P. */
function polarArc(ctx: CanvasRenderingContext2D, P: Proj, R: number, theta: number, phi: number, color: string, p: Palette) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const n = Math.max(8, Math.round((theta / Math.PI) * 48));
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * theta;
    const [x, y] = P([R * Math.sin(t) * Math.cos(phi), R * Math.sin(t) * Math.sin(phi), R * Math.cos(t)]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
  const t = theta / 2;
  const [lx, ly] = P([1.4 * R * Math.sin(t) * Math.cos(phi), 1.4 * R * Math.sin(t) * Math.sin(phi), 1.4 * R * Math.cos(t)]);
  label(ctx, 'θ', lx, ly, color, p, 15);
}
