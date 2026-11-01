/**
 * Work along a path: the learner drags a test charge q from A through the field, and the
 * figure sums the work the field does on it along the path actually dragged
 * (workAlongPath, src/physics/potential.ts). Every arrival at B is logged with its path length,
 * so two different paths show the same work: the field is conservative. Built for lesson 2.1.
 *
 * Modes: a uniform field (between large plates, pointing right) or one positive point charge.
 * The path is resampled every 2 mm, so the sum is a faithful line integral even when the
 * pointer jumps; near the point charge the test charge is kept out of a small core.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { fieldAt, type PointCharge } from '~/physics/electrostatics';
import { pairEnergy, pathLength, workAlongPath } from '~/physics/potential';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, chargeDisc, paperGrid, polyline, scaleBar, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Toggle, type TaskDef } from './core/SimShell';

const uC = 1e-6;
const nC = 1e-9;
const WORLD_W = 2;
const WORLD_H = 1.5;
const E_UNIFORM = 1e4;
const SOURCE: PointCharge = { x: -0.55, y: 0, q: 2 * uC };
const CORE = 0.1;
const RESAMPLE = 0.002;
const ARRIVE = 0.05;

export type WorkMode = 'uniform' | 'point';

const POINTS: Record<WorkMode, { A: Vec2; B: Vec2 }> = {
  uniform: { A: [-0.5, -0.15], B: [0.35, -0.15] },
  // A is 30 cm from the source, up and to the right, so the two labels do not collide
  point: { A: [-0.37, 0.24], B: [0.4, 0.25] },
};

const MODE_LABEL: Record<WorkMode, string> = {
  uniform: 'שדה אחיד',
  point: 'מטען נקודתי',
};

const TASK_LABEL: Record<string, string> = {
  'reach-b': 'גררו את המטען מ-A ל-B בקו ישר. קראו את העבודה של השדה.',
  'two-paths': 'חזרו ל-A והגיעו שוב ל-B בדרך ארוכה ומפותלת. השוו את שתי העבודות ברשימה.',
  perp: 'בשדה האחיד: גררו את המטען לאורך קו אנכי, בניצב לשדה. כמה עבודה עשה השדה?',
  loop: 'צאו מ-A לסיבוב ארוך, וחזרו ל-A. כמה עבודה עשה השדה בסך הכול?',
  closer: 'במטען הנקודתי: קרבו את מטען הבוחן אל מטען המקור. מה סימן העבודה של השדה?',
};

export interface WorkPathProps {
  id: string;
  mode?: WorkMode;
  /** test charge sign: +1 or −1 (1 nC) */
  sign?: 1 | -1;
  tasks?: string[];
}

interface Arrival {
  length: number;
  work: number;
}

interface State {
  mode: WorkMode;
  sign: 1 | -1;
  path: Vec2[];
  arrivals: Arrival[];
}

const fieldFor = (mode: WorkMode) =>
  mode === 'uniform' ? (_x: number, _y: number): Vec2 => [E_UNIFORM, 0] : (x: number, y: number) => fieldAt([SOURCE], x, y);

const fresh = (mode: WorkMode, sign: 1 | -1): State => ({ mode, sign, path: [POINTS[mode].A], arrivals: [] });

const workWords = (w: number) => (Math.abs(w) < 1e-9 ? 'W = 0' : `W = ${sci(w)} J`);

export default function WorkPath(props: WorkPathProps) {
  const [s, setS] = useState<State>(() => fresh(props.mode ?? 'uniform', props.sign ?? 1));
  const [live, setLive] = useState('');
  const dragging = useRef(false);
  // tasks tick only from the learner's own dragging, never from a text step
  const userMoved = useRef(false);
  const loopArmed = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userMoved.current = false;
        loopArmed.current = false;
        setS((prev) => {
          const mode = typeof st.mode === 'string' && st.mode in MODE_LABEL ? (st.mode as WorkMode) : prev.mode;
          const sign = st.sign === -1 || st.sign === 1 ? st.sign : prev.sign;
          if (mode === prev.mode && sign === prev.sign && st.reset !== true) return prev;
          return fresh(mode, sign);
        });
      }),
    [props.id],
  );

  const q = s.sign * nC;
  const field = fieldFor(s.mode);
  const pos = s.path[s.path.length - 1];
  const { A, B } = POINTS[s.mode];
  const W = workAlongPath(q, field, s.path);
  const L = pathLength(s.path);
  const fromA = Math.hypot(pos[0] - A[0], pos[1] - A[1]);
  const atB = Math.hypot(pos[0] - B[0], pos[1] - B[1]) < ARRIVE;
  const rSrc = Math.hypot(pos[0] - SOURCE.x, pos[1] - SOURCE.y);

  useEffect(() => {
    if (!userMoved.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (atB && has('reach-b')) done('reach-b');
    if (has('two-paths') && s.arrivals.length >= 2) {
      const lens = s.arrivals.map((a) => a.length);
      if (Math.max(...lens) > 1.5 * Math.min(...lens)) done('two-paths');
    }
    if (has('perp') && s.mode === 'uniform' && L > 0.3 && Math.abs(pos[0] - A[0]) < 0.03 && fromA > 0.25) done('perp');
    if (L > 0.6) loopArmed.current = true;
    if (has('loop') && loopArmed.current && fromA < ARRIVE) done('loop');
    if (has('closer') && s.mode === 'point' && rSrc < 0.18) done('closer');
  }, [s, props.id, props.tasks]);

  /** Append a dragged-to point, resampled every 2 mm and kept on the stage and out of the source core. */
  const moveTo = (target: Vec2) => {
    setS((prev) => {
      const clamp = (p: Vec2): Vec2 => {
        let x = Math.max(-0.95, Math.min(0.95, p[0]));
        let y = Math.max(-0.7, Math.min(0.7, p[1]));
        if (prev.mode === 'point') {
          const dx = x - SOURCE.x;
          const dy = y - SOURCE.y;
          const r = Math.hypot(dx, dy);
          if (r < CORE) {
            const k = CORE / (r || 1);
            x = SOURCE.x + (r ? dx * k : CORE);
            y = SOURCE.y + dy * k;
          }
        }
        return [x, y];
      };
      const last = prev.path[prev.path.length - 1];
      const end = clamp(target);
      const d = Math.hypot(end[0] - last[0], end[1] - last[1]);
      if (d < RESAMPLE / 2) return prev;
      const n = Math.max(1, Math.ceil(d / RESAMPLE));
      const add: Vec2[] = [];
      for (let i = 1; i <= n; i++) add.push(clamp([last[0] + ((end[0] - last[0]) * i) / n, last[1] + ((end[1] - last[1]) * i) / n]));
      const path = [...prev.path, ...add];
      let arrivals = prev.arrivals;
      const wasAtB = Math.hypot(last[0] - POINTS[prev.mode].B[0], last[1] - POINTS[prev.mode].B[1]) < ARRIVE;
      const nowAtB = Math.hypot(end[0] - POINTS[prev.mode].B[0], end[1] - POINTS[prev.mode].B[1]) < ARRIVE;
      if (nowAtB && !wasAtB) {
        const qq = prev.sign * nC;
        arrivals = [...arrivals, { length: pathLength(path), work: workAlongPath(qq, fieldFor(prev.mode), path) }].slice(-4);
      }
      return { ...prev, path, arrivals };
    });
  };

  const backToA = () => {
    loopArmed.current = false;
    setS((prev) => ({ ...prev, path: [POINTS[prev.mode].A] }));
    setLive('המטען חזר ל-A, והמסלול נמחק. רשימת ההגעות ל-B נשמרה.');
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p);

    // the field
    if (s.mode === 'uniform') {
      // rows at 0, ±0.3, ±0.6: A and B sit at y = −0.15, between two rows
      for (let gy = -0.6; gy <= 0.61; gy += 0.3) {
        for (let gx = -0.75; gx <= 0.76; gx += 0.3) {
          const [x0, y0] = toScreen(view, gx - 0.08, gy);
          const [x1, y1] = toScreen(view, gx + 0.08, gy);
          arrow(ctx, x0, y0, x1, y1, { color: withAlpha(p.efield, 0.55), width: 2, head: 8 });
        }
      }
      // the plates at the stage edges: + on the left, − on the right
      for (const [px, sign] of [
        [-0.97, 1],
        [0.97, -1],
      ] as const) {
        const [sx, sy0] = toScreen(view, px, 0.72);
        const [, sy1] = toScreen(view, px, -0.72);
        ctx.save();
        ctx.fillStyle = withAlpha(sign > 0 ? p.pos : p.neg, 0.4);
        ctx.fillRect(sx - 4, sy0, 8, sy1 - sy0);
        ctx.fillStyle = p.ink;
        ctx.font = `700 14px ${p.fontUi}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let y = 0.6; y > -0.7; y -= 0.3) {
          const [, gy] = toScreen(view, px, y);
          ctx.fillText(sign > 0 ? '+' : '−', sx + (sign > 0 ? 14 : -14), gy);
        }
        ctx.restore();
      }
    } else {
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI) / 8;
        const [x0, y0] = toScreen(view, SOURCE.x + 0.16 * Math.cos(a), SOURCE.y + 0.16 * Math.sin(a));
        const [x1, y1] = toScreen(view, SOURCE.x + 0.26 * Math.cos(a), SOURCE.y + 0.26 * Math.sin(a));
        arrow(ctx, x0, y0, x1, y1, { color: withAlpha(p.efield, 0.55), width: 2, head: 7 });
      }
      const [sx, sy] = toScreen(view, SOURCE.x, SOURCE.y);
      chargeDisc(ctx, sx, sy, 16, SOURCE.q, p, { label: 'Q = +2 μC' });
    }

    // A and B
    for (const [pt, name] of [
      [A, 'A'],
      [B, 'B'],
    ] as const) {
      const [x, y] = toScreen(view, pt[0], pt[1]);
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, ARRIVE * view.ppm, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = p.ink;
      ctx.font = `700 16px ${p.fontUi}`;
      // beside the circle, to its left: above it is where the test charge's label goes
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, x - ARRIVE * view.ppm - 4, y);
      ctx.restore();
    }

    // the path so far
    const pts = s.path.map((pt) => toScreen(view, pt[0], pt[1]));
    polyline(ctx, pts, p.accent, 2.5, { alpha: 0.85 });

    // the force on q
    const [ex, ey] = field(pos[0], pos[1]);
    const [fx, fy] = [q * ex, q * ey];
    const fMag = Math.hypot(fx, fy);
    const [cx, cy] = toScreen(view, pos[0], pos[1]);
    if (fMag > 0) {
      // arrow lengths scale with the stage, so the arrow stays on it at phone width
      const lenPx = Math.min(0.28 * view.ppm, 0.15 * view.ppm * Math.sqrt(fMag / (nC * E_UNIFORM)));
      arrow(ctx, cx, cy, cx + (fx / fMag) * lenPx, cy - (fy / fMag) * lenPx, { color: p.force, width: 3, head: 10 });
    }
    chargeDisc(ctx, cx, cy, 10, q, p);
    // the label goes above the test charge: below it, it would sit on the source charge's label
    ctx.save();
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = p.ink2;
    ctx.fillText(s.sign > 0 ? 'q = +1 nC' : 'q = −1 nC', cx - 4, cy - 12);
    ctx.restore();

    scaleBar(ctx, view, p);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const [px, py] = toScreen(v, pos[0], pos[1]);
    if (Math.hypot(e.offsetX - px, e.offsetY - py) < 26) {
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!dragging.current || !v) return;
    userMoved.current = true;
    moveTo(toWorld(v, e.offsetX, e.offsetY));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(`אורך המסלול ${Math.round(L * 100)} ס"מ. העבודה של השדה: ${workWords(W)}.`);
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d: Record<string, Vec2> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const dv = d[e.key];
    if (!dv) return;
    e.preventDefault();
    userMoved.current = true;
    moveTo([pos[0] + dv[0], pos[1] + dv[1]]);
  };

  const U = s.mode === 'point' ? pairEnergy(SOURCE.q, q, rSrc) : null;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${MODE_LABEL[s.mode]}, מטען בוחן ${s.sign > 0 ? 'חיובי' : 'שלילי'}. אורך המסלול ${Math.round(L * 100)} ס"מ, ${workWords(W)}. גררו את המטען; במקלדת: חיצים.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      cursor="grab"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onReset={() => {
        userMoved.current = false;
        loopArmed.current = false;
        setS(fresh(props.mode ?? 'uniform', props.sign ?? 1));
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            עבודת השדה מ-A עד כאן: <b class="q">{workWords(W)}</b>
          </span>
          <span>
            אורך המסלול: <b class="q">{Math.round(L * 100)} cm</b>
          </span>
          <span>
            שינוי האנרגיה הפוטנציאלית: <b class="q">ΔU = {Math.abs(W) < 1e-9 ? '0' : `${sci(-W)} J`}</b>
          </span>
          {U !== null && (
            <span>
              האנרגיה הפוטנציאלית של הזוג: <b class="q">U = {sci(U)} J</b>
            </span>
          )}
          {s.arrivals.length > 0 && (
            <span class="arrivals">
              הגעות ל-B:{' '}
              {s.arrivals.map((a, i) => (
                <b class="q" key={i}>
                  {Math.round(a.length * 100)} cm → {workWords(a.work)}
                  {i < s.arrivals.length - 1 ? ' · ' : ''}
                </b>
              ))}
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="סוג השדה">
            {(Object.keys(MODE_LABEL) as WorkMode[]).map((k) => (
              <button
                type="button"
                key={k}
                class={`toggle ${s.mode === k ? 'on' : ''}`}
                aria-pressed={s.mode === k}
                onClick={() => {
                  loopArmed.current = false;
                  setS(fresh(k, s.sign));
                }}
              >
                {MODE_LABEL[k]}
              </button>
            ))}
          </div>
          <Toggle
            label="מטען בוחן שלילי"
            on={s.sign < 0}
            onChange={(v) => {
              loopArmed.current = false;
              setS(fresh(s.mode, v ? -1 : 1));
            }}
          />
          <button type="button" class="btn" onClick={backToA}>
            חזרה ל-A
          </button>
        </>
      }
    />
  );
}
