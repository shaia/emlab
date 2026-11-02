/**
 * A rectangular coil on an axle between the poles of a magnet. Built for lesson 4.9.
 *
 * Left: the view along the axle. The two sides parallel to the axle cross the page as gold rings
 * (⊙ current out of the page, ⊗ into it), the coil itself is seen edge-on as the line between them,
 * the field B runs from the N pole to the S pole. Each side feels F = NBIa, always perpendicular to
 * B; the lever arms, the angle θ between the coil's normal and B, and the torque τ = NBIA·sinθ
 * (loopTorque, through src/physics/coil.ts) are drawn and read out. Right: a small oblique sketch of
 * the same coil with the forces on all four sides (coilSideForces): the two short sides are pushed
 * along the axle and add no torque.
 *
 * Modes: 'coil' (turn the coil by dragging, slider or keys; release it and watch it swing and
 * settle), 'motor' (the same coil with a split-ring commutator and brushes; switch it off to see
 * the coil only swing), 'meter' (a moving-coil meter: curved pole pieces and an iron core make the
 * field radial, a spiral spring balances the torque at δ = NBIA/κ). The swing uses rotorStep with a
 * moment of inertia and friction chosen for the eye; the forces and torques are the real ones for
 * the coil's numbers. Still mode freezes the motion: a released coil jumps to where it settles.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { coilSideForces, coilSides, coilTorqueZ, commutatorSign, meterDeflection, rotorStep, type Rotor, type RotorParams } from '~/physics/coil';
import { wireForce } from '~/physics/magnetism';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, depthGlyph, mix, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type CoilMode = 'coil' | 'motor' | 'meter';

/** the coil: side along the axle a, width b [m]; the field [T] */
const SIDE_A = 0.08;
const SIDE_B = 0.05;
const AREA = SIDE_A * SIDE_B;
const FIELD = 0.5;
const N_MAX = 20;
const I_MAX = 3;
/** for the eye: moment of inertia [kg·m²] and friction [N·m·s] of the rotor */
const INERTIA = 4e-3;
const FRICTION = 6e-3;
/** the meter's spiral spring [N·m/rad] */
const KAPPA = 0.12;
/** stage width / height: wide screens put the sketch beside the main view, phones below it */
const ASPECT_WIDE = 1.5;
const ASPECT_TALL = 0.95;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the view along the axle and the oblique sketch go on a canvas of w×h. */
function layout(w: number, h: number, mode: CoilMode): { main: Box; sketch: Box | null } {
  if (mode === 'meter') return { main: { x: 0, y: 0, w, h }, sketch: null };
  if (w / h >= 1.25) return { main: { x: 0, y: 0, w: w * 0.62, h }, sketch: { x: w * 0.62, y: 0, w: w * 0.38, h } };
  return { main: { x: 0, y: 0, w, h: h * 0.66 }, sketch: { x: 0, y: h * 0.66, w, h: h * 0.34 } };
}
const RAD = Math.PI / 180;

const TASK_LABEL: Record<string, string> = {
  'max-torque': 'סובבו את הכריכה למצב שבו המומנט הכי גדול. מה הזווית בין האנך לשדה, ומה הזווית בין מישור הכריכה לשדה?',
  'zero-torque': 'מצאו מצב שבו המומנט אפס. האם הכוחות על הצלעות נעלמו?',
  settle: 'הטו את הכריכה ושחררו אותה. איפה היא נעצרת?',
  'motor-turns': 'במצב "מנוע", עם הקומוטטור, הפעילו את המנוע ותנו לו להשלים שני סיבובים.',
  'no-commutator': 'כבו את הקומוטטור והפעילו שוב. מה קורה עכשיו?',
  'meter-current': 'במצב "מד זרם", שנו את הזרם. איך משתנה הסטת המחוג?',
};

export interface CoilTorqueProps {
  id: string;
  mode?: CoilMode;
  /** orientation of the normal from B, degrees 0–360 (counter-clockwise) */
  phi?: number;
  I?: number;
  N?: number;
  reversed?: boolean;
  commutator?: boolean;
  tasks?: string[];
}

interface State {
  mode: CoilMode;
  phi: number;
  I: number;
  N: number;
  reversed: boolean;
  commutator: boolean;
  running: boolean;
}

const wrap360 = (d: number) => ((d % 360) + 360) % 360;
/** the angle between the normal and B, 0–180° */
const thetaOf = (phiDeg: number) => {
  const p = wrap360(phiDeg);
  return p > 180 ? 360 - p : p;
};
const fmtDeg = (d: number) => `${Math.round(d)}°`;

export default function CoilTorque(props: CoilTorqueProps) {
  const init = (): State => ({
    mode: props.mode ?? 'coil',
    phi: wrap360(props.phi ?? 60),
    I: props.I ?? 2,
    N: props.N ?? 10,
    reversed: props.reversed ?? false,
    commutator: props.commutator ?? true,
    running: false,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const sRef = useRef(s);
  sRef.current = s;
  const rotor = useRef<Rotor>({ phi: s.phi * RAD, omega: 0 });
  const lastT = useRef<number | null>(null);
  const lastSync = useRef(0);
  /** a run started by the reader (not by a text step): only these complete tasks */
  const userRun = useRef(false);
  const turned = useRef(0);
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
            mode: st.mode === 'coil' || st.mode === 'motor' || st.mode === 'meter' ? st.mode : prev.mode,
            phi: typeof st.phi === 'number' ? wrap360(st.phi) : prev.phi,
            I: typeof st.I === 'number' ? st.I : prev.I,
            N: typeof st.N === 'number' ? st.N : prev.N,
            reversed: typeof st.reversed === 'boolean' ? st.reversed : prev.reversed,
            commutator: typeof st.commutator === 'boolean' ? st.commutator : prev.commutator,
            running: false,
          };
          rotor.current = { phi: next.phi * RAD, omega: 0 };
          return next;
        });
      }),
    [props.id],
  );

  const Isigned = (st: State) => (st.reversed ? -st.I : st.I);
  /** the current in the coil right now: the commutator flips it with the coil's position */
  const coilCurrent = (st: State, phiRad: number) =>
    st.mode === 'motor' && st.commutator ? Isigned(st) * commutatorSign(phiRad) : Isigned(st);
  const params = (st: State): RotorParams => ({
    N: st.N,
    I: Isigned(st),
    A: AREA,
    B: FIELD,
    J: INERTIA,
    c: FRICTION,
    commutator: st.mode === 'motor' && st.commutator,
  });

  const describe = (st: State) => {
    if (st.mode === 'meter') {
      const d = meterDeflection(st.N, st.I, AREA, FIELD, KAPPA) / RAD;
      return `מד זרם עם סליל נע: זרם ${sci(st.I)} אמפר, המחוג סטה ${Math.round(d)} מעלות ${st.reversed ? 'שמאלה' : 'ימינה'}.`;
    }
    const Inow = coilCurrent(st, st.phi * RAD);
    const th = thetaOf(st.phi + (Inow < 0 ? 180 : 0));
    const tau = coilTorqueZ(st.N, Inow, AREA, FIELD, st.phi * RAD);
    const zero = Math.abs(tau) < 1e-9 * st.N * FIELD * st.I * AREA;
    const sense = zero ? 'אין מומנט' : tau > 0 ? 'המומנט מסובב נגד כיוון השעון' : 'המומנט מסובב עם כיוון השעון';
    return `הזווית בין האנך לכריכה לבין השדה ${Math.round(th)} מעלות, ובין מישור הכריכה לשדה ${Math.round(Math.abs(90 - th))} מעלות. המומנט ${zero ? '0' : sci(Math.abs(tau))} ניוטון-מטר: ${sense}.`;
  };

  const set = (patch: Partial<State>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (patch.phi !== undefined || patch.mode !== undefined) {
        rotor.current = { phi: next.phi * RAD, omega: 0 };
        lastT.current = null;
      }
      setLive(describe(next));
      return next;
    });
  };

  /** the reader turned the coil by hand */
  const turnTo = (phiDeg: number) => {
    const phi = wrap360(phiDeg);
    userRun.current = false;
    set({ phi, running: false });
    const th = thetaOf(phi);
    if (sRef.current.mode !== 'meter') {
      if (Math.abs(th - 90) <= 2) done('max-torque');
      if (th <= 2 || th >= 178) done('zero-torque');
    }
  };

  const start = () => {
    const st = sRef.current;
    if (st.running) {
      set({ running: false });
      return;
    }
    userRun.current = true;
    turned.current = 0;
    lastT.current = null;
    rotor.current = { phi: st.phi * RAD, omega: 0 };
    const motorOn = st.mode === 'motor' && st.commutator;
    if (!motionAllowed()) {
      // still mode: no motion; a coil without a commutator is shown where it comes to rest
      if (!motorOn) {
        const rest = Math.abs(Math.sin(st.phi * RAD)) < 1e-9 ? st.phi : st.reversed ? 180 : 0;
        set({ phi: rest, running: false });
        if (rest !== st.phi) finishSettle(st);
        setLive('מצב שקט: הכריכה מוצגת במקום שבו היא נעצרת.');
      } else {
        setLive('מצב שקט: המנוע לא מונפש. כבו את מצב השקט בהגדרות כדי לראות אותו מסתובב.');
      }
      return;
    }
    set({ running: true });
  };

  const finishSettle = (st: State) => {
    if (!userRun.current) return;
    if (st.mode === 'coil') done('settle');
    if (st.mode === 'motor' && !st.commutator) {
      done('settle');
      done('no-commutator');
    }
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const st = sRef.current;
    // advance the rotor
    if (st.running && st.mode !== 'meter') {
      const prevT = lastT.current;
      lastT.current = t;
      const dt = prevT === null ? 0 : Math.min(0.05, Math.max(0, t - prevT));
      if (dt > 0) {
        const pr = params(st);
        const n = Math.max(1, Math.ceil(dt / (1 / 240)));
        const before = rotor.current.phi;
        for (let k = 0; k < n; k++) rotor.current = rotorStep(rotor.current, pr, dt / n);
        turned.current += Math.abs(rotor.current.phi - before);
        const r = rotor.current;
        const settled = !pr.commutator && Math.abs(r.omega) < 0.02 && Math.abs(Math.sin(r.phi)) < 0.01;
        const stuck = pr.commutator && Math.abs(r.omega) < 1e-3 && Math.abs(Math.sin(r.phi)) < 1e-6;
        if (pr.commutator && userRun.current && turned.current >= 4 * Math.PI) done('motor-turns');
        if (settled || stuck || t - lastSync.current > 0.1) {
          lastSync.current = t;
          const phiDeg = wrap360(r.phi / RAD);
          if (settled || stuck) {
            const rest = settled ? Math.round(phiDeg / 180) * 180 : phiDeg;
            rotor.current = { phi: wrap360(rest) * RAD, omega: 0 };
            setS((prev) => ({ ...prev, phi: wrap360(rest), running: false }));
            if (settled) finishSettle(st);
            setLive(settled ? 'הכריכה נעצרה: מישור הכריכה ניצב לשדה.' : 'הכריכה בנקודה מתה: המומנט אפס, והמנוע לא מתחיל לפעול.');
          } else {
            setS((prev) => (prev.running ? { ...prev, phi: phiDeg } : prev));
          }
        }
      }
    } else {
      lastT.current = null;
    }
    const phiRad = st.running ? rotor.current.phi : st.phi * RAD;

    const { main, sketch } = layout(view.w, view.h, st.mode);
    ctx.save();
    ctx.translate(main.x, main.y);
    if (st.mode === 'meter') drawMeter(ctx, p, st, main.w, main.h);
    else drawAxial(ctx, p, st, phiRad, coilCurrent(st, phiRad), main.w, main.h);
    ctx.restore();
    if (sketch) {
      ctx.save();
      ctx.strokeStyle = p.rule;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      if (sketch.x > 0) {
        ctx.moveTo(sketch.x, 14);
        ctx.lineTo(sketch.x, view.h - 14);
      } else {
        ctx.moveTo(14, sketch.y);
        ctx.lineTo(view.w - 14, sketch.y);
      }
      ctx.stroke();
      ctx.restore();
      drawSketch(ctx, p, st, phiRad, coilCurrent(st, phiRad), sketch);
    }
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: ASPECT_WIDE, worldHeight: 1, animate: s.running });
  useEffect(invalidate, [s]);
  // phones get a taller stage (sketch under the main view); the server renders the wide one
  const [tall, setTall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px)');
    const on = () => setTall(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  /* ---------------------------------------------------------------- input */

  const mainBox = (): Box | null => {
    const v = viewRef.current;
    return v ? layout(v.w, v.h, sRef.current.mode).main : null;
  };
  const axialCentre = (): [number, number] | null => {
    const b = mainBox();
    return b ? [b.x + b.w / 2, b.y + b.h * 0.54] : null;
  };
  const pointerPhi = (e: PointerEvent): number | null => {
    const c = axialCentre();
    const el = e.currentTarget as HTMLCanvasElement;
    if (!c) return null;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left - c[0];
    const y = -(e.clientY - r.top - c[1]);
    if (Math.hypot(x, y) < 8) return null;
    // the ⊙ side sits at +û, 90° ahead of the normal: drag that side
    return Math.atan2(y, x) / RAD - 90;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (sRef.current.mode === 'meter') return;
    const b = mainBox();
    const el = e.currentTarget as HTMLCanvasElement;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (b && (px > b.x + b.w || py > b.y + b.h)) return;
    const ph = pointerPhi(e);
    if (ph === null) return;
    dragging.current = true;
    el.setPointerCapture?.(e.pointerId);
    turnTo(ph);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const ph = pointerPhi(e);
    if (ph !== null) turnTo(ph);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (s.mode === 'meter') return;
    const step = e.shiftKey ? 15 : 5;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') turnTo(s.phi + step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') turnTo(s.phi - step);
    else if (e.key === ' ' || e.key === 'Enter') start();
    else return;
    e.preventDefault();
  };

  /* -------------------------------------------------------------- readout */

  const Inow = coilCurrent(s, s.phi * RAD);
  const th = thetaOf(s.phi + (Inow < 0 ? 180 : 0));
  const tau = coilTorqueZ(s.N, Inow, AREA, FIELD, s.phi * RAD);
  const Fside = wireForce(s.N * s.I, SIDE_A, FIELD);
  const tauMax = s.N * FIELD * s.I * AREA;
  const sense = Math.abs(tau) < 1e-9 * tauMax ? '' : tau > 0 ? ', נגד כיוון השעון' : ', עם כיוון השעון';
  const delta = meterDeflection(s.N, s.I, AREA, FIELD, KAPPA) / RAD;
  const runLabel = s.running ? 'עצרו' : s.mode === 'motor' && s.commutator ? 'הפעילו את המנוע' : 'שחררו את הכריכה';

  const readout =
    s.mode === 'meter' ? (
      <>
        <span>
          מומנט הכוחות המגנטיים: <b class="q">NBIA = {sci(tauMax)} N·m</b>, בכל זווית
        </span>
        <span>
          הסטת המחוג: <b class="q">δ = {fmtDeg(delta)}</b>, פרופורציונית לזרם
        </span>
      </>
    ) : (
      <>
        <span>
          בין האנך לשדה: <b class="q">θ = {fmtDeg(th)}</b>
        </span>
        <span>
          בין מישור הכריכה לשדה: <b class="q">{fmtDeg(Math.abs(90 - th))}</b>
        </span>
        <span>
          על כל צלע ארוכה: <b class="q">F = NBIa = {sci(Fside)} N</b>
        </span>
        <span>
          הכוח השקול: <b class="q">0</b>
        </span>
        <span>
          <b class="q">τ = NBIA·sinθ = {Math.abs(tau) < 1e-9 * tauMax ? '0' : sci(Math.abs(tau))} N·m</b>
          {sense}
        </span>
      </>
    );

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: כריכה מלבנית על ציר בין קוטבי מגנט. ${describe(s)} במקלדת: חיצים מסובבים את הכריכה, רווח משחרר אותה.`}
      canvasRef={canvasRef}
      aspect={tall ? ASPECT_TALL : ASPECT_WIDE}
      live={live}
      tasks={tasks}
      cursor={s.mode === 'meter' ? 'default' : 'grab'}
      onReset={() => {
        userRun.current = false;
        const st = init();
        rotor.current = { phi: st.phi * RAD, omega: 0 };
        setS(st);
        setLive('האיור אופס.');
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      readout={readout}
      controls={
        <>
          <div class="group" role="group" aria-label="מה מוצג">
            {(
              [
                ['coil', 'כריכה'],
                ['motor', 'מנוע'],
                ['meter', 'מד זרם'],
              ] as const
            ).map(([m, label]) => (
              <button
                type="button"
                key={m}
                class={`toggle ${s.mode === m ? 'on' : ''}`}
                aria-pressed={s.mode === m}
                onClick={() => {
                  userRun.current = false;
                  set({ mode: m, running: false });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div class="group" role="group" aria-label="פעולות">
            {s.mode !== 'meter' && (
              <button type="button" class={`toggle ${s.running ? 'on' : ''}`} aria-pressed={s.running} onClick={start}>
                {runLabel}
              </button>
            )}
            {s.mode === 'motor' && (
              <Toggle
                label="קומוטטור (טבעת מפוצלת)"
                on={s.commutator}
                onChange={(v) => {
                  userRun.current = false;
                  set({ commutator: v, running: false });
                }}
              />
            )}
            <Toggle
              label="הפכו את כיוון הזרם"
              on={s.reversed}
              swatch="var(--current)"
              onChange={(v) => {
                set({ reversed: v });
                if (s.mode === 'meter') done('meter-current');
              }}
            />
          </div>
          {s.mode !== 'meter' && (
            <Slider label="סיבוב הכריכה" value={Math.round(s.phi)} min={0} max={359} step={1} format={(v) => `${v}°`} onChange={turnTo} />
          )}
          <Slider
            label="הזרם"
            value={s.I}
            min={0.5}
            max={I_MAX}
            step={0.5}
            format={(v) => `${v} A`}
            onChange={(v) => {
              set({ I: v });
              if (s.mode === 'meter') done('meter-current');
            }}
          />
          <Slider label="מספר הכריכות" value={s.N} min={1} max={N_MAX} step={1} format={(v) => `N = ${v}`} onChange={(v) => set({ N: v })} />
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------ drawing */

const sx = (cx: number, r: number, a: number) => cx + r * Math.cos(a);
const sy = (cy: number, r: number, a: number) => cy - r * Math.sin(a);

function text(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; weight?: number; align?: CanvasTextAlign; hand?: boolean } = {}) {
  ctx.save();
  ctx.font = `${o.weight ?? 600} ${o.size ?? 13}px ${o.hand ? p.fontHand : p.fontUi}`;
  ctx.fillStyle = o.color ?? p.ink2;
  ctx.direction = /[֐-׿]/.test(s) ? 'rtl' : 'ltr';
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** A curved arrow around (cx, cy) from world angle a0 sweeping by `sweep` (positive = counter-clockwise). */
function curvedArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, sweep: number, color: string) {
  if (Math.abs(sweep) < 0.05) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -a0, -(a0 + sweep), sweep > 0);
  ctx.stroke();
  const a1 = a0 + sweep;
  const ex = sx(cx, r, a1);
  const ey = sy(cy, r, a1);
  // tangent in the direction of travel (screen coordinates)
  const dir = Math.sign(sweep);
  const tx = -Math.sin(a1) * dir;
  const ty = -Math.cos(a1) * dir;
  const h = 9;
  ctx.beginPath();
  ctx.moveTo(ex + tx * h, ey + ty * h);
  ctx.lineTo(ex - ty * h * 0.5, ey + tx * h * 0.5);
  ctx.lineTo(ex + ty * h * 0.5, ey - tx * h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function poles(ctx: CanvasRenderingContext2D, p: Palette, LW: number, H: number, cy: number, faceL: number, faceR: number, curved: number) {
  const ph = curved > 0 ? Math.min(H * 0.62, curved * 1.8) : H * 0.62;
  const fill = mix(p.bfield, p.paper, 0.78);
  const half = curved > 0 ? Math.asin(ph / 2 / curved) : 0;
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.beginPath();
    if (side < 0) {
      ctx.moveTo(10, cy - ph / 2);
      if (curved > 0) ctx.arc(LW / 2, cy, curved, Math.PI + half, Math.PI - half, true);
      else {
        ctx.lineTo(faceL, cy - ph / 2);
        ctx.lineTo(faceL, cy + ph / 2);
      }
      ctx.lineTo(10, cy + ph / 2);
    } else {
      ctx.moveTo(LW - 10, cy - ph / 2);
      if (curved > 0) ctx.arc(LW / 2, cy, curved, -half, half, false);
      else {
        ctx.lineTo(faceR, cy - ph / 2);
        ctx.lineTo(faceR, cy + ph / 2);
      }
      ctx.lineTo(LW - 10, cy + ph / 2);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = p.bfield;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  text(ctx, p, 'N', (10 + faceL) / 2 - (curved > 0 ? 6 : 0), cy, { color: p.ink, size: 20, weight: 700 });
  text(ctx, p, 'S', (LW - 10 + faceR) / 2 + (curved > 0 ? 6 : 0), cy, { color: p.ink, size: 20, weight: 700 });
}

/** The view along the axle. */
function drawAxial(ctx: CanvasRenderingContext2D, p: Palette, st: State, phi: number, I: number, LW: number, H: number) {
  const cx = LW / 2;
  const cy = H * 0.54;
  const unit = Math.min(LW, H);
  const pw = Math.max(26, LW * 0.1);
  const faceL = 10 + pw;
  const faceR = LW - 10 - pw;
  const rs = Math.min(unit * 0.25, (faceR - faceL) * 0.3);
  poles(ctx, p, LW, H, cy, faceL, faceR, 0);

  // the uniform field, N → S
  const ph = H * 0.62;
  ctx.save();
  for (let k = 0; k < 5; k++) {
    const y = cy - ph / 2 + ((k + 0.5) * ph) / 5;
    arrow(ctx, faceL + 4, y, faceR - 4, y, { color: p.bfield, width: 1.4, head: 8, alpha: 0.55 });
  }
  ctx.restore();
  text(ctx, p, 'B', faceR - 12, cy - ph / 2 + ph / 10 - 12, { color: p.bfield, size: 15, weight: 700 });
  text(ctx, p, 'מבט לאורך הציר', 12, 14, { align: 'left', size: 12, weight: 500, color: p.ink3 });

  const sides = coilSides(phi, 2 * rs);
  const out: [number, number] = [cx + sides.out[0], cy - sides.out[1]];
  const inn: [number, number] = [cx + sides.in[0], cy - sides.in[1]];
  const outDir: 'out' | 'in' = I >= 0 ? 'out' : 'in';
  const inDir: 'out' | 'in' = I >= 0 ? 'in' : 'out';

  // the angle θ: from B (a dashed reference ray) to the normal
  // the normal follows the current (right-hand rule): a reversed current flips it
  const nEff = phi + (I < 0 ? Math.PI : 0);
  const nAng = Math.atan2(Math.sin(nEff), Math.cos(nEff));
  ctx.save();
  ctx.strokeStyle = withAlpha(p.hand, 0.8);
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + rs * 1.15, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, rs * 0.42, 0, -nAng, nAng > 0);
  ctx.stroke();
  ctx.restore();
  const mid = nAng / 2;
  text(ctx, p, 'θ', sx(cx, rs * 0.56, mid), sy(cy, rs * 0.56, mid), { color: p.hand, size: 15, weight: 700, hand: true });

  // forces: always perpendicular to B; lines of action and lever arms
  const Fmax = wireForce(N_MAX * I_MAX, SIDE_A, FIELD);
  const F = wireForce(st.N * Math.abs(I), SIDE_A, FIELD);
  const fl = (F / Fmax) * unit * 0.3;
  const fOut = I >= 0 ? -1 : 1; // screen y: the ⊙ side is pushed up
  const lever = Math.abs(sides.out[0]);
  if (lever > 3) {
    ctx.save();
    ctx.strokeStyle = withAlpha(p.force, 0.35);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    for (const q of [out, inn]) {
      ctx.beginPath();
      ctx.moveTo(q[0], cy - rs * 1.25);
      ctx.lineTo(q[0], cy + rs * 1.25);
      ctx.stroke();
    }
    ctx.strokeStyle = p.hand;
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(out[0], cy);
    ctx.lineTo(inn[0], cy);
    ctx.stroke();
    ctx.restore();
    if (lever > 18 && st.mode !== 'motor') text(ctx, p, 'זרוע', (cx + out[0]) / 2, cy + 12, { color: p.hand, size: 13, weight: 500, hand: true });
  }

  // the coil seen edge-on, and its axle
  ctx.save();
  ctx.strokeStyle = p.current;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(out[0], out[1]);
  ctx.lineTo(inn[0], inn[1]);
  ctx.stroke();
  ctx.restore();

  if (st.mode === 'motor') commutator(ctx, p, cx, cy, phi, rs, st);

  // the normal, by the right-hand rule from the current
  const nl = rs * 0.95;
  arrow(ctx, cx, cy, sx(cx, nl, nAng), sy(cy, nl, nAng), { color: p.accent, width: 2.4, head: 10 });
  text(ctx, p, 'אנך', sx(cx, nl + 16, nAng), sy(cy, nl + 16, nAng), { color: p.accent, size: 13, weight: 600 });

  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  depthGlyph(ctx, out[0], out[1], 11, outDir, p.current, { fill: p.paper, width: 2.2 });
  depthGlyph(ctx, inn[0], inn[1], 11, inDir, p.current, { fill: p.paper, width: 2.2 });
  arrow(ctx, out[0], out[1] + fOut * 13, out[0], out[1] + fOut * (13 + fl), { color: p.force, width: 2.8, head: 10 });
  arrow(ctx, inn[0], inn[1] - fOut * 13, inn[0], inn[1] - fOut * (13 + fl), { color: p.force, width: 2.8, head: 10 });
  text(ctx, p, 'F', out[0] + 14, out[1] + fOut * (13 + fl * 0.6), { color: p.force, size: 14, weight: 700 });
  text(ctx, p, 'F', inn[0] + 14, inn[1] - fOut * (13 + fl * 0.6), { color: p.force, size: 14, weight: 700 });

  // the torque: a curved arrow whose sweep grows with |τ|
  const tau = coilTorqueZ(st.N, I, AREA, FIELD, phi);
  const tauMax = N_MAX * FIELD * I_MAX * AREA;
  if (Math.abs(tau) > 1e-6 * tauMax) {
    // centred opposite the normal, where nothing else is drawn
    const sweep = Math.sign(tau) * (0.25 + (2.2 * Math.abs(tau)) / tauMax);
    const a0 = nAng + Math.PI - sweep / 2;
    const rt = rs * 0.62;
    curvedArrow(ctx, cx, cy, rt, a0, sweep, p.ink2);
    text(ctx, p, 'τ', sx(cx, rt + 13, a0 + sweep), sy(cy, rt + 13, a0 + sweep), { color: p.ink2, size: 14, weight: 700 });
  }
  // a note under the coil at the special positions
  const th = Math.abs(nAng) / RAD;
  let note = '';
  if (Math.abs(th - 90) < 1.5) note = 'מישור הכריכה לאורך השדה: המומנט הכי גדול';
  else if (th < 1.5 || th > 178.5) {
    const stable = th < 90;
    note = st.mode === 'motor' && st.commutator ? 'נקודה מתה: המומנט אפס' : stable ? 'מישור ניצב לשדה: שיווי משקל יציב' : 'מישור ניצב לשדה: שיווי משקל רופף';
  }
  if (note) text(ctx, p, note, cx, H - 14, { color: p.hand, size: 14, weight: 500, hand: true });
}

/** The split ring and the brushes at the near end of the axle (drawn over the axle). */
function commutator(ctx: CanvasRenderingContext2D, p: Palette, cx: number, cy: number, phi: number, rs: number, st: State) {
  const r = Math.max(12, rs * 0.2);
  const uAng = phi + Math.PI / 2;
  const gap = 0.32;
  ctx.save();
  ctx.lineWidth = 5;
  ctx.lineCap = 'butt';
  for (const [k, c] of [
    [0, p.current],
    [1, mix(p.current, p.ink, 0.45)],
  ] as const) {
    const a = uAng + k * Math.PI;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -(a - Math.PI / 2 + gap / 2), -(a + Math.PI / 2 - gap / 2), true);
    ctx.stroke();
  }
  ctx.restore();
  // brushes, left (+) and right (−); reversed current swaps the supply
  const plusLeft = !st.reversed;
  for (const side of [-1, 1] as const) {
    const x = cx + side * (r + 9);
    ctx.save();
    ctx.fillStyle = mix(p.ink3, p.paper, 0.3);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1;
    ctx.fillRect(x - 6, cy - 4, 12, 8);
    ctx.strokeRect(x - 6, cy - 4, 12, 8);
    ctx.restore();
    const plus = (side < 0) === plusLeft;
    text(ctx, p, plus ? '+' : '−', x, cy - 13, { color: p.ink, size: 14, weight: 700 });
  }
}

/** The oblique sketch: the whole coil, the axle, and the force on each of the four sides. */
function drawSketch(ctx: CanvasRenderingContext2D, p: Palette, st: State, phi: number, I: number, box: Box) {
  const ox = box.x + box.w * 0.5;
  const oy = box.y + box.h * 0.46;
  const scale = (Math.min(box.w, box.h * 1.3) * 0.58) / SIDE_A;
  const psi = -40 * RAD;
  const beta = 22 * RAD;
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  type P3 = readonly [number, number, number];
  const pr = ([X, Y, Z]: P3): [number, number] => {
    const x1 = X * cp + Z * sp;
    const z1 = -X * sp + Z * cp;
    return [ox + scale * x1, oy - scale * (Y * cb - z1 * sb)];
  };
  const depth = ([X, Y, Z]: P3) => (-X * sp + Z * cp) * cb + Y * sb;

  // field arrows behind
  for (const [Y, Z] of [
    [0.03, -0.025],
    [-0.03, -0.025],
    [0, 0.035],
  ] as const) {
    const a = pr([-0.045, Y, Z]);
    const b = pr([0.045, Y, Z]);
    arrow(ctx, a[0], a[1], b[0], b[1], { color: p.bfield, width: 1.3, head: 7, alpha: 0.5 });
  }
  const bl = pr([0.045, 0.03, -0.025]);
  text(ctx, p, 'B', bl[0] + 8, bl[1] - 6, { color: p.bfield, size: 13, weight: 700 });

  // the axle
  const ax0 = pr([0, 0, -SIDE_A * 0.85]);
  const ax1 = pr([0, 0, SIDE_A * 0.85]);
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(ax0[0], ax0[1]);
  ctx.lineTo(ax1[0], ax1[1]);
  ctx.stroke();
  ctx.restore();

  const forces = coilSideForces(st.N, I, SIDE_A, SIDE_B, FIELD, phi);
  const Fmax = wireForce(N_MAX * I_MAX, SIDE_A, FIELD);
  const kF = (SIDE_A * 0.75) / Fmax; // metres of arrow per newton
  const u: P3 = [-Math.sin(phi), Math.cos(phi), 0];
  const c = (su: number, sz: number): P3 => [(u[0] * su * SIDE_B) / 2, (u[1] * su * SIDE_B) / 2, (sz * SIDE_A) / 2];
  // the four sides in circulation order (the ⊙ side first when I > 0)
  const ends: [P3, P3][] = [
    [c(1, -1), c(1, 1)],
    [c(1, 1), c(-1, 1)],
    [c(-1, 1), c(-1, -1)],
    [c(-1, -1), c(1, -1)],
  ];
  const order = [0, 1, 2, 3].sort((i, j) => depth(forces[i].at) - depth(forces[j].at));
  for (const i of order) {
    const [e0, e1] = I >= 0 ? ends[i] : [ends[i][1], ends[i][0]];
    const a = pr(e0);
    const b = pr(e1);
    ctx.save();
    ctx.strokeStyle = p.current;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.restore();
    // the current's direction, a small arrow at the middle of the side
    const m0 = pr([(e0[0] * 0.6 + e1[0] * 0.4), (e0[1] * 0.6 + e1[1] * 0.4), (e0[2] * 0.6 + e1[2] * 0.4)]);
    const m1 = pr([(e0[0] * 0.4 + e1[0] * 0.6), (e0[1] * 0.4 + e1[1] * 0.6), (e0[2] * 0.4 + e1[2] * 0.6)]);
    arrow(ctx, m0[0], m0[1], m1[0], m1[1], { color: mix(p.current, p.ink, 0.35), width: 2, head: 8 });
    const f = forces[i];
    const mag = Math.hypot(f.F[0], f.F[1], f.F[2]);
    if (mag > 1e-9) {
      const from = pr(f.at);
      const to = pr([f.at[0] + f.F[0] * kF, f.at[1] + f.F[1] * kF, f.at[2] + f.F[2] * kF]);
      arrow(ctx, from[0], from[1], to[0], to[1], { color: p.force, width: 2.2, head: 8 });
    }
  }
  // the normal
  const n: P3 = [Math.cos(phi) * (I >= 0 ? 1 : -1), Math.sin(phi) * (I >= 0 ? 1 : -1), 0];
  const n0 = pr([0, 0, 0]);
  const n1 = pr([n[0] * SIDE_B * 0.9, n[1] * SIDE_B * 0.9, 0]);
  arrow(ctx, n0[0], n0[1], n1[0], n1[1], { color: p.accent, width: 2, head: 8 });
  if (box.x > 0) text(ctx, p, 'מבט מהצד', ox, box.y + box.h - 14, { size: 12, weight: 500, color: p.ink3 });
  else text(ctx, p, 'מבט מהצד', box.x + box.w - 12, box.y + 14, { size: 12, weight: 500, color: p.ink3, align: 'right' });
}

/** The moving-coil meter: curved pole pieces, an iron core, a radial field, a spring and a needle. */
function drawMeter(ctx: CanvasRenderingContext2D, p: Palette, st: State, LW: number, H: number) {
  const cx = LW / 2;
  const cy = H * 0.6;
  const unit = Math.min(LW * 0.6, H * 0.8);
  const core = unit * 0.2;
  const gapR = unit * 0.34;
  const rs = (core + gapR) / 2;
  const pw = Math.max(30, LW * 0.1);
  const faceL = cx - gapR - pw * 0.2;
  const faceR = cx + gapR + pw * 0.2;
  poles(ctx, p, LW, H * 0.75, cy, faceL, faceR, gapR);

  // the radial field in the gap: from the N face to the core, and from the core to the S face
  for (const side of [-1, 1] as const) {
    for (let k = -2; k <= 2; k++) {
      const a = (side < 0 ? Math.PI : 0) + k * 0.28;
      const r0 = side < 0 ? gapR - 2 : core + 2;
      const r1 = side < 0 ? core + 2 : gapR - 2;
      arrow(ctx, sx(cx, r0, a), sy(cy, r0, a), sx(cx, r1, a), sy(cy, r1, a), { color: p.bfield, width: 1.3, head: 6, alpha: 0.6 });
    }
  }
  // the iron core
  ctx.save();
  ctx.fillStyle = mix(p.ink3, p.paper, 0.55);
  ctx.strokeStyle = p.ink3;
  ctx.beginPath();
  ctx.arc(cx, cy, core, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  text(ctx, p, 'ליבת ברזל', cx, cy + core * 0.45, { size: 11, weight: 500, color: p.ink });

  const dir = st.reversed ? -1 : 1;
  const delta = dir * meterDeflection(st.N, st.I, AREA, FIELD, KAPPA);
  // the needle is along the normal; at rest it points up (φ = 90°); positive current turns it clockwise
  const nAng = Math.PI / 2 - delta;
  const uAng = nAng + Math.PI / 2;
  const out: [number, number] = [sx(cx, rs, uAng), sy(cy, rs, uAng)];
  const inn: [number, number] = [sx(cx, rs, uAng + Math.PI), sy(cy, rs, uAng + Math.PI)];
  ctx.save();
  ctx.strokeStyle = withAlpha(p.current, 0.55);
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(out[0], out[1]);
  ctx.lineTo(inn[0], inn[1]);
  ctx.stroke();
  ctx.restore();

  // the scale
  const R = Math.min(unit * 0.62, cy - 34);
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, R, -Math.PI / 2 - 1.15, -Math.PI / 2 + 1.15);
  ctx.stroke();
  for (let k = -6; k <= 6; k++) {
    const a = Math.PI / 2 - k * (1.0 / 6);
    const l = k % 3 === 0 ? 10 : 5;
    ctx.beginPath();
    ctx.moveTo(sx(cx, R, a), sy(cy, R, a));
    ctx.lineTo(sx(cx, R + l, a), sy(cy, R + l, a));
    ctx.stroke();
  }
  ctx.restore();
  text(ctx, p, '0', cx, cy - R - 18, { size: 12 });
  // the needle
  arrow(ctx, cx, cy, sx(cx, R - 4, nAng), sy(cy, R - 4, nAng), { color: p.ink, width: 2, head: 9 });
  // the spiral spring on the axle
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = 0; k <= 80; k++) {
    const a = (k / 80) * 6 * Math.PI - delta;
    const r = 3 + (k / 80) * core * 0.4;
    const x = sx(cx, r, a);
    const y = sy(cy, r, a);
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  const I = dir * st.I;
  depthGlyph(ctx, out[0], out[1], 10, I >= 0 ? 'out' : 'in', p.current, { fill: p.paper, width: 2.2 });
  depthGlyph(ctx, inn[0], inn[1], 10, I >= 0 ? 'in' : 'out', p.current, { fill: p.paper, width: 2.2 });
  // forces: tangential, NBIa, at any deflection (the sides always move across the radial field)
  const Fmax = wireForce(N_MAX * I_MAX, SIDE_A, FIELD);
  const fl = (wireForce(st.N * st.I, SIDE_A, FIELD) / Fmax) * unit * 0.32;
  const fa = nAng + (I >= 0 ? 0 : Math.PI);
  arrow(ctx, out[0] + 12 * Math.cos(fa), out[1] - 12 * Math.sin(fa), out[0] + (12 + fl) * Math.cos(fa), out[1] - (12 + fl) * Math.sin(fa), { color: p.force, width: 2.6, head: 9 });
  arrow(ctx, inn[0] - 12 * Math.cos(fa), inn[1] + 12 * Math.sin(fa), inn[0] - (12 + fl) * Math.cos(fa), inn[1] + (12 + fl) * Math.sin(fa), { color: p.force, width: 2.6, head: 9 });
  text(ctx, p, 'קפיץ', cx + core * 0.75, cy - core * 0.55, { size: 11, weight: 500, color: p.ink2, hand: true });
  text(ctx, p, 'מד זרם עם סליל נע', 12, 14, { align: 'left', size: 12, weight: 500, color: p.ink3 });
}
