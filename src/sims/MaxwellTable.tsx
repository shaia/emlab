/**
 * The live table of Maxwell's equations (lesson 6.13). Above: the four laws in integral and differential
 * form, side by side, every term a button. The table itself is static HTML rendered by the wrapper
 * (KaTeX at build time) and passed in as children; this island only handles clicks on it and marks
 * the chosen pair of partner terms (`data-pair`) in both forms. Two switches strike out the terms
 * that vanish in a limit: "static" (every time derivative) and "empty space" (charge and current).
 *
 * Below: a scene for the chosen law, with a probe the learner drags and resizes: a small box for the
 * two divergence laws, a small loop for the two curl laws. The readout gives both sides of the law in
 * its integral form (over the whole probe) and in its differential form (at the probe's centre), all
 * from src/physics/maxwell.ts. Tasks tick only on the learner's own actions, never on a text step.
 */

import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { EPS0, MU0 } from '~/physics/constants';
import { ROD_R, ROD_RHO, THICK_I } from '~/physics/divcurl';
import { COIL_H, COIL_K, COIL_W, GAP_A, GAP_DEDT, maxwellScene, probeReading, SOL_DBDT, SOL_R, type SceneId } from '~/physics/maxwell';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { arrow, depthGlyph, paperGrid, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';
import './MaxwellTable.css';

const WORLD_W = 0.24;
const WORLD_H = 0.18;
const GRID = 0.02;
const A_MIN = 0.005;
const A_MAX = 0.08;
const SAMPLES = 240;

type Vec2 = [number, number];

export type TermId =
  | 'gauss-e-flux'
  | 'gauss-e-charge'
  | 'gauss-b-flux'
  | 'gauss-b-zero'
  | 'faraday-circ'
  | 'faraday-rate'
  | 'ampere-circ'
  | 'ampere-current'
  | 'ampere-disp';

const TERMS: TermId[] = ['gauss-e-flux', 'gauss-e-charge', 'gauss-b-flux', 'gauss-b-zero', 'faraday-circ', 'faraday-rate', 'ampere-circ', 'ampere-current', 'ampere-disp'];

/** what each pair of partner terms says at a point: shown under the table when the pair is chosen */
const SAYS: Record<TermId, ComponentChildren> = {
  'gauss-e-flux': (
    <>
      הדיברגנץ <span class="q">∇·E</span> הוא השטף נטו שיוצא מתיבה זעירה סביב הנקודה, חלקי הנפח שלה. משפט הדיברגנץ מחבר אותו לשטף <span class="q">∮E·dA</span>{' '}
      דרך המשטח הסגור כולו.
    </>
  ),
  'gauss-e-charge': (
    <>
      האיבר <span class="q">ρ/ε₀</span> הוא צפיפות המטען בנקודה עצמה, חלקי ε₀. השדה החשמלי "נובע" רק ממקום שיש בו מטען. <span class="q">Q_in</span> הוא הסכום של{' '}
      <span class="q">ρ·dV</span> על כל הנפח.
    </>
  ),
  'gauss-b-flux': (
    <>
      הדיברגנץ <span class="q">∇·B</span> הוא השטף המגנטי נטו שיוצא מתיבה זעירה, חלקי הנפח שלה, בדיוק כמו <span class="q">∇·E</span> לשדה החשמלי.
    </>
  ),
  'gauss-b-zero': (
    <>
      האפס אומר שאין <b>מטען מגנטי</b>: קווי השדה המגנטי לא מתחילים ולא נגמרים באף נקודה. מה שיוצא מהקוטב הצפוני של מגנט נכנס אליו מבפנים, מכיוון הקוטב הדרומי.
    </>
  ),
  'faraday-circ': (
    <>
      הרוטור <span class="q">∇×E</span> הוא הסירקולציה של E סביב לולאה זעירה, חלקי השטח שלה. משפט סטוקס מחבר אותו לסירקולציה <span class="q">∮E·dl</span> סביב המסלול כולו.
    </>
  ),
  'faraday-rate': (
    <>
      האיבר <span class="q">−∂B/∂t</span> הוא קצב השינוי של השדה המגנטי בנקודה עצמה, עם מינוס (חוק לנץ). השטף <span class="q">Φ_B</span> הוא הסכום של{' '}
      <span class="q">B·dA</span> על המשטח.
    </>
  ),
  'ampere-circ': (
    <>
      הרוטור <span class="q">∇×B</span> הוא הסירקולציה של B סביב לולאה זעירה, חלקי השטח שלה, כמו בשיעור 6.8.
    </>
  ),
  'ampere-current': (
    <>
      האיבר <span class="q">μ₀J</span> הוא צפיפות זרם ההולכה בנקודה עצמה, כפול μ₀. <span class="q">I_in</span> הוא הסכום של <span class="q">J·dA</span> על המשטח.
    </>
  ),
  'ampere-disp': (
    <>
      האיבר <span class="q">μ₀ε₀∂E/∂t</span> הוא שדה חשמלי שמשתנה בנקודה. זה זרם ההעתקה של שיעור 6.12, ליחידת שטח: הוא יוצר רוטור של B גם בריק.
    </>
  ),
};

const SCENE_LABEL: Record<SceneId, string> = {
  rod: 'מוט טעון',
  coil: 'סליל שטוח, כמו מגנט',
  induced: 'ליבה של סליל, שהשדה בה גדל',
  wire: 'תיל עבה',
  gap: 'בין לוחות קבל שנטען',
};

const TASK_LABEL: Record<string, string> = {
  'gauss-edge': 'חוק גאוס, במוט הטעון: הזיזו את התיבה כך שחלק ממנה בתוך המוט וחלק מחוצה לו. האם שני הצדדים של הצורה האינטגרלית עדיין שווים?',
  'no-monopole': 'חוק גאוס למגנטיות: הזיזו את התיבה כך שתקיף את הקצה העליון של הסליל, הקוטב הצפוני. מה השטף נטו?',
  'faraday-axis': 'חוק פאראדיי: הביאו את מרכז הלולאה לציר של הליבה, שם השדה החשמלי אפס. מה הרוטור?',
  'faraday-outside': 'חוק פאראדיי: הוציאו את הלולאה כולה מהליבה. השדה החשמלי שם לא אפס; מה הרוטור?',
  'gap-curl': 'חוק אמפר-מקסוול, האיבר של זרם ההעתקה: הכניסו את הלולאה כולה אל בין הלוחות. אין שם זרם הולכה; מה הרוטור?',
  'static-limit': 'בשדה המושרה או בין הלוחות: הדליקו "סטטי". מה קורה לשדה ולרוטור?',
  'empty-limit': 'הדליקו "ריק", והוציאו את התיבה מהמוט או את הלולאה מהתיל. מה נשאר מהמשוואה?',
};

export interface MaxwellTableProps {
  id: string;
  term?: TermId;
  /** the static limit: every time derivative is zero */
  still?: boolean;
  /** the empty-space limit: strike out charge and current */
  empty?: boolean;
  at?: Vec2;
  a?: number;
  tasks?: string[];
  children?: ComponentChildren;
}

interface State {
  term: TermId;
  /** the scene of the Ampère–Maxwell row: the thick wire (current) or the capacitor gap (displacement) */
  amp: 'wire' | 'gap';
  still: boolean;
  empty: boolean;
  at: Vec2;
  a: number;
}

const lawOf = (t: TermId) => t.split('-').slice(0, t.startsWith('gauss') ? 2 : 1).join('-');

function sceneOf(s: State): SceneId {
  const law = lawOf(s.term);
  return law === 'gauss-e' ? 'rod' : law === 'gauss-b' ? 'coil' : law === 'faraday' ? 'induced' : s.amp;
}

function withTerm(s: State, term: TermId): State {
  const amp = term === 'ampere-current' ? 'wire' : term === 'ampere-disp' ? 'gap' : s.amp;
  return { ...s, term, amp };
}

function initial(p: MaxwellTableProps): State {
  const base: State = { term: 'gauss-e-flux', amp: 'wire', still: !!p.still, empty: !!p.empty, at: p.at ?? [0.02, 0.01], a: p.a ?? 0.03 };
  return withTerm(base, p.term ?? 'gauss-e-flux');
}

const snap = (v: number, q = 0.0025) => Math.round(v / q) * q;
const clampAt = (x: number, y: number): Vec2 => [
  Math.max(-WORLD_W / 2 + 0.005, Math.min(WORLD_W / 2 - 0.005, snap(x))),
  Math.max(-WORLD_H / 2 + 0.005, Math.min(WORLD_H / 2 - 0.005, snap(y))),
];
const cm = (m: number) => `${sci(Math.round(m * 1000) / 10)} cm`;
/** nearest and farthest distance from the origin to the square of side a centred at (x, y) */
const nearest = (x: number, y: number, a: number) => Math.hypot(Math.max(0, Math.abs(x) - a / 2), Math.max(0, Math.abs(y) - a / 2));
const farthest = (x: number, y: number, a: number) => Math.hypot(Math.abs(x) + a / 2, Math.abs(y) + a / 2);
/** a value that is zero up to rounding, shown as zero */
const clean = (v: number, scale: number) => (Math.abs(v) < 1e-4 * Math.abs(scale) ? 0 : v);

/** the scale of each scene: a full-length arrow, and the size of its right-hand side */
const REF: Record<SceneId, { F: number; rhs: number }> = {
  rod: { F: (ROD_RHO * ROD_R) / (2 * EPS0), rhs: ROD_RHO / EPS0 },
  coil: { F: MU0 * COIL_K * 0.7, rhs: (MU0 * COIL_K) / COIL_W },
  induced: { F: (SOL_DBDT * SOL_R) / 2, rhs: SOL_DBDT },
  wire: { F: (MU0 * THICK_I) / (2 * Math.PI * ROD_R), rhs: (MU0 * THICK_I) / (Math.PI * ROD_R ** 2) },
  gap: { F: (MU0 * EPS0 * GAP_DEDT * GAP_A) / 2, rhs: MU0 * EPS0 * GAP_DEDT },
};

/** the symbols of each scene's four readout quantities, and their units */
const SYM: Record<SceneId, { lhs: string; rhs: string; local: string; rhsLocal: string; u: string; ur: string }> = {
  rod: { lhs: '∮E·dA', rhs: 'Q_in/ε₀', local: '∇·E', rhsLocal: 'ρ/ε₀', u: 'N·m²/C', ur: 'N/(C·m)' },
  coil: { lhs: '∮B·dA', rhs: '0', local: '∇·B', rhsLocal: '0', u: 'T·m²', ur: 'T/m' },
  induced: { lhs: '∮E·dl', rhs: '−dΦ_B/dt', local: '(∇×E)z', rhsLocal: '−∂Bz/∂t', u: 'V', ur: 'V/m²' },
  wire: { lhs: '∮B·dl', rhs: 'μ₀I_in', local: '(∇×B)z', rhsLocal: 'μ₀Jz', u: 'T·m', ur: 'T/m' },
  gap: { lhs: '∮B·dl', rhs: 'μ₀ε₀·dΦ_E/dt', local: '(∇×B)z', rhsLocal: 'μ₀ε₀·∂Ez/∂t', u: 'T·m', ur: 'T/m' },
};

/** the four differential laws, with the terms that a limit strikes out replaced by 0 */
function remaining(still: boolean, empty: boolean): string[] {
  const rho = empty ? '0' : 'ρ/ε₀';
  const far = still ? '0' : '−∂B/∂t';
  const amp = [empty ? '' : 'μ₀J', still ? '' : 'μ₀ε₀∂E/∂t'].filter(Boolean).join(' + ') || '0';
  return [`∇·E = ${rho}`, '∇·B = 0', `∇×E = ${far}`, `∇×B = ${amp}`];
}

export default function MaxwellTable(props: MaxwellTableProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          let next = { ...prev };
          if (typeof st.term === 'string' && (TERMS as string[]).includes(st.term)) next = withTerm(next, st.term as TermId);
          if (typeof st.still === 'boolean') next.still = st.still;
          if (typeof st.empty === 'boolean') next.empty = st.empty;
          if (Array.isArray(st.at) && st.at.length === 2) next.at = [Number(st.at[0]), Number(st.at[1])];
          if (typeof st.a === 'number') next.a = st.a;
          return next;
        });
      }),
    [props.id],
  );

  // mark the chosen pair in both forms, and strike out the terms the limits remove
  useEffect(() => {
    const root = tableRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>('[data-pair]').forEach((el) => {
      const on = el.dataset.pair === s.term;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', String(on));
      const v = el.dataset.vanish;
      el.classList.toggle('gone', (v === 'static' && s.still) || (v === 'empty' && s.empty));
    });
  }, [s.term, s.still, s.empty]);

  const sceneId = sceneOf(s);
  const sc = useMemo(() => maxwellScene(sceneId, s.still), [sceneId, s.still]);
  const ref = REF[sceneId];
  const sym = SYM[sceneId];
  const [cx, cy] = s.at;
  const box = sc.probe === 'box';
  const reading = useMemo(() => probeReading(sc, cx, cy, s.a, SAMPLES), [sc, cx, cy, s.a]);
  const intScale = ref.rhs * s.a ** (box ? 3 : 2);
  const lhs = clean(reading.lhs, intScale);
  const rhs = clean(reading.rhs, intScale);
  const local = clean(reading.local, ref.rhs);
  const rhsLocal = clean(reading.rhsLocal, ref.rhs);
  const Fc = sc.F(cx, cy);
  const Fmag = Math.hypot(Fc[0], Fc[1]);

  /** a change made by the learner (never a text step): check the tasks against the new state */
  const user = (next: State) => {
    setS(next);
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => has(t) && markTask(`${props.id}:${t}`);
    const scn = sceneOf(next);
    const [x, y] = next.at;
    const near = nearest(x, y, next.a);
    const far = farthest(x, y, next.a);
    if (scn === 'rod' && near < ROD_R && far > ROD_R) done('gauss-edge');
    if (scn === 'coil' && Math.abs(x) < next.a / 2 && Math.abs(y - COIL_H) < next.a / 2) done('no-monopole');
    if (scn === 'induced' && !next.still && Math.hypot(x, y) <= 0.005 + 1e-9) done('faraday-axis');
    if (scn === 'induced' && !next.still && near > SOL_R) done('faraday-outside');
    if (scn === 'gap' && !next.still && far < GAP_A) done('gap-curl');
    if (next.still && (scn === 'induced' || scn === 'gap')) done('static-limit');
    if (next.empty && ((scn === 'rod' && near > ROD_R) || (scn === 'wire' && near > ROD_R))) done('empty-limit');
  };

  const onTableClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pair]');
    const pair = el?.dataset.pair as TermId | undefined;
    if (!pair || !(TERMS as string[]).includes(pair)) return;
    const next = withTerm(s, pair);
    user(next);
    setLive(`נבחר: ${el?.getAttribute('aria-label') ?? ''}. באיור: ${SCENE_LABEL[sceneOf(next)]}.`);
  };

  /* ------------------------------------------------------------------ draw */

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p, GRID);
    const px = (m: number) => m * view.ppm;
    const [ox, oy] = toScreen(view, 0, 0);
    const fieldColor = sc.kind === 'E' ? p.efield : p.bfield;

    // the source
    ctx.save();
    const disc = (R: number, color: string) => {
      ctx.fillStyle = withAlpha(color, 0.1);
      ctx.strokeStyle = withAlpha(color, 0.75);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ox, oy, px(R), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    };
    /** marks on a lattice inside a circle of radius R: '+' for charge, ⊙ for a field or current out of the page */
    const lattice = (R: number, mark: (x: number, y: number) => void) => {
      for (let x = -R + 0.01; x < R; x += 0.02) for (let y = -R + 0.01; y < R; y += 0.02) if (x * x + y * y < R * R * 0.9) mark(...toScreen(view, x, y));
    };
    if (sceneId === 'rod') {
      disc(ROD_R, p.pos);
      ctx.strokeStyle = withAlpha(p.pos, 0.8);
      ctx.lineWidth = 1.4;
      lattice(ROD_R, (x, y) => {
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x + 3, y);
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x, y + 3);
        ctx.stroke();
      });
    } else if (sceneId === 'wire') {
      disc(ROD_R, p.current);
      lattice(ROD_R, (x, y) => depthGlyph(ctx, x, y, 3.5, 'out', p.current, { width: 1.1, alpha: 0.8 }));
    } else if (sceneId === 'induced' || sceneId === 'gap') {
      // the region where the other field (B in the core, E between the plates) points out of the page and grows
      const R = sceneId === 'induced' ? SOL_R : GAP_A;
      const color = sceneId === 'induced' ? p.bfield : p.efield;
      disc(R, color);
      lattice(R, (x, y) => depthGlyph(ctx, x, y, 3.2, 'out', color, { width: 1, alpha: s.still ? 0.45 : 0.85 }));
    } else if (sceneId === 'coil') {
      const [l, t] = toScreen(view, -COIL_W, COIL_H);
      const [r, b] = toScreen(view, COIL_W, -COIL_H);
      ctx.fillStyle = withAlpha(p.current, 0.07);
      ctx.fillRect(l, t, r - l, b - t);
      ctx.strokeStyle = withAlpha(p.current, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(l, t);
      ctx.lineTo(l, b);
      ctx.moveTo(r, t);
      ctx.lineTo(r, b);
      ctx.stroke();
      for (let y = -COIL_H + 0.01; y < COIL_H; y += 0.02) {
        const [, sy] = toScreen(view, 0, y);
        depthGlyph(ctx, l, sy, 4, 'out', p.current, { fill: p.paper, width: 1.2 });
        depthGlyph(ctx, r, sy, 4, 'in', p.current, { fill: p.paper, width: 1.2 });
      }
      ctx.fillStyle = p.ink2;
      ctx.font = `600 13px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('צפון', (l + r) / 2, t - 10);
      ctx.fillText('דרום', (l + r) / 2, b + 11);
    }
    ctx.restore();

    // the field: an arrow per grid point, length ∝ |F| up to a cap
    const full = px(GRID) * 0.8;
    for (let gx = -WORLD_W / 2 + GRID / 2; gx < WORLD_W / 2; gx += GRID) {
      for (let gy = -WORLD_H / 2 + GRID / 2; gy < WORLD_H / 2; gy += GRID) {
        const v = sc.F(gx, gy);
        const m = Math.hypot(v[0], v[1]);
        if (!(m > 0)) continue;
        const L = full * Math.min(1, m / ref.F);
        if (L < 3) continue;
        const [sx, sy] = toScreen(view, gx, gy);
        const ux = v[0] / m;
        const uy = -v[1] / m;
        arrow(ctx, sx - (ux * L) / 2, sy - (uy * L) / 2, sx + (ux * L) / 2, sy + (uy * L) / 2, { color: fieldColor, width: 1.6, head: 6, alpha: 0.7 });
      }
    }

    // the probe
    const h = s.a / 2;
    const [l, top] = toScreen(view, cx - h, cy + h);
    const side = px(s.a);
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.08);
    ctx.fillRect(l, top, side, side);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(l, top, side, side);
    ctx.restore();

    // arrows on the edges: the normal component (box) or the tangential component (loop)
    const edgeLen = Math.min(px(0.018), side * 0.45);
    const per = side >= 60 ? 3 : side >= 30 ? 2 : 1;
    const edges: { n: Vec2; t: Vec2; at: (u: number) => Vec2 }[] = [
      { n: [0, -1], t: [1, 0], at: (u) => [cx + u, cy - h] },
      { n: [1, 0], t: [0, 1], at: (u) => [cx + h, cy + u] },
      { n: [0, 1], t: [-1, 0], at: (u) => [cx - u, cy + h] },
      { n: [-1, 0], t: [0, -1], at: (u) => [cx - h, cy - u] },
    ];
    for (const e of edges) {
      for (let k = 0; k < per; k++) {
        const u = -h + ((k + 0.5) * s.a) / per;
        const [wx, wy] = e.at(u);
        const v = sc.F(wx, wy);
        const dir = box ? e.n : e.t;
        const c = v[0] * dir[0] + v[1] * dir[1];
        const L = edgeLen * Math.min(1, Math.abs(c) / ref.F);
        if (L < 2.5) continue;
        const [sx, sy] = toScreen(view, wx, wy);
        const dx = dir[0] * Math.sign(c) * L;
        const dy = -dir[1] * Math.sign(c) * L;
        if (box) {
          if (c > 0) arrow(ctx, sx, sy, sx + dx, sy + dy, { color: p.ink, width: 2.2, head: 7 });
          else arrow(ctx, sx - dx, sy - dy, sx, sy, { color: p.ink, width: 2.2, head: 7 });
        } else {
          arrow(ctx, sx - dx / 2, sy - dy / 2, sx + dx / 2, sy + dy / 2, { color: p.ink, width: 2.2, head: 7 });
        }
      }
    }
    if (!box) {
      // the walking direction, counter-clockwise: a small triangle near the end of each side
      ctx.save();
      ctx.fillStyle = p.accent;
      for (const e of edges) {
        const [sx, sy] = toScreen(view, ...e.at(h * 0.999));
        const ux = e.t[0];
        const uy = -e.t[1];
        ctx.beginPath();
        ctx.moveTo(sx + ux * 6, sy + uy * 6);
        ctx.lineTo(sx - ux * 4 - uy * 5, sy - uy * 4 + ux * 5);
        ctx.lineTo(sx - ux * 4 + uy * 5, sy - uy * 4 - ux * 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      spinGlyph(ctx, toScreen(view, cx, cy), Math.min(side * 0.3, 18), Math.sign(local), p.ink);
    }
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  /* ---------------------------------------------------------------- input */

  const describe = (st: State) => `${box ? 'תיבה' : 'לולאה'} בצלע ${cm(st.a)}, במרכז (${cm(st.at[0])}, ${cm(st.at[1])}).`;

  const onPointerDown = (e: PointerEvent) => {
    const v: View | null = viewRef.current;
    if (!v) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const h = s.a / 2 + 6 / v.ppm;
    if (Math.abs(wx - cx) <= h && Math.abs(wy - cy) <= h) {
      drag.current = { dx: cx - wx, dy: cy - wy };
    } else {
      drag.current = { dx: 0, dy: 0 };
      user({ ...s, at: clampAt(wx, wy) });
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const at = clampAt(wx + d.dx, wy + d.dy);
    if (at[0] !== s.at[0] || at[1] !== s.at[1]) user({ ...s, at });
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const dirs: Record<string, Vec2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.02 : 0.005;
    const next = { ...s, at: clampAt(cx + d[0] * step, cy + d[1] * step) };
    user(next);
    setLive(describe(next));
  };
  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  /* -------------------------------------------------------------- render */

  const rest = remaining(s.still, s.empty);
  const probeName = box ? 'תיבה (קובייה)' : 'לולאה ריבועית';

  return (
    <div class="mx">
      <div class="mx-table-wrap" ref={tableRef} onClick={onTableClick}>
        {props.children}
      </div>
      <p class="mx-says">{SAYS[s.term]}</p>
      {(s.still || s.empty) && (
        <p class="mx-rest">
          {s.still && s.empty ? 'סטטי וריק' : s.still ? 'סטטי' : 'ריק'}, מה נשאר:{' '}
          {rest.map((r, i) => (
            <span key={r}>
              {i > 0 && ' · '}
              <span class="q">{r}</span>
            </span>
          ))}
        </p>
      )}
      <SimShell
        fig={props.id}
        label={`איור חי: ${SCENE_LABEL[sceneId]}, ${probeName} בצלע ${cm(s.a)}. ${sym.lhs} = ${sci(lhs)} ${sym.u}, ${sym.rhs} = ${sci(rhs)} ${sym.u}. גררו את הבדיקה בעכבר או במגע, או הקישו במקום כלשהו; במקלדת: חיצים מזיזים.`}
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
              באיור: <b>{SCENE_LABEL[sceneId]}</b>
              {s.still && (sceneId === 'induced' || sceneId === 'gap') ? <>, והשדה בו לא משתנה</> : null}.{' '}
              {probeName} בצלע <b class="q">a = {cm(s.a)}</b>.
            </span>
            <span>
              צורה אינטגרלית, על כל הבדיקה:{' '}
              <b class="q">
                {sym.lhs} = {sci(lhs)} {sym.u}
              </b>
              {sceneId !== 'coil' && (
                <>
                  {' '}
                  ·{' '}
                  <b class="q">
                    {sym.rhs} = {sci(rhs)} {sym.u}
                  </b>
                </>
              )}
            </span>
            <span>
              חלקי ה{box ? 'נפח' : 'שטח'}:{' '}
              <b class="q">
                {sym.lhs}/{box ? 'V' : 'A'} = {sci(clean(reading.ratio, ref.rhs))} {sym.ur}
              </b>
            </span>
            <span>
              צורה דיפרנציאלית, במרכז:{' '}
              <b class="q">
                {sym.local} = {sci(local)} {sym.ur}
              </b>
              {sceneId !== 'coil' && (
                <>
                  {' '}
                  ·{' '}
                  <b class="q">
                    {sym.rhsLocal} = {sci(rhsLocal)} {sym.ur}
                  </b>
                </>
              )}
            </span>
            <span>
              השדה במרכז: <b class="q">|{sc.kind}| = {sci(clean(Fmag, ref.F))} {sc.kind === 'E' ? (sceneId === 'rod' ? 'N/C' : 'V/m') : 'T'}</b>
            </span>
          </>
        }
        controls={
          <>
            <div class="group" role="group" aria-label="גבולות">
              <Toggle label="סטטי: שום דבר לא משתנה בזמן" on={s.still} onChange={(v) => user({ ...s, still: v })} />
              <Toggle label="ריק: אין מטען ואין זרם" on={s.empty} onChange={(v) => user({ ...s, empty: v })} />
            </div>
            <Slider
              label={box ? 'צלע התיבה a' : 'צלע הלולאה a'}
              value={s.a}
              min={A_MIN}
              max={A_MAX}
              step={0.0025}
              format={cm}
              onChange={(v) => user({ ...s, a: Math.round(v * 4000) / 4000 })}
            />
          </>
        }
      />
    </div>
  );
}

/** a curved arrow at the loop's centre: counter-clockwise for a positive curl, clockwise for negative, a dot for 0 */
function spinGlyph(ctx: CanvasRenderingContext2D, [x, y]: [number, number], r: number, sign: number, ink: string) {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2;
  if (sign === 0 || r < 6) {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  // on screen y is down: a counter-clockwise turn runs from angle 0 towards −π/2…
  const a0 = 0.35;
  const a1 = 2 * Math.PI - 0.35;
  ctx.beginPath();
  ctx.arc(x, y, r, -a0, -a1, true);
  ctx.stroke();
  // the head at the end of the turn
  const end = sign > 0 ? -a1 : -a0;
  const ex = x + r * Math.cos(end);
  const ey = y + r * Math.sin(end);
  // tangent in the walking direction on screen: counter-clockwise on screen means decreasing screen angle
  const tx = sign > 0 ? Math.sin(end) : -Math.sin(end);
  const ty = sign > 0 ? -Math.cos(end) : Math.cos(end);
  ctx.beginPath();
  ctx.moveTo(ex + tx * 6, ey + ty * 6);
  ctx.lineTo(ex - tx * 2 - ty * 5, ey - ty * 2 + tx * 5);
  ctx.lineTo(ex - tx * 2 + ty * 5, ey - ty * 2 - tx * 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
