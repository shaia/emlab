/**
 * RC lab: a battery, a two-way switch, a resistor and a capacitor. In one position of the switch the
 * battery charges the capacitor through R; in the other the capacitor discharges through R alone.
 * Under the circuit, a graph of the capacitor's voltage, the current or the charge against the time
 * since the switch last moved, with the time constant τ = RC marked. Built for lesson 3.9.
 *
 * Every value is rcFrom (src/physics/circuits.ts): the exact exponential, from whatever voltage the
 * capacitor had when the switch moved. Time runs at one second per second while motion is allowed;
 * in still mode it does not run, and the time slider scrubs it by hand.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { rcFrom } from '~/physics/circuits';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const ASPECT = 1.15;
const T_MAX = 10;
const kOhm = 1e3;
const uF = 1e-6;

type Mode = 'charge' | 'discharge';
type Graph = 'V' | 'I' | 'q';

const GRAPH_LABEL: Record<Graph, string> = { V: 'המתח על הקבל', I: 'הזרם', q: 'המטען על הקבל' };

const TASK_LABEL: Record<string, string> = {
  'charge-full': 'העבירו את המתג לטעינה, וחכו (או גררו את הזמן) עד שהקבל כמעט מלא. מה קורה לזרם?',
  discharge: 'אחרי שהקבל נטען, העבירו את המתג לפריקה. לאיזה כיוון זורם עכשיו הזרם?',
  'change-tau': 'שנו את ההתנגדות או את הקיבול. איך זה משנה את קצב הטעינה?',
};

export interface RCLabProps {
  id: string;
  /** resistance [kΩ], capacitance [μF], EMF [V] */
  R?: number;
  C?: number;
  emf?: number;
  graph?: Graph;
  tasks?: string[];
}

interface State {
  R: number;
  C: number;
  emf: number;
  mode: Mode;
  /** the capacitor's voltage when the switch last moved [V] */
  v0: number;
  /** seconds since then */
  t: number;
  running: boolean;
  graph: Graph;
}

const volts = (V: number) => `${sci(Math.abs(V) < 1e-9 ? 0 : V)} V`;
const mA = (I: number) => `${sci(Math.abs(I) * 1e3 < 1e-9 ? 0 : Math.abs(I) * 1e3)} mA`;
const uC = (q: number) => `${sci(q / uF)} μC`;

export default function RCLab(props: RCLabProps) {
  const init = (): State => ({
    R: props.R ?? 10,
    C: props.C ?? 100,
    emf: props.emf ?? 12,
    mode: 'discharge',
    v0: 0,
    t: 0,
    running: false,
    graph: props.graph ?? 'V',
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const userActed = useRef(false);
  const sRef = useRef(s);
  sRef.current = s;
  const lastT = useRef(0);
  const lastPush = useRef(0);
  const phase = useRef(0);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const R = s.R * kOhm;
  const C = s.C * uF;
  const tau = R * C;
  const target = s.mode === 'charge' ? s.emf : 0;
  const now = rcFrom(s.t, target, s.v0, R, C);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => {
          const next = { ...prev };
          for (const k of ['R', 'C', 'emf', 't', 'v0'] as const) if (typeof st[k] === 'number') next[k] = st[k] as number;
          if (st.mode === 'charge' || st.mode === 'discharge') next.mode = st.mode;
          if (st.graph === 'V' || st.graph === 'I' || st.graph === 'q') next.graph = st.graph;
          next.running = st.running === true;
          return next;
        });
      }),
    [props.id],
  );

  const has = (t: string) => props.tasks?.includes(t);
  const done = (t: string) => markTask(`${props.id}:${t}`);

  /** a new segment of the curve, from the capacitor's present voltage */
  const restart = (patch: Partial<State>, prev: State): State => {
    const cur = rcFrom(prev.t, prev.mode === 'charge' ? prev.emf : 0, prev.v0, prev.R * kOhm, prev.C * uF);
    return { ...prev, ...patch, v0: cur.vC, t: 0 };
  };

  const act = (f: (prev: State) => State) => {
    userActed.current = true;
    setS((prev) => {
      const next = f(prev);
      if (has('discharge') && prev.mode === 'charge' && next.mode === 'discharge' && next.v0 > 0.5 * next.emf) done('discharge');
      if (has('change-tau') && (next.R !== prev.R || next.C !== prev.C)) done('change-tau');
      checkFull(next);
      return next;
    });
  };

  const checkFull = (st: State) => {
    if (has('charge-full') && st.mode === 'charge' && st.t >= 4 * st.R * kOhm * st.C * uF) done('charge-full');
  };

  useEffect(() => {
    if (!userActed.current) return;
    setLive(`${s.mode === 'charge' ? 'טעינה' : 'פריקה'}: אחרי ${sci(s.t)} שניות המתח על הקבל ${volts(now.vC)}.`);
  }, [s.mode, s.R, s.C, s.emf]);

  const draw = ({ ctx, view, palette: p, t: clock }: FrameInfo) => {
    const st = sRef.current;
    const dt = Math.max(0, Math.min(0.1, clock - lastT.current));
    lastT.current = clock;
    // time runs only while allowed; readouts follow at a few frames a second
    if (st.running && motionAllowed() && dt > 0 && st.t < T_MAX) {
      st.t = Math.min(T_MAX, st.t + dt);
      if (clock - lastPush.current > 0.12 || st.t >= T_MAX) {
        lastPush.current = clock;
        const tNow = st.t;
        setS((prev) => {
          const next = { ...prev, t: tNow, running: tNow < T_MAX && prev.running };
          checkFull(next);
          return next;
        });
      }
    }
    const Rn = st.R * kOhm;
    const Cn = st.C * uF;
    const tg = st.mode === 'charge' ? st.emf : 0;
    const cur = rcFrom(st.t, tg, st.v0, Rn, Cn);
    const W = view.w;
    const H = view.h;
    drawCircuit(ctx, p, W, H * 0.4, st, cur, dt, phase);

    // the graph
    const narrow = W < 480;
    const box = insetBox({ x: 0, y: H * 0.42, w: W, h: H * 0.58 }, { l: narrow ? 46 : 56, r: 14, t: 12, b: narrow ? 38 : 42 });
    const I0 = st.emf / Rn;
    const ymax = st.graph === 'V' ? Math.max(st.emf, 1) : st.graph === 'I' ? I0 * 1e3 : st.emf * Cn * 1e6;
    const plot = makePlot(
      box,
      { min: 0, max: T_MAX, label: 'הזמן t (שניות)', ticks: [0, 2, 4, 6, 8, 10] },
      { min: 0, max: ymax * 1.05, label: st.graph === 'V' ? 'V (וולט)' : st.graph === 'I' ? 'I (מיליאמפר)' : 'q (מיקרו-קולון)' },
    );
    drawAxes(ctx, plot, p, { grid: true });
    const f = (t: number) => {
      const r = rcFrom(t, tg, st.v0, Rn, Cn);
      return st.graph === 'V' ? r.vC : st.graph === 'I' ? Math.abs(r.I) * 1e3 : r.q * 1e6;
    };
    drawCurve(ctx, plot, f, { color: st.graph === 'I' ? p.current : p.hand, width: 2.6 });
    // τ: a vertical line at t = τ, and where the curve stands then
    const tauN = Rn * Cn;
    if (tauN <= T_MAX) {
      const x = plot.px(tauN);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.accent, 0.8);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, box.y);
      ctx.lineTo(x, box.y + box.h);
      ctx.moveTo(box.x, plot.py(f(tauN)));
      ctx.lineTo(x, plot.py(f(tauN)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = p.accent;
      ctx.font = `italic 700 14px ${p.fontUi}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('τ', x + 4, box.y + 2);
      ctx.restore();
    }
    drawMarker(ctx, plot, Math.min(st.t, T_MAX), f(st.t), st.graph === 'I' ? p.current : p.hand, { radius: 6 });
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: true });
  useEffect(invalidate, [s]);

  const toggleMode = (mode: Mode) => act((prev) => (prev.mode === mode ? prev : restart({ mode, running: true }, prev)));

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: מעגל RC ב${s.mode === 'charge' ? 'טעינה' : 'פריקה'}. אחרי ${sci(s.t)} שניות, המתח על הקבל ${volts(now.vC)} והזרם ${mA(now.I)}. קבוע הזמן ${sci(tau)} שניות.`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onReset={() => {
        userActed.current = false;
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            קבוע הזמן: <b class="q">τ = RC = {sci(tau)} s</b>
          </span>
          <span>
            {s.mode === 'charge' ? 'טעינה' : 'פריקה'}, אחרי <b class="q">t = {sci(s.t)} s</b>
          </span>
          <span>
            הקבל: <b class="q">V = {volts(now.vC)}, q = {uC(now.q)}</b>
          </span>
          <span>
            הזרם{s.mode === 'discharge' && Math.abs(now.I) > 1e-9 ? ' (בכיוון ההפוך לטעינה)' : ''}: <b class="q">I = {mA(now.I)}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="המתג">
            <button type="button" class={`toggle ${s.mode === 'charge' ? 'on' : ''}`} aria-pressed={s.mode === 'charge'} onClick={() => toggleMode('charge')}>
              מתג לטעינה (עם הסוללה)
            </button>
            <button type="button" class={`toggle ${s.mode === 'discharge' ? 'on' : ''}`} aria-pressed={s.mode === 'discharge'} onClick={() => toggleMode('discharge')}>
              מתג לפריקה (בלי הסוללה)
            </button>
          </div>
          <div class="group" role="group" aria-label="הגרף">
            {(['V', 'I', 'q'] as Graph[]).map((g) => (
              <button type="button" key={g} class={`toggle ${s.graph === g ? 'on' : ''}`} aria-pressed={s.graph === g} onClick={() => act((prev) => ({ ...prev, graph: g }))}>
                {GRAPH_LABEL[g]}
              </button>
            ))}
          </div>
          <Slider label="הזמן מאז שהעבירו את המתג" value={s.t} min={0} max={T_MAX} step={0.1} format={(v) => `${sci(v)} s`} onChange={(v) => act((prev) => ({ ...prev, t: v, running: false }))} />
          <Slider label="ההתנגדות R" value={s.R} min={5} max={20} step={5} format={(v) => `${v} kΩ`} onChange={(v) => act((prev) => restart({ R: v }, prev))} />
          <Slider label="הקיבול C" value={s.C} min={50} max={200} step={50} format={(v) => `${v} μF`} onChange={(v) => act((prev) => restart({ C: v }, prev))} />
          <Slider label="הכא״מ של הסוללה" value={s.emf} min={6} max={24} step={6} format={(v) => `${v} V`} onChange={(v) => act((prev) => restart({ emf: v }, prev))} />
        </>
      }
    />
  );
}

/** the circuit: battery on the left, a two-way switch on top, R along the top, C on the right */
function drawCircuit(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  W: number,
  H: number,
  st: State,
  cur: { vC: number; I: number; q: number },
  dt: number,
  phase: { current: number },
) {
  // the top row sits low enough to stay clear of the figure's tool buttons
  const yT = H * 0.32;
  const yB = H * 0.9;
  const xBat = W * 0.08;
  const xAlt = W * 0.26;
  const xPiv = W * 0.36;
  const xC = W * 0.86;
  const cyC = (yT + yB) / 2;
  ctx.save();
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const line = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  // contacts: 1 (battery) above, 2 (bypass) below, both to the left of the pivot
  const c1: [number, number] = [xAlt, yT - H * 0.09];
  const c2: [number, number] = [xAlt, yT + H * 0.09];
  line([[xBat, yB], [xBat, c1[1]], c1]);
  line([c2, [xAlt, yB]]);
  line([[xPiv, yT], [xC, yT], [xC, yB], [xBat, yB]]);
  // battery on the left column
  const yBat = (c1[1] + yB) / 2 + H * 0.05;
  ctx.fillStyle = p.paper;
  ctx.fillRect(xBat - 16, yBat - 9, 32, 18);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xBat - 15, yBat - 5);
  ctx.lineTo(xBat + 15, yBat - 5);
  ctx.stroke();
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(xBat - 8, yBat + 5);
  ctx.lineTo(xBat + 8, yBat + 5);
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.font = `700 12px ${p.fontUi}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';
  ctx.fillText('+', xBat + 18, yBat - 9);
  ctx.fillText(`${st.emf} V`, xBat + 18, yBat + 9);
  // the switch blade
  ctx.lineWidth = 2.6;
  const to = st.mode === 'charge' ? c1 : c2;
  line([[xPiv, yT], to]);
  ctx.fillStyle = p.ink;
  for (const [x, y] of [c1, c2, [xPiv, yT] as [number, number]]) {
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // resistor on the top
  const xR = (xPiv + xC) / 2;
  ctx.fillStyle = p.paper;
  ctx.lineWidth = 2;
  ctx.fillRect(xR - 26, yT - 8, 52, 16);
  ctx.strokeRect(xR - 26, yT - 8, 52, 16);
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`R = ${st.R} kΩ`, xR, yT - 12);
  // capacitor on the right, + plate on top
  ctx.fillStyle = p.paper;
  ctx.fillRect(xC - 20, cyC - 7, 40, 14);
  ctx.lineWidth = 3;
  ctx.strokeStyle = cur.q > 1e-9 ? p.pos : p.ink2;
  ctx.beginPath();
  ctx.moveTo(xC - 18, cyC - 6);
  ctx.lineTo(xC + 18, cyC - 6);
  ctx.stroke();
  ctx.strokeStyle = cur.q > 1e-9 ? p.neg : p.ink2;
  ctx.beginPath();
  ctx.moveTo(xC - 18, cyC + 6);
  ctx.lineTo(xC + 18, cyC + 6);
  ctx.stroke();
  // charge glyphs on the plates, as many as the fraction of a full charge
  const n = Math.round((5 * Math.max(0, cur.vC)) / 24);
  ctx.font = `700 11px ${p.fontUi}`;
  for (let k = 0; k < n; k++) {
    const x = xC - 14 + (k * 28) / Math.max(1, 4);
    ctx.fillStyle = p.pos;
    ctx.fillText('+', x, cyC - 9);
    ctx.fillStyle = p.neg;
    ctx.textBaseline = 'top';
    ctx.fillText('−', x, cyC + 9);
    ctx.textBaseline = 'bottom';
  }
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`C = ${st.C} μF`, xC - 24, cyC);
  // moving current marks around the loop that conducts, speed ∝ the current
  const I0 = st.emf / (st.R * kOhm);
  const rel = I0 > 0 ? cur.I / I0 : 0;
  if (Math.abs(rel) > 0.005) {
    if (motionAllowed()) phase.current = (phase.current + Math.sign(rel) * Math.abs(rel) * 0.35 * dt + 1) % 1;
    const loop: [number, number][] =
      st.mode === 'charge'
        ? [[xBat, yB], [xBat, c1[1]], c1, [xPiv, yT], [xC, yT], [xC, yB], [xBat, yB]]
        : [[xAlt, yB], [xAlt, c2[1]], c2, [xPiv, yT], [xC, yT], [xC, yB], [xAlt, yB]];
    const segs = loop.slice(1).map((q, i) => ({ a: loop[i], b: q, L: Math.hypot(q[0] - loop[i][0], q[1] - loop[i][1]) }));
    const total = segs.reduce((x, sg) => x + sg.L, 0);
    const marks = 10;
    ctx.fillStyle = withAlpha(p.current, Math.min(1, 0.35 + Math.abs(rel)));
    for (let k = 0; k < marks; k++) {
      let d = (((phase.current + k / marks) % 1) + 1) % 1 * total;
      for (const sg of segs) {
        if (d <= sg.L) {
          const x = sg.a[0] + ((sg.b[0] - sg.a[0]) * d) / sg.L;
          const y = sg.a[1] + ((sg.b[1] - sg.a[1]) * d) / sg.L;
          // no charge crosses the gap between the plates
          if (x === xC && Math.abs(y - cyC) < 10) break;
          ctx.beginPath();
          ctx.arc(x, y, 3.2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        d -= sg.L;
      }
    }
  }
  ctx.restore();
}
