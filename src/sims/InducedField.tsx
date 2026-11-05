/**
 * The induced electric field round the core of a long solenoid, seen end-on. Built for lesson 5.6.
 *
 * - The core (radius 4 cm, as in lesson 6.13) holds a uniform B, ⊙ or ⊗, that grows or shrinks at a rate
 *   the learner sets. Outside the core there is no magnetic field.
 * - The induced E is drawn crisp, in the electric colour: as a grid of arrows (length ∝ |E|), or as its
 *   closed field lines, circles round the axis with chevrons.
 * - A test loop, a circle the learner drags and resizes. The part of it inside the core is shaded: that is
 *   the area whose flux changes. Chevrons on the loop show the sense in which the field pushes a positive
 *   charge round it. The readout gives the rate of change of the flux and the work per unit charge round
 *   the loop, Σ E∥·Δℓ, summed from the field itself (`loopCirculation`): they agree, which is Faraday's law.
 * - A positive bead in a closed insulating tube along the loop, released from rest. The field pushes it
 *   along the loop and it gains q·|ε| on each lap; on a loop beside the core it only swings back and forth.
 *   Its charge-to-mass ratio is chosen per loop so the first lap takes about 2.4 s: the speed is not to
 *   scale, the energy per lap (in units of q·|ε|) is.
 *
 * Every number comes from src/physics (inducedfield.ts, maxwell.ts `inducedE`).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { areaInCore, beadStart, beadStep, loopCirculation, loopEmf, onLoop, tangentialE, type Bead, type Loop } from '~/physics/inducedfield';
import { inducedE } from '~/physics/maxwell';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { arrow, chargeDisc, chevron, scaleBar, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

/** the core's radius [m], the same as lesson 6.13's (maxwell.ts SOL_R) */
export const CORE_A = 0.04;
const WORLD_W = 0.32;
const WORLD_H = 0.2;
const ASPECT = WORLD_W / WORLD_H;
const R_MIN = 0.005;
const R_MAX = 0.15;
/** the first lap of the bead takes about this long [s] */
const FIRST_LAP = 2.4;
/** the bead stops after this many laps */
const MAX_LAPS = 5;
const SUB_DT = 1 / 240;

type Dir = 'out' | 'in';
type Change = 'grow' | 'shrink';
type ViewMode = 'arrows' | 'lines';
type Sel = 'loop' | 'rim';

const TASK_LABEL: Record<string, string> = {
  'inside-area': 'בתוך הליבה: שנו את גודל הלולאה, כך שתישאר כולה בתוך הליבה. איך משתנה הכא"מ?',
  enclose: 'הגדילו או הזיזו את הלולאה כך שתקיף את כל הליבה. האם הכא"מ תלוי בגודל שלה?',
  beside: 'הזיזו את הלולאה אל מחוץ לליבה, כך שלא תקיף אותה כלל. מה הכא"מ? האם יש שדה חשמלי על הלולאה?',
  reverse: 'הפכו את השינוי: שדה שקטן במקום שדה שגדל. מה קרה לחיצים?',
  bead: 'שחררו חרוז טעון על לולאה שהכא"מ סביבה אינו אפס. כמה אנרגיה הוא מקבל בכל סיבוב?',
};

export interface InducedFieldProps {
  id: string;
  /** the direction of B in the core */
  dir?: Dir;
  /** whether |B| grows or shrinks */
  change?: Change;
  /** |dB/dt| [T/s] */
  rate?: number;
  /** the test loop: centre x, centre y, radius [m] */
  loop?: [number, number, number];
  view?: ViewMode;
  /** let the bead go at once (a step may ask for it) */
  bead?: boolean;
  tasks?: string[];
}

interface State {
  dir: Dir;
  change: Change;
  rate: number;
  loop: Loop;
  view: ViewMode;
  /** a release counter: 0 = no bead; each release gets a new number, so the bead restarts */
  bead: number;
  selected: Sel | null;
}

/** dB_z/dt [T/s]: z is out of the page */
const rateZ = (s: Pick<State, 'dir' | 'change' | 'rate'>) => (s.dir === 'out' ? 1 : -1) * (s.change === 'grow' ? 1 : -1) * s.rate;

const sense = (emf: number) => (emf < 0 ? 'עם כיוון השעון' : 'נגד כיוון השעון');
const encloses = (l: Loop) => Math.hypot(l.cx, l.cy) + CORE_A <= l.r + 1e-9;
const inside = (l: Loop) => Math.hypot(l.cx, l.cy) + l.r <= CORE_A + 1e-9;
const apart = (l: Loop) => Math.hypot(l.cx, l.cy) >= CORE_A + l.r - 1e-9;
const cm2 = (m2: number) => sci(m2 * 1e4);

interface BeadRun {
  /** the release this run belongs to */
  key: number;
  b: Bead;
  phi0: number;
  /** charge-to-mass ratio for this loop [C/kg] */
  qm: number;
  /** figure time reached so far, and the figure time at release [s] */
  t: number;
  t0: number;
  laps: number;
  done: boolean;
}

export default function InducedField(props: InducedFieldProps) {
  const init = (): State => ({
    dir: props.dir ?? 'out',
    change: props.change ?? 'grow',
    rate: props.rate ?? 2,
    loop: props.loop ? { cx: props.loop[0], cy: props.loop[1], r: props.loop[2] } : { cx: 0, cy: 0, r: 0.02 },
    view: props.view ?? 'arrows',
    bead: props.bead ? 1 : 0,
    selected: null,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const [laps, setLaps] = useState(0);
  const drag = useRef<{ what: Sel; last: [number, number] } | null>(null);
  const run = useRef<BeadRun | null>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => !!props.tasks?.includes(t);
  const done = (t: string) => markTask(`${props.id}:${t}`);

  const k = rateZ(s);
  const emf = loopEmf(k, CORE_A, s.loop);
  const circ = k === 0 ? 0 : loopCirculation(k, CORE_A, s.loop);
  const area = areaInCore(CORE_A, s.loop);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next: State = { ...prev, selected: null };
          if (st.dir === 'out' || st.dir === 'in') next.dir = st.dir;
          if (st.change === 'grow' || st.change === 'shrink') next.change = st.change;
          if (typeof st.rate === 'number') next.rate = st.rate;
          if (st.view === 'arrows' || st.view === 'lines') next.view = st.view;
          if (Array.isArray(st.loop) && st.loop.length === 3) next.loop = { cx: Number(st.loop[0]), cy: Number(st.loop[1]), r: Number(st.loop[2]) };
          next.bead = st.bead === true ? prev.bead + 1 : 0;
          return next;
        });
      }),
    [props.id],
  );

  // a new release, or a change that moves the bead's loop or field: the old run is void
  useEffect(() => {
    run.current = null;
    setLaps(0);
  }, [s.bead, s.loop.cx, s.loop.cy, s.loop.r, k]);

  /* ------------------------------------------------------------------ actions (the learner's only) */

  const clampLoop = (l: Loop): Loop => {
    const r = Math.max(R_MIN, Math.min(R_MAX, l.r));
    return {
      r,
      cx: Math.max(-WORLD_W / 2 + 0.01, Math.min(WORLD_W / 2 - 0.01, l.cx)),
      cy: Math.max(-WORLD_H / 2 + 0.01, Math.min(WORLD_H / 2 - 0.01, l.cy)),
    };
  };

  /** the learner moved or resized the loop: tick the geometry tasks and stop the bead */
  const moveLoop = (prev: State, loop: Loop, resized: boolean): State => {
    const next = { ...prev, loop: clampLoop(loop), bead: 0 };
    const kk = rateZ(next);
    if (kk !== 0) {
      if (has('inside-area') && resized && inside(next.loop) && Math.abs(next.loop.r - prev.loop.r) > 1e-9) done('inside-area');
      if (has('enclose') && encloses(next.loop)) done('enclose');
      if (has('beside') && apart(next.loop)) done('beside');
    }
    return next;
  };

  const act = (patch: Partial<State>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      const before = rateZ(prev);
      const after = rateZ(next);
      if (has('reverse') && before !== 0 && after !== 0 && Math.sign(before) !== Math.sign(after)) done('reverse');
      return next;
    });
  };

  const release = () => {
    setS((prev) => {
      if (has('bead') && loopEmf(rateZ(prev), CORE_A, prev.loop) !== 0) done('bead');
      return { ...prev, bead: prev.bead + 1 };
    });
  };

  const describe = (st: State): string => {
    const kk = rateZ(st);
    const e = loopEmf(kk, CORE_A, st.loop);
    const field = kk === 0 ? 'השדה המגנטי בליבה לא משתנה' : `השדה המגנטי בליבה ${st.dir === 'out' ? 'יוצא מהדף' : 'נכנס לדף'} ו${st.change === 'grow' ? 'גדל' : 'קטן'} בקצב ${sci(st.rate)} טסלה לשנייה`;
    const where = encloses(st.loop) ? 'מקיפה את כל הליבה' : inside(st.loop) ? 'כולה בתוך הליבה' : apart(st.loop) ? 'מחוץ לליבה, לא מקיפה אותה' : 'חלקה בתוך הליבה';
    const emfText = e === 0 ? 'הכא"מ סביבה אפס' : `הכא"מ סביבה ${sci(Math.abs(e))} וולט, ${sense(e)}`;
    return `${field}. לולאה ברדיוס ${sci(st.loop.r * 100)} סנטימטרים, ${where}; ${emfText}.`;
  };

  useEffect(() => {
    if (drag.current) return;
    setLive(describe(s));
  }, [s.dir, s.change, s.rate, s.loop.cx, s.loop.cy, s.loop.r]);

  /* ------------------------------------------------------------------ the bead */

  const startRun = (st: State, t: number): BeadRun | null => {
    const kk = rateZ(st);
    if (kk === 0) return null;
    const l = st.loop;
    const e = loopEmf(kk, CORE_A, l);
    let qm: number;
    if (e !== 0) qm = (8 * Math.PI ** 2 * l.r * l.r) / (Math.abs(e) * FIRST_LAP ** 2);
    else {
      let most = 0;
      for (let i = 0; i < 90; i++) most = Math.max(most, Math.abs(tangentialE(kk, CORE_A, l, (i / 90) * 2 * Math.PI)));
      qm = (4 * Math.PI * l.r) / (most * FIRST_LAP ** 2);
    }
    const phi0 = beadStart(kk, CORE_A, l);
    return { key: st.bead, b: { phi: phi0, omega: 0 }, phi0, qm, t, t0: t, laps: 0, done: false };
  };

  const advance = (st: State, t: number) => {
    if (st.bead === 0) return null;
    let r = run.current;
    if (!r || r.key !== st.bead) {
      r = startRun(st, t);
      run.current = r;
      if (!r) return null;
    }
    if (r.done || !motionAllowed()) {
      r.t = t;
      return r;
    }
    const kk = rateZ(st);
    // never more than half a second of catch-up in one frame (a tab that slept)
    let tt = Math.max(r.t, t - 0.5);
    while (tt + SUB_DT <= t) {
      r.b = beadStep(r.b, kk, CORE_A, st.loop, r.qm, SUB_DT);
      tt += SUB_DT;
      const turned = Math.floor(Math.abs(r.b.phi - r.phi0) / (2 * Math.PI));
      if (turned > r.laps) {
        r.laps = turned;
        if (r.laps >= MAX_LAPS) {
          r.done = true;
          break;
        }
      }
    }
    r.t = t;
    return r;
  };

  /* ------------------------------------------------------------------ drawing */

  const label = (ctx: CanvasRenderingContext2D, p: FrameInfo['palette'], text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center', size = 13, rtl = false) => {
    ctx.save();
    ctx.font = `600 ${size}px ${p.fontUi}`;
    ctx.fillStyle = color;
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  const draw = (f: FrameInfo) => {
    const { ctx, view: v, palette: p, t } = f;
    const E = inducedE(k, CORE_A);
    const [ox, oy] = toScreen(v, 0, 0);
    const aPx = CORE_A * v.ppm;

    // the core and its field, ⊙ or ⊗ on a lattice clipped to the disc
    ctx.save();
    ctx.fillStyle = withAlpha(p.bfield, 0.08);
    ctx.beginPath();
    ctx.arc(ox, oy, aPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = withAlpha(p.bfield, 0.8);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.clip();
    const step = Math.max(14, aPx / 2.6);
    ctx.strokeStyle = withAlpha(p.bfield, 0.6);
    ctx.fillStyle = withAlpha(p.bfield, 0.6);
    ctx.lineWidth = 1.4;
    for (let x = ox - Math.floor(aPx / step) * step; x <= ox + aPx; x += step)
      for (let y = oy - Math.floor(aPx / step) * step; y <= oy + aPx; y += step) {
        if (Math.hypot(x - ox, y - oy) > aPx - 4) continue;
        ctx.beginPath();
        if (s.dir === 'out') {
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const d = 3;
          ctx.moveTo(x - d, y - d);
          ctx.lineTo(x + d, y + d);
          ctx.moveTo(x - d, y + d);
          ctx.lineTo(x + d, y - d);
          ctx.stroke();
        }
      }
    ctx.restore();
    const changeWord = k === 0 ? 'קבוע' : s.change === 'grow' ? 'גדל' : 'קטן';
    label(ctx, p, `B ${s.dir === 'out' ? '⊙' : '⊗'}`, ox, oy - aPx - 22, p.bfield, 'center', 13);
    label(ctx, p, changeWord, ox, oy - aPx - 8, p.bfield, 'center', 12, true);

    // the induced E
    const eMax = Math.abs(k) * CORE_A / 2;
    if (k !== 0 && s.view === 'arrows') {
      const g = 0.02;
      const cell = g * v.ppm;
      const nx = Math.ceil(WORLD_W / 2 / g);
      const ny = Math.ceil(WORLD_H / 2 / g);
      for (let i = -nx; i <= nx; i++)
        for (let j = -ny; j <= ny; j++) {
          const x = (i + 0.5) * g;
          const y = (j + 0.5) * g;
          const [ex, ey] = E(x, y);
          const m = Math.hypot(ex, ey);
          if (m < eMax * 0.04) continue;
          const len = Math.min(1, m / eMax) * cell * 0.85;
          const [sx, sy] = toScreen(v, x, y);
          const ux = ex / m;
          const uy = -ey / m;
          arrow(ctx, sx - (ux * len) / 2, sy - (uy * len) / 2, sx + (ux * len) / 2, sy + (uy * len) / 2, {
            color: p.efield,
            width: 1.6,
            head: Math.min(7, len * 0.45),
          });
        }
    } else if (k !== 0) {
      const cw = k > 0; // a growing ⊙ field turns E clockwise
      for (const r of [0.012, 0.024, 0.036, 0.055, 0.08, 0.11, 0.145]) {
        const rp = r * v.ppm;
        const strength = Math.min(1, (r < CORE_A ? r / CORE_A : CORE_A / r) + 0.15);
        ctx.save();
        ctx.strokeStyle = withAlpha(p.efield, 0.35 + 0.55 * strength);
        ctx.lineWidth = 1 + 1.2 * strength;
        ctx.beginPath();
        ctx.arc(ox, oy, rp, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        const n = r < 0.03 ? 3 : 6;
        for (let q = 0; q < n; q++) {
          const a = (q / n) * 2 * Math.PI + 0.4;
          // counter-clockwise tangent in screen space (y down): (−sin a, −cos a)
          const tx = -Math.sin(a) * (cw ? -1 : 1);
          const ty = -Math.cos(a) * (cw ? -1 : 1);
          chevron(ctx, ox + rp * Math.cos(a), oy - rp * Math.sin(a), tx, ty, 6, p.efield);
        }
      }
    }
    if (k === 0) label(ctx, p, 'השדה המגנטי לא משתנה: אין שדה חשמלי מושרה', v.w / 2, 18, p.ink2, 'center', 13, true);

    // the test loop: the part inside the core shaded, the loop in the accent ink, chevrons in the emf's sense
    const l = s.loop;
    const [lx, ly] = toScreen(v, l.cx, l.cy);
    const lr = l.r * v.ppm;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ox, oy, aPx, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = withAlpha(p.bfield, 0.22);
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = s.selected === 'loop' ? 3.4 : 2.4;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (emf !== 0) {
      const n = Math.max(3, Math.min(8, Math.round(lr / 14)));
      for (let q = 0; q < n; q++) {
        const a = (q / n) * 2 * Math.PI + 0.2;
        const ccw = emf > 0 ? 1 : -1;
        chevron(ctx, lx + lr * Math.cos(a), ly - lr * Math.sin(a), -Math.sin(a) * ccw, -Math.cos(a) * ccw, 6, p.current);
      }
    }
    // handles: the centre (drag the loop) and the rim (resize)
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(lx - 5, ly);
    ctx.lineTo(lx + 5, ly);
    ctx.moveTo(lx, ly - 5);
    ctx.lineTo(lx, ly + 5);
    ctx.stroke();
    ctx.fillStyle = p.paper;
    ctx.lineWidth = s.selected === 'rim' ? 3 : 2;
    ctx.beginPath();
    ctx.arc(lx + lr, ly, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // the bead
    const r = advance(s, t);
    if (r) {
      const [bx, by] = onLoop(l, r.b.phi);
      const [sx, sy] = toScreen(v, bx, by);
      const et = tangentialE(k, CORE_A, l, r.b.phi);
      if (Math.abs(et) > eMax * 0.03) {
        const len = 12 + 26 * Math.min(1, Math.abs(et) / eMax);
        const sg = Math.sign(et);
        const tx = -Math.sin(r.b.phi) * sg;
        const ty = -Math.cos(r.b.phi) * sg;
        arrow(ctx, sx, sy, sx + tx * len, sy + ty * len, { color: p.force, width: 2.6, head: 9, glow: withAlpha(p.paper, 0.9) });
      }
      chargeDisc(ctx, sx, sy, 7, 1, p);
      if (r.laps !== laps) queueMicrotask(() => setLaps(r.laps));
    }

    scaleBar(ctx, v, p, 0.05, '5 ס"מ');
  };

  const animate = s.bead > 0 && k !== 0;
  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate });
  useEffect(invalidate, [s]);

  /* ------------------------------------------------------------------ pointer and keyboard */

  const hit = (v: View, sx: number, sy: number): Sel | null => {
    const [lx, ly] = toScreen(v, s.loop.cx, s.loop.cy);
    const lr = s.loop.r * v.ppm;
    if (Math.hypot(sx - (lx + lr), sy - ly) < 14) return 'rim';
    const d = Math.hypot(sx - lx, sy - ly);
    if (d < lr + 10 || d < 16) return 'loop';
    return null;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (!h) return;
    drag.current = { what: h, last: toWorld(v, e.offsetX, e.offsetY) as [number, number] };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const dx = wx - d.last[0];
    const dy = wy - d.last[1];
    d.last = [wx, wy];
    setS((prev) =>
      d.what === 'loop'
        ? moveLoop(prev, { ...prev.loop, cx: prev.loop.cx + dx, cy: prev.loop.cy + dy }, false)
        : moveLoop(prev, { ...prev.loop, r: Math.hypot(wx - prev.loop.cx, wy - prev.loop.cy) }, true),
    );
  };

  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const next: Sel = s.selected === 'loop' ? 'rim' : 'loop';
      setS((prev) => ({ ...prev, selected: next }));
      setLive(next === 'loop' ? 'נבחרה הלולאה: החצים מזיזים אותה.' : 'נבחרה נקודת האחיזה שעל הלולאה: החצים משנים את הרדיוס.');
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? 'loop';
    const stepM = e.shiftKey ? 0.02 : 0.005;
    setS((prev) => {
      const next =
        sel === 'loop'
          ? moveLoop(prev, { ...prev.loop, cx: prev.loop.cx + d[0] * stepM, cy: prev.loop.cy + d[1] * stepM }, false)
          : moveLoop(prev, { ...prev.loop, r: prev.loop.r + (d[0] + d[1]) * stepM }, true);
      setLive(describe(next));
      return { ...next, selected: sel };
    });
  };

  /* ------------------------------------------------------------------ panel */

  const field = (
    <span>
      בליבה: <b class="q">B {s.dir === 'out' ? '⊙' : '⊗'}</b>{' '}
      {k === 0 ? (
        'לא משתנה'
      ) : (
        <>
          {s.change === 'grow' ? 'גדל' : 'קטן'}, <b class="q">|ΔB/Δt| = {sci(s.rate)} T/s</b>
        </>
      )}
    </span>
  );

  const fluxLine = (
    <span>
      השטח של הלולאה שבתוך הליבה: <b class="q">{area === 0 ? '0' : cm2(area)} cm²</b>; קצב השינוי של השטף:{' '}
      <b class="q">|ΔΦ/Δt| = {sci(Math.abs(k) * area)} Wb/s</b>
    </span>
  );

  const emfLine =
    k === 0 ? (
      <span>
        הכא"מ, <b class="q">ΣE∥·Δℓ</b> סביב הלולאה: <b class="q">0 V</b>
      </span>
    ) : emf === 0 ? (
      <span>
        הכא"מ, <b class="q">ΣE∥·Δℓ</b> סביב הלולאה: <b class="q">0 V</b>. על הלולאה יש שדה, אבל בחלק ממנה הוא דוחף עם כיוון השעון ובחלק נגדו.
      </span>
    ) : (
      <span>
        הכא"מ, <b class="q">ΣE∥·Δℓ</b> סביב הלולאה: <b class="q">{sci(Math.abs(circ))} V</b>, {sense(circ)}
        {encloses(s.loop) ? ' (הלולאה מקיפה את כל הליבה)' : ''}
      </span>
    );

  const beadLine = () => {
    if (s.bead === 0) return null;
    if (k === 0) return <span>החרוז: אין שדה חשמלי, והוא נשאר במקומו.</span>;
    if (!motionAllowed()) return <span>החרוז: כשהתנועה כבויה הוא לא זז. החץ מראה את הכוח שהשדה מפעיל עליו.</span>;
    if (emf === 0) return <span>החרוז נע הלוך ושוב ולא משלים סיבוב: סביב לולאה כזו העבודה של השדה אפס.</span>;
    return (
      <span>
        החרוז השלים <b class="q">{laps}</b> {laps === 1 ? 'סיבוב' : 'סיבובים'}
        {laps > 0 && (
          <>
            , והשדה עשה עליו עבודה של <b class="q">{laps}·q|ε|</b>: כל סיבוב מוסיף <b class="q">q·{sci(Math.abs(emf))} V</b>
          </>
        )}
        {laps >= MAX_LAPS ? '. (האיור עוצר אותו כאן.)' : ''}
      </span>
    );
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${describe(s)}`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      onReset={() => {
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          {field}
          {fluxLine}
          {emfLine}
          {beadLine()}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="השדה המגנטי">
            <button type="button" class="toggle" onClick={() => act({ dir: s.dir === 'out' ? 'in' : 'out' })}>
              השדה: {s.dir === 'out' ? '⊙ החוצה מהדף' : '⊗ לתוך הדף'}
            </button>
            {(
              [
                ['grow', 'גדל'],
                ['shrink', 'קטן'],
              ] as const
            ).map(([c, name]) => (
              <button type="button" key={c} class={`toggle ${s.change === c ? 'on' : ''}`} aria-pressed={s.change === c} onClick={() => act({ change: c })}>
                {name}
              </button>
            ))}
          </div>
          <Slider label="קצב השינוי |ΔB/Δt|" value={s.rate} min={0} max={4} step={0.5} format={(x) => `${sci(x)} T/s`} onChange={(x) => act({ rate: Math.round(x * 2) / 2 })} />
          <div class="group" role="group" aria-label="תצוגה">
            {(
              [
                ['arrows', 'חיצים'],
                ['lines', 'קווי שדה'],
              ] as const
            ).map(([m, name]) => (
              <button type="button" key={m} class={`toggle ${s.view === m ? 'on' : ''}`} aria-pressed={s.view === m} onClick={() => act({ view: m })}>
                {name}
              </button>
            ))}
            <button type="button" class="toggle" onClick={release}>
              {s.bead > 0 ? 'שחררו שוב את החרוז' : 'שחררו חרוז טעון'}
            </button>
          </div>
        </>
      }
    />
  );
}
