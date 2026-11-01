/**
 * Inside a copper wire: fixed positive ions, and free electrons that dart about at random and,
 * once a field is switched on, also drift slowly against it. A dashed cross-section counts the net
 * number of electrons that cross it. Built for lesson 3.2.
 *
 * The picture is a cartoon of the free-electron model, with honest numbers beside it: the drift
 * speed and the time to cross one metre come from driftSpeed (src/physics/circuits.ts) for copper,
 * at the current and cross-section on the sliders. On screen the random motion and the drift are
 * both slowed and scaled for the eye; their ratio is not to scale (in copper the random motion is
 * some 10¹⁰ times faster than the drift). What is to scale: the drift speed is proportional to
 * I/A, and the number of electrons in view to A, so their product, the current, follows I only.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { COPPER_N, driftSpeed } from '~/physics/circuits';
import { seededRandom } from '~/physics/lab-data';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const ASPECT = 2;
/** electrons per unit band height (px) per unit length (px), for the eye */
const DENSITY = 0.0042;
/** on-screen random speed and drift at the reference I/A (1 A per mm²), px/s */
const THERMAL = 120;
const DRIFT_REF = 28;

const TASK_LABEL: Record<string, string> = {
  'field-on': 'סגרו את המעגל. מה משתנה בתנועה של האלקטרונים?',
  'more-current': 'הגדילו את הזרם. מה קורה למהירות הסחיפה?',
  'thick-wire': 'השאירו את הזרם קבוע והגדילו את שטח החתך. מה קורה למהירות הסחיפה, ולמספר האלקטרונים?',
};

export interface DriftWireProps {
  id: string;
  on?: boolean;
  /** current [A] and cross-section [mm²] */
  I?: number;
  area?: number;
  showCurrent?: boolean;
  tasks?: string[];
}

interface State {
  on: boolean;
  I: number;
  area: number;
  showCurrent: boolean;
}

interface Electron {
  x: number;
  /** height across the band, 0…1 */
  y: number;
  vx: number;
  vy: number;
  /** seconds to the next collision */
  next: number;
}

function formatTime(t: number): string {
  if (!Number.isFinite(t)) return '∞';
  if (t >= 3600) return `${sci(t / 3600, 2)} שעות`;
  if (t >= 60) return `${sci(t / 60, 2)} דקות`;
  return `${sci(t, 2)} שניות`;
}

export default function DriftWire(props: DriftWireProps) {
  const init = (): State => ({ on: props.on ?? false, I: props.I ?? 1, area: props.area ?? 1, showCurrent: props.showCurrent ?? false });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const userActed = useRef(false);
  const rnd = useRef(seededRandom(7));
  const electrons = useRef<Electron[]>([]);
  const net = useRef(0);
  const lastT = useRef(0);
  const sRef = useRef(s);
  sRef.current = s;
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const v = s.on ? driftSpeed(s.I, COPPER_N, s.area * 1e-6) : 0;

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => ({
          on: typeof st.on === 'boolean' ? st.on : prev.on,
          I: typeof st.I === 'number' ? st.I : prev.I,
          area: typeof st.area === 'number' ? st.area : prev.area,
          showCurrent: typeof st.showCurrent === 'boolean' ? st.showCurrent : prev.showCurrent,
        }));
      }),
    [props.id],
  );

  const act = (patch: Partial<State>) => {
    userActed.current = true;
    setS((prev) => {
      const next = { ...prev, ...patch };
      const has = (t: string) => props.tasks?.includes(t);
      const done = (t: string) => markTask(`${props.id}:${t}`);
      if (has('field-on') && patch.on === true) done('field-on');
      if (has('more-current') && next.on && patch.I !== undefined && patch.I > prev.I) done('more-current');
      if (has('thick-wire') && next.on && patch.area !== undefined && patch.area > prev.area) done('thick-wire');
      return next;
    });
  };

  useEffect(() => {
    if (!userActed.current) return;
    setLive(s.on ? `מהירות הסחיפה ${sci(v)} מטר לשנייה.` : 'המעגל פתוח: האלקטרונים נעים באקראי, בלי סחיפה.');
  }, [s]);

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const st = sRef.current;
    const W = view.w;
    const H = view.h;
    const left = 0.06 * W;
    const right = 0.94 * W;
    const cy = H * 0.5;
    // band height ∝ cross-section
    const bh = Math.min(H * 0.62, 26 + 30 * st.area);
    const top = cy - bh / 2;
    const len = right - left;
    const rand = rnd.current;

    // keep the electron count ∝ band area
    const want = Math.round(DENSITY * bh * len);
    const es = electrons.current;
    while (es.length < want) {
      const a = rand() * Math.PI * 2;
      es.push({ x: rand(), y: rand(), vx: Math.cos(a), vy: Math.sin(a), next: rand() * 0.3 });
    }
    if (es.length > want) es.length = want;

    const dt = Math.max(0, Math.min(0.05, t - lastT.current));
    lastT.current = t;
    const moving = motionAllowed() && dt > 0;
    const drift = st.on ? (DRIFT_REF * st.I) / st.area : 0;
    if (moving) {
      const gate = 0.5;
      for (const e of es) {
        e.next -= dt;
        if (e.next <= 0) {
          // a collision with an ion: a new random direction
          const a = rand() * Math.PI * 2;
          e.vx = Math.cos(a);
          e.vy = Math.sin(a);
          e.next = 0.1 + rand() * 0.3;
        }
        const x0 = e.x;
        // electrons drift against the field: the field points right, so they drift left
        e.x += ((e.vx * THERMAL - drift) * dt) / len;
        e.y += (e.vy * THERMAL * dt) / bh;
        if (e.y < 0) (e.y = -e.y), (e.vy = -e.vy);
        if (e.y > 1) (e.y = 2 - e.y), (e.vy = -e.vy);
        if (x0 >= gate && e.x < gate) net.current += 1;
        else if (x0 < gate && e.x >= gate) net.current -= 1;
        if (e.x < 0) e.x += 1;
        if (e.x >= 1) e.x -= 1;
      }
    }

    // the wire
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(left - 6, top, len + 12, bh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // ions: a fixed lattice of + glyphs
    const step = 26;
    ctx.save();
    ctx.strokeStyle = withAlpha(p.ink3, 0.9);
    ctx.lineWidth = 1.4;
    for (let x = left + step / 2; x < right; x += step)
      for (let y = top + step / 2; y < top + bh - 4; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x + 3, y);
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x, y + 3);
        ctx.stroke();
      }
    ctx.restore();

    // electrons: a disc in the negative colour with a − glyph
    ctx.save();
    for (const e of es) {
      const x = left + e.x * len;
      const y = top + 4 + e.y * (bh - 8);
      ctx.fillStyle = p.neg;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - 2.3, y);
      ctx.lineTo(x + 2.3, y);
      ctx.stroke();
    }
    ctx.restore();

    // the cross-section
    const gx = left + 0.5 * len;
    ctx.save();
    ctx.strokeStyle = p.hand;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx, top - 10);
    ctx.lineTo(gx, top + bh + 10);
    ctx.stroke();
    ctx.restore();

    // arrows above and below the wire, each labelled at its centre so nothing runs off a phone
    const ay = top - 16;
    const by = top + bh + 16;
    if (st.on) {
      arrow(ctx, W * 0.12, ay, W * 0.4, ay, { color: p.efield, width: 2.6, head: 10 });
      label(ctx, p, 'E', W * 0.12 - 8, ay, p.efield, 'right');
      arrow(ctx, W * 0.64, by, W * 0.36, by, { color: p.neg, width: 2.2, head: 9 });
      label(ctx, p, 'האלקטרונים נסחפים', W * 0.5, by + 14, p.neg, 'center');
      if (st.showCurrent) {
        arrow(ctx, W * 0.6, ay, W * 0.88, ay, { color: p.current, width: 3, head: 10 });
        label(ctx, p, 'I', W * 0.6 - 8, ay, p.current, 'right');
      }
    }
    // the ends of the wire, under its two ends (the top corners hold the figure's tool buttons)
    ctx.save();
    ctx.font = `12px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.direction = 'rtl';
    ctx.textBaseline = 'top';
    if (st.on) {
      ctx.textAlign = 'left';
      ctx.fillText('אל ההדק החיובי', left - 6, top + bh + 6);
      ctx.textAlign = 'right';
      ctx.fillText('אל ההדק השלילי', right + 6, top + bh + 6);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText('המעגל פתוח: אין שדה בתיל', left + len / 2, top - 22);
    }
    // the net count through the section
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = p.hand;
    ctx.font = `600 13px ${p.fontUi}`;
    ctx.fillText(`עברו את החתך שמאלה (נטו): ${Math.max(0, net.current)}`, gx, Math.min(H - 18, top + bh + 40));
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: true });
  useEffect(() => {
    if (!s.on) net.current = 0;
    invalidate();
  }, [s]);

  const crossTime = v > 0 ? 1 / v : Infinity;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: אלקטרונים חופשיים בתיל נחושת. ${s.on ? `המעגל סגור, זרם ${sci(s.I)} אמפר, מהירות סחיפה ${sci(v)} מטר לשנייה.` : 'המעגל פתוח, האלקטרונים נעים באקראי.'}`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onReset={() => {
        userActed.current = false;
        net.current = 0;
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            מהירות הסחיפה בנחושת: <b class="q">{s.on ? `${sci(v)} m/s` : '0'}</b>
          </span>
          <span>
            הזמן שלוקח לאלקטרון לעבור מטר אחד של תיל: <b>{s.on ? formatTime(crossTime) : '—'}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="המעגל">
            <button type="button" class={`toggle ${s.on ? 'on' : ''}`} aria-pressed={s.on} onClick={() => act({ on: !s.on })}>
              {s.on ? 'פתחו את המעגל' : 'סגרו את המעגל'}
            </button>
            <Toggle label="כיוון הזרם המוסכם" on={s.showCurrent} onChange={(x) => act({ showCurrent: x })} swatch="var(--current)" />
          </div>
          <Slider label="הזרם בתיל" value={s.I} min={0.5} max={3} step={0.5} format={(x) => `${x} A`} onChange={(x) => act({ I: x })} />
          <Slider label="שטח החתך" value={s.area} min={0.5} max={3} step={0.5} format={(x) => `${x} mm²`} onChange={(x) => act({ area: x })} />
        </>
      }
    />
  );
}

function label(ctx: CanvasRenderingContext2D, p: { fontUi: string }, text: string, x: number, y: number, color: string, align: CanvasTextAlign) {
  ctx.save();
  ctx.font = `700 13px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.direction = /[֐-׿]/.test(text) ? 'rtl' : 'ltr';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}
