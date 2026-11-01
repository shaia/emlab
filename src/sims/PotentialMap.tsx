/**
 * Potential map: fixed point charges (or a pair of large plates), a probe point P that reads the
 * potential V there and its share from each charge, equipotential lines drawn at equal steps of
 * V, optional field lines, and an optional graph of V along the horizontal line through P.
 * Built for lessons 2.2–2.3.
 *
 * V comes from potentialAt (superposition of kQ/r, zero at infinity) and the lines from
 * marching squares over the same values (contourFromGrid, src/physics/potential.ts), so the
 * lines are the level sets of the numbers in the readout. The plates are ideal: V is linear
 * between them and constant outside.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fieldAt, fieldLines, potentialAt, type PointCharge } from '~/physics/electrostatics';
import { K } from '~/physics/constants';
import { contourFromGrid, fieldFromVoltage, pointPotential, type GridBounds } from '~/physics/potential';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { arrow, chargeDisc, chevron, paperGrid, polyline, withAlpha } from './core/ink';
import { directionHe, sci } from './core/format';
import SimShell, { Toggle, type TaskDef } from './core/SimShell';

const uC = 1e-6;
const WORLD_W = 2;
const MAP_H = 1.15;
const GRAPH_H = 0.6;
const MAP: GridBounds = { xmin: -1, xmax: 1, ymin: -0.575, ymax: 0.575 };
const NX = 140;
const NY = 80;
/** equipotentials every 2·10⁴ V up to 1.2·10⁵ V, both signs (and V = 0 where it exists) */
const V_STEP = 2e4;
const V_LEVELS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((k) => k * V_STEP);
/** plates: + at x = −0.4 held at 400 V, − at x = +0.4 at 0 V */
const PLATE_X = 0.4;
const PLATE_V = 400;
const PLATE_LEVELS = [50, 100, 150, 200, 250, 300, 350];
const GRAPH_V = 1.4e5;
/** P snaps to the midpoint of a pair from this close [m] */
const SNAP = 0.035;

export type MapPreset = 'single' | 'single-neg' | 'like' | 'dipole' | 'unequal' | 'plates';

const PRESETS: Record<Exclude<MapPreset, 'plates'>, PointCharge[]> = {
  single: [{ x: -0.2, y: 0, q: 2 * uC }],
  'single-neg': [{ x: -0.2, y: 0, q: -2 * uC }],
  like: [
    { x: -0.4, y: 0, q: 2 * uC },
    { x: 0.4, y: 0, q: 2 * uC },
  ],
  dipole: [
    { x: -0.4, y: 0, q: 2 * uC },
    { x: 0.4, y: 0, q: -2 * uC },
  ],
  unequal: [
    { x: -0.4, y: 0, q: 4 * uC },
    { x: 0.4, y: 0, q: -2 * uC },
  ],
};

const PRESET_LABEL: Record<MapPreset, string> = {
  single: 'מטען חיובי',
  'single-neg': 'מטען שלילי',
  like: 'שני מטענים זהים',
  dipole: 'דיפול',
  unequal: 'מטענים שונים',
  plates: 'שני לוחות',
};

/** P starts 30 cm from the single charge, on the bisector of a pair, mid-gap between plates */
const PROBE_START: Record<MapPreset, Vec2> = {
  single: [0.1, 0],
  'single-neg': [0.1, 0],
  like: [0, 0.3],
  dipole: [0, 0.3],
  unequal: [0, 0.3],
  plates: [0, 0.2],
};

const TASK_LABEL: Record<string, string> = {
  'read-v': 'גררו את נקודת המדידה P למקומות שונים, וקראו את הפוטנציאל בכל אחד.',
  'half-v': 'במטען החיובי: גררו את P למרחק כפול מהמטען, 60 ס"מ. פי כמה קטן הפוטנציאל? ופי כמה קטן השדה?',
  'neg-v': 'עברו למטען השלילי. מה הסימן של הפוטנציאל בכל מקום סביבו?',
  'sum-like': 'בשני מטענים זהים: גררו את P לאמצע ביניהם. כמה הוא הפוטנציאל שם, וכמה השדה?',
  'follow-line': 'גררו את P לאורך אחד הקווים שווי הפוטנציאל, לפחות 20 ס"מ. מה קורה לקריאה של V?',
  'v-zero': 'בדיפול: מצאו נקודה שבה הפוטנציאל אפס. האם גם השדה שם אפס?',
  'e-zero': 'בשני מטענים זהים: מצאו נקודה שבה השדה אפס. האם גם הפוטנציאל שם אפס?',
  'plates-graph': 'בשני לוחות: גררו את P מהלוח החיובי אל השלילי, ועקבו אחרי הגרף.',
};

export interface PotentialMapProps {
  id: string;
  preset?: MapPreset;
  /** the presets offered as buttons (default: all) */
  presets?: MapPreset[];
  equipotentials?: boolean;
  lines?: boolean;
  /** show E at P in the readout */
  showE?: boolean;
  /** draw V along the line through P under the map */
  graph?: boolean;
  /** show the equipotential and field-line toggles (default true; lesson 2.2 hides them) */
  toggles?: boolean;
  tasks?: string[];
}

interface State {
  preset: MapPreset;
  probe: Vec2;
  equipotentials: boolean;
  lines: boolean;
}

const chargesOf = (preset: MapPreset): PointCharge[] => (preset === 'plates' ? [] : PRESETS[preset]);

/** V and E at a point, for charges or for the plates. */
function sample(preset: MapPreset, x: number, y: number): { V: number; E: Vec2 } {
  if (preset === 'plates') {
    const E = fieldFromVoltage(PLATE_V, 2 * PLATE_X);
    if (x <= -PLATE_X) return { V: PLATE_V, E: [0, 0] };
    if (x >= PLATE_X) return { V: 0, E: [0, 0] };
    return { V: PLATE_V * (PLATE_X - x) / (2 * PLATE_X), E: [E, 0] };
  }
  const cs = PRESETS[preset];
  return { V: potentialAt(cs, x, y), E: fieldAt(cs, x, y) };
}

const vWords = (v: number) => (Math.abs(v) < 0.5 ? 'V = 0' : `V = ${sci(v)} V`);
const eWords = (E: Vec2, unit = 'N/C') => {
  const m = Math.hypot(E[0], E[1]);
  return m < 1 ? 'E = 0' : `E = ${sci(m)} ${unit}, ${directionHe(Math.atan2(E[1], E[0]))}`;
};

/** A reference field and potential to judge "practically zero": those of 2 μC at 30 cm. */
const E_REF = (K * 2 * uC) / 0.09;
const V_REF = pointPotential(2 * uC, 0.3);

export default function PotentialMap(props: PotentialMapProps) {
  const init = (): State => {
    const preset = props.preset ?? 'single';
    return { preset, probe: PROBE_START[preset], equipotentials: props.equipotentials ?? true, lines: props.lines ?? false };
  };
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const dragging = useRef(false);
  // tasks tick only from the learner's own moves, never from a text step
  const userMoved = useRef(false);
  const follow = useRef<{ start: Vec2; V0: number; ok: boolean } | null>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const graph = props.graph ?? false;
  const worldH = graph ? MAP_H + GRAPH_H : MAP_H;
  // the map's centre sits above the canvas centre when the graph takes the bottom strip
  const shift = graph ? -(worldH / 2 - MAP_H / 2) : 0;

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userMoved.current = false;
        follow.current = null;
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.preset === 'string' && st.preset in PRESET_LABEL && st.preset !== prev.preset) {
            next.preset = st.preset as MapPreset;
            next.probe = PROBE_START[next.preset];
          }
          if (typeof st.equipotentials === 'boolean') next.equipotentials = st.equipotentials;
          if (typeof st.lines === 'boolean') next.lines = st.lines;
          if (Array.isArray(st.probe) && st.probe.length === 2) next.probe = [Number(st.probe[0]), Number(st.probe[1])];
          return next;
        });
      }),
    [props.id],
  );

  const charges = chargesOf(s.preset);
  const here = sample(s.preset, s.probe[0], s.probe[1]);
  const Emag = Math.hypot(here.E[0], here.E[1]);

  // equipotential segments and field lines depend only on the preset
  const contours = useMemo(() => {
    if (s.preset === 'plates') return PLATE_LEVELS.map((v) => ({ v, segs: [] as [Vec2, Vec2][] }));
    const cs = PRESETS[s.preset];
    const dx = (MAP.xmax - MAP.xmin) / NX;
    const dy = (MAP.ymax - MAP.ymin) / NY;
    const vals: number[][] = [];
    for (let j = 0; j <= NY; j++) {
      const row: number[] = [];
      for (let i = 0; i <= NX; i++) {
        const x = MAP.xmin + i * dx;
        const y = MAP.ymin + j * dy;
        // inside a small core around a charge the value is skipped: the lines would crowd into a blot
        const near = cs.some((c) => Math.hypot(x - c.x, y - c.y) < 0.045);
        row.push(near ? Number.NaN : potentialAt(cs, x, y));
      }
      vals.push(row);
    }
    const hasZero = cs.some((c) => c.q > 0) && cs.some((c) => c.q < 0);
    return V_LEVELS.filter((v) => v !== 0 || hasZero).map((v) => ({ v, segs: contourFromGrid(vals, MAP, v) }));
  }, [s.preset]);

  const traced = useMemo(
    () =>
      s.preset === 'plates'
        ? []
        : fieldLines(PRESETS[s.preset], { bounds: MAP, coreRadius: 0.04, maxStep: 0.01, chargePerLine: uC / 4 }),
    [s.preset],
  );

  useEffect(() => {
    if (!userMoved.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const start = PROBE_START[s.preset];
    if (has('read-v') && Math.hypot(s.probe[0] - start[0], s.probe[1] - start[1]) > 0.15) done('read-v');
    if (has('half-v') && s.preset === 'single') {
      const r = Math.hypot(s.probe[0] - PRESETS.single[0].x, s.probe[1]);
      if (Math.abs(r - 0.6) < 0.03) done('half-v');
    }
    if (has('neg-v') && s.preset === 'single-neg' && here.V < 0) done('neg-v');
    if (has('sum-like') && s.preset === 'like' && Math.hypot(s.probe[0], s.probe[1]) < 0.04) done('sum-like');
    if (has('v-zero') && s.preset === 'dipole' && Math.abs(here.V) < 0.03 * V_REF && Emag > 0.05 * E_REF) done('v-zero');
    if (has('e-zero') && s.preset === 'like' && Emag < 0.03 * E_REF && Math.abs(here.V) > 0.5 * V_REF) done('e-zero');
    if (has('plates-graph') && s.preset === 'plates' && s.probe[0] > 0.3) done('plates-graph');
    const f = follow.current;
    if (has('follow-line') && f && s.preset !== 'plates') {
      if (Math.abs(here.V - f.V0) > 0.05 * Math.abs(f.V0)) f.ok = false;
      if (f.ok && Math.hypot(s.probe[0] - f.start[0], s.probe[1] - f.start[1]) > 0.2) done('follow-line');
    }
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view: base, palette: p }: FrameInfo) => {
    const view: View = { ...base, oy: shift };
    const S = (x: number, y: number) => toScreen(view, x, y);
    const [mx0, my0] = S(MAP.xmin, MAP.ymax);
    const [mx1, my1] = S(MAP.xmax, MAP.ymin);
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx0, my0, mx1 - mx0, my1 - my0);
    ctx.clip();
    paperGrid(ctx, view, p);

    // field lines (faint), then the equipotentials on top
    if (s.lines) {
      for (const { points: pts, direction: dir } of traced) {
        const scr = pts.map(([x, y]) => S(x, y));
        polyline(ctx, scr, withAlpha(p.efield, 0.5), 1.4);
        const mid = Math.floor(pts.length / 2);
        if (pts.length > 4) {
          const [ax, ay] = scr[mid - 1];
          const [bx, by] = scr[mid + 1];
          const L = Math.hypot(bx - ax, by - ay) || 1;
          // a line traced from a negative charge runs against E: the chevron turns round
          chevron(ctx, scr[mid][0], scr[mid][1], (dir * (bx - ax)) / L, (dir * (by - ay)) / L, 5, withAlpha(p.efield, 0.8));
        }
      }
      if (s.preset === 'plates') {
        for (let y = -0.45; y <= 0.46; y += 0.15) {
          const [x0, sy] = S(-PLATE_X + 0.04, y);
          const [x1] = S(PLATE_X - 0.04, y);
          arrow(ctx, x0, sy, x1, sy, { color: withAlpha(p.efield, 0.5), width: 1.4, head: 7 });
        }
      }
    }
    if (s.equipotentials) {
      ctx.save();
      ctx.strokeStyle = p.equip;
      ctx.lineCap = 'round';
      for (const c of contours) {
        ctx.lineWidth = c.v === 0 ? 2.4 : 1.6;
        ctx.setLineDash(c.v < 0 ? [5, 4] : []);
        ctx.beginPath();
        if (s.preset === 'plates') {
          const x = PLATE_X - (2 * PLATE_X * c.v) / PLATE_V;
          const [sx, sy0] = S(x, MAP.ymax);
          const [, sy1] = S(x, MAP.ymin);
          ctx.moveTo(sx, sy0);
          ctx.lineTo(sx, sy1);
        } else {
          for (const [a, b] of c.segs) {
            const [ax, ay] = S(a[0], a[1]);
            const [bx, by] = S(b[0], b[1]);
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // the sources
    if (s.preset === 'plates') {
      for (const [x, sign] of [
        [-PLATE_X, 1],
        [PLATE_X, -1],
      ] as const) {
        const [sx, sy0] = S(x, 0.44);
        const [, sy1] = S(x, -0.5);
        ctx.fillStyle = withAlpha(sign > 0 ? p.pos : p.neg, 0.4);
        ctx.fillRect(sx - 4, sy0, 8, sy1 - sy0);
        ctx.strokeStyle = sign > 0 ? p.pos : p.neg;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - 4, sy0, 8, sy1 - sy0);
        ctx.fillStyle = p.ink;
        ctx.font = `700 14px ${p.fontUi}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let y = 0.4; y > -0.5; y -= 0.2) {
          const [, gy] = S(x, y);
          ctx.fillText(sign > 0 ? '+' : '−', sx + (sign > 0 ? -14 : 14), gy);
        }
        ctx.font = `600 12px ${p.fontUi}`;
        ctx.fillText(sign > 0 ? `${PLATE_V} V` : '0 V', sx, sy0 - 9);
      }
    } else {
      charges.forEach((c, i) => {
        const [sx, sy] = S(c.x, c.y);
        const v = Math.round((c.q / uC) * 10) / 10;
        // a pair is numbered so the readout's V₁ and V₂ can be matched to the charges
        const name = charges.length > 1 ? `q${i === 0 ? '₁' : '₂'} = ` : '';
        chargeDisc(ctx, sx, sy, 14, c.q, p, { label: `${name}${v > 0 ? '+' : '−'}${Math.abs(v)} μC` });
      });
    }

    // the slice the graph shows: dotted grey, so it cannot be taken for a dashed negative equipotential
    if (graph) {
      const [x0, sy] = S(MAP.xmin, s.probe[1]);
      const [x1] = S(MAP.xmax, s.probe[1]);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.7);
      ctx.setLineDash([1.5, 4]);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, sy);
      ctx.lineTo(x1, sy);
      ctx.stroke();
      ctx.restore();
    }

    // the probe P with its E arrow
    const [px, py] = S(s.probe[0], s.probe[1]);
    if (Emag >= 1) {
      const ref = s.preset === 'plates' ? fieldFromVoltage(PLATE_V, 2 * PLATE_X) : E_REF;
      // from the probe's rim outward, so the probe circle drawn next does not hide it
      const len = Math.min(0.3 * view.ppm, 0.2 * view.ppm * Math.sqrt(Emag / ref));
      const [ux, uy] = [here.E[0] / Emag, -here.E[1] / Emag];
      arrow(ctx, px + ux * 10, py + uy * 10, px + ux * (10 + len), py + uy * (10 + len), { color: p.efield, width: 2.6, head: 9 });
    }
    ctx.strokeStyle = p.ink;
    ctx.fillStyle = p.paper;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // a hollow ring with a dot: a place, not a charge (a "+" inside would read as a positive charge)
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(px, py, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 13px ${p.fontUi}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('P', px + 9, py - 7);
    ctx.restore();

    // the graph of V along the dashed line
    if (graph) {
      const [gx0] = S(-0.95, 0);
      const [gx1] = S(0.95, 0);
      // the gap between the map and the box holds the graph's title
      const top = my1 + 24;
      const bottom = base.h - 22;
      const vmax = s.preset === 'plates' ? 1.1 * PLATE_V : GRAPH_V;
      const vmin = s.preset === 'plates' ? -0.1 * PLATE_V : -GRAPH_V;
      const gy = (v: number) => top + ((vmax - Math.max(vmin, Math.min(vmax, v))) / (vmax - vmin)) * (bottom - top);
      const gx = (x: number) => S(x, 0)[0];
      ctx.save();
      ctx.strokeStyle = p.rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(gx0, top, gx1 - gx0, bottom - top);
      // V = 0 axis and two labelled grid lines
      ctx.strokeStyle = p.ink3;
      ctx.beginPath();
      ctx.moveTo(gx0, gy(0));
      ctx.lineTo(gx1, gy(0));
      ctx.stroke();
      ctx.fillStyle = p.ink2;
      ctx.font = `11px ${p.fontUi}`;
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const marks = s.preset === 'plates' ? [PLATE_V, 0] : [1e5, 0, -1e5];
      for (const m of marks) {
        ctx.strokeStyle = withAlpha(p.rule, 0.8);
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(gx0, gy(m));
        ctx.lineTo(gx1, gy(m));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText(`${sci(m)} V`, gx0 + 4, gy(m) - 7);
      }
      // x ticks every 20 cm, so a slope can be read off in V per metre
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.strokeStyle = p.ink3;
      for (let x = -80; x <= 80; x += 20) {
        const sx = gx(x / 100);
        ctx.beginPath();
        ctx.moveTo(sx, bottom);
        ctx.lineTo(sx, bottom + 4);
        ctx.stroke();
        // 80 is left unlabelled: the axis title sits there
        if (x % 40 === 0 && x < 80) ctx.fillText(`${x}`, sx, bottom + 5);
      }
      ctx.textAlign = 'right';
      ctx.fillText('x (cm)', gx1, bottom + 5);
      // the curve, broken where it leaves the box (at a charge V runs off to ±∞)
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 380; i++) {
        const x = -0.95 + (1.9 * i) / 380;
        const v = sample(s.preset, x, s.probe[1]).V;
        const off = !Number.isFinite(v) || v > vmax || v < vmin;
        const [sx, sy] = [gx(x), gy(v)];
        if (off) {
          if (pen) ctx.lineTo(sx, sy);
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
        pen = true;
      }
      ctx.stroke();
      // P on the curve
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(gx(s.probe[0]), gy(here.V), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `600 12px ${p.fontUi}`;
      ctx.fillStyle = p.ink;
      ctx.fillText('V לאורך הקו המנוקד', gx1 - 4, my1 + 12);
      ctx.restore();
    }
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: worldH, animate: false });
  useEffect(invalidate, [s]);

  const clamp = (pt: Vec2): Vec2 => {
    // near the midpoint of a pair P snaps onto it: a hand never lands exactly where the lesson says E = 0 or V = 0
    if (charges.length === 2 && Math.hypot(pt[0], pt[1]) < SNAP) return [0, 0];
    return [Math.max(-0.95, Math.min(0.95, pt[0])), Math.max(-0.52, Math.min(0.52, pt[1]))];
  };
  const mapView = (): View | null => (viewRef.current ? { ...viewRef.current, oy: shift } : null);
  const onPointerDown = (e: PointerEvent) => {
    const v = mapView();
    if (!v) return;
    const [px, py] = toScreen(v, s.probe[0], s.probe[1]);
    if (Math.hypot(e.offsetX - px, e.offsetY - py) < 26) {
      dragging.current = true;
      follow.current = { start: s.probe, V0: here.V, ok: Math.abs(here.V) > 1 };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = mapView();
    if (!dragging.current || !v) return;
    userMoved.current = true;
    setS((prev) => ({ ...prev, probe: clamp(toWorld(v, e.offsetX, e.offsetY)) }));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(`נקודת המדידה: ${vWords(here.V)}, ${eWords(here.E)}.`);
    dragging.current = false;
    follow.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d: Record<string, Vec2> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const dv = d[e.key];
    if (!dv) return;
    e.preventDefault();
    userMoved.current = true;
    follow.current = null;
    setS((prev) => {
      const probe = clamp([prev.probe[0] + dv[0], prev.probe[1] + dv[1]]);
      const h = sample(prev.preset, probe[0], probe[1]);
      setLive(`נקודת המדידה: ${vWords(h.V)}, ${eWords(h.E)}.`);
      return { ...prev, probe };
    });
  };

  const parts = charges.length > 1 ? charges.map((c) => pointPotential(c.q, Math.hypot(s.probe[0] - c.x, s.probe[1] - c.y))) : [];
  const offered = props.presets ?? (Object.keys(PRESET_LABEL) as MapPreset[]);
  const eUnit = s.preset === 'plates' ? 'V/m' : 'N/C';

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${PRESET_LABEL[s.preset]}. בנקודת המדידה P: ${vWords(here.V)}, ${eWords(here.E, eUnit)}. גררו את P; במקלדת: חיצים.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / worldH}
      live={live}
      tasks={tasks}
      cursor="grab"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onReset={() => {
        userMoved.current = false;
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            הפוטנציאל ב-P: <b class="q">{vWords(here.V)}</b>
          </span>
          {parts.length > 0 && (
            <span>
              מכל מטען:{' '}
              <b class="q">
                {parts.map((v, i) => `V${i === 0 ? '₁' : '₂'} = ${sci(v)} V`).join(' · ')}
              </b>
            </span>
          )}
          {props.showE !== false && (
            <span>
              השדה ב-P: <b class="q">{eWords(here.E, eUnit)}</b>
            </span>
          )}
          {s.preset !== 'plates' && charges.length === 1 && (
            <span>
              המרחק מהמטען: <b class="q">{Math.round(Math.hypot(s.probe[0] - charges[0].x, s.probe[1] - charges[0].y) * 100)} cm</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          {offered.length > 1 && (
            <div class="group" role="group" aria-label="סידור המטענים">
              {offered.map((k) => (
                <button
                  type="button"
                  key={k}
                  class={`toggle ${s.preset === k ? 'on' : ''}`}
                  aria-pressed={s.preset === k}
                  onClick={() => {
                    userMoved.current = true;
                    setS({ ...s, preset: k, probe: PROBE_START[k] });
                  }}
                >
                  {PRESET_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          {props.toggles !== false && (
            <>
              <Toggle label="קווים שווי פוטנציאל" on={s.equipotentials} onChange={(v) => setS({ ...s, equipotentials: v })} />
              <Toggle label="קווי שדה" on={s.lines} onChange={(v) => setS({ ...s, lines: v })} />
            </>
          )}
        </>
      }
    />
  );
}
