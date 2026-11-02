/**
 * Wire field: long straight wires perpendicular to the page, seen end-on (⊙ current out of the page,
 * ⊗ into it), their circling field lines, a ring of compasses, and a probe P that reads the field
 * from src/physics. An optional uniform field stands for the Earth's horizontal field: the page is
 * then a table seen from above, north up. Built for lesson 4.2 (Oersted, B = μ₀I/(2πr), superposition
 * and the null point).
 *
 * Field lines are level curves of the flux function (src/physics/wireflux.ts) at equal spacing, so
 * their density is proportional to |B| exactly. Arrow scales are fixed (not normalised), so doubling
 * a current visibly doubles the arrow at P. Nothing moves by itself: still mode needs no special case.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { MU0 } from '~/physics/constants';
import { EARTH_B_HORIZONTAL, straightWireField, wireFieldAt, type Wire } from '~/physics/magnetism';
import { totalFieldAt, wireFlux } from '~/physics/wireflux';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { contourLines } from './core/contour';
import { arrow, chevron, depthGlyph, paperGrid, polyline, scaleBar, withAlpha } from './core/ink';
import { directionHe, sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 0.36;
const WORLD_H = 0.27;
const WIRE_PX = 11;
const PROBE_PX = 7;
const I_MAX = 20;
/** px per tesla for the arrows at P: 10 μT draws 16 px */
const PX_PER_T = 1.6e6;
const ARROW_CAP = 175;
/** level spacing of the flux function: around a 10 A wire, neighbouring circles differ in radius by 1.4× */
const FLUX_STEP = ((MU0 * 10) / (2 * Math.PI)) * Math.log(1.4);
const RING_R = 0.06;
const RING_N = 12;
const EARTH: Vec2 = [0, EARTH_B_HORIZONTAL];

export type Preset = 'single' | 'oersted' | 'earth' | 'parallel' | 'antiparallel';

interface PresetDef {
  wires: Wire[];
  probe: Vec2;
  earth: boolean;
  showLines: boolean;
  showCompasses: boolean;
  showParts: boolean;
}

const PRESETS: Record<Preset, PresetDef> = {
  // P starts 4 cm from the wire: the field there is 50 μT, and half of it is found at 8 cm
  single: { wires: [{ x: 0, y: 0, I: 10 }], probe: [0.04, 0], earth: false, showLines: true, showCompasses: true, showParts: false },
  // Oersted: compasses round a wire that carries no current yet, in the Earth's field
  oersted: { wires: [{ x: 0, y: 0, I: 0 }], probe: [0.04, 0], earth: true, showLines: false, showCompasses: true, showParts: false },
  // a 10 A wire (⊙) in the Earth's 32 μT: the null point is 6.25 cm west of the wire
  earth: { wires: [{ x: 0.03, y: 0, I: 10 }], probe: [0.08, 0.07], earth: true, showLines: true, showCompasses: false, showParts: true },
  parallel: {
    wires: [
      { x: -0.08, y: 0, I: 10 },
      { x: 0.08, y: 0, I: 10 },
    ],
    probe: [0, 0.07],
    earth: false,
    showLines: true,
    showCompasses: false,
    showParts: true,
  },
  antiparallel: {
    wires: [
      { x: -0.08, y: 0, I: 10 },
      { x: 0.08, y: 0, I: -10 },
    ],
    probe: [0, 0.07],
    earth: false,
    showLines: true,
    showCompasses: false,
    showParts: true,
  },
};

const PRESET_LABEL: Record<Preset, string> = {
  single: 'תיל אחד',
  oersted: 'הניסוי של אורסטד',
  earth: 'תיל ושדה כדור הארץ',
  parallel: 'שני זרמים באותו כיוון',
  antiparallel: 'שני זרמים מנוגדים',
};

const TASK_LABEL: Record<string, string> = {
  'current-on': 'הגדילו את הזרם בתיל מאפס. מה עושים המצפנים?',
  reverse: 'הפכו את כיוון הזרם (מ-⊙ ל-⊗). מה קורה למחטים ולחץ בנקודה P?',
  'halve-field': 'גררו את הנקודה P עד שהשדה בה יהיה חצי מהשדה בנקודת ההתחלה שלה, 4 ס"מ מהתיל. כמה רחוק מהתיל היא עכשיו?',
  'double-current': 'הכפילו את הזרם בתיל (מ-10 ל-20 אמפר). פי כמה גדל השדה בנקודה P?',
  'null-wires': 'כששני הזרמים באותו כיוון: גררו את P לנקודה שבה השדה מתאפס.',
  'flip-one': 'הפכו את הזרם באחד התילים, כך שהזרמים יהיו מנוגדים. מה קרה לשדה באמצע בין התילים?',
  'null-earth': 'עם השדה של כדור הארץ: גררו את P לנקודה שבה השדה השקול מתאפס. באיזה צד של התיל היא?',
};

interface State {
  wires: Wire[];
  probe: Vec2;
  earth: boolean;
  showLines: boolean;
  showCompasses: boolean;
  showParts: boolean;
  selected: number | 'probe' | null;
  preset: Preset;
}

export interface WireFieldProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  preset?: Preset;
  /** preset buttons to show under the figure */
  presets?: Preset[];
  /** show the Earth-field toggle */
  earthControl?: boolean;
  tasks?: string[];
}

function fromPreset(preset: Preset): State {
  const d = PRESETS[preset];
  return {
    wires: d.wires.map((w) => ({ ...w })),
    probe: [...d.probe] as Vec2,
    earth: d.earth,
    showLines: d.showLines,
    showCompasses: d.showCompasses,
    showParts: d.showParts,
    selected: null,
    preset,
  };
}

const B0 = (s: State): Vec2 => (s.earth ? EARTH : [0, 0]);
const fieldOf = (s: State, x: number, y: number) => totalFieldAt(s.wires, x, y, B0(s));
/** μT for readouts; below 0.001 μT the field reads as zero (a null point drawn to the pixel) */
const micro = (B: number) => (B < 1e-9 ? '0 μT' : `${sci(B * 1e6)} μT`);
const currentLabel = (I: number) => (I === 0 ? '0 A' : `${Math.abs(I)} A ${I > 0 ? '⊙' : '⊗'}`);
const currentWords = (I: number) => (I === 0 ? 'בלי זרם' : `${Math.abs(I)} אמפר ${I > 0 ? 'החוצה מהדף' : 'לתוך הדף'}`);

/** Compass name of an angle in the page when the page is a table seen from above, north up. */
function compassHe(rad: number): string {
  const names = ['מזרחה', 'צפון-מזרחה', 'צפונה', 'צפון-מערבה', 'מערבה', 'דרום-מערבה', 'דרומה', 'דרום-מזרחה'];
  const i = Math.round(((rad + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
  return names[i];
}

export default function WireField(props: WireFieldProps) {
  const [s, setS] = useState<State>(() => fromPreset(props.preset ?? 'single'));
  const drag = useRef<{ what: number | 'probe'; dx: number; dy: number } | null>(null);
  /** the sign of each wire's last non-zero current, so a reversal counts even through zero */
  const lastSign = useRef<number[]>(s.wires.map((w) => Math.sign(w.I)));
  const remember = (st: State) => {
    lastSign.current = st.wires.map((w, i) => (w.I !== 0 ? Math.sign(w.I) : (lastSign.current[i] ?? 0)));
  };
  const linesCache = useRef<{ key: string; lines: [number, number][][] }>({ key: '', lines: [] });
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const dirName = (st: State, rad: number) => (st.earth ? compassHe(rad) : directionHe(rad));

  // text steps beside the figure set its state; they never tick a task
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          let next: State = { ...prev };
          if (typeof st.preset === 'string' && st.preset in PRESETS) next = fromPreset(st.preset as Preset);
          const Is = st.I;
          if (Array.isArray(Is)) next.wires = next.wires.map((w, i) => (typeof Is[i] === 'number' ? { ...w, I: Is[i] as number } : w));
          for (const k of ['earth', 'showLines', 'showCompasses', 'showParts'] as const) {
            if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          }
          if (Array.isArray(st.probe) && st.probe.length === 2) next.probe = [Number(st.probe[0]), Number(st.probe[1])];
          lastSign.current = next.wires.map((w) => Math.sign(w.I));
          return next;
        });
      }),
    [props.id],
  );

  /** Task detection, called only from the learner's own actions (drag, keys, sliders, toggles). */
  const check = (prev: State, next: State) => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const base = PRESETS[next.preset];
    const w0 = next.wires[0];
    if (has('current-on') && prev.wires[0]?.I === 0 && w0 && Math.abs(w0.I) >= 5) done('current-on');
    if (has('reverse') && next.wires.some((w, i) => w.I !== 0 && (lastSign.current[i] ?? 0) * w.I < 0)) done('reverse');
    // the preset's current, or 10 A when the preset starts with none (Oersted)
    const refI = Math.abs(base.wires[0]?.I ?? 0) || 10;
    if (has('double-current') && w0 && Math.abs(w0.I) >= 2 * refI) done('double-current');
    const [bx, by] = fieldOf(next, next.probe[0], next.probe[1]);
    const B = Math.hypot(bx, by);
    if (has('halve-field') && next.wires.length === 1 && !next.earth) {
      const [rx, ry] = fieldOf(next, base.probe[0], base.probe[1]);
      const ref = Math.hypot(rx, ry);
      if (ref > 0 && Math.abs(B / ref - 0.5) < 0.04) done('halve-field');
    }
    const strongest = Math.max(0, ...next.wires.map((w) => straightWireField(w.I, 0.05)));
    if (has('null-wires') && !next.earth && next.wires.length === 2 && next.wires[0].I * next.wires[1].I > 0 && B < 0.06 * strongest) {
      done('null-wires');
    }
    if (has('flip-one') && next.wires.length === 2 && next.wires[0].I * next.wires[1].I < 0) done('flip-one');
    if (has('null-earth') && next.earth && next.wires.some((w) => w.I !== 0) && B < 0.08 * EARTH_B_HORIZONTAL) done('null-earth');
  };

  const userSet = (f: (prev: State) => State) => {
    setS((prev) => {
      const next = f(prev);
      check(prev, next);
      remember(next);
      return next;
    });
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p, 0.02);
    const xmin = view.ox - view.w / 2 / view.ppm;
    const xmax = view.ox + view.w / 2 / view.ppm;
    const ymin = view.oy - view.h / 2 / view.ppm;
    const ymax = view.oy + view.h / 2 / view.ppm;
    const b0 = B0(s);
    const active = s.wires.filter((w) => w.I !== 0);

    if (s.showLines && (active.length > 0 || s.earth)) {
      const key = JSON.stringify([active, s.earth, view.w, view.h]);
      if (linesCache.current.key !== key) {
        const cell = 4.5;
        const core = (WIRE_PX + 3) / view.ppm;
        const lines = contourLines((x, y) => wireFlux(active, x, y, b0), { xmin, xmax, ymin, ymax }, {
          nx: Math.ceil(view.w / cell),
          ny: Math.ceil(view.h / cell),
          step: FLUX_STEP,
          mask: (x, y) => active.some((w) => Math.hypot(x - w.x, y - w.y) < core),
        });
        linesCache.current = { key, lines: lines.map((l) => l.points.map(([x, y]) => toScreen(view, x, y))) };
      }
      for (const pts of linesCache.current.lines) {
        polyline(ctx, pts, p.bfield, 1.4, { alpha: 0.75 });
        // chevrons every 110 px of arc length show the direction of B
        let acc = 0;
        let next = 45;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i][0] - pts[i - 1][0];
          const dy = pts[i][1] - pts[i - 1][1];
          const seg = Math.hypot(dx, dy);
          while (seg > 0 && acc + seg >= next) {
            const f = (next - acc) / seg;
            const sx = pts[i - 1][0] + dx * f;
            const sy = pts[i - 1][1] + dy * f;
            const [wx, wy] = toWorld(view, sx, sy);
            const [bx, by] = totalFieldAt(active, wx, wy, b0);
            const m = Math.hypot(bx, by);
            if (m > 0) chevron(ctx, sx, sy, bx / m, -by / m, 5, p.bfield);
            next += 110;
          }
          acc += seg;
        }
      }
    }

    if (s.earth) drawNorth(ctx, view, p);

    if (s.showCompasses && s.wires[0]) {
      const c = s.wires[0];
      for (let k = 0; k < RING_N; k++) {
        const th = (2 * Math.PI * k) / RING_N;
        const x = c.x + RING_R * Math.cos(th);
        const y = c.y + RING_R * Math.sin(th);
        const [bx, by] = fieldOf(s, x, y);
        const [sx, sy] = toScreen(view, x, y);
        drawCompass(ctx, sx, sy, Math.atan2(by, bx), p);
      }
    }

    s.wires.forEach((w, i) => {
      const [x, y] = toScreen(view, w.x, w.y);
      const sel = s.selected === i;
      if (sel) {
        ctx.save();
        ctx.strokeStyle = withAlpha(p.accent, 0.6);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, WIRE_PX + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (w.I === 0) {
        ctx.save();
        ctx.fillStyle = p.paper;
        ctx.strokeStyle = p.current;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, WIRE_PX, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        depthGlyph(ctx, x, y, WIRE_PX, w.I > 0 ? 'out' : 'in', p.current, { fill: p.paper, width: 2.2 });
      }
      ctx.save();
      ctx.font = `600 13px ${p.fontUi}`;
      ctx.fillStyle = p.ink2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const name = s.wires.length > 1 ? `I${i === 0 ? '₁' : '₂'} = ` : 'I = ';
      const text = `${name}${Math.abs(w.I)} A`;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = withAlpha(p.paper, 0.85);
      ctx.fillRect(x - tw / 2 - 3, y + WIRE_PX + 4, tw + 6, 17);
      ctx.fillStyle = p.ink2;
      ctx.fillText(text, x, y + WIRE_PX + 6);
      ctx.restore();
    });

    // probe P: the resultant field (thick), its parts (thin), and r for a lone wire
    const [px, py] = toScreen(view, s.probe[0], s.probe[1]);
    if (s.wires.length === 1 && s.wires[0].I !== 0 && !s.earth) {
      const [wx, wy] = toScreen(view, s.wires[0].x, s.wires[0].y);
      polyline(
        ctx,
        [
          [wx, wy],
          [px, py],
        ],
        p.ink3,
        1.2,
        { dash: [4, 4] },
      );
      label(ctx, 'r', (wx + px) / 2 + 8, (wy + py) / 2 - 8, p.ink2, p.fontUi, 14);
    }
    const parts: { v: Vec2; sub: string }[] = [];
    if (s.showParts) {
      s.wires.forEach((w, i) => {
        if (w.I !== 0) parts.push({ v: wireFieldAt([w], s.probe[0], s.probe[1]), sub: String(i + 1) });
      });
      if (s.earth) parts.push({ v: EARTH, sub: 'E' });
      if (parts.length < 2) parts.length = 0;
    }
    for (const part of parts) {
      const m = Math.hypot(part.v[0], part.v[1]);
      if (m === 0) continue;
      const L = Math.min(ARROW_CAP, m * PX_PER_T);
      const ux = part.v[0] / m;
      const uy = -part.v[1] / m;
      arrow(ctx, px, py, px + ux * L, py + uy * L, { color: p.bfield, width: 1.6, head: 8, alpha: 0.55 });
      labelSub(ctx, 'B', part.sub, px + ux * (L + 12), py + uy * (L + 12), withAlpha(p.bfield, 0.85), p.fontUi, 13);
    }
    const [bx, by] = fieldOf(s, s.probe[0], s.probe[1]);
    const B = Math.hypot(bx, by);
    if (B > 0) {
      const L = Math.min(ARROW_CAP, B * PX_PER_T);
      const ux = bx / B;
      const uy = -by / B;
      arrow(ctx, px, py, px + ux * L, py + uy * L, { color: p.bfield, width: 3, head: 12 });
      if (L > 14) label(ctx, 'B', px + ux * (L + 10) - uy * 10, py + uy * (L + 10) + ux * 10, p.bfield, p.fontUi, 15);
    }
    ctx.save();
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = s.selected === 'probe' ? p.accent : p.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, PROBE_PX, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    label(ctx, 'P', px - 13, py + 14, p.ink, p.fontUi, 14);
    scaleBar(ctx, view, p, 0.05, '5 ס"מ');
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const clampWorld = (x: number, y: number): Vec2 => [
    Math.max(-WORLD_W / 2 + 0.01, Math.min(WORLD_W / 2 - 0.01, x)),
    Math.max(-WORLD_H / 2 + 0.01, Math.min(WORLD_H / 2 - 0.01, y)),
  ];

  const hit = (v: View, sx: number, sy: number): number | 'probe' | null => {
    const [px, py] = toScreen(v, s.probe[0], s.probe[1]);
    if (Math.hypot(sx - px, sy - py) < PROBE_PX + 10) return 'probe';
    for (let i = s.wires.length - 1; i >= 0; i--) {
      const [cx, cy] = toScreen(v, s.wires[i].x, s.wires[i].y);
      if (Math.hypot(sx - cx, sy - cy) < WIRE_PX + 8) return i;
    }
    return null;
  };

  const describe = (st: State) => {
    const [bx, by] = fieldOf(st, st.probe[0], st.probe[1]);
    const B = Math.hypot(bx, by);
    const wires = st.wires.map((w, i) => `תיל ${i + 1}: ${currentWords(w.I)}`).join('; ');
    const at = `הנקודה P ב-(${Math.round(st.probe[0] * 100)}, ${Math.round(st.probe[1] * 100)}) ס"מ`;
    const field = B < 1e-9 ? 'השדה בה כמעט אפס' : `השדה בה ${sci(B * 1e6)} מיקרוטסלה, ${dirName(st, Math.atan2(by, bx))}`;
    return `${wires}. ${st.earth ? 'השדה של כדור הארץ פועל, צפונה (למעלה בדף). ' : ''}${at}, ${field}.`;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (h === null) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const at = h === 'probe' ? s.probe : [s.wires[h].x, s.wires[h].y];
    drag.current = { what: h, dx: at[0] - wx, dy: at[1] - wy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const [x, y] = clampWorld(wx + d.dx, wy + d.dy);
    userSet((prev) =>
      d.what === 'probe' ? { ...prev, probe: [x, y] } : { ...prev, wires: prev.wires.map((w, i) => (i === d.what ? { ...w, x, y } : w)) },
    );
  };

  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const order: (number | 'probe')[] = ['probe', ...s.wires.map((_, i) => i)];
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const i = order.indexOf(s.selected ?? order[order.length - 1]);
      const next = order[(i + 1) % order.length];
      setS((prev) => ({ ...prev, selected: next }));
      setLive(next === 'probe' ? 'נבחרה הנקודה P.' : `נבחר תיל ${next + 1}.`);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? 'probe';
    const step = e.shiftKey ? 0.02 : 0.005;
    userSet((prev) => {
      const next: State =
        sel === 'probe'
          ? { ...prev, selected: sel, probe: clampWorld(prev.probe[0] + d[0] * step, prev.probe[1] + d[1] * step) }
          : {
              ...prev,
              selected: sel,
              wires: prev.wires.map((w, i) => {
                if (i !== sel) return w;
                const [x, y] = clampWorld(w.x + d[0] * step, w.y + d[1] * step);
                return { ...w, x, y };
              }),
            };
      setLive(describe(next));
      return next;
    });
  };

  const reset = () => {
    const st = fromPreset(props.preset ?? 'single');
    lastSign.current = st.wires.map((w) => Math.sign(w.I));
    setS(st);
    setLive('האיור אופס.');
  };

  const [bx, by] = fieldOf(s, s.probe[0], s.probe[1]);
  const B = Math.hypot(bx, by);
  const lone = s.wires.length === 1 ? s.wires[0] : null;
  const r = lone ? Math.hypot(s.probe[0] - lone.x, s.probe[1] - lone.y) : 0;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: תילים ארוכים שניצבים לדף, במבט מהקצה. ${describe(s)} גררו את התילים ואת P בעכבר או במגע; במקלדת: רווח בוחר, חיצים מזיזים.`}
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
        <>
          <span>
            השדה ב-P: <b class="q">B = {micro(B)}</b> {B > 1e-9 && <>({dirName(s, Math.atan2(by, bx))})</>}
          </span>
          {lone && (
            <span>
              מרחק מהתיל: <b class="q">r = {sci(r * 100)} cm</b>
            </span>
          )}
          {lone && lone.I !== 0 && (
            <span>
              השדה של התיל לבדו: <b class="q">μ₀I/(2πr) = {micro(straightWireField(lone.I, r))}</b>
            </span>
          )}
          {s.earth && (
            <span>
              כדור הארץ: <b class="q">B<sub>E</sub> = {micro(EARTH_B_HORIZONTAL)}</b> (צפונה)
            </span>
          )}
        </>
      }
      controls={
        <>
          {s.wires.map((w, i) => (
            <Slider
              key={i}
              label={s.wires.length > 1 ? `הזרם בתיל ${i + 1}` : 'הזרם בתיל'}
              min={-I_MAX}
              max={I_MAX}
              step={1}
              value={w.I}
              format={currentLabel}
              onChange={(v) => {
                userSet((prev) => ({ ...prev, wires: prev.wires.map((x, k) => (k === i ? { ...x, I: v } : x)) }));
                setLive(`הזרם בתיל ${i + 1}: ${currentWords(v)}.`);
              }}
            />
          ))}
          <p class="hint hand">פס הזרם: ימינה ⊙ (החוצה מהדף), שמאלה ⊗ (לתוך הדף).</p>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="קווי שדה" on={s.showLines} swatch="var(--bfield)" onChange={(v) => setS({ ...s, showLines: v })} />
            <Toggle label="מצפנים" on={s.showCompasses} onChange={(v) => setS({ ...s, showCompasses: v })} />
            <Toggle label="השדה של כל מקור ב-P" on={s.showParts} onChange={(v) => setS({ ...s, showParts: v })} />
            {props.earthControl && (
              <Toggle label="השדה של כדור הארץ" on={s.earth} onChange={(v) => userSet((prev) => ({ ...prev, earth: v }))} />
            )}
          </div>
          {props.presets && props.presets.length > 1 && (
            <div class="group" role="group" aria-label="סידור מוכן">
              {props.presets.map((k) => (
                <Toggle
                  key={k}
                  label={PRESET_LABEL[k]}
                  on={s.preset === k}
                  onChange={() => {
                    const st = fromPreset(k);
                    lastSign.current = st.wires.map((w) => Math.sign(w.I));
                    setS(st);
                  }}
                />
              ))}
            </div>
          )}
        </>
      }
    />
  );
}

/** A compass needle: the north half is a filled arrowhead, the south half an open outline, so the two ends differ in shape. */
function drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, p: Palette) {
  const R = 13;
  const L = 11;
  const W = 3.6;
  const ux = Math.cos(ang);
  const uy = -Math.sin(ang);
  const nx = -uy;
  const ny = ux;
  ctx.save();
  ctx.fillStyle = p.paper;
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // north half
  ctx.fillStyle = p.bfield;
  ctx.beginPath();
  ctx.moveTo(x + ux * L, y + uy * L);
  ctx.lineTo(x + nx * W, y + ny * W);
  ctx.lineTo(x - nx * W, y - ny * W);
  ctx.closePath();
  ctx.fill();
  // south half
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x - ux * L, y - uy * L);
  ctx.lineTo(x + nx * W, y + ny * W);
  ctx.lineTo(x - nx * W, y - ny * W);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.arc(x, y, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The north mark of a table seen from above, top left (the tool buttons sit top right): an arrow up, labelled. */
function drawNorth(ctx: CanvasRenderingContext2D, v: View, p: Palette) {
  const x = 26;
  const y0 = 56;
  arrow(ctx, x, y0, x, y0 - 40, { color: p.ink2, width: 1.8, head: 9 });
  ctx.save();
  ctx.font = `600 13px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.direction = 'rtl';
  ctx.fillText('צפון', x, y0 + 4);
  ctx.restore();
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

/** "B" with a small subscript ("B₁", "B_E"), centred on (x, y). */
function labelSub(ctx: CanvasRenderingContext2D, base: string, sub: string, x: number, y: number, color: string, font: string, size = 14) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.font = `italic 700 ${size}px ${font}`;
  const wb = ctx.measureText(base).width;
  ctx.font = `600 ${Math.round(size * 0.7)}px ${font}`;
  const ws = ctx.measureText(sub).width;
  const x0 = x - (wb + ws) / 2;
  ctx.textAlign = 'left';
  ctx.fillText(sub, x0 + wb, y + size * 0.3);
  ctx.font = `italic 700 ${size}px ${font}`;
  ctx.fillText(base, x0, y);
  ctx.restore();
}
