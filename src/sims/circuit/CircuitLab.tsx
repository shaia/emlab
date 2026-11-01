/**
 * Circuit lab: a circuit drawn on a grid, solved live by src/physics/circuits.ts. The chapter 3
 * figure. Parts sit on grid edges; the board is the network, so every number on screen is the
 * solver's: potentials, currents, meter readings and bulb brightness.
 *
 * What a lesson can switch on:
 * - a voltmeter probe: two leads the learner drags onto any two points (lesson 3.1);
 * - the potential view: wires coloured by potential, with the potential written at each node,
 *   and a "height" profile of one loop under the board: up through a battery, flat along a wire,
 *   down through a bulb (voltage as the primary idea, as the Ministry asks);
 * - moving current marks, or the electrons moving the other way (lesson 3.2);
 * - the builder: tools to draw wires by dragging across the grid and to drop parts on edges.
 *
 * The board is schematic: wires have no resistance, bulbs keep a fixed resistance, and meters are
 * ideal unless a preset gives them one. Brightness is the bulb's power against the preset's
 * reference power.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from '../core/canvas';
import { mix, withAlpha } from '../core/ink';
import { sci } from '../core/format';
import SimShell, { Slider, Toggle, type TaskDef } from '../core/SimShell';
import {
  expandLoop,
  isEdge,
  labelOf,
  nodeOf,
  place,
  ptOf,
  sameEdge,
  solveBoard,
  usedPoints,
  type Board,
  type BoardSolution,
  type Part,
  type PartKind,
  type Pt,
} from './board';
import { PRESETS, type Preset } from './presets';

type Tool = 'select' | 'erase' | PartKind;
type Measure = 'V' | 'I' | 'P';

const PRESET_LABEL: Record<string, string> = {
  simple: 'נורה אחת',
  series2: 'שתי נורות',
  unjoined: 'בנו בעצמכם',
};

const TOOL_LABEL: Record<Tool, string> = {
  select: 'בחירה',
  erase: 'מחיקה',
  wire: 'תיל',
  resistor: 'נגד',
  bulb: 'נורה',
  rheostat: 'נגד משתנה',
  battery: 'סוללה',
  switch: 'מפסק',
  ammeter: 'מד זרם',
  voltmeter: 'מד מתח',
  capacitor: 'קבל',
};

const KIND_NAME: Record<PartKind, string> = {
  wire: 'תיל',
  resistor: 'נגד',
  bulb: 'נורה',
  rheostat: 'נגד משתנה',
  battery: 'סוללה',
  switch: 'מפסק',
  ammeter: 'מד זרם',
  voltmeter: 'מד מתח',
  capacitor: 'קבל',
};

const TASK_LABEL: Record<string, string> = {
  'probe-battery': 'הניחו את שני החודים של מד המתח על שני ההדקים של הסוללה.',
  'probe-wire': 'הניחו את שני החודים על שתי נקודות של אותו תיל. מה מראה מד המתח?',
  'probe-open': 'כשהמפסק פתוח: מדדו את המתח בין שני הצדדים של המפסק.',
  'probe-bulb': 'סגרו את המפסק, ומדדו את המתח בין שני הקצוות של הנורה.',
  light: 'חברו תילים כך שהנורה תדלק. גררו על הרשת כדי לצייר תיל.',
};

export interface CircuitLabProps {
  id: string;
  preset?: string;
  /** presets offered as chips (default: only `preset`) */
  presets?: string[];
  /** builder tools; absent = no builder */
  tools?: Tool[];
  /** the voltmeter probe, and where its red (+) and black (−) leads start */
  probe?: [Pt, Pt];
  showPotential?: boolean;
  /** offer a chip that turns the potential view on and off */
  potentialToggle?: boolean;
  /** draw the height profile of this loop of the preset */
  profile?: string;
  /** offer a chip that shows electrons instead of the current */
  electronsToggle?: boolean;
  /** what the readout lists for each part (default V and I) */
  measure?: Measure[];
  /** write resistances and EMFs beside the parts (default true) */
  showValues?: boolean;
  /** sliders: 'L2:R', 'eps:emf', 'eps:r' */
  sliders?: string[];
  tasks?: string[];
}

interface State {
  preset: string;
  board: Board;
  probe: [Pt, Pt] | null;
  potential: boolean;
  electrons: boolean;
  selected: string | null;
  tool: Tool;
}

const clone = (b: Board): Board => ({ ...b, parts: b.parts.map((p) => ({ ...p })) });
const presetOf = (name: string): Preset => PRESETS[name] ?? PRESETS.simple;

/** tiny solver residue (1e-16) must not print as a number or move a mark */
const clean = (x: number) => (Math.abs(x) < 1e-9 ? 0 : x);
const volts = (V: number) => (Number.isNaN(V) ? '—' : `${sci(clean(V))} V`);
const amps = (I: number) => `${sci(Math.abs(clean(I)))} A`;
const watts = (P: number) => `${sci(Math.abs(clean(P)))} W`;
const ohms = (R: number) => `${sci(R)} Ω`;

/* -------------------------------------------------------------- geometry */

const MARGIN = 0.65;
const STRIP = 1.75;

interface Geo {
  /** px per grid cell */
  c: number;
  ox: number;
  oy: number;
  /** profile strip box (px), when there is one */
  strip: { x: number; y: number; w: number; h: number } | null;
}

const unitsW = (b: Board) => b.cols - 1 + 2 * MARGIN;
const unitsH = (b: Board, profile: boolean) => b.rows - 1 + 2 * MARGIN + (profile ? STRIP : 0);

function geometry(w: number, h: number, b: Board, profile: boolean): Geo {
  const c = Math.min(w / unitsW(b), h / unitsH(b, profile));
  const ox = (w - (b.cols - 1) * c) / 2;
  const oy = MARGIN * c + (h - unitsH(b, profile) * c) / 2;
  const strip = profile ? { x: Math.max(44, ox - 0.2 * c), y: oy + (b.rows - 1 + MARGIN) * c + 0.1 * c, w: 0, h: (STRIP - 0.5) * c } : null;
  if (strip) strip.w = w - strip.x - Math.max(16, ox - 0.4 * c);
  return { c, ox, oy, strip };
}

const scr = (g: Geo, p: Pt): [number, number] => [g.ox + p[0] * g.c, g.oy + p[1] * g.c];

/** the grid point nearest (sx, sy), and its distance in cells */
function nearestPoint(g: Geo, b: Board, sx: number, sy: number): { p: Pt; d: number } {
  const gx = (sx - g.ox) / g.c;
  const gy = (sy - g.oy) / g.c;
  const p: Pt = [Math.max(0, Math.min(b.cols - 1, Math.round(gx))), Math.max(0, Math.min(b.rows - 1, Math.round(gy)))];
  return { p, d: Math.hypot(gx - p[0], gy - p[1]) };
}

/** the grid edge whose midpoint is nearest (sx, sy) */
function nearestEdge(g: Geo, b: Board, sx: number, sy: number): { from: Pt; to: Pt; d: number } | null {
  const gx = (sx - g.ox) / g.c;
  const gy = (sy - g.oy) / g.c;
  const cands: { from: Pt; to: Pt }[] = [];
  const hx = Math.floor(gx);
  const hy = Math.round(gy);
  cands.push({ from: [hx, hy], to: [hx + 1, hy] });
  const vx = Math.round(gx);
  const vy = Math.floor(gy);
  cands.push({ from: [vx, vy], to: [vx, vy + 1] });
  let best: { from: Pt; to: Pt; d: number } | null = null;
  for (const e of cands) {
    if (!isEdge(b, e.from, e.to)) continue;
    const mx = (e.from[0] + e.to[0]) / 2;
    const my = (e.from[1] + e.to[1]) / 2;
    const d = Math.hypot(gx - mx, gy - my);
    if (!best || d < best.d) best = { ...e, d };
  }
  return best;
}

/** potential relative to the drawn 0 V point */
function groundNode(b: Board, preset: Preset): number | null {
  if (preset.ground) return nodeOf(b, preset.ground);
  const bat = b.parts.find((p) => p.kind === 'battery');
  return bat ? nodeOf(b, bat.from) : null;
}

/* --------------------------------------------------------------- the island */

export default function CircuitLab(props: CircuitLabProps) {
  const init = (): State => {
    const name = props.preset ?? 'simple';
    return {
      preset: name,
      board: clone(presetOf(name).board),
      probe: props.probe ? [props.probe[0], props.probe[1]] : null,
      potential: props.showPotential ?? false,
      electrons: false,
      selected: null,
      tool: 'select',
    };
  };
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const userActed = useRef(false);
  const drag = useRef<{ kind: 'probe'; i: 0 | 1 } | { kind: 'wire'; last: Pt } | null>(null);
  const probeDrag = useRef<[number, number, 0 | 1] | null>(null);
  const phase = useRef(new Map<string, number>());
  const lastT = useRef(0);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const preset = presetOf(s.preset);
  const sol = useMemo(() => solveBoard(s.board), [s.board]);
  const measure = props.measure ?? ['V', 'I'];
  const showValues = props.showValues ?? true;
  const profileLoop = props.profile ? preset.loops?.[props.profile] : undefined;
  const pref = preset.pref ?? 24;

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => {
          let next = { ...prev };
          if (typeof st.preset === 'string' && st.preset in PRESETS) {
            next = { ...next, preset: st.preset, board: clone(PRESETS[st.preset].board), selected: null };
          }
          if (typeof st.potential === 'boolean') next.potential = st.potential;
          if (typeof st.electrons === 'boolean') next.electrons = st.electrons;
          if (Array.isArray(st.probe) && next.probe) next.probe = st.probe as [Pt, Pt];
          const closed = st.closed as Record<string, boolean> | undefined;
          const values = st.values as Record<string, Partial<Part>> | undefined;
          if (closed || values) {
            next.board = {
              ...next.board,
              parts: next.board.parts.map((p) => ({
                ...p,
                ...(values?.[p.id] ?? {}),
                ...(closed && p.id in closed ? { closed: closed[p.id] } : {}),
              })),
            };
          }
          return next;
        });
      }),
    [props.id],
  );

  /* ---------------------------------------------------------- tasks */

  const has = (t: string) => props.tasks?.includes(t);
  const done = (t: string) => markTask(`${props.id}:${t}`);

  /** check the guided tasks against a state the learner has just produced */
  const checkTasks = (st: State, so: BoardSolution) => {
    if (!so.ok) return;
    const b = st.board;
    if (st.probe) {
      const [pr, pb] = st.probe.map((p) => nodeOf(b, p));
      const across = (p: Part) => {
        const a = nodeOf(b, p.from);
        const c = nodeOf(b, p.to);
        return (pr === a && pb === c) || (pr === c && pb === a);
      };
      // same wire: both points joined by wires alone (one potential), and the points differ
      if (has('probe-wire') && pr !== pb && sameWireGroup(b, pr, pb)) done('probe-wire');
      for (const p of b.parts) {
        if (!across(p)) continue;
        if (p.kind === 'battery' && has('probe-battery')) done('probe-battery');
        if (p.kind === 'switch' && !p.closed && has('probe-open')) done('probe-open');
        if (p.kind === 'bulb' && has('probe-bulb') && Math.abs(so.parts[p.id].I) > 1e-6) done('probe-bulb');
      }
    }
    if (has('light') && b.parts.some((p) => p.kind === 'bulb' && Math.abs(so.parts[p.id]?.P ?? 0) > 0.05 * pref)) done('light');
  };

  const act = (f: (prev: State) => State) => {
    userActed.current = true;
    setS((prev) => {
      const next = f(prev);
      checkTasks(next, next.board === prev.board ? sol : solveBoard(next.board));
      return next;
    });
  };

  useEffect(() => {
    if (!userActed.current) return;
    if (!sol.ok) setLive(sol.reason === 'short' ? 'קצר: הסוללה מחוברת בתיל בלי שום רכיב.' : 'המעגל לא פתיר: שתי סוללות אידאליות מחוברות זו לזו.');
    else if (s.probe) setLive(`מד המתח מראה ${volts(probeReading(s, sol))}.`);
    else setLive(describe(s.board, sol));
  }, [s]);

  /* ---------------------------------------------------------- drawing */

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const b = s.board;
    const g = geometry(view.w, view.h, b, !!profileLoop);
    const dt = Math.max(0, Math.min(0.1, t - lastT.current));
    lastT.current = t;
    const moving = motionAllowed();
    const ok = sol.ok;
    const gnd = groundNode(b, preset);
    const V0 = ok && gnd !== null ? sol.V[gnd] : 0;
    const Vs = ok ? sol.V.map((v) => v - V0) : [];
    const used = usedPoints(b);
    const piece = pieceOf(b);
    // a point not joined to the 0 V point has no defined potential: no label, no colour
    const grounded = (n: number) => gnd !== null && piece[n] === piece[gnd];
    let vmin = 0;
    let vmax = 0;
    if (ok) for (const n of used) if (grounded(n)) (vmin = Math.min(vmin, Vs[n])), (vmax = Math.max(vmax, Vs[n]));
    const vColor = (v: number) => (vmax - vmin < 1e-9 ? p.ink2 : mix(p.neg, p.pos, (v - vmin) / (vmax - vmin)));

    // the builder's empty grid
    if (props.tools) {
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink3, 0.5);
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 1;
      for (let i = 0; i < b.cols; i++)
        for (let j = 0; j < b.rows; j++) {
          const [x, y] = scr(g, [i, j]);
          if (i + 1 < b.cols && !b.parts.some((q) => sameEdge(q, [i, j], [i + 1, j]))) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + g.c, y);
            ctx.stroke();
          }
          if (j + 1 < b.rows && !b.parts.some((q) => sameEdge(q, [i, j], [i, j + 1]))) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + g.c);
            ctx.stroke();
          }
        }
      ctx.setLineDash([]);
      ctx.fillStyle = p.ink3;
      for (let i = 0; i < b.cols; i++)
        for (let j = 0; j < b.rows; j++) {
          const [x, y] = scr(g, [i, j]);
          ctx.beginPath();
          ctx.arc(x, y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.restore();
    }

    // the loop of the profile, faintly highlighted on the board
    if (profileLoop) {
      ctx.save();
      ctx.strokeStyle = withAlpha(p.hand, 0.13);
      ctx.lineWidth = 0.32 * g.c;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      profileLoop.forEach((pt, i) => {
        const [x, y] = scr(g, pt);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    const Iref = ok ? Math.max(1e-6, ...Object.values(sol.parts).map((r) => Math.abs(r.I))) : 1;
    for (const part of b.parts) drawPart(ctx, g, p, part, ok ? sol.parts[part.id] : undefined, b.cols, pref);

    // potential labels: once per wire-joined group, at a node a non-wire part touches
    if (s.potential && ok) {
      const seen = new Set<string>();
      for (const part of b.parts) {
        if (part.kind === 'wire') continue;
        for (const pt of [part.from, part.to]) {
          const n = nodeOf(b, pt);
          const key = groupKey(b, n);
          if (seen.has(key) || !grounded(n)) continue;
          seen.add(key);
          const [x, y] = scr(g, pt);
          tag(ctx, p, volts(Vs[n]), x, y, vColor(Vs[n]));
        }
      }
    }

    // potential view: wires tinted by potential, under the moving marks
    if (s.potential && ok) {
      ctx.save();
      ctx.lineCap = 'round';
      for (const part of b.parts) {
        if (part.kind !== 'wire' || !grounded(nodeOf(b, part.from))) continue;
        const [x0, y0] = scr(g, part.from);
        const [x1, y1] = scr(g, part.to);
        ctx.strokeStyle = withAlpha(vColor(Vs[nodeOf(b, part.from)]), 0.55);
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // moving marks: the current from + to −, or the electrons the other way
    if (ok && Iref > 1e-6) {
      for (const part of b.parts) {
        const r = sol.parts[part.id];
        if (!r || Math.abs(r.I) < 1e-6 * Iref) continue;
        const rel = r.I / Iref;
        const dir = (s.electrons ? -1 : 1) * Math.sign(rel);
        const ph = (phase.current.get(part.id) ?? 0) + (moving ? dir * Math.abs(rel) * 0.55 * dt : 0);
        phase.current.set(part.id, ph - Math.floor(ph));
        const [x0, y0] = scr(g, part.from);
        const [x1, y1] = scr(g, part.to);
        const ux = (x1 - x0) / g.c;
        const uy = (y1 - y0) / g.c;
        const body = part.kind === 'wire' ? 0 : 0.26;
        const marks = moving ? 3 : 1;
        for (let k = 0; k < marks; k++) {
          const u = moving ? (ph + k / marks) % 1 : 0.5;
          if (part.kind !== 'wire' && Math.abs(u - 0.5) < body) continue;
          const x = x0 + (x1 - x0) * u;
          const y = y0 + (y1 - y0) * u;
          if (s.electrons) electron(ctx, p, x, y);
          else currentMark(ctx, p, x, y, dir * ux, dir * uy);
        }
        // still: one mark beside each non-wire part as well, so the direction stays readable
        if (!moving && part.kind !== 'wire') {
          const u = 0.15;
          const x = x0 + (x1 - x0) * (rel > 0 ? u : 1 - u);
          const y = y0 + (y1 - y0) * (rel > 0 ? u : 1 - u);
          if (s.electrons) electron(ctx, p, x, y);
          else currentMark(ctx, p, x, y, dir * ux, dir * uy);
        }
      }
    }

    if (!ok) {
      ctx.save();
      ctx.fillStyle = withAlpha(p.paper, 0.85);
      const [cx] = scr(g, [(b.cols - 1) / 2, 0]);
      ctx.font = `700 14px ${p.fontUi}`;
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const msg = sol.reason === 'short' ? 'קצר! הסוללה מחוברת בתיל בלי שום רכיב' : 'שתי סוללות מחוברות זו לזו בלי שום רכיב';
      const tw = ctx.measureText(msg).width + 20;
      ctx.fillRect(cx - tw / 2, 4, tw, 24);
      ctx.fillStyle = p.accent;
      ctx.fillText(msg, cx, 16);
      ctx.restore();
    }

    if (s.probe) drawProbe(ctx, g, p, s, ok ? volts(probeReading(s, sol)) : '—', probeDrag.current);
    if (profileLoop && g.strip && ok) drawProfile(ctx, g, p, b, profileLoop, Vs, vmin, vmax);
  };

  const animate = sol.ok && Object.values(sol.parts).some((r) => Math.abs(r.I) > 1e-9);
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: unitsW(s.board),
    worldHeight: unitsH(s.board, !!profileLoop),
    animate,
  });
  useEffect(invalidate, [s]);

  /* ---------------------------------------------------------- pointer */

  const local = (e: PointerEvent): [number, number] => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const geo = () => {
    const v = viewRef.current;
    return v ? geometry(v.w, v.h, s.board, !!profileLoop) : null;
  };

  const onPointerDown = (e: PointerEvent) => {
    const g = geo();
    if (!g) return;
    const [sx, sy] = local(e);
    // a probe lead first: it sits on top of everything
    if (s.probe) {
      for (const i of [0, 1] as const) {
        const [px, py] = probeTip(g, s.probe[i], i);
        if (Math.hypot(sx - px, sy - py) < 22) {
          drag.current = { kind: 'probe', i };
          probeDrag.current = [sx, sy, i];
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          invalidate();
          return;
        }
      }
    }
    const tool = s.tool;
    if (props.tools && tool === 'wire') {
      const np = nearestPoint(g, s.board, sx, sy);
      if (np.d < 0.4) {
        drag.current = { kind: 'wire', last: np.p };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      return;
    }
    const ed = nearestEdge(g, s.board, sx, sy);
    if (!ed || ed.d > 0.38) return;
    if (props.tools && tool !== 'select') {
      act((prev) => ({ ...prev, board: place(prev.board, tool, ed.from, ed.to), selected: null }));
      return;
    }
    const part = s.board.parts.find((q) => sameEdge(q, ed.from, ed.to));
    if (!part) return;
    if (part.kind === 'switch') toggleSwitch(part.id);
    else if (props.tools) act((prev) => ({ ...prev, selected: prev.selected === part.id ? null : part.id }));
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const g = geo();
    if (!g) return;
    const [sx, sy] = local(e);
    if (d.kind === 'probe') {
      probeDrag.current = [sx, sy, d.i];
      invalidate();
      return;
    }
    const np = nearestPoint(g, s.board, sx, sy);
    if (np.d > 0.4) return;
    const [lx, ly] = d.last;
    if (np.p[0] === lx && np.p[1] === ly) return;
    if (isEdge(s.board, d.last, np.p)) {
      const from = d.last;
      act((prev) => ({ ...prev, board: place(prev.board, 'wire', from, np.p) }));
    }
    d.last = np.p;
  };

  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'probe' && s.probe) {
      const g = geo();
      probeDrag.current = null;
      if (!g) return;
      const [sx, sy] = local(e);
      const target = snapProbe(g, s.board, sx, sy, d.i);
      if (target) {
        act((prev) => {
          if (!prev.probe) return prev;
          const pr: [Pt, Pt] = [prev.probe[0], prev.probe[1]];
          pr[d.i] = target;
          return { ...prev, probe: pr };
        });
      } else invalidate();
    }
  };

  /** keyboard: 1 / 2 pick a probe lead, arrows move it to the next point a part touches */
  const picked = useRef<0 | 1>(0);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!s.probe) return;
    if (e.key === '1' || e.key === '2') {
      picked.current = e.key === '1' ? 0 : 1;
      setLive(`נבחר החוד ${picked.current === 0 ? 'האדום' : 'השחור'}.`);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dv = dirs[e.key];
    if (!dv) return;
    e.preventDefault();
    const used = usedPoints(s.board);
    const i = picked.current;
    let [x, y] = s.probe[i];
    for (let k = 0; k < Math.max(s.board.cols, s.board.rows); k++) {
      x += dv[0];
      y += dv[1];
      if (x < 0 || y < 0 || x >= s.board.cols || y >= s.board.rows) return;
      if (used.has(nodeOf(s.board, [x, y]))) {
        const to: Pt = [x, y];
        act((prev) => {
          if (!prev.probe) return prev;
          const pr: [Pt, Pt] = [prev.probe[0], prev.probe[1]];
          pr[i] = to;
          return { ...prev, probe: pr };
        });
        return;
      }
    }
  };

  const toggleSwitch = (id: string) =>
    act((prev) => ({ ...prev, board: { ...prev.board, parts: prev.board.parts.map((q) => (q.id === id ? { ...q, closed: !q.closed } : q)) } }));

  const setValue = (id: string, key: 'R' | 'emf' | 'r', v: number) =>
    act((prev) => ({ ...prev, board: { ...prev.board, parts: prev.board.parts.map((q) => (q.id === id ? { ...q, [key]: v } : q)) } }));

  /* ---------------------------------------------------------- panel */

  const switches = s.board.parts.filter((q) => q.kind === 'switch');
  const listed = s.board.parts.filter((q) => q.kind !== 'wire' && q.kind !== 'switch');
  const selected = s.board.parts.find((q) => q.id === s.selected);
  const offered = props.presets ?? [];

  const sliderFor = (spec: string) => {
    const [id, key] = spec.split(':') as [string, 'R' | 'emf' | 'r'];
    const part = s.board.parts.find((q) => q.id === id);
    if (!part) return null;
    const name = labelOf(id);
    if (key === 'emf')
      return <Slider key={spec} label={`הכא"מ של ${name}`} value={part.emf ?? 12} min={1.5} max={24} step={1.5} format={volts} onChange={(v) => setValue(id, 'emf', v)} />;
    if (key === 'r')
      return <Slider key={spec} label={`ההתנגדות הפנימית של ${name}`} value={part.r ?? 0} min={0} max={4} step={0.5} format={ohms} onChange={(v) => setValue(id, 'r', v)} />;
    const lo = part.kind === 'rheostat' ? 0 : 1;
    return <Slider key={spec} label={`ההתנגדות של ${name}`} value={part.R ?? 6} min={lo} max={24} step={1} format={ohms} onChange={(v) => setValue(id, 'R', Math.max(v, 1e-3))} />;
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: מעגל חשמלי. ${sol.ok ? describe(s.board, sol) : 'קצר במעגל.'}`}
      canvasRef={canvasRef}
      aspect={unitsW(s.board) / unitsH(s.board, !!profileLoop)}
      live={live}
      tasks={tasks}
      cursor={props.tools && s.tool !== 'select' ? 'crosshair' : s.probe ? 'grab' : 'pointer'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      onReset={() => {
        userActed.current = false;
        phase.current.clear();
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          {!sol.ok && <span class="warn">{sol.reason === 'short' ? 'קצר: תיל מחבר ישירות את שני ההדקים של הסוללה. בסוללה אידאלית הזרם היה אינסופי.' : 'שתי סוללות מחוברות זו לזו בלי רכיב ביניהן.'}</span>}
          {sol.ok && s.probe && (
            <span>
              מד המתח (החוד האדום פחות השחור): <b class="q">{volts(probeReading(s, sol))}</b>
            </span>
          )}
          {sol.ok &&
            listed.map((q) => {
              const r = sol.parts[q.id];
              if (!r) return null;
              // Hebrew words stay outside the LTR quantity spans, or the line reorders
              const bits: [string, string][] = [];
              if (q.kind === 'battery') {
                if (measure.includes('V')) bits.push(['המתח בין ההדקים', volts(r.V)]);
                if (measure.includes('I')) bits.push(['', `I = ${amps(r.I)}`]);
                if (measure.includes('P')) bits.push(['מספקת', watts(r.P)]);
              } else if (q.kind === 'ammeter') bits.push(['מראה', amps(r.I)]);
              else if (q.kind === 'voltmeter') bits.push(['מראה', volts(Math.abs(r.V))]);
              else {
                if (measure.includes('V')) bits.push(['', `V = ${volts(Math.abs(r.V))}`]);
                if (measure.includes('I')) bits.push(['', `I = ${amps(r.I)}`]);
                if (measure.includes('P')) bits.push(['', `P = ${watts(r.P)}`]);
              }
              return (
                <span key={q.id}>
                  {labelOf(q.id)}:{' '}
                  {bits.map(([he, qty], i) => (
                    <>
                      {i > 0 && ', '}
                      {he && `${he} `}
                      <b class="q">{qty}</b>
                    </>
                  ))}
                </span>
              );
            })}
        </>
      }
      controls={
        <>
          {offered.length > 1 && (
            <div class="group" role="group" aria-label="המעגל">
              {offered.map((k) => (
                <button
                  type="button"
                  key={k}
                  class={`toggle ${s.preset === k ? 'on' : ''}`}
                  aria-pressed={s.preset === k}
                  onClick={() => act((prev) => ({ ...prev, preset: k, board: clone(presetOf(k).board), selected: null }))}
                >
                  {PRESET_LABEL[k] ?? k}
                </button>
              ))}
            </div>
          )}
          {switches.length > 0 && (
            <div class="group" role="group" aria-label="מפסקים">
              {switches.map((q) => (
                <button type="button" key={q.id} class={`toggle ${q.closed ? 'on' : ''}`} aria-pressed={!!q.closed} onClick={() => toggleSwitch(q.id)}>
                  {q.closed ? `פתחו את ${labelOf(q.id)}` : `סגרו את ${labelOf(q.id)}`}
                </button>
              ))}
            </div>
          )}
          {(props.potentialToggle || props.electronsToggle) && (
            <div class="group" role="group" aria-label="תצוגה">
              {props.potentialToggle && <Toggle label="הפוטנציאל בכל נקודה" on={s.potential} onChange={(v) => act((prev) => ({ ...prev, potential: v }))} />}
              {props.electronsToggle && <Toggle label="הראו את האלקטרונים" on={s.electrons} onChange={(v) => act((prev) => ({ ...prev, electrons: v }))} />}
            </div>
          )}
          {props.tools && (
            <div class="group" role="group" aria-label="כלים לבניית המעגל">
              {props.tools.map((t) => (
                <button type="button" key={t} class={`toggle ${s.tool === t ? 'on' : ''}`} aria-pressed={s.tool === t} onClick={() => setS((prev) => ({ ...prev, tool: t, selected: null }))}>
                  {TOOL_LABEL[t]}
                </button>
              ))}
              <button
                type="button"
                class="btn"
                onClick={() => act((prev) => ({ ...prev, board: { ...prev.board, parts: prev.board.parts.filter((q) => q.locked) }, selected: null }))}
              >
                נקו את הלוח
              </button>
            </div>
          )}
          {(props.sliders ?? []).map(sliderFor)}
          {selected && selected.kind !== 'wire' && (
            <div class="group" role="group" aria-label={`${KIND_NAME[selected.kind]} ${labelOf(selected.id)}`}>
              {(selected.kind === 'resistor' || selected.kind === 'bulb' || selected.kind === 'rheostat') && sliderFor(`${selected.id}:R`)}
              {selected.kind === 'battery' && sliderFor(`${selected.id}:emf`)}
              {selected.kind === 'battery' && (
                <button
                  type="button"
                  class="btn"
                  onClick={() =>
                    act((prev) => ({
                      ...prev,
                      board: { ...prev.board, parts: prev.board.parts.map((q) => (q.id === selected.id ? { ...q, from: q.to, to: q.from } : q)) },
                    }))
                  }
                >
                  הפכו את {labelOf(selected.id)}
                </button>
              )}
            </div>
          )}
        </>
      }
    />
  );
}

/* ------------------------------------------------------------ helpers */

function sameWireGroup(b: Board, n1: number, n2: number): boolean {
  return groupKey(b, n1) === groupKey(b, n2);
}

/** nodes joined by plain wires (and closed switches) share a group: one potential */
function groupKey(b: Board, n: number): string {
  const seen = new Set<number>([n]);
  const stack = [n];
  while (stack.length) {
    const x = stack.pop()!;
    for (const p of b.parts) {
      const conducting = p.kind === 'wire' || (p.kind === 'switch' && p.closed) || (p.kind === 'ammeter' && !p.R);
      if (!conducting) continue;
      const a = nodeOf(b, p.from);
      const c = nodeOf(b, p.to);
      const o = a === x ? c : c === x ? a : -1;
      if (o >= 0 && !seen.has(o)) {
        seen.add(o);
        stack.push(o);
      }
    }
  }
  return String(Math.min(...seen));
}

/** the voltmeter's reading, or NaN when its leads touch pieces that are not joined (no defined voltage) */
function probeReading(s: State, sol: Extract<BoardSolution, { ok: true }>): number {
  if (!s.probe) return 0;
  const [a, c] = s.probe.map((p) => nodeOf(s.board, p));
  const piece = pieceOf(s.board);
  if (piece[a] !== piece[c]) return NaN;
  return sol.V[a] - sol.V[c];
}

/**
 * Which conducting piece each node belongs to: nodes joined through anything but a gap (open
 * switch, ideal voltmeter, capacitor) share a piece, and only within a piece are voltages defined.
 */
function pieceOf(b: Board): number[] {
  const parent = Array.from({ length: b.cols * b.rows }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const p of b.parts) {
    const gap = (p.kind === 'switch' && !p.closed) || (p.kind === 'voltmeter' && !p.R) || p.kind === 'capacitor';
    if (!gap) parent[find(nodeOf(b, p.from))] = find(nodeOf(b, p.to));
  }
  return parent.map((_, i) => find(i));
}

function describe(b: Board, sol: Extract<BoardSolution, { ok: true }>): string {
  return b.parts
    .filter((q) => q.kind === 'bulb')
    .map((q) => `נורה ${labelOf(q.id)} ${Math.abs(sol.parts[q.id].I) > 1e-6 ? 'דולקת' : 'כבויה'}`)
    .join(', ');
}

/** where a lead's tip is drawn: red a little up-left of its point, black down-right */
function probeTip(g: Geo, p: Pt, i: 0 | 1): [number, number] {
  const [x, y] = scr(g, p);
  return i === 0 ? [x - 6, y - 6] : [x + 6, y + 6];
}

function snapProbe(g: Geo, b: Board, sx: number, sy: number, i: 0 | 1): Pt | null {
  const used = usedPoints(b);
  let best: Pt | null = null;
  let bd = Infinity;
  for (const n of used) {
    const pt = ptOf(b, n);
    const [x, y] = probeTip(g, pt, i);
    const d = Math.hypot(sx - x, sy - y);
    if (d < bd) (bd = d), (best = pt);
  }
  return bd < 0.7 * g.c ? best : null;
}

function tag(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.font = `700 11px ${p.fontUi}`;
  ctx.direction = 'ltr';
  const w = ctx.measureText(text).width + 8;
  const tx = x + 6;
  const ty = y - 18;
  ctx.fillStyle = withAlpha(p.paper, 0.92);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(tx, ty, w, 15, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tx + 4, ty + 8);
  ctx.restore();
}

function currentMark(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, ux: number, uy: number) {
  const L = Math.hypot(ux, uy) || 1;
  const a = ux / L;
  const b = uy / L;
  const s = 6;
  ctx.save();
  ctx.fillStyle = p.current;
  ctx.strokeStyle = withAlpha(p.ink, 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + a * s, y + b * s);
  ctx.lineTo(x - a * s - b * s * 0.75, y - b * s + a * s * 0.75);
  ctx.lineTo(x - a * s * 0.4, y - b * s * 0.4);
  ctx.lineTo(x - a * s + b * s * 0.75, y - b * s - a * s * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** an electron: a small disc in the negative colour with a − glyph (sign never colour-only) */
function electron(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = p.neg;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 2.6, y);
  ctx.lineTo(x + 2.6, y);
  ctx.stroke();
  ctx.restore();
}

/** one part on its edge, in a frame rotated so that `from` → `to` runs along +x */
function drawPart(
  ctx: CanvasRenderingContext2D,
  g: Geo,
  p: Palette,
  part: Part,
  r: { V: number; I: number; P: number } | undefined,
  cols: number,
  pref: number,
) {
  const [x0, y0] = scr(g, part.from);
  const [x1, y1] = scr(g, part.to);
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const c = g.c;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  /** half-length of the symbol along the edge */
  const half: Record<PartKind, number> = {
    wire: 0,
    resistor: 0.22,
    rheostat: 0.22,
    bulb: 0.17,
    battery: 0.06,
    switch: 0.2,
    ammeter: 0.17,
    voltmeter: 0.17,
    capacitor: 0.05,
  };
  const h = half[part.kind] * c;
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(ang);
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  // the wire up to the symbol
  ctx.beginPath();
  ctx.moveTo(-c / 2, 0);
  ctx.lineTo(-h, 0);
  ctx.moveTo(h, 0);
  ctx.lineTo(c / 2, 0);
  ctx.stroke();

  switch (part.kind) {
    case 'resistor':
    case 'rheostat': {
      const hh = 0.08 * c;
      ctx.fillStyle = p.paper;
      ctx.fillRect(-h, -hh, 2 * h, 2 * hh);
      ctx.strokeRect(-h, -hh, 2 * h, 2 * hh);
      if (part.kind === 'rheostat') {
        ctx.beginPath();
        ctx.moveTo(-h * 0.9, hh * 2);
        ctx.lineTo(h * 0.9, -hh * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(h * 0.9, -hh * 2);
        ctx.lineTo(h * 0.9 - 7, -hh * 2 + 1);
        ctx.moveTo(h * 0.9, -hh * 2);
        ctx.lineTo(h * 0.9 - 2, -hh * 2 + 7);
        ctx.stroke();
      }
      break;
    }
    case 'bulb': {
      const P = r ? Math.abs(r.P) : 0;
      const k = Math.sqrt(Math.min(P / pref, 1.6));
      if (k > 0.02) {
        const glow = ctx.createRadialGradient(0, 0, h * 0.4, 0, 0, h * (1.3 + 1.6 * k));
        glow.addColorStop(0, withAlpha(p.current, 0.25 + 0.6 * Math.min(k, 1)));
        glow.addColorStop(1, withAlpha(p.current, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, h * (1.3 + 1.6 * k), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = k > 0.02 ? mix(p.paper, p.current, 0.25 + 0.55 * Math.min(k, 1)) : p.paper;
      ctx.beginPath();
      ctx.arc(0, 0, h, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const d = h * 0.7;
      ctx.beginPath();
      ctx.moveTo(-d, -d);
      ctx.lineTo(d, d);
      ctx.moveTo(-d, d);
      ctx.lineTo(d, -d);
      ctx.stroke();
      break;
    }
    case 'battery': {
      // long thin plate: + (toward `to`, +x); short thick plate: −
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(h, -0.17 * c);
      ctx.lineTo(h, 0.17 * c);
      ctx.stroke();
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(-h, -0.09 * c);
      ctx.lineTo(-h, 0.09 * c);
      ctx.stroke();
      if (part.r) {
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = p.ink2;
        ctx.strokeRect(-0.3 * c, -0.24 * c, 0.6 * c, 0.48 * c);
        ctx.setLineDash([]);
      }
      break;
    }
    case 'switch': {
      const d = 0.2 * c;
      ctx.fillStyle = p.ink;
      for (const x of [-d, d]) {
        ctx.beginPath();
        ctx.arc(x, 0, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-d, 0);
      const a = part.closed ? 0 : -0.5;
      ctx.lineTo(-d + 2 * d * Math.cos(a), 2 * d * Math.sin(a));
      ctx.stroke();
      break;
    }
    case 'ammeter':
    case 'voltmeter': {
      ctx.fillStyle = p.paper;
      ctx.beginPath();
      ctx.arc(0, 0, h, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'capacitor': {
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-h, -0.14 * c);
      ctx.lineTo(-h, 0.14 * c);
      ctx.moveTo(h, -0.14 * c);
      ctx.lineTo(h, 0.14 * c);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();

  // upright text: glyphs on the symbol, the label beside it
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = p.ink;
  const ux = (x1 - x0) / c;
  const uy = (y1 - y0) / c;
  if (part.kind === 'ammeter' || part.kind === 'voltmeter') {
    ctx.font = `700 ${Math.round(0.17 * c)}px ${p.fontUi}`;
    ctx.fillText(part.kind === 'ammeter' ? 'A' : 'V', mx, my + 1);
  }
  if (part.kind === 'battery') {
    ctx.font = `700 ${Math.max(11, Math.round(0.14 * c))}px ${p.fontUi}`;
    // the + glyph beside the long plate, − beside the short one, on the side away from the label
    const vert = Math.abs(uy) > Math.abs(ux);
    const away = vert ? (part.from[0] === cols - 1 ? 1 : -1) : part.from[1] === 0 ? -1 : 1;
    const nx = vert ? away : 0;
    const ny = vert ? 0 : away;
    const off = 0.2 * c;
    ctx.fillText('+', mx + ux * h * 2.2 + nx * off, my + uy * h * 2.2 + ny * off);
    ctx.fillText('−', mx - ux * h * 2.2 + nx * off, my - uy * h * 2.2 + ny * off);
  }
  if (part.kind !== 'wire') {
    const lines = [labelOf(part.id)];
    const val = valueText(part, r);
    if (val) lines.push(val);
    // beside the edge, on the inner side of the loop where there is room
    const vertical = Math.abs(uy) > Math.abs(ux);
    // vertical parts: label to the right, except in the last column (inward, to the left);
    // horizontal parts: label above, except in the top row (inward, below)
    const side = vertical ? (part.from[0] === cols - 1 ? -1 : 1) : part.from[1] === 0 ? 1 : -1;
    const off = (part.kind === 'battery' ? 0.3 : 0.27) * c;
    const lx = vertical ? mx + side * off : mx;
    const ly = vertical ? my : my + side * off;
    ctx.textAlign = vertical ? (side > 0 ? 'left' : 'right') : 'center';
    ctx.font = `700 13px ${p.fontUi}`;
    ctx.fillText(lines[0], lx, ly - (lines.length > 1 ? 7 : 0));
    if (lines.length > 1) {
      ctx.font = `11px ${p.fontUi}`;
      ctx.fillStyle = part.kind === 'ammeter' || part.kind === 'voltmeter' ? p.ink : p.ink2;
      ctx.fillText(lines[1], lx, ly + 8);
    }
  }
  ctx.restore();
}

function valueText(part: Part, r: { V: number; I: number; P: number } | undefined): string {
  switch (part.kind) {
    case 'battery':
      return part.r ? `${volts(part.emf ?? 12)}, r = ${ohms(part.r)}` : volts(part.emf ?? 12);
    case 'ammeter':
      return r ? amps(r.I) : '';
    case 'voltmeter':
      return r ? volts(Math.abs(r.V)) : '';
    default:
      return '';
  }
}

function drawProbe(
  ctx: CanvasRenderingContext2D,
  g: Geo,
  p: Palette,
  s: State,
  reading: string,
  dragging: [number, number, 0 | 1] | null,
) {
  if (!s.probe) return;
  // the meter box, top-left of the board
  const bx = 8;
  const by = 8;
  ctx.save();
  ctx.font = `700 15px ${p.fontUi}`;
  ctx.direction = 'ltr';
  const w = Math.max(74, ctx.measureText(reading).width + 18);
  ctx.fillStyle = p.paper2;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, 30, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(reading, bx + w / 2, by + 15);
  ctx.restore();
  for (const i of [0, 1] as const) {
    // the lead being dragged follows the pointer
    const [tx, ty] = dragging && dragging[2] === i ? [dragging[0], dragging[1]] : probeTip(g, s.probe[i], i);
    const color = i === 0 ? p.pos : p.ink;
    // lead from the meter
    ctx.save();
    ctx.strokeStyle = withAlpha(color, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + (i === 0 ? 18 : 50), by + 30);
    ctx.quadraticCurveTo(bx + 30, ty, tx, ty);
    ctx.stroke();
    ctx.restore();
    probeHead(ctx, p, tx, ty, i);
  }
}

function probeHead(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, i: 0 | 1) {
  ctx.save();
  ctx.fillStyle = i === 0 ? p.pos : p.ink;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 4, y);
  ctx.lineTo(x + 4, y);
  if (i === 0) {
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
  }
  ctx.stroke();
  ctx.restore();
}

/** the potential along one loop, as a height profile: one equal slot per edge of the loop */
function drawProfile(
  ctx: CanvasRenderingContext2D,
  g: Geo,
  p: Palette,
  b: Board,
  loop: Pt[],
  Vs: number[],
  vmin: number,
  vmax: number,
) {
  const box = g.strip!;
  const pts = expandLoop(loop);
  const n = pts.length;
  const lo = Math.min(0, vmin);
  const hi = Math.max(vmax, lo + 1);
  const X = (u: number) => box.x + (u / n) * box.w;
  const Y = (v: number) => box.y + box.h - ((v - lo) / (hi - lo)) * box.h;
  ctx.save();
  // axes
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y - 4);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.stroke();
  ctx.fillStyle = p.ink2;
  ctx.font = `11px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of [lo, hi]) {
    ctx.fillText(`${sci(v)} V`, box.x - 4, Y(v));
    ctx.strokeStyle = withAlpha(p.ink3, 0.4);
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(box.x, Y(v));
    ctx.lineTo(box.x + box.w, Y(v));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // the profile
  ctx.strokeStyle = p.hand;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const a = pts[k];
    const c = pts[(k + 1) % n];
    const va = Vs[nodeOf(b, a)];
    const vc = Vs[nodeOf(b, c)];
    const part = b.parts.find((q) => sameEdge(q, a, c));
    if (k === 0) ctx.moveTo(X(0), Y(va));
    if (part?.kind === 'battery' && part.r) {
      // inside a real battery: up by ε at once, then down by Ir across its internal resistance
      const forward = sameEdge({ from: a, to: c }, part.from, part.to) && part.from[0] === a[0] && part.from[1] === a[1];
      const emf = (part.emf ?? 0) * (forward ? 1 : -1);
      ctx.lineTo(X(k + 0.35), Y(va));
      ctx.lineTo(X(k + 0.35), Y(va + emf));
      ctx.lineTo(X(k + 0.65), Y(vc));
      ctx.lineTo(X(k + 1), Y(vc));
    } else if (part?.kind === 'battery' || (part?.kind === 'switch' && !part.closed)) {
      // a jump: across an ideal battery, or across the gap of an open switch
      ctx.lineTo(X(k + 0.5), Y(va));
      ctx.lineTo(X(k + 0.5), Y(vc));
      ctx.lineTo(X(k + 1), Y(vc));
    } else if (part && part.kind !== 'wire' && part.kind !== 'switch' && part.kind !== 'ammeter') {
      ctx.lineTo(X(k + 0.25), Y(va));
      ctx.lineTo(X(k + 0.75), Y(vc));
      ctx.lineTo(X(k + 1), Y(vc));
    } else ctx.lineTo(X(k + 1), Y(vc));
  }
  ctx.stroke();
  // part labels under their slots, and the start point A
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 12px ${p.fontUi}`;
  for (let k = 0; k < n; k++) {
    const part = b.parts.find((q) => sameEdge(q, pts[k], pts[(k + 1) % n]));
    if (part && part.kind !== 'wire') ctx.fillText(labelOf(part.id), X(k + 0.5), box.y + box.h + 3);
  }
  ctx.fillStyle = p.hand;
  ctx.fillText('A', X(0), box.y + box.h + 3);
  ctx.fillText('A', X(n), box.y + box.h + 3);
  ctx.restore();
  // A on the board
  const [ax, ay] = scr(g, loop[0]);
  ctx.save();
  ctx.fillStyle = p.hand;
  ctx.font = `700 13px ${p.fontUi}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('A', ax - 6, ay + 4);
  ctx.restore();
}
