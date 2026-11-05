/**
 * Maxwell's four laws in integral form (lesson 5.8). Above: a strip of the laws, rendered by the wrapper
 * (KaTeX at build time) and passed in as children; a click on a law opens its scene and marks its two
 * sides. Under the strip, what each side measures and what makes it nonzero. Below: one scene per law,
 * each with the closed surface or the closed path the law speaks about, and both sides of the law in the
 * readout, computed independently from src/physics (maxwellfour.ts, which builds on electrostatics.ts,
 * maxwell.ts, magnetism.ts, displacement.ts and waves.ts):
 * - gauss-e: two point charges and a sphere (seen as a circle) the learner drags and resizes; the flux is
 *   summed over the sphere, and compared with Q_in/ε₀.
 * - gauss-b: a bar magnet (the field of a long flat coil) and a cube the learner drags and resizes; the
 *   flux that leaves and the flux that enters are summed apart.
 * - faraday: the core of a long solenoid with B out of the page, changing at a rate the learner sets, and
 *   a circular path walked counter-clockwise; the circulation of the induced E against −dΦ_B/dt.
 * - ampere: a capacitor charging through a wire, seen from the side, and a circular path around the wire
 *   or in the gap, with a flat surface or a bag through the gap; Ampère's law of lesson 4.4 against the
 *   circulation, with and without Maxwell's term.
 * - wave: a plane wave in vacuum, E and B in phase, moving at c; the frequency slider places it in the
 *   spectrum, and λ = c/f. The wave is drawn in slow motion and not to scale.
 * Tasks tick only on the learner's own actions (`user`), never on a text step.
 */

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { EPS0, MU0 } from '~/physics/constants';
import { fieldAt, type PointCharge } from '~/physics/electrostatics';
import { COIL_H, COIL_K, COIL_W, flatCoilB, inducedE, SOL_R } from '~/physics/maxwell';
import {
  ampereReading,
  BANDS,
  bandOf,
  CHARGING_I,
  CORE_B,
  cubeFlux,
  faradayCircle,
  PLATE_A,
  SCENE_CHARGES,
  sphereGauss,
  vacuumWavelength,
  waveSpeed,
  type Band,
} from '~/physics/maxwellfour';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { arrow, chargeDisc, depthGlyph, paperGrid, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';
import './MaxwellFour.css';

const WORLD_W = 0.24;
const WORLD_H = 0.16;
const ASPECT = WORLD_W / WORLD_H;
const GRID = 0.02;

type Vec2 = [number, number];
export type Law = 'gauss-e' | 'gauss-b' | 'faraday' | 'ampere' | 'wave';
const LAWS: Law[] = ['gauss-e', 'gauss-b', 'faraday', 'ampere', 'wave'];

const LAW_NAME: Record<Law, string> = {
  'gauss-e': 'חוק גאוס',
  'gauss-b': 'חוק גאוס למגנטיות',
  faraday: 'חוק פאראדיי',
  ampere: 'חוק אמפר-מקסוול',
  wave: 'גל אלקטרומגנטי',
};

const BAND_NAME: Record<Band, string> = {
  radio: 'גלי רדיו',
  microwave: 'מיקרוגל',
  infrared: 'תת-אדום',
  visible: 'אור נראה',
  ultraviolet: 'על-סגול',
  xray: 'קרני רנטגן',
  gamma: 'קרינת גמא',
};

/** what the two sides of each law measure, and what makes each one nonzero */
const SAYS: Record<Law, ComponentChildren> = {
  'gauss-e': (
    <>
      <b>צד שמאל:</b> השטף החשמלי דרך משטח סגור, כמה שדה יוצא ממנו פחות כמה נכנס אליו. <b>צד ימין:</b> המטען הכלוא בתוך המשטח, חלקי{' '}
      <span class="q">ε₀</span>. השטף שונה מאפס רק כשבפנים יש מטען נטו (שיעור 1.7).
    </>
  ),
  'gauss-b': (
    <>
      <b>צד שמאל:</b> השטף המגנטי דרך משטח סגור. <b>צד ימין:</b> אפס, תמיד. קווי השדה המגנטי סגורים: כל קו שנכנס למשטח יוצא ממנו, ואין קוטב מגנטי
      בודד שקווים יתחילו בו (שיעור 5.1).
    </>
  ),
  faraday: (
    <>
      <b>צד שמאל:</b> הסכום של <span class="q">E∥·Δl</span> סביב מסלול סגור: הכא״מ המושרה. <b>צד ימין:</b> מינוס קצב השינוי של השטף המגנטי דרך משטח
      שהמסלול הוא השפה שלו. הוא שונה מאפס רק כשהשטף משתנה (שיעורים 5.2 ו-5.6).
    </>
  ),
  ampere: (
    <>
      <b>צד שמאל:</b> הסכום של <span class="q">B∥·Δl</span> סביב מסלול סגור. <b>צד ימין:</b> <span class="q">μ₀</span> כפול זרם המטענים שעובר דרך משטח
      שהמסלול הוא השפה שלו (שיעור 4.4), ועוד התוספת של מקסוול: <span class="q">μ₀ε₀</span> כפול קצב השינוי של השטף החשמלי דרך אותו משטח.
    </>
  ),
  wave: (
    <>
      בריק אין מטען ואין זרם, ונשארים שני חוקים: <b>שדה מגנטי שמשתנה יוצר שדה חשמלי</b> (פאראדיי), ו<b>שדה חשמלי שמשתנה יוצר שדה מגנטי</b> (התוספת של
      מקסוול). יחד הם מקיימים זה את זה, וזה גל שנע במהירות <span class="q">c = 1/√(μ₀ε₀)</span>.
    </>
  ),
};

const TASK_LABEL: Record<string, string> = {
  'gauss-both': 'חוק גאוס: הגדילו או הזיזו את המשטח הסגור כך שיקיף את שני המטענים. האם השטף גדל, כמו המשטח?',
  'b-pole': 'חוק גאוס למגנטיות: הזיזו את הקובייה כך שתקיף את הקוטב הצפוני של המגנט. מה השטף נטו?',
  'faraday-shrink': 'חוק פאראדיי: הפכו את קצב השינוי לשלילי, כך שהשדה המגנטי יקטן. מה קורה לשדה החשמלי המושרה?',
  'faraday-beyond': 'חוק פאראדיי: הגדילו את המסלול כך שיקיף את כל הליבה. האם הסכום ממשיך לגדול?',
  'ampere-bag': 'חוק אמפר-מקסוול: כבו את התוספת של מקסוול, והחליפו את המשטח השטוח בשקית שעוברת בין הלוחות. האם החוק עדיין מתאים לשדה?',
  'ampere-fix': 'עם השקית: הדליקו את התוספת של מקסוול. מה השתנה?',
  'ampere-gap': 'העבירו את המסלול אל בין הלוחות, שם אין שום זרם של מטענים. האם יש שם שדה מגנטי?',
  'wave-light': 'גל: שנו את התדירות עד שהגל יהיה אור נראה. מה אורך הגל, ומה המהירות?',
  'wave-grid': 'גל: קבעו את התדירות של רשת החשמל, 50 הרץ. מה אורך הגל עכשיו?',
};

export interface MaxwellFourProps {
  id: string;
  /** the scene shown first */
  law?: Law;
  /** the laws in the strip, and the scenes the learner may switch to */
  laws?: Law[];
  /** gauss-e: sphere centre and radius [m] */
  sphere?: Vec2;
  R?: number;
  /** gauss-b: cube centre and side [m] */
  cube?: Vec2;
  a?: number;
  /** faraday: rate of change of B in the core [T/s], path centre and radius [m] */
  dBdt?: number;
  loop?: Vec2;
  r?: number;
  /** ampere: path around the wire or in the gap, the surface on it, Maxwell's term on, path radius [m] */
  at?: 'wire' | 'gap';
  surface?: 'flat' | 'bulge';
  maxwell?: boolean;
  rA?: number;
  /** wave: log₁₀ of the frequency in Hz */
  logf?: number;
  tasks?: string[];
  children?: ComponentChildren;
}

interface State {
  law: Law;
  sphere: Vec2;
  R: number;
  cube: Vec2;
  a: number;
  dBdt: number;
  loop: Vec2;
  r: number;
  at: 'wire' | 'gap';
  surface: 'flat' | 'bulge';
  maxwell: boolean;
  rA: number;
  logf: number;
}

function initial(p: MaxwellFourProps): State {
  const laws = p.laws ?? ['gauss-e', 'gauss-b', 'faraday', 'ampere'];
  return {
    law: p.law ?? laws[0],
    sphere: p.sphere ?? [-0.04, 0],
    R: p.R ?? 0.03,
    cube: p.cube ?? [0.06, 0.04],
    a: p.a ?? 0.03,
    dBdt: p.dBdt ?? 2,
    loop: p.loop ?? [0, 0],
    r: p.r ?? 0.03,
    at: p.at ?? 'wire',
    surface: p.surface ?? 'flat',
    maxwell: p.maxwell ?? false,
    rA: p.rA ?? 0.03,
    logf: p.logf ?? 8,
  };
}

const snap = (v: number, q = 0.0025) => Math.round(v / q) * q;
const clampAt = (x: number, y: number, m = 0.005): Vec2 => [
  Math.max(-WORLD_W / 2 + m, Math.min(WORLD_W / 2 - m, snap(x))),
  Math.max(-WORLD_H / 2 + m, Math.min(WORLD_H / 2 - m, snap(y))),
];
const cm = (m: number) => `${sci(Math.round(m * 1000) / 10)} cm`;
/** a value that is zero up to the numerical sum, shown as zero */
const clean = (v: number, scale: number) => (Math.abs(v) < 2e-4 * Math.abs(scale) ? 0 : v);
const agree = (x: number, y: number) => Math.abs(x - y) <= 1e-3 * Math.max(Math.abs(x), Math.abs(y), 1e-30);

/** the charges as the 2D field code wants them (the page is the plane z = 0) */
const CHARGES_2D: PointCharge[] = SCENE_CHARGES.map((c) => ({ x: c.pos[0], y: c.pos[1], q: c.q }));
const COIL = flatCoilB(COIL_K, COIL_W, COIL_H);
const nC = (q: number) => `${q > 0 ? '+' : q < 0 ? '−' : ''}${sci(Math.abs(q) * 1e9)} nC`;

/** spectrum strip: log₁₀ λ from 10⁷ m down to 10⁻¹³ m */
const LOG_L_MAX = 7;
const LOG_L_MIN = -13;
const F_MIN_LOG = 1.5;
const F_MAX_LOG = 21;

const PRESETS: { name: string; f: number }[] = [
  { name: 'רשת החשמל', f: 50 },
  { name: 'רדיו FM', f: 1e8 },
  { name: 'תנור מיקרוגל', f: 2.45e9 },
  { name: 'אור ירוק', f: 5.6e14 },
  { name: 'רנטגן', f: 3e18 },
];

function lengthWords(lam: number): string {
  if (lam >= 1000) return `${sci(lam / 1000)} km`;
  if (lam >= 1) return `${sci(lam)} m`;
  if (lam >= 0.01) return `${sci(lam * 100)} cm`;
  if (lam >= 1e-3) return `${sci(lam * 1000)} mm`;
  if (lam >= 1e-6) return `${sci(lam * 1e6)} μm`;
  if (lam >= 1e-9) return `${sci(lam * 1e9)} nm`;
  return `${sci(lam)} m`;
}

export default function MaxwellFour(props: MaxwellFourProps) {
  const laws = props.laws ?? ['gauss-e', 'gauss-b', 'faraday', 'ampere'];
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          const num = (k: keyof State) => (typeof st[k] === 'number' ? (st[k] as number) : undefined);
          const pair = (k: keyof State) => (Array.isArray(st[k]) && (st[k] as unknown[]).length === 2 ? ([Number((st[k] as unknown[])[0]), Number((st[k] as unknown[])[1])] as Vec2) : undefined);
          if (typeof st.law === 'string' && (LAWS as string[]).includes(st.law)) next.law = st.law as Law;
          next.sphere = pair('sphere') ?? next.sphere;
          next.cube = pair('cube') ?? next.cube;
          next.loop = pair('loop') ?? next.loop;
          next.R = num('R') ?? next.R;
          next.a = num('a') ?? next.a;
          next.dBdt = num('dBdt') ?? next.dBdt;
          next.r = num('r') ?? next.r;
          next.rA = num('rA') ?? next.rA;
          next.logf = num('logf') ?? next.logf;
          if (st.at === 'wire' || st.at === 'gap') next.at = st.at;
          if (st.surface === 'flat' || st.surface === 'bulge') next.surface = st.surface;
          if (typeof st.maxwell === 'boolean') next.maxwell = st.maxwell;
          return next;
        });
      }),
    [props.id],
  );

  // mark the chosen law in the strip
  useEffect(() => {
    const root = stripRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[data-law]').forEach((el) => {
      const on = el.dataset.law === s.law;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', String(on));
    });
  }, [s.law]);

  /* ------------------------------------------------------------------ physics */

  const gauss = useMemo(() => sphereGauss(SCENE_CHARGES, [s.sphere[0], s.sphere[1], 0], s.R), [s.sphere, s.R]);
  const bflux = useMemo(() => cubeFlux(COIL, s.cube[0], s.cube[1], s.a), [s.cube, s.a]);
  const far = useMemo(() => faradayCircle(CORE_B, s.dBdt, SOL_R, s.loop[0], s.loop[1], s.r), [s.dBdt, s.loop, s.r]);
  const amp = ampereReading(s.at, s.surface, s.rA, PLATE_A, CHARGING_I);
  const f = 10 ** s.logf;
  const lam = vacuumWavelength(f);
  const band = bandOf(lam);
  const c = waveSpeed();

  /** a change made by the learner (never a text step): check the tasks against the new state */
  const user = (next: State) => {
    setS(next);
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => has(t) && markTask(`${props.id}:${t}`);
    if (next.law === 'gauss-e') {
      const g = sphereGauss(SCENE_CHARGES, [next.sphere[0], next.sphere[1], 0], next.R, 200);
      const all = SCENE_CHARGES.every((q) => Math.hypot(q.pos[0] - next.sphere[0], q.pos[1] - next.sphere[1]) < next.R);
      if (all && !g.onSurface) done('gauss-both');
    }
    if (next.law === 'gauss-b' && Math.abs(next.cube[0]) < next.a / 2 && Math.abs(next.cube[1] - COIL_H) < next.a / 2) done('b-pole');
    if (next.law === 'faraday' && next.dBdt < 0) done('faraday-shrink');
    if (next.law === 'faraday' && next.dBdt !== 0 && Math.hypot(next.loop[0], next.loop[1]) + SOL_R <= next.r + 1e-9) done('faraday-beyond');
    if (next.law === 'ampere' && next.at === 'wire' && next.surface === 'bulge') done(next.maxwell ? 'ampere-fix' : 'ampere-bag');
    if (next.law === 'ampere' && next.at === 'gap') done('ampere-gap');
    if (next.law === 'wave') {
      const b = bandOf(vacuumWavelength(10 ** next.logf));
      if (b === 'visible') done('wave-light');
      if (Math.abs(10 ** next.logf - 50) < 5) done('wave-grid');
    }
  };

  const onStripClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-law]');
    const law = el?.dataset.law as Law | undefined;
    if (!law || !laws.includes(law)) return;
    user({ ...s, law });
    setLive(`נבחר: ${LAW_NAME[law]}.`);
  };

  /* ------------------------------------------------------------------ drawing */

  const fieldArrows = (ctx: CanvasRenderingContext2D, view: View, F: (x: number, y: number) => readonly [number, number], ref: number, color: string) => {
    const full = GRID * view.ppm * 0.8;
    for (let gx = -WORLD_W / 2 + GRID / 2; gx < WORLD_W / 2; gx += GRID) {
      for (let gy = -WORLD_H / 2 + GRID / 2; gy < WORLD_H / 2; gy += GRID) {
        const v = F(gx, gy);
        const m = Math.hypot(v[0], v[1]);
        if (!(m > 0)) continue;
        // lengths grow like √|F| up to a cap, so weak fields still show: not proportional
        const L = full * Math.min(1, Math.sqrt(m / ref));
        if (L < 3) continue;
        const [sx, sy] = toScreen(view, gx, gy);
        const ux = v[0] / m;
        const uy = -v[1] / m;
        arrow(ctx, sx - (ux * L) / 2, sy - (uy * L) / 2, sx + (ux * L) / 2, sy + (uy * L) / 2, { color, width: 1.5, head: 6, alpha: 0.6 });
      }
    }
  };

  /** small triangles along a circle: the walking direction, counter-clockwise on the page */
  const walkMarks = (ctx: CanvasRenderingContext2D, x: number, y: number, R: number, color: string) => {
    ctx.save();
    ctx.fillStyle = color;
    for (let k = 0; k < 4; k++) {
      const t = Math.PI / 4 + (k * Math.PI) / 2;
      const px = x + R * Math.cos(t);
      const py = y - R * Math.sin(t);
      const ux = -Math.sin(t);
      const uy = -Math.cos(t); // screen y down: the counter-clockwise tangent
      ctx.beginPath();
      ctx.moveTo(px + ux * 7, py + uy * 7);
      ctx.lineTo(px - ux * 4 - uy * 5, py - uy * 4 + ux * 5);
      ctx.lineTo(px - ux * 4 + uy * 5, py - uy * 4 - ux * 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  const label = (ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, color: string, opts: { align?: CanvasTextAlign; size?: number; rtl?: boolean } = {}) => {
    ctx.save();
    ctx.font = `600 ${opts.size ?? 13}px ${p.fontUi}`;
    ctx.fillStyle = color;
    ctx.direction = opts.rtl ? 'rtl' : 'ltr';
    ctx.textAlign = opts.align ?? 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  const drawGaussE = (ctx: CanvasRenderingContext2D, view: View, p: Palette) => {
    fieldArrows(ctx, view, (x, y) => fieldAt(CHARGES_2D, x, y), 4e4, p.efield);
    const [cx, cy] = toScreen(view, s.sphere[0], s.sphere[1]);
    const R = s.R * view.ppm;
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.08);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // E·n̂ on the surface: dark arrows out where the field leaves, in where it enters
    const n = 12;
    for (let k = 0; k < n; k++) {
      const t = (2 * Math.PI * k) / n;
      const wx = s.sphere[0] + s.R * Math.cos(t);
      const wy = s.sphere[1] + s.R * Math.sin(t);
      const E = fieldAt(CHARGES_2D, wx, wy);
      const En = E[0] * Math.cos(t) + E[1] * Math.sin(t);
      const L = 16 * Math.min(1, Math.sqrt(Math.abs(En) / 4e4));
      if (L < 3) continue;
      const [sx, sy] = toScreen(view, wx, wy);
      const ux = Math.cos(t) * Math.sign(En);
      const uy = -Math.sin(t) * Math.sign(En);
      if (En > 0) arrow(ctx, sx, sy, sx + ux * L, sy + uy * L, { color: p.ink, width: 2, head: 6 });
      else arrow(ctx, sx - ux * L, sy - uy * L, sx, sy, { color: p.ink, width: 2, head: 6 });
    }
    for (const q of CHARGES_2D) {
      const [qx, qy] = toScreen(view, q.x, q.y);
      chargeDisc(ctx, qx, qy, 10, q.q, p, { label: nC(q.q) });
      if (q.q < 0) {
        // a negative charge differs in outline as well as colour
        ctx.save();
        ctx.strokeStyle = p.neg;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(qx, qy, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  const drawGaussB = (ctx: CanvasRenderingContext2D, view: View, p: Palette) => {
    fieldArrows(ctx, view, COIL, MU0 * COIL_K * 0.7, p.bfield);
    const [l, t] = toScreen(view, -COIL_W, COIL_H);
    const [r, b] = toScreen(view, COIL_W, -COIL_H);
    ctx.save();
    ctx.fillStyle = withAlpha(p.ink3, 0.12);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.6;
    ctx.fillRect(l, t, r - l, b - t);
    ctx.strokeRect(l, t, r - l, b - t);
    ctx.beginPath();
    ctx.moveTo(l, (t + b) / 2);
    ctx.lineTo(r, (t + b) / 2);
    ctx.stroke();
    ctx.restore();
    label(ctx, p, 'N', (l + r) / 2, t + 14, p.ink, { size: 15 });
    label(ctx, p, 'S', (l + r) / 2, b - 14, p.ink, { size: 15 });
    // the cube, seen face-on, with B·n̂ on its edges
    const h = s.a / 2;
    const [ql, qt] = toScreen(view, s.cube[0] - h, s.cube[1] + h);
    const side = s.a * view.ppm;
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.08);
    ctx.fillRect(ql, qt, side, side);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(ql, qt, side, side);
    ctx.restore();
    const per = side >= 60 ? 3 : 2;
    const edges: { n: Vec2; at: (u: number) => Vec2 }[] = [
      { n: [0, -1], at: (u) => [s.cube[0] + u, s.cube[1] - h] },
      { n: [1, 0], at: (u) => [s.cube[0] + h, s.cube[1] + u] },
      { n: [0, 1], at: (u) => [s.cube[0] - u, s.cube[1] + h] },
      { n: [-1, 0], at: (u) => [s.cube[0] - h, s.cube[1] - u] },
    ];
    const ref = MU0 * COIL_K * 0.7;
    for (const e of edges) {
      for (let k = 0; k < per; k++) {
        const u = -h + ((k + 0.5) * s.a) / per;
        const [wx, wy] = e.at(u);
        const v = COIL(wx, wy);
        const bn = v[0] * e.n[0] + v[1] * e.n[1];
        const L = 16 * Math.min(1, Math.sqrt(Math.abs(bn) / ref));
        if (L < 3) continue;
        const [sx, sy] = toScreen(view, wx, wy);
        const dx = e.n[0] * Math.sign(bn) * L;
        const dy = -e.n[1] * Math.sign(bn) * L;
        if (bn > 0) arrow(ctx, sx, sy, sx + dx, sy + dy, { color: p.ink, width: 2, head: 6 });
        else arrow(ctx, sx - dx, sy - dy, sx, sy, { color: p.ink, width: 2, head: 6 });
      }
    }
  };

  const drawFaraday = (ctx: CanvasRenderingContext2D, view: View, p: Palette) => {
    const [ox, oy] = toScreen(view, 0, 0);
    const Rc = SOL_R * view.ppm;
    ctx.save();
    ctx.fillStyle = withAlpha(p.bfield, 0.08);
    ctx.strokeStyle = withAlpha(p.bfield, 0.8);
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ox, oy, Rc, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    for (let x = -SOL_R + 0.01; x < SOL_R; x += 0.02)
      for (let y = -SOL_R + 0.01; y < SOL_R; y += 0.02) if (x * x + y * y < SOL_R * SOL_R * 0.85) depthGlyph(ctx, ...toScreen(view, x, y), 4.5, 'out', p.bfield, { alpha: 0.75 });
    const word = s.dBdt > 0 ? 'B גדל' : s.dBdt < 0 ? 'B קטן' : 'B קבוע';
    label(ctx, p, word, ox, oy - Rc - 12, p.bfield, { rtl: true });
    if (s.dBdt !== 0) fieldArrows(ctx, view, inducedE(s.dBdt, SOL_R), (2 * SOL_R) / 2, p.efield);
    const [lx, ly] = toScreen(view, s.loop[0], s.loop[1]);
    const r = s.r * view.ppm;
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(lx, ly, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    walkMarks(ctx, lx, ly, r, p.accent);
  };

  const drawAmpere = (ctx: CanvasRenderingContext2D, view: View, p: Palette) => {
    const X = (x: number) => toScreen(view, x, 0)[0];
    const Y = (y: number) => toScreen(view, 0, y)[1];
    const gap = 0.008; // half the gap as drawn: much wider than a real gap
    const a = PLATE_A;
    // the wire, with the current to the right
    ctx.save();
    ctx.strokeStyle = p.current;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(X(-WORLD_W / 2), Y(0));
    ctx.lineTo(X(-gap), Y(0));
    ctx.moveTo(X(gap), Y(0));
    ctx.lineTo(X(WORLD_W / 2), Y(0));
    ctx.stroke();
    ctx.restore();
    for (const x of [-0.105, -0.035, 0.035, 0.08]) arrow(ctx, X(x) - 8, Y(0), X(x) + 8, Y(0), { color: p.current, width: 3, head: 9 });
    label(ctx, p, 'I', X(-0.105), Y(0) - 13, p.current, { size: 14 });
    // the plates, + on the left (the current brings charge to it), − on the right
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(X(-gap), Y(a));
    ctx.lineTo(X(-gap), Y(-a));
    ctx.moveTo(X(gap), Y(a));
    ctx.lineTo(X(gap), Y(-a));
    ctx.stroke();
    ctx.restore();
    for (const y of [0.035, -0.035]) {
      label(ctx, p, '+', X(-gap) - 9, Y(y), p.pos, { size: 15 });
      label(ctx, p, '−', X(gap) + 9, Y(y), p.neg, { size: 15 });
    }
    // E in the gap, growing
    for (const y of [-0.04, -0.02, 0.02, 0.04]) arrow(ctx, X(-gap) + 2, Y(y), X(gap) - 2, Y(y), { color: p.efield, width: 2, head: 6 });
    label(ctx, p, 'E גדל', X(0), Y(a) - 10, p.efield, { rtl: true, size: 12 });
    // the path: a circle about the axis, seen almost edge-on
    const xc = s.at === 'wire' ? -0.07 : 0;
    const r = s.rA;
    const [ex, ey] = toScreen(view, xc, 0);
    const rx = Math.max(6, 0.25 * r * view.ppm);
    const ry = r * view.ppm;
    // the surface on the path
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.16);
    ctx.strokeStyle = withAlpha(p.accent, 0.6);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (s.at === 'wire' && s.surface === 'bulge') {
      // a bag from the path, round the edge of the + plate, closed inside the gap
      const top = Y(a + 0.012);
      const bot = Y(-a - 0.012);
      ctx.moveTo(ex, ey - ry);
      ctx.bezierCurveTo(ex + 0.02 * view.ppm, top, X(-gap - 0.012), top, X(-gap * 0.2), top);
      ctx.lineTo(X(-gap * 0.2), bot);
      ctx.bezierCurveTo(X(-gap - 0.012), bot, ex + 0.02 * view.ppm, bot, ex, ey + ry);
      ctx.closePath();
    } else {
      ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // the path itself: the far half dashed
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(ex, ey, rx, ry, 0, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(ex, ey, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.restore();
    // B on the path: out of the page above the axis, into it below (right-hand rule about the current)
    if (amp.B > 0) {
      depthGlyph(ctx, ex, ey - ry, 7, 'out', p.bfield, { fill: p.paper, width: 2 });
      depthGlyph(ctx, ex, ey + ry, 7, 'in', p.bfield, { fill: p.paper, width: 2 });
    }
    if (s.at === 'wire' && s.surface === 'flat') {
      ctx.save();
      ctx.fillStyle = p.current;
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const drawWave = (ctx: CanvasRenderingContext2D, view: View, p: Palette, t: number) => {
    const W = view.w;
    const H = view.h;
    const axisY = H * 0.36;
    const amp = H * 0.22;
    const lamPx = W / 2.4;
    const shift = t * 40; // slow motion: a crest moves 40 px per second, whatever f is
    const x0 = 24;
    const x1 = W - 40;
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, axisY);
    ctx.lineTo(x1, axisY);
    ctx.stroke();
    ctx.restore();
    arrow(ctx, x1 - 4, axisY, x1 + 22, axisY, { color: p.ink2, width: 2, head: 8 });
    label(ctx, p, 'c', x1 + 14, axisY - 12, p.ink2, { size: 14 });
    // the envelope of E
    ctx.save();
    ctx.strokeStyle = withAlpha(p.efield, 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 3) {
      const ph = (2 * Math.PI * (x - shift)) / lamPx;
      const y = axisY - amp * Math.sin(ph);
      if (x === x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    const step = lamPx / 8;
    for (let x = x0 + ((shift % step) + step) % step; x <= x1; x += step) {
      const v = Math.sin((2 * Math.PI * (x - shift)) / lamPx);
      if (Math.abs(v) > 0.08) arrow(ctx, x, axisY, x, axisY - amp * v, { color: p.efield, width: 2, head: 7 });
      if (Math.abs(v) > 0.15) depthGlyph(ctx, x, axisY, 2.5 + 5 * Math.abs(v), v > 0 ? 'out' : 'in', p.bfield, { fill: p.paper, width: 1.6 });
    }
    // one wavelength, marked
    const lx = x0 + 10;
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    const ly = axisY + amp + 16;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 4);
    ctx.lineTo(lx, ly + 4);
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + lamPx, ly);
    ctx.moveTo(lx + lamPx, ly - 4);
    ctx.lineTo(lx + lamPx, ly + 4);
    ctx.stroke();
    ctx.restore();
    label(ctx, p, `λ = ${lengthWords(lam)}`, lx + lamPx / 2, ly + 13, p.ink2, { size: 13 });
    // the spectrum: log λ, long waves on the left
    const sy = H * 0.86;
    const sh = 16;
    const sx0 = 24;
    const sx1 = W - 24;
    const xOf = (logL: number) => sx0 + ((LOG_L_MAX - logL) / (LOG_L_MAX - LOG_L_MIN)) * (sx1 - sx0);
    let hi = LOG_L_MAX;
    BANDS.forEach((b, i) => {
      const lo = b.minLambda > 0 ? Math.log10(b.minLambda) : LOG_L_MIN;
      const xa = xOf(hi);
      const xb = xOf(lo);
      ctx.save();
      ctx.fillStyle = b.band === band ? withAlpha(p.accent, 0.35) : withAlpha(p.ink3, i % 2 ? 0.1 : 0.2);
      ctx.fillRect(xa, sy - sh / 2, xb - xa, sh);
      ctx.restore();
      const narrow = xb - xa < 30;
      const name = BAND_NAME[b.band];
      if (W > 420 || b.band === band || !narrow) label(ctx, p, name, (xa + xb) / 2, narrow ? sy - sh / 2 - 9 : sy + sh / 2 + 10, b.band === band ? p.ink : p.ink3, { rtl: true, size: 11 });
      hi = lo;
    });
    const mx = xOf(Math.max(LOG_L_MIN, Math.min(LOG_L_MAX, Math.log10(lam))));
    ctx.save();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.moveTo(mx, sy - sh / 2 - 1);
    ctx.lineTo(mx - 6, sy - sh / 2 - 11);
    ctx.lineTo(mx + 6, sy - sh / 2 - 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    label(ctx, p, 'אורך גל ארוך', sx0, sy - sh / 2 - 24, p.ink3, { align: 'left', size: 11, rtl: true });
    label(ctx, p, 'אורך גל קצר', sx1, sy - sh / 2 - 24, p.ink3, { align: 'right', size: 11, rtl: true });
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    if (s.law !== 'wave') paperGrid(ctx, view, p, GRID);
    if (s.law === 'gauss-e') drawGaussE(ctx, view, p);
    else if (s.law === 'gauss-b') drawGaussB(ctx, view, p);
    else if (s.law === 'faraday') drawFaraday(ctx, view, p);
    else if (s.law === 'ampere') drawAmpere(ctx, view, p);
    else drawWave(ctx, view, p, t);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: s.law === 'wave' });
  useEffect(invalidate, [s]);

  /* ------------------------------------------------------------------ input */

  const draggable = s.law === 'gauss-e' || s.law === 'gauss-b' || s.law === 'faraday';
  const posOf = (st: State): Vec2 => (st.law === 'gauss-e' ? st.sphere : st.law === 'gauss-b' ? st.cube : st.loop);
  const withPos = (st: State, at: Vec2): State =>
    st.law === 'gauss-e' ? { ...st, sphere: at } : st.law === 'gauss-b' ? { ...st, cube: at } : { ...st, loop: at };
  const sizeOf = (st: State) => (st.law === 'gauss-e' ? st.R : st.law === 'gauss-b' ? st.a / 2 : st.r);
  const describePos = (st: State) => `המרכז ב-(${cm(posOf(st)[0])}, ${cm(posOf(st)[1])}).`;

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v || !draggable) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const [px, py] = posOf(s);
    if (Math.hypot(wx - px, wy - py) <= sizeOf(s) + 8 / v.ppm) drag.current = { dx: px - wx, dy: py - wy };
    else {
      drag.current = { dx: 0, dy: 0 };
      user(withPos(s, clampAt(wx, wy)));
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const at = clampAt(wx + d.dx, wy + d.dy);
    const [px, py] = posOf(s);
    if (at[0] !== px || at[1] !== py) user(withPos(s, at));
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describePos(s));
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!draggable) return;
    const dirs: Record<string, Vec2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.02 : 0.005;
    const [px, py] = posOf(s);
    const next = withPos(s, clampAt(px + d[0] * step, py + d[1] * step));
    user(next);
    setLive(describePos(next));
  };
  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  /* ------------------------------------------------------------------ readout */

  const sides = (lhs: ComponentChildren, rhs: ComponentChildren) => (
    <>
      <span>
        צד שמאל: <b class="q">{lhs}</b>
      </span>
      <span>
        צד ימין: <b class="q">{rhs}</b>
      </span>
    </>
  );

  const readout = (): ComponentChildren => {
    if (s.law === 'gauss-e') {
      const scale = 4e-9 / EPS0;
      return (
        <>
          <span>
            המשטח הסגור: כדור ברדיוס <b class="q">R = {cm(s.R)}</b>. המטען הכלוא: <b class="q">Q_in = {nC(gauss.enclosed)}</b>
          </span>
          {gauss.onSurface ? (
            <span>מטען יושב כמעט על המשטח עצמו. הזיזו מעט את המשטח: חוק גאוס מדבר על מטען שבפנים או בחוץ.</span>
          ) : (
            sides(`∮E·dA = ${sci(clean(gauss.flux, scale))} N·m²/C`, `Q_in/ε₀ = ${sci(clean(gauss.rhs, scale))} N·m²/C`)
          )}
        </>
      );
    }
    if (s.law === 'gauss-b') {
      return (
        <>
          <span>
            המשטח הסגור: קובייה בצלע <b class="q">a = {cm(s.a)}</b>. השטף שיוצא: <b class="q">{sci(bflux.out)} T·m²</b>; השטף שנכנס:{' '}
            <b class="q">{sci(bflux.in)} T·m²</b>
          </span>
          {sides(`∮B·dA = ${sci(clean(bflux.net, bflux.out))} T·m²`, '0')}
        </>
      );
    }
    if (s.law === 'faraday') {
      const scale = Math.PI * SOL_R ** 2 * 2;
      const circ = clean(far.circulation, scale);
      const sense = circ < 0 ? 'עם כיוון השעון' : circ > 0 ? 'נגד כיוון השעון' : '';
      return (
        <>
          <span>
            בליבה: <b class="q">B = {sci(CORE_B)} T</b> ⊙, וקצב השינוי <b class="q">ΔB/Δt = {sci(s.dBdt)} T/s</b>. המסלול: מעגל ברדיוס <b class="q">{cm(s.r)}</b>,
            הולכים לאורכו נגד כיוון השעון.
          </span>
          {sides(`∮E·dl = ${sci(circ)} V`, `−ΔΦ_B/Δt = ${sci(clean(far.rhs, scale))} V`)}
          <span>
            השטף המגנטי דרך המסלול: <b class="q">Φ_B = {sci(clean(far.flux, CORE_B * scale))} Wb</b>
            {sense ? <>. השדה המושרה מקיף את הציר {sense}.</> : '.'}
          </span>
        </>
      );
    }
    if (s.law === 'ampere') {
      const okOld = agree(amp.ampereOld, amp.circulation);
      const okNew = agree(amp.ampereMaxwell, amp.circulation);
      return (
        <>
          <span>
            המסלול: מעגל ברדיוס <b class="q">{cm(s.rA)}</b> {s.at === 'wire' ? 'סביב התיל' : 'בין הלוחות'}. השדה עליו: <b class="q">B = {sci(amp.B)} T</b>
          </span>
          <span>
            צד שמאל: <b class="q">∮B·dl = {sci(amp.circulation)} T·m</b>
          </span>
          <span>
            דרך המשטח: זרם של מטענים <b class="q">I = {sci(amp.conduction)} A</b>, ו-<b class="q">ε₀·ΔΦ_E/Δt = {sci(amp.displacement)} A</b>
          </span>
          {s.maxwell ? (
            <span>
              צד ימין, עם התוספת של מקסוול: <b class="q">μ₀(I + ε₀ΔΦ_E/Δt) = {sci(amp.ampereMaxwell)} T·m</b>: {okNew ? 'שווה לצד שמאל' : 'שונה מצד שמאל'}
            </span>
          ) : (
            <span>
              צד ימין, בלי התוספת (שיעור 4.4): <b class="q">μ₀I = {sci(amp.ampereOld)} T·m</b>: {okOld ? 'שווה לצד שמאל' : 'שונה מצד שמאל!'}
            </span>
          )}
        </>
      );
    }
    return (
      <>
        <span>
          התדירות: <b class="q">f = {sci(f)} Hz</b>. אורך הגל: <b class="q">λ = c/f = {lengthWords(lam)}</b>
        </span>
        <span>
          התחום בספקטרום: <b>{BAND_NAME[band]}</b>
        </span>
        <span>
          המהירות בריק, מהקבועים בלבד: <b class="q">c = 1/√(μ₀ε₀) = {sci(c)} m/s</b>, בכל תדירות
        </span>
      </>
    );
  };

  const controls = (): ComponentChildren => {
    if (s.law === 'gauss-e')
      return <Slider label="הרדיוס של הכדור R" value={s.R} min={0.01} max={0.08} step={0.0025} format={cm} onChange={(v) => user({ ...s, R: v })} />;
    if (s.law === 'gauss-b')
      return <Slider label="הצלע של הקובייה a" value={s.a} min={0.01} max={0.06} step={0.0025} format={cm} onChange={(v) => user({ ...s, a: v })} />;
    if (s.law === 'faraday')
      return (
        <>
          <Slider label="קצב השינוי של B בליבה" value={s.dBdt} min={-2} max={2} step={0.5} format={(v) => `${sci(v)} T/s`} onChange={(v) => user({ ...s, dBdt: v })} />
          <Slider label="הרדיוס של המסלול" value={s.r} min={0.01} max={0.075} step={0.0025} format={cm} onChange={(v) => user({ ...s, r: v })} />
        </>
      );
    if (s.law === 'ampere')
      return (
        <>
          <div class="group" role="group" aria-label="איפה המסלול">
            <Toggle label="המסלול סביב התיל" on={s.at === 'wire'} onChange={() => user({ ...s, at: 'wire' })} />
            <Toggle label="המסלול בין הלוחות" on={s.at === 'gap'} onChange={() => user({ ...s, at: 'gap' })} />
          </div>
          {s.at === 'wire' && (
            <div class="group" role="group" aria-label="המשטח על המסלול">
              <Toggle label="משטח שטוח" on={s.surface === 'flat'} onChange={() => user({ ...s, surface: 'flat' })} />
              <Toggle label="שקית בין הלוחות" on={s.surface === 'bulge'} onChange={() => user({ ...s, surface: 'bulge' })} />
            </div>
          )}
          <div class="group" role="group" aria-label="התוספת של מקסוול">
            <Toggle label="התוספת של מקסוול" on={s.maxwell} onChange={(v) => user({ ...s, maxwell: v })} />
          </div>
          <Slider label="הרדיוס של המסלול" value={s.rA} min={0.01} max={0.07} step={0.005} format={cm} onChange={(v) => user({ ...s, rA: v })} />
        </>
      );
    return (
      <>
        <Slider label="התדירות (סולם של חזקות 10)" value={s.logf} min={F_MIN_LOG} max={F_MAX_LOG} step={0.05} format={(v) => `${sci(10 ** v)} Hz`} onChange={(v) => user({ ...s, logf: v })} />
        <div class="group" role="group" aria-label="תדירויות מוכרות">
          {PRESETS.map((pr) => (
            <button type="button" key={pr.name} class="toggle" onClick={() => user({ ...s, logf: Math.log10(pr.f) })}>
              {pr.name}
            </button>
          ))}
        </div>
      </>
    );
  };

  const sceneLabel = (): string => {
    if (s.law === 'gauss-e')
      return `חוק גאוס: שני מטענים, ${nC(SCENE_CHARGES[0].q)} ו-${nC(SCENE_CHARGES[1].q)}, וכדור ברדיוס ${cm(s.R)}. המטען הכלוא ${nC(gauss.enclosed)}, והשטף ${sci(gauss.flux)} N·m²/C.`;
    if (s.law === 'gauss-b') return `חוק גאוס למגנטיות: מגנט מוט וקובייה בצלע ${cm(s.a)}. השטף שיוצא ${sci(bflux.out)} T·m², ונטו אפס.`;
    if (s.law === 'faraday') return `חוק פאראדיי: ליבה שהשדה המגנטי בה יוצא מהדף ומשתנה בקצב ${sci(s.dBdt)} T/s, ומסלול ברדיוס ${cm(s.r)}. הסכום סביבו ${sci(far.circulation)} V.`;
    if (s.law === 'ampere') return `חוק אמפר-מקסוול: קבל שנטען בזרם ${CHARGING_I} A, מסלול ${s.at === 'wire' ? 'סביב התיל' : 'בין הלוחות'} ברדיוס ${cm(s.rA)}.`;
    return `גל אלקטרומגנטי בתדירות ${sci(f)} הרץ, אורך גל ${lengthWords(lam)}, ${BAND_NAME[band]}.`;
  };

  return (
    <div class="mf">
      <div class="mf-strip-wrap" ref={stripRef} onClick={onStripClick}>
        {props.children}
      </div>
      <p class="mf-says">{SAYS[s.law]}</p>
      <SimShell
        fig={props.id}
        label={`איור חי: ${sceneLabel()}${draggable ? ' גררו בעכבר או במגע, או הקישו במקום כלשהו; במקלדת: חיצים מזיזים.' : ''}`}
        canvasRef={canvasRef}
        aspect={ASPECT}
        live={live}
        tasks={tasks}
        onReset={reset}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        cursor={draggable ? (drag.current ? 'grabbing' : 'grab') : 'default'}
        readout={readout()}
        controls={controls()}
      />
    </div>
  );
}
