/**
 * Biot–Savart builder (lesson 6.11): a wire cut into N pieces, each piece a current element I·dl, and
 * the field each one makes at a probe P, added tip to tail. Two views:
 * - flat ('segment', 'square'): the wire lies in the page and so does P, so every piece's dB points
 *   out of the page or into it (⊙/⊗). The strip under the figure lays those contributions end to end,
 *   with a tick at the closed form, so "the sum of pieces converges to the integral" is visible.
 * - side ('loop', 'solenoid'): a loop (or a stack of loops) stands across the page in an oblique view,
 *   P on its axis. For one loop the 3D dB arrows are chained tip to tail at P: their sideways parts go
 *   round and close up, their parts along the axis add. The strip shows the surviving axial parts.
 *
 * Every number comes from src/physics/biotsavart.ts and magnetism.ts. Nothing moves by itself, so
 * still mode needs no special case.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  circleElementsX,
  dipoleAxisField,
  elementsField,
  loopMoment,
  polylineElementsN,
  polylineFieldExact,
  segmentField,
  stackedLoopsAxisField,
  type Element,
} from '~/physics/biotsavart';
import { MU0 } from '~/physics/constants';
import { finiteSolenoidAxisField, loopAxisField, straightWireField } from '~/physics/magnetism';
import type { Vec3 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, chevron, depthGlyph, paperGrid, polyline, scaleBar, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 0.4;
const WORLD_H = 0.3;
/** the strip under the physics, in CSS px */
const STRIP = 62;
const WIRE_Y = -0.05;
const SQUARE_A = 0.1;
/** side view: rotation about the vertical axis, so a loop across the page shows as an upright ellipse */
const YAW = (32 * Math.PI) / 180;
const COS = Math.cos(YAW);
const SIN = Math.sin(YAW);
/** solenoid: turn spacing and radius; n = 1/SPACING turns per metre */
const SPACING = 0.008;
const SOL_R = 0.025;
const SOL_I = 2;

export type Preset = 'segment' | 'square' | 'loop' | 'solenoid';
type ViewKind = 'flat' | 'side';
const KIND: Record<Preset, ViewKind> = { segment: 'flat', square: 'flat', loop: 'side', solenoid: 'side' };
/** magnification of the physics region: the small square would be a speck on a phone at the segment's scale */
const ZOOM: Record<Preset, number> = { segment: 1, square: 1.4, loop: 1, solenoid: 1 };

interface State {
  preset: Preset;
  I: number;
  /** segment length [m] */
  L: number;
  /** pieces: of the segment, of the square's perimeter, of the loop */
  N: number;
  /** flat views: P in the page [m] */
  probe: [number, number];
  /** loop radius [m] */
  R: number;
  /** side views: P on the axis [m] */
  z: number;
  /** solenoid: number of loops */
  loops: number;
  /** highlighted piece */
  hi: number;
}

const DEFAULTS: Record<Preset, State> = {
  segment: { preset: 'segment', I: 10, L: 0.1, N: 1, probe: [0, -0.01], R: 0.05, z: 0.05, loops: 10, hi: 0 },
  square: { preset: 'square', I: 10, L: 0.1, N: 16, probe: [0, 0], R: 0.05, z: 0.05, loops: 10, hi: 0 },
  loop: { preset: 'loop', I: 10, L: 0.1, N: 8, probe: [0, 0], R: 0.05, z: 0.06, loops: 10, hi: 0 },
  solenoid: { preset: 'solenoid', I: SOL_I, L: 0.1, N: 8, probe: [0, 0], R: SOL_R, z: 0, loops: 8, hi: 0 },
};

const PRESET_LABEL: Record<Preset, string> = {
  segment: 'קטע ישר',
  square: 'כריכה ריבועית',
  loop: 'כריכה עגולה',
  solenoid: 'סליל',
};

const TASK_LABEL: Record<string, string> = {
  converge: 'הגדילו את מספר החתיכות N, עד שסכום החתיכות יהיה במרחק של פחות מאחוז אחד מהערך המדויק של הקטע.',
  lengthen: 'האריכו את התיל (בלי להזיז את P), עד שהשדה ב-P יגיע ל-95% לפחות מהשדה של תיל אינסופי, μ₀I/(2πs).',
  'end-half': 'עם תיל ארוך (25 ס״מ לפחות): גררו את P מול אחד הקצוות של התיל. איזה חלק מהשדה של תיל אינסופי נשאר?',
  dipole: 'התרחקו עם P לאורך הציר (אפשר גם להקטין את הכריכה), עד שהנוסחה של הדיפול תהיה במרחק של פחות מ-10% מהשדה המדויק.',
  'long-solenoid': 'הוסיפו כריכות לסליל, עד שהשדה במרכזו יגיע ל-95% לפחות מ-μ₀nI.',
};

export interface BiotSavartBuilderProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  preset?: Preset;
  /** preset buttons to show under the figure */
  presets?: Preset[];
  tasks?: string[];
}

const fresh = (p: Preset): State => ({ ...DEFAULTS[p], probe: [...DEFAULTS[p].probe] as [number, number] });

/* ------------------------------------------------------------------ geometry and physics of a state */

const segEnds = (s: State): [Vec3, Vec3] => [
  [-s.L / 2, WIRE_Y, 0],
  [s.L / 2, WIRE_Y, 0],
];
const squarePts = (): Vec3[] => {
  const h = SQUARE_A / 2;
  return [
    [-h, -h, 0],
    [h, -h, 0],
    [h, h, 0],
    [-h, h, 0],
  ];
};

function elementsOf(s: State): Element[] {
  if (s.preset === 'segment') return polylineElementsN(segEnds(s), s.N);
  if (s.preset === 'square') return polylineElementsN(squarePts(), s.N, true);
  if (s.preset === 'loop') return circleElementsX(s.R, s.N);
  return [];
}

const probe3 = (s: State): Vec3 => (KIND[s.preset] === 'flat' ? [s.probe[0], s.probe[1], 0] : [s.z, 0, 0]);

/** loop centres of the solenoid, along the axis [m] */
const solenoidCentres = (s: State) => Array.from({ length: s.loops }, (_, k) => (k - (s.loops - 1) / 2) * SPACING);

interface Physics {
  /** the component the strip shows, per piece (z in a flat view, x along the axis in a side view) [T] */
  parts: number[];
  /** the full 3D contributions (side view of one loop) */
  vecs: Vec3[];
  /** sum of the pieces, the component shown [T] */
  sum: number;
  /** the closed form for the same wire [T] */
  exact: number;
  /** a reference the figure compares with: μ₀I/(2πs), μ₀m/(2πz³) or μ₀nI [T] */
  ref: number;
  /** perpendicular distance to the segment's line [m] */
  s: number;
}

function physicsOf(st: State): Physics {
  const p = probe3(st);
  if (st.preset === 'solenoid') {
    const parts = solenoidCentres(st).map((zc) => loopAxisField(st.I, st.R, st.z - zc));
    const L = st.loops * SPACING;
    return {
      parts,
      vecs: [],
      sum: stackedLoopsAxisField(st.loops, L, st.R, st.I, st.z),
      exact: finiteSolenoidAxisField(st.loops, L, st.R, st.I, st.z),
      ref: (MU0 * st.I) / SPACING,
      s: 0,
    };
  }
  const els = elementsOf(st);
  const { parts: vecs } = elementsField(st.I, els, p);
  const comp = KIND[st.preset] === 'flat' ? 2 : 0;
  const parts = vecs.map((v) => v[comp]);
  const sum = parts.reduce((a, b) => a + b, 0);
  if (st.preset === 'segment') {
    const [a, b] = segEnds(st);
    const s = Math.abs(st.probe[1] - WIRE_Y);
    return { parts, vecs, sum, exact: segmentField(st.I, a, b, p)[2], ref: s > 0 ? straightWireField(st.I, s) : Infinity, s };
  }
  if (st.preset === 'square') return { parts, vecs, sum, exact: polylineFieldExact(st.I, squarePts(), p, true)[2], ref: NaN, s: 0 };
  return { parts, vecs, sum, exact: loopAxisField(st.I, st.R, st.z), ref: st.z !== 0 ? dipoleAxisField(loopMoment(st.I, st.R), st.z) : Infinity, s: 0 };
}

/** μT with three figures; zero below a picotesla */
const micro = (B: number) => (Math.abs(B) < 1e-12 ? '0 μT' : `${sci(Math.abs(B) * 1e6)} μT`);
const zdir = (B: number) => (Math.abs(B) < 1e-12 ? '' : B > 0 ? ' ⊙' : ' ⊗');
const cm = (m: number) => `${sci(m * 100)} cm`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/* ------------------------------------------------------------------ component */

export default function BiotSavartBuilder(props: BiotSavartBuilderProps) {
  const start = props.preset ?? 'segment';
  const [s, setS] = useState<State>(() => fresh(start));
  const drag = useRef(false);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  // text steps beside the figure set its state; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          let next: State = { ...prev };
          if (typeof st.preset === 'string' && st.preset in DEFAULTS) next = fresh(st.preset as Preset);
          for (const k of ['I', 'L', 'N', 'R', 'z', 'loops'] as const) if (typeof st[k] === 'number') next[k] = st[k] as number;
          if (Array.isArray(st.probe) && st.probe.length === 2) next.probe = [Number(st.probe[0]), Number(st.probe[1])];
          next.hi = Math.min(next.hi, Math.max(0, next.N - 1));
          return next;
        });
      }),
    [props.id],
  );

  /** Task detection, called only from the learner's own actions. */
  const check = (next: State) => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const ph = physicsOf(next);
    if (next.preset === 'segment') {
      if (has('converge') && next.N >= 2 && Math.abs(ph.sum - ph.exact) < 0.01 * Math.abs(ph.exact)) done('converge');
      if (has('lengthen') && Math.abs(ph.exact) >= 0.95 * ph.ref) done('lengthen');
      const nearEnd = Math.min(Math.abs(next.probe[0] - next.L / 2), Math.abs(next.probe[0] + next.L / 2)) < 0.012;
      if (has('end-half') && next.L >= 0.25 - 1e-9 && nearEnd && Math.abs(Math.abs(ph.exact) / ph.ref - 0.5) < 0.06) done('end-half');
    }
    if (next.preset === 'loop' && has('dipole') && Math.abs(next.z) > next.R && Math.abs(ph.exact / ph.ref) >= 0.9) done('dipole');
    if (next.preset === 'solenoid' && has('long-solenoid') && Math.abs(next.z) < (next.loops * SPACING) / 4 && ph.exact >= 0.95 * ph.ref) {
      done('long-solenoid');
    }
  };

  const userSet = (f: (prev: State) => State) => {
    setS((prev) => {
      const next = f(prev);
      check(next);
      return next;
    });
  };

  /** the physics region's view: the strip takes the bottom of the canvas */
  const phys = (v: View): View => {
    const ppm = v.ppm * ZOOM[s.preset];
    return { ...v, ppm, oy: -(STRIP / 2) / ppm };
  };
  const side = (v: View, X: number, Y: number, Z: number) => toScreen(phys(v), X * COS + Z * SIN, Y);
  const depth = (X: number, Z: number) => -X * SIN + Z * COS;

  const ph = physicsOf(s);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const pv = phys(view);
    paperGrid(ctx, pv, p, 0.02);
    if (KIND[s.preset] === 'flat') drawFlat(ctx, pv, p);
    else drawSide(ctx, view, p);
    scaleBar(ctx, { ...pv, h: view.h - STRIP }, p, 0.05, '5 ס"מ');
    drawStrip(ctx, view, p);
  };

  /* ---------------------------------------------------------- flat view */

  function drawFlat(ctx: CanvasRenderingContext2D, v: View, p: Palette) {
    const els = elementsOf(s);
    const P = toScreen(v, s.probe[0], s.probe[1]);
    const maxPart = Math.max(1e-30, ...ph.parts.map(Math.abs));
    // the wire, and for a segment the dashed continuation of its line and the angles to its ends
    if (s.preset === 'segment') {
      const [a, b] = segEnds(s);
      const A = toScreen(v, a[0], a[1]);
      const B = toScreen(v, b[0], b[1]);
      polyline(ctx, [toScreen(v, -WORLD_W, WIRE_Y), toScreen(v, WORLD_W, WIRE_Y)], p.ink3, 1, { dash: [3, 6], alpha: 0.6 });
      const F = toScreen(v, s.probe[0], WIRE_Y);
      polyline(ctx, [P, F], p.ink2, 1.2, { dash: [4, 4] });
      label(ctx, 's', (P[0] + F[0]) / 2 + 9, (P[1] + F[1]) / 2, p.ink2, p.fontUi, 14);
      polyline(ctx, [P, A], p.ink3, 1, { dash: [2, 4], alpha: 0.8 });
      polyline(ctx, [P, B], p.ink3, 1, { dash: [2, 4], alpha: 0.8 });
      polyline(ctx, [A, B], p.current, 3);
      // F, the foot of the perpendicular, and the angles θ₁, θ₂ from PF to the two ends
      ctx.save();
      ctx.fillStyle = p.ink2;
      ctx.beginPath();
      ctx.arc(F[0], F[1], 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const below = s.probe[1] < WIRE_Y ? -1 : 1;
      label(ctx, 'F', F[0] - 10, F[1] + 14 * below, p.ink2, p.fontUi, 13);
      for (const [E, name] of [
        [A, 'θ₁'],
        [B, 'θ₂'],
      ] as const) {
        const d = Math.hypot(E[0] - P[0], E[1] - P[1]) || 1;
        const u: [number, number] = [(E[0] - P[0]) / d, (E[1] - P[1]) / d];
        // beside the line, on its outer side, so the label never sits on s
        const side = Math.sign(E[0] - P[0]) || 1;
        label(ctx, name, P[0] + u[0] * 70 + side * 4, P[1] + u[1] * 70 - 9, p.ink2, p.fontUi, 12);
      }
    } else {
      const pts = squarePts().map((q) => toScreen(v, q[0], q[1]));
      polyline(ctx, [...pts, pts[0]], p.current, 3);
    }
    // the pieces: a tick at each boundary, a chevron for the current, a dot whose strength is the share
    els.forEach((e, i) => {
      const [mx, my] = toScreen(v, e.at[0], e.at[1]);
      const ux = e.dl[0];
      const uy = -e.dl[1];
      const ul = Math.hypot(ux, uy);
      const tx = ux / ul;
      const ty = uy / ul;
      const half = (Math.hypot(e.dl[0], e.dl[1]) * v.ppm) / 2;
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(mx - tx * half - ty * 6, my - ty * half + tx * 6);
      ctx.lineTo(mx - tx * half + ty * 6, my - ty * half - tx * 6);
      ctx.stroke();
      ctx.restore();
      // the chevron sits between the dot and the next boundary, so the dot never hides it
      if (half > 16) chevron(ctx, mx + tx * half * 0.55, my + ty * half * 0.55, tx, ty, 4.5, p.ink);
      const w = Math.sqrt(Math.abs(ph.parts[i]) / maxPart);
      ctx.save();
      ctx.fillStyle = withAlpha(p.bfield, 0.25 + 0.75 * w);
      ctx.beginPath();
      ctx.arc(mx, my, 2.2 + 2.4 * w, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    // the highlighted piece: I·dl, r to P and the angle φ between them
    const h = els[s.hi];
    if (h) {
      const [mx, my] = toScreen(v, h.at[0], h.at[1]);
      const dx = h.dl[0] * v.ppm;
      const dy = -h.dl[1] * v.ppm;
      const dlen = Math.hypot(dx, dy);
      const k = Math.max(1, 26 / dlen);
      arrow(ctx, mx - (dx * k) / 2, my - (dy * k) / 2, mx + (dx * k) / 2, my + (dy * k) / 2, { color: p.current, width: 3.4, head: 10 });
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      polyline(ctx, [[mx, my], P], p.accent, 1.4, { dash: [5, 4] });
      label(ctx, 'r', P[0] + (mx - P[0]) * 0.68 - 11, P[1] + (my - P[1]) * 0.68, p.accent, p.fontUi, 14);
      // the wedge dθ: the piece seen from P, between the lines to its two boundaries
      const e0 = toScreen(v, h.at[0] - h.dl[0] / 2, h.at[1] - h.dl[1] / 2);
      const e1 = toScreen(v, h.at[0] + h.dl[0] / 2, h.at[1] + h.dl[1] / 2);
      ctx.save();
      ctx.fillStyle = withAlpha(p.accent, 0.12);
      ctx.beginPath();
      ctx.moveTo(P[0], P[1]);
      ctx.lineTo(e0[0], e0[1]);
      ctx.lineTo(e1[0], e1[1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) > 6) {
        const um = Math.hypot(mx - P[0], my - P[1]) || 1;
        label(ctx, 'dθ', P[0] + ((mx - P[0]) / um) * 30 + 12, P[1] + ((my - P[1]) / um) * 30, p.accent, p.fontUi, 12);
      }
      const a0 = Math.atan2(dy, dx);
      const a1 = Math.atan2(P[1] - my, P[0] - mx);
      let da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(mx, my, 20, a0, a0 + da, da < 0);
      ctx.stroke();
      ctx.restore();
      label(ctx, 'φ', mx + 30 * Math.cos(a0 + da / 2), my + 30 * Math.sin(a0 + da / 2), p.accent, p.fontUi, 13);
    }
    drawProbe(ctx, P, p, ph.sum);
  }

  /* ---------------------------------------------------------- side view */

  function drawSide(ctx: CanvasRenderingContext2D, view: View, p: Palette) {
    const P = side(view, s.z, 0, 0);
    // the axis
    polyline(ctx, [side(view, -WORLD_W, 0, 0), side(view, WORLD_W, 0, 0)], p.ink3, 1.2, { dash: [6, 5] });
    if (s.preset === 'solenoid') {
      const cs = solenoidCentres(s);
      for (const zc of cs) ring(ctx, view, p, zc, s.R, 'back');
      for (const zc of cs) ring(ctx, view, p, zc, s.R, 'front');
      // P and B on top of the turns: P usually sits inside the solenoid
      const L = Math.min(150, (ph.sum / ph.ref) * 120);
      if (L > 2) arrow(ctx, P[0], P[1], P[0] + L, P[1], { color: p.bfield, width: 3, head: 11 });
      if (L > 14) label(ctx, 'B', P[0] + L + 10, P[1] - 12, p.bfield, p.fontUi, 15);
      drawProbe(ctx, P, p, 0);
      return;
    }
    const els = elementsOf(s);
    ring(ctx, view, p, 0, s.R, 'back');
    els.forEach((e, i) => {
      if (depth(e.at[0], e.at[2]) < 0) pieceMark(ctx, view, p, e, i);
    });
    // the dB arrows, tip to tail from P: the sideways parts close up, the axial parts add
    const proj = (b: Vec3): [number, number] => [b[0] * COS + b[2] * SIN, -b[1]];
    const chain: [number, number][] = [[0, 0]];
    for (const b of ph.vecs) {
      const [dx, dy] = proj(b);
      const last = chain[chain.length - 1];
      chain.push([last[0] + dx, last[1] + dy]);
    }
    const ext = Math.max(1e-30, ...chain.map(([x, y]) => Math.hypot(x, y)));
    const k = (0.33 * (view.h - STRIP)) / ext;
    chain.forEach((c, i) => {
      if (i === 0) return;
      const a = chain[i - 1];
      const on = i - 1 === s.hi;
      arrow(ctx, P[0] + a[0] * k, P[1] + a[1] * k, P[0] + c[0] * k, P[1] + c[1] * k, {
        color: on ? p.accent : p.bfield,
        width: on ? 2.4 : 1.5,
        head: 7,
        alpha: on ? 1 : 0.75,
      });
    });
    const end = chain[chain.length - 1];
    arrow(ctx, P[0], P[1], P[0] + end[0] * k, P[1] + end[1] * k, { color: p.bfield, width: 3.2, head: 12 });
    if (Math.abs(end[0] * k) > 16) label(ctx, 'B', P[0] + end[0] * k + 12, P[1] - 12, p.bfield, p.fontUi, 15);
    drawProbe(ctx, P, p, 0);
    const h = els[s.hi];
    if (h) {
      const M = side(view, h.at[0], h.at[1], h.at[2]);
      polyline(ctx, [M, P], p.accent, 1.4, { dash: [5, 4] });
      label(ctx, 'r', (M[0] + P[0]) / 2, (M[1] + P[1]) / 2 - 10, p.accent, p.fontUi, 14);
    }
    ring(ctx, view, p, 0, s.R, 'front');
    els.forEach((e, i) => {
      if (depth(e.at[0], e.at[2]) >= 0) pieceMark(ctx, view, p, e, i);
    });
  }

  /** half of a loop across the page at axial position X: the far half dashed and faint */
  function ring(ctx: CanvasRenderingContext2D, view: View, p: Palette, X: number, R: number, half: 'front' | 'back') {
    const pts: [number, number][] = [];
    const runs: [number, number][][] = [];
    for (let k = 0; k <= 96; k++) {
      const phi = (k / 96) * 2 * Math.PI;
      const Z = R * Math.sin(phi);
      const front = depth(X, Z) >= 0;
      if (front === (half === 'front')) pts.push(side(view, X, R * Math.cos(phi), Z));
      else if (pts.length) runs.push(pts.splice(0));
    }
    if (pts.length) runs.push(pts);
    for (const r of runs) polyline(ctx, r, p.current, half === 'front' ? 2.6 : 1.6, half === 'back' ? { dash: [4, 4], alpha: 0.55 } : {});
  }

  /** a loop piece: its boundary tick, its share as a dot, and I·dl when highlighted */
  function pieceMark(ctx: CanvasRenderingContext2D, view: View, p: Palette, e: Element, i: number) {
    const M = side(view, e.at[0], e.at[1], e.at[2]);
    const tip = side(view, e.at[0] + e.dl[0], e.at[1] + e.dl[1], e.at[2] + e.dl[2]);
    const dx = tip[0] - M[0];
    const dy = tip[1] - M[1];
    const dl = Math.hypot(dx, dy) || 1;
    const front = depth(e.at[0], e.at[2]) >= 0;
    if (i === s.hi) {
      const k = Math.max(1, 26 / dl);
      arrow(ctx, M[0] - (dx * k) / 2, M[1] - (dy * k) / 2, M[0] + (dx * k) / 2, M[1] + (dy * k) / 2, { color: p.current, width: 3.4, head: 10 });
      ctx.save();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(M[0], M[1], 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (dl > 14) {
      chevron(ctx, M[0] + (dx / dl) * 4, M[1] + (dy / dl) * 4, dx / dl, dy / dl, 4.5, withAlpha(p.ink, front ? 1 : 0.5));
    }
    ctx.save();
    ctx.fillStyle = withAlpha(p.bfield, front ? 0.9 : 0.45);
    ctx.beginPath();
    ctx.arc(M[0], M[1], 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** P: a ring; in a flat view the total field's ⊙/⊗ sits inside it */
  function drawProbe(ctx: CanvasRenderingContext2D, P: [number, number], p: Palette, Bz: number) {
    ctx.save();
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(P[0], P[1], 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (KIND[s.preset] === 'flat' && Math.abs(Bz) > 1e-12) depthGlyph(ctx, P[0], P[1], 7, Bz > 0 ? 'out' : 'in', p.bfield, { width: 2 });
    label(ctx, 'P', P[0] - 18, P[1] + 16, p.ink, p.fontUi, 14);
  }

  /* ---------------------------------------------------------- the strip: contributions end to end */

  function drawStrip(ctx: CanvasRenderingContext2D, view: View, p: Palette) {
    const top = view.h - STRIP;
    const y = top + 40;
    const x0 = 14;
    const x1 = view.w - 14;
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.fillRect(0, top, view.w, STRIP);
    ctx.strokeStyle = p.rule;
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(view.w, top + 0.5);
    ctx.stroke();
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    // the long title where it fits, a short one on a phone
    const titles =
      KIND[s.preset] === 'flat'
        ? ['התרומות של החתיכות ב-P, אחת אחרי השנייה (ימינה: החוצה מהדף)', 'התרומות ב-P, זו אחרי זו (ימינה: ⊙)']
        : s.preset === 'loop'
          ? ['הרכיבים של התרומות לאורך הציר, אחד אחרי השני', 'הרכיבים לאורך הציר, זה אחרי זה']
          : ['התרומות של הכריכות ב-P, אחת אחרי השנייה', 'התרומות של הכריכות, זו אחרי זו'];
    const title = ctx.measureText(titles[0]).width <= x1 - x0 ? titles[0] : titles[1];
    ctx.fillText(title, x1, top + 5);
    ctx.restore();
    // running sums fix the scale: the chain, the closed form and the reference must all fit
    let run = 0;
    let lo = 0;
    let hi = 0;
    for (const b of ph.parts) {
      run += b;
      lo = Math.min(lo, run);
      hi = Math.max(hi, run);
    }
    const refShown = s.preset === 'segment' || s.preset === 'solenoid' ? ph.ref : NaN;
    for (const v of [ph.exact, refShown]) {
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    const span = Math.max(1e-30, hi - lo);
    const k = (x1 - x0 - 40) / span;
    const X = (b: number) => x0 + 20 + (b - lo) * k;
    polyline(
      ctx,
      [
        [x0, y],
        [x1, y],
      ],
      p.rule,
      1,
    );
    tick(ctx, X(0), y, '0', p.ink3, p, 'below');
    if (Number.isFinite(refShown)) tick(ctx, X(refShown), y, s.preset === 'segment' ? 'μ₀I/2πs' : 'μ₀nI', p.ink2, p, 'below');
    tick(ctx, X(ph.exact), y, 'מדויק', p.accent, p, 'above');
    run = 0;
    ph.parts.forEach((b, i) => {
      const a = X(run);
      run += b;
      const c = X(run);
      const on = i === s.hi && s.preset !== 'solenoid';
      const yy = y - 1 + (i % 2) * 2;
      if (Math.abs(c - a) >= 3) arrow(ctx, a, yy, c, yy, { color: on ? p.accent : p.bfield, width: on ? 4 : 3, head: Math.min(7, Math.abs(c - a) * 0.6), alpha: on ? 1 : i % 2 ? 0.6 : 0.95 });
      else polyline(ctx, [[a, yy], [c + Math.sign(b || 1), yy]], on ? p.accent : p.bfield, on ? 4 : 3);
    });
  }

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  /* ---------------------------------------------------------- interaction */

  /** keep P off the wire: a point closer than 1 cm is pushed out along the perpendicular */
  const clampFlat = (st: State, x: number, y: number): [number, number] => {
    const z = ZOOM[st.preset];
    x = Math.max(-WORLD_W / 2 / z + 0.012, Math.min(WORLD_W / 2 / z - 0.012, x));
    y = Math.max(-0.11 / z, Math.min(0.11 / z, y));
    if (st.preset === 'segment') {
      if (Math.abs(y - WIRE_Y) < 0.01 && Math.abs(x) <= st.L / 2 + 0.01) y = WIRE_Y + (y >= WIRE_Y ? 0.01 : -0.01);
      if (Math.abs(y - WIRE_Y) < 1e-4) y = WIRE_Y + 0.01;
    } else {
      const h = SQUARE_A / 2;
      const inside = Math.abs(x) < h && Math.abs(y) < h;
      const dx = h - Math.abs(x);
      const dy = h - Math.abs(y);
      if (Math.abs(x) <= h + 0.01 && Math.abs(y) <= h + 0.01) {
        if (Math.abs(dx) < 0.01 && Math.abs(dx) <= Math.abs(dy)) x = Math.sign(x || 1) * (inside || dx > 0 ? h - 0.01 : h + 0.01);
        else if (Math.abs(dy) < 0.01) y = Math.sign(y || 1) * (inside || dy > 0 ? h - 0.01 : h + 0.01);
      }
    }
    return [x, y];
  };
  const zMax = 0.2;
  const clampZ = (z: number) => Math.max(-zMax, Math.min(zMax, z));

  const nearestPiece = (v: View, sx: number, sy: number): number | null => {
    const els = elementsOf(s);
    let best: number | null = null;
    let bd = 16;
    els.forEach((e, i) => {
      const [mx, my] = KIND[s.preset] === 'flat' ? toScreen(phys(v), e.at[0], e.at[1]) : side(v, e.at[0], e.at[1], e.at[2]);
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  const probeScreen = (v: View) => (KIND[s.preset] === 'flat' ? toScreen(phys(v), s.probe[0], s.probe[1]) : side(v, s.z, 0, 0));

  const moveProbeTo = (v: View, sx: number, sy: number) => {
    const [wx, wy] = toWorld(phys(v), sx, sy);
    userSet((prev) => (KIND[prev.preset] === 'flat' ? { ...prev, probe: clampFlat(prev, wx, wy) } : { ...prev, z: clampZ(wx / COS) }));
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const [px, py] = probeScreen(v);
    if (Math.hypot(e.offsetX - px, e.offsetY - py) < 22) {
      drag.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    const i = nearestPiece(v, e.offsetX, e.offsetY);
    if (i !== null) setS((prev) => ({ ...prev, hi: i }));
  };

  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    if (drag.current) {
      moveProbeTo(v, e.offsetX, e.offsetY);
      return;
    }
    if (e.pointerType === 'mouse') {
      const i = nearestPiece(v, e.offsetX, e.offsetY);
      if (i !== null && i !== s.hi) setS((prev) => ({ ...prev, hi: i }));
    }
  };

  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = false;
  };

  const describe = (st: State) => {
    const q = physicsOf(st);
    const where =
      KIND[st.preset] === 'flat'
        ? st.preset === 'segment'
          ? `תיל ישר באורך ${Math.round(st.L * 100)} ס"מ, ${st.N} חתיכות; P במרחק ${sci(q.s * 100)} ס"מ מהקו של התיל`
          : `כריכה ריבועית בצלע ${Math.round(SQUARE_A * 100)} ס"מ, ${st.N} חתיכות; P ב-(${Math.round(st.probe[0] * 100)}, ${Math.round(st.probe[1] * 100)}) ס"מ ממרכזה`
        : st.preset === 'loop'
          ? `כריכה ברדיוס ${Math.round(st.R * 100)} ס"מ, ${st.N} חתיכות; P על הציר, ${sci(st.z * 100)} ס"מ מהמרכז`
          : `סליל של ${st.loops} כריכות; P על הציר, ${sci(st.z * 100)} ס"מ מהמרכז`;
    return `${where}. סכום החתיכות ${sci(Math.abs(q.sum) * 1e6)} מיקרוטסלה, והערך המדויק ${sci(Math.abs(q.exact) * 1e6)} מיקרוטסלה.`;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const count = s.preset === 'solenoid' ? 0 : elementsOf(s).length;
    if ((e.key === ' ' || e.key === 'Enter') && count > 0) {
      e.preventDefault();
      setS((prev) => ({ ...prev, hi: (prev.hi + 1) % count }));
      setLive(`חתיכה ${((s.hi + 1) % count) + 1} מתוך ${count} מודגשת.`);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.02 : 0.005;
    userSet((prev) => {
      const next: State =
        KIND[prev.preset] === 'flat'
          ? { ...prev, probe: clampFlat(prev, prev.probe[0] + d[0] * step, prev.probe[1] + d[1] * step) }
          : { ...prev, z: clampZ(prev.z + (d[0] || d[1]) * step) };
      setLive(describe(next));
      return next;
    });
  };

  const reset = () => {
    setS(fresh(start));
    setLive('האיור אופס.');
  };

  const setNum = (k: 'I' | 'L' | 'N' | 'R' | 'loops', v: number) =>
    userSet((prev) => {
      const next = { ...prev, [k]: v };
      if (k === 'N') next.hi = Math.min(prev.hi, v - 1);
      if (k === 'L' && prev.preset === 'segment') next.probe = clampFlat(next, prev.probe[0], prev.probe[1]);
      if (k === 'loops') next.z = clampZ(prev.z);
      return next;
    });

  const piecesLabel = s.preset === 'loop' ? 'מספר החתיכות בכריכה' : s.preset === 'square' ? 'מספר החתיכות בריבוע' : 'מספר החתיכות';

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: חוק ביו-סבר, תיל שמחולק לחתיכות. ${describe(s)} גררו את P בעכבר או במגע, ורחפו מעל חתיכה כדי להדגיש אותה; במקלדת: חיצים מזיזים את P, רווח מדגיש את החתיכה הבאה.`}
      canvasRef={canvasRef}
      aspect={4 / 3}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={
        <>
          <span>
            {s.preset === 'solenoid' ? 'סכום הכריכות' : `סכום ${s.N} החתיכות`}: <b class="q">B = {micro(ph.sum)}{KIND[s.preset] === 'flat' ? zdir(ph.sum) : ''}</b>
          </span>
          {s.preset === 'segment' && (
            <>
              <span>
                קטע ישר, מדויק: <b class="q">μ₀I/(4πs)·(sinθ₂ − sinθ₁) = {micro(ph.exact)}</b>
              </span>
              <span>
                תיל אינסופי באותו מרחק: <b class="q">μ₀I/(2πs) = {micro(ph.ref)}</b>
              </span>
              <span>
                <b class="q">s = {cm(ph.s)}</b> · ביחס לתיל אינסופי: <b class="q">{pct(Math.abs(ph.exact) / ph.ref)}</b>
              </span>
            </>
          )}
          {s.preset === 'square' && (
            <span>
              ארבעה קטעים, מדויק: <b class="q">{micro(ph.exact)}{zdir(ph.exact)}</b>
            </span>
          )}
          {s.preset === 'loop' && (
            <>
              <span>
                על הציר, מדויק: <b class="q">μ₀IR²/(2(R²+z²)³ᐟ²) = {micro(ph.exact)}</b>
              </span>
              <span>
                דיפול: <b class="q">μ₀m/(2πz³) = {Number.isFinite(ph.ref) ? micro(ph.ref) : '∞'}</b>
              </span>
              <span>
                <b class="q">z/R = {sci(Math.abs(s.z) / s.R)}</b> · המדויק ביחס לדיפול: <b class="q">{Number.isFinite(ph.ref) ? pct(ph.exact / ph.ref) : '0%'}</b>
              </span>
            </>
          )}
          {s.preset === 'solenoid' && (
            <>
              <span>
                סליל רציף, מדויק: <b class="q">{micro(ph.exact)}</b>
              </span>
              <span>
                סליל ארוך: <b class="q">μ₀nI = {micro(ph.ref)}</b> · אורך <b class="q">{cm(s.loops * SPACING)}</b> · ביחס: <b class="q">{pct(ph.exact / ph.ref)}</b>
              </span>
            </>
          )}
        </>
      }
      controls={
        <>
          {s.preset !== 'solenoid' && (
            <Slider label={piecesLabel} min={s.preset === 'loop' ? 3 : s.preset === 'square' ? 4 : 1} max={s.preset === 'square' ? 64 : 40} step={s.preset === 'square' ? 4 : 1} value={s.N} format={(v) => `N = ${v}`} onChange={(v) => setNum('N', v)} />
          )}
          {s.preset === 'segment' && (
            <Slider label="אורך התיל" min={0.02} max={0.38} step={0.01} value={s.L} format={(v) => `L = ${Math.round(v * 100)} cm`} onChange={(v) => setNum('L', v)} />
          )}
          {s.preset === 'loop' && (
            <Slider label="רדיוס הכריכה" min={0.02} max={0.06} step={0.005} value={s.R} format={(v) => `R = ${sci(v * 100)} cm`} onChange={(v) => setNum('R', v)} />
          )}
          {s.preset === 'solenoid' && (
            <Slider label="מספר הכריכות" min={1} max={40} step={1} value={s.loops} format={(v) => `${v}`} onChange={(v) => setNum('loops', v)} />
          )}
          <Slider label="הזרם" min={1} max={20} step={1} value={s.I} format={(v) => `I = ${v} A`} onChange={(v) => setNum('I', v)} />
          {props.presets && props.presets.length > 1 && (
            <div class="group" role="group" aria-label="צורת התיל">
              {props.presets.map((k) => (
                <Toggle key={k} label={PRESET_LABEL[k]} on={s.preset === k} onChange={() => setS(fresh(k))} />
              ))}
            </div>
          )}
        </>
      }
    />
  );
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, font: string, size = 15) {
  ctx.save();
  ctx.font = `italic 700 ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** a tick on the strip's line with a short label above or below it */
function tick(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, p: Palette, where: 'above' | 'below') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x, y + 9);
  ctx.stroke();
  ctx.font = `600 11px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.direction = /[א-ת]/.test(text) ? 'rtl' : 'ltr';
  ctx.textBaseline = where === 'above' ? 'bottom' : 'top';
  ctx.fillText(text, x, where === 'above' ? y - 10 : y + 10);
  ctx.restore();
}
