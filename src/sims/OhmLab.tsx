/**
 * I–V lab: a component on an adjustable supply, with a voltmeter across it and an ammeter in line.
 * The learner sets the voltage, records (V, I) points, and sees the characteristic: a straight line
 * through the origin for a resistor, a curve that bends over for a filament bulb. Built for lesson
 * 3.3.
 *
 * The resistor is ohmic, I = V/R. The bulb is filamentBulb (src/physics/circuits.ts), rated 3 W at
 * 6 V, so both components draw 0.5 A at 6 V and part ways below it. The dashed line from the origin
 * to the live point has slope I/V = 1/R: it turns flatter as the bulb heats up.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { filamentBulb } from '~/physics/circuits';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { mix, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const ASPECT = 1.4;
const V_MAX = 6;
const R_RESISTOR = 12;
const BULB = { P: 3, V: 6 };

export type Component = 'resistor' | 'bulb';

const NAME: Record<Component, string> = { resistor: 'נגד', bulb: 'נורת להט' };

const TASK_LABEL: Record<string, string> = {
  'resistor-points': 'בנגד: רשמו לפחות ארבע מדידות במתחים שונים. איך נראות הנקודות?',
  'bulb-points': 'בנורה: רשמו לפחות ארבע מדידות במתחים שונים, ובהן מתח נמוך ומתח גבוה.',
};

export const currentOf = (c: Component, V: number) => (c === 'resistor' ? V / R_RESISTOR : filamentBulb(V, BULB.P, BULB.V).I);

export interface OhmLabProps {
  id: string;
  component?: Component;
  components?: Component[];
  V?: number;
  showCurve?: boolean;
  tasks?: string[];
}

interface Point {
  V: number;
  I: number;
}

interface State {
  comp: Component;
  V: number;
  points: Record<Component, Point[]>;
  showCurve: boolean;
}

const amps = (I: number) => `${sci(I)} A`;
const ohms = (R: number) => `${sci(R)} Ω`;

export default function OhmLab(props: OhmLabProps) {
  const init = (): State => ({
    comp: props.component ?? 'resistor',
    V: props.V ?? 3,
    points: { resistor: [], bulb: [] },
    showCurve: props.showCurve ?? false,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const userActed = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const I = currentOf(s.comp, s.V);
  const R = s.V > 0 ? s.V / I : NaN;

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => ({
          ...prev,
          comp: st.component === 'resistor' || st.component === 'bulb' ? st.component : prev.comp,
          V: typeof st.V === 'number' ? st.V : prev.V,
          showCurve: typeof st.showCurve === 'boolean' ? st.showCurve : prev.showCurve,
        }));
      }),
    [props.id],
  );

  const act = (f: (prev: State) => State) => {
    userActed.current = true;
    setS((prev) => {
      const next = f(prev);
      const distinct = (c: Component) => new Set(next.points[c].map((q) => q.V)).size;
      if (props.tasks?.includes('resistor-points') && distinct('resistor') >= 4) markTask(`${props.id}:resistor-points`);
      const bulb = next.points.bulb.map((q) => q.V);
      if (props.tasks?.includes('bulb-points') && distinct('bulb') >= 4 && Math.min(...bulb) <= 1.5 && Math.max(...bulb) >= 4.5) markTask(`${props.id}:bulb-points`);
      return next;
    });
  };

  const record = () =>
    act((prev) => {
      const list = prev.points[prev.comp].filter((q) => q.V !== prev.V);
      return { ...prev, points: { ...prev.points, [prev.comp]: [...list, { V: prev.V, I: currentOf(prev.comp, prev.V) }] } };
    });

  useEffect(() => {
    if (!userActed.current) return;
    setLive(`${NAME[s.comp]}: מתח ${sci(s.V)} וולט, זרם ${sci(I)} אמפר.`);
  }, [s]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const narrow = view.w < 480;
    const box = insetBox({ x: 0, y: 0, w: view.w, h: view.h }, { l: narrow ? 46 : 56, r: 16, t: 18, b: narrow ? 40 : 44 });
    const plot = makePlot(
      box,
      { min: 0, max: V_MAX, label: 'המתח V (וולט)', ticks: [0, 1, 2, 3, 4, 5, 6] },
      { min: 0, max: 0.6, label: 'הזרם I (אמפר)', ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6] },
    );
    drawAxes(ctx, plot, p, { grid: true });
    const colorOf = (c: Component) => (c === 'resistor' ? p.hand : p.efield);
    // the characteristics, when shown
    if (s.showCurve) for (const c of props.components ?? [s.comp]) drawCurve(ctx, plot, (v) => currentOf(c, v), { color: withAlpha(colorOf(c), 0.45), width: 2, dash: [6, 4] });
    // recorded points of both components; the current one stronger
    for (const c of ['resistor', 'bulb'] as const) {
      for (const q of s.points[c]) {
        const sx = plot.px(q.V);
        const sy = plot.py(q.I);
        ctx.save();
        ctx.globalAlpha = c === s.comp ? 1 : 0.4;
        ctx.strokeStyle = colorOf(c);
        ctx.lineWidth = 2.2;
        // resistor points are crosses, bulb points are circles: the shape tells them apart too
        if (c === 'resistor') {
          ctx.beginPath();
          ctx.moveTo(sx - 5, sy - 5);
          ctx.lineTo(sx + 5, sy + 5);
          ctx.moveTo(sx - 5, sy + 5);
          ctx.lineTo(sx + 5, sy - 5);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // the line from the origin to the live point: its slope is I/V = 1/R
    if (s.V > 0) {
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.7);
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(plot.px(0), plot.py(0));
      ctx.lineTo(plot.px(s.V), plot.py(I));
      ctx.stroke();
      ctx.restore();
    }
    drawMarker(ctx, plot, s.V, I, colorOf(s.comp), { guides: true, radius: 6 });

    // the component, glowing when it is the bulb (power against its 3 W rating)
    const bx = box.x + 34;
    const by = box.y + 30;
    ctx.save();
    if (s.comp === 'bulb') {
      const k = Math.sqrt(Math.min((s.V * I) / BULB.P, 1.2));
      if (k > 0.02) {
        const glow = ctx.createRadialGradient(bx, by, 6, bx, by, 18 + 26 * k);
        glow.addColorStop(0, withAlpha(p.current, 0.3 + 0.6 * Math.min(k, 1)));
        glow.addColorStop(1, withAlpha(p.current, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(bx, by, 18 + 26 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = k > 0.02 ? mix(p.paper, p.current, 0.25 + 0.5 * Math.min(k, 1)) : p.paper;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - 10, by - 10);
      ctx.lineTo(bx + 10, by + 10);
      ctx.moveTo(bx - 10, by + 10);
      ctx.lineTo(bx + 10, by - 10);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.paper;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2;
      ctx.fillRect(bx - 20, by - 7, 40, 14);
      ctx.strokeRect(bx - 20, by - 7, 40, 14);
    }
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  const offered = props.components ?? [s.comp];

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גרף של הזרם כפונקציה של המתח, ל${NAME[s.comp]}. במתח ${sci(s.V)} וולט הזרם ${sci(I)} אמפר. נרשמו ${s.points[s.comp].length} מדידות.`}
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
            {NAME[s.comp]}: <b class="q">V = {sci(s.V)} V, I = {amps(I)}</b>
          </span>
          <span>
            ההתנגדות ברגע זה: <b class="q">R = V/I = {s.V > 0 ? ohms(R) : '—'}</b>
          </span>
        </>
      }
      controls={
        <>
          {offered.length > 1 && (
            <div class="group" role="group" aria-label="הרכיב">
              {offered.map((c) => (
                <button type="button" key={c} class={`toggle ${s.comp === c ? 'on' : ''}`} aria-pressed={s.comp === c} onClick={() => act((prev) => ({ ...prev, comp: c }))}>
                  {NAME[c]}
                </button>
              ))}
            </div>
          )}
          <Slider label="המתח על הרכיב" value={s.V} min={0} max={V_MAX} step={0.5} format={(v) => `${v} V`} onChange={(v) => act((prev) => ({ ...prev, V: v }))} />
          <div class="group" role="group" aria-label="מדידות">
            <button type="button" class="btn primary" onClick={record}>
              רשמו מדידה
            </button>
            <button type="button" class="btn" onClick={() => act((prev) => ({ ...prev, points: { ...prev.points, [prev.comp]: [] } }))}>
              נקו את המדידות
            </button>
            <Toggle label="הראו את האופיין המלא" on={s.showCurve} onChange={(v) => act((prev) => ({ ...prev, showCurve: v }))} />
          </div>
        </>
      }
    />
  );
}
