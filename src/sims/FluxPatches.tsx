/**
 * Flux patches: a cube cut into n×n patches per face around a point charge, and the surface
 * integral ∮E·dA as the sum of E·ΔA over the patches. Built for lesson 6.5.
 *
 * The canvas shows the slice of the cube through the charge (z = 0): a square whose four edges are
 * the right, left, top and bottom faces seen edge-on. On each edge the n patches of the row through
 * the slice are marked; each has its area vector ΔA (dark, outward, longer for a bigger patch) and the
 * field E at its midpoint (orange). A patch where E·ΔA > 0 is drawn solid, one where it is negative
 * dashed. The front and back faces are not drawn; their fluxes are in the readout.
 *
 * Every number comes from src/physics/surfaceflux.ts: the patch sum (cubePatchFluxes), the exact flux
 * per face (cubeFaceFluxes, by solid angle) and the spread of E·n̂ over the faces (facePatchNormals).
 * The charge moves only in the z = 0 plane.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { EPS0, K } from '~/physics/constants';
import { fieldAt3, type PointCharge3 } from '~/physics/electrostatics';
import { cubeFaceFluxes, cubePatchFluxes, facePatchNormals, insideCube } from '~/physics/surfaceflux';
import type { Vec3 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, chargeDisc, paperGrid, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const Q = 1e-9;
/** cube side [m] */
const A = 0.4;
const WORLD_W = 0.92;
const WORLD_H = 0.62;
const X_MAX = 0.42;
const Y_MAX = 0.27;
const CHARGE_PX = 13;
const N_MAX = 16;
const O: Vec3 = [0, 0, 0];
/** the field at the middle of a face for a centred charge: the arrow-length reference */
const E_REF = (K * Q) / (A / 2) ** 2;

const FACE_LABEL = ['ימין', 'שמאל', 'עליונה', 'תחתונה', 'קדמית', 'אחורית'];

const TASK_LABEL: Record<string, string> = {
  refine: 'הגדילו את n עד שסכום החתיכות רחוק פחות מ-1% מ-Q/ε₀.',
  'off-centre': 'גררו את המטען אל אחת הפאות, בלי להוציא אותו. מה קורה לשטף דרך הפאה הקרובה, ומה לסכום?',
  outside: 'הוציאו את המטען מהקובייה. מה השטף הכולל עכשיו?',
};

export interface FluxPatchesProps {
  id: string;
  /** patches along each edge of a face */
  n?: number;
  /** charge position in the slice [m] */
  x?: number;
  y?: number;
  tasks?: string[];
}

interface State {
  n: number;
  x: number;
  y: number;
}

const clampN = (n: number) => Math.max(1, Math.min(N_MAX, Math.round(n)));
/** a charge on a face plane has no defined flux through that face: keep it at least 2 mm off the planes */
const offFace = (v: number) => {
  const d = Math.abs(v) - A / 2;
  return Math.abs(d) < 0.002 ? Math.sign(v || 1) * (A / 2 + (d < 0 ? -0.002 : 0.002)) : v;
};
const clampXY = (x: number, y: number): [number, number] => [
  offFace(Math.max(-X_MAX, Math.min(X_MAX, x))),
  offFace(Math.max(-Y_MAX, Math.min(Y_MAX, y))),
];
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export default function FluxPatches(props: FluxPatchesProps) {
  const init = (): State => ({ n: clampN(props.n ?? 1), x: props.x ?? 0, y: props.y ?? 0 });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const dragging = useRef(false);
  // a state change that came from a text step must not tick a task: only the student's own controls do
  const fromStep = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        fromStep.current = true;
        setS((prev) => {
          const [x, y] = clampXY(typeof st.x === 'number' ? st.x : prev.x, typeof st.y === 'number' ? st.y : prev.y);
          return { n: typeof st.n === 'number' ? clampN(st.n) : prev.n, x, y };
        });
      }),
    [props.id],
  );

  const pos: Vec3 = [s.x, s.y, 0];
  const charges: PointCharge3[] = useMemo(() => [{ pos: [s.x, s.y, 0], q: Q }], [s.x, s.y]);
  const inside = insideCube(pos, O, A);
  const exact = useMemo(() => cubeFaceFluxes(Q, [s.x, s.y, 0], O, A), [s.x, s.y]);
  const patch = useMemo(() => cubePatchFluxes(charges, O, A, s.n), [charges, s.n]);
  const patchSum = patch.reduce((t, f) => t + f, 0);
  const gauss = inside ? Q / EPS0 : 0;
  // the spread of the normal field over the whole cube, on a fixed fine grid so it does not depend on n
  const spread = useMemo(() => {
    const all = [0, 1, 2, 3, 4, 5].flatMap((f) => facePatchNormals(charges, O, A, f, 12));
    return [Math.min(...all), Math.max(...all)];
  }, [charges]);

  useEffect(() => {
    if (fromStep.current) {
      fromStep.current = false;
      return;
    }
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (has('refine') && inside && Math.abs(patchSum - gauss) / gauss < 0.01 && s.n > 1) done('refine');
    if (has('off-centre') && inside) {
      const sides = exact.slice(0, 4);
      if (Math.max(...sides) / Math.min(...sides) > 2.5) done('off-centre');
    }
    if (has('outside') && (Math.abs(s.x) > A / 2 + 0.02 || Math.abs(s.y) > A / 2 + 0.02)) done('outside');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p);
    const h = A / 2;
    const [x0, y0] = toScreen(view, -h, h);
    const side = A * view.ppm;
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.06);
    ctx.fillRect(x0, y0, side, side);
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, side, side);
    ctx.restore();

    // the four faces seen edge-on: +x, −x, +y, −y, each with its outward normal and its run along the edge
    const edges: { n: [number, number]; at: (t: number) => [number, number] }[] = [
      { n: [1, 0], at: (t) => [h, t] },
      { n: [-1, 0], at: (t) => [-h, t] },
      { n: [0, 1], at: (t) => [t, h] },
      { n: [0, -1], at: (t) => [t, -h] },
    ];
    const d = A / s.n;
    const patchPx = d * view.ppm;
    for (const e of edges) {
      for (let i = 0; i < s.n; i++) {
        const t0 = -h + i * d;
        const tm = t0 + d / 2;
        const [wx, wy] = e.at(tm);
        const E = fieldAt3(charges, [wx, wy, 0]);
        const en = E[0] * e.n[0] + E[1] * e.n[1];
        // the patch itself: solid where E·ΔA > 0, dashed where it is negative
        const [ax, ay] = toScreen(view, ...e.at(t0 + d * 0.06));
        const [bx, by] = toScreen(view, ...e.at(t0 + d * 0.94));
        ctx.save();
        ctx.lineCap = 'butt';
        ctx.lineWidth = 5;
        ctx.strokeStyle = en >= 0 ? p.efield : p.ink2;
        if (en < 0) ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.restore();
        const [mx, my] = toScreen(view, wx, wy);
        // ΔA: outward, its length grows with the patch; set a little to one side so a parallel E stays visible
        const la = Math.max(7, patchPx * 0.25);
        const ox = e.n[1] * 4;
        const oy = e.n[0] * 4;
        arrow(ctx, mx + ox, my + oy, mx + ox + e.n[0] * la, my + oy - e.n[1] * la, { color: p.ink, width: 1.6, head: 7 });
        // E at the patch midpoint (in the slice, E has no z component)
        const mag = Math.hypot(E[0], E[1]);
        if (mag > 0) {
          const le = Math.max(6, Math.min(0.1 * view.ppm, 0.07 * view.ppm * Math.sqrt(mag / E_REF)));
          arrow(ctx, mx - ox, my - oy, mx - ox + (E[0] / mag) * le, my - oy - (E[1] / mag) * le, { color: p.efield, width: 2, head: 8, alpha: 0.95 });
        }
      }
    }
    const [cx, cy] = toScreen(view, s.x, s.y);
    chargeDisc(ctx, cx, cy, CHARGE_PX, Q, p, { label: '+1 nC', selected: dragging.current });
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const describe = (st: State) => {
    const ins = insideCube([st.x, st.y, 0], O, A);
    const sumNow = cubePatchFluxes([{ pos: [st.x, st.y, 0], q: Q }], O, A, st.n).reduce((t, f) => t + f, 0);
    return `${ins ? 'המטען בתוך הקובייה' : 'המטען מחוץ לקובייה'}. ${st.n} חתיכות לאורך כל צלע. סכום החתיכות ${sci(sumNow)} ניוטון מטר רבוע לקולון.`;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const [cx, cy] = toScreen(v, s.x, s.y);
    if (Math.hypot(e.offsetX - cx, e.offsetY - cy) > CHARGE_PX + 10) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v || !dragging.current) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const [x, y] = clampXY(r3(wx), r3(wy));
    setS((prev) => ({ ...prev, x, y }));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(describe(s));
    dragging.current = false;
    invalidate();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const dd = dirs[e.key];
    if (!dd) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.05 : 0.01;
    setS((prev) => {
      const [x, y] = clampXY(r3(prev.x + dd[0] * step), r3(prev.y + dd[1] * step));
      const next = { ...prev, x, y };
      setLive(describe(next));
      return next;
    });
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: קובייה שצלעה ${A * 100} סנטימטרים, מחולקת לחתיכות, ומטען נקודתי של ננו-קולון אחד. ${describe(s)} גררו את המטען; במקלדת: חיצים מזיזים אותו.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor="grab"
      onReset={() => {
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            סכום החתיכות ({s.n}×{s.n} בכל פאה): <b class="q">ΣE·ΔA = {sci(patchSum)} N·m²/C</b>
          </span>
          <span>
            חוק גאוס: <b class="q">Q<sub>in</sub>/ε₀ = {sci(gauss)} N·m²/C</b> {inside ? '' : '(המטען בחוץ)'}
          </span>
          <span>
            השטף המדויק דרך כל פאה:{' '}
            {exact.map((f, i) => (
              <span key={i}>
                {i > 0 ? ' · ' : ''}
                {FACE_LABEL[i]} <b class="q">{sci(f)}</b>
              </span>
            ))}{' '}
            <b class="q">N·m²/C</b>
          </span>
          <span>
            על פני הקובייה הרכיב הניצב של השדה נע בין <b class="q">{sci(spread[0])}</b> ל-<b class="q">{sci(spread[1])} N/C</b>
          </span>
        </>
      }
      controls={
        <>
          <Slider label="חתיכות לאורך כל צלע, n" value={s.n} min={1} max={N_MAX} step={1} format={(v) => String(v)} onChange={(v) => setS({ ...s, n: clampN(v) })} />
          <div class="group" role="group" aria-label="מקום המטען">
            <button type="button" class="toggle" onClick={() => setS({ ...s, x: 0, y: 0 })}>
              המטען למרכז
            </button>
          </div>
        </>
      }
    />
  );
}
