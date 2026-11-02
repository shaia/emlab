/**
 * Figure 6.3ג: the two products of two vectors in the page, from their components. The dot product
 * A·B = AxBx + AyBy is a number: the figure drops B onto the line of A and marks the projection.
 * The cross product of two vectors in the page is perpendicular to it: its only component is
 * (A×B)z = AxBy − AyBx, drawn as ⊙ (out of the page) or ⊗ (into it) at the centre of the
 * parallelogram the two vectors span, whose area is |A×B|. The order switch shows B×A = −A×B.
 * Tips snap to a grid of whole units so every number is exact. Numbers from vec.ts / coordinates.ts.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { angleBetween, cross3, dot3 } from '~/physics/coordinates';
import type { Vec3 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from '../core/canvas';
import { arrow, depthGlyph, withAlpha } from '../core/ink';
import SimShell, { Toggle, type TaskDef } from '../core/SimShell';
import { useTouched } from './touch';
import { dashed, degText, handle, label, num, vecText } from './draw';

const WORLD_W = 12.5;
const WORLD_H = 9;
const LIM_X = 5;
const LIM_Y = 4;
const TIP_PX = 12;

const TASK_LABEL: Record<string, string> = {
  'dot-zero': 'סדרו את A ואת B כך ש-⁦A·B = 0⁩ (בלי שאחד מהם יהיה אפס). מה הזווית ביניהם?',
  'cross-zero': 'סדרו אותם כך ש-⁦A×B = 0⁩. איך הם מונחים זה ביחס לזה?',
  'cross-in': 'סדרו אותם כך שהמכפלה הווקטורית המוצגת תצביע לתוך הדף (⊗).',
};

interface State {
  a: [number, number];
  b: [number, number];
  showDot: boolean;
  showCross: boolean;
  /** true shows B×A instead of A×B */
  swapped: boolean;
  selected: 'a' | 'b' | null;
}

export interface ProductsSceneProps {
  id: string;
  tasks?: string[];
  a?: [number, number];
  b?: [number, number];
  showDot?: boolean;
  showCross?: boolean;
}

function initial(p: ProductsSceneProps): State {
  return {
    a: p.a ?? [4, 1],
    b: p.b ?? [1, 3],
    showDot: p.showDot ?? true,
    showCross: p.showCross ?? false,
    swapped: false,
    selected: null,
  };
}

const v3 = (v: [number, number]): Vec3 => [v[0], v[1], 0];
/** a factor in a written product: negative numbers in parentheses */
const par = (x: number) => (x < 0 ? `(${num(x)})` : num(x));

export default function ProductsScene(props: ProductsSceneProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const drag = useRef<'a' | 'b' | null>(null);
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
          if (typeof st.showDot === 'boolean') next.showDot = st.showDot;
          if (typeof st.showCross === 'boolean') next.showCross = st.showCross;
          if (typeof st.swapped === 'boolean') next.swapped = st.swapped;
          if (Array.isArray(st.a) && st.a.length === 2) next.a = [Number(st.a[0]), Number(st.a[1])];
          if (Array.isArray(st.b) && st.b.length === 2) next.b = [Number(st.b[0]), Number(st.b[1])];
          return next;
        });
      }),
    [props.id],
  );

  const A = v3(s.a);
  const B = v3(s.b);
  const dotAB = dot3(A, B);
  const crossZ = cross3(A, B)[2];
  const shownZ = s.swapped ? -crossZ : crossZ;
  const nonzero = (s.a[0] !== 0 || s.a[1] !== 0) && (s.b[0] !== 0 || s.b[1] !== 0);
  const alpha = nonzero ? angleBetween(A, B) : NaN;

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    if (!touched.current) return;
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (has('dot-zero') && nonzero && dotAB === 0) done('dot-zero');
    if (has('cross-zero') && nonzero && crossZ === 0) done('cross-zero');
    if (has('cross-in') && s.showCross && shownZ < 0) done('cross-in');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    grid(ctx, view, p);
    const O = toScreen(view, 0, 0);
    const at = (v: readonly number[]) => toScreen(view, v[0], v[1]);
    const colA = p.force;
    const colB = p.equip;

    if (s.showCross && nonzero) {
      // the parallelogram spanned by A and B; its area is |A×B|
      const pa = at(s.a);
      const pb = at(s.b);
      const pab = at([s.a[0] + s.b[0], s.a[1] + s.b[1]]);
      ctx.save();
      ctx.fillStyle = withAlpha(p.bfield, 0.14);
      ctx.strokeStyle = withAlpha(p.bfield, 0.5);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(O[0], O[1]);
      ctx.lineTo(pa[0], pa[1]);
      ctx.lineTo(pab[0], pab[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      const cx = (O[0] + pab[0]) / 2;
      const cy = (O[1] + pab[1]) / 2;
      if (shownZ !== 0) {
        const r = Math.min(22, 7 + 1.1 * Math.sqrt(Math.abs(shownZ)) * 3);
        depthGlyph(ctx, cx, cy, r, shownZ > 0 ? 'out' : 'in', p.bfield, {
          fill: p.paper,
          width: 2.2,
        });
      }
    }

    if (s.showDot && nonzero) {
      // the projection of B onto the line of A: a signed length A·B/|A|
      const la = Math.hypot(s.a[0], s.a[1]);
      const t = dotAB / (la * la);
      const foot = [s.a[0] * t, s.a[1] * t];
      const pf = at(foot);
      const pb = at(s.b);
      // the line of A, extended both ways
      const far = 7 / la;
      const l1 = at([-s.a[0] * far, -s.a[1] * far]);
      const l2 = at([s.a[0] * far, s.a[1] * far]);
      dashed(ctx, l1[0], l1[1], l2[0], l2[1], withAlpha(colA, 0.3), 1, [2, 5]);
      dashed(ctx, pb[0], pb[1], pf[0], pf[1], withAlpha(colB, 0.7), 1.3);
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 6;
      ctx.globalAlpha = 0.55;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(O[0], O[1]);
      ctx.lineTo(pf[0], pf[1]);
      ctx.stroke();
      ctx.restore();
    }

    const [bx, by] = at(s.b);
    arrow(ctx, O[0], O[1], bx, by, { color: colB, width: 3, head: 13 });
    tag(ctx, 'B', bx, by, s.b, colB, p);
    handle(ctx, bx, by, colB, s.selected === 'b', p, TIP_PX * 0.62);
    const [ax, ay] = at(s.a);
    arrow(ctx, O[0], O[1], ax, ay, { color: colA, width: 3, head: 13 });
    tag(ctx, 'A', ax, ay, s.a, colA, p);
    handle(ctx, ax, ay, colA, s.selected === 'a', p, TIP_PX * 0.62);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    animate: false,
  });
  useEffect(invalidate, [s]);

  const snap = (x: number, y: number): [number, number] => [
    Math.max(-LIM_X, Math.min(LIM_X, Math.round(x))),
    Math.max(-LIM_Y, Math.min(LIM_Y, Math.round(y))),
  ];

  const hit = (v: View, sx: number, sy: number): 'a' | 'b' | null => {
    const near = (w: [number, number]) => {
      const [x, y] = toScreen(v, w[0], w[1]);
      return Math.hypot(sx - x, sy - y) < TIP_PX + 12;
    };
    if (near(s.a)) return 'a';
    if (near(s.b)) return 'b';
    return null;
  };

  const describe = (st: State) => {
    const a3 = v3(st.a);
    const b3 = v3(st.b);
    const z = cross3(a3, b3)[2] * (st.swapped ? -1 : 1);
    const dir = z > 0 ? 'החוצה מהדף' : z < 0 ? 'לתוך הדף' : 'אפס';
    return `A הוא ${vecText(st.a)}, B הוא ${vecText(st.b)}. המכפלה הסקלרית ${num(dot3(a3, b3))}. המכפלה הווקטורית ${st.swapped ? 'B כפול A' : 'A כפול B'}: רכיב z שלה ${num(z)}, ${dir}.`;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (!h) return;
    drag.current = h;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [x, y] = toWorld(v, e.offsetX, e.offsetY);
    const w = snap(x, y);
    if (w[0] !== s[d][0] || w[1] !== s[d][1]) setS((prev) => ({ ...prev, [d]: w }));
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const next = s.selected === 'a' ? 'b' : 'a';
      setS((prev) => ({ ...prev, selected: next }));
      setLive(`נבחר הווקטור ${next === 'a' ? 'A' : 'B'}.`);
      return;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? 'a';
    setS((prev) => {
      const next = {
        ...prev,
        selected: sel,
        [sel]: snap(prev[sel][0] + d[0], prev[sel][1] + d[1]),
      };
      setLive(describe(next));
      return next;
    });
  };
  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const name = s.swapped ? 'B×A' : 'A×B';
  const dirText = shownZ > 0 ? '⊙ החוצה מהדף' : shownZ < 0 ? '⊗ לתוך הדף' : 'אפס';
  return (
    <div {...handlers}>
      <SimShell
        fig={props.id}
        label={`איור חי: שני וקטורים במישור הדף, על רשת של יחידות שלמות. ${describe(s)} גררו את קצות החצים; במקלדת: רווח בוחר וקטור, חיצים מזיזים.`}
        canvasRef={canvasRef}
        aspect={WORLD_W / WORLD_H}
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
            <span class="q">A = {vecText(s.a)}</span>
            <span class="q">B = {vecText(s.b)}</span>
            {s.showDot && (
              <b class="q">
                A·B = {par(s.a[0])}·{par(s.b[0])} + {par(s.a[1])}·{par(s.b[1])} = {num(dotAB)}
              </b>
            )}
            {s.showDot && (
              <span>
                הזווית ביניהם: <span class="q">{Number.isNaN(alpha) ? '—' : degText(alpha)}</span>
              </span>
            )}
            {s.showCross && (
              <b class="q">
                ({name})z = {num(s.swapped ? -crossZ : crossZ)}
              </b>
            )}
            {s.showCross && (
              <span>
                כיוון {name}: <span class="q">{dirText}</span>
              </span>
            )}
          </>
        }
        controls={
          <>
            <div class="group" role="group" aria-label="איזו מכפלה להציג">
              <Toggle label="מכפלה סקלרית A·B" on={s.showDot} swatch="var(--accent)" onChange={(v) => setS({ ...s, showDot: v })} />
              <Toggle label="מכפלה וקטורית" on={s.showCross} swatch="var(--bfield)" onChange={(v) => setS({ ...s, showCross: v })} />
            </div>
            {s.showCross && (
              <div class="group" role="group" aria-label="סדר הגורמים">
                {([false, true] as const).map((k) => (
                  <button
                    type="button"
                    key={String(k)}
                    class={`toggle ${s.swapped === k ? 'on' : ''}`}
                    aria-pressed={s.swapped === k}
                    onClick={() => setS({ ...s, swapped: k })}
                  >
                    <bdi dir="ltr">{k ? 'B×A' : 'A×B'}</bdi>
                  </button>
                ))}
              </div>
            )}
            <p class="hint hand">גררו את העיגולים שבקצות החצים.</p>
          </>
        }
      />
    </div>
  );
}

/** Grid squares of one unit, with the x and y axes through the origin. */
function grid(ctx: CanvasRenderingContext2D, v: View, p: Palette) {
  const [ox, oy] = toScreen(v, 0, 0);
  const halfW = v.w / 2 / v.ppm;
  const halfH = v.h / 2 / v.ppm;
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.lineWidth = 1;
  for (let i = -Math.floor(halfW); i <= halfW; i++) {
    const [x] = toScreen(v, i, 0);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, v.h);
    ctx.stroke();
  }
  for (let j = -Math.floor(halfH); j <= halfH; j++) {
    const [, y] = toScreen(v, 0, j);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(v.w, y);
    ctx.stroke();
  }
  ctx.restore();
  arrow(ctx, 6, oy, v.w - 6, oy, { color: p.ink3, width: 1.4, head: 9 });
  arrow(ctx, ox, v.h - 6, ox, 6, { color: p.ink3, width: 1.4, head: 9 });
  label(ctx, 'x', v.w - 12, oy + 14, p.ink2, p, 14);
  label(ctx, 'y', ox + 14, 12, p.ink2, p, 14);
}

/** Name beside an arrow tip, pushed outward along the arrow so it clears the head. */
function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dir: readonly number[], color: string, p: Palette) {
  const L = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / L;
  const uy = -dir[1] / L;
  label(ctx, text, x + ux * 18 - uy * 10, y + uy * 18 + ux * 10, color, p, 15);
}
