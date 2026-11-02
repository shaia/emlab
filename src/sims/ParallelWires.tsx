/**
 * Parallel wires: two or three long straight wires seen end-on (⊙ out of the page, ⊗ into it),
 * draggable, each with its own current slider. The figure draws, for each wire, the field that
 * the OTHER wires make at its place (magnetic colour) and the force per metre on it (force colour);
 * with three wires, optionally the force from each neighbour as well as the resultant. A "source"
 * mode draws one wire's field circle through the other wires, the picture behind F = B₁I₂L.
 * Field lines are contours of the flux function (wireFluxFunction), so their density shows |B|.
 * Built for lesson 4.8.
 *
 * Arrow scales are fixed: 2·10⁻⁴ N/m draws 3 cm of the stage, and 2·10⁻⁵ T draws 3 cm, so doubling
 * a current visibly doubles an arrow. An arrow that would reach another wire or leave the stage is
 * cut short and marked with a break; the readout always shows the true value.
 * Nothing here animates, so still mode needs no special case.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Wire } from '~/physics/magnetism';
import { wireFieldAt } from '~/physics/magnetism';
import { fieldAtWire, netForcePerLength, pairForcePerLength, wireFluxFunction } from '~/physics/wires';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, chevron, depthGlyph, paperGrid, polyline, scaleBar, withAlpha } from './core/ink';
import { directionHe, sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 0.32;
const WORLD_H = 0.24;
const WIRE_PX = 13;
/** closest two wires may come [m] */
const MIN_GAP = 0.02;
/** keep wires this far inside the stage edge [m] */
const MARGIN = 0.02;
const I_MAX = 20;
/** reference force per metre and field, and the stage length that each draws [m] */
const F_REF = 2e-4;
const B_REF = 2e-5;
const REF_LEN = 0.03;
/** longest arrow [m] */
const ARROW_CAP = 0.085;
const SUB = ['₁', '₂', '₃'];

export type Preset = 'pair' | 'line3' | 'triangle';

const H = 0.1 / (2 * Math.sqrt(3)); // equilateral triangle of side 10 cm, centred on the origin
const PRESETS: Record<Preset, Wire[]> = {
  pair: [
    { x: -0.05, y: 0, I: 10 },
    { x: 0.05, y: 0, I: 10 },
  ],
  line3: [
    { x: -0.1, y: 0, I: 10 },
    { x: 0, y: 0, I: 10 },
    { x: 0.1, y: 0, I: -10 },
  ],
  triangle: [
    { x: -0.05, y: -H, I: 10 },
    { x: 0.05, y: -H, I: 10 },
    { x: 0, y: 2 * H, I: 10 },
  ],
};

const PRESET_LABEL: Record<Preset, string> = {
  pair: 'שני תילים',
  line3: 'שלושה בשורה',
  triangle: 'משולש',
};

const TASK_LABEL: Record<string, string> = {
  flip: 'הפכו את הכיוון של הזרם בתיל 2, כך שיהיה ⊗, לתוך הדף. מה קרה לכיווני הכוחות?',
  unequal: 'קבעו בתיל אחד זרם גדול לפחות פי 2 מהזרם בתיל השני. על איזה תיל הכוח גדול יותר?',
  'double-d': 'הגדילו את המרחק בין התילים פי 2 (ל-20 ס"מ), בלי לשנות את הזרמים. פי כמה קטן הכוח?',
  balance: 'מצאו סידור שבו הכוח השקול על תיל 2 מתאפס, בלי לאפס אף זרם.',
  'triangle-flip': 'בסידור המשולש, הפכו את הזרם באחד התילים. לאן מצביע עכשיו הכוח השקול עליו?',
};

interface State {
  wires: Wire[];
  preset: Preset;
  showLines: boolean;
  showField: boolean;
  showParts: boolean;
  /** draw only this wire's field and the forces it causes */
  source: number | null;
  selected: number | null;
}

export interface ParallelWiresProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  preset?: Preset;
  /** presets offered as buttons under the figure */
  presets?: Preset[];
  showLines?: boolean;
  showField?: boolean;
  showParts?: boolean;
  source?: number | null;
  tasks?: string[];
}

const cloneWires = (p: Preset) => PRESETS[p].map((w) => ({ ...w }));

const initial = (p: ParallelWiresProps): State => {
  const preset = p.preset ?? 'pair';
  return {
    wires: cloneWires(preset),
    preset,
    showLines: p.showLines ?? false,
    showField: p.showField ?? true,
    showParts: p.showParts ?? false,
    source: p.source ?? null,
    selected: null,
  };
};

const iText = (I: number) => (I === 0 ? '0 A' : `${Math.abs(I)} A ${I > 0 ? '⊙' : '⊗'}`);
const cm = (m: number) => `${Math.round(m * 1000) / 10}`;
const dist = (a: Wire, b: Wire) => Math.hypot(a.x - b.x, a.y - b.y);
/** size of a vector, with round-off of a cancelled sum (≈10⁻²⁰) reported as an exact zero */
const mag = (v: Vec2) => {
  const m = Math.hypot(v[0], v[1]);
  return m < 1e-15 ? 0 : m;
};
const dirOf = (v: Vec2) => directionHe(Math.atan2(v[1], v[0]));

/* ------------------------------------------------------------------ field lines: contours of A */

interface Lines {
  key: string;
  polys: [number, number][][];
}

/**
 * Contour lines of the flux function at equal steps, by marching squares on a grid of the stage,
 * joined into polylines through the cell edges they share. Cells inside a wire's ring are skipped.
 */
function traceContours(wires: Wire[], v: View): [number, number][][] {
  const step = 0.0025;
  const xmin = -WORLD_W / 2 - step;
  const ymin = -WORLD_H / 2 - step;
  const nx = Math.ceil((WORLD_W + 2 * step) / step);
  const ny = Math.ceil((WORLD_H + 2 * step) / step);
  const core = (WIRE_PX * 0.9) / v.ppm;
  // one contour per this step of A: a 10 A wire gets circles whose radii grow by 1.45 each
  const dA = 2e-7 * 10 * Math.log(1.45);
  const A: number[] = new Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) A[j * (nx + 1) + i] = wireFluxFunction(wires, xmin + i * step, ymin + j * step);
  const at = (i: number, j: number) => A[j * (nx + 1) + i];
  const near = (x: number, y: number) => wires.some((w) => Math.hypot(x - w.x, y - w.y) < core);
  // segments keyed by the edges they cross: edge id → list of [other edge id, point]
  const pts = new Map<string, [number, number]>();
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = xmin + i * step;
      const y0 = ymin + j * step;
      if (near(x0 + step / 2, y0 + step / 2)) continue;
      const c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]; // bl, br, tr, tl
      const lo = Math.min(...c);
      const hi = Math.max(...c);
      if (hi - lo > 6 * dA) continue; // too close to a wire to draw honestly
      for (let k = Math.ceil(lo / dA); k * dA <= hi; k++) {
        const L = k * dA;
        // edges: 0 bottom (bl→br), 1 right (br→tr), 2 top (tl→tr), 3 left (bl→tl)
        const ids = [`h${i},${j},${k}`, `v${i + 1},${j},${k}`, `h${i},${j + 1},${k}`, `v${i},${j},${k}`];
        const ends: [number, number][] = [
          [0, 1],
          [1, 2],
          [3, 2],
          [0, 3],
        ];
        const cross: number[] = [];
        for (let e = 0; e < 4; e++) {
          const [a, b] = ends[e];
          const va = c[a];
          const vb = c[b];
          if ((va < L) === (vb < L)) continue;
          const t = (L - va) / (vb - va);
          const corner = (n: number): [number, number] => [x0 + (n === 1 || n === 2 ? step : 0), y0 + (n >= 2 ? step : 0)];
          const pa = corner(a);
          const pb = corner(b);
          if (!pts.has(ids[e])) pts.set(ids[e], [pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])]);
          cross.push(e);
        }
        if (cross.length === 2) link(ids[cross[0]], ids[cross[1]]);
        else if (cross.length === 4) {
          link(ids[0], ids[3]);
          link(ids[1], ids[2]);
        }
      }
    }
  }
  // walk the chains
  const seen = new Set<string>();
  const polys: [number, number][][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    // go to one end of an open chain, if it is open
    let first = start;
    {
      let prev: string | null = null;
      let cur = start;
      const guard = new Set<string>([cur]);
      for (;;) {
        const nb = (adj.get(cur) ?? []).filter((n) => n !== prev);
        if ((adj.get(cur) ?? []).length < 2 || nb.length === 0) break;
        const nxt = nb[0];
        if (guard.has(nxt)) break; // closed loop
        guard.add(nxt);
        prev = cur;
        cur = nxt;
      }
      first = cur;
    }
    const line: [number, number][] = [];
    let prev: string | null = null;
    let cur: string | null = first;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const p = pts.get(cur)!;
      line.push(toScreen(v, p[0], p[1]));
      const nb: string[] = (adj.get(cur) ?? []).filter((n) => n !== prev && !seen.has(n));
      prev = cur;
      cur = nb[0] ?? null;
    }
    // close a loop
    const last = prev ? adj.get(prev) ?? [] : [];
    if (last.includes(first) && line.length > 2) line.push(line[0]);
    if (line.length > 1) polys.push(line);
  }
  return polys;
}

/* ------------------------------------------------------------------ arrows */

/**
 * Length of an arrow from a wire's ring along screen direction u: the wanted length, cut so that
 * it stops halfway to any wire in its path and stays on the stage.
 */
function fitArrow(v: View, from: [number, number], u: [number, number], want: number, others: [number, number][]) {
  let L = Math.min(want, ARROW_CAP * v.ppm);
  const s0 = WIRE_PX + 3;
  for (const o of others) {
    const dx = o[0] - from[0];
    const dy = o[1] - from[1];
    const along = dx * u[0] + dy * u[1];
    const perp = Math.abs(dx * u[1] - dy * u[0]);
    if (along > 0 && perp < 2 * WIRE_PX) L = Math.min(L, along / 2 - s0 - 3);
  }
  // stay inside the stage
  const pad = 8;
  for (const [p, d, max] of [
    [from[0], u[0], v.w],
    [from[1], u[1], v.h],
  ] as const) {
    if (d > 1e-9) L = Math.min(L, (max - pad - p) / d - s0);
    else if (d < -1e-9) L = Math.min(L, (pad - p) / d - s0);
  }
  L = Math.max(0, L);
  return { L, cut: want > L + 0.5, s0 };
}

function drawVec(
  ctx: CanvasRenderingContext2D,
  v: View,
  p: Palette,
  from: [number, number],
  vec: Vec2,
  perRef: number,
  others: [number, number][],
  style: { color: string; width: number; alpha?: number; label?: string },
) {
  const m = mag(vec);
  if (m === 0) return;
  const u: [number, number] = [vec[0] / m, -vec[1] / m]; // screen y grows downward
  const want = (m / perRef) * REF_LEN * v.ppm;
  const { L, cut, s0 } = fitArrow(v, from, u, want, others);
  if (L < 2) return;
  const x1 = from[0] + u[0] * s0;
  const y1 = from[1] + u[1] * s0;
  const x2 = x1 + u[0] * L;
  const y2 = y1 + u[1] * L;
  arrow(ctx, x1, y1, x2, y2, { color: style.color, width: style.width, head: Math.min(11, L * 0.7), alpha: style.alpha });
  if (cut) {
    const bx = (x1 + x2) / 2;
    const by = (y1 + y2) / 2;
    ctx.save();
    ctx.strokeStyle = p.paper;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bx - u[1] * 7 - u[0] * 2, by + u[0] * 7 - u[1] * 2);
    ctx.lineTo(bx + u[1] * 7 + u[0] * 2, by - u[0] * 7 + u[1] * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (style.label && L >= 14) {
    ctx.save();
    ctx.font = `italic 700 14px ${p.fontUi}`;
    ctx.fillStyle = style.color;
    ctx.globalAlpha = style.alpha ?? 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    // beside the tip, off to the left of the arrow's direction
    ctx.fillText(style.label, x2 + u[0] * 10 + u[1] * 12, y2 + u[1] * 10 - u[0] * 12);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ component */

export default function ParallelWires(props: ParallelWiresProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const drag = useRef<{ i: number; dx: number; dy: number } | null>(null);
  const linesCache = useRef<Lines>({ key: '', polys: [] });
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.preset === 'string' && st.preset in PRESETS) {
            next.preset = st.preset as Preset;
            next.wires = cloneWires(next.preset);
            next.selected = null;
          }
          const cur = st.currents;
          if (Array.isArray(cur)) {
            next.wires = next.wires.map((w, i) => (typeof cur[i] === 'number' ? { ...w, I: cur[i] as number } : w));
          }
          if (typeof st.d === 'number' && next.wires.length === 2) {
            next.wires = [
              { ...next.wires[0], x: -(st.d as number) / 200, y: 0 },
              { ...next.wires[1], x: (st.d as number) / 200, y: 0 },
            ];
          }
          for (const k of ['showLines', 'showField', 'showParts'] as const) if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          if ('source' in st) next.source = typeof st.source === 'number' && st.source < next.wires.length ? st.source : null;
          return next;
        });
      }),
    [props.id],
  );

  // task detection: only the learner's own changes tick tasks (steps never change these
  // quantities in a way that meets a condition: they set the preset's own state)
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const w = s.wires;
    const base = PRESETS[s.preset];
    if (s.preset === 'pair' && w.length === 2) {
      const [a, b] = w;
      if (has('flip') && a.I !== 0 && b.I !== 0 && Math.sign(a.I) !== Math.sign(b.I)) done('flip');
      if (has('unequal') && a.I !== 0 && b.I !== 0 && Math.max(Math.abs(a.I), Math.abs(b.I)) >= 2 * Math.min(Math.abs(a.I), Math.abs(b.I)))
        done('unequal');
      const sameI = a.I === base[0].I && b.I === base[1].I;
      if (has('double-d') && sameI && dist(a, b) >= 2 * dist(base[0], base[1]) - 1e-9) done('double-d');
    }
    if (w.length === 3 && w.every((x) => x.I !== 0)) {
      if (has('balance')) {
        const f1 = mag(pairForcePerLength(w, 1, 0));
        const f2 = mag(pairForcePerLength(w, 1, 2));
        const net = mag(netForcePerLength(w, 1));
        if (Math.min(f1, f2) > 0.1 * F_REF && net < 0.04 * Math.max(f1, f2)) done('balance');
      }
      if (has('triangle-flip') && s.preset === 'triangle' && w.filter((x) => x.I < 0).length === 1) done('triangle-flip');
    }
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p, 0.02);
    const w = s.wires;
    const scr = w.map((x) => toScreen(view, x.x, x.y) as [number, number]);

    if (s.showLines && w.some((x) => x.I !== 0)) {
      const key = JSON.stringify([w, view.w, view.h]);
      if (linesCache.current.key !== key) linesCache.current = { key, polys: traceContours(w, view) };
      for (const line of linesCache.current.polys) {
        polyline(ctx, line, withAlpha(p.bfield, 0.55), 1.3);
        // chevrons every 80 px, turned to point along B
        let acc = 0;
        let next = 40;
        for (let i = 1; i < line.length; i++) {
          const dx = line[i][0] - line[i - 1][0];
          const dy = line[i][1] - line[i - 1][1];
          const seg = Math.hypot(dx, dy);
          while (seg > 0 && acc + seg >= next) {
            const f = (next - acc) / seg;
            const cx = line[i - 1][0] + dx * f;
            const cy = line[i - 1][1] + dy * f;
            const [wx, wy] = toWorld(view, cx, cy);
            const [bx, by] = wireFieldAt(w, wx, wy);
            const sgn = Math.sign(bx * dx - by * dy) || 1; // B in screen coords is (bx, −by)
            chevron(ctx, cx, cy, (sgn * dx) / seg, (sgn * dy) / seg, 4.5, withAlpha(p.bfield, 0.8));
            next += 80;
          }
          acc += seg;
        }
      }
    }

    // the source wire's field circle through each other wire, with its sense of rotation
    if (s.source !== null && s.source < w.length && w[s.source].I !== 0) {
      const j = s.source;
      const [cx, cy] = scr[j];
      for (let i = 0; i < w.length; i++) {
        if (i === j) continue;
        const r = dist(w[i], w[j]) * view.ppm;
        ctx.save();
        ctx.strokeStyle = p.bfield;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // chevrons at the four quarter points, counterclockwise on screen for ⊙
        for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
          const px = cx + r * Math.cos(a);
          const py = cy - r * Math.sin(a);
          const sense = w[j].I > 0 ? 1 : -1;
          chevron(ctx, px, py, -Math.sin(a) * sense, -Math.cos(a) * sense, 5, p.bfield);
        }
      }
    }

    // field at each wire (from the others, or from the source only) and the force on it
    w.forEach((wi, i) => {
      if (s.source !== null && i === s.source) return;
      const others = scr.filter((_, k) => k !== i);
      const B = s.source !== null ? wireFieldAt([w[s.source]], wi.x, wi.y) : fieldAtWire(w, i);
      if (s.showField) {
        const label = s.source !== null ? `B${SUB[s.source]}` : 'B';
        drawVec(ctx, view, p, scr[i], B, B_REF, others, { color: p.bfield, width: 2.2, label });
      }
      if (s.showParts && w.length > 2 && s.source === null) {
        for (let j = 0; j < w.length; j++) {
          if (j === i) continue;
          drawVec(ctx, view, p, scr[i], pairForcePerLength(w, i, j), F_REF, others, { color: p.force, width: 1.8, alpha: 0.5 });
        }
      }
      const F = s.source !== null ? pairForcePerLength(w, i, s.source) : netForcePerLength(w, i);
      drawVec(ctx, view, p, scr[i], F, F_REF, others, { color: p.force, width: 3.2, label: `F${SUB[i]}` });
    });

    // the wires: gold rings with ⊙ / ⊗, a number and the current
    w.forEach((wi, i) => {
      const [x, y] = scr[i];
      if (s.selected === i) {
        ctx.save();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(x, y, WIRE_PX + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (wi.I === 0) {
        ctx.save();
        ctx.strokeStyle = p.current;
        ctx.fillStyle = p.paper;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, WIRE_PX, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else depthGlyph(ctx, x, y, WIRE_PX, wi.I > 0 ? 'out' : 'in', p.current, { fill: p.paper, width: 2.4 });
      // the number and the current go in the two diagonal corners farthest from this wire's arrows
      const dirs: number[] = [];
      for (const v of [fieldAtWire(w, i), netForcePerLength(w, i), ...w.map((_, j) => pairForcePerLength(w, i, j))]) {
        if (mag(v) > 0) dirs.push(Math.atan2(-v[1], v[0]));
      }
      const gap = (a: number) => Math.min(Math.PI, ...dirs.map((d) => Math.abs(((a - d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)));
      const corners = [Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4].sort((a, b) => gap(b) - gap(a));
      const put = (text: string, a: number, font: string, color: string) => {
        const r = WIRE_PX + 9;
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = Math.cos(a) > 0 ? 'left' : 'right';
        ctx.textBaseline = Math.sin(a) > 0 ? 'top' : 'bottom';
        ctx.fillText(text, x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75);
      };
      ctx.save();
      ctx.direction = 'ltr';
      put(String(i + 1), corners[1], `700 13px ${p.fontUi}`, p.ink);
      put(`${Math.abs(wi.I)} A`, corners[0], `600 12px ${p.fontUi}`, p.ink2);
      ctx.restore();
    });

    // the distance between a pair
    if (w.length === 2) {
      const [a, b] = scr;
      const yb = Math.max(a[1], b[1]) + WIRE_PX + 30;
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.fillStyle = p.ink2;
      ctx.lineWidth = 1.1;
      if (Math.abs(a[1] - b[1]) < 1) {
        ctx.beginPath();
        ctx.moveTo(a[0], yb - 4);
        ctx.lineTo(a[0], yb + 4);
        ctx.moveTo(a[0], yb);
        ctx.lineTo(b[0], yb);
        ctx.moveTo(b[0], yb - 4);
        ctx.lineTo(b[0], yb + 4);
        ctx.stroke();
        ctx.font = `600 12px ${p.fontUi}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.direction = 'ltr';
        ctx.fillText(`d = ${cm(dist(w[0], w[1]))} cm`, (a[0] + b[0]) / 2, yb + 4);
      }
      ctx.restore();
    }
    scaleBar(ctx, view, p, 0.05, '5 ס"מ');
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const clampWorld = (x: number, y: number): [number, number] => [
    Math.max(-WORLD_W / 2 + MARGIN, Math.min(WORLD_W / 2 - MARGIN, x)),
    Math.max(-WORLD_H / 2 + MARGIN, Math.min(WORLD_H / 2 - MARGIN, y)),
  ];

  /** move wire i to (x, y), snapped to whole centimetres, unless it would come too close to another */
  const moveWire = (prev: State, i: number, x: number, y: number): State => {
    const [cx, cy] = clampWorld(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    if (prev.wires.some((o, k) => k !== i && Math.hypot(o.x - cx, o.y - cy) < MIN_GAP - 1e-9)) return prev;
    return { ...prev, wires: prev.wires.map((w, k) => (k === i ? { ...w, x: cx, y: cy } : w)) };
  };

  const describe = (st: State) => {
    const w = st.wires;
    const parts = w.map((wi, i) => {
      const F = netForcePerLength(w, i);
      return `על תיל ${i + 1} (${iText(wi.I)}) פועל כוח של ${sci(mag(F))} ניוטון לכל מטר${mag(F) > 0 ? `, ${dirOf(F)}` : ''}`;
    });
    const lead = w.length === 2 ? `המרחק בין התילים ${cm(dist(w[0], w[1]))} סנטימטרים. ` : '';
    return `${lead}${parts.join('. ')}.`;
  };

  const hit = (v: View, sx: number, sy: number): number | null => {
    for (let i = s.wires.length - 1; i >= 0; i--) {
      const [x, y] = toScreen(v, s.wires[i].x, s.wires[i].y);
      if (Math.hypot(sx - x, sy - y) < WIRE_PX + 10) return i;
    }
    return null;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (h === null) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    drag.current = { i: h, dx: s.wires[h].x - wx, dy: s.wires[h].y - wy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    setS((prev) => moveWire(prev, d.i, wx + d.dx, wy + d.dy));
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const next = s.selected === null ? 0 : (s.selected + 1) % s.wires.length;
      setS((prev) => ({ ...prev, selected: next }));
      setLive(`נבחר תיל ${next + 1}, ${iText(s.wires[next].I)}.`);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? s.wires.length - 1;
    const st = moveWire({ ...s, selected: sel }, sel, s.wires[sel].x + d[0] * 0.01, s.wires[sel].y + d[1] * 0.01);
    setS(st);
    setLive(describe(st));
  };

  const setCurrent = (i: number, I: number) => setS((prev) => ({ ...prev, wires: prev.wires.map((w, k) => (k === i ? { ...w, I } : w)) }));
  const setDistance = (dcm: number) =>
    setS((prev) => ({
      ...prev,
      wires: [
        { ...prev.wires[0], x: -dcm / 200, y: 0 },
        { ...prev.wires[1], x: dcm / 200, y: 0 },
      ],
    }));

  const w = s.wires;
  const pair = w.length === 2;
  const dNow = pair ? dist(w[0], w[1]) : 0;

  const readout = pair ? (
    <>
      <span>
        המרחק: <b class="q">d = {cm(dNow)} cm</b>
      </span>
      {[1, 0].map((i) => {
        const j = 1 - i;
        const B = wireFieldAt([w[j]], w[i].x, w[i].y);
        const F = pairForcePerLength(w, i, j);
        return (
          <span key={i}>
            השדה של תיל {j + 1} במקום תיל {i + 1}: <b class="q">B{SUB[j]} = {sci(mag(B))} T</b>
            {mag(B) > 0 && ` (${dirOf(B)})`}; הכוח על כל מטר של תיל {i + 1}: <b class="q">F{SUB[i]}/L = {sci(mag(F))} N/m</b>
            {mag(F) > 0 && ` (${dirOf(F)})`}
          </span>
        );
      })}
      <span>
        {w[0].I === 0 || w[1].I === 0
          ? 'באחד התילים אין זרם, ולכן אין כוח'
          : w[0].I * w[1].I > 0
            ? 'הזרמים באותו כיוון: התילים נמשכים זה לזה'
            : 'הזרמים בכיוונים מנוגדים: התילים נדחים זה מזה'}
      </span>
    </>
  ) : (
    <>
      {w.map((_, i) => {
        const F = netForcePerLength(w, i);
        return (
          <span key={i}>
            הכוח השקול על כל מטר של תיל {i + 1}: <b class="q">F{SUB[i]}/L = {sci(mag(F))} N/m</b>
            {mag(F) > 0 ? ` (${dirOf(F)})` : ''}
            {s.showParts &&
              w.map((_, j) => {
                if (j === i) return null;
                const f = pairForcePerLength(w, i, j);
                return (
                  <span key={j}>
                    {' '}
                    · מתיל {j + 1}: <span class="q">{sci(mag(f))} N/m</span>
                    {mag(f) > 0 && ` (${dirOf(f)})`}
                  </span>
                );
              })}
          </span>
        );
      })}
    </>
  );

  return (
    <SimShell
      fig={props.id}
      label={`איור חי של ${w.length === 2 ? 'שני' : 'שלושה'} תילים ארוכים ומקבילים, ניצבים לדף. ${describe(s)} גררו תיל כדי להזיז אותו; במקלדת: רווח בוחר תיל, חיצים מזיזים אותו.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(initial(props));
        setLive('האיור אופס.');
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={readout}
      controls={
        <>
          {w.map((wi, i) => (
            <Slider
              key={i}
              label={`הזרם בתיל ${i + 1}`}
              min={-I_MAX}
              max={I_MAX}
              step={1}
              value={wi.I}
              format={iText}
              onChange={(v) => setCurrent(i, v)}
            />
          ))}
          {pair && (
            <Slider
              label="המרחק d בסנטימטרים"
              min={2}
              max={28}
              step={1}
              value={Math.round(dNow * 100)}
              format={(v) => `${v} cm`}
              onChange={setDistance}
            />
          )}
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="השדה במקום כל תיל" on={s.showField} swatch="var(--bfield)" onChange={(v) => setS({ ...s, showField: v })} />
            <Toggle label="קווי שדה" on={s.showLines} swatch="var(--bfield)" onChange={(v) => setS({ ...s, showLines: v })} />
            {w.length > 2 && (
              <Toggle label="הכוח מכל תיל לחוד" on={s.showParts} swatch="var(--force)" onChange={(v) => setS({ ...s, showParts: v })} />
            )}
          </div>
          <div class="group" role="group" aria-label="השדה של תיל אחד בלבד">
            {w.map((_, j) => (
              <Toggle
                key={j}
                label={`רק השדה של תיל ${j + 1}`}
                on={s.source === j}
                onChange={(v) => setS({ ...s, source: v ? j : null })}
              />
            ))}
          </div>
          {props.presets && props.presets.length > 1 && (
            <div class="group" role="group" aria-label="סידור מוכן">
              {props.presets.map((k) => (
                <Toggle
                  key={k}
                  label={PRESET_LABEL[k]}
                  on={s.preset === k}
                  onChange={() => setS({ ...s, preset: k, wires: cloneWires(k), selected: null, source: null })}
                />
              ))}
            </div>
          )}
        </>
      }
    />
  );
}
