/**
 * Lenz's law with a moving magnet. Built for lesson 5.3. Two views, chosen by `mode`:
 *
 * - `ring`: a side view along the axis of a bar magnet and a copper ring. The learner drags the magnet
 *   (or presses "bring it closer" / "move it away"), and the figure shows the four steps of the recipe:
 *   the magnet's field through the ring, whether the flux grows or shrinks, the induced field that opposes
 *   the change (a hollow arrow at the ring's centre), and the current that makes it: ⊙/⊗ where the page
 *   cuts the ring, as in lesson 4.3, plus a small face-on view of the ring as seen from the magnet, with
 *   the pole that faces the magnet. The force on the ring is drawn under it. A "wrong sign" toggle
 *   reverses the current, and the readout then shows energy appearing from nowhere: the ring would pull
 *   the magnet in and still heat up.
 * - `tube`: a magnet released at the mouth of a vertical tube (copper, aluminium or plastic). On the left
 *   the whole tube; in the middle a close-up around the magnet with the eddy currents in the wall (⊙/⊗,
 *   size ∝ current), the weight and the braking force; on the right the graph v(t), with the terminal
 *   speed dashed.
 *
 * Every number comes from src/physics/lenz.ts: ringResponse (the bar magnet as lesson 4.1's stand-in
 * solenoid, magnets.ts, so the drawn field lines and the numbers share one model) and simulateFall /
 * tubeDragAt (point dipole, tube as a stack of rings). Not to scale: in the tube close-up the tube and the
 * magnet are magnified, and the full tube is drawn wider than it is; arrow lengths are capped.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import {
  facingPole,
  ringResponse,
  simulateFall,
  tubeDragAt,
  tubeTerminalSpeed,
  wallCurrentDensity,
  type AxialMagnet,
  type Dipole,
  type FallState,
  type Ring,
  type Tube,
} from '~/physics/lenz';
import { traceLine } from '~/physics/magnetism';
import { magnetsFieldAt, type BarMagnet } from '~/physics/magnets';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, chevron, depthGlyph, polyline, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, insetBox, makePlot } from './core/plot';
import SimShell, { Toggle, type TaskDef } from './core/SimShell';

type Mode = 'ring' | 'tube';
export type TubeKind = 'copper' | 'aluminium' | 'plastic';

/* ------------------------------------------------------------------ the ring */

/** the magnet: 8 cm long, 2.4 cm wide, about 24 mT inside (m ≈ 0.68 A·m²) */
const MAG: AxialMagnet = { L: 0.08, R: 0.012, NI: 1500 };
/** a thick copper ring, radius 3 cm, 4 mm × 4 mm section: ringResistance(1.7e-8, 0.03, 1.6e-5) ≈ 2·10⁻⁴ Ω */
const RING: Ring = { a: 0.03, R: 2e-4 };
/** the ring's centre on the axis [m] */
const XR = 0.06;
const X_MIN = -0.2;
const X_MAX = 0.2;
const WORLD_W = 0.5;
const RING_ASPECT = 1.6;
/** speed of the "closer" / "away" buttons [m/s] */
const V0 = 0.3;
/** the approaching magnet stops with its face this far before the ring [m] */
const STOP_GAP = 0.01;
/** a current or force below these counts as none (the far field falls off as 1/u⁴) */
const I_MIN = 5e-4;
/** force and current drawn at full size [N], [A] */
const F_REF = 5e-5;
const I_REF = 0.25;
/** a drag counts for a task only near the ring and at a real speed */
const TASK_U = 0.2;
const TASK_V = 0.05;

/* ------------------------------------------------------------------ the tube */

const TUBES: Record<TubeKind, Tube> = {
  copper: { a: 0.008, wall: 0.0015, length: 0.4, sigma: 5.8e7 },
  aluminium: { a: 0.008, wall: 0.0015, length: 0.4, sigma: 3.5e7 },
  plastic: { a: 0.008, wall: 0.0015, length: 0.4, sigma: 0 },
};
const TUBE_NAME: Record<TubeKind, string> = { copper: 'נחושת', aluminium: 'אלומיניום', plastic: 'פלסטיק' };
/** a neodymium and a ferrite cylinder, 12 mm × 12 mm: m = B_r·V/μ₀ */
const MAGNETS: Record<'strong' | 'weak', Dipole> = {
  strong: { m: 1.3, mass: 0.01 },
  weak: { m: 0.43, mass: 0.007 },
};
const MAG_LEN = 0.012;
const MAG_RAD = 0.006;
const DT = 5e-4;
const T_MAX = 30;
/** the run ends when the magnet's centre reaches the bottom: below it the magnet falls freely */
const EXIT = 0;
const TUBE_ASPECT = 1.25;

const TASK_LABEL: Record<string, string> = {
  approach: 'קרבו את הקוטב הצפוני אל הטבעת. לאן זורם הזרם, ואיזה קוטב פונה אל המגנט?',
  recede: 'הרחיקו את המגנט מהטבעת. מה התהפך?',
  flip: 'הפכו את המגנט, כך שהקוטב הדרומי פונה אל הטבעת, וקרבו אותו שוב. האם הטבעת נמשכת?',
  through: 'גררו את המגנט דרך הטבעת אל הצד השני. מתי הזרם מתהפך?',
  wrong: 'הפעילו את "מה אם הזרם הפוך?" והזיזו את המגנט. מאיפה באה האנרגיה?',
  'drop-plastic': 'שחררו את המגנט בצינור פלסטיק.',
  'drop-copper': 'שחררו את המגנט החזק בצינור נחושת. מה המהירות הסופית?',
  'drop-flipped': 'הפכו את המגנט ושחררו אותו שוב בצינור מתכת. האם הוא נופל מהר יותר?',
  'drop-weak': 'שחררו את המגנט החלש בצינור מתכת. מהר יותר או לאט יותר?',
};

export interface LenzLabProps {
  id: string;
  mode?: Mode;
  /** ring: magnet centre [m], velocity [m/s], N pole toward +x */
  x?: number;
  v?: number;
  northRight?: boolean;
  wrong?: boolean;
  /** offer the "wrong sign" toggle */
  showWrong?: boolean;
  /** tube: material, strong magnet, N pole down */
  tube?: TubeKind;
  strong?: boolean;
  northDown?: boolean;
  tasks?: string[];
}

interface Auto {
  from: number;
  to: number;
  speed: number;
  loop: boolean;
}

interface State {
  mode: Mode;
  x: number;
  v: number;
  northRight: boolean;
  wrong: boolean;
  auto: Auto | null;
  tube: TubeKind;
  strong: boolean;
  northDown: boolean;
  released: boolean;
  /** seconds into the fall shown */
  tPlay: number;
}

const clampX = (x: number) => Math.min(X_MAX, Math.max(X_MIN, x));

/** where an approaching magnet stops: its face STOP_GAP before the ring, or centred if it is already in it */
function approachTarget(x: number): number {
  const u = x - XR;
  const gap = MAG.L / 2 + STOP_GAP;
  // a magnet already stopped at the gap stays there (floating-point: |u| may come out a hair under gap)
  return Math.abs(u) > gap - 1e-9 ? XR + Math.sign(u) * gap : XR;
}
const recedeTarget = (x: number): number => (x - XR <= 0 ? X_MIN : X_MAX);

/** The ring's physics for the state, with the wrong-sign world applied. */
function ringPhysics(s: State) {
  const mag = { ...MAG, NI: s.northRight ? MAG.NI : -MAG.NI };
  const u = s.x - XR;
  const r = ringResponse(mag, RING, u, s.v);
  const k = s.wrong ? -1 : 1;
  const flowing = Math.abs(r.current) >= I_MIN;
  const I = flowing ? k * r.current : 0;
  const F = flowing ? k * r.force : 0;
  return {
    u,
    flux: r.flux,
    dPhiDt: flowing ? r.dPhiDt : 0,
    emf: flowing ? k * r.emf : 0,
    I,
    F,
    heat: flowing ? r.heatRate : 0,
    hand: flowing ? F * s.v : 0,
    pole: facingPole(I, u),
    /** the magnet's pole that faces the ring */
    magnetFacing: (u < 0) === s.northRight ? ('N' as const) : ('S' as const),
  };
}

function fallRun(s: State): FallState[] {
  return simulateFall(MAGNETS[s.strong ? 'strong' : 'weak'], TUBES[s.tube], 0, DT, T_MAX, EXIT);
}

export default function LenzLab(props: LenzLabProps) {
  const init = (): State => ({
    mode: props.mode ?? 'ring',
    x: props.x ?? -0.12,
    v: props.v ?? 0,
    northRight: props.northRight ?? true,
    wrong: props.wrong ?? false,
    auto: null,
    tube: props.tube ?? 'copper',
    strong: props.strong ?? true,
    northDown: props.northDown ?? true,
    released: false,
    tPlay: 0,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const userActed = useRef(false);
  const drag = useRef<{ dx: number; lastX: number; lastT: number } | null>(null);
  const idle = useRef<number | undefined>(undefined);
  const visible = useRef(true);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const done = (t: string) => {
    if (has(t)) markTask(`${props.id}:${t}`);
  };

  const ph = ringPhysics(s);
  const run = useMemo(() => (s.mode === 'tube' ? fallRun(s) : []), [s.mode, s.tube, s.strong]);
  const tEnd = run.length ? run[run.length - 1].t : 0;
  const shown: FallState = s.released && run.length ? run[Math.min(run.length - 1, Math.floor(s.tPlay / DT))] : { t: 0, s: 0, v: 0, heat: 0 };
  const dip = MAGNETS[s.strong ? 'strong' : 'weak'];
  const tube = TUBES[s.tube];
  const brake = tubeDragAt(dip.m, tube, shown.s) * shown.v;
  const finished = s.released && s.tPlay >= tEnd;

  /* ---------------------------------------------------------------- steps */

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => {
          const mode: Mode = st.mode === 'ring' || st.mode === 'tube' ? st.mode : prev.mode;
          // x is the still picture; a looping step plays its motion from `from` (still mode keeps x)
          const still = typeof st.x === 'number' ? clampX(st.x) : prev.x;
          const v = typeof st.v === 'number' ? st.v : 0;
          const loops = v !== 0 && st.loop === true && motionAllowed();
          const x = loops && typeof st.from === 'number' ? clampX(st.from) : still;
          const towards = v !== 0 && Math.sign(v) === -Math.sign(x - XR);
          const auto: Auto | null = loops ? { from: x, to: towards ? approachTarget(x) : recedeTarget(x), speed: v, loop: true } : null;
          const tubeKind: TubeKind = st.tube === 'copper' || st.tube === 'aluminium' || st.tube === 'plastic' ? st.tube : prev.tube;
          return {
            ...prev,
            mode,
            x,
            v,
            auto,
            northRight: typeof st.northRight === 'boolean' ? st.northRight : prev.northRight,
            wrong: typeof st.wrong === 'boolean' ? st.wrong : false,
            tube: tubeKind,
            strong: typeof st.strong === 'boolean' ? st.strong : prev.strong,
            northDown: typeof st.northDown === 'boolean' ? st.northDown : prev.northDown,
            released: st.release === true,
            tPlay: 0,
          };
        });
      }),
    [props.id],
  );

  /* ---------------------------------------------------------------- motion loops */

  // the ring: a magnet gliding to a target (buttons), or a step's motion on a loop with a pause at the end
  useEffect(() => {
    if (s.mode !== 'ring' || !s.auto || !motionAllowed()) return;
    let raf = 0;
    let last = performance.now();
    let hold = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (!visible.current || !motionAllowed()) return;
      setS((prev) => {
        const a = prev.auto;
        if (!a) return prev;
        if (prev.v === 0) {
          hold += dt;
          if (hold < 0.8) return prev;
          hold = 0;
          return { ...prev, x: a.from, v: a.speed };
        }
        const x = prev.x + prev.v * dt;
        const past = (prev.v > 0 && x >= a.to) || (prev.v < 0 && x <= a.to);
        if (!past) return { ...prev, x };
        return a.loop ? { ...prev, x: a.to, v: 0 } : { ...prev, x: a.to, v: 0, auto: null };
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.mode, s.auto]);

  // the tube: play the precomputed fall in real time; still mode shows its end at once
  useEffect(() => {
    if (s.mode !== 'tube' || !s.released || s.tPlay >= tEnd) return;
    if (!motionAllowed()) {
      setS((prev) => ({ ...prev, tPlay: tEnd }));
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (!motionAllowed()) {
        setS((prev) => ({ ...prev, tPlay: tEnd }));
        return;
      }
      if (!visible.current) return;
      setS((prev) => (prev.tPlay >= tEnd ? prev : { ...prev, tPlay: Math.min(tEnd, prev.tPlay + dt) }));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.mode, s.released, tEnd, s.tPlay >= tEnd]);

  useEffect(() => () => window.clearTimeout(idle.current), []);

  /* ---------------------------------------------------------------- user actions */

  /** tasks for a ring state the learner produced (never a step's state) */
  const ringTasks = (next: State, prevX: number) => {
    const p = ringPhysics(next);
    const near = Math.abs(p.u) < TASK_U;
    if (Math.abs(next.v) >= TASK_V && near) {
      const towards = Math.sign(next.v) === -Math.sign(p.u);
      if (next.wrong) done('wrong');
      else if (towards && p.magnetFacing === 'N') done('approach');
      else if (towards && p.magnetFacing === 'S') done('flip');
      else if (!towards && p.magnetFacing === 'N') done('recede');
    }
    if (Math.sign(prevX - XR) * Math.sign(next.x - XR) < 0) done('through');
  };

  const act = (patch: Partial<State>, opts: { buttons?: boolean } = {}) => {
    userActed.current = true;
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (next.mode === 'ring' && (opts.buttons || patch.x !== undefined)) {
        // a button press is checked at the motion's start: closer is closer wherever the magnet is
        const p = ringPhysics(next);
        if (opts.buttons && Math.abs(next.v) > 0) {
          const towards = Math.sign(next.v) === -Math.sign(p.u);
          if (next.wrong) done('wrong');
          else if (towards && p.magnetFacing === 'N') done('approach');
          else if (towards && p.magnetFacing === 'S') done('flip');
          else if (!towards && p.magnetFacing === 'N') done('recede');
        } else ringTasks(next, prev.x);
      }
      return next;
    });
  };

  const move = (dir: 'closer' | 'away') => {
    const to = dir === 'closer' ? approachTarget(s.x) : recedeTarget(s.x);
    const u = s.x - XR;
    if (!motionAllowed() && Math.abs(to - s.x) < 1e-9 && u !== 0) {
      // already there: still mode shows the instant of moving on from here
      act({ v: (dir === 'closer' ? -1 : 1) * Math.sign(u) * V0, auto: null }, { buttons: true });
      return;
    }
    if (Math.abs(to - s.x) < 1e-9) {
      setLive(dir === 'closer' ? 'המגנט כבר צמוד לטבעת.' : 'המגנט כבר בקצה.');
      return;
    }
    const v = Math.sign(to - s.x) * V0;
    // still mode cannot show the motion: it shows one instant of it, close to the ring where the effect is large
    if (motionAllowed()) act({ v, auto: { from: s.x, to, speed: v, loop: false } }, { buttons: true });
    else act({ v, auto: null, x: dir === 'closer' ? to : s.x }, { buttons: true });
  };

  const stopSoon = (ms: number) => {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => setS((prev) => (prev.auto ? prev : { ...prev, v: 0 })), ms);
  };

  const magnetHit = (v: View, sx: number, sy: number): boolean => {
    const [wx, wy] = toWorld(v, sx, sy);
    const pad = 10 / v.ppm;
    return Math.abs(wx - s.x) <= MAG.L / 2 + pad && Math.abs(wy) <= MAG.R + pad;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (s.mode !== 'ring' || !v || !magnetHit(v, e.offsetX, e.offsetY)) return;
    const [wx] = toWorld(v, e.offsetX, e.offsetY);
    drag.current = { dx: s.x - wx, lastX: s.x, lastT: performance.now() };
    userActed.current = true;
    setS((prev) => ({ ...prev, auto: null, v: 0 }));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx] = toWorld(v, e.offsetX, e.offsetY);
    const x = clampX(wx + d.dx);
    const now = performance.now();
    const dt = Math.max(0.008, (now - d.lastT) / 1000);
    const vInst = Math.max(-1.5, Math.min(1.5, (x - d.lastX) / dt));
    d.lastX = x;
    d.lastT = now;
    setS((prev) => {
      const next = { ...prev, x, v: 0.6 * vInst + 0.4 * prev.v, auto: null };
      ringTasks(next, prev.x);
      return next;
    });
    stopSoon(140);
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    window.clearTimeout(idle.current);
    setS((prev) => ({ ...prev, v: 0 }));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (s.mode !== 'ring') return;
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.03 : 0.01;
    act({ x: clampX(s.x + d * step), v: d * V0, auto: null });
    stopSoon(450);
  };

  const release = () => {
    const next = { ...s, released: true, tPlay: 0 };
    userActed.current = true;
    if (s.tube === 'plastic') done('drop-plastic');
    else {
      if (s.tube === 'copper' && s.strong && s.northDown) done('drop-copper');
      if (!s.northDown) done('drop-flipped');
      if (!s.strong) done('drop-weak');
    }
    setS(next);
  };

  /* ---------------------------------------------------------------- words */

  const side = (sign: number) => (sign > 0 ? 'ימינה' : 'שמאלה');
  const moving = ph.I !== 0;
  const cwFromMagnet = (ph.I > 0) === (ph.u < 0);
  const forceAway = moving && Math.sign(ph.F) === -Math.sign(ph.u);

  const describeRing = (): string => {
    const where = `המגנט ${Math.abs(ph.u) < 1e-9 ? 'בתוך הטבעת' : `${sci(Math.abs(ph.u) * 100)} סנטימטרים ${ph.u < 0 ? 'משמאל לטבעת' : 'מימין לטבעת'}`}, הקוטב ${ph.magnetFacing === 'N' ? 'הצפוני' : 'הדרומי'} שלו פונה אליה`;
    if (!moving) return `${where}. המגנט במנוחה, ואין זרם מושרה.`;
    return `${where}, והוא ${Math.sign(s.v) === -Math.sign(ph.u) ? 'מתקרב' : 'מתרחק'}. הזרם המושרה ${sci(Math.abs(ph.I))} אמפר, ${cwFromMagnet ? 'עם כיוון השעון' : 'נגד כיוון השעון'} במבט מצד המגנט; הצד שפונה למגנט הוא קוטב ${ph.pole === 'N' ? 'צפוני' : 'דרומי'}, והטבעת ${forceAway ? 'נדחית ממנו' : 'נמשכת אליו'}.`;
  };

  const describeTube = (): string => {
    const head = `צינור ${TUBE_NAME[s.tube]}, מגנט ${s.strong ? 'חזק' : 'חלש'}.`;
    if (!s.released) return `${head} המגנט מוחזק בפתח הצינור.`;
    if (finished) return `${head} המגנט יצא מהצינור אחרי ${sci(tEnd)} שניות.`;
    return `${head} המגנט נופל במהירות ${sci(shown.v)} מטר לשנייה.`;
  };

  const describe = () => (s.mode === 'ring' ? describeRing() : describeTube());

  useEffect(() => {
    if (!userActed.current || drag.current) return;
    setLive(describe());
  }, [s.x, s.v === 0, s.northRight, s.wrong, s.mode, s.tube, s.strong, s.northDown, s.released, finished]);

  /* ---------------------------------------------------------------- field lines (magnet frame, N to the right) */

  const lines = useMemo(() => {
    const bar: BarMagnet = { x: 0, y: 0, angle: 0, L: MAG.L, R: MAG.R, NI: MAG.NI };
    const f = (x: number, y: number) => magnetsFieldAt([bar], x, y);
    const bounds = { xmin: -0.9, xmax: 0.9, ymin: -0.3, ymax: 0.3 };
    const out: Vec2[][] = [];
    const SEEDS = 7;
    for (let k = 0; k < SEEDS; k++) {
      const yy = -0.7 * MAG.R + (k * 1.4 * MAG.R) / (SEEDS - 1);
      const fwd = traceLine(f, [0, yy], { bounds, step: 0.003, maxSteps: 1400, direction: 1 });
      if (fwd.end === 'closed') {
        out.push(fwd.points);
        continue;
      }
      const back = traceLine(f, [0, yy], { bounds, step: 0.003, maxSteps: 1400, direction: -1 });
      out.push([...back.points.slice(1).reverse(), ...fwd.points]);
    }
    return out;
  }, []);

  /* ---------------------------------------------------------------- drawing: ring */

  const text = (ctx: CanvasRenderingContext2D, p: Palette, t: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center', size = 13, dir: CanvasDirection = 'ltr') => {
    ctx.save();
    ctx.font = `600 ${size}px ${p.fontUi}`;
    ctx.fillStyle = color;
    ctx.direction = dir;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = withAlpha(p.paper, 0.85);
    ctx.strokeText(t, x, y);
    ctx.fillText(t, x, y);
    ctx.restore();
  };

  /** a bar magnet drawn as a rectangle: N half filled, S half hollow, letters on both */
  const barMagnet = (ctx: CanvasRenderingContext2D, p: Palette, cx: number, cy: number, halfLen: number, halfW: number, northPositive: boolean, vertical: boolean) => {
    const nSign = northPositive ? 1 : -1;
    // screen: horizontal +x right; vertical: "positive" end is down (the tube's N-down default)
    const rect = (sgn: number): [number, number, number, number] =>
      vertical ? [cx - halfW, sgn > 0 ? cy : cy - halfLen, 2 * halfW, halfLen] : [sgn > 0 ? cx : cx - halfLen, cy - halfW, halfLen, 2 * halfW];
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = p.bfield;
    ctx.fillStyle = withAlpha(p.paper2, 0.95);
    ctx.fillRect(...rect(-nSign));
    ctx.strokeRect(...rect(-nSign));
    ctx.fillStyle = withAlpha(p.bfield, 0.3);
    ctx.fillRect(...rect(nSign));
    ctx.strokeRect(...rect(nSign));
    ctx.restore();
    const size = Math.max(11, Math.min(16, halfW * 1.1));
    const off = halfLen * 0.55;
    const at = (sgn: number): [number, number] => (vertical ? [cx, cy + sgn * off] : [cx + sgn * off, cy]);
    text(ctx, p, 'N', ...at(nSign), p.ink, 'center', size);
    text(ctx, p, 'S', ...at(-nSign), p.ink2, 'center', size);
  };

  const drawRing = ({ ctx, view, palette: p }: FrameInfo) => {
    const ppm = view.ppm;
    // the magnet's field lines, translated with it (mirrored when its N faces left)
    const mirror = s.northRight ? 1 : -1;
    for (const l of lines) {
      const pts = l.map(([x, y]) => toScreen(view, s.x + mirror * x, y));
      polyline(ctx, pts, p.bfield, 1.3, { alpha: 0.55 });
      let acc = 0;
      let next = 40;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0];
        const dy = pts[i][1] - pts[i - 1][1];
        const seg = Math.hypot(dx, dy);
        while (seg > 0 && acc + seg >= next) {
          const f = (next - acc) / seg;
          chevron(ctx, pts[i - 1][0] + dx * f, pts[i - 1][1] + dy * f, dx / seg, dy / seg, 4, withAlpha(p.bfield, 0.8));
          next += 90;
        }
        acc += seg;
      }
    }

    const [rx, ry] = toScreen(view, XR, 0);
    const aPx = RING.a * ppm;
    const ex = Math.max(5, aPx * 0.28);
    // far half of the ring, dashed
    ctx.save();
    ctx.strokeStyle = withAlpha(p.current, 0.45);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(rx, ry, ex, aPx, 0, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();
    ctx.restore();

    // the magnet
    const [mx, my] = toScreen(view, s.x, 0);
    barMagnet(ctx, p, mx, my, (MAG.L / 2) * ppm, MAG.R * ppm, s.northRight, false);

    // near half of the ring, solid, with the current's direction on it
    ctx.save();
    ctx.strokeStyle = p.current;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.ellipse(rx, ry, ex, aPx, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.restore();
    if (moving) {
      // positive (right-handed about +x) runs down the near side
      chevron(ctx, rx + ex, ry, 0, ph.I > 0 ? 1 : -1, 7, p.ink);
      const r = 5 + 7 * Math.min(1, Math.abs(ph.I) / I_REF);
      depthGlyph(ctx, rx, ry - aPx, r, ph.I > 0 ? 'out' : 'in', p.current, { fill: p.paper, width: 2 });
      depthGlyph(ctx, rx, ry + aPx, r, ph.I > 0 ? 'in' : 'out', p.current, { fill: p.paper, width: 2 });
      // the induced field at the centre: hollow arrow along the axis
      const len = Math.max(18, aPx * 1.3);
      const dirB = ph.I > 0 ? 1 : -1;
      ctx.save();
      ctx.setLineDash([3, 3]);
      arrow(ctx, rx - (dirB * len) / 2, ry, rx + (dirB * len) / 2, ry, { color: p.bfield, width: 3, head: 10 });
      ctx.restore();
      if (view.w >= 480) text(ctx, p, 'השדה המושרה', rx + 4, ry - aPx - 22, p.bfield, 'left', 12, 'rtl');
      // the force on the ring, under it
      const fy = ry + aPx + 26;
      const fl = 18 + 46 * Math.min(1, Math.abs(ph.F) / F_REF);
      const fd = ph.F > 0 ? 1 : -1;
      arrow(ctx, rx, fy, rx + fd * fl, fy, { color: p.force, width: 3, head: 11 });
      const fLabel = `F = ${sci(Math.abs(ph.F), 2)} N`;
      // beside the arrow when it fits, under it on a narrow screen
      if (fd > 0 ? rx + fl + 100 < view.w : rx - fl - 100 > 0) text(ctx, p, fLabel, rx + fd * (fl + 8), fy, p.force, fd > 0 ? 'left' : 'right', 12);
      else text(ctx, p, fLabel, Math.min(view.w - 50, Math.max(50, rx + (fd * fl) / 2)), fy + 16, p.force, 'center', 12);
      // the magnet's velocity, above it
      const vy = my - MAG.R * ppm - 16;
      const vl = 14 + 30 * Math.min(1, Math.abs(s.v) / V0);
      const vd = s.v > 0 ? 1 : -1;
      arrow(ctx, mx, vy, mx + vd * vl, vy, { color: p.ink, width: 2.2, head: 9 });
      text(ctx, p, 'v', mx + vd * (vl + 8), vy, p.ink, 'center', 13);
    }
    // the ring seen from the magnet's side: a small face-on view
    drawFaceOn(ctx, p, view);
    if (s.wrong) text(ctx, p, 'עולם הפוך: לא כך זה בטבע', view.w / 2, 16, p.accent, 'center', 14, 'rtl');
  };

  const drawFaceOn = (ctx: CanvasRenderingContext2D, p: Palette, view: View) => {
    const R = Math.max(16, Math.min(26, view.w * 0.04));
    const cx = 14 + R + 4;
    const cy = 30 + R;
    ctx.save();
    ctx.fillStyle = withAlpha(p.paper, 0.9);
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect?.(8, 8, 2 * R + 28, 2 * R + 46, 8);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = p.current;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (moving) {
      // a chevron on the circle: clockwise on screen is the direction of increasing canvas angle
      const cw = cwFromMagnet;
      for (const ang of [-Math.PI / 2, Math.PI / 2]) {
        const x = cx + R * Math.cos(ang);
        const y = cy + R * Math.sin(ang);
        const tx = cw ? -Math.sin(ang) : Math.sin(ang);
        const ty = cw ? Math.cos(ang) : -Math.cos(ang);
        arrow(ctx, x - tx * 7, y - ty * 7, x + tx * 7, y + ty * 7, { color: p.ink, width: 2, head: 8 });
      }
      text(ctx, p, ph.pole ?? '', cx, cy, p.bfield, 'center', 16);
    } else text(ctx, p, '–', cx, cy, p.ink3, 'center', 14);
    text(ctx, p, 'מצד המגנט', cx, cy + R + 14, p.ink2, 'center', 11, 'rtl');
  };

  /* ---------------------------------------------------------------- drawing: tube */

  const drawTube = ({ ctx, view, palette: p }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const top = H * 0.08;
    const bottom = H * 0.9;
    const scale = (bottom - top) / tube.length;
    const conducting = tube.sigma > 0;
    const wallColor = conducting ? p.equip : p.ink3;

    // A: the whole tube (drawn wider than it is)
    const ax = W * 0.075;
    const aw = Math.max(7, W * 0.022);
    ctx.save();
    ctx.fillStyle = withAlpha(wallColor, conducting ? 0.18 : 0.08);
    ctx.fillRect(ax - aw, top, 2 * aw, bottom - top);
    ctx.strokeStyle = wallColor;
    ctx.lineWidth = conducting ? 2.5 : 1.5;
    ctx.setLineDash(conducting ? [] : [5, 3]);
    ctx.beginPath();
    ctx.moveTo(ax - aw, top);
    ctx.lineTo(ax - aw, bottom);
    ctx.moveTo(ax + aw, top);
    ctx.lineTo(ax + aw, bottom);
    ctx.stroke();
    ctx.restore();
    const my = Math.min(H - 6, top + shown.s * scale);
    ctx.save();
    ctx.fillStyle = withAlpha(p.bfield, 0.6);
    ctx.fillRect(ax - aw * 0.7, my - 5, aw * 1.4, 10);
    ctx.restore();
    text(ctx, p, TUBE_NAME[s.tube], ax, bottom + 14, p.ink2, 'center', 12, 'rtl');
    text(ctx, p, `${sci(tube.length * 100)} cm`, ax + aw + 6, (top + bottom) / 2, p.ink3, 'left', 11);

    // B: the close-up around the magnet
    const bx0 = W * 0.17;
    const bx1 = W * 0.52;
    const cx = (bx0 + bx1) / 2;
    const cy = H * 0.5;
    const aPx = (bx1 - bx0) * 0.3;
    const zoom = aPx / tube.a;
    const boxTop = H * 0.06;
    const boxBottom = H * 0.94;
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect?.(bx0, boxTop, bx1 - bx0, boxBottom - boxTop, 10);
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(ax + aw, my);
    ctx.lineTo(bx0, cy);
    ctx.stroke();
    ctx.restore();
    // the walls in the close-up: where the tube is, given the magnet's depth
    const yTopWall = cy - shown.s * zoom;
    const yBottomWall = cy + (tube.length - shown.s) * zoom;
    const wy0 = Math.max(boxTop + 4, yTopWall);
    const wy1 = Math.min(boxBottom - 4, yBottomWall);
    if (wy1 > wy0) {
      ctx.save();
      ctx.fillStyle = withAlpha(wallColor, conducting ? 0.22 : 0.1);
      const ww = Math.max(5, tube.wall * zoom);
      ctx.fillRect(cx - aPx - ww / 2, wy0, ww, wy1 - wy0);
      ctx.fillRect(cx + aPx - ww / 2, wy0, ww, wy1 - wy0);
      ctx.strokeStyle = wallColor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash(conducting ? [] : [5, 3]);
      ctx.strokeRect(cx - aPx - ww / 2, wy0, ww, wy1 - wy0);
      ctx.strokeRect(cx + aPx - ww / 2, wy0, ww, wy1 - wy0);
      ctx.restore();
    }
    // eddy currents in the wall: ⊙/⊗, size ∝ current per unit height
    if (conducting && shown.v > 0) {
      const vT = tubeTerminalSpeed(dip, tube);
      let Kref = 0;
      for (let k = 1; k <= 20; k++) Kref = Math.max(Kref, Math.abs(wallCurrentDensity(dip, tube, 0.2, vT, 0.2 + (k * tube.a) / 10, true)));
      const stepZ = tube.a / 2;
      for (let k = -6; k <= 6; k++) {
        if (k === 0) continue;
        const z = shown.s + k * stepZ;
        if (z < 0 || z > tube.length) continue;
        const K = wallCurrentDensity(dip, tube, shown.s, shown.v, z, s.northDown);
        const frac = Math.min(1.3, Math.abs(K) / Kref);
        if (frac < 0.06) continue;
        const r = 3 + 7 * Math.min(1, frac);
        const y = cy + k * stepZ * zoom;
        // anticlockwise from above: ⊗ on the right wall, ⊙ on the left
        depthGlyph(ctx, cx - aPx, y, r, K > 0 ? 'out' : 'in', p.current, { fill: p.paper, width: 1.6 });
        depthGlyph(ctx, cx + aPx, y, r, K > 0 ? 'in' : 'out', p.current, { fill: p.paper, width: 1.6 });
      }
    }
    // the magnet (positive end down when N is down)
    barMagnet(ctx, p, cx, cy, (MAG_LEN / 2) * zoom, MAG_RAD * zoom, s.northDown, true);
    // forces: the weight down, the braking up (same scale: F = mg at full length)
    const fullLen = (boxBottom - cy) * 0.55;
    const wLen = fullLen;
    arrow(ctx, cx + aPx * 0.35, cy, cx + aPx * 0.35, cy + wLen, { color: p.force, width: 2.6, head: 10 });
    text(ctx, p, 'mg', cx + aPx * 0.35 + 8, cy + wLen - 6, p.force, 'left', 12);
    const bLen = Math.min(1.4, brake / (dip.mass * G)) * fullLen;
    if (bLen > 3) {
      arrow(ctx, cx - aPx * 0.35, cy, cx - aPx * 0.35, cy - bLen, { color: p.force, width: 2.6, head: 10 });
      text(ctx, p, 'F', cx - aPx * 0.35 - 8, cy - bLen + 6, p.force, 'right', 12);
    }
    text(ctx, p, 'מקרוב', cx, boxTop + 12, p.ink2, 'center', 11, 'rtl');

    // C: the graph v(t)
    const gTop = Math.max(H * 0.05, 46);
    const gb = insetBox({ x: W * 0.56, y: gTop, w: W * 0.43, h: H * 0.91 - gTop }, { l: 46, r: 6, t: 6, b: 40 });
    const vmax = Math.max(...run.map((r) => r.v), 1e-6) * 1.15;
    const plot = makePlot(gb, { min: 0, max: Math.max(tEnd, 1e-3), label: 'הזמן (s)' }, { min: 0, max: vmax, label: 'המהירות (m/s)' });
    drawAxes(ctx, plot, p);
    if (conducting) {
      const vT = tubeTerminalSpeed(dip, tube);
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(gb.x, plot.py(vT));
      ctx.lineTo(gb.x + gb.w, plot.py(vT));
      ctx.stroke();
      ctx.restore();
      text(ctx, p, 'v_T', gb.x + gb.w - 4, plot.py(vT) - 10, p.ink2, 'right', 12);
    }
    if (s.released) {
      const n = Math.min(run.length, Math.floor(s.tPlay / DT) + 1);
      const every = Math.max(1, Math.floor(n / 400));
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i += every) pts.push([plot.px(run[i].t), plot.py(run[i].v)]);
      pts.push([plot.px(shown.t), plot.py(shown.v)]);
      polyline(ctx, pts, p.accent, 2.4);
    }
  };

  const draw = (f: FrameInfo) => {
    if (s.mode === 'ring') drawRing(f);
    else drawTube(f);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_W / RING_ASPECT,
    animate: false,
  });
  useEffect(invalidate, [s, run]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const io = new IntersectionObserver((es) => {
      visible.current = es.some((e) => e.isIntersecting);
    });
    io.observe(c);
    return () => io.disconnect();
  }, []);

  /* ---------------------------------------------------------------- panel */

  const ringReadout = () => {
    const facing = ph.magnetFacing === 'N' ? 'הצפוני' : 'הדרומי';
    if (!moving)
      return (
        <>
          <span>
            השטף דרך הטבעת: <b class="q">Φ = {sci(Math.abs(ph.flux))} Wb</b> ({side(ph.flux)}). הקוטב {facing} של המגנט פונה אל הטבעת.
          </span>
          <span>המגנט במנוחה: השטף לא משתנה, ולכן אין זרם מושרה ואין כוח על הטבעת.</span>
        </>
      );
    const grows = Math.sign(ph.dPhiDt) === Math.sign(ph.flux);
    return (
      <>
        <span>
          ① השדה של המגנט בטבעת: {side(ph.flux)} · ② השטף <b class="q">{sci(Math.abs(ph.flux))} Wb</b> {grows ? 'גדל' : 'קטן'} · ③ השדה המושרה: {side(ph.I)},{' '}
          {s.wrong ? 'עם השינוי (עולם הפוך)' : grows ? 'נגד השדה של המגנט' : 'באותו כיוון כמו השדה של המגנט'} · ④ הזרם: {cwFromMagnet ? 'עם כיוון השעון' : 'נגד כיוון השעון'} במבט מצד המגנט,{' '}
          <b class="q">I = {sci(Math.abs(ph.I), 2)} A</b>
        </span>
        <span>
          הצד של הטבעת שפונה אל הקוטב {facing}: קוטב {ph.pole === 'N' ? 'צפוני (N)' : 'דרומי (S)'}. הכוח על הטבעת <b class="q">F = {sci(Math.abs(ph.F), 2)} N</b>,{' '}
          {forceAway ? 'הרחק מהמגנט: דחייה' : 'אל המגנט: משיכה'}.
        </span>
        {s.wrong ? (
          <span>
            הטבעת מושכת את המגנט ועושה בשבילכם עבודה, <b class="q">{sci(Math.abs(ph.hand), 2)} W</b>, ובכל זאת מתחממת, <b class="q">I²R = {sci(ph.heat, 2)} W</b>. אנרגיה נוצרת מכלום: זה לא אפשרי.
          </span>
        ) : (
          <span>
            ההספק שאתם משקיעים כדי להזיז את המגנט: <b class="q">F·v = {sci(ph.hand, 2)} W</b>. החום בטבעת: <b class="q">I²R = {sci(ph.heat, 2)} W</b>. שווים.
          </span>
        )}
      </>
    );
  };

  const tubeReadout = () => {
    const conducting = tube.sigma > 0;
    const vT = conducting ? tubeTerminalSpeed(dip, tube) : Infinity;
    const head = (
      <span>
        צינור {TUBE_NAME[s.tube]}, מגנט {s.strong ? 'חזק' : 'חלש'} (<b class="q">{sci(dip.mass * 1000)} g</b>), הקוטב הצפוני {s.northDown ? 'למטה' : 'למעלה'}. המשקל{' '}
        <b class="q">mg = {sci(dip.mass * G)} N</b>
      </span>
    );
    if (!s.released)
      return (
        <>
          {head}
          <span>המגנט מוחזק בפתח הצינור. שחררו אותו.</span>
        </>
      );
    return (
      <>
        {head}
        <span>
          <b class="q">t = {sci(shown.t)} s</b> · המהירות <b class="q">v = {sci(shown.v)} m/s</b> · כוח הבלימה <b class="q">F = {sci(brake)} N</b>
        </span>
        {finished && conducting && (
          <span>
            המגנט יצא מהצינור אחרי <b class="q">{sci(tEnd)} s</b>. רוב הדרך הוא נפל במהירות קבועה, המהירות הסופית <b class="q">v_T = {sci(vT)} m/s</b>, שבה כוח הבלימה שווה למשקל. החום שהתפתח בצינור:{' '}
            <b class="q">{sci(shown.heat)} J</b>.
          </span>
        )}
        {finished && !conducting && (
          <span>
            בפלסטיק אין זרמים מושרים: המגנט נפל נפילה חופשית, ויצא אחרי <b class="q">{sci(tEnd)} s</b>.
          </span>
        )}
      </>
    );
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${describe()}`}
      canvasRef={canvasRef}
      aspect={s.mode === 'ring' ? RING_ASPECT : TUBE_ASPECT}
      live={live}
      tasks={tasks}
      cursor={s.mode === 'ring' ? 'grab' : 'default'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      onReset={() => {
        userActed.current = false;
        drag.current = null;
        window.clearTimeout(idle.current);
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={s.mode === 'ring' ? ringReadout() : tubeReadout()}
      controls={
        s.mode === 'ring' ? (
          <>
            <div class="group" role="group" aria-label="תנועת המגנט">
              <button type="button" class="toggle" onClick={() => move('closer')}>
                קרבו את המגנט
              </button>
              <button type="button" class="toggle" onClick={() => move('away')}>
                הרחיקו את המגנט
              </button>
              <button type="button" class="toggle" onClick={() => act({ northRight: !s.northRight, v: 0, auto: null })}>
                הפכו את המגנט
              </button>
            </div>
            {props.showWrong && (
              <div class="group" role="group" aria-label="ניסוי מחשבתי">
                <Toggle label='מה אם הזרם הפוך?' on={s.wrong} onChange={(w) => act({ wrong: w })} />
              </div>
            )}
          </>
        ) : (
          <>
            <div class="group" role="group" aria-label="הצינור">
              {(['copper', 'aluminium', 'plastic'] as const).map((k) => (
                <button type="button" key={k} class={`toggle ${s.tube === k ? 'on' : ''}`} aria-pressed={s.tube === k} onClick={() => act({ tube: k, released: false, tPlay: 0 })}>
                  {TUBE_NAME[k]}
                </button>
              ))}
            </div>
            <div class="group" role="group" aria-label="המגנט">
              <button type="button" class={`toggle ${s.strong ? 'on' : ''}`} aria-pressed={s.strong} onClick={() => act({ strong: true, released: false, tPlay: 0 })}>
                מגנט חזק
              </button>
              <button type="button" class={`toggle ${!s.strong ? 'on' : ''}`} aria-pressed={!s.strong} onClick={() => act({ strong: false, released: false, tPlay: 0 })}>
                מגנט חלש
              </button>
              <button type="button" class="toggle" onClick={() => act({ northDown: !s.northDown, released: false, tPlay: 0 })}>
                הפכו את המגנט
              </button>
            </div>
            <div class="group" role="group" aria-label="הנפילה">
              <button type="button" class="toggle" onClick={release}>
                שחררו את המגנט
              </button>
              <button type="button" class="toggle" onClick={() => act({ released: false, tPlay: 0 })}>
                החזירו למעלה
              </button>
            </div>
          </>
        )
      }
    />
  );
}
