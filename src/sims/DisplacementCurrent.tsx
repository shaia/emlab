/**
 * The charging-capacitor paradox (lesson 6.12), in a side cross-section through the axis: a wire comes
 * from the battery, ends on the left plate of a capacitor with circular plates, and leaves from the right
 * plate. An Ampère loop (a circle round the axis, seen almost edge-on) sits around the wire or between the
 * plates, and an open surface is spanned on it: the flat disc that the wire pierces, or a bag that passes
 * between the plates without touching the wire. The readout compares ∮B·dl on the loop with μ₀ times the
 * current through the chosen surface, with or without Maxwell's term ε₀·dΦ_E/dt. Under the scene, a graph
 * of the charging in time (I, ε₀dΦ_E/dt and E, each relative to its largest value) or of B against the
 * distance from the axis between the plates.
 *
 * Every number comes from src/physics/displacement.ts (gapState, surfaceCurrents, gapField): the RC law of
 * lesson 3.9 for I(t) and the plate field of lesson 2.6 for Φ_E(t). The gap is drawn far wider than it is
 * (1 mm next to plates of radius 10 cm). Time runs in slow motion (5τ in about eight seconds) while motion
 * is allowed; in still mode it does not run, and the time slider scrubs it by hand.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { MU0 } from '~/physics/constants';
import { straightWireField } from '~/physics/magnetism';
import { capacitanceOf, gapField, gapState, surfaceCurrents, timeConstant, type ChargingCapacitor, type LoopAt, type Surface } from '~/physics/displacement';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, chevron, depthGlyph, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const ASPECT = 1.05;
const T_MAX = 5; // in time constants
const PLAY_SECONDS = 8; // real seconds for 0 → 5τ
const R_MAX = 1.5; // loop radius, in plate radii

type Graph = 'time' | 'radius';

const TASK_LABEL: Record<string, string> = {
  paradox: 'מסלול סביב התיל, בלי התיקון של מקסוול: החליפו את המשטח השטוח בשקית. מה קורה לזרם דרך המשטח?',
  fix: 'עכשיו הפעילו את חוק אמפר-מקסוול, עם השקית. האם הסתירה נעלמה?',
  'gap-inside': 'הזיזו את המסלול אל בין הלוחות, והקטינו אותו לרדיוס קטן מרדיוס הלוחות. איזה חלק מהזרם הוא מקיף?',
  late: 'גררו את הזמן ל-4τ ויותר. מה קורה לשדה החשמלי, ומה לזרם ההעתקה?',
};

export interface DisplacementCurrentProps {
  id: string;
  /** battery EMF [V], resistance [kΩ], plate radius [cm], gap [mm] */
  emf?: number;
  R?: number;
  a?: number;
  d?: number;
  at?: LoopAt;
  surface?: Surface;
  maxwell?: boolean;
  graph?: Graph;
  /** loop radius [cm] and time [in τ] */
  r?: number;
  t?: number;
  tasks?: string[];
}

interface State {
  at: LoopAt;
  surface: Surface;
  maxwell: boolean;
  graph: Graph;
  /** loop radius [cm] */
  r: number;
  /** time since the switch closed [τ] */
  t: number;
  running: boolean;
}

const mA = (I: number) => `${sci(Math.abs(I) * 1e3 < 1e-9 ? 0 : I * 1e3)} mA`;
const nT = (B: number) => `${sci(B * 1e9 < 1e-9 ? 0 : B * 1e9)} nT`;
const Tm = (x: number) => `${sci(Math.abs(x) < 1e-30 ? 0 : x)} T·m`;

export default function DisplacementCurrent(props: DisplacementCurrentProps) {
  const cap: ChargingCapacitor = {
    emf: props.emf ?? 12,
    R: (props.R ?? 10) * 1e3,
    a: (props.a ?? 10) / 100,
    d: (props.d ?? 1) / 1000,
  };
  const aCm = cap.a * 100;
  const tau = timeConstant(cap);
  const I0 = cap.emf / cap.R;
  const init = (): State => ({
    at: props.at ?? 'wire',
    surface: props.surface ?? 'flat',
    maxwell: props.maxwell ?? false,
    graph: props.graph ?? 'time',
    r: props.r ?? 6,
    t: props.t ?? 0.5,
    running: false,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const sRef = useRef(s);
  sRef.current = s;
  const lastT = useRef(0);
  const lastPush = useRef(0);
  const phase = useRef(0);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t);
  const done = (t: string) => markTask(`${props.id}:${t}`);

  const now = gapState(cap, s.t * tau);
  const surf: Surface = s.at === 'gap' ? 'flat' : s.surface;
  const cur = surfaceCurrents(s.at, surf, s.r / 100, cap.a, now.I);
  const Bloop = s.at === 'wire' ? straightWireField(now.I, s.r / 100) : gapField(now.I, s.r / 100, cap.a);
  const loopSum = Bloop * 2 * Math.PI * (s.r / 100);
  const rhs = MU0 * (cur.conduction + (s.maxwell ? cur.displacement : 0));
  const clash = Math.abs(loopSum - rhs) > 1e-3 * Math.max(loopSum, rhs, 1e-30);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (st.at === 'wire' || st.at === 'gap') next.at = st.at;
          if (st.surface === 'flat' || st.surface === 'bulge') next.surface = st.surface;
          if (typeof st.maxwell === 'boolean') next.maxwell = st.maxwell;
          if (st.graph === 'time' || st.graph === 'radius') next.graph = st.graph;
          if (typeof st.r === 'number') next.r = st.r;
          if (typeof st.t === 'number') next.t = st.t;
          next.running = st.running === true;
          return next;
        });
      }),
    [props.id],
  );

  /** a user action: apply it and check the tasks it may complete */
  const act = (f: (prev: State) => State) => {
    setS((prev) => {
      const next = f(prev);
      checkTasks(next);
      return next;
    });
  };

  const checkTasks = (st: State) => {
    if (has('paradox') && st.at === 'wire' && st.surface === 'bulge' && !st.maxwell && st.t < 4) done('paradox');
    if (has('fix') && st.at === 'wire' && st.surface === 'bulge' && st.maxwell && st.t < 4) done('fix');
    if (has('gap-inside') && st.at === 'gap' && st.r < aCm) done('gap-inside');
    if (has('late') && st.t >= 4) done('late');
  };

  const say = (st: State) => {
    const g = gapState(cap, st.t * tau);
    setLive(`אחרי ${sci(st.t)} קבועי זמן: הזרם בתיל ${mA(g.I)}, וזרם ההעתקה בין הלוחות ${mA(g.Id)}.`);
  };

  const draw = ({ ctx, view, palette: p, t: clock }: FrameInfo) => {
    const st = sRef.current;
    const dt = Math.max(0, Math.min(0.1, clock - lastT.current));
    lastT.current = clock;
    if (st.running && motionAllowed() && dt > 0 && st.t < T_MAX) {
      st.t = Math.min(T_MAX, st.t + (dt * T_MAX) / PLAY_SECONDS);
      if (clock - lastPush.current > 0.12 || st.t >= T_MAX) {
        lastPush.current = clock;
        const tNow = st.t;
        setS((prev) => ({ ...prev, t: tNow, running: tNow < T_MAX && prev.running }));
      }
    }
    const g = gapState(cap, st.t * tau);
    const W = view.w;
    const H = view.h;
    const sceneH = H * 0.56;
    drawScene(ctx, p, W, sceneH, st, g.I / I0, g.q / (capacitanceOf(cap) * cap.emf), aCm, dt, phase);

    // the graph
    const narrow = W < 480;
    const box = insetBox({ x: 0, y: sceneH, w: W, h: H - sceneH }, { l: narrow ? 46 : 56, r: 14, t: 26, b: narrow ? 38 : 42 });
    if (st.graph === 'time') {
      const plot = makePlot(
        box,
        { min: 0, max: T_MAX, label: 'הזמן מאז סגירת המתג, ביחידות של τ', ticks: [0, 1, 2, 3, 4, 5] },
        { min: 0, max: 1.08, label: 'חלק מהערך המרבי', ticks: [0, 0.5, 1] },
      );
      drawAxes(ctx, plot, p, { grid: true });
      const Eend = cap.emf / cap.d;
      drawCurve(ctx, plot, (x) => gapState(cap, x * tau).E / Eend, { color: p.ink2, width: 1.8, dash: [2, 4] });
      drawCurve(ctx, plot, (x) => gapState(cap, x * tau).I / I0, { color: p.current, width: 3.2 });
      drawCurve(ctx, plot, (x) => gapState(cap, x * tau).Id / I0, { color: p.efield, width: 2, dash: [7, 6] });
      drawMarker(ctx, plot, st.t, g.I / I0, p.current, { radius: 5 });
      drawMarker(ctx, plot, st.t, g.E / Eend, p.ink2, { radius: 4 });
      legend(ctx, p, box.x + box.w - 6, sceneH + 4, narrow, [
        { color: p.current, dash: [], label: 'הזרם בתיל I' },
        { color: p.efield, dash: [7, 6], label: 'זרם ההעתקה ε₀dΦ/dt' },
        { color: p.ink2, dash: [2, 4], label: 'השדה החשמלי E' },
      ]);
    } else {
      const Bmax = straightWireField(I0, cap.a);
      const plot = makePlot(
        box,
        { min: 0, max: 2 * aCm, label: 'המרחק מהציר r (סנטימטרים)', ticks: [0, aCm / 2, aCm, 1.5 * aCm, 2 * aCm] },
        { min: 0, max: Bmax * 1.15 * 1e9, label: 'B בין הלוחות (ננו-טסלה)' },
      );
      drawAxes(ctx, plot, p, { grid: true });
      // the wrong guess "like a wire" inside the plates, faint
      drawCurve(ctx, plot, (x) => (x > 0.3 && x < aCm ? straightWireField(g.I, x / 100) * 1e9 : NaN), { color: withAlpha(p.ink3, 0.9), width: 1.4, dash: [3, 5] });
      drawCurve(ctx, plot, (x) => gapField(g.I, x / 100, cap.a) * 1e9, { color: p.bfield, width: 3 });
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.7);
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(plot.px(aCm), box.y);
      ctx.lineTo(plot.px(aCm), box.y + box.h);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.font = `12px ${p.fontUi}`;
      ctx.fillStyle = p.ink2;
      ctx.direction = 'rtl';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('שפת הלוחות', plot.px(aCm) + 4, box.y + 2);
      ctx.restore();
      if (st.at === 'gap') drawMarker(ctx, plot, Math.min(st.r, 2 * aCm), gapField(g.I, st.r / 100, cap.a) * 1e9, p.accent, { radius: 6, guides: true });
      legend(ctx, p, box.x + box.w - 6, sceneH + 4, narrow, [
        { color: p.bfield, dash: [], label: 'B מחוק אמפר-מקסוול' },
        { color: p.ink3, dash: [3, 5], label: 'μ₀I/(2πr), כמו ליד תיל' },
      ]);
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: true });
  useEffect(invalidate, [s]);

  const closeSwitch = () =>
    act((prev) => {
      const next = { ...prev, t: 0, running: motionAllowed() };
      say(next);
      return next;
    });

  const toggle = (label: string, on: boolean, onClick: () => void) => (
    <button type="button" class={`toggle ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );

  const surfLabel = s.at === 'gap' ? 'הדיסקה שבין הלוחות' : s.surface === 'flat' ? 'המשטח השטוח (התיל חוצה אותו)' : 'השקית (עוברת בין הלוחות)';

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: קבל עם לוחות עגולים נטען דרך נגד. אחרי ${sci(s.t)} קבועי זמן הזרם בתיל ${mA(now.I)}. מסלול אמפר ברדיוס ${sci(s.r)} סנטימטרים ${s.at === 'wire' ? 'סביב התיל' : 'בין הלוחות'}; המשטח: ${surfLabel}. זרם ההולכה דרכו ${mA(cur.conduction)} וזרם ההעתקה ${mA(cur.displacement)}.`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            הזמן: <b class="q">t = {sci(s.t)}τ = {sci(s.t * tau * 1e6)} μs</b>
          </span>
          <span>
            הזרם בתיל: <b class="q">I = {mA(now.I)}</b>
          </span>
          <span>
            דרך {surfLabel}: זרם הולכה <b class="q">Ic = {mA(cur.conduction)}</b>, זרם העתקה <b class="q">Id = {mA(cur.displacement)}</b>
          </span>
          <span>
            השדה על המסלול: <b class="q">B = {nT(Bloop)}</b>, ולכן הסירקולציה <b class="q">∮B·dl = {Tm(loopSum)}</b>
          </span>
          <span>
            {s.maxwell ? 'חוק אמפר-מקסוול' : 'חוק אמפר בלי התיקון'} מנבא: <b class="q">{s.maxwell ? 'μ₀(Ic + Id)' : 'μ₀Ic'} = {Tm(rhs)}</b>
            {clash ? <b>. סתירה: זה לא שווה לסירקולציה</b> : <b>, שווה לסירקולציה</b>}
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="המתג">
            <button type="button" class="toggle" onClick={closeSwitch}>
              סגרו את המתג (t = 0)
            </button>
          </div>
          <div class="group" role="group" aria-label="איפה המסלול">
            {toggle('מסלול סביב התיל', s.at === 'wire', () => act((prev) => ({ ...prev, at: 'wire' })))}
            {toggle('מסלול בין הלוחות', s.at === 'gap', () => act((prev) => ({ ...prev, at: 'gap' })))}
          </div>
          {s.at === 'wire' && (
            <div class="group" role="group" aria-label="המשטח">
              {toggle('משטח שטוח', s.surface === 'flat', () => act((prev) => ({ ...prev, surface: 'flat' })))}
              {toggle('שקית בין הלוחות', s.surface === 'bulge', () => act((prev) => ({ ...prev, surface: 'bulge' })))}
            </div>
          )}
          <div class="group" role="group" aria-label="החוק">
            {toggle('חוק אמפר בלבד', !s.maxwell, () => act((prev) => ({ ...prev, maxwell: false })))}
            {toggle('חוק אמפר-מקסוול', s.maxwell, () => act((prev) => ({ ...prev, maxwell: true })))}
          </div>
          <div class="group" role="group" aria-label="הגרף">
            {toggle('גרף לפי הזמן', s.graph === 'time', () => act((prev) => ({ ...prev, graph: 'time' })))}
            {toggle('גרף לפי המרחק מהציר', s.graph === 'radius', () => act((prev) => ({ ...prev, graph: 'radius' })))}
          </div>
          <Slider
            label="הזמן מאז סגירת המתג (ביחידות של τ)"
            value={s.t}
            min={0}
            max={T_MAX}
            step={0.05}
            format={(v) => `${sci(v)}τ`}
            onChange={(v) =>
              act((prev) => {
                const next = { ...prev, t: v, running: false };
                say(next);
                return next;
              })
            }
          />
          <Slider label="רדיוס המסלול" value={s.r} min={1} max={R_MAX * aCm} step={0.5} format={(v) => `${sci(v)} cm`} onChange={(v) => act((prev) => ({ ...prev, r: v }))} />
        </>
      }
    />
  );
}

/** A small legend at the top right of the graph area, one row per curve (RTL text, swatch on the right). */
function legend(ctx: CanvasRenderingContext2D, p: Palette, xRight: number, yTop: number, narrow: boolean, rows: { color: string; dash: number[]; label: string }[]) {
  ctx.save();
  ctx.font = `${narrow ? 11 : 12}px ${p.fontUi}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  // in a narrow figure the rows sit side by side would collide: stack them in one line each, two columns
  let x = xRight;
  let y = yTop + 7;
  for (const row of rows) {
    const w = ctx.measureText(row.label).width + 30;
    if (x - w < 50) {
      x = xRight;
      y += 15;
    }
    ctx.strokeStyle = row.color;
    ctx.lineWidth = 2.4;
    ctx.setLineDash(row.dash);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 20, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.ink2;
    ctx.fillText(row.label, x - 24, y);
    x -= w + 8;
  }
  ctx.restore();
}

/** The cross-section: wire, plates, field arrows, the loop and the surface spanned on it. */
function drawScene(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  W: number,
  H: number,
  st: State,
  iRel: number,
  qRel: number,
  aCm: number,
  dt: number,
  phase: { current: number },
) {
  const y0 = H * 0.55;
  const aPx = H * 0.3;
  const xL = W * 0.54;
  const xR = W * 0.72;
  const xWire = W * 0.24;
  const rPx = (st.r / aCm) * aPx;
  const xLoop = st.at === 'wire' ? xWire : (xL + xR) / 2;
  ctx.save();
  ctx.lineCap = 'round';

  // the surface first, under everything
  const surfFill = withAlpha(p.accent, 0.13);
  const hx = Math.max(4, rPx * 0.22);
  if (st.at === 'wire' && st.surface === 'bulge') {
    const R2 = Math.max(rPx, aPx) + 16;
    const xCap = xL + (xR - xL) * 0.5;
    ctx.beginPath();
    ctx.moveTo(xLoop, y0 - rPx);
    ctx.bezierCurveTo(xLoop + 30, y0 - rPx, xL - 60, y0 - R2, xL - 18, y0 - R2);
    ctx.lineTo(xCap, y0 - R2);
    ctx.lineTo(xCap, y0 + R2);
    ctx.lineTo(xL - 18, y0 + R2);
    ctx.bezierCurveTo(xL - 60, y0 + R2, xLoop + 30, y0 + rPx, xLoop, y0 + rPx);
    ctx.closePath();
    ctx.fillStyle = surfFill;
    ctx.fill();
    ctx.strokeStyle = withAlpha(p.accent, 0.75);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // the cap in the gap, which the field lines cross
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(xCap, y0 - R2);
    ctx.lineTo(xCap, y0 + R2);
    ctx.stroke();
    label(ctx, p, 'השקית', xL - 30, y0 - R2 - 9, p.accent);
  } else {
    ctx.beginPath();
    ctx.ellipse(xLoop, y0, hx, rPx, 0, 0, Math.PI * 2);
    ctx.fillStyle = surfFill;
    ctx.fill();
    label(ctx, p, st.at === 'wire' ? 'משטח שטוח' : 'דיסקה', xLoop, y0 + rPx + 14, p.accent);
  }

  // wires along the axis
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(W * 0.02, y0);
  ctx.lineTo(xL, y0);
  ctx.moveTo(xR, y0);
  ctx.lineTo(W * 0.98, y0);
  ctx.stroke();

  // the field between the plates: arrows from + to −, faint when weak
  if (qRel > 0.01) {
    for (let k = -2; k <= 2; k++) {
      const y = y0 + (k * aPx * 0.85) / 2;
      arrow(ctx, xL + 7, y, xR - 7, y, { color: p.efield, width: 2, head: 9, alpha: 0.15 + 0.85 * qRel });
    }
  }
  // the plates, with charge glyphs as many as the fraction of a full charge
  ctx.fillStyle = p.ink;
  ctx.fillRect(xL - 3, y0 - aPx, 6, 2 * aPx);
  ctx.fillRect(xR - 3, y0 - aPx, 6, 2 * aPx);
  // slots between the field arrows, filled from the middle outwards so the charge looks spread over the plate
  const slots = [-0.21, 0.21, -0.64, 0.64, -0.95, 0.95];
  const n = Math.round(slots.length * qRel);
  ctx.font = `700 14px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let k = 0; k < n; k++) {
    const y = y0 + slots[k] * aPx;
    ctx.fillStyle = p.pos;
    ctx.fillText('+', xL + 11, y);
    ctx.fillStyle = p.neg;
    ctx.fillText('−', xR - 11, y);
  }

  // moving current marks on both wires, speed ∝ I; none cross the gap
  if (motionAllowed()) phase.current = (phase.current + iRel * 1.4 * dt) % 1;
  if (iRel > 0.01) {
    const spacing = 26;
    ctx.fillStyle = withAlpha(p.current, Math.min(1, 0.35 + iRel));
    const dots = (x0: number, x1: number) => {
      for (let x = x0 + ((phase.current * spacing) % spacing); x < x1 - 4; x += spacing) {
        ctx.beginPath();
        ctx.arc(x, y0, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    dots(W * 0.02, xL);
    dots(xR + 4, W * 0.98);
    arrow(ctx, W * 0.05, y0 - 16, W * 0.15, y0 - 16, { color: p.current, width: 2.2, head: 8, alpha: Math.min(1, 0.35 + iRel) });
    ctx.fillStyle = p.current;
    ctx.font = `italic 700 14px ${p.fontUi}`;
    ctx.fillText('I', W * 0.1, y0 - 28);
  }
  // where the wire pierces the flat surface
  if (st.at === 'wire' && st.surface === 'flat') {
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(xLoop, y0, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // the loop: a circle round the axis seen almost edge-on; the far half dashed
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 2.4;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.ellipse(xLoop, y0, hx, rPx, 0, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.ellipse(xLoop, y0, hx, rPx, 0, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  // walking direction: right-handed about the current (+x): down on the near side, up on the far side
  chevron(ctx, xLoop + hx, y0 + 2, 0, 1, 8, p.accent);
  chevron(ctx, xLoop - hx, y0 - 2, 0, -1, 8, p.accent);
  label(ctx, p, 'מסלול אמפר', xLoop, y0 - rPx - 12, p.accent);

  // B on the loop: out of the page above the axis, into it below
  const bRel = st.at === 'wire' ? iRel : iRel * Math.min(st.r / aCm, aCm / st.r);
  const alpha = 0.2 + 0.8 * Math.min(1, bRel);
  depthGlyph(ctx, xLoop, y0 - rPx, 7, 'out', p.bfield, { fill: p.paper, alpha });
  depthGlyph(ctx, xLoop, y0 + rPx, 7, 'in', p.bfield, { fill: p.paper, alpha });
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.font = `600 12px ${p.fontUi}`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
