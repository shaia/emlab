/**
 * Figure 4.5ב: a charge crosses a strip of uniform field. With a magnetic field (⊗ or ⊙) the force
 * stays perpendicular to the velocity, so the path bends while the speed never changes: a strong
 * field turns the charge back, a weak one lets it through, turned. Switch to an electric field
 * across the path and the same charge follows lesson 1.10's parabola and leaves faster. Circles
 * and their radius are lesson 4.6: this figure shows no radius on purpose.
 *
 * All positions, velocities and forces come from src/physics/field-strip.ts.
 */

import { useEffect, useState } from 'preact/hooks';
import { E_CHARGE, M_PROTON } from '~/physics/constants';
import { stripCrossing, stripForce, stripState, type StripField } from '~/physics/field-strip';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo } from '../core/canvas';
import { arrow, chargeDisc, depthField, handNote, paperGrid, polyline, withAlpha } from '../core/ink';
import { sci } from '../core/format';
import SimShell, { Slider, Toggle, type TaskDef } from '../core/SimShell';

export type FieldKind = 'B' | 'E';
export type Sign = 'pos' | 'neg';

const V0 = 1e6;
const D = 0.06;
const X_START = -0.14;
const X0 = 0.06;
const WORLD_W = 0.4;
const WORLD_H = 0.3;
/** levels of the strength slider: tesla for B, newton per coulomb for E */
const B_LEVELS = [0, 0.04, 0.08, 0.12, 0.16, 0.2, 0.25, 0.3, 0.4, 0.5];
const E_LEVELS = [0, 5e4, 1e5, 1.5e5, 2e5, 3e5, 4e5, 5e5, 6e5, 8e5];
/** physical seconds per second of animation */
const TIME_SCALE = 1e-7;
const T_APPROACH = -X_START / V0;
/** force arrows grow from 18 px by 30 px per this much force (lengths rank forces; they are not to scale) */
const F_REF = E_CHARGE * V0 * 0.2;

const TASK_LABEL: Record<string, string> = {
  'turn-back': 'הגבירו את השדה המגנטי עד שהחלקיק מסתובב וחוזר שמאלה.',
  negative: 'החליפו למטען שלילי. לאיזה צד הוא מתעקם?',
  electric: 'החליפו לשדה חשמלי. מה קורה עכשיו לגודל המהירות?',
};

export interface StripPathProps {
  id: string;
  field?: FieldKind;
  /** index into the strength levels, 0–9 */
  level?: number;
  sign?: Sign;
  /** direction of the magnetic field */
  bdir?: 'in' | 'out';
  tasks?: string[];
}

interface State {
  field: FieldKind;
  level: number;
  sign: Sign;
  bdir: 'in' | 'out';
}

const clampLevel = (n: number) => Math.max(0, Math.min(9, Math.round(n)));
const initial = (p: StripPathProps): State => ({
  field: p.field ?? 'B',
  level: clampLevel(p.level ?? 2),
  sign: p.sign ?? 'pos',
  bdir: p.bdir ?? 'in',
});

function physics(s: State) {
  const q = s.sign === 'pos' ? E_CHARGE : -E_CHARGE;
  const f: StripField =
    s.field === 'B' ? { kind: 'B', Bz: (s.bdir === 'in' ? -1 : 1) * B_LEVELS[s.level] } : { kind: 'E', Ey: E_LEVELS[s.level] };
  const c = stripCrossing(q, M_PROTON, f, V0, D);
  const exitSpeed = Math.hypot(c.exitVel[0], c.exitVel[1]);
  const turn = (Math.atan2(c.exitVel[1], c.exitVel[0]) * 180) / Math.PI;
  // run until the charge is well off the canvas
  const loop = T_APPROACH + c.tExit + 2.8e-7;
  return { q, f, c, exitSpeed, turn, loop };
}

const sideHe = (y: number) => (y > 0 ? 'למעלה' : 'למטה');

function outcomeText(s: State, ph: ReturnType<typeof physics>): string {
  const strength = s.field === 'B' ? B_LEVELS[s.level] : E_LEVELS[s.level];
  if (strength === 0) return 'אין שדה: החלקיק ממשיך ישר';
  if (s.field === 'E') return `החלקיק עובר את האזור, מוסט ${sideHe(ph.c.exitPos[1])}, ויוצא מהיר יותר`;
  if (ph.c.outcome === 'back') return `החלקיק מסתובב וחוזר שמאלה, ${sideHe(ph.c.exitPos[1])} מנקודת הכניסה`;
  return `החלקיק עובר את האזור, והמסלול שלו פונה ${sideHe(ph.c.exitPos[1])} ב-${Math.round(Math.abs(ph.turn))}°`;
}

export default function StripPath(props: StripPathProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) =>
        setS((prev) => ({
          field: st.field === 'B' || st.field === 'E' ? st.field : prev.field,
          level: typeof st.level === 'number' ? clampLevel(st.level) : prev.level,
          sign: st.sign === 'pos' || st.sign === 'neg' ? st.sign : prev.sign,
          bdir: st.bdir === 'in' || st.bdir === 'out' ? st.bdir : prev.bdir,
        })),
      ),
    [props.id],
  );

  const ph = physics(s);

  const checkTasks = (next: State) => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const n = physics(next);
    if (has('turn-back') && next.field === 'B' && next.level > 0 && n.c.outcome === 'back') done('turn-back');
    if (has('negative') && next.sign === 'neg' && next.level > 0) done('negative');
    if (has('electric') && next.field === 'E' && next.level > 0) done('electric');
  };

  const change = (patch: Partial<State>) => {
    const next = { ...s, ...patch };
    setS(next);
    checkTasks(next);
    setLive(outcomeText(next, physics(next)) + '.');
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const P = (x: number, y: number) => toScreen(view, x - X0, y);
    const { q, f, loop } = ph;
    const strength = s.field === 'B' ? B_LEVELS[s.level] : E_LEVELS[s.level];
    const partColor = q > 0 ? p.pos : p.neg;
    paperGrid(ctx, view, p, 0.02);

    // the strip
    const [sx1, sy1] = P(0, WORLD_H / 2);
    const [sx2, sy2] = P(D, -WORLD_H / 2);
    const fieldColor = s.field === 'B' ? p.bfield : p.efield;
    ctx.save();
    ctx.fillStyle = withAlpha(fieldColor, strength > 0 ? 0.08 : 0.03);
    ctx.fillRect(sx1, sy1, sx2 - sx1, sy2 - sy1);
    ctx.strokeStyle = withAlpha(fieldColor, 0.5);
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx1, sy2);
    ctx.moveTo(sx2, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    ctx.restore();
    if (strength > 0) {
      if (s.field === 'B') {
        depthField(ctx, { x: sx1, y: sy1, w: sx2 - sx1, h: sy2 - sy1 }, s.bdir, p.bfield, 26, 0.55);
      } else {
        const len = 14 + (s.level / 9) * 20;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 5; j++) {
            const x = sx1 + ((i + 0.5) * (sx2 - sx1)) / 2;
            const y = sy1 + ((j + 0.5) * (sy2 - sy1)) / 5;
            arrow(ctx, x, y + len / 2, x, y - len / 2, { color: p.efield, width: 1.6, head: 7, alpha: 0.6 });
          }
        }
      }
    }
    // the field's name above the strip
    ctx.save();
    ctx.font = `italic 700 15px ${p.fontUi}`;
    ctx.fillStyle = fieldColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tag = s.field === 'B' ? `B ${s.bdir === 'in' ? '⊗' : '⊙'}` : 'E ↑';
    const tw = ctx.measureText(tag).width + 12;
    const tx = (sx1 + sx2) / 2;
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = withAlpha(fieldColor, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(tx - tw / 2, sy1 + 8, tw, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = fieldColor;
    ctx.fillText(tag, tx, sy1 + 19);
    ctx.restore();

    // where it would go with no field
    {
      const [ax, ay] = P(X_START, 0);
      const [bx] = P(X0 + WORLD_W / 2, 0);
      polyline(ctx, [[ax, ay], [bx, ay]], p.ink3, 1, { dash: [4, 5], alpha: 0.6 });
    }

    // the path
    const pts: [number, number][] = [];
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const tt = -T_APPROACH + (loop * i) / N;
      const st = stripState(q, M_PROTON, f, V0, D, tt);
      pts.push(P(st.pos[0], st.pos[1]));
    }
    polyline(ctx, pts, partColor, 2, { alpha: 0.75 });

    // the charge now: at t = 0 (and in still mode) it is halfway through the strip
    const phase = (t * TIME_SCALE + T_APPROACH + 0.5 * ph.c.tExit) % loop;
    const tPhys = phase - T_APPROACH;
    const st = stripState(q, M_PROTON, f, V0, D, tPhys);
    const [px, py] = P(st.pos[0], st.pos[1]);
    const speed = Math.hypot(st.vel[0], st.vel[1]);
    const vl = Math.min(150, 46 * (speed / V0));
    const vx = (st.vel[0] / speed) * vl;
    const vy = -(st.vel[1] / speed) * vl;
    arrow(ctx, px, py, px + vx, py + vy, { color: p.ink, width: 2.4, head: 10 });
    label(ctx, 'v', px + vx * (1 + 14 / vl), py + vy * (1 + 14 / vl), p.ink, p.fontUi);
    const F = stripForce(q, M_PROTON, f, V0, D, tPhys);
    const Fm = Math.hypot(F[0], F[1]);
    if (Fm > 0) {
      const fl = Math.min(90, 18 + 30 * (Fm / F_REF));
      const fx = (F[0] / Fm) * fl;
      const fy = -(F[1] / Fm) * fl;
      arrow(ctx, px, py, px + fx, py + fy, { color: p.force, width: 2.6, head: 10 });
      label(ctx, 'F', px + fx * (1 + 14 / fl), py + fy * (1 + 14 / fl), p.force, p.fontUi);
      // a right-angle mark when F ⊥ v
      const cos = (F[0] * st.vel[0] + F[1] * st.vel[1]) / (Fm * speed);
      if (Math.abs(cos) < 1e-6) {
        const a = 9;
        const ux = vx / vl;
        const uy = vy / vl;
        const wx = fx / fl;
        const wy = fy / fl;
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px + ux * a, py + uy * a);
        ctx.lineTo(px + ux * a + wx * a, py + uy * a + wy * a);
        ctx.lineTo(px + wx * a, py + wy * a);
        ctx.stroke();
        ctx.restore();
      }
    }
    chargeDisc(ctx, px, py, 8, q, p);

    handNote(
      ctx,
      s.field === 'B' ? 'הכוח ניצב למהירות: הכיוון משתנה, הגודל לא' : 'הכוח לאורך השדה: המהירות גדלה',
      view.w / 2,
      view.h - 16,
      p,
      15,
    );
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: true });
  useEffect(invalidate, [s]);

  const levels = s.field === 'B' ? B_LEVELS : E_LEVELS;
  const strengthText = (i: number) => (s.field === 'B' ? `${sci(B_LEVELS[i])} T` : `${sci(E_LEVELS[i])} N/C`);
  const ratio = ph.exitSpeed / V0;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: חלקיק ${s.sign === 'pos' ? 'חיובי' : 'שלילי'} נכנס משמאל במהירות ${sci(V0)} מטר לשנייה לרצועה של שדה ${s.field === 'B' ? `מגנטי ${s.bdir === 'in' ? 'לתוך הדף' : 'החוצה מהדף'}` : 'חשמלי כלפי מעלה'}, בעוצמה ${strengthText(s.level)}. ${outcomeText(s, ph)}. גודל המהירות ביציאה פי ${ratio.toFixed(2)} ממהירות הכניסה.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(initial(props));
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            מהירות ביציאה: <b class="q">v = {sci(ph.exitSpeed)} m/s</b> (פי <b class="q">{ratio.toFixed(2)}</b> ממהירות הכניסה)
          </span>
          <span>
            <b>{outcomeText(s, ph)}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="סוג השדה">
            <Toggle label="שדה מגנטי" on={s.field === 'B'} swatch="var(--bfield)" onChange={() => change({ field: 'B' })} />
            <Toggle label="שדה חשמלי" on={s.field === 'E'} swatch="var(--efield)" onChange={() => change({ field: 'E' })} />
          </div>
          {s.field === 'B' && (
            <div class="group" role="group" aria-label="כיוון השדה המגנטי">
              <Toggle label="⊗ לתוך הדף" on={s.bdir === 'in'} swatch="var(--bfield)" onChange={() => change({ bdir: 'in' })} />
              <Toggle label="⊙ החוצה מהדף" on={s.bdir === 'out'} swatch="var(--bfield)" onChange={() => change({ bdir: 'out' })} />
            </div>
          )}
          <div class="group" role="group" aria-label="סימן המטען">
            <Toggle label="מטען חיובי (+)" on={s.sign === 'pos'} swatch="var(--pos)" onChange={() => change({ sign: 'pos' })} />
            <Toggle label="מטען שלילי (−)" on={s.sign === 'neg'} swatch="var(--neg)" onChange={() => change({ sign: 'neg' })} />
          </div>
          <Slider
            label={s.field === 'B' ? 'עוצמת השדה B' : 'עוצמת השדה E'}
            min={0}
            max={levels.length - 1}
            step={1}
            value={s.level}
            format={strengthText}
            onChange={(i) => change({ level: i })}
          />
        </>
      }
    />
  );
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, font: string) {
  ctx.save();
  ctx.font = `italic 700 15px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}
