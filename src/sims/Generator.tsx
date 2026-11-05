/**
 * A rotating-coil generator. Built for lesson 5.7.
 *
 * Left, top: the view along the axle, as in figure 4.10א. The coil is seen edge-on between the poles
 * of a magnet; the field lines that pass through it are drawn dark, the others faint, so the flux is
 * the number of dark lines. The two long sides carry the induced current (⊙ / ⊗ from the sign of ε,
 * nothing when ε = 0), their velocity is drawn, and so are the normal and the angle θ to B.
 * Left, bottom: the end of the axle seen from the side: two slip rings, or one split ring (the
 * commutator of 4.10), the brushes, and a lamp whose glow follows the instantaneous power ε²/R.
 * Right: Φ(t) per turn with the tangent at the cursor (its slope is the emf), ε(t) at the brushes with
 * the effective-value line, and the lamp's power p(t) with its mean ε₀²/(2R); the parts of p above the
 * mean are shaded one way and the gaps below it another, to show they are equal. A faint dashed curve
 * is the starting setting, so a change of N, B or f is seen against it.
 *
 * Every value comes from src/physics/induction.ts and generator.ts. The coil turns counter-clockwise
 * at f turns per second (slowed far below 50 Hz so the eye can follow it). Still mode never animates:
 * the coil is turned by the slider, the keys or by dragging it. Tasks are ticked only from the
 * reader's own controls (event handlers), never from a text step.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { acMeanPower, generatorEmf, generatorPeak, rms, type Generator as Gen } from '~/physics/induction';
import { angularSpeed, brushEmf, fluxPerTurn, instantPower, periodOf, type RingKind } from '~/physics/generator';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, depthGlyph, mix, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, insetBox, makePlot, niceTicks, type Box, type Plot } from './core/plot';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

/** the coil of figure 4.10א: side along the axle a, width b [m] */
const SIDE_A = 0.08;
const SIDE_B = 0.05;
const AREA = SIDE_A * SIDE_B;
/** the lamp, with the coil's own resistance folded in [Ω] */
const R_LAMP = 10;
/** the graphs show this many seconds: a whole number of turns at every allowed f */
const WINDOW = 2;
const RAD = Math.PI / 180;
const ASPECT_WIDE = 1.55;
const ASPECT_TALL = 0.62;

const TASK_LABEL: Record<string, string> = {
  'emf-max': 'עצרו את הכריכה במצב שבו הכא״מ הכי גדול. כמה שטף עובר אז דרך הכריכה?',
  'emf-zero': 'עצרו את הכריכה במצב שבו הכא״מ אפס והנורה חשוכה. כמה שטף עובר אז דרך הכריכה?',
  'double-f': 'הכפילו את מספר הסיבובים בשנייה. מה קרה לזמן המחזור, ומה לשיא של הכא״מ?',
  'double-n': 'הכפילו את מספר הכריכות. פי כמה גדל השיא של הכא״מ, ופי כמה ההספק הממוצע?',
  split: 'עברו לטבעת המפוצלת. מה קרה לחצאי הגרף של הכא״מ שהיו שליליים?',
};

export interface GeneratorProps {
  id: string;
  rings?: RingKind;
  /** angle of the coil's normal from B, degrees (counter-clockwise) */
  angle?: number;
  /** turns per second [Hz] */
  f?: number;
  N?: number;
  /** field [T] */
  B?: number;
  running?: boolean;
  tasks?: string[];
}

interface State {
  rings: RingKind;
  /** degrees, wrapped to [0, 360) */
  angle: number;
  f: number;
  N: number;
  B: number;
  running: boolean;
}

const wrap360 = (d: number) => ((d % 360) + 360) % 360;
const clampTo = (v: number, lo: number, hi: number, step: number) => Math.min(hi, Math.max(lo, Math.round(v / step) * step));
const gen = (st: { f: number; N: number; B: number }): Gen => ({ N: st.N, B: st.B, A: AREA, omega: angularSpeed(st.f) });
/** the time on the graphs at which the coil has turned to `phiRad` (the graphs start with the normal along B) */
const cursorTime = (phiRad: number, f: number) => {
  const t = phiRad / angularSpeed(f);
  return ((t % WINDOW) + WINDOW) % WINDOW;
};
const fmtDeg = (d: number) => `${Math.round(d)}°`;
/** a value for a readout: 0 when it is a rounding error of the scale */
const tidy = (x: number, scale: number) => (Math.abs(x) < 1e-9 * scale ? 0 : x);

export default function Generator(props: GeneratorProps) {
  const init = (): State => ({
    rings: props.rings ?? 'slip',
    angle: wrap360(props.angle ?? 60),
    f: props.f ?? 1,
    N: props.N ?? 200,
    B: props.B ?? 0.5,
    running: props.running ?? false,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const sRef = useRef(s);
  sRef.current = s;
  /** the coil's angle while it turns [rad], unwrapped */
  const phi = useRef(s.angle * RAD);
  const lastT = useRef<number | null>(null);
  const lastSync = useRef(0);
  const dragging = useRef(false);
  const ghost = useRef({ f: props.f ?? 1, N: props.N ?? 200, B: props.B ?? 0.5 });
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const done = (t: string) => props.tasks?.includes(t) && markTask(`${props.id}:${t}`);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        lastT.current = null;
        setS((prev) => {
          const next: State = {
            rings: st.rings === 'slip' || st.rings === 'split' ? st.rings : prev.rings,
            angle: typeof st.angle === 'number' ? wrap360(st.angle) : prev.angle,
            f: typeof st.f === 'number' ? st.f : prev.f,
            N: typeof st.N === 'number' ? st.N : prev.N,
            B: typeof st.B === 'number' ? st.B : prev.B,
            running: typeof st.running === 'boolean' ? st.running && motionAllowed() : false,
          };
          phi.current = next.angle * RAD;
          return next;
        });
      }),
    [props.id],
  );

  const describe = (st: State) => {
    const g = gen(st);
    const p = st.angle * RAD;
    const t = p / g.omega;
    const e0 = generatorPeak(g);
    const e = tidy(brushEmf(g, t, st.rings), e0);
    const flux = tidy(fluxPerTurn(g, t), st.B * AREA);
    const ringsHe = st.rings === 'slip' ? 'טבעות החלקה, זרם חילופין' : 'טבעת מפוצלת, זרם ישר פועם';
    return `הזווית בין האנך לכריכה לבין השדה ${fmtDeg(thetaOf(st.angle))}. השטף דרך כריכה ${sci(flux * 1000)} מיליוובר, הכא״מ בין המברשות ${sci(e)} וולט, והשיא ${sci(e0)} וולט. ${ringsHe}.`;
  };

  const set = (patch: Partial<State>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (patch.angle !== undefined) {
        phi.current = next.angle * RAD;
        lastT.current = null;
      }
      setLive(describe(next));
      return next;
    });
  };

  /** the tasks a stopped coil can complete, from where it stands */
  const checkPosition = (angleDeg: number) => {
    const sn = Math.abs(Math.sin(angleDeg * RAD));
    if (sn >= 0.995) done('emf-max');
    if (sn <= 0.035) done('emf-zero');
  };

  /** the reader turned the coil by hand */
  const turnTo = (deg: number) => {
    const a = wrap360(deg);
    set({ angle: a, running: false });
    checkPosition(a);
  };

  const toggleRun = () => {
    const st = sRef.current;
    if (st.running) {
      const a = wrap360(phi.current / RAD);
      set({ running: false, angle: a });
      checkPosition(a);
      return;
    }
    if (!motionAllowed()) {
      setLive('מצב שקט: הגנרטור לא מונפש. סובבו את הכריכה בפס הסיבוב, או כבו את מצב השקט בהגדרות.');
      return;
    }
    lastT.current = null;
    set({ running: true });
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const st = sRef.current;
    const g = gen(st);
    if (st.running) {
      const prev = lastT.current;
      lastT.current = t;
      const dt = prev === null ? 0 : Math.min(0.05, Math.max(0, t - prev));
      phi.current += g.omega * dt;
      if (t - lastSync.current > 0.12) {
        lastSync.current = t;
        const a = wrap360(phi.current / RAD);
        setS((pr) => (pr.running ? { ...pr, angle: a } : pr));
      }
    } else {
      lastT.current = null;
    }
    const phiRad = st.running ? phi.current : st.angle * RAD;
    const tall = view.w / view.h < 1;
    const L = layoutOf(view.w, view.h, tall);
    drawMachine(ctx, p, st, g, phiRad, L.machine);
    drawRings(ctx, p, st, g, phiRad, L.rings, ghost.current);
    drawGraphs(ctx, p, st, g, phiRad, L.graphs, ghost.current);
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

  /* ---------------------------------------------------------------- input */

  const pointerAngle = (e: PointerEvent): number | null => {
    const v = viewRef.current;
    if (!v) return null;
    const m = layoutOf(v.w, v.h, v.w / v.h < 1).machine;
    const el = e.currentTarget as HTMLCanvasElement;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (px < m.x || px > m.x + m.w || py < m.y || py > m.y + m.h) return null;
    const c = machineCentre(m);
    const x = px - c[0];
    const y = -(py - c[1]);
    if (Math.hypot(x, y) < 8) return null;
    // the side at +û sits 90° ahead of the normal: drag that side
    return Math.atan2(y, x) / RAD - 90;
  };
  const onPointerDown = (e: PointerEvent) => {
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
    const step = e.shiftKey ? 15 : 5;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') turnTo(s.angle + step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') turnTo(s.angle - step);
    else if (e.key === ' ' || e.key === 'Enter') toggleRun();
    else return;
    e.preventDefault();
  };

  /* -------------------------------------------------------------- readout */

  const g = gen(s);
  const tNow = (s.angle * RAD) / g.omega;
  const e0 = generatorPeak(g);
  const eNow = tidy(brushEmf(g, tNow, s.rings), e0);
  const fluxNow = tidy(fluxPerTurn(g, tNow), s.B * AREA);
  const T = periodOf(g.omega);

  const readout = (
    <>
      <span>
        בין האנך לשדה: <b class="q">θ = {fmtDeg(thetaOf(s.angle))}</b>
      </span>
      <span>
        השטף דרך כריכה: <b class="q">Φ = BA·cosθ = {sci(fluxNow * 1000)} mWb</b>
      </span>
      <span>
        {s.rings === 'slip' ? 'הכא״מ: ' : 'בין המברשות: '}
        <b class="q">{s.rings === 'slip' ? 'ε = NBAω·sinθ' : '|ε|'} = {sci(eNow)} V</b>
      </span>
      <span>
        השיא: <b class="q">ε₀ = NBAω = {sci(e0)} V</b>
      </span>
      <span>
        זמן המחזור: <b class="q">T = 1/f = {sci(T)} s</b>
      </span>
      <span>
        הערך האפקטיבי: <b class="q">ε₀/√2 = {sci(rms(e0))} V</b>
      </span>
      <span>
        ההספק הממוצע בנורה, <bdi dir="ltr">R = {R_LAMP} Ω</bdi>: <b class="q">ε₀²/(2R) = {sci(acMeanPower(e0, R_LAMP))} W</b>
      </span>
    </>
  );

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גנרטור, כריכה שמסתובבת בין קוטבי מגנט, וגרפים של השטף, הכא״מ וההספק. ${describe(s)} במקלדת: חיצים מסובבים את הכריכה, רווח מפעיל ועוצר.`}
      canvasRef={canvasRef}
      aspect={tall ? ASPECT_TALL : ASPECT_WIDE}
      live={live}
      tasks={tasks}
      cursor="grab"
      onReset={() => {
        const st = init();
        phi.current = st.angle * RAD;
        lastT.current = null;
        setS({ ...st, running: false });
        setLive('האיור אופס.');
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      readout={readout}
      controls={
        <>
          <div class="group" role="group" aria-label="מה מחבר את הכריכה למעגל">
            {(
              [
                ['slip', 'טבעות החלקה'],
                ['split', 'טבעת מפוצלת'],
              ] as const
            ).map(([k, label]) => (
              <button
                type="button"
                key={k}
                class={`toggle ${s.rings === k ? 'on' : ''}`}
                aria-pressed={s.rings === k}
                onClick={() => {
                  set({ rings: k });
                  if (k === 'split') done('split');
                }}
              >
                {label}
              </button>
            ))}
            <button type="button" class={`toggle ${s.running ? 'on' : ''}`} aria-pressed={s.running} onClick={toggleRun}>
              {s.running ? 'עצרו' : 'סובבו את הגנרטור'}
            </button>
          </div>
          <Slider label="סיבוב הכריכה" value={Math.round(s.angle)} min={0} max={359} step={1} format={(v) => `${v}°`} onChange={turnTo} />
          <Slider
            label="סיבובים בשנייה"
            value={s.f}
            min={0.5}
            max={2}
            step={0.5}
            format={(v) => `f = ${v} Hz`}
            onChange={(v) => {
              const f = clampTo(v, 0.5, 2, 0.5);
              // keep the coil where it is: the graphs' cursor moves to the same angle at the new speed
              set({ f });
              if (f === 2 * ghost.current.f) done('double-f');
            }}
          />
          <Slider
            label="מספר הכריכות"
            value={s.N}
            min={100}
            max={400}
            step={100}
            format={(v) => `N = ${v}`}
            onChange={(v) => {
              const N = clampTo(v, 100, 400, 100);
              set({ N });
              if (N === 2 * ghost.current.N) done('double-n');
            }}
          />
          <Slider label="השדה המגנטי" value={s.B} min={0.25} max={1} step={0.25} format={(v) => `B = ${v} T`} onChange={(v) => set({ B: clampTo(v, 0.25, 1, 0.25) })} />
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------ layout */

interface Layout {
  machine: Box;
  rings: Box;
  graphs: Box;
}

function layoutOf(w: number, h: number, tall: boolean): Layout {
  if (tall) {
    const top = h * 0.4;
    return {
      machine: { x: 0, y: 0, w: w * 0.6, h: top },
      rings: { x: w * 0.6, y: 0, w: w * 0.4, h: top },
      graphs: { x: 0, y: top, w, h: h - top },
    };
  }
  const left = w * 0.42;
  return {
    machine: { x: 0, y: 0, w: left, h: h * 0.6 },
    rings: { x: 0, y: h * 0.6, w: left, h: h * 0.4 },
    graphs: { x: left, y: 0, w: w - left, h },
  };
}

const machineCentre = (m: Box): [number, number] => [m.x + m.w / 2, m.y + m.h * 0.52];

/** the angle between the normal and B, 0–180° */
function thetaOf(deg: number) {
  const a = wrap360(deg);
  return a > 180 ? 360 - a : a;
}

/* ------------------------------------------------------------------ drawing */

const sx = (cx: number, r: number, a: number) => cx + r * Math.cos(a);
const sy = (cy: number, r: number, a: number) => cy - r * Math.sin(a);

function text(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { color?: string; size?: number; weight?: number; align?: CanvasTextAlign; hand?: boolean; bg?: boolean } = {}) {
  ctx.save();
  ctx.font = `${o.weight ?? 600} ${o.size ?? 13}px ${o.hand ? p.fontHand : p.fontUi}`;
  ctx.direction = /[֐-׿]/.test(s) ? 'rtl' : 'ltr';
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  if (o.bg) {
    // a paper patch behind a label that sits on a curve
    const w = ctx.measureText(s).width + 6;
    const h = (o.size ?? 13) + 4;
    const x0 = o.align === 'right' ? x - w + 3 : o.align === 'left' ? x - 3 : x - w / 2;
    ctx.fillStyle = withAlpha(p.paper, 0.85);
    ctx.fillRect(x0, y - h / 2, w, h);
  }
  ctx.fillStyle = o.color ?? p.ink2;
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** The view along the axle: poles, field lines (dark where they pass through the coil), coil, current, velocity, normal. */
function drawMachine(ctx: CanvasRenderingContext2D, p: Palette, st: State, g: Gen, phi: number, m: Box) {
  const [cx, cy] = machineCentre(m);
  const pw = Math.max(20, m.w * 0.1);
  const faceL = m.x + 8 + pw;
  const faceR = m.x + m.w - 8 - pw;
  const rs = Math.min(m.h * 0.3, (faceR - faceL) * 0.3);
  const ph = Math.min(m.h * 0.72, rs * 2.9);
  // pole pieces
  const fill = mix(p.bfield, p.paper, 0.78);
  for (const [x0, x1, label] of [
    [m.x + 8, faceL, 'N'],
    [faceR, m.x + m.w - 8, 'S'],
  ] as const) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = p.bfield;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x0, cy - ph / 2, x1 - x0, ph);
    ctx.strokeRect(x0, cy - ph / 2, x1 - x0, ph);
    ctx.restore();
    text(ctx, p, label, (x0 + x1) / 2, cy, { color: p.ink, size: 18, weight: 700 });
  }
  text(ctx, p, 'מבט לאורך הציר', m.x + m.w - 10, m.y + 13, { align: 'right', size: 12, weight: 500, color: p.ink3 });

  // the coil's two long sides; ⊙-side at +(b/2)û, û = (−sin φ, cos φ)
  const ux = -Math.sin(phi);
  const uy = Math.cos(phi);
  const side1: [number, number] = [cx + ux * rs, cy - uy * rs];
  const side2: [number, number] = [cx - ux * rs, cy + uy * rs];
  // field lines: those that cross the coil (between the two sides' heights) are the flux
  const rows = 11;
  const yTop = Math.min(side1[1], side2[1]);
  const yBot = Math.max(side1[1], side2[1]);
  for (let k = 0; k < rows; k++) {
    const y = cy - ph / 2 + ((k + 0.5) * ph) / rows;
    const through = y > yTop + 0.5 && y < yBot - 0.5;
    arrow(ctx, faceL + 3, y, faceR - 3, y, { color: p.bfield, width: through ? 2 : 1.1, head: 7, alpha: through ? 0.95 : 0.3 });
  }
  text(ctx, p, 'B', faceR - 10, cy - ph / 2 - 9, { color: p.bfield, size: 14, weight: 700 });

  // the angle θ from B to the normal
  const nAng = Math.atan2(Math.sin(phi), Math.cos(phi));
  ctx.save();
  ctx.strokeStyle = withAlpha(p.hand, 0.85);
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + rs * 1.1, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(cx, cy, rs * 0.38, 0, -nAng, nAng > 0);
  ctx.stroke();
  ctx.restore();
  text(ctx, p, 'θ', sx(cx, rs * 0.52, nAng / 2), sy(cy, rs * 0.52, nAng / 2), { color: p.hand, size: 14, weight: 700, hand: true });

  // the coil, edge-on
  ctx.save();
  ctx.strokeStyle = p.current;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(side1[0], side1[1]);
  ctx.lineTo(side2[0], side2[1]);
  ctx.stroke();
  ctx.restore();
  // the normal
  const nl = rs * 0.9;
  arrow(ctx, cx, cy, sx(cx, nl, nAng), sy(cy, nl, nAng), { color: p.accent, width: 2.2, head: 9 });
  text(ctx, p, 'אנך', sx(cx, nl + 14, nAng), sy(cy, nl + 14, nAng), { color: p.accent, size: 12, weight: 600 });
  ctx.save();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // the velocity of each side: counter-clockwise, tangent to its circle
  const vl = rs * 0.45;
  for (const [q, sgn] of [
    [side1, 1],
    [side2, -1],
  ] as const) {
    // the tangent of counter-clockwise motion at +û is −n̂ (screen y flips)
    const tx = -Math.cos(phi) * sgn;
    const ty = Math.sin(phi) * sgn;
    arrow(ctx, q[0] + tx * 13, q[1] + ty * 13, q[0] + tx * (13 + vl), q[1] + ty * (13 + vl), { color: p.ink2, width: 1.8, head: 8 });
    text(ctx, p, 'v', q[0] + tx * (19 + vl), q[1] + ty * (19 + vl), { color: p.ink2, size: 13, weight: 700 });
  }

  // the induced current in the coil (sign of ε; nothing when it is negligible)
  const e = generatorEmf(g, phi / g.omega);
  const e0 = generatorPeak(g);
  if (Math.abs(e) > 0.03 * e0) {
    depthGlyph(ctx, side1[0], side1[1], 10, e > 0 ? 'out' : 'in', p.current, { fill: p.paper, width: 2.2 });
    depthGlyph(ctx, side2[0], side2[1], 10, e > 0 ? 'in' : 'out', p.current, { fill: p.paper, width: 2.2 });
  } else {
    for (const q of [side1, side2]) {
      ctx.save();
      ctx.fillStyle = p.paper;
      ctx.strokeStyle = p.current;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(q[0], q[1], 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // the sense of rotation
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.fillStyle = p.ink3;
  ctx.lineWidth = 1.6;
  const ra = rs * 1.28;
  const a0 = 0.35 * Math.PI;
  const a1 = 0.62 * Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, ra, -a0, -a1, true);
  ctx.stroke();
  const ex = sx(cx, ra, a1);
  const ey = sy(cy, ra, a1);
  arrow(ctx, ex + 6 * Math.sin(a1), ey + 6 * Math.cos(a1), ex, ey, { color: p.ink3, width: 1.6, head: 8 });
  ctx.restore();
  text(ctx, p, 'ω', sx(cx, ra + 12, 0.5 * Math.PI), sy(cy, ra + 12, 0.5 * Math.PI), { color: p.ink3, size: 13, weight: 700 });

  // a note at the special positions
  const th = Math.abs(nAng) / RAD;
  let note = '';
  if (Math.abs(th - 90) < 2) note = 'מישור הכריכה לאורך השדה: השטף אפס, הכא״מ הכי גדול';
  else if (th < 2 || th > 178) note = 'מישור הכריכה ניצב לשדה: השטף הכי גדול, הכא״מ אפס';
  if (note) text(ctx, p, note, cx, m.y + m.h - 9, { color: p.hand, size: Math.min(13, m.w / 26), weight: 500, hand: true });
}

/** The end of the axle from the side: slip rings or a split ring, brushes, and the lamp. */
function drawRings(ctx: CanvasRenderingContext2D, p: Palette, st: State, g: Gen, phi: number, box: Box, ghost: { f: number; N: number; B: number }) {
  ctx.save();
  ctx.strokeStyle = p.rule;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  if (box.y > 0) {
    ctx.moveTo(box.x + 12, box.y);
    ctx.lineTo(box.x + box.w - 12, box.y);
  } else {
    ctx.moveTo(box.x, box.y + 12);
    ctx.lineTo(box.x, box.y + box.h - 12);
  }
  ctx.stroke();
  ctx.restore();

  const t = phi / g.omega;
  const e = brushEmf(g, t, st.rings);
  const e0 = generatorPeak(g);
  // a phone's panel is narrow: the lamp goes below the rings instead of beside them
  const compact = box.w < 220;
  const ax = box.y + box.h * (compact ? 0.42 : 0.32); // the axle's height
  const rr = compact ? Math.min(box.h * 0.12, box.w * 0.13) : Math.min(box.h * 0.16, box.w * 0.12); // half a ring's height in this side view
  const bw = Math.max(9, rr * 0.55); // a ring's width along the axle
  const roomy = !compact;
  const gold = p.current;
  const dark = mix(p.current, p.ink, 0.45);
  const split = st.rings === 'split';
  const ringX = compact
    ? split
      ? [box.x + box.w * 0.38]
      : [box.x + box.w * 0.28, box.x + box.w * 0.48]
    : split
      ? [box.x + box.w * 0.5]
      : [box.x + box.w * 0.42, box.x + box.w * 0.58];

  // the axle, from the coil (off the panel to the left) through the rings
  ctx.save();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(box.x + box.w * 0.08, ax);
  ctx.lineTo(ringX[ringX.length - 1] + bw * 1.6, ax);
  ctx.stroke();
  ctx.restore();
  if (roomy) text(ctx, p, 'מהסליל', box.x + box.w * 0.08, ax - 12, { size: 11, weight: 500, color: p.ink3, align: 'left' });

  /** a ring seen from the side: a short band around the axle, its upper and lower halves coloured */
  const band = (x: number, top: string, bottom: string) => {
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = p.ink2;
    ctx.fillStyle = top;
    ctx.fillRect(x - bw / 2, ax - rr, bw, rr);
    ctx.fillStyle = bottom;
    ctx.fillRect(x - bw / 2, ax, bw, rr);
    ctx.strokeRect(x - bw / 2, ax - rr, bw, 2 * rr);
    ctx.restore();
  };
  // brushes: under each slip ring; above and below the split ring
  const brushes: { x: number; y: number; down: boolean }[] = [];
  if (!split) {
    band(ringX[0], gold, gold);
    band(ringX[1], dark, dark);
    for (const x of ringX) brushes.push({ x, y: ax + rr, down: true });
  } else {
    // the half touching the lower brush swaps each time sin φ changes sign: when the coil's plane is across B
    const lowerIsGold = Math.sin(phi) >= 0;
    band(ringX[0], lowerIsGold ? dark : gold, lowerIsGold ? gold : dark);
    // the gaps between the halves, at the axle's height in this view
    ctx.save();
    ctx.strokeStyle = p.paper;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ringX[0] - bw / 2, ax);
    ctx.lineTo(ringX[0] + bw / 2, ax);
    ctx.stroke();
    ctx.restore();
    brushes.push({ x: ringX[0], y: ax + rr, down: true }, { x: ringX[0], y: ax - rr, down: false });
  }

  // the lamp, to the right; the wires make one loop through it
  const lampR = Math.min(box.h * 0.1, box.w * 0.07, 14);
  const lampX = box.x + box.w * (compact ? 0.75 : 0.82);
  const lampY = compact ? box.y + box.h * 0.6 : ax + rr * 0.2;
  const yLow = compact ? box.y + box.h * 0.8 : ax + rr + 30; // the lower wire
  const yMid = compact ? lampY : ax + rr + 16; // the second slip-ring wire
  ctx.save();
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  for (const b of brushes) {
    const by = b.down ? b.y : b.y - 9;
    ctx.fillStyle = mix(p.ink3, p.paper, 0.3);
    ctx.fillRect(b.x - 5, by, 10, 9);
    ctx.strokeRect(b.x - 5, by, 10, 9);
  }
  ctx.beginPath();
  // the first brush (lower): down, right under everything, up into the lamp from below
  ctx.moveTo(brushes[0].x, brushes[0].y + 9);
  ctx.lineTo(brushes[0].x, yLow);
  ctx.lineTo(lampX, yLow);
  ctx.lineTo(lampX, lampY + lampR);
  // the second brush: into the lamp from above (split ring, upper brush) or from the left (second slip ring)
  const b2 = brushes[1];
  if (b2.down) {
    ctx.moveTo(b2.x, b2.y + 9);
    ctx.lineTo(b2.x, yMid);
    ctx.lineTo(lampX - lampR - 8, yMid);
    ctx.lineTo(lampX - lampR - 8, lampY);
    ctx.lineTo(lampX - lampR, lampY);
  } else {
    const top = b2.y - 9;
    ctx.moveTo(b2.x, top);
    ctx.lineTo(b2.x, top - 8);
    ctx.lineTo(lampX, top - 8);
    ctx.lineTo(lampX, lampY - lampR);
  }
  ctx.stroke();
  ctx.restore();
  if (!compact) text(ctx, p, 'מברשות', ringX[0] - bw / 2 - 6, ax + rr + 6, { size: 11, weight: 500, color: p.ink3, align: 'right' });

  // the glow follows the instantaneous power, compared with the starting setting's peak
  const pw = instantPower(e, R_LAMP);
  const ref = 2 * instantPower(generatorPeak({ N: ghost.N, B: ghost.B, A: AREA, omega: angularSpeed(ghost.f) }), R_LAMP);
  const glow = Math.min(1, pw / ref);
  if (glow > 0.01) {
    ctx.save();
    const grd = ctx.createRadialGradient(lampX, lampY, lampR * 0.3, lampX, lampY, lampR * 3);
    grd.addColorStop(0, withAlpha(p.current, 0.9 * glow));
    grd.addColorStop(1, withAlpha(p.current, 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(lampX, lampY, lampR * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = mix(p.paper, p.current, 0.15 + 0.6 * glow);
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(lampX, lampY, lampR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const d = lampR * 0.7;
  ctx.beginPath();
  ctx.moveTo(lampX - d, lampY - d);
  ctx.lineTo(lampX + d, lampY + d);
  ctx.moveTo(lampX + d, lampY - d);
  ctx.lineTo(lampX - d, lampY + d);
  ctx.stroke();
  ctx.restore();
  if (compact) text(ctx, p, 'נורה', lampX, lampY + lampR + 10, { size: 11, weight: 500, color: p.ink3 });
  else text(ctx, p, 'נורה', lampX + lampR + 4, lampY + lampR + 10, { size: 11, weight: 500, color: p.ink3, align: 'left' });

  // the current in the lower wire: to the right (toward the lamp) when the brush emf is positive
  if (Math.abs(e) > 0.03 * e0) {
    const mid = (brushes[0].x + lampX) / 2;
    const half = Math.min(12, (lampX - brushes[0].x) / 4);
    const dir = e > 0 ? 1 : -1;
    arrow(ctx, mid - dir * half, yLow, mid + dir * half, yLow, { color: p.current, width: 2.4, head: 8 });
    text(ctx, p, 'I', mid, yLow - 10, { color: p.current, size: 12, weight: 700 });
  }
  text(ctx, p, split ? 'טבעת מפוצלת' : 'טבעות החלקה', box.x + box.w / 2, box.y + box.h - 9, { size: 12, weight: 600, color: p.ink2 });
}

/** The three graphs against time, with the cursor at the coil's present angle. */
function drawGraphs(ctx: CanvasRenderingContext2D, p: Palette, st: State, g: Gen, phi: number, box: Box, ghost: { f: number; N: number; B: number }) {
  const g0 = gen(ghost);
  const tc = cursorTime(phi, st.f);
  const e0 = generatorPeak(g);
  const e0g = generatorPeak(g0);
  const hRow = box.h / 3;
  const rowBox = (k: number): Box =>
    insetBox({ x: box.x, y: box.y + k * hRow, w: box.w, h: hRow }, { l: 50, r: 12, t: 12, b: k === 2 ? 40 : 22 });
  const tTicks = niceTicks(0, WINDOW, 4);
  const axisT = (k: number) => ({ min: 0, max: WINDOW, ticks: tTicks, label: k === 2 ? 'הזמן t (s)' : undefined, format: (v: number) => sci(v, 2) });
  const sym = (m: number) => {
    const top = niceUp(1.12 * m);
    return { min: -top, max: top, ticks: [-top, 0, top] };
  };

  // Φ per turn, in mWb
  const phiMax = Math.max(st.B, ghost.B) * AREA * 1000;
  const P1 = makePlot(rowBox(0), axisT(0), { ...sym(phiMax), label: 'Φ (mWb)' });
  drawAxes(ctx, P1, p);
  const fluxAt = (gg: Gen) => (t: number) => fluxPerTurn(gg, t) * 1000;
  curve(ctx, P1, fluxAt(g0), { color: withAlpha(p.bfield, 0.45), width: 1.2, dash: [4, 4] });
  curve(ctx, P1, fluxAt(g), { color: p.bfield, width: 2.2 });
  // the tangent at the cursor: its slope is −ε/N
  const F = fluxAt(g);
  const slope = (F(tc + 1e-4) - F(tc - 1e-4)) / 2e-4;
  const dt = WINDOW * 0.08;
  clipTo(ctx, P1.box, () => {
    ctx.strokeStyle = p.hand;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(P1.px(tc - dt), P1.py(F(tc) - slope * dt));
    ctx.lineTo(P1.px(tc + dt), P1.py(F(tc) + slope * dt));
    ctx.stroke();
  });

  // ε at the brushes
  const eMax = Math.max(e0, e0g);
  const P2 = makePlot(rowBox(1), axisT(1), { ...sym(eMax), label: 'ε (V)' });
  drawAxes(ctx, P2, p);
  const brushAt = (gg: Gen) => (t: number) => brushEmf(gg, t, st.rings);
  curve(ctx, P2, brushAt(g0), { color: withAlpha(p.efield, 0.45), width: 1.2, dash: [4, 4] });
  if (st.rings === 'split') curve(ctx, P2, (t) => generatorEmf(g, t), { color: withAlpha(p.efield, 0.35), width: 1.2, dash: [2, 3] });
  curve(ctx, P2, brushAt(g), { color: p.efield, width: 2.2 });
  // the effective value
  const er = rms(e0);
  clipTo(ctx, P2.box, () => {
    ctx.strokeStyle = p.hand;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 4]);
    for (const v of st.rings === 'slip' ? [er, -er] : [er]) {
      ctx.beginPath();
      ctx.moveTo(P2.box.x, P2.py(v));
      ctx.lineTo(P2.box.x + P2.box.w, P2.py(v));
      ctx.stroke();
    }
  });
  text(ctx, p, 'ε₀/√2', P2.box.x + P2.box.w - 4, P2.py(er) - 8, { color: p.hand, size: 11, weight: 700, align: 'right', bg: true });

  // the lamp's power, with its mean
  const pMax = Math.max(instantPower(e0, R_LAMP), instantPower(e0g, R_LAMP));
  const top = niceUp(1.12 * pMax);
  const P3 = makePlot(rowBox(2), axisT(2), { min: 0, max: top, ticks: [0, top / 2, top], label: 'P (W)' });
  drawAxes(ctx, P3, p);
  const pow = (gg: Gen) => (t: number) => instantPower(generatorEmf(gg, t), R_LAMP);
  const mean = acMeanPower(e0, R_LAMP);
  // shade the humps above the mean and the gaps below it: equal areas
  const n = 240;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(P3.px(0), P3.py(mean));
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * WINDOW;
      ctx.lineTo(P3.px(t), P3.py(pow(g)(t)));
    }
    ctx.lineTo(P3.px(WINDOW), P3.py(mean));
    ctx.closePath();
  };
  const yMean = P3.py(mean);
  ctx.save();
  ctx.beginPath();
  ctx.rect(P3.box.x, P3.box.y - 2, P3.box.w, yMean - P3.box.y + 2);
  ctx.clip();
  path();
  ctx.fillStyle = withAlpha(p.current, 0.42);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(P3.box.x, yMean, P3.box.w, P3.box.y + P3.box.h - yMean);
  ctx.clip();
  path();
  ctx.fillStyle = withAlpha(p.accent, 0.16);
  ctx.fill();
  ctx.restore();
  curve(ctx, P3, pow(g0), { color: withAlpha(p.current, 0.5), width: 1.2, dash: [4, 4] });
  curve(ctx, P3, pow(g), { color: mix(p.current, p.ink, 0.25), width: 2.2 });
  clipTo(ctx, P3.box, () => {
    ctx.strokeStyle = p.hand;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(P3.box.x, yMean);
    ctx.lineTo(P3.box.x + P3.box.w, yMean);
    ctx.stroke();
  });
  text(ctx, p, 'הממוצע', P3.box.x + P3.box.w - 4, yMean - 8, { color: p.hand, size: 11, weight: 700, align: 'right', bg: true });

  // the cursor
  const x = P1.px(tc);
  ctx.save();
  ctx.strokeStyle = withAlpha(p.ink, 0.55);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, P1.box.y);
  ctx.lineTo(x, P3.box.y + P3.box.h);
  ctx.stroke();
  ctx.restore();
  dot(ctx, P1, tc, F(tc), p.bfield);
  dot(ctx, P2, tc, brushAt(g)(tc), p.efield);
  dot(ctx, P3, tc, pow(g)(tc), mix(p.current, p.ink, 0.25));
}

/** The smallest of 1, 2, 2.5, 5 × 10ⁿ at least x. */
function niceUp(x: number): number {
  const mag = 10 ** Math.floor(Math.log10(x));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * mag >= x * (1 - 1e-9)) return Number((f * mag).toPrecision(6));
  return 10 * mag;
}

function clipTo(ctx: CanvasRenderingContext2D, b: Box, fn: () => void) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y - 2, b.w, b.h + 4);
  ctx.clip();
  fn();
  ctx.restore();
}

/** A curve sampled finely enough for 4 cycles in the window. */
function curve(ctx: CanvasRenderingContext2D, P: Plot, f: (t: number) => number, s: { color: string; width: number; dash?: number[] }) {
  clipTo(ctx, P.box, () => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineJoin = 'round';
    ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    const n = 320;
    for (let k = 0; k <= n; k++) {
      const t = P.x.min + ((P.x.max - P.x.min) * k) / n;
      const X = P.px(t);
      const Y = P.py(f(t));
      if (k) ctx.lineTo(X, Y);
      else ctx.moveTo(X, Y);
    }
    ctx.stroke();
  });
}

function dot(ctx: CanvasRenderingContext2D, P: Plot, t: number, v: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(P.px(t), P.py(v), 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
