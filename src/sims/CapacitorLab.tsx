/**
 * Capacitor lab: a parallel-plate capacitor seen from the side, a battery and a switch.
 * Built for lessons 2.6–2.7.
 *
 * The plate area, the gap and the battery voltage are set by sliders; the switch connects the
 * capacitor to the battery (V fixed, Q follows) or leaves it isolated (Q fixed, V follows), and
 * a dielectric slab can fill the gap. Every number comes from plateState (src/physics/
 * capacitors.ts). Drawn sizes follow the settings: the gap is to scale with d, the plate height
 * grows with A, the glyphs on the plates are counted from Q, and the field lines are spaced so
 * that their density follows E. The optional V–Q graph shades the stored energy, ½QV, and keeps
 * the state before the last change as a dashed outline to compare with.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { plateState, type PlateState } from '~/physics/capacitors';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, paperGrid, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 2;
const WORLD_H = 1.3;
const KAPPA = 3;
/** drawn gap per millimetre of d [world m] */
const GAP_PER_MM = 0.07;

const TASK_LABEL: Record<string, string> = {
  area: 'כשהקבל מחובר לסוללה: הגדילו את שטח הלוחות. מה קרה לקיבול ולמטען?',
  gap: 'כשהקבל מחובר לסוללה: הגדילו את המרחק בין הלוחות פי 2. מה קרה לקיבול?',
  voltage: 'שנו את המתח של הסוללה. מה קרה למטען? ולקיבול?',
  'pull-disconnected': 'נתקו את הקבל מהסוללה, ואחר כך הרחיקו את הלוחות. מה קרה למטען, למתח ולשדה?',
  'pull-connected': 'כשהקבל מחובר לסוללה: הרחיקו את הלוחות. מה קרה למטען ולאנרגיה?',
  dielectric: 'הכניסו חומר מבודד בין הלוחות. מה קרה לקיבול?',
};

export interface CapacitorLabProps {
  id: string;
  /** plate area [cm²], gap [mm], battery [V] */
  area?: number;
  gap?: number;
  volts?: number;
  connected?: boolean;
  /** offer the dielectric slab */
  dielectric?: boolean;
  /** draw the V–Q graph with the energy shaded */
  graph?: boolean;
  /** show the energy in the readout */
  energy?: boolean;
  tasks?: string[];
}

interface State {
  area: number;
  gap: number;
  volts: number;
  connected: boolean;
  slab: boolean;
  /** the charge kept while isolated [C] */
  q: number;
  /** the state before the learner's last change, for the dashed comparison */
  before: { Q: number; V: number } | null;
}

const toSI = (s: State) => ({ A: s.area * 1e-4, d: s.gap * 1e-3, kappa: s.slab ? KAPPA : 1 });

function stateOf(s: State): PlateState {
  const { A, d, kappa } = toSI(s);
  return s.connected ? plateState(A, d, kappa, { V: s.volts }) : plateState(A, d, kappa, { Q: s.q });
}

/** pF / nC / μJ readouts with three figures */
const pF = (C: number) => `${sci(C * 1e12)} pF`;
const nC = (Q: number) => `${sci(Q * 1e9)} nC`;
const uJ = (U: number) => `${sci(U * 1e6)} μJ`;

export default function CapacitorLab(props: CapacitorLabProps) {
  const init = (): State => {
    const s: State = {
      area: props.area ?? 200,
      gap: props.gap ?? 2,
      volts: props.volts ?? 200,
      connected: props.connected ?? true,
      slab: false,
      q: 0,
      before: null,
    };
    const { A, d } = toSI(s);
    s.q = plateState(A, d, 1, { V: s.volts }).Q;
    return s;
  };
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const userActed = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => {
          const next = { ...prev, before: null };
          if (typeof st.area === 'number') next.area = st.area;
          if (typeof st.gap === 'number') next.gap = st.gap;
          if (typeof st.volts === 'number') next.volts = st.volts;
          if (typeof st.slab === 'boolean') next.slab = st.slab;
          if (typeof st.connected === 'boolean') next.connected = st.connected;
          // a step starts from a charged capacitor at the battery's voltage
          const { A, d, kappa } = toSI(next);
          next.q = plateState(A, d, kappa, { V: next.volts }).Q;
          return next;
        });
      }),
    [props.id],
  );

  const now = stateOf(s);

  /** A learner's change: the isolated charge follows the battery only while connected. */
  const act = (patch: Partial<State>) => {
    userActed.current = true;
    setS((prev) => {
      const old = stateOf(prev);
      const next: State = { ...prev, ...patch, before: { Q: old.Q, V: old.V } };
      // while connected the charge tracks the battery; on disconnecting it is frozen where it is
      if (next.connected) next.q = stateOf(next).Q;
      else if (prev.connected) next.q = old.Q;
      const has = (t: string) => props.tasks?.includes(t);
      const done = (t: string) => markTask(`${props.id}:${t}`);
      if (has('area') && next.connected && patch.area !== undefined && patch.area !== prev.area) done('area');
      if (has('gap') && next.connected && patch.gap !== undefined && patch.gap >= 2 * prev.gap - 1e-9) done('gap');
      if (has('voltage') && next.connected && patch.volts !== undefined && patch.volts !== prev.volts) done('voltage');
      if (has('pull-disconnected') && !next.connected && patch.gap !== undefined && patch.gap > prev.gap) done('pull-disconnected');
      if (has('pull-connected') && next.connected && patch.gap !== undefined && patch.gap > prev.gap) done('pull-connected');
      if (has('dielectric') && patch.slab === true) done('dielectric');
      return next;
    });
  };

  useEffect(() => {
    if (!userActed.current) return;
    setLive(`קיבול ${pF(now.C)}, מטען ${nC(now.Q)}, מתח ${sci(now.V)} וולט.`);
  }, [s]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p);
    const S = (x: number, y: number) => toScreen(view, x, y);
    const graph = props.graph ?? false;
    const cx = graph ? -0.45 : 0;
    const yc = 0.18;
    const half = (s.gap * GAP_PER_MM) / 2;
    const h = 0.25 + (s.area / 400) * 0.55;
    const xL = cx - half;
    const xR = cx + half;
    const [sxL, syTop] = S(xL, yc + h / 2);
    const [sxR, syBot] = S(xR, yc - h / 2);

    // dielectric slab
    if (s.slab) {
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.18);
      ctx.fillRect(sxL + 4, syTop, sxR - sxL - 8, syBot - syTop);
      ctx.strokeStyle = withAlpha(p.equip, 0.6);
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sxL + 4, syTop, sxR - sxL - 8, syBot - syTop);
      ctx.restore();
    }

    // field lines: spacing shrinks as E grows (1·10⁵ V/m draws one line every 8 cm of plate)
    if (now.E > 0) {
      const spacing = Math.max(0.035, Math.min(0.3, 0.08 * (1e5 / now.E)));
      for (let y = yc - h / 2 + spacing / 2; y < yc + h / 2; y += spacing) {
        const [, sy] = S(0, y);
        arrow(ctx, sxL + 6, sy, sxR - 6, sy, { color: p.efield, width: 1.8, head: Math.min(8, (sxR - sxL) / 3) });
      }
    }

    // plates with their charge glyphs
    const glyphs = Math.max(0, Math.min(28, Math.round(Math.abs(now.Q) / 2e-9)));
    for (const [sx, sign] of [
      [sxL, 1],
      [sxR, -1],
    ] as const) {
      ctx.save();
      ctx.fillStyle = withAlpha(sign > 0 ? p.pos : p.neg, 0.35);
      ctx.fillRect(sx - 4, syTop, 8, syBot - syTop);
      ctx.strokeStyle = sign > 0 ? p.pos : p.neg;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 4, syTop, 8, syBot - syTop);
      ctx.fillStyle = p.ink;
      ctx.font = `700 13px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < glyphs; i++) {
        const y = syTop + ((i + 0.5) / glyphs) * (syBot - syTop);
        ctx.fillText(sign > 0 ? '+' : '−', sx + (sign > 0 ? -13 : 13), y);
      }
      ctx.restore();
    }

    // wires, switch and battery
    const yWire = -0.38;
    const [, syW] = S(0, yWire);
    const [bx] = S(cx, 0);
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 2;
    // the wires leave from the bottom ends of the plates, clear of the charge glyphs beside them
    const yDrop = syBot + 8;
    ctx.beginPath();
    ctx.moveTo(sxL, syBot);
    ctx.lineTo(sxL, yDrop);
    ctx.lineTo(sxL - 40, yDrop);
    ctx.lineTo(sxL - 40, syW);
    ctx.lineTo(bx - 34, syW);
    ctx.moveTo(sxR, syBot);
    ctx.lineTo(sxR, yDrop);
    ctx.lineTo(sxR + 40, yDrop);
    ctx.lineTo(sxR + 40, syW);
    ctx.lineTo(bx + 10, syW);
    ctx.stroke();
    // battery: long line +, short line −
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx - 4, syW - 16);
    ctx.lineTo(bx - 4, syW + 16);
    ctx.moveTo(bx + 6, syW - 9);
    ctx.lineTo(bx + 6, syW + 9);
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${s.volts} V`, bx, syW + 20);
    // the switch in the left wire, between the battery and the corner
    const swx = bx - 34;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(swx - 26, syW);
    if (s.connected) ctx.lineTo(swx, syW);
    else ctx.lineTo(swx - 4, syW - 16);
    ctx.stroke();
    for (const x of [swx - 26, swx]) {
      ctx.beginPath();
      ctx.arc(x, syW, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // labels: d and A
    ctx.save();
    ctx.fillStyle = p.ink2;
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.direction = 'ltr';
    ctx.fillText(`d = ${s.gap} mm`, (sxL + sxR) / 2, syTop - 6);
    ctx.textBaseline = 'top';
    ctx.fillText(`A = ${s.area} cm²`, (sxL + sxR) / 2, syBot + 14);
    if (s.slab) ctx.fillText(`κ = ${KAPPA}`, (sxL + sxR) / 2, syBot + 30);
    ctx.restore();

    // V–Q graph
    if (graph) {
      const [gx0, gy1] = S(0.22, 0.55);
      const [gx1, gy0] = S(0.92, -0.4);
      const pts = [now, ...(s.before ? [s.before] : [])];
      const qMax = Math.max(...pts.map((x) => x.Q)) * 1.25 || 1;
      const vMax = Math.max(...pts.map((x) => x.V)) * 1.25 || 1;
      const X = (q: number) => gx0 + (q / qMax) * (gx1 - gx0);
      const Y = (v: number) => gy0 - (v / vMax) * (gy0 - gy1);
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gx0, gy1);
      ctx.lineTo(gx0, gy0);
      ctx.lineTo(gx1, gy0);
      ctx.stroke();
      // the earlier state, dashed
      if (s.before && (Math.abs(s.before.Q - now.Q) > 1e-15 || Math.abs(s.before.V - now.V) > 1e-9)) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = withAlpha(p.ink2, 0.7);
        ctx.beginPath();
        ctx.moveTo(X(0), Y(0));
        ctx.lineTo(X(s.before.Q), Y(s.before.V));
        ctx.lineTo(X(s.before.Q), Y(0));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // the energy triangle
      ctx.fillStyle = withAlpha(p.accent, 0.25);
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(now.Q), Y(now.V));
      ctx.lineTo(X(now.Q), Y(0));
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(now.Q), Y(now.V));
      ctx.stroke();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(X(now.Q), Y(now.V), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `600 12px ${p.fontUi}`;
      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('Q', (gx0 + gx1) / 2, gy0 + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('V', gx0 - 8, (gy0 + gy1) / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = p.accent;
      ctx.fillText('U = ½QV', X(now.Q * 0.66), Y(now.V * 0.22));
      ctx.restore();
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: קבל לוחות, שטח ${s.area} סמ"ר, מרחק ${s.gap} מ"מ${s.slab ? ', עם חומר מבודד' : ''}, ${s.connected ? `מחובר לסוללה של ${s.volts} וולט` : 'מנותק מהסוללה'}. קיבול ${pF(now.C)}, מטען ${nC(now.Q)}, מתח ${sci(now.V)} וולט.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
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
            קיבול: <b class="q">C = {pF(now.C)}</b>
          </span>
          <span>
            מטען: <b class="q">Q = {nC(now.Q)}</b>
          </span>
          <span>
            מתח: <b class="q">V = {sci(now.V)} V</b>
          </span>
          <span>
            שדה: <b class="q">E = {sci(now.E)} V/m</b>
          </span>
          {(props.energy || props.graph) && (
            <span>
              אנרגיה: <b class="q">U = {uJ(now.U)}</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <Toggle label="מחובר לסוללה" on={s.connected} onChange={(v) => act({ connected: v })} />
          {props.dielectric && <Toggle label={`חומר מבודד (κ = ${KAPPA})`} on={s.slab} onChange={(v) => act({ slab: v })} />}
          <Slider label="שטח הלוחות A" value={s.area} min={100} max={400} step={50} format={(v) => `${v} cm²`} onChange={(v) => act({ area: v })} />
          <Slider label="המרחק בין הלוחות d" value={s.gap} min={1} max={6} step={0.5} format={(v) => `${v} mm`} onChange={(v) => act({ gap: v })} />
          <Slider label="המתח של הסוללה" value={s.volts} min={50} max={500} step={50} format={(v) => `${v} V`} onChange={(v) => act({ volts: v })} />
        </>
      }
    />
  );
}
