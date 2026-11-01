/**
 * Capacitor network: a battery and two or three capacitors, drawn as a circuit diagram, in
 * parallel, in series, mixed (C₁ in series with C₂ ∥ C₃), or a charged C₁ switched across an
 * empty C₂. Built for lesson 2.8.
 *
 * Every number comes from src/physics/capacitors.ts (parallel, series, parallelBank,
 * seriesString, shareCharge). The diagram is schematic: wires, plates and the battery symbol
 * carry no geometry; each capacitor's charge and voltage are written beside it and in the table
 * under the figure.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { parallel, parallelBank, series, seriesString, shareCharge, energyCV, type Branch } from '~/physics/capacitors';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo } from './core/canvas';
import { paperGrid, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const uF = 1e-6;
const WORLD_W = 2;
const WORLD_H = 1.15;

export type Topology = 'parallel' | 'series' | 'mixed' | 'share';

const TOPO_LABEL: Record<Topology, string> = {
  parallel: 'במקביל',
  series: 'בטור',
  mixed: 'מעורב',
  share: 'העברת מטען',
};

const TASK_LABEL: Record<string, string> = {
  'parallel-sum': 'במקביל: שנו את אחד הקבלים. איך הקיבול השקול קשור לשני הקיבולים?',
  'series-less': 'בטור: שנו את אחד הקבלים. האם הקיבול השקול גדול או קטן מכל אחד מהם?',
  'series-voltage': 'בטור, עם שני קבלים שונים: על איזה קבל המתח גדול יותר?',
  mixed: 'עברו לחיבור המעורב, וקראו את המטען ואת המתח על כל קבל.',
  share: 'בהעברת מטען: העבירו את המתג. מה קרה למטען הכולל? ולאנרגיה הכוללת?',
};

export interface CapacitorNetworkProps {
  id: string;
  topology?: Topology;
  topologies?: Topology[];
  /** capacitances [μF] and battery [V] */
  C1?: number;
  C2?: number;
  C3?: number;
  volts?: number;
  tasks?: string[];
}

interface State {
  topology: Topology;
  C1: number;
  C2: number;
  C3: number;
  volts: number;
  /** share mode: the switch has moved from the battery to C₂ */
  switched: boolean;
}

interface Solved {
  Ceq: number;
  branches: Branch[];
  /** share mode: energy before and after the switch [J] */
  before?: number;
  after?: number;
}

function solve(s: State): Solved {
  const [c1, c2, c3] = [s.C1 * uF, s.C2 * uF, s.C3 * uF];
  if (s.topology === 'parallel') return { Ceq: parallel(c1, c2), branches: parallelBank([c1, c2], s.volts) };
  if (s.topology === 'series') return { Ceq: series(c1, c2), branches: seriesString([c1, c2], s.volts) };
  if (s.topology === 'mixed') {
    const c23 = parallel(c2, c3);
    const Ceq = series(c1, c23);
    const [b1, b23] = seriesString([c1, c23], s.volts);
    const [b2, b3] = parallelBank([c2, c3], b23.V);
    return { Ceq, branches: [b1, b2, b3] };
  }
  // share: C₁ charged by the battery; after the switch it shares with an empty C₂
  if (!s.switched) {
    return {
      Ceq: c1,
      branches: [
        { C: c1, Q: c1 * s.volts, V: s.volts, U: energyCV(c1, s.volts) },
        { C: c2, Q: 0, V: 0, U: 0 },
      ],
      before: energyCV(c1, s.volts),
    };
  }
  const sh = shareCharge(c1, s.volts, c2);
  return {
    Ceq: c1 + c2,
    branches: [
      { C: c1, Q: sh.q1, V: sh.V, U: energyCV(c1, sh.V) },
      { C: c2, Q: sh.q2, V: sh.V, U: energyCV(c2, sh.V) },
    ],
    before: sh.before,
    after: sh.after,
  };
}

const muF = (C: number) => `${sci(C / uF)} μF`;
const muC = (Q: number) => `${sci(Q / uF)} μC`;
const volt = (V: number) => `${sci(V)} V`;
const muJ = (U: number) => `${sci(U / uF)} μJ`;

export default function CapacitorNetwork(props: CapacitorNetworkProps) {
  const init = (): State => ({
    topology: props.topology ?? 'parallel',
    C1: props.C1 ?? 2,
    C2: props.C2 ?? 3,
    C3: props.C3 ?? 1,
    volts: props.volts ?? 12,
    switched: false,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const userActed = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.topology === 'string' && st.topology in TOPO_LABEL) next.topology = st.topology as Topology;
          for (const k of ['C1', 'C2', 'C3', 'volts'] as const) if (typeof st[k] === 'number') next[k] = st[k] as number;
          next.switched = st.switched === true;
          return next;
        });
      }),
    [props.id],
  );

  const sol = solve(s);

  const act = (patch: Partial<State>) => {
    userActed.current = true;
    setS((prev) => {
      const next = { ...prev, ...patch };
      // a new setting in share mode starts again from a charged C₁
      if (patch.topology !== undefined || patch.C1 !== undefined || patch.C2 !== undefined || patch.volts !== undefined) {
        if (patch.switched === undefined) next.switched = false;
      }
      const has = (t: string) => props.tasks?.includes(t);
      const done = (t: string) => markTask(`${props.id}:${t}`);
      const changedC = patch.C1 !== undefined || patch.C2 !== undefined || patch.C3 !== undefined;
      if (has('parallel-sum') && next.topology === 'parallel' && changedC) done('parallel-sum');
      if (has('series-less') && next.topology === 'series' && changedC) done('series-less');
      if (has('series-voltage') && next.topology === 'series' && next.C1 !== next.C2 && (changedC || patch.topology === 'series')) done('series-voltage');
      if (has('mixed') && patch.topology === 'mixed') done('mixed');
      if (has('share') && next.topology === 'share' && patch.switched === true) done('share');
      return next;
    });
  };

  useEffect(() => {
    if (!userActed.current) return;
    setLive(`${TOPO_LABEL[s.topology]}: קיבול שקול ${muF(sol.Ceq)}.`);
  }, [s]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p);
    const S = (x: number, y: number) => toScreen(view, x, y);
    const yTop = 0.38;
    const yBot = -0.38;
    const xBat = -0.8;
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const line = (pts: [number, number][]) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const [sx, sy] = S(x, y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    };
    const label = (text: string, x: number, y: number, align: CanvasTextAlign = 'center', sub?: string) => {
      const [sx, sy] = S(x, y);
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.font = `600 12px ${p.fontUi}`;
      ctx.direction = 'ltr';
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, sx, sy);
      if (sub) {
        ctx.fillStyle = p.ink2;
        ctx.font = `11px ${p.fontUi}`;
        ctx.fillText(sub, sx, sy + 15);
      }
      ctx.restore();
    };
    /** a capacitor at (x, y): plates across a vertical branch, or across a horizontal wire */
    const cap = (x: number, y: number, vertical: boolean, name: string, b: Branch, side: 'left' | 'right' | 'below') => {
      const [cx, cy] = S(x, y);
      const gap = 7;
      const w = 15;
      ctx.save();
      // clear the wire behind the plates
      ctx.fillStyle = p.paper;
      if (vertical) ctx.fillRect(cx - w, cy - gap, 2 * w, 2 * gap);
      else ctx.fillRect(cx - gap, cy - w, 2 * gap, 2 * w);
      ctx.lineWidth = 3;
      // the + plate (toward the battery's + side) and the − plate
      const charged = b.Q > 1e-12;
      ctx.strokeStyle = charged ? p.pos : p.ink2;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(cx - w, cy - gap);
        ctx.lineTo(cx + w, cy - gap);
      } else {
        ctx.moveTo(cx - gap, cy - w);
        ctx.lineTo(cx - gap, cy + w);
      }
      ctx.stroke();
      ctx.strokeStyle = charged ? p.neg : p.ink2;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(cx - w, cy + gap);
        ctx.lineTo(cx + w, cy + gap);
      } else {
        ctx.moveTo(cx + gap, cy - w);
        ctx.lineTo(cx + gap, cy + w);
      }
      ctx.stroke();
      if (charged) {
        ctx.fillStyle = p.ink;
        ctx.font = `700 11px ${p.fontUi}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (vertical) {
          // on the left of the plates: the label goes on the right
          ctx.fillText('+', cx - w - 7, cy - gap - 3);
          ctx.fillText('−', cx - w - 7, cy + gap + 4);
        } else {
          ctx.fillText('+', cx - gap - 4, cy - w - 7);
          ctx.fillText('−', cx + gap + 4, cy - w - 7);
        }
      }
      ctx.restore();
      const text = `${name} = ${muF(b.C)}`;
      const sub = `${muC(b.Q)}, ${volt(b.V)}`;
      if (side === 'below') label(text, x, y - 0.1, 'center', sub);
      else if (side === 'left') label(text, x - 0.06, y + 0.03, 'right', sub);
      else label(text, x + 0.06, y + 0.03, 'left', sub);
    };

    // the battery on the left: long plate +, on top
    const battery = (connected: boolean) => {
      const [bx, by] = S(xBat, 0);
      line([
        [xBat, yTop],
        [xBat, 0.06],
      ]);
      line([
        [xBat, -0.06],
        [xBat, yBot],
      ]);
      ctx.save();
      ctx.fillStyle = p.paper;
      ctx.fillRect(bx - 20, by - 10, 40, 20);
      ctx.lineWidth = 3;
      ctx.strokeStyle = p.ink;
      ctx.beginPath();
      ctx.moveTo(bx - 18, by - 5);
      ctx.lineTo(bx + 18, by - 5);
      ctx.moveTo(bx - 9, by + 5);
      ctx.lineTo(bx + 9, by + 5);
      ctx.stroke();
      ctx.restore();
      // inside the loop: outside it, the label runs off the left edge on a phone
      label(`${s.volts} V`, xBat + 0.07, 0, 'left');
      void connected;
    };

    const [b1, b2, b3] = sol.branches;
    if (s.topology === 'parallel') {
      battery(true);
      line([
        [xBat, yTop],
        [0.45, yTop],
        [0.45, yBot],
        [xBat, yBot],
      ]);
      line([
        [-0.15, yTop],
        [-0.15, yBot],
      ]);
      cap(-0.15, 0, true, 'C₁', b1, 'right');
      cap(0.45, 0, true, 'C₂', b2, 'right');
    } else if (s.topology === 'series') {
      battery(true);
      line([
        [xBat, yTop],
        [0.6, yTop],
        [0.6, yBot],
        [xBat, yBot],
      ]);
      cap(-0.3, yTop, false, 'C₁', b1, 'below');
      cap(0.2, yTop, false, 'C₂', b2, 'below');
    } else if (s.topology === 'mixed') {
      battery(true);
      line([
        [xBat, yTop],
        [0.65, yTop],
        [0.65, yBot],
        [xBat, yBot],
      ]);
      line([
        [0.1, yTop],
        [0.1, yBot],
      ]);
      cap(-0.4, yTop, false, 'C₁', b1, 'below');
      cap(0.1, -0.05, true, 'C₂', b2, 'right');
      cap(0.65, -0.05, true, 'C₃', b3, 'right');
    } else {
      // share: C₁ on a branch at x = −0.25; a two-way switch at the top joins it to the battery or to C₂
      const xs = -0.25;
      const xC2 = 0.45;
      battery(!s.switched);
      line([
        [xBat, yTop],
        [xs - 0.18, yTop],
      ]);
      line([
        [xs + 0.18, yTop],
        [xC2, yTop],
        [xC2, yBot],
        [xBat, yBot],
      ]);
      line([
        [xs, yTop - 0.06],
        [xs, yBot],
      ]);
      // the switch blade pivots at C₁'s top
      const [px, py] = S(xs, yTop - 0.06);
      const [ax] = S(xs - 0.18, yTop);
      const [bx2] = S(xs + 0.18, yTop);
      const [, ty] = S(0, yTop);
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(s.switched ? bx2 : ax, ty);
      ctx.stroke();
      ctx.fillStyle = p.ink;
      for (const x of [ax, bx2, px]) {
        ctx.beginPath();
        ctx.arc(x, x === px ? py : ty, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      cap(xs, -0.08, true, 'C₁', b1, 'right');
      cap(xC2, -0.08, true, 'C₂', b2, 'right');
    }
    // equivalent capacitance in the corner
    ctx.restore();
    const [ex, ey] = S(0.95, -0.52);
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.12);
    ctx.fillStyle = p.ink;
    ctx.font = `700 13px ${p.fontUi}`;
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(s.topology === 'share' ? `ΣQ = ${muC(b1.Q + b2.Q)}` : `C_eq = ${muF(sol.Ceq)}`, ex, ey);
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const names = ['C₁', 'C₂', 'C₃'];
  const offered = props.topologies ?? (Object.keys(TOPO_LABEL) as Topology[]);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: קבלים ${TOPO_LABEL[s.topology]}. ${sol.branches.map((b, i) => `${names[i]}: ${muF(b.C)}, מטען ${muC(b.Q)}, מתח ${volt(b.V)}`).join('. ')}.`}
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
          {s.topology !== 'share' && (
            <span>
              קיבול שקול: <b class="q">C = {muF(sol.Ceq)}</b>, מטען מהסוללה: <b class="q">{muC(sol.Ceq * s.volts)}</b>
            </span>
          )}
          {sol.branches.map((b, i) => (
            <span key={i}>
              {names[i]}: <b class="q">Q = {muC(b.Q)}, V = {volt(b.V)}, U = {muJ(b.U)}</b>
            </span>
          ))}
          {s.topology === 'share' && (
            <span>
              אנרגיה כוללת: <b class="q">{s.switched ? `${muJ(sol.before ?? 0)} → ${muJ(sol.after ?? 0)}` : muJ(sol.before ?? 0)}</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          {offered.length > 1 && (
            <div class="group" role="group" aria-label="סוג החיבור">
              {offered.map((k) => (
                <button type="button" key={k} class={`toggle ${s.topology === k ? 'on' : ''}`} aria-pressed={s.topology === k} onClick={() => act({ topology: k })}>
                  {TOPO_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          {s.topology === 'share' && (
            <button type="button" class="btn primary" onClick={() => act({ switched: !s.switched })}>
              {s.switched ? 'החזירו את המתג לסוללה' : 'העבירו את המתג ל-C₂'}
            </button>
          )}
          <Slider label="C₁" value={s.C1} min={1} max={6} step={1} format={(v) => `${v} μF`} onChange={(v) => act({ C1: v })} />
          <Slider label="C₂" value={s.C2} min={1} max={6} step={1} format={(v) => `${v} μF`} onChange={(v) => act({ C2: v })} />
          {s.topology === 'mixed' && <Slider label="C₃" value={s.C3} min={1} max={6} step={1} format={(v) => `${v} μF`} onChange={(v) => act({ C3: v })} />}
          <Slider label="המתח של הסוללה" value={s.volts} min={6} max={24} step={6} format={(v) => `${v} V`} onChange={(v) => act({ volts: v })} />
        </>
      }
    />
  );
}
