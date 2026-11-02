/**
 * Magnet field: one or two bar magnets on a table, draggable compasses that line up with the local
 * field, the field lines (closed, through the magnets), a lattice of small compasses that shows the
 * field between the lines, and optionally the Earth's horizontal field. Built for lesson 4.1.
 *
 * Physics from src/physics/magnets.ts: each magnet is a short, wide solenoid (solenoidFieldAt), so
 * its lines run from N to S outside and back from S to N inside. Nothing here pushes on currents or
 * moving charges: that comes in lesson 4.4.
 *
 * North is "solid": the north half of a magnet and of a needle is filled, the south half hollow,
 * and each pole carries its letter, so a pole is never told by colour alone.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { EARTH_B_HORIZONTAL, traceLine } from '~/physics/magnetism';
import {
  breakMagnet,
  insideMagnet,
  magnetsFieldAt,
  needleAngle,
  poles,
  type BarMagnet,
} from '~/physics/magnets';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, chevron, paperGrid, polyline, scaleBar, withAlpha } from './core/ink';
import { directionHe, sci } from './core/format';
import SimShell, { Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 0.72;
const WORLD_H = 0.54;
const COMPASS_PX = 17;
/** a bar magnet: 12 cm long, 5 cm wide; NI sets about 15 mT inside and 3·10⁻⁵ T some 25 cm away */
const BAR = { L: 0.12, R: 0.025, NI: 1500 };
/** the pole pieces of the gap preset: wide, so the field between them is nearly uniform */
const SLAB = { L: 0.1, R: 0.13, NI: 1500 };

export type Preset = 'bar' | 'like' | 'unlike' | 'gap' | 'earth' | 'earth-only';

const PRESETS: Record<Preset, { magnets: BarMagnet[]; compasses: Vec2[]; earth: boolean }> = {
  bar: { magnets: [{ x: 0, y: 0, angle: 0, ...BAR }], compasses: [[0.17, 0.11]], earth: false },
  // N facing N across a 20 cm gap: the null point sits midway
  like: {
    magnets: [
      { x: -0.16, y: 0, angle: 0, ...BAR },
      { x: 0.16, y: 0, angle: Math.PI, ...BAR },
    ],
    compasses: [[0, 0.1]],
    earth: false,
  },
  unlike: {
    magnets: [
      { x: -0.16, y: 0, angle: 0, ...BAR },
      { x: 0.16, y: 0, angle: 0, ...BAR },
    ],
    compasses: [[0, 0.1]],
    earth: false,
  },
  // N face of the lower slab looks up at the S face of the upper one across an 8 cm gap
  gap: {
    magnets: [
      { x: 0, y: -0.09, angle: Math.PI / 2, ...SLAB },
      { x: 0, y: 0.09, angle: Math.PI / 2, ...SLAB },
    ],
    compasses: [[0.06, 0]],
    earth: false,
  },
  // a magnet pointing east, a compass on its axis: the two fields are perpendicular there
  earth: { magnets: [{ x: -0.18, y: 0, angle: 0, ...BAR }], compasses: [[0.1, 0]], earth: true },
  // no magnet at all: every compass points north
  'earth-only': { magnets: [], compasses: [[0, 0]], earth: true },
};

const PRESET_LABEL: Record<Preset, string> = {
  bar: 'מגנט אחד',
  like: 'קטבים שווים',
  unlike: 'קטבים שונים',
  gap: 'קטבים מול קטבים',
  earth: 'מגנט ושדה כדור הארץ',
  'earth-only': 'רק כדור הארץ',
};

const TASK_LABEL: Record<string, string> = {
  'compass-poles': 'גררו את המצפן אל ליד הקוטב הצפוני של המגנט, ואחר כך אל ליד הקוטב הדרומי. לאן מצביע הקוטב הצפוני של המחט בכל פעם?',
  'between-lines': 'הדליקו את קווי השדה, וגררו את המצפן למקום שאין בו קו מצויר. האם המחט עדיין פונה לכיוון מסוים?',
  break: 'שברו את המגנט לשניים. כמה קטבים יש עכשיו, ואיפה?',
  flip: 'הפכו את אחד המגנטים, כך ש"קטבים שווים" יהפכו ל"קטבים שונים". מה קרה לקווים שבין המגנטים?',
  'find-null': 'מצאו נקודה שבה השדה של המגנט מבטל את השדה של כדור הארץ, וגררו אליה את המצפן.',
  'deflect-45': 'גררו את המצפן לאורך הציר של המגנט, עד שהמחט סוטה מהצפון ב-45°. מה היחס בין שני השדות שם?',
};

interface State {
  preset: Preset;
  magnets: BarMagnet[];
  compasses: Vec2[];
  earth: boolean;
  showLines: boolean;
  showGrid: boolean;
  broken: boolean;
  selected: { kind: 'magnet' | 'compass'; i: number } | null;
}

export interface MagnetFieldProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  preset?: Preset;
  /** preset chips under the figure */
  presets?: Preset[];
  showLines?: boolean;
  showGrid?: boolean;
  /** offer the "break the magnet" button (one-magnet presets) */
  breakable?: boolean;
  /** offer a toggle for the Earth's field */
  earthToggle?: boolean;
  tasks?: string[];
}

const cloneMagnets = (ms: BarMagnet[]) => ms.map((m) => ({ ...m }));

function fromPreset(preset: Preset, p: MagnetFieldProps, keep?: Pick<State, 'showLines' | 'showGrid'>): State {
  const d = PRESETS[preset];
  return {
    preset,
    magnets: cloneMagnets(d.magnets),
    compasses: d.compasses.map((c) => [c[0], c[1]] as Vec2),
    earth: d.earth,
    showLines: keep?.showLines ?? p.showLines ?? true,
    showGrid: keep?.showGrid ?? p.showGrid ?? false,
    broken: false,
    selected: null,
  };
}

const earthVec = (on: boolean): Vec2 => (on ? [0, EARTH_B_HORIZONTAL] : [0, 0]);
const fieldOf = (s: Pick<State, 'magnets' | 'earth'>, x: number, y: number) => magnetsFieldAt(s.magnets, x, y, earthVec(s.earth));
const insideAny = (ms: BarMagnet[], x: number, y: number, pad = 0) => ms.some((m) => insideMagnet(m, x, y, pad));
const deg = (rad: number) => Math.round((rad * 180) / Math.PI);

/** Deflection of the needle from north (+y), signed: + toward east (right), − toward west. */
const fromNorth = (B: Vec2) => Math.atan2(B[0], B[1]);

export default function MagnetField(props: MagnetFieldProps) {
  const [s, setS] = useState<State>(() => fromPreset(props.preset ?? 'bar', props));
  const drag = useRef<{ kind: 'magnet' | 'compass'; i: number; dx: number; dy: number } | null>(null);
  const linesCache = useRef<{ key: string; lines: [number, number][][] }>({ key: '', lines: [] });
  const visited = useRef({ N: false, S: false });
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const done = (t: string) => {
    if (has(t)) markTask(`${props.id}:${t}`);
  };

  // text steps beside the figure set its state
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          let next = { ...prev };
          if (typeof st.preset === 'string' && st.preset in PRESETS && (st.preset !== prev.preset || prev.broken)) {
            next = fromPreset(st.preset as Preset, props, prev);
          }
          for (const k of ['showLines', 'showGrid', 'earth'] as const) {
            if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          }
          if (st.broken === true && !next.broken && next.magnets.length === 1) {
            next.magnets = breakMagnet(next.magnets[0], 0.04);
            next.broken = true;
          }
          if (Array.isArray(st.compass) && st.compass.length === 2) next.compasses = [[Number(st.compass[0]), Number(st.compass[1])]];
          return next;
        });
      }),
    [props.id],
  );

  /* ---------------------------------------------------------------- drawing */

  const traceAll = (view: View): [number, number][][] => {
    const xmin = view.ox - view.w / 2 / view.ppm;
    const xmax = view.ox + view.w / 2 / view.ppm;
    const ymin = view.oy - view.h / 2 / view.ppm;
    const ymax = view.oy + view.h / 2 / view.ppm;
    const bounds = { xmin, xmax, ymin, ymax };
    const f = (x: number, y: number) => fieldOf(s, x, y);
    const traced: Vec2[][] = [];
    const near = (x: number, y: number, r: number) => traced.some((l) => l.some((p) => Math.hypot(p[0] - x, p[1] - y) < r));
    const run = (seed: Vec2, both: boolean) => {
      const fwd = traceLine(f, seed, { bounds, step: 0.004, maxSteps: 1500, direction: 1 });
      if (fwd.end === 'closed' || !both) {
        traced.push(fwd.points);
        return;
      }
      const back = traceLine(f, seed, { bounds, step: 0.004, maxSteps: 1500, direction: -1 });
      traced.push([...back.points.slice(1).reverse(), ...fwd.points]);
    };
    // seeds across each magnet's middle, inside the bar: every line of a magnet passes through it
    const SEEDS = 7;
    for (const m of s.magnets) {
      const c = Math.cos(m.angle);
      const sn = Math.sin(m.angle);
      const gap = (1.4 * m.R) / (SEEDS - 1);
      for (let k = 0; k < SEEDS; k++) {
        const v = -0.7 * m.R + k * gap;
        const seed: Vec2 = [m.x - sn * v, m.y + c * v];
        if (near(seed[0], seed[1], 0.45 * gap)) continue;
        run(seed, true);
      }
    }
    // the Earth's field also fills the space far from the magnets: seed along the southern edge.
    // Such a line stops where it crowds an earlier line (near a null point many lines squeeze
    // together along the same path) or reaches a magnet's side, so the drawing keeps an even density.
    if (s.earth) {
      const CELL = 0.012;
      const grid = new Set<string>();
      const cell = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
      const mark = (pts: Vec2[]) => pts.forEach((q) => grid.add(cell(q[0], q[1])));
      const crowded = (x: number, y: number) => {
        const i = Math.floor(x / CELL);
        const j = Math.floor(y / CELL);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (grid.has(`${i + a},${j + b}`)) return true;
        return false;
      };
      traced.forEach(mark);
      for (let x = xmin + 0.03; x < xmax; x += 0.06) {
        const seed: Vec2 = [x, ymin + 0.002];
        if (insideAny(s.magnets, seed[0], seed[1], 0.01) || crowded(seed[0], seed[1])) continue;
        const fwd = traceLine(f, seed, { bounds, step: 0.004, maxSteps: 1500, direction: 1 });
        const kept: Vec2[] = [];
        for (const q of fwd.points) {
          if (kept.length > 2 && (crowded(q[0], q[1]) || insideAny(s.magnets, q[0], q[1], 0.004))) break;
          kept.push(q);
        }
        if (kept.length > 3) {
          traced.push(kept);
          mark(kept);
        }
      }
    }
    return traced.map((l) => l.map(([x, y]) => toScreen(view, x, y)));
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p);
    const draggingMagnet = drag.current?.kind === 'magnet';

    for (const m of s.magnets) magnetBody(ctx, view, m, p);

    if (s.showLines) {
      const key = JSON.stringify([s.magnets, s.earth, view.w, view.h]);
      if (linesCache.current.key !== key && !draggingMagnet) {
        linesCache.current = { key, lines: traceAll(view) };
      }
      const stale = linesCache.current.key !== key;
      for (const pts of linesCache.current.lines) {
        polyline(ctx, pts, p.bfield, 1.6, { alpha: stale ? 0.25 : 0.85 });
        if (stale) continue;
        // still chevrons every 80 px show the direction of B; nothing flows along a field line
        let acc = 0;
        let next = 40;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i][0] - pts[i - 1][0];
          const dy = pts[i][1] - pts[i - 1][1];
          const seg = Math.hypot(dx, dy);
          while (seg > 0 && acc + seg >= next) {
            const t = (next - acc) / seg;
            chevron(ctx, pts[i - 1][0] + dx * t, pts[i - 1][1] + dy * t, dx / seg, dy / seg, 5, p.bfield);
            next += 80;
          }
          acc += seg;
        }
      }
    }

    if (s.showGrid) drawCompassGrid(ctx, view, s, p);
    for (const m of s.magnets) magnetLetters(ctx, view, m, p);
    if (s.earth) earthMark(ctx, view, p);

    s.compasses.forEach((c, i) => {
      const [x, y] = toScreen(view, c[0], c[1]);
      const B = fieldOf(s, c[0], c[1]);
      const sel = s.selected?.kind === 'compass' && s.selected.i === i;
      compass(ctx, x, y, COMPASS_PX, needleAngle(B), p, sel);
    });
    scaleBar(ctx, view, p, 0.1, '10 ס"מ');
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  /* ---------------------------------------------------------------- interaction */

  const clampWorld = (x: number, y: number): Vec2 => [
    Math.max(-WORLD_W / 2 + 0.02, Math.min(WORLD_W / 2 - 0.02, x)),
    Math.max(-WORLD_H / 2 + 0.02, Math.min(WORLD_H / 2 - 0.02, y)),
  ];

  const hit = (v: View, sx: number, sy: number): State['selected'] => {
    for (let i = s.compasses.length - 1; i >= 0; i--) {
      const [cx, cy] = toScreen(v, s.compasses[i][0], s.compasses[i][1]);
      if (Math.hypot(sx - cx, sy - cy) < COMPASS_PX + 8) return { kind: 'compass', i };
    }
    const [wx, wy] = toWorld(v, sx, sy);
    for (let i = s.magnets.length - 1; i >= 0; i--) if (insideMagnet(s.magnets[i], wx, wy, 6 / v.ppm)) return { kind: 'magnet', i };
    return null;
  };

  /** Record a learner's compass move: pole visits and the null point. Steps never call this. */
  const compassMoved = (st: State, c: Vec2, settled: boolean) => {
    for (const m of st.magnets) {
      const pl = poles(m);
      if (Math.hypot(c[0] - pl.N[0], c[1] - pl.N[1]) < 0.06) visited.current.N = true;
      if (Math.hypot(c[0] - pl.S[0], c[1] - pl.S[1]) < 0.06) visited.current.S = true;
    }
    if (visited.current.N && visited.current.S) done('compass-poles');
    const B = fieldOf(st, c[0], c[1]);
    if (st.earth && Math.hypot(B[0], B[1]) < 0.15 * EARTH_B_HORIZONTAL && !insideAny(st.magnets, c[0], c[1], 0.01)) done('find-null');
    if (st.earth && Math.abs(Math.abs(deg(fromNorth(B))) - 45) <= 3 && B[1] > 0) done('deflect-45');
    if (settled && st.showLines && !insideAny(st.magnets, c[0], c[1], 0.015)) {
      const v = viewRef.current;
      if (!v) return;
      const [sx, sy] = toScreen(v, c[0], c[1]);
      const far = linesCache.current.lines.every((l) => l.every((q) => Math.hypot(q[0] - sx, q[1] - sy) > 14));
      if (far && linesCache.current.lines.length > 0) done('between-lines');
    }
  };

  const describe = (st: State) => {
    const c = st.compasses[0];
    if (!c) return `${st.magnets.length} מגנטים באיור.`;
    const B = fieldOf(st, c[0], c[1]);
    const mag = Math.hypot(B[0], B[1]);
    let t = `המצפן ב-(${Math.round(c[0] * 100)}, ${Math.round(c[1] * 100)}) סנטימטרים. השדה שם ${sci(mag)} טסלה, והקוטב הצפוני של המחט פונה ${directionHe(needleAngle(B))}.`;
    if (st.earth) {
      const a = deg(fromNorth(B));
      t += ` המחט סוטה ${Math.abs(a)} מעלות מהצפון${a > 0 ? ' מזרחה' : a < 0 ? ' מערבה' : ''}.`;
    }
    return t;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (!h) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const at = h.kind === 'compass' ? s.compasses[h.i] : [s.magnets[h.i].x, s.magnets[h.i].y];
    drag.current = { ...h, dx: at[0] - wx, dy: at[1] - wy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const [x, y] = clampWorld(wx + d.dx, wy + d.dy);
    setS((prev) => {
      if (d.kind === 'compass') {
        const next = { ...prev, compasses: prev.compasses.map((c, i) => (i === d.i ? ([x, y] as Vec2) : c)) };
        compassMoved(next, [x, y], false);
        return next;
      }
      return { ...prev, magnets: prev.magnets.map((m, i) => (i === d.i ? { ...m, x, y } : m)) };
    });
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'compass') compassMoved(s, s.compasses[d.i], true);
    setLive(describe(s));
    invalidate();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const order: NonNullable<State['selected']>[] = [
      ...s.compasses.map((_, i) => ({ kind: 'compass' as const, i })),
      ...s.magnets.map((_, i) => ({ kind: 'magnet' as const, i })),
    ];
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const cur = order.findIndex((o) => o.kind === s.selected?.kind && o.i === s.selected?.i);
      const next = order[(cur + 1) % order.length];
      setS((prev) => ({ ...prev, selected: next }));
      setLive(next.kind === 'compass' ? `נבחר מצפן ${next.i + 1}.` : `נבחר מגנט ${next.i + 1}.`);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? order[0];
    if (!sel) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    setS((prev) => {
      let next: State;
      if (sel.kind === 'compass') {
        const c = clampWorld(prev.compasses[sel.i][0] + d[0] * step, prev.compasses[sel.i][1] + d[1] * step);
        next = { ...prev, selected: sel, compasses: prev.compasses.map((q, i) => (i === sel.i ? c : q)) };
        compassMoved(next, c, true);
      } else {
        next = {
          ...prev,
          selected: sel,
          magnets: prev.magnets.map((m, i) => {
            if (i !== sel.i) return m;
            const [x, y] = clampWorld(m.x + d[0] * step, m.y + d[1] * step);
            return { ...m, x, y };
          }),
        };
      }
      setLive(describe(next));
      return next;
    });
  };

  const flip = () => {
    const i = s.selected?.kind === 'magnet' ? s.selected.i : s.magnets.length - 1;
    const next = { ...s, magnets: s.magnets.map((m, k) => (k === i ? { ...m, angle: m.angle + Math.PI } : m)) };
    setS(next);
    if (s.magnets.length >= 2 && !s.broken) done('flip');
    setLive(`המגנט ${i + 1} התהפך. ${describe(next)}`);
  };

  const doBreak = () => {
    if (s.broken || s.magnets.length !== 1) return;
    const next = { ...s, magnets: breakMagnet(s.magnets[0], 0.04), broken: true, selected: null };
    setS(next);
    done('break');
    setLive('המגנט נשבר לשני חצאים. לכל חצי יש קוטב צפוני וקוטב דרומי משלו.');
  };

  const reset = () => {
    visited.current = { N: false, S: false };
    setS(fromPreset(props.preset ?? 'bar', props));
    setLive('האיור אופס.');
  };

  const c0 = s.compasses[0];
  const B0 = c0 ? fieldOf(s, c0[0], c0[1]) : ([0, 0] as Vec2);
  const Bm0 = c0 ? magnetsFieldAt(s.magnets, c0[0], c0[1]) : ([0, 0] as Vec2);
  const mag0 = Math.hypot(B0[0], B0[1]);
  const onMagnet = c0 ? insideAny(s.magnets, c0[0], c0[1], 0.005) : false;
  const a0 = deg(fromNorth(B0));

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${s.magnets.length === 1 ? 'מגנט מוט' : `${s.magnets.length} מגנטים`}${s.earth ? ' בשדה של כדור הארץ' : ''}. ${describe(s)} גררו מגנטים ומצפנים בעכבר או במגע; במקלדת: רווח בוחר, חיצים מזיזים.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={
        c0 ? (
          onMagnet ? (
            <span>המצפן מונח על המגנט. גררו אותו החוצה.</span>
          ) : (
            <>
              <span>
                השדה במצפן: <b class="q">B = {sci(mag0)} T</b> ({directionHe(needleAngle(B0))})
              </span>
              {s.earth && s.magnets.length > 0 && (
                <span>
                  שדה המגנט שם: <b class="q">{sci(Math.hypot(Bm0[0], Bm0[1]))} T</b> · שדה כדור הארץ: <b class="q">{sci(EARTH_B_HORIZONTAL)} T</b> (צפונה)
                </span>
              )}
              {s.earth && (
                <span>
                  המחט סוטה מהצפון: <b class="q">{Math.abs(a0)}°</b>
                  {a0 > 0 ? ' מזרחה' : a0 < 0 ? ' מערבה' : ''}
                </span>
              )}
            </>
          )
        ) : undefined
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="קווי שדה" on={s.showLines} swatch="var(--bfield)" onChange={(v) => setS({ ...s, showLines: v })} />
            <Toggle label="מצפנים בכל מקום" on={s.showGrid} onChange={(v) => setS({ ...s, showGrid: v })} />
            {props.earthToggle && <Toggle label="השדה של כדור הארץ" on={s.earth} onChange={(v) => setS({ ...s, earth: v })} />}
          </div>
          {props.presets && props.presets.length > 1 && (
            <div class="group" role="group" aria-label="סידור מוכן">
              {props.presets.map((k) => (
                <Toggle key={k} label={PRESET_LABEL[k]} on={s.preset === k && !s.broken} onChange={() => setS(fromPreset(k, props, s))} />
              ))}
            </div>
          )}
          {s.magnets.length > 0 && (
          <div class="group" role="group" aria-label="פעולות">
            <button type="button" class="toggle" onClick={flip}>
              {s.selected?.kind === 'magnet' || s.magnets.length === 1 ? 'הפכו את המגנט' : 'הפכו את המגנט הימני'}
            </button>
            {props.breakable && s.magnets.length === 1 && !s.broken && (
              <button type="button" class="toggle" onClick={doBreak}>
                שברו את המגנט
              </button>
            )}
          </div>
          )}
        </>
      }
    />
  );
}

/* ---------------------------------------------------------------- ink */

/** Corners of a magnet's half (north or south) in screen space. */
function halfRect(v: View, m: BarMagnet, north: boolean): [number, number][] {
  const c = Math.cos(m.angle);
  const sn = Math.sin(m.angle);
  const u0 = north ? 0 : -m.L / 2;
  const u1 = north ? m.L / 2 : 0;
  const corners: [number, number][] = [
    [u0, -m.R],
    [u1, -m.R],
    [u1, m.R],
    [u0, m.R],
  ];
  return corners.map(([u, w]) => toScreen(v, m.x + c * u - sn * w, m.y + sn * u + c * w));
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string, stroke: string) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** The bar: north half filled (translucent, so the field lines inside it stay visible), south half hollow. */
function magnetBody(ctx: CanvasRenderingContext2D, v: View, m: BarMagnet, p: Palette) {
  ctx.save();
  fillPoly(ctx, halfRect(v, m, false), withAlpha(p.paper2, 0.9), p.bfield);
  fillPoly(ctx, halfRect(v, m, true), withAlpha(p.bfield, 0.3), p.bfield);
  ctx.restore();
}

function magnetLetters(ctx: CanvasRenderingContext2D, v: View, m: BarMagnet, p: Palette) {
  const pl = poles(m);
  const inset = Math.min(m.L / 4, 0.025);
  const c = Math.cos(m.angle);
  const sn = Math.sin(m.angle);
  const at = (q: Vec2, sign: number) => toScreen(v, q[0] - sign * c * inset, q[1] - sign * sn * inset);
  const size = Math.max(12, Math.min(18, m.R * v.ppm * 0.9));
  ctx.save();
  ctx.font = `700 ${size}px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = p.paper;
  for (const [txt, q, sign] of [
    ['N', pl.N, 1],
    ['S', pl.S, -1],
  ] as const) {
    const [x, y] = at(q, sign);
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = txt === 'N' ? p.ink : p.ink2;
    ctx.fillText(txt, x, y);
  }
  ctx.restore();
}

/** A compass: a round housing and a needle along B, north half solid with an N, south half hollow. */
function compass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, p: Palette, selected: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(p.paper, 0.92);
  ctx.fill();
  ctx.lineWidth = selected ? 2.6 : 1.6;
  ctx.strokeStyle = selected ? p.accent : p.ink2;
  ctx.stroke();
  needle(ctx, x, y, r * 0.82, angle, p, 1);
  ctx.restore();
}

/** Needle pointing along `angle` (world radians, y up): solid north half, hollow south half. */
function needle(ctx: CanvasRenderingContext2D, x: number, y: number, half: number, angle: number, p: Palette, alpha: number) {
  const ux = Math.cos(angle);
  const uy = -Math.sin(angle); // screen y grows downward
  const w = half * 0.26;
  const nx = -uy * w;
  const ny = ux * w;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.3;
  // north half: solid
  ctx.beginPath();
  ctx.moveTo(x + ux * half, y + uy * half);
  ctx.lineTo(x + nx, y + ny);
  ctx.lineTo(x - nx, y - ny);
  ctx.closePath();
  ctx.fillStyle = p.bfield;
  ctx.fill();
  ctx.strokeStyle = p.bfield;
  ctx.stroke();
  // south half: hollow
  ctx.beginPath();
  ctx.moveTo(x - ux * half, y - uy * half);
  ctx.lineTo(x + nx, y + ny);
  ctx.lineTo(x - nx, y - ny);
  ctx.closePath();
  ctx.fillStyle = p.paper;
  ctx.fill();
  ctx.strokeStyle = p.ink2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.5, half * 0.1), 0, Math.PI * 2);
  ctx.fillStyle = p.ink;
  ctx.fill();
  ctx.restore();
}

/** Small needles on a lattice: the field exists everywhere, not only on the drawn lines. */
function drawCompassGrid(ctx: CanvasRenderingContext2D, v: View, s: State, p: Palette) {
  const spacing = 40;
  const nx = Math.floor(v.w / spacing);
  const ny = Math.floor(v.h / spacing);
  const offX = (v.w - (nx - 1) * spacing) / 2;
  const offY = (v.h - (ny - 1) * spacing) / 2;
  const lo = Math.log10(EARTH_B_HORIZONTAL / 10);
  const hi = Math.log10(EARTH_B_HORIZONTAL * 100);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const sx = offX + i * spacing;
      const sy = offY + j * spacing;
      const [x, y] = toWorld(v, sx, sy);
      if (insideAny(s.magnets, x, y, 10 / v.ppm)) continue;
      if (s.compasses.some((c) => Math.hypot(c[0] - x, c[1] - y) * v.ppm < COMPASS_PX + 10)) continue;
      const B = fieldOf(s, x, y);
      const m = Math.hypot(B[0], B[1]);
      if (m === 0) continue;
      const f = Math.max(0, Math.min(1, (Math.log10(m) - lo) / (hi - lo)));
      needle(ctx, sx, sy, spacing * 0.32, needleAngle(B), p, 0.35 + 0.6 * f);
    }
  }
}

/** The Earth preset's north mark, top-left: an arrow up, "north", and the field's own arrow. */
function earthMark(ctx: CanvasRenderingContext2D, v: View, p: Palette) {
  const x = 26;
  const y0 = 70;
  const y1 = 22;
  arrow(ctx, x, y0, x, y1, { color: p.bfield, width: 2.4, head: 10 });
  ctx.save();
  ctx.font = `600 13px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillText('צפון', x + 40, y1);
  ctx.font = `italic 600 13px ${p.fontUi}`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillText('B', x + 8, (y0 + y1) / 2 + 4);
  ctx.font = `500 11px ${p.fontUi}`;
  ctx.fillText('E', x + 17, (y0 + y1) / 2 + 8);
  ctx.restore();
  void v;
}
