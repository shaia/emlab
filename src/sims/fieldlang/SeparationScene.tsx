/**
 * Figure 6.3ד: Coulomb's law for a source anywhere. A point charge q sits at the source point r′,
 * the field is wanted at the field point P (position r), and both are measured from an origin O
 * that the reader can drag. The figure draws r, r′, the separation vector R = r − r′ (from the
 * source to P), its unit vector R̂ and the field E = kq R̂/R² at P. Dragging O changes r and r′
 * but not R or E: the field cares only about where P is relative to the charge. Numbers from
 * coordinates.ts (`separation`, `coulombField`, `angleBetween`).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { angleBetween, coulombField, separation } from '~/physics/coordinates';
import type { Vec3 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from '../core/canvas';
import { arrow, chargeDisc, withAlpha } from '../core/ink';
import SimShell, { type TaskDef } from '../core/SimShell';
import { useTouched } from './touch';
import { degText, handle, label, num, sideLabel, vecText } from './draw';

const WORLD_W = 1.2;
const WORLD_H = 0.8;
const LIM_X = 0.56;
const LIM_Y = 0.36;
const Q_ABS = 2e-9;
/** the source and P never come closer than this [m] */
const CORE = 0.05;
const HIT_PX = 22;

type Which = 'o' | 'src' | 'p';
const ORDER: Which[] = ['o', 'src', 'p'];
const NAME_HE: Record<Which, string> = {
  o: 'הראשית O',
  src: 'המטען',
  p: 'הנקודה P',
};

const TASK_LABEL: Record<string, string> = {
  'move-origin': 'גררו את הראשית O למקום אחר. מה השתנה בקריאות, ומה לא?',
  'negative-q': 'הפכו את המטען לשלילי. מה קרה לווקטור ההפרדה R, ומה קרה ל-E?',
  'right-angle': 'הזיזו את P עד שהזווית בין r ל-R תהיה ישרה. מה שווה אז המכפלה הסקלרית שלהם?',
};

interface State {
  o: [number, number];
  src: [number, number];
  p: [number, number];
  sign: 1 | -1;
  selected: Which | null;
}

export interface SeparationSceneProps {
  id: string;
  tasks?: string[];
  origin?: [number, number];
  source?: [number, number];
  probe?: [number, number];
}

function initial(p: SeparationSceneProps): State {
  return {
    o: p.origin ?? [-0.45, -0.28],
    src: p.source ?? [0.25, -0.28],
    p: p.probe ?? [0.25, 0.22],
    sign: 1,
    selected: null,
  };
}

const sub = (a: [number, number], b: [number, number]): Vec3 => [a[0] - b[0], a[1] - b[1], 0];
const xy = (v: readonly number[]) => vecText([v[0], v[1]]);
const round2 = (x: number) => Math.round(x * 100) / 100;

export default function SeparationScene(props: SeparationSceneProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const start = useRef(initial(props).o);
  const drag = useRef<Which | null>(null);
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
          const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 ? [Number(v[0]), Number(v[1])] : null);
          next.o = pair(st.origin) ?? next.o;
          next.src = pair(st.source) ?? next.src;
          next.p = pair(st.probe) ?? next.p;
          if (st.sign === 1 || st.sign === -1) next.sign = st.sign;
          return next;
        });
      }),
    [props.id],
  );

  const q = s.sign * Q_ABS;
  const r = sub(s.p, s.o);
  const rp = sub(s.src, s.o);
  const sep = separation(r, rp);
  const E = coulombField(q, rp, r);
  const Emag = Math.hypot(E[0], E[1]);
  const lenR = Math.hypot(r[0], r[1]);
  const ang = lenR > 1e-9 && sep.dist > 1e-9 ? angleBetween(r, sep.vec) : NaN;
  const rDotR = r[0] * sep.vec[0] + r[1] * sep.vec[1];

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    if (!touched.current) return;
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (has('move-origin') && Math.hypot(s.o[0] - start.current[0], s.o[1] - start.current[1]) >= 0.1) done('move-origin');
    if (has('negative-q') && s.sign < 0) done('negative-q');
    if (has('right-angle') && lenR >= 0.05 && sep.dist >= 0.05 && Math.abs(ang - Math.PI / 2) < (2 * Math.PI) / 180) done('right-angle');
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const at = (v: readonly number[]) => toScreen(view, v[0], v[1]);
    const O = at(s.o);
    const S = at(s.src);
    const P = at(s.p);

    // axes through the movable origin
    ctx.save();
    ctx.strokeStyle = withAlpha(p.rule, 1);
    ctx.lineWidth = 1;
    const step = 0.1 * view.ppm;
    for (let x = O[0] % step; x < view.w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, view.h);
      ctx.stroke();
    }
    for (let y = O[1] % step; y < view.h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(view.w, y);
      ctx.stroke();
    }
    ctx.restore();
    arrow(ctx, 4, O[1], view.w - 4, O[1], {
      color: p.ink3,
      width: 1.3,
      head: 9,
    });
    arrow(ctx, O[0], view.h - 4, O[0], 4, {
      color: p.ink3,
      width: 1.3,
      head: 9,
    });
    label(ctx, 'x', view.w - 12, O[1] + 13, p.ink2, p, 14);
    label(ctx, 'y', O[0] + 13, 12, p.ink2, p, 14);

    // position vectors from O, and the separation vector from the source to P
    arrow(ctx, O[0], O[1], P[0], P[1], { color: p.ink2, width: 2, head: 11 });
    sideLabel(ctx, 'r', O[0], O[1], P[0], P[1], p.ink2, p, -13);
    arrow(ctx, O[0], O[1], S[0], S[1], {
      color: withAlpha(p.ink2, 0.75),
      width: 2,
      head: 11,
    });
    sideLabel(ctx, 'r′', O[0], O[1], S[0], S[1], p.ink2, p, 13);
    arrow(ctx, S[0], S[1], P[0], P[1], {
      color: p.accent,
      width: 3.4,
      head: 14,
    });
    sideLabel(ctx, 'R = r − r′', S[0], S[1], P[0], P[1], p.accent, p, 16);

    // E at P: direction exact, length compressed (√ of |E| / |E| at 30 cm)
    if (Emag > 0) {
      const ref = Math.abs(coulombField(Q_ABS, [0, 0, 0], [0.3, 0, 0])[0]);
      const len = Math.min(0.24, 0.11 * Math.sqrt(Emag / ref)) * view.ppm;
      const ux = E[0] / Emag;
      const uy = E[1] / Emag;
      arrow(ctx, P[0], P[1], P[0] + ux * len, P[1] - uy * len, {
        color: p.efield,
        width: 5,
        head: 15,
        alpha: 0.85,
      });
      // E's name on one side of its tip, R̂'s on the other, so the two never collide when they point the same way
      label(ctx, 'E', P[0] + ux * (len + 8) + uy * 15, P[1] - uy * (len + 8) + ux * 15, p.efield, p, 15);
      // the unit vector R̂: one tenth of a metre, thin
      const u = 0.1 * view.ppm;
      arrow(ctx, P[0], P[1], P[0] + sep.unit[0] * u, P[1] - sep.unit[1] * u, {
        color: p.ink,
        width: 1.6,
        head: 8,
      });
      label(ctx, 'R̂', P[0] + sep.unit[0] * u - sep.unit[1] * 15, P[1] - sep.unit[1] * u - sep.unit[0] * 15, p.ink, p, 13);
    }

    chargeDisc(ctx, S[0], S[1], 11, q, p, {
      selected: s.selected === 'src',
      label: `${s.sign > 0 ? '+' : '−'}2 nC`,
    });
    handle(ctx, P[0], P[1], p.accent, s.selected === 'p', p, 8);
    label(ctx, 'P', P[0] + 12, P[1] + 14, p.accent, p);
    handle(ctx, O[0], O[1], p.ink2, s.selected === 'o', p, 8);
    label(ctx, 'O', O[0] - 12, O[1] + 13, p.ink2, p);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    animate: false,
  });
  useEffect(invalidate, [s]);

  /** Snap to the centimetre grid inside the box; the source and P keep apart. */
  const place = (st: State, which: Which, x: number, y: number): State => {
    const w: [number, number] = [round2(Math.max(-LIM_X, Math.min(LIM_X, x))), round2(Math.max(-LIM_Y, Math.min(LIM_Y, y)))];
    const other = which === 'src' ? st.p : which === 'p' ? st.src : null;
    if (other && Math.hypot(w[0] - other[0], w[1] - other[1]) < CORE) return st;
    return { ...st, [which]: w };
  };

  const hit = (v: View, sx: number, sy: number): Which | null => {
    for (const k of ['p', 'src', 'o'] as Which[]) {
      const [x, y] = toScreen(v, s[k][0], s[k][1]);
      if (Math.hypot(sx - x, sy - y) < HIT_PX) return k;
    }
    return null;
  };

  const describe = (st: State) => {
    const rr = sub(st.p, st.o);
    const rrp = sub(st.src, st.o);
    const sp = separation(rr, rrp);
    const e = coulombField(st.sign * Q_ABS, rrp, rr);
    return `r הוא ${xy(rr)} מטר, r′ הוא ${xy(rrp)} מטר, R שווה r פחות r′ הוא ${xy(sp.vec)} מטר, באורך ${num(sp.dist)} מטר. השדה ב-P: ${xy(e)} ניוטון לקולון.`;
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
    setS((prev) => place(prev, d, x, y));
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const i = s.selected ? ORDER.indexOf(s.selected) : -1;
      const next = ORDER[(i + 1) % ORDER.length];
      setS((prev) => ({ ...prev, selected: next }));
      setLive(`נבחרה ${NAME_HE[next]}.`);
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
    const sel = s.selected ?? 'p';
    const step = e.shiftKey ? 0.05 : 0.01;
    setS((prev) => {
      const next = place({ ...prev, selected: sel }, sel, prev[sel][0] + d[0] * step, prev[sel][1] + d[1] * step);
      setLive(describe(next));
      return next;
    });
  };
  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  return (
    <div {...handlers}>
      <SimShell
        fig={props.id}
        label={`איור חי: מטען נקודתי, נקודת שדה P וראשית O שאפשר להזיז. ${describe(s)} גררו את O, את המטען או את P; במקלדת: רווח בוחר, חיצים מזיזים.`}
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
            <span class="q">r = {xy(r)} m</span>
            <span class="q">r′ = {xy(rp)} m</span>
            <b class="q">R = r − r′ = {xy(sep.vec)} m</b>
            <span class="q">|R| = {num(sep.dist)} m</span>
            <span class="q">R̂ = {xy(sep.unit)}</span>
            <b class="q">E = {xy(E)} N/C</b>
            <span class="q">|E| = {num(Emag)} N/C</span>
            <span>
              הזווית בין r ל-R: <span class="q">{Number.isNaN(ang) ? '—' : degText(ang)}</span>
            </span>
            <span class="q">r·R = {num(rDotR)} m²</span>
          </>
        }
        controls={
          <>
            <div class="group" role="group" aria-label="סימן המטען">
              {([1, -1] as const).map((k) => (
                <button
                  type="button"
                  key={k}
                  class={`toggle ${s.sign === k ? 'on' : ''}`}
                  aria-pressed={s.sign === k}
                  onClick={() => setS({ ...s, sign: k })}
                >
                  {k > 0 ? 'מטען חיובי' : 'מטען שלילי'}
                </button>
              ))}
            </div>
            <p class="hint hand">גררו את O, את המטען או את P.</p>
          </>
        }
      />
    </div>
  );
}
