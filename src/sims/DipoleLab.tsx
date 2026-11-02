/**
 * The electric dipole, built for lesson 6.10. Three scenes, each one numbered figure:
 *
 * - 'far': a dipole (±2 nC, 1 cm apart) and a point P on its axis (distance r from the positive
 *   charge) or on its perpendicular bisector (distance r from the centre). The zoom slider moves P
 *   from 0.02d to 300d and the view zooms with it: close to a charge it looks like that charge alone,
 *   far away the pair shrinks to a point and the dipole pattern appears. Beside it, a log-log graph
 *   of |E| against r with the lines kq/r² (slope −2) and 2kp/r³ or kp/r³ (slope −3), and the local
 *   slope at P (`logSlope`). The arrows show the direction of the exact field (`dipoleFieldExact`),
 *   their opacity its strength relative to the field at P.
 * - 'torque': a rigid dipole (±4 nC, 5 cm) in a uniform field of 3·10⁴ N/C. Turn it by dragging,
 *   with the keys or the slider; the forces ±qE, p, the angle θ, the torque τ = pE·sinθ and the
 *   energy U = −pE·cosθ (with its graph) are drawn and read out. "Release" lets it swing with a
 *   damping chosen for the eye; still mode shows where it comes to rest.
 * - 'slab': a dielectric slab between capacitor plates, its molecules drawn as small induced dipoles.
 *   Inside, neighbouring + and − ends cancel; the layers left on the two faces (σ_b) weaken the field
 *   to E₀/κ (`polarisedSlab`).
 *
 * Every number comes from src/physics/dipole.ts. The figure supports intuition; the 1/r³ law comes
 * from the derivation in the lesson.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { K } from '~/physics/constants';
import {
  axisFieldFar,
  axisFieldFromCharge,
  bisectorFieldExact,
  bisectorFieldFar,
  dipoleCharges,
  dipoleEnergy,
  dipoleFieldExact,
  dipoleMoment,
  dipoleTorqueZ,
  logSlope,
  polarisedSlab,
} from '~/physics/dipole';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, chargeDisc, chevron, handNote, withAlpha } from './core/ink';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot } from './core/plot';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type DipoleScene = 'far' | 'torque' | 'slab';
type Dir = 'axis' | 'bisector';

/* the far-field dipole: ±2 nC, 1 cm apart */
const FAR_Q = 2e-9;
const FAR_D = 0.01;
const FAR_P = dipoleMoment(FAR_Q, FAR_D);
const S_MIN = 0.02 * FAR_D;
const S_MAX = 300 * FAR_D;
/* the dipole in a uniform field: ±4 nC on a 5 cm rod, E = 3·10⁴ N/C */
const TQ_Q = 4e-9;
const TQ_D = 0.05;
const TQ_P = dipoleMoment(TQ_Q, TQ_D);
const TQ_E = 3e4;
/* the swing, for the eye: a period of about 1.5 s at small angles, lightly damped */
const OMEGA0 = (2 * Math.PI) / 1.5;
const INERTIA = (TQ_P * TQ_E) / (OMEGA0 * OMEGA0);
const DAMPING = 0.3 * INERTIA * OMEGA0;
/* the slab */
const KAPPAS = [1, 2, 3, 5];
const E0_MIN = 1e4;
const E0_MAX = 5e4;

const RAD = Math.PI / 180;
const ASPECT_WIDE = 1.6;
const ASPECT_TALL = 0.86;

const TASK_LABEL: Record<string, string> = {
  near: 'על הציר: קרבו את P אל המטען החיובי, עד שהשיפוע בגרף יהיה בערך ⁦−2⁩. איך נראה השדה באיור?',
  far: 'על הציר: הרחיקו את P עד שהשיפוע בגרף יהיה בערך ⁦−3⁩. איך נראה הדיפול עכשיו?',
  bisector: 'עברו לאנך האמצעי והרחיקו את P. האם גם שם השיפוע מגיע ל-⁦−3⁩?',
  'max-torque': 'סובבו את הדיפול למצב שבו המומנט הכי גדול.',
  unstable: 'סובבו את הדיפול כך ש-p יצביע נגד השדה. כמה המומנט שם, ומה האנרגיה?',
  release: 'הטו את הדיפול בזווית של ⁦20°⁩ לפחות, ושחררו אותו. איפה הוא נעצר?',
  bound: 'הראו את המטען שנשאר על פני החומר. היכן הוא, ומה סימנו בכל צד?',
  kappa: 'בחרו חומר עם ⁦κ = 5⁩. פי כמה נחלש השדה בתוכו?',
};

export interface DipoleLabProps {
  id: string;
  scene?: DipoleScene;
  /** far: distance of P [m] (from +q on the axis, from the centre on the bisector) */
  r?: number;
  dir?: Dir;
  refs?: boolean;
  /** torque: angle of p from E, degrees (counter-clockwise) */
  theta?: number;
  /** slab */
  E0?: number;
  kappa?: number;
  bound?: boolean;
  tasks?: string[];
}

interface State {
  scene: DipoleScene;
  r: number;
  dir: Dir;
  refs: boolean;
  theta: number;
  running: boolean;
  E0: number;
  kappa: number;
  bound: boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const fmtDeg = (d: number) => `${Math.round(d)}°`;
/** A length with a sensible unit: mm, cm or m. */
function fmtLen(m: number): string {
  if (m < 0.01) return `${sci(m * 1000)} mm`;
  if (m < 1) return `${sci(m * 100)} cm`;
  return `${sci(m)} m`;
}
/** A signed value with a true minus sign; anything below 10⁻⁹ of `scale` is written 0. */
const fmtSigned = (v: number, scale: number) => (Math.abs(v) < 1e-9 * scale ? '0' : v < 0 ? `−${sci(-v)}` : sci(v));
const fmtSlope = (s: number) => (s < 0 ? `−${Math.abs(s).toFixed(2)}` : s.toFixed(2));

/** Field at P (exact) and the point-dipole value, for the chosen line. */
function farValues(st: { r: number; dir: Dir }) {
  if (st.dir === 'axis') {
    const f = (s: number) => axisFieldFromCharge(FAR_Q, FAR_D, s);
    const R = st.r + FAR_D / 2;
    return { f, exact: f(st.r), approx: axisFieldFar(FAR_P, R), R, slope: logSlope(f, st.r) };
  }
  const f = (s: number) => bisectorFieldExact(FAR_Q, FAR_D, s);
  return { f, exact: f(st.r), approx: bisectorFieldFar(FAR_P, st.r), R: st.r, slope: logSlope(f, st.r) };
}

/** Where the scene and the graph go on a canvas of w×h. */
function layout(w: number, h: number, scene: DipoleScene): { main: Box; side: Box | null } {
  if (scene === 'slab') return { main: { x: 0, y: 0, w, h }, side: null };
  const split = scene === 'far' ? 0.52 : 0.6;
  if (w / h >= 1.25) return { main: { x: 0, y: 0, w: w * split, h }, side: { x: w * split, y: 0, w: w * (1 - split), h } };
  return { main: { x: 0, y: 0, w, h: h * 0.55 }, side: { x: 0, y: h * 0.55, w, h: h * 0.45 } };
}

export default function DipoleLab(props: DipoleLabProps) {
  const init = (): State => ({
    scene: props.scene ?? 'far',
    r: clamp(props.r ?? 0.2 * FAR_D, S_MIN, S_MAX),
    dir: props.dir ?? 'axis',
    refs: props.refs ?? true,
    theta: wrap180(props.theta ?? 50),
    running: false,
    E0: props.E0 ?? 3e4,
    kappa: props.kappa ?? 3,
    bound: props.bound ?? false,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const sRef = useRef(s);
  sRef.current = s;
  const rotor = useRef({ theta: s.theta * RAD, omega: 0 });
  const lastT = useRef<number | null>(null);
  const lastSync = useRef(0);
  const runStart = useRef(0);
  const userRun = useRef(false);
  const startAngle = useRef(0);
  const dragging = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => !!props.tasks?.includes(t);
  const done = (t: string) => has(t) && markTask(`${props.id}:${t}`);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userRun.current = false;
        lastT.current = null;
        setS((prev) => {
          const next: State = {
            ...prev,
            scene: st.scene === 'far' || st.scene === 'torque' || st.scene === 'slab' ? st.scene : prev.scene,
            r: typeof st.r === 'number' ? clamp(st.r, S_MIN, S_MAX) : prev.r,
            dir: st.dir === 'axis' || st.dir === 'bisector' ? st.dir : prev.dir,
            refs: typeof st.refs === 'boolean' ? st.refs : prev.refs,
            theta: typeof st.theta === 'number' ? wrap180(st.theta) : prev.theta,
            E0: typeof st.E0 === 'number' ? st.E0 : prev.E0,
            kappa: typeof st.kappa === 'number' ? st.kappa : prev.kappa,
            bound: typeof st.bound === 'boolean' ? st.bound : prev.bound,
            running: false,
          };
          rotor.current = { theta: next.theta * RAD, omega: 0 };
          return next;
        });
      }),
    [props.id],
  );

  /* ------------------------------------------------------------ describe */

  const describe = (st: State): string => {
    if (st.scene === 'far') {
      const v = farValues(st);
      const where = st.dir === 'axis' ? 'על הציר, במרחק' : 'על האנך האמצעי, במרחק';
      const from = st.dir === 'axis' ? 'מהמטען החיובי' : 'ממרכז הדיפול';
      return `הנקודה P ${where} ${fmtLen(st.r)} ${from}. עוצמת השדה ${sci(v.exact)} ניוטון לקולון. השיפוע בגרף הלוגריתמי ${fmtSlope(v.slope)}.`;
    }
    if (st.scene === 'torque') {
      const tau = dipoleTorqueZ(TQ_P, TQ_E, st.theta * RAD);
      const zero = Math.abs(tau) < 1e-3 * TQ_P * TQ_E;
      const sense = zero ? 'אין מומנט' : tau < 0 ? 'המומנט מסובב עם כיוון השעון' : 'המומנט מסובב נגד כיוון השעון';
      return `הזווית בין p לשדה ${fmtDeg(Math.abs(st.theta))}. המומנט ${zero ? '0' : sci(Math.abs(tau))} ניוטון-מטר: ${sense}. האנרגיה ${fmtSigned(dipoleEnergy(TQ_P, TQ_E, st.theta * RAD), TQ_P * TQ_E)} ג׳אול.`;
    }
    const sl = polarisedSlab(st.E0, st.kappa);
    return `חומר עם מקדם דיאלקטרי ${st.kappa} בשדה ${sci(st.E0)} ניוטון לקולון. בתוך החומר השדה ${sci(sl.E)} ניוטון לקולון.`;
  };

  const set = (patch: Partial<State>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (patch.theta !== undefined || patch.scene !== undefined) {
        rotor.current = { theta: next.theta * RAD, omega: 0 };
        lastT.current = null;
      }
      setLive(describe(next));
      return next;
    });
  };

  /* ------------------------------------------------------- far: actions */

  const moveTo = (r: number, dir = sRef.current.dir) => {
    const rr = clamp(r, S_MIN, S_MAX);
    set({ r: rr, dir });
    const v = farValues({ r: rr, dir });
    if (dir === 'axis' && Math.abs(v.slope + 2) < 0.05) done('near');
    if (dir === 'axis' && Math.abs(v.slope + 3) < 0.1) done('far');
    if (dir === 'bisector' && Math.abs(v.slope + 3) < 0.05) done('bisector');
  };

  /* ---------------------------------------------------- torque: actions */

  const turnTo = (deg: number) => {
    userRun.current = false;
    const th = wrap180(deg);
    set({ theta: th, running: false });
    if (Math.abs(Math.abs(th) - 90) <= 2) done('max-torque');
    if (Math.abs(th) >= 178) done('unstable');
  };

  const release = () => {
    const st = sRef.current;
    if (st.running) {
      set({ running: false });
      return;
    }
    userRun.current = true;
    startAngle.current = Math.abs(st.theta);
    lastT.current = null;
    rotor.current = { theta: st.theta * RAD, omega: 0 };
    const balanced = Math.abs(Math.sin(st.theta * RAD)) < 1e-6;
    if (!motionAllowed()) {
      if (!balanced) {
        set({ theta: 0, running: false });
        finishSettle();
      }
      setLive(balanced ? 'הדיפול בשיווי משקל ונשאר במקומו.' : 'מצב שקט: הדיפול מוצג במקום שבו הוא נעצר, כש-p בכיוון השדה.');
      return;
    }
    runStart.current = -1;
    set({ running: true });
  };

  const finishSettle = () => {
    if (userRun.current && startAngle.current >= 20) done('release');
  };

  /* ---------------------------------------------------------------- draw */

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const st = sRef.current;
    if (st.scene === 'torque' && st.running) {
      const prevT = lastT.current;
      lastT.current = t;
      if (runStart.current < 0) runStart.current = t;
      const dt = prevT === null ? 0 : Math.min(0.05, Math.max(0, t - prevT));
      if (dt > 0) {
        const n = Math.max(1, Math.ceil(dt / (1 / 480)));
        const h = dt / n;
        for (let k = 0; k < n; k++) {
          const r = rotor.current;
          const tau = dipoleTorqueZ(TQ_P, TQ_E, r.theta) - DAMPING * r.omega;
          const omega = r.omega + (tau / INERTIA) * h;
          rotor.current = { theta: r.theta + omega * h, omega };
        }
        const r = rotor.current;
        const thDeg = wrap180(r.theta / RAD);
        const settled = Math.abs(r.omega) < 0.02 && Math.abs(thDeg) < 0.5;
        const stuck = Math.abs(r.omega) < 1e-6 && t - runStart.current > 1.5;
        if (settled || stuck || t - lastSync.current > 0.1) {
          lastSync.current = t;
          if (settled || stuck) {
            const rest = settled ? 0 : thDeg;
            rotor.current = { theta: rest * RAD, omega: 0 };
            setS((prev) => ({ ...prev, theta: rest, running: false }));
            if (settled) finishSettle();
            setLive(
              settled
                ? 'הדיפול נעצר כש-p בכיוון השדה: שיווי משקל יציב.'
                : 'הדיפול נשאר במקומו: המומנט אפס. הזיזו אותו מעט ושחררו שוב.',
            );
          } else {
            setS((prev) => (prev.running ? { ...prev, theta: thDeg } : prev));
          }
        }
      }
    } else {
      lastT.current = null;
    }

    const { main, side } = layout(view.w, view.h, st.scene);
    ctx.save();
    ctx.beginPath();
    ctx.rect(main.x, main.y, main.w, main.h);
    ctx.clip();
    if (st.scene === 'far') drawFar(ctx, p, st, main);
    else if (st.scene === 'torque') drawTorque(ctx, p, st.running ? rotor.current.theta : st.theta * RAD, main);
    else drawSlab(ctx, p, st, main);
    ctx.restore();
    if (side) {
      ctx.save();
      ctx.strokeStyle = p.rule;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      if (side.x > 0) {
        ctx.moveTo(side.x, 14);
        ctx.lineTo(side.x, view.h - 14);
      } else {
        ctx.moveTo(14, side.y);
        ctx.lineTo(view.w - 14, side.y);
      }
      ctx.stroke();
      ctx.restore();
      if (st.scene === 'far') drawLogLog(ctx, p, st, side);
      else drawEnergy(ctx, p, st.running ? rotor.current.theta : st.theta * RAD, side);
    }
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: ASPECT_WIDE, worldHeight: 1, animate: s.running });
  useEffect(invalidate, [s]);
  const [tall, setTall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px)');
    const on = () => setTall(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  /* --------------------------------------------------------------- input */

  const pointerAngle = (e: PointerEvent): number | null => {
    const v = viewRef.current;
    if (!v) return null;
    const { main } = layout(v.w, v.h, sRef.current.scene);
    const el = e.currentTarget as HTMLCanvasElement;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px < main.x || px > main.x + main.w || py < main.y || py > main.y + main.h) return null;
    const x = px - (main.x + main.w / 2);
    const y = -(py - (main.y + main.h / 2));
    if (Math.hypot(x, y) < 10) return null;
    return Math.atan2(y, x) / RAD;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (sRef.current.scene !== 'torque') return;
    const a = pointerAngle(e);
    if (a === null) return;
    dragging.current = true;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
    turnTo(a);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const a = pointerAngle(e);
    if (a !== null) turnTo(a);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const st = sRef.current;
    if (st.scene === 'torque') {
      const step = e.shiftKey ? 15 : 5;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') turnTo(st.theta + step);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') turnTo(st.theta - step);
      else if (e.key === ' ' || e.key === 'Enter') release();
      else return;
    } else if (st.scene === 'far') {
      const f = e.shiftKey ? 2 : 1.25;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') moveTo(st.r * f);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') moveTo(st.r / f);
      else return;
    } else return;
    e.preventDefault();
  };

  /* ------------------------------------------------------------- readout */

  let readout;
  let controls;
  if (s.scene === 'far') {
    const v = farValues(s);
    const err = v.exact / v.approx - 1;
    readout = (
      <>
        <span>
          {s.dir === 'axis' ? 'המרחק מהמטען החיובי' : 'המרחק מהמרכז'}: <b class="q">r = {fmtLen(s.r)}</b>{' '}
          (<b class="q">{sci(s.r / FAR_D)}d</b>)
        </span>
        <span>
          השדה המדויק ב-P: <b class="q">|E| = {sci(v.exact)} N/C</b>
        </span>
        <span>
          {s.dir === 'axis' ? 'קירוב הדיפול, עם R המרחק מהמרכז' : 'קירוב הדיפול'}:{' '}
          <b class="q">{s.dir === 'axis' ? `2kp/R³ = ${sci(v.approx)} N/C` : `kp/r³ = ${sci(v.approx)} N/C`}</b>
        </span>
        <span>
          ההפרש בין המדויק לקירוב: <b class="q">{Math.abs(err) >= 10 ? `פי ${sci(v.exact / v.approx, 2)}` : `${sci(Math.abs(err) * 100, 2)}%`}</b>
        </span>
        <span>
          השיפוע בגרף ב-P: <b class="q">{fmtSlope(v.slope)}</b>
        </span>
      </>
    );
    controls = (
      <>
        <div class="group" role="group" aria-label="איפה הנקודה P">
          {(
            [
              ['axis', 'על הציר'],
              ['bisector', 'על האנך האמצעי'],
            ] as const
          ).map(([d, label]) => (
            <button type="button" key={d} class={`toggle ${s.dir === d ? 'on' : ''}`} aria-pressed={s.dir === d} onClick={() => moveTo(s.r, d)}>
              {label}
            </button>
          ))}
          <Toggle label="קווי השוואה" on={s.refs} swatch="var(--accent)" onChange={(v) => set({ refs: v })} />
        </div>
        <Slider
          label="זום: המרחק של P"
          value={Math.log10(s.r)}
          min={Math.log10(S_MIN)}
          max={Math.log10(S_MAX)}
          step={0.01}
          format={(u) => fmtLen(10 ** u)}
          onChange={(u) => moveTo(10 ** u)}
        />
      </>
    );
  } else if (s.scene === 'torque') {
    const th = s.theta * RAD;
    const tau = dipoleTorqueZ(TQ_P, TQ_E, th);
    const zero = Math.abs(tau) < 1e-3 * TQ_P * TQ_E;
    readout = (
      <>
        <span>
          הזווית בין p לשדה: <b class="q">θ = {fmtDeg(Math.abs(s.theta))}</b>
        </span>
        <span>
          על כל מטען: <b class="q">qE = {sci(TQ_Q * TQ_E)} N</b>, והכוח השקול <b class="q">0</b>
        </span>
        <span>
          <b class="q">τ = pE·sinθ = {zero ? '0' : sci(Math.abs(tau))} N·m</b>
          {zero ? '' : tau < 0 ? ', עם כיוון השעון' : ', נגד כיוון השעון'}
        </span>
        <span>
          <b class="q">U = −pE·cosθ = {fmtSigned(dipoleEnergy(TQ_P, TQ_E, th), TQ_P * TQ_E)} J</b>
        </span>
      </>
    );
    controls = (
      <>
        <div class="group" role="group" aria-label="פעולות">
          <button type="button" class={`toggle ${s.running ? 'on' : ''}`} aria-pressed={s.running} onClick={release}>
            {s.running ? 'עצרו' : 'שחררו את הדיפול'}
          </button>
        </div>
        <Slider label="הזווית θ" value={s.theta} min={-180} max={180} step={1} format={(d) => fmtDeg(d)} onChange={(d) => turnTo(d)} />
      </>
    );
  } else {
    const sl = polarisedSlab(s.E0, s.kappa);
    readout = (
      <>
        <span>
          השדה של הלוחות: <b class="q">E₀ = {sci(s.E0)} N/C</b>
        </span>
        <span>
          בתוך החומר: <b class="q">E = E₀/κ = {sci(sl.E)} N/C</b>
        </span>
        <span>
          המטען שנשאר על כל פן: <b class="q">σ = {sl.sigmaBound === 0 ? '0' : sci(sl.sigmaBound)} C/m²</b>
        </span>
      </>
    );
    controls = (
      <>
        <div class="group" role="group" aria-label="המקדם הדיאלקטרי">
          {KAPPAS.map((k) => (
            <button
              type="button"
              key={k}
              class={`toggle ${s.kappa === k ? 'on' : ''}`}
              aria-pressed={s.kappa === k}
              onClick={() => {
                set({ kappa: k });
                if (k === 5) done('kappa');
              }}
            >
              {k === 1 ? 'בלי חומר' : `κ = ${k}`}
            </button>
          ))}
          <Toggle
            label="המטען שעל פני החומר"
            on={s.bound}
            swatch="var(--pos)"
            onChange={(v) => {
              set({ bound: v });
              if (v) done('bound');
            }}
          />
        </div>
        <Slider label="השדה של הלוחות" value={s.E0} min={E0_MIN} max={E0_MAX} step={1000} format={(v) => `${sci(v)} N/C`} onChange={(v) => set({ E0: v })} />
      </>
    );
  }

  const label =
    s.scene === 'far'
      ? `איור חי: דיפול ונקודה P, וגרף לוגריתמי של עוצמת השדה מול המרחק. ${describe(s)} במקלדת: חיצים מקרבים ומרחיקים את P.`
      : s.scene === 'torque'
        ? `איור חי: דיפול בשדה חשמלי אחיד, וגרף האנרגיה מול הזווית. ${describe(s)} במקלדת: חיצים מסובבים את הדיפול, רווח משחרר אותו.`
        : `איור חי: חומר מבודד בין לוחות קבל, ומולקולות שהפכו לדיפולים קטנים. ${describe(s)}`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={s.scene === 'slab' ? 1.5 : tall ? ASPECT_TALL : ASPECT_WIDE}
      live={live}
      tasks={tasks}
      cursor={s.scene === 'torque' ? 'grab' : 'default'}
      onReset={() => {
        userRun.current = false;
        const st = init();
        rotor.current = { theta: st.theta * RAD, omega: 0 };
        setS(st);
        setLive('האיור אופס.');
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      readout={readout}
      controls={controls}
    />
  );
}

/** A short Hebrew label in the UI font (graph annotations: data, not a handwritten note). */
function uiNote(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, p: Palette, size = 13) {
  ctx.save();
  ctx.font = `600 ${size}px ${p.fontUi}`;
  ctx.fillStyle = p.hand;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* ======================================================= the far scene */

/** A 1-2-5 length near `target` [m], for the scale bar. */
function niceLength(target: number): number {
  const e = Math.floor(Math.log10(target));
  const m = target / 10 ** e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * 10 ** e;
}

function drawFar(ctx: CanvasRenderingContext2D, p: Palette, st: State, b: Box) {
  const r = st.r;
  // the window follows P: around the positive charge on the axis, around the centre on the bisector
  const axis = st.dir === 'axis';
  const cx = axis ? FAR_D / 2 - 0.3 * r : 0;
  const cy = axis ? 0 : 0.3 * r;
  const halfW = axis ? 1.55 * r : 0.9 * r;
  const halfH = axis ? 0.9 * r : 1.6 * r;
  const ppm = Math.min(b.w / (2 * halfW), b.h / (2 * halfH));
  const X = (x: number) => b.x + b.w / 2 + (x - cx) * ppm;
  const Y = (y: number) => b.y + b.h / 2 - (y - cy) * ppm;
  const toW = (sx: number, sy: number): [number, number] => [cx + (sx - b.x - b.w / 2) / ppm, cy - (sy - b.y - b.h / 2) / ppm];

  const charges = dipoleCharges(FAR_Q, FAR_D);
  const P: [number, number] = axis ? [FAR_D / 2 + r, 0] : [0, r];
  const Ep = Math.hypot(...dipoleFieldExact(FAR_Q, FAR_D, P[0], P[1]));
  const sepPx = FAR_D * ppm;
  // charge positions on screen (drawn apart, not to scale, when the pair is smaller than a few pixels)
  const compact = sepPx < 22;
  const ccx = X(0);
  const ccy = Y(0);
  const plusS: [number, number] = compact ? [ccx + 9, ccy] : [X(charges[0].x), Y(charges[0].y)];
  const minusS: [number, number] = compact ? [ccx - 9, ccy] : [X(charges[1].x), Y(charges[1].y)];

  // the direction field
  const step = clamp(Math.min(b.w, b.h) / 11, 22, 34);
  const L = step * 0.62;
  for (let sy = b.y + step / 2; sy < b.y + b.h; sy += step) {
    for (let sx = b.x + step / 2; sx < b.x + b.w; sx += step) {
      if (Math.hypot(sx - plusS[0], sy - plusS[1]) < 16 || Math.hypot(sx - minusS[0], sy - minusS[1]) < 16) continue;
      if (compact && Math.hypot(sx - ccx, sy - ccy) < 22) continue;
      const [wx, wy] = toW(sx, sy);
      const E = dipoleFieldExact(FAR_Q, FAR_D, wx, wy);
      const m = Math.hypot(E[0], E[1]);
      if (!(m > 0)) continue;
      const ux = E[0] / m;
      const uy = -E[1] / m;
      const a = clamp(0.45 + 0.25 * Math.log10(m / Ep), 0.1, 1);
      arrow(ctx, sx - (ux * L) / 2, sy - (uy * L) / 2, sx + (ux * L) / 2, sy + (uy * L) / 2, { color: p.efield, width: 1.6, head: 6, alpha: a });
    }
  }

  // the line from the reference point to P, with r
  const ref: [number, number] = axis ? plusS : [ccx, ccy];
  const Ps: [number, number] = [X(P[0]), Y(P[1])];
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.3;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(ref[0], ref[1]);
  ctx.lineTo(Ps[0], Ps[1]);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.font = `italic 600 13px ${p.fontUi}`;
  ctx.fillStyle = p.ink;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = axis ? 'bottom' : 'middle';
  if (axis) ctx.fillText('r', (ref[0] + Ps[0]) / 2, ref[1] - 8);
  else ctx.fillText('r', ref[0] + 12, (ref[1] + Ps[1]) / 2);
  ctx.restore();

  // the charges
  if (compact) {
    chargeDisc(ctx, minusS[0], minusS[1], 6, -1, p);
    chargeDisc(ctx, plusS[0], plusS[1], 6, 1, p);
    handNote(ctx, 'הדיפול, מוגדל', ccx, ccy + 26, p, 13);
  } else {
    const cr = clamp(sepPx * 0.16, 7, 13);
    chargeDisc(ctx, minusS[0], minusS[1], cr, -1, p);
    chargeDisc(ctx, plusS[0], plusS[1], cr, 1, p);
  }

  // P
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(Ps[0], Ps[1], 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = `italic 700 14px ${p.fontUi}`;
  ctx.fillStyle = p.ink;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('P', Ps[0] + 7, Ps[1] - 6);
  ctx.restore();

  // scale bar
  const len = niceLength((halfW * 2) / 4);
  const Lpx = len * ppm;
  const x0 = b.x + 14;
  const y0 = b.y + b.h - 14;
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 4);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + Lpx, y0);
  ctx.lineTo(x0 + Lpx, y0 - 4);
  ctx.stroke();
  ctx.font = `12px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(fmtLen(len), x0 + Lpx / 2, y0 - 5);
  ctx.restore();
}

function drawLogLog(ctx: CanvasRenderingContext2D, p: Palette, st: State, b: Box) {
  const axis = st.dir === 'axis';
  const box = insetBox(b, { l: 58, r: 14, t: 14, b: 46 });
  const plot = makePlot(
    box,
    { min: S_MIN, max: S_MAX, scale: 'log', label: axis ? 'r: המרחק מהמטען החיובי (m)' : 'r: המרחק מהמרכז (m)' },
    { min: 1e-3, max: 1e9, scale: 'log', label: '|E| (N/C)', ticks: [1e-3, 1, 1e3, 1e6, 1e9] },
  );
  drawAxes(ctx, plot, p);
  const v = farValues(st);
  const near = (s: number) => (K * FAR_Q) / (s * s);
  const farLine = (s: number) => (axis ? axisFieldFar(FAR_P, s) : bisectorFieldFar(FAR_P, s));
  if (st.refs) {
    drawCurve(ctx, plot, near, { color: p.ink3, width: 1.6, dash: [6, 5] });
    drawCurve(ctx, plot, farLine, { color: p.accent, width: 1.8, dash: [6, 5] });
  }
  drawCurve(ctx, plot, v.f, { color: p.efield, width: 2.6 });
  drawMarker(ctx, plot, st.r, v.exact, p.efield, { guides: true, radius: 5 });
  if (st.refs) {
    ctx.save();
    ctx.font = `italic 600 12px ${p.fontUi}`;
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    const xr = S_MAX * 0.5;
    ctx.fillStyle = p.ink2;
    ctx.textBaseline = 'bottom';
    ctx.fillText('kq/r²  (−2)', plot.px(xr), plot.py(near(xr)) - 4);
    ctx.fillStyle = p.accent;
    ctx.textBaseline = 'top';
    ctx.fillText(`${axis ? '2kp' : 'kp'}/r³  (−3)`, plot.px(xr), plot.py(farLine(xr)) + 6);
    ctx.restore();
  }
}

/* ===================================================== the torque scene */

function drawTorque(ctx: CanvasRenderingContext2D, p: Palette, theta: number, b: Box) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // the uniform field: horizontal lines, left to right
  const gap = clamp(b.h / 6, 30, 48);
  ctx.save();
  ctx.strokeStyle = withAlpha(p.efield, 0.55);
  ctx.lineWidth = 1.4;
  for (let y = cy - Math.floor(b.h / 2 / gap) * gap; y < b.y + b.h; y += gap) {
    if (y < b.y + 4) continue;
    ctx.beginPath();
    ctx.moveTo(b.x, y);
    ctx.lineTo(b.x + b.w, y);
    ctx.stroke();
    for (let x = b.x + gap * 1.2; x < b.x + b.w; x += gap * 3) chevron(ctx, x, y, 1, 0, 6, withAlpha(p.efield, 0.8));
  }
  ctx.restore();
  ctx.save();
  ctx.font = `italic 700 15px ${p.fontUi}`;
  ctx.fillStyle = p.efield;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('E →', b.x + 10, b.y + 8);
  ctx.restore();

  const half = Math.min(b.w, b.h) * 0.27;
  const ux = Math.cos(theta);
  const uy = -Math.sin(theta);
  const plus: [number, number] = [cx + ux * half, cy + uy * half];
  const minus: [number, number] = [cx - ux * half, cy - uy * half];
  // the rod
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(minus[0], minus[1]);
  ctx.lineTo(plus[0], plus[1]);
  ctx.stroke();
  ctx.restore();
  // the angle θ, from the direction of E to p
  const tDeg = wrap180(theta / RAD);
  if (Math.abs(tDeg) > 2) {
    ctx.save();
    ctx.strokeStyle = p.hand;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + half * 0.75, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, half * 0.45, 0, -tDeg * RAD, tDeg > 0);
    ctx.stroke();
    ctx.restore();
    const mid = (-tDeg * RAD) / 2;
    handNote(ctx, 'θ', cx + Math.cos(mid) * half * 0.6, cy + Math.sin(mid) * half * 0.6, p, 16);
  }
  // p, beside the rod, from − to +
  const nx = -uy;
  const ny = ux;
  const off = 22;
  arrow(ctx, minus[0] + nx * off + ux * 14, minus[1] + ny * off + uy * 14, plus[0] + nx * off - ux * 14, plus[1] + ny * off - uy * 14, {
    color: p.ink,
    width: 2.2,
    head: 10,
  });
  ctx.save();
  ctx.font = `italic 700 15px ${p.fontUi}`;
  ctx.fillStyle = p.ink;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('p', cx + nx * (off + 14), cy + ny * (off + 14));
  ctx.restore();
  // the forces ±qE
  const F = clamp(half * 0.55, 34, 70);
  arrow(ctx, plus[0], plus[1], plus[0] + F, plus[1], { color: p.force, width: 3, head: 11 });
  arrow(ctx, minus[0], minus[1], minus[0] - F, minus[1], { color: p.force, width: 3, head: 11 });
  ctx.save();
  ctx.font = `italic 600 13px ${p.fontUi}`;
  ctx.fillStyle = p.force;
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('qE', plus[0] + F * 0.6, plus[1] - 8);
  ctx.fillText('qE', minus[0] - F * 0.6, minus[1] - 8);
  ctx.restore();
  chargeDisc(ctx, minus[0], minus[1], 13, -1, p);
  chargeDisc(ctx, plus[0], plus[1], 13, 1, p);
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // the torque: a curved arrow whose length grows with |sin θ|
  const tau = dipoleTorqueZ(TQ_P, TQ_E, theta);
  const frac = Math.abs(tau) / (TQ_P * TQ_E);
  if (frac > 0.02) {
    const R = half + 30;
    const span = 0.25 + 1.0 * frac;
    const start = -Math.PI / 2 - 0.9;
    // canvas angles run clockwise; τ < 0 is clockwise
    const cw = tau < 0;
    const a0 = start;
    const a1 = cw ? start + span : start - span;
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1, !cw);
    ctx.stroke();
    ctx.restore();
    const hx = cx + R * Math.cos(a1);
    const hy = cy + R * Math.sin(a1);
    const tx = cw ? -Math.sin(a1) : Math.sin(a1);
    const ty = cw ? Math.cos(a1) : -Math.cos(a1);
    arrow(ctx, hx - tx * 12, hy - ty * 12, hx + tx * 2, hy + ty * 2, { color: p.accent, width: 2.6, head: 11 });
    ctx.save();
    ctx.font = `italic 700 14px ${p.fontUi}`;
    ctx.fillStyle = p.accent;
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('τ', cx + (R + 14) * Math.cos(start), cy + (R + 14) * Math.sin(start));
    ctx.restore();
  }
}

function drawEnergy(ctx: CanvasRenderingContext2D, p: Palette, theta: number, b: Box) {
  const box = insetBox(b, { l: 58, r: 14, t: 18, b: 46 });
  const pE = TQ_P * TQ_E;
  const plot = makePlot(
    box,
    { min: -180, max: 180, label: 'θ (°)', ticks: [-180, -90, 0, 90, 180], format: (v) => String(v) },
    { min: -1.3 * pE * 1e6, max: 1.3 * pE * 1e6, label: 'U (μJ)', ticks: [-6, -3, 0, 3, 6], format: (v) => (v < 0 ? `−${-v}` : String(v)) },
  );
  drawAxes(ctx, plot, p);
  drawCurve(ctx, plot, (deg) => dipoleEnergy(TQ_P, TQ_E, deg * RAD) * 1e6, { color: p.efield, width: 2.4 });
  const tDeg = wrap180(theta / RAD);
  drawMarker(ctx, plot, tDeg, dipoleEnergy(TQ_P, TQ_E, theta) * 1e6, p.ink, { radius: 6 });
  uiNote(ctx, 'יציב', plot.px(0), plot.py(-pE * 1e6) - 14, p);
  uiNote(ctx, 'רופף', plot.px(-150), plot.py(pE * 1e6) + 14, p);
  uiNote(ctx, 'רופף', plot.px(150), plot.py(pE * 1e6) + 14, p);
}

/* ======================================================= the slab scene */

function drawSlab(ctx: CanvasRenderingContext2D, p: Palette, st: State, b: Box) {
  const sl = polarisedSlab(st.E0, st.kappa);
  const plateW = 12;
  const left = b.x + 26;
  const right = b.x + b.w - 26 - plateW;
  const top = b.y + 22;
  const bottom = b.y + b.h - 22;
  // the plates: + on the left, − on the right
  ctx.save();
  ctx.fillStyle = withAlpha(p.pos, 0.85);
  ctx.fillRect(left, top, plateW, bottom - top);
  ctx.fillStyle = withAlpha(p.neg, 0.85);
  ctx.fillRect(right, top, plateW, bottom - top);
  ctx.restore();
  for (let y = top + 18; y < bottom - 8; y += 30) {
    chargeDisc(ctx, left + plateW / 2, y, 5.5, 1, p);
    chargeDisc(ctx, right + plateW / 2, y, 5.5, -1, p);
  }
  // the slab
  const gapW = (right - left - plateW) * 0.2;
  const sx0 = left + plateW + gapW;
  const sx1 = right - gapW;
  const empty = st.kappa === 1;
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  if (empty) ctx.setLineDash([5, 5]);
  else {
    ctx.fillStyle = withAlpha(p.ink3, 0.12);
    ctx.fillRect(sx0, top, sx1 - sx0, bottom - top);
  }
  ctx.strokeRect(sx0, top, sx1 - sx0, bottom - top);
  ctx.restore();

  // field arrows: E₀ in the gaps, E₀/κ inside
  const maxLen = gapW * 0.85;
  const lenOut = maxLen * (st.E0 / E0_MAX);
  const lenIn = lenOut / st.kappa;
  for (let y = top + 34; y < bottom - 20; y += 60) {
    for (const xm of [left + plateW + gapW / 2]) arrow(ctx, xm - lenOut / 2, y, xm + lenOut / 2, y, { color: p.efield, width: 2.4, head: 8 });
    const xr = sx1 + gapW / 2;
    arrow(ctx, xr - lenOut / 2, y, xr + lenOut / 2, y, { color: p.efield, width: 2.4, head: 8 });
  }

  // the molecules: a grid of induced dipoles; separation ∝ the polarisation P
  const cols = Math.max(4, Math.floor((sx1 - sx0) / 34));
  const rows = Math.max(4, Math.floor((bottom - top) / 34));
  const cw = (sx1 - sx0) / cols;
  const rh = (bottom - top) / rows;
  const Pmax = polarisedSlab(E0_MAX, 5).P;
  const stretch = (sl.P / Pmax) * cw * 0.32;
  for (let i = 0; i < (empty ? 0 : cols); i++) {
    for (let j = 0; j < rows; j++) {
      const mx = sx0 + (i + 0.5) * cw;
      const my = top + (j + 0.5) * rh;
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(mx, my, cw * 0.26 + stretch * 0.6, rh * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      {
        const edge = st.bound && (i === 0 || i === cols - 1);
        const dim = st.bound && !edge;
        const a = dim ? 0.35 : 1;
        ctx.save();
        ctx.globalAlpha = a;
        chargeDisc(ctx, mx - stretch, my, 4.5, -1, p);
        chargeDisc(ctx, mx + stretch, my, 4.5, 1, p);
        ctx.restore();
      }
    }
  }
  // the inside field, drawn over the molecules
  for (let y = top + 34; y < bottom - 20; y += 60) {
    const xm = (sx0 + sx1) / 2;
    if (lenIn > 3) arrow(ctx, xm - lenIn / 2, y + rh / 2, xm + lenIn / 2, y + rh / 2, { color: p.efield, width: 2.8, head: 8, glow: p.efieldGlow });
  }
  // the bound layers
  if (st.bound && stretch > 0.5) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = p.neg;
    ctx.strokeRect(sx0 + 2, top + 2, cw * 0.5, bottom - top - 4);
    ctx.strokeStyle = p.pos;
    ctx.strokeRect(sx1 - cw * 0.5 - 2, top + 2, cw * 0.5, bottom - top - 4);
    ctx.restore();
    handNote(ctx, 'שכבה שלילית', sx0 + cw * 0.9, top - 10, p, 13);
    handNote(ctx, 'שכבה חיובית', sx1 - cw * 0.9, top - 10, p, 13);
  }
}
