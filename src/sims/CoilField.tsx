/**
 * Coil field: the plane through the axis of a circular turn, of a few turns, or of a solenoid, with
 * the page cutting every turn twice (⊙ on top, ⊗ below for a positive current); also one or two
 * straight wires seen end-on. Field lines, a probe that reads |B| and its direction, the poles of
 * the coil, and an Ampère mode: a closed path (rectangle or circle) the learner drags, with the sum
 * Σ B∥·Δℓ around it, edge by edge, beside μ₀ times the current it encloses. Built for lesson 4.3.
 *
 * Model (src/physics/coils.ts): every turn is an exact circular loop (`loopField`); a solenoid is 32
 * equal turns sharing N·I, and exactly those 32 turns are drawn and counted, so the enclosed current
 * the path reports and the field it sums come from the same currents. The sum is the midpoint rule
 * on 1 mm pieces; a path closer than 8 mm to a wire is refused (it would run through the wire).
 * Field lines are traced for a unit positive current, so they depend only on the geometry; the
 * current's size scales B, and its sign reverses the arrows.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MU0 } from '~/physics/constants';
import {
  circlePath,
  coaxialTurns,
  combinedFieldAt,
  discFractionInside,
  distanceToPath,
  edgeSums,
  enclosedCurrent,
  flatCoil,
  rectPath,
  solenoidTurns,
  thickWireField,
  thickWireFieldAt,
  turnCuts,
  type ThickWire,
  type Turn,
} from '~/physics/coils';
import { loopCenterField, solenoidField, straightWireField, traceLine, type Wire } from '~/physics/magnetism';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { arrow, chevron, depthGlyph, paperGrid, polyline, scaleBar, withAlpha } from './core/ink';
import { directionHe, sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const WORLD_W = 1.1;
const WORLD_H = 0.74;
/** turns of the solenoid that are modelled, drawn and counted */
const LOOPS = 32;
/** turns in the "a few turns" scene */
const FEW = 5;
/** a path closer than this to a wire runs through it [m] */
const CORE = 0.008;
/** piece length for the Ampère sums [m] */
const PIECE = 0.001;
/** the second wire of the two-wire scene carries 2 A against the first */
const WIRE2_I = 2;
const WIRE_X = 0.2;

export type Scene = 'loop' | 'loops' | 'solenoid' | 'wire' | 'wires' | 'thick';
export type PathShape = 'rect' | 'circle';
type Sel = 'probe' | 'path' | 'c0' | 'c1' | 'c2' | 'c3' | 'rim';

const SCENE_LABEL: Record<Scene, string> = {
  loop: 'כריכה',
  loops: 'כמה כריכות',
  solenoid: 'סליל',
  wire: 'תיל',
  wires: 'שני תילים',
  thick: 'תיל עבה',
};

const TASK_LABEL: Record<string, string> = {
  reverse: 'הפכו את כיוון הזרם. איזה קצה הוא עכשיו הקוטב הצפוני?',
  'close-loops': 'ב"כמה כריכות", קרבו את הכריכות זו לזו עד הסוף. מה קרה לקווים שבתוך הכריכות?',
  'near-winding': 'בסליל, גררו את הגשש מהציר אל קרוב לכריכות, בתוך הסליל. האם השדה משתנה?',
  'half-length': 'בסליל, קצרו את L לחצי בלי לשנות את N. פי כמה גדל השדה בפנים?',
  'ampere-circle': 'הגדילו או הקטינו את המעגל סביב התיל. מה קורה לסכום?',
  'ampere-zero': 'הזיזו את המסלול כך שלא יקיף אף זרם. כמה הסכום? האם השדה על המסלול אפס?',
  'thick-inside': 'בתיל העבה, הקטינו את המעגל עד שיהיה כולו בתוך התיל. איזה חלק מהזרם הוא מקיף, ומה הסכום?',
  'ampere-solenoid': 'בסליל, הציבו מלבן שצלע אחת שלו בתוך הסליל והצלע שמולה מחוצה לו. מאיזו צלע בא רוב הסכום?',
};

interface State {
  scene: Scene;
  /** current magnitude [A] and its sense: +1 makes B point right inside a coil, and a wire ⊙ */
  I: number;
  dir: 1 | -1;
  /** turns: of the flat coil, or of the solenoid */
  N: number;
  R: number;
  L: number;
  spacing: number;
  probe: Vec2;
  ampere: boolean;
  shape: PathShape;
  /** left, bottom, right, top [m] */
  rect: [number, number, number, number];
  /** centre and radius [m] */
  circle: [number, number, number];
  lines: boolean;
  selected: Sel | null;
}

type SceneValues = Pick<State, 'I' | 'N' | 'R' | 'L' | 'spacing' | 'probe' | 'rect' | 'circle' | 'shape'>;

const SCENE_DEFAULTS: Record<Scene, SceneValues> = {
  loop: { I: 5, N: 1, R: 0.15, L: 0.8, spacing: 0.15, probe: [0, 0], rect: [-0.12, 0.05, 0.12, 0.27], circle: [0, 0.15, 0.06], shape: 'rect' },
  loops: { I: 5, N: 1, R: 0.12, L: 0.8, spacing: 0.15, probe: [0, 0], rect: [-0.12, 0.05, 0.12, 0.25], circle: [0, 0.12, 0.06], shape: 'rect' },
  solenoid: { I: 2, N: 400, R: 0.07, L: 0.8, spacing: 0.15, probe: [0, 0], rect: [-0.2, -0.03, 0.2, 0.2], circle: [0, 0.07, 0.05], shape: 'rect' },
  wire: { I: 5, N: 1, R: 0.15, L: 0.8, spacing: 0.15, probe: [0.12, 0], rect: [-0.16, -0.12, 0.16, 0.12], circle: [0, 0, 0.12], shape: 'circle' },
  thick: { I: 10, N: 1, R: 0.12, L: 0.8, spacing: 0.15, probe: [0.06, 0], rect: [-0.06, -0.06, 0.06, 0.06], circle: [0, 0, 0.06], shape: 'circle' },
  wires: { I: 6, N: 1, R: 0.15, L: 0.8, spacing: 0.15, probe: [0, 0.12], rect: [-0.36, -0.16, -0.06, 0.16], circle: [-WIRE_X, 0, 0.12], shape: 'circle' },
};

export interface CoilFieldProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  scene?: Scene;
  /** the scene buttons to offer; one scene (or none) hides the buttons */
  scenes?: Scene[];
  /** show the Ampère path at the start */
  ampere?: boolean;
  /** offer the Ampère controls (path toggle and shape) */
  ampereControls?: boolean;
  shape?: PathShape;
  tasks?: string[];
}

function sceneState(scene: Scene, keep: Partial<State> = {}): State {
  const d = SCENE_DEFAULTS[scene];
  return {
    scene,
    dir: 1,
    ampere: false,
    lines: true,
    selected: null,
    ...d,
    probe: [...d.probe] as Vec2,
    rect: [...d.rect] as State['rect'],
    circle: [...d.circle] as State['circle'],
    ...keep,
  };
}

function initial(p: CoilFieldProps): State {
  const s = sceneState(p.scene ?? 'loop', { ampere: p.ampere ?? false });
  if (p.shape) s.shape = p.shape;
  return s;
}

function turnsOf(s: Pick<State, 'scene' | 'I' | 'dir' | 'N' | 'R' | 'L' | 'spacing'>): Turn[] {
  const I = s.I * s.dir;
  if (s.scene === 'loop') return flatCoil(0, 0, s.R, s.N, I);
  if (s.scene === 'loops') return coaxialTurns(0, 0, s.R, I, FEW, s.spacing);
  if (s.scene === 'solenoid') return solenoidTurns({ x0: 0, y0: 0, L: s.L, R: s.R, N: s.N, I }, LOOPS);
  return [];
}

function wiresOf(s: Pick<State, 'scene' | 'I' | 'dir'>): Wire[] {
  if (s.scene === 'wire') return [{ x: 0, y: 0, I: s.I * s.dir }];
  if (s.scene === 'wires')
    return [
      { x: -WIRE_X, y: 0, I: s.I * s.dir },
      { x: WIRE_X, y: 0, I: -WIRE2_I * s.dir },
    ];
  return [];
}

/** the thick wire of the "thick" scene: radius R, its current spread evenly over the cross-section */
function thickOf(s: Pick<State, 'scene' | 'I' | 'dir' | 'R'>): ThickWire | null {
  return s.scene === 'thick' ? { x: 0, y: 0, R: s.R, I: s.I * s.dir } : null;
}

function fieldFn(turns: Turn[], wires: Wire[], thick: ThickWire | null) {
  return (x: number, y: number): Vec2 => {
    const a = combinedFieldAt(turns, wires, x, y);
    if (!thick) return a;
    const b = thickWireFieldAt(thick, x, y);
    return [a[0] + b[0], a[1] + b[1]];
  };
}

const pathOf = (s: Pick<State, 'shape' | 'rect' | 'circle'>): Vec2[] =>
  s.shape === 'rect' ? rectPath(...s.rect) : circlePath(s.circle[0], s.circle[1], s.circle[2]);

/** seeds for the field lines of each scene (unit current) */
function seedsOf(s: State, turns: Turn[]): Vec2[] {
  if (s.scene === 'loop') return [-1.35, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.35].map((k) => [0, k * s.R] as Vec2);
  if (s.scene === 'loops') {
    const mid = [-0.7, -0.47, -0.23, 0, 0.23, 0.47, 0.7].map((k) => [0, k * s.R] as Vec2);
    const own = turns.filter((t) => t.x !== 0).flatMap((t) => [[t.x, 0.8 * s.R] as Vec2, [t.x, -0.8 * s.R] as Vec2]);
    return [...mid, ...own];
  }
  if (s.scene === 'solenoid') return [-0.7, -0.47, -0.23, 0, 0.23, 0.47, 0.7].map((k) => [0, k * s.R] as Vec2);
  if (s.scene === 'wire' || s.scene === 'thick') return [0.03, 0.06, 0.1, 0.15, 0.22, 0.31].map((r) => [r, 0] as Vec2);
  return [
    ...[0.03, 0.07, 0.13, 0.22, 0.32].map((r) => [-WIRE_X - r, 0] as Vec2),
    ...[0.03, 0.07, 0.12].map((r) => [WIRE_X + r, 0] as Vec2),
  ];
}

interface Line {
  points: Vec2[];
}

const fmtCm = (m: number) => `${Math.round(m * 100)} cm`;
const fmtA = (v: number) => `${Math.round(v * 10) / 10} A`;
const nearlyInt = (x: number) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)).replace('-', '−') : signed(x));
/** sci() with a true minus sign */
const signed = (x: number) => sci(x).replace('-', '−');

export default function CoilField(props: CoilFieldProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const fromStep = useRef(false);
  const userMoved = useRef<{ probe: boolean; path: boolean }>({ probe: false, path: false });
  /** the N and L the "half the length" task compares against; reset by steps and scene changes */
  const base = useRef({ N: s.N, L: s.L, r: s.circle[2] });
  const drag = useRef<{ what: Sel; dx: number; dy: number; last: Vec2 } | null>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const scenes = props.scenes ?? [];

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        fromStep.current = true;
        userMoved.current = { probe: false, path: false };
        setS((prev) => {
          const sc = typeof st.scene === 'string' && st.scene in SCENE_DEFAULTS ? (st.scene as Scene) : prev.scene;
          let next: State = sc !== prev.scene ? sceneState(sc, { ampere: prev.ampere, lines: prev.lines }) : { ...prev };
          const num = (k: keyof State) => (typeof st[k] === 'number' ? (st[k] as number) : undefined);
          for (const k of ['I', 'N', 'R', 'L', 'spacing'] as const) {
            const v = num(k);
            if (v !== undefined) next = { ...next, [k]: v };
          }
          if (st.dir === 1 || st.dir === -1) next.dir = st.dir;
          if (typeof st.ampere === 'boolean') next.ampere = st.ampere;
          if (typeof st.lines === 'boolean') next.lines = st.lines;
          if (st.shape === 'rect' || st.shape === 'circle') next.shape = st.shape;
          if (Array.isArray(st.probe) && st.probe.length === 2) next.probe = [Number(st.probe[0]), Number(st.probe[1])];
          if (Array.isArray(st.rect) && st.rect.length === 4) next.rect = st.rect.map(Number) as State['rect'];
          if (Array.isArray(st.circle) && st.circle.length === 3) next.circle = st.circle.map(Number) as State['circle'];
          next.selected = null;
          base.current = { N: next.N, L: next.L, r: next.circle[2] };
          return next;
        });
      }),
    [props.id],
  );

  const turns = useMemo(() => turnsOf(s), [s.scene, s.I, s.dir, s.N, s.R, s.L, s.spacing]);
  const wires = useMemo(() => wiresOf(s), [s.scene, s.I, s.dir]);
  const cuts = useMemo(() => [...turnCuts(turns), ...wires], [turns, wires]);
  const thick = useMemo(() => thickOf(s), [s.scene, s.I, s.dir, s.R]);
  const field = fieldFn(turns, wires, thick);

  // field lines depend on the geometry only: trace them for a unit positive current
  const geomKey = `${s.scene}|${s.R}|${s.L}|${s.spacing}|${s.scene === 'wires' ? s.I : 0}`;
  const lines = useMemo<Line[]>(() => {
    const unit = { ...s, dir: 1 as const, I: s.scene === 'wires' ? s.I : 1, N: s.scene === 'solenoid' ? LOOPS : 1 };
    const t = turnsOf(unit);
    const w = wiresOf(unit);
    const f = fieldFn(t, w, thickOf(unit));
    const avoid = [...turnCuts(t), ...w].map((c) => ({ x: c.x, y: c.y, r: 0.006 }));
    const bounds = { xmin: -WORLD_W / 2 - 0.02, xmax: WORLD_W / 2 + 0.02, ymin: -WORLD_H / 2 - 0.02, ymax: WORLD_H / 2 + 0.02 };
    const step = s.scene === 'solenoid' ? 0.005 : 0.004;
    return seedsOf(s, t).map((seed) => {
      const fwd = traceLine(f, seed, { bounds, step, maxSteps: 2500, avoid });
      if (fwd.end === 'closed') return { points: fwd.points };
      const back = traceLine(f, seed, { bounds, step, maxSteps: 2500, avoid, direction: -1 });
      return { points: [...back.points.slice(1).reverse(), ...fwd.points] };
    });
  }, [geomKey]);

  // Ampère's law
  const path = useMemo(() => pathOf(s), [s.shape, s.rect, s.circle]);
  const blocked = s.ampere && cuts.some((c) => distanceToPath(path, c.x, c.y) < CORE);
  const amp = useMemo(() => {
    if (!s.ampere || blocked) return null;
    const edges = edgeSums(field, path, PIECE);
    const total = edges.reduce((a, b) => a + b, 0);
    // a thick wire counts with the part of its cross-section inside the path (paths run counterclockwise)
    const Ienc = enclosedCurrent(cuts, path) + (thick ? thick.I * discFractionInside(path, thick.x, thick.y, thick.R) : 0);
    let maxB = 0;
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i];
      const [bx, by] = field(x, y);
      maxB = Math.max(maxB, Math.hypot(bx, by));
    }
    // a sum that cancels to rounding noise is shown as zero
    const scale = edges.reduce((a, b) => a + Math.abs(b), 0);
    return { edges, total: Ienc === 0 && Math.abs(total) < 1e-3 * scale ? 0 : total, Ienc, maxB };
  }, [s.ampere, blocked, path, turns, wires, thick]);

  const Bp = field(s.probe[0], s.probe[1]);
  const Bmag = Math.hypot(Bp[0], Bp[1]);
  const coil = s.scene === 'loop' || s.scene === 'loops' || s.scene === 'solenoid';
  const northRight = s.dir > 0;
  const inSolenoid = (x: number, y: number) => s.scene === 'solenoid' && Math.abs(x) < s.L / 2 && Math.abs(y) < s.R;

  // task detection: only the learner's own actions tick a task, never a text step
  useEffect(() => {
    if (fromStep.current) {
      fromStep.current = false;
      return;
    }
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (has('near-winding') && userMoved.current.probe && inSolenoid(...s.probe) && Math.abs(s.probe[1]) >= 0.6 * s.R && Math.abs(s.probe[0]) < s.L / 2 - 2 * s.R)
      done('near-winding');
    if (amp && userMoved.current.path) {
      if (has('ampere-circle') && (s.scene === 'wire' || s.scene === 'wires') && s.shape === 'circle' && amp.Ienc !== 0 && Math.abs(s.circle[2] / base.current.r - 1) > 0.3)
        done('ampere-circle');
      if (has('ampere-zero') && amp.Ienc === 0 && amp.maxB > 1e-6) done('ampere-zero');
      if (has('thick-inside') && s.scene === 'thick' && s.shape === 'circle' && Math.hypot(s.circle[0], s.circle[1]) + s.circle[2] < s.R && amp.Ienc !== 0)
        done('thick-inside');
      if (has('ampere-solenoid') && s.scene === 'solenoid' && s.shape === 'rect') {
        const [l, b, r, t] = s.rect;
        const crossesTop = b < s.R && t > s.R;
        const crossesBottom = b < -s.R && t > -s.R;
        if (amp.Ienc !== 0 && crossesTop !== crossesBottom && l > -s.L / 2 && r < s.L / 2) done('ampere-solenoid');
      }
    }
  }, [s, amp]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p);
    const sgn = s.dir;

    // the turns seen from the side: thin rings, far half dashed (decoration; the physics is in the cuts)
    if (coil) {
      for (const t of turns) {
        const [cx, cy] = toScreen(view, t.x, t.y0);
        const ry = t.R * view.ppm;
        const rx = Math.min(0.2 * ry, s.scene === 'solenoid' ? (s.L / LOOPS) * view.ppm * 0.9 : 0.2 * ry);
        ctx.save();
        ctx.strokeStyle = withAlpha(p.current, 0.45);
        ctx.lineWidth = s.scene === 'loop' ? 1 + Math.min(3, Math.log2(s.N + 1)) : 1.2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = withAlpha(p.current, 0.3);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, Math.PI / 2, (3 * Math.PI) / 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // field lines, arrows every ~70 px in the direction of B
    if (s.lines) {
      for (const l of lines) {
        const pts = l.points.map(([x, y]) => toScreen(view, x, y));
        polyline(ctx, pts, p.bfield, 1.4, { alpha: s.ampere ? 0.4 : 0.75 });
        let acc = 0;
        let next = 30;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i][0] - pts[i - 1][0];
          const dy = pts[i][1] - pts[i - 1][1];
          const seg = Math.hypot(dx, dy);
          while (seg > 0 && acc + seg >= next) {
            const f = (next - acc) / seg;
            chevron(ctx, pts[i - 1][0] + dx * f, pts[i - 1][1] + dy * f, (sgn * dx) / seg, (sgn * dy) / seg, 4.5, p.bfield);
            next += 70;
          }
          acc += seg;
        }
      }
    }

    // the thick wire: a disc in the current colour, with small ⊙/⊗ marks for the current spread through it
    if (thick) {
      const [cx, cy] = toScreen(view, thick.x, thick.y);
      const rr = thick.R * view.ppm;
      ctx.save();
      ctx.fillStyle = withAlpha(p.current, 0.14);
      ctx.strokeStyle = p.current;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      const step = 0.04;
      for (let gx = -thick.R; gx <= thick.R; gx += step) {
        for (let gy = -thick.R; gy <= thick.R; gy += step) {
          const ox = Math.round(gx / step) * step;
          const oy = Math.round(gy / step) * step;
          if (Math.hypot(ox, oy) > thick.R - 0.012) continue;
          const [x, y] = toScreen(view, thick.x + ox, thick.y + oy);
          depthGlyph(ctx, x, y, 3.5, thick.I > 0 ? 'out' : 'in', p.current, { width: 1.1, alpha: 0.8 });
        }
      }
    }

    // the cuts: ⊙ or ⊗ in the current colour
    const spacingPx = s.scene === 'solenoid' ? (s.L / LOOPS) * view.ppm : Infinity;
    const r = coil ? Math.max(3, Math.min(s.scene === 'loop' ? 9 : 7, spacingPx * 0.42)) : 10;
    for (const c of cuts) {
      if (c.I === 0) continue;
      const [x, y] = toScreen(view, c.x, c.y);
      depthGlyph(ctx, x, y, r, c.I > 0 ? 'out' : 'in', p.current, { fill: p.paper, width: r < 5 ? 1.2 : 2 });
    }

    // poles of a coil: N where the field leaves it
    if (coil) {
      const half = s.scene === 'solenoid' ? s.L / 2 : s.scene === 'loops' ? ((FEW - 1) / 2) * s.spacing : 0;
      const gap = s.scene === 'loop' ? Math.max(0.08, 0.6 * s.R) : Math.max(0.055, 0.35 * s.R);
      const drawPole = (x: number, label: string) => {
        const [sx, sy] = toScreen(view, x, 0);
        ctx.save();
        ctx.fillStyle = p.paper;
        ctx.strokeStyle = p.ink2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = p.ink;
        ctx.font = `700 13px ${p.fontUi}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, sx, sy + 0.5);
        ctx.restore();
      };
      drawPole(half + gap, northRight ? 'N' : 'S');
      drawPole(-half - gap, northRight ? 'S' : 'N');
    }

    // the Ampère path
    if (s.ampere) {
      const sp = path.map(([x, y]) => toScreen(view, x, y));
      ctx.save();
      ctx.beginPath();
      sp.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = withAlpha(p.accent, 0.07);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = blocked ? p.force : p.accent;
      if (blocked) ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
      // B∥ along the path: small arrows along the path, length ∝ the component of B along it
      const marks: { at: Vec2; t: Vec2; b: number }[] = [];
      let per = 0;
      for (let i = 0; i < path.length; i++) per += Math.hypot(path[(i + 1) % path.length][0] - path[i][0], path[(i + 1) % path.length][1] - path[i][1]);
      const every = Math.max(0.03, per / 28);
      let carry = every / 2;
      for (let i = 0; i < path.length; i++) {
        const a = path[i];
        const b = path[(i + 1) % path.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L === 0) continue;
        const t: Vec2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
        let d = carry;
        while (d < L) {
          const at: Vec2 = [a[0] + t[0] * d, a[1] + t[1] * d];
          const [bx, by] = field(at[0], at[1]);
          marks.push({ at, t, b: bx * t[0] + by * t[1] });
          d += every;
        }
        carry = d - L;
      }
      const bmax = Math.max(1e-30, ...marks.map((m) => Math.abs(m.b)));
      if (!blocked) {
        for (const m of marks) {
          const len = 16 * Math.sqrt(Math.abs(m.b) / bmax);
          if (len < 2) continue;
          // drawn just outside the path (to the right of the walking direction), so the path stays visible
          const [x0, y0] = toScreen(view, m.at[0], m.at[1]);
          const x = x0 + m.t[1] * 10;
          const y = y0 + m.t[0] * 10;
          const k = Math.sign(m.b);
          arrow(ctx, x - (k * m.t[0] * len) / 2, y + (k * m.t[1] * len) / 2, x + (k * m.t[0] * len) / 2, y - (k * m.t[1] * len) / 2, {
            color: p.bfield,
            width: 2.2,
            head: 6,
          });
        }
      }
      // the direction the path is walked: counterclockwise
      for (let i = 0; i < path.length; i += s.shape === 'rect' ? 1 : 24) {
        const a = path[i];
        const b = path[(i + 1) % path.length];
        const mx = s.shape === 'rect' ? (a[0] + b[0]) / 2 : a[0];
        const my = s.shape === 'rect' ? (a[1] + b[1]) / 2 : a[1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const [x, y] = toScreen(view, mx, my);
        chevron(ctx, x, y, (b[0] - a[0]) / L, -(b[1] - a[1]) / L, 7, blocked ? p.force : p.accent);
      }
      // handles
      const handle = (w: Vec2, sel: boolean) => {
        const [x, y] = toScreen(view, w[0], w[1]);
        ctx.save();
        ctx.fillStyle = sel ? p.accent : p.paper;
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, sel ? 7.5 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };
      if (s.shape === 'rect') rectCorners(s.rect).forEach((c, i) => handle(c, s.selected === `c${i}`));
      else handle([s.circle[0] + s.circle[2], s.circle[1]], s.selected === 'rim');
    }

    // the probe: a ring, and an arrow of fixed length along B
    {
      const [x, y] = toScreen(view, s.probe[0], s.probe[1]);
      if (Bmag > 1e-12 && Number.isFinite(Bmag)) {
        const ux = Bp[0] / Bmag;
        const uy = Bp[1] / Bmag;
        arrow(ctx, x, y, x + ux * 30, y - uy * 30, { color: p.bfield, width: 2.6, head: 9 });
      }
      ctx.save();
      ctx.strokeStyle = s.selected === 'probe' ? p.accent : p.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x + 3, y);
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x, y + 3);
      ctx.stroke();
      ctx.restore();
    }

    scaleBar(ctx, view, p, 0.1, '10 ס״מ');
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s, lines, amp]);

  const clamp = (x: number, y: number): Vec2 => [
    Math.max(-WORLD_W / 2 + 0.02, Math.min(WORLD_W / 2 - 0.02, x)),
    Math.max(-WORLD_H / 2 + 0.02, Math.min(WORLD_H / 2 - 0.02, y)),
  ];

  const hit = (v: View, sx: number, sy: number): Sel | null => {
    const near = (w: Vec2, px: number) => {
      const [x, y] = toScreen(v, w[0], w[1]);
      return Math.hypot(sx - x, sy - y) < px;
    };
    if (s.ampere) {
      if (s.shape === 'rect') {
        const c = rectCorners(s.rect).findIndex((w) => near(w, 14));
        if (c >= 0) return `c${c}` as Sel;
      } else if (near([s.circle[0] + s.circle[2], s.circle[1]], 14)) return 'rim';
    }
    if (near(s.probe, 18)) return 'probe';
    if (s.ampere) {
      const [wx, wy] = toWorld(v, sx, sy);
      const onEdge = distanceToPath(path, wx, wy) < 12 / v.ppm;
      const insideRect = s.shape === 'rect' && wx > s.rect[0] && wx < s.rect[2] && wy > s.rect[1] && wy < s.rect[3];
      const insideCircle = s.shape === 'circle' && Math.hypot(wx - s.circle[0], wy - s.circle[1]) < s.circle[2];
      if (onEdge || insideRect || insideCircle) return 'path';
    }
    return null;
  };

  const moveSel = (prev: State, what: Sel, x: number, y: number, dx: number, dy: number): State => {
    if (what === 'probe') return { ...prev, probe: clamp(x, y) };
    if (what === 'path') {
      if (prev.shape === 'rect') {
        const [l, b, r, t] = prev.rect;
        const ddx = Math.max(-WORLD_W / 2 - l, Math.min(WORLD_W / 2 - r, dx));
        const ddy = Math.max(-WORLD_H / 2 - b, Math.min(WORLD_H / 2 - t, dy));
        return { ...prev, rect: [l + ddx, b + ddy, r + ddx, t + ddy] };
      }
      const [cx, cy, rr] = prev.circle;
      const [nx, ny] = clamp(cx + dx, cy + dy);
      return { ...prev, circle: [nx, ny, rr] };
    }
    if (what === 'rim') {
      const [cx, cy] = prev.circle;
      return { ...prev, circle: [cx, cy, Math.max(0.03, Math.min(0.36, Math.hypot(x - cx, y - cy)))] };
    }
    // a rectangle corner: the opposite corner stays, and the rectangle keeps a minimum size
    const i = Number(what.slice(1));
    const [l, b, r, t] = prev.rect;
    const [cx, cy] = clamp(x, y);
    const MIN = 0.04;
    const nl = i === 0 || i === 3 ? Math.min(cx, r - MIN) : l;
    const nr = i === 1 || i === 2 ? Math.max(cx, l + MIN) : r;
    const nb = i === 0 || i === 1 ? Math.min(cy, t - MIN) : b;
    const nt = i === 2 || i === 3 ? Math.max(cy, b + MIN) : t;
    return { ...prev, rect: [nl, nb, nr, nt] };
  };

  const describe = (st: State) => {
    const B = fieldFn(turnsOf(st), wiresOf(st), thickOf(st))(st.probe[0], st.probe[1]);
    const m = Math.hypot(B[0], B[1]);
    return `בגשש B = ${sci(m)} T, ${m > 0 ? directionHe(Math.atan2(B[1], B[0])) : ''}.`;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (!h) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const anchor: Vec2 = h === 'probe' ? s.probe : [wx, wy];
    drag.current = { what: h, dx: anchor[0] - wx, dy: anchor[1] - wy, last: [wx, wy] };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const ddx = wx - d.last[0];
    const ddy = wy - d.last[1];
    d.last = [wx, wy];
    if (d.what === 'probe') userMoved.current.probe = true;
    else userMoved.current.path = true;
    setS((prev) => moveSel(prev, d.what, wx + d.dx, wy + d.dy, ddx, ddy));
  };

  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };

  const selOrder = (): Sel[] => {
    const o: Sel[] = ['probe'];
    if (s.ampere) o.push('path', ...(s.shape === 'rect' ? (['c0', 'c1', 'c2', 'c3'] as Sel[]) : (['rim'] as Sel[])));
    return o;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const order = selOrder();
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const cur = s.selected ? order.indexOf(s.selected) : -1;
      const next = order[(cur + 1) % order.length];
      setS((prev) => ({ ...prev, selected: next }));
      setLive(next === 'probe' ? 'נבחר הגשש.' : next === 'path' ? 'נבחר המסלול כולו.' : 'נבחרה נקודת אחיזה של המסלול.');
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? 'probe';
    const step = e.shiftKey ? 0.05 : 0.01;
    if (sel === 'probe') userMoved.current.probe = true;
    else userMoved.current.path = true;
    setS((prev) => {
      const at: Vec2 =
        sel === 'probe'
          ? prev.probe
          : sel === 'rim'
            ? [prev.circle[0] + prev.circle[2], prev.circle[1]]
            : sel === 'path'
              ? [0, 0]
              : rectCorners(prev.rect)[Number(sel.slice(1))];
      const next = { ...moveSel(prev, sel, at[0] + d[0] * step, at[1] + d[1] * step, d[0] * step, d[1] * step), selected: sel };
      setLive(sel === 'probe' ? describe(next) : 'המסלול זז.');
      return next;
    });
  };

  const set = (patch: Partial<State>) => {
    setS((prev) => ({ ...prev, ...patch }));
  };
  /** a slider moved by the learner: some tasks are about the slider's value itself */
  const slide = (patch: Partial<State>) => {
    set(patch);
    const has = (t: string) => props.tasks?.includes(t);
    const next = { ...s, ...patch };
    if (has('close-loops') && next.scene === 'loops' && patch.spacing !== undefined && patch.spacing <= 0.031) markTask(`${props.id}:close-loops`);
    if (has('half-length') && next.scene === 'solenoid' && patch.L !== undefined && next.N === base.current.N && Math.abs(next.L - base.current.L / 2) < 0.026)
      markTask(`${props.id}:half-length`);
  };
  const setScene = (scene: Scene) => {
    const next = sceneState(scene, { ampere: s.ampere, lines: s.lines });
    base.current = { N: next.N, L: next.L, r: next.circle[2] };
    userMoved.current = { probe: false, path: false };
    setS(next);
    setLive(`מוצג: ${SCENE_LABEL[scene]}.`);
  };
  const reverse = () => {
    const dir = (s.dir > 0 ? -1 : 1) as 1 | -1;
    setS({ ...s, dir });
    if (props.tasks?.includes('reverse') && (s.scene === 'loop' || s.scene === 'solenoid' || s.scene === 'loops')) markTask(`${props.id}:reverse`);
    setLive(coil ? `הזרם התהפך. הקוטב הצפוני עכשיו בצד ${dir > 0 ? 'ימין' : 'שמאל'}.` : 'הזרם התהפך.');
  };
  const reset = () => {
    const st = initial(props);
    base.current = { N: st.N, L: st.L, r: st.circle[2] };
    userMoved.current = { probe: false, path: false };
    setS(st);
    setLive('האיור אופס.');
  };

  // readouts
  const centreLine = (() => {
    if (s.scene === 'loop')
      return (
        <span>
          במרכז הכריכה: <b class="q">B = μ₀NI/(2R) = {sci(loopCenterField(s.I, s.R, s.N))} T</b>
        </span>
      );
    if (s.scene === 'loops')
      return (
        <span>
          במרכז: <b class="q">B = {sci(Math.abs(field(0, 0)[0]))} T</b>
        </span>
      );
    if (s.scene === 'solenoid')
      return (
        <>
          <span>
            סליל ארוך: <b class="q">B = μ₀NI/L = {sci(solenoidField(s.N, s.L, s.I))} T</b>
          </span>
          <span>
            צפיפות הכריכות: <b class="q">n = N/L = {Math.round(s.N / s.L)} 1/m</b>
          </span>
        </>
      );
    if (s.scene === 'thick') {
      const r = Math.hypot(s.probe[0], s.probe[1]);
      return (
        <span>
          במרחק <b class="q">r = {fmtCm(r)}</b> מהציר, {r < s.R ? 'בתוך התיל' : 'מחוץ לתיל'}:{' '}
          <b class="q">
            {r < s.R ? 'μ₀Ir/(2πR²)' : 'μ₀I/(2πr)'} = {sci(thickWireField(s.I, s.R, r))} T
          </b>
        </span>
      );
    }
    if (s.scene === 'wire') {
      const r = Math.hypot(s.probe[0], s.probe[1]);
      return (
        <span>
          במרחק <b class="q">r = {fmtCm(r)}</b> מהתיל: <b class="q">μ₀I/(2πr) = {sci(straightWireField(s.I, r))} T</b>
        </span>
      );
    }
    return null;
  })();

  const edgeNames = ['למטה', 'ימין', 'למעלה', 'שמאל'];

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${SCENE_LABEL[s.scene]}, במישור שעובר דרך הציר. ${describe(s)}${coil ? ` הקוטב הצפוני בצד ${northRight ? 'ימין' : 'שמאל'}.` : ''} גררו את הגשש${s.ampere ? ' ואת המסלול' : ''} בעכבר או במגע; במקלדת: רווח בוחר, חיצים מזיזים.`}
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
          {centreLine}
          <span>
            בגשש: <b class="q">B = {sci(Bmag)} T</b>
            {Bmag > 1e-12 && <>, {directionHe(Math.atan2(Bp[1], Bp[0]))}</>}
          </span>
          {coil && (
            <span>
              הקוטב הצפוני: <b>הקצה ה{northRight ? 'ימני' : 'שמאלי'}</b>
            </span>
          )}
          {s.ampere && blocked && (
            <span>
              <b>המסלול עובר דרך תיל.</b> הזיזו אותו מעט: חוק אמפר מדבר על מסלול שלא נוגע בזרם.
            </span>
          )}
          {amp && (
            <>
              <span>
                סכום <b class="q">B∥·Δℓ</b> סביב המסלול: <b class="q">{signed(amp.total)} T·m</b>
              </span>
              <span>
                הזרם הכלוא: <b class="q">I = {nearlyInt(amp.Ienc)} A</b> · <b class="q">μ₀I = {signed(MU0 * amp.Ienc)} T·m</b>
              </span>
              {s.shape === 'rect' && (
                <span>
                  תרומת כל צלע:{' '}
                  {amp.edges.map((v, i) => (
                    <>
                      {i > 0 && ' · '}
                      {edgeNames[i]} <b class="q">{signed(v)}</b>
                    </>
                  ))}
                </span>
              )}
            </>
          )}
        </>
      }
      controls={
        <>
          {scenes.length > 1 && (
            <div class="group" role="group" aria-label="מה מוצג">
              {scenes.map((k) => (
                <button type="button" key={k} class={`toggle ${s.scene === k ? 'on' : ''}`} aria-pressed={s.scene === k} onClick={() => setScene(k)}>
                  {SCENE_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          <Slider
            label={s.scene === 'wires' ? 'הזרם בתיל השמאלי' : 'הזרם I'}
            value={s.I}
            min={0.5}
            max={s.scene === 'solenoid' ? 5 : s.scene === 'thick' ? 20 : 10}
            step={0.5}
            format={fmtA}
            onChange={(v) => slide({ I: v })}
          />
          {s.scene === 'loop' && (
            <>
              <Slider label="מספר הכריכות N" value={s.N} min={1} max={50} step={1} format={(v) => String(v)} onChange={(v) => slide({ N: v })} />
              <Slider label="הרדיוס R" value={s.R} min={0.05} max={0.25} step={0.01} format={fmtCm} onChange={(v) => slide({ R: Math.round(v * 100) / 100 })} />
            </>
          )}
          {s.scene === 'thick' && (
            <Slider label="רדיוס התיל" value={s.R} min={0.05} max={0.2} step={0.01} format={fmtCm} onChange={(v) => slide({ R: Math.round(v * 100) / 100 })} />
          )}
          {s.scene === 'loops' && (
            <Slider label="המרחק בין הכריכות" value={s.spacing} min={0.03} max={0.2} step={0.01} format={fmtCm} onChange={(v) => slide({ spacing: Math.round(v * 100) / 100 })} />
          )}
          {s.scene === 'solenoid' && (
            <>
              <Slider label="מספר הכריכות N" value={s.N} min={100} max={1000} step={50} format={(v) => String(v)} onChange={(v) => slide({ N: v })} />
              <Slider label="האורך L" value={s.L} min={0.4} max={1} step={0.05} format={fmtCm} onChange={(v) => slide({ L: Math.round(v * 100) / 100 })} />
              <Slider label="הרדיוס R" value={s.R} min={0.05} max={0.12} step={0.01} format={fmtCm} onChange={(v) => slide({ R: Math.round(v * 100) / 100 })} />
            </>
          )}
          <div class="group" role="group" aria-label="תצוגה">
            <button type="button" class="toggle" onClick={reverse}>
              הפכו את כיוון הזרם
            </button>
            <Toggle label="קווי שדה" on={s.lines} onChange={(v) => set({ lines: v })} />
            {props.ampereControls && <Toggle label="מסלול אמפר" on={s.ampere} onChange={(v) => set({ ampere: v, selected: null })} />}
            {props.ampereControls && s.ampere && (
              <>
                <button type="button" class={`toggle ${s.shape === 'rect' ? 'on' : ''}`} aria-pressed={s.shape === 'rect'} onClick={() => set({ shape: 'rect', selected: null })}>
                  מלבן
                </button>
                <button type="button" class={`toggle ${s.shape === 'circle' ? 'on' : ''}`} aria-pressed={s.shape === 'circle'} onClick={() => set({ shape: 'circle', selected: null })}>
                  מעגל
                </button>
              </>
            )}
          </div>
        </>
      }
    />
  );
}

/** corners in the order bottom-left, bottom-right, top-right, top-left */
function rectCorners([l, b, r, t]: State['rect']): Vec2[] {
  return [
    [l, b],
    [r, b],
    [r, t],
    [l, t],
  ];
}
