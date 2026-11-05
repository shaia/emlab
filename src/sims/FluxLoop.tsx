/**
 * Magnetic flux through a loop. Built for lesson 5.1. Three views, chosen by `mode`:
 *
 * - `uniform`: a flat square loop in a uniform field B that points right. Two views of the same
 *   scene side by side: on the left from the side (the loop is seen edge-on, as a bar, with its
 *   normal n and the angle θ between n and B); on the right along the field, with the field lines
 *   coming at the reader (⊙). Each drawn line stands for LINE_FLUX of flux, so the lines are a
 *   square lattice of spacing √(LINE_FLUX/B), and the loop, seen along the field, is a rectangle
 *   s × s|cosθ|: the lines inside it are the lines that thread the loop. The readout gives
 *   Φ = B·A·cosθ from `fluxUniform`, and the line count from `linesThrough`.
 * - `wire`: a long straight wire in the page and a rectangle beside it, in the same plane. The field
 *   of the wire is ⊗ to its right (current up) and gets weaker with distance: the marks thin out as
 *   1/r, one mark per fixed flux. Above, a graph of B(r) on the same r axis, with one bar per strip:
 *   the flux is the sum of B·h·Δr over the strips (`wireStripSum`), and the exact value (infinitely
 *   many strips) is `wireRectFlux`.
 * - `closed`: a bar magnet with its closed field lines, and a circle, the section of a closed
 *   surface. Every crossing of a line with the circle is marked: a filled dot where the line leaves,
 *   a hollow square where it enters (`circleCrossings`). The count of each is equal wherever the
 *   circle is.
 *
 * Tasks tick only from the learner's own controls (`act`), never from a text step.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { fluxUniform, wireRectFlux } from '~/physics/induction';
import { circleCrossings, latticeInside, lineSpacing, linesThrough, wireB, wireStripSum, wireStrips } from '~/physics/loopflux';
import { traceLine } from '~/physics/magnetism';
import { barMagnetField, insideMagnet, poles, type BarMagnet } from '~/physics/magnets';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, chevron, depthGlyph, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

type Mode = 'uniform' | 'wire' | 'closed';

/** flux one drawn line stands for, in the uniform view [Wb] */
export const LINE_FLUX = 5e-4;
/** height of the strip under the two uniform-view panels that holds their titles [px] */
const BOTTOM = 28;
/** height of the rectangle beside the wire [m] */
export const WIRE_H = 0.2;
/** strip counts the strip slider steps through */
const STRIP_STEPS = [1, 2, 4, 8, 16, 32];

const ASPECT: Record<Mode, number> = { uniform: 1.6, wire: 1.25, closed: 1.5 };

const TASK_LABEL: Record<string, string> = {
  'three-ways': 'שנו את השטף בשלוש דרכים: בפס של B, בפס של צלע הלולאה ובפס של הזווית.',
  half: 'מצאו זווית שבה השטף הוא חצי מהשטף כשהלולאה פונה אל השדה.',
  'edge-on': 'הטו את הלולאה עד שאף קו לא עובר דרכה. מה הזווית, ומה השטף?',
  'flip-normal': 'הפכו את האנך, בלי להזיז את הלולאה. מה קרה לשטף?',
  'more-strips': 'חלקו את המלבן ל-8 רצועות או יותר. כמה קרוב הסכום לערך המדויק?',
  'move-away': 'הרחיקו את המלבן מהתיל, עד שהצלע הקרובה רחוקה ממנו פי 2 לפחות. מה קרה לשטף?',
  'reverse-current': 'הפכו את כיוון הזרם בתיל. מה קרה לסימן של השטף?',
  'around-north': 'הקיפו בעיגול רק את הקוטב הצפוני. כמה קווים יוצאים, וכמה נכנסים?',
  'whole-magnet': 'הקיפו בעיגול את כל המגנט. מה הנטו?',
};

export interface FluxLoopProps {
  id: string;
  mode?: Mode;
  /** uniform: field [T], loop side [m], angle between the normal and B [deg] */
  B?: number;
  side?: number;
  theta?: number;
  /** wire: current [A] (sign: + up the page), near-side distance [m], width [m], strips */
  I?: number;
  r1?: number;
  width?: number;
  strips?: number;
  /** closed: circle centre and radius [m], in the magnet's frame (magnet centred at 0) */
  cx?: number;
  cy?: number;
  r?: number;
  tasks?: string[];
}

interface State {
  B: number;
  s: number;
  /** signed angle of the chosen normal from +x (the field direction) [deg], in (−180, 180] */
  ang: number;
  I: number;
  r1: number;
  w: number;
  n: number;
  cx: number;
  cy: number;
  r: number;
}

const wrap = (a: number) => {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
};
const thetaOf = (ang: number) => Math.abs(wrap(ang));
const round = (x: number, step: number) => Math.round(x / step) * step;
const clean = (x: number) => (Math.abs(x) < 1e-15 ? 0 : x);

/* ------------------------------------------------------------------ the magnet of `closed` */

const MAGNET: BarMagnet = { x: 0, y: 0, angle: 0, L: 0.3, R: 0.045, NI: 400 };
const CLOSED_W = 1.2;
const CLOSED_H = CLOSED_W / ASPECT.closed;
const SEEDS = [-0.65, -0.25, 0.25, 0.65];

function magnetLines(): Vec2[][] {
  const f = (x: number, y: number) => barMagnetField(MAGNET, x, y);
  const bounds = { xmin: -CLOSED_W, xmax: CLOSED_W, ymin: -CLOSED_H, ymax: CLOSED_H };
  return SEEDS.map((k) => {
    const seed: Vec2 = [0, k * MAGNET.R];
    const fwd = traceLine(f, seed, { bounds, step: 0.004, maxSteps: 2500, direction: 1 });
    if (fwd.end === 'closed') return fwd.points;
    const back = traceLine(f, seed, { bounds, step: 0.004, maxSteps: 2500, direction: -1 });
    return [...back.points.slice().reverse(), ...fwd.points.slice(1)];
  });
}

/* ------------------------------------------------------------------ component */

export default function FluxLoop(props: FluxLoopProps) {
  const mode: Mode = props.mode ?? 'uniform';
  const init = (): State => ({
    B: props.B ?? 0.2,
    s: props.side ?? 0.2,
    ang: props.theta ?? 0,
    I: props.I ?? 10,
    r1: props.r1 ?? 0.05,
    w: props.width ?? 0.1,
    n: props.strips ?? 1,
    cx: props.cx ?? -0.3,
    cy: props.cy ?? -0.2,
    r: props.r ?? 0.1,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const [lines, setLines] = useState<Vec2[][] | null>(null);
  const changed = useRef(new Set<string>());
  const startR1 = useRef(s.r1);
  const dragging = useRef<null | 'normal' | 'rect' | 'circle'>(null);
  const dragOff = useRef<Vec2>([0, 0]);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t);
  const done = (t: string) => markTask(`${props.id}:${t}`);

  useEffect(() => {
    if (mode === 'closed') setLines(magnetLines());
  }, [mode]);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const num = (k: string, cur: number) => (typeof st[k] === 'number' ? (st[k] as number) : cur);
          const next: State = {
            ...prev,
            B: num('B', prev.B),
            s: num('side', prev.s),
            ang: num('theta', prev.ang),
            I: num('I', prev.I),
            r1: num('r1', prev.r1),
            w: num('width', prev.w),
            n: num('strips', prev.n),
            cx: num('cx', prev.cx),
            cy: num('cy', prev.cy),
            r: num('r', prev.r),
          };
          startR1.current = next.r1;
          return next;
        });
      }),
    [props.id],
  );

  /* ---------------------------------------------------------------- physics of the current state */

  const theta = thetaOf(s.ang);
  const thRad = (s.ang * Math.PI) / 180;
  const A = s.s * s.s;
  const phi = clean(fluxUniform(s.B, A, thRad));
  const phiMax = fluxUniform(s.B, A, 0);
  const nLines = linesThrough(s.B, s.s, thRad, LINE_FLUX);
  const r2 = s.r1 + s.w;
  const phiStrips = wireStripSum(s.I, WIRE_H, s.r1, r2, s.n);
  const phiWire = wireRectFlux(s.I, WIRE_H, s.r1, r2);

  const magnetPoles = poles(MAGNET);
  const inCircle = (p: Vec2) => Math.hypot(p[0] - s.cx, p[1] - s.cy) < s.r;
  const cross = lines
    ? lines.reduce(
        (acc, l) => {
          const c = circleCrossings(l, [s.cx, s.cy], s.r);
          acc.out += c.out;
          acc.in += c.in;
          acc.at.push(...c.at);
          return acc;
        },
        { out: 0, in: 0, at: [] as { p: Vec2; out: boolean }[] },
      )
    : null;

  /* ---------------------------------------------------------------- learner actions */

  const act = (patch: Partial<State>, what?: string) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (mode === 'uniform') {
        if (what) changed.current.add(what);
        const th = thetaOf(next.ang);
        if (has('three-ways') && ['B', 's', 'theta'].every((k) => changed.current.has(k))) done('three-ways');
        if (has('half') && Math.abs(Math.cos((next.ang * Math.PI) / 180) - 0.5) < 1e-9) done('half');
        if (has('edge-on') && th === 90) done('edge-on');
        if (has('flip-normal') && what === 'flip' && th !== 90) done('flip-normal');
      } else if (mode === 'wire') {
        if (has('more-strips') && next.n >= 8) done('more-strips');
        if (has('move-away') && next.r1 >= 2 * startR1.current - 1e-9) done('move-away');
        if (has('reverse-current') && what === 'reverse') done('reverse-current');
      } else {
        const inC = (p: Vec2) => Math.hypot(p[0] - next.cx, p[1] - next.cy) < next.r;
        const n = inC(magnetPoles.N);
        const sp = inC(magnetPoles.S);
        if (has('around-north') && n && !sp) done('around-north');
        if (has('whole-magnet') && n && sp) done('whole-magnet');
      }
      return next;
    });
  };

  const describe = (): string => {
    if (mode === 'uniform')
      return `לולאה ריבועית בשדה אחיד של ${sci(s.B)} טסלה, צלע ${sci(s.s * 100)} סנטימטרים, הזווית בין האנך לשדה ${theta} מעלות. ${Math.abs(nLines)} קווים עוברים דרכה. השטף ${sci(phi)} ובר.`;
    if (mode === 'wire')
      return `תיל ישר שזורם בו ${sci(Math.abs(s.I))} אמפר ${s.I > 0 ? 'למעלה' : 'למטה'}, ומלבן לידו בגובה ${WIRE_H * 100} סנטימטרים, מ-${sci(s.r1 * 100)} עד ${sci(r2 * 100)} סנטימטרים מהתיל. הסכום על ${s.n} רצועות ${sci(phiStrips)} ובר, והערך המדויק ${sci(phiWire)} ובר.`;
    return cross
      ? `מגנט מוט ועיגול. ${cross.out} קווים יוצאים מהעיגול ו-${cross.in} נכנסים אליו. הנטו ${cross.out - cross.in}.`
      : 'מגנט מוט ועיגול.';
  };

  /* ---------------------------------------------------------------- drawing helpers */

  const text = (ctx: CanvasRenderingContext2D, p: Palette, t: string, x: number, y: number, o: { color?: string; size?: number; align?: CanvasTextAlign; rtl?: boolean; weight?: number; italic?: boolean; box?: boolean } = {}) => {
    ctx.save();
    ctx.font = `${o.italic ? 'italic ' : ''}${o.weight ?? 500} ${o.size ?? 13}px ${p.fontUi}`;
    if (o.box) {
      const w = ctx.measureText(t).width;
      const a = o.align ?? 'center';
      const x0 = a === 'left' ? x : a === 'right' ? x - w : x - w / 2;
      ctx.fillStyle = withAlpha(p.paper, 0.85);
      ctx.fillRect(x0 - 3, y - (o.size ?? 13) * 0.7, w + 6, (o.size ?? 13) * 1.4);
    }
    ctx.fillStyle = o.color ?? p.ink2;
    ctx.direction = o.rtl ? 'rtl' : 'ltr';
    ctx.textAlign = o.align ?? 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
    ctx.restore();
  };

  /* ---------------------------------------------------------------- uniform */

  const drawUniform = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const gap = W * 0.03;
    const pw = (W - gap) / 2;
    /** px per metre: both panels show 0.42 m of height */
    const k = (H * 0.8) / 0.42;
    const d = lineSpacing(s.B, LINE_FLUX);
    const c = Math.cos(thRad);
    const halfY = (s.s * Math.abs(c)) / 2;
    const rows = latticeInside(d, 0.2);
    const top = H * 0.04;
    const cyS = top + (H - BOTTOM - top) / 2;

    // panel frames and titles
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(1, top - 2, pw - 2, H - top - BOTTOM + 2);
    ctx.strokeRect(pw + gap + 1, top - 2, pw - 2, H - top - BOTTOM + 2);
    ctx.restore();
    text(ctx, p, 'מבט מהצד', pw / 2, H - 14, { rtl: true, color: p.ink, weight: 600, size: W < 500 ? 11 : 13 });
    // at the bottom: the reset and fullscreen buttons sit in the stage's top-right corner
    text(ctx, p, 'מבט לאורך השדה', pw + gap + pw / 2, H - 14, { rtl: true, color: p.ink, weight: 600, size: W < 500 ? 11 : 13 });

    // ---- side view
    const cxL = pw / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(2, top, pw - 4, H - top - BOTTOM - 2);
    ctx.clip();
    for (const y of rows) {
      const sy = cyS - y * k;
      const thread = Math.abs(y) < halfY - 1e-12;
      ctx.save();
      ctx.strokeStyle = p.bfield;
      ctx.globalAlpha = thread ? 1 : 0.4;
      ctx.lineWidth = thread ? 2.4 : 1.2;
      ctx.setLineDash([9, 11]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath();
      ctx.moveTo(6, sy);
      ctx.lineTo(pw - 6, sy);
      ctx.stroke();
      ctx.restore();
      chevron(ctx, pw - 18, sy, 1, 0, 6, withAlpha(p.bfield, thread ? 1 : 0.5));
    }
    // the loop edge-on: its plane is perpendicular to the normal
    const nx = Math.cos(thRad);
    const ny = Math.sin(thRad);
    const half = (s.s / 2) * k;
    const x1 = cxL - ny * half;
    const y1 = cyS - nx * half;
    const x2 = cxL + ny * half;
    const y2 = cyS + nx * half;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = withAlpha(p.equip, 0.25);
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = p.equip;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    const nl = 0.12 * k;
    arrow(ctx, cxL, cyS, cxL + nx * nl, cyS - ny * nl, { color: p.ink, width: 2.2, head: 11 });
    text(ctx, p, 'n', cxL + nx * (nl + 13), cyS - ny * (nl + 13), { color: p.ink, size: 15, weight: 600, italic: true });
    if (theta > 2) {
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cxL, cyS, 0.05 * k, 0, -thRad, thRad > 0);
      ctx.stroke();
      ctx.restore();
      const mid = thRad / 2;
      text(ctx, p, 'θ', cxL + Math.cos(mid) * 0.075 * k, cyS - Math.sin(mid) * 0.075 * k, { color: p.ink2, size: 14 });
    }
    ctx.restore();
    text(ctx, p, 'B →', 12, top + 14, { color: p.bfield, size: 15, weight: 600, italic: true, align: 'left' });

    // ---- along-field view: lines are dots, the loop is a rectangle s × s|cosθ|
    const ox = pw + gap;
    const cxR = ox + pw / 2;
    const cols = latticeInside(d, Math.min(pw / 2 / k, 0.4));
    const halfZ = s.s / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox + 2, top, pw - 4, H - top - BOTTOM - 2);
    ctx.clip();
    // the loop's face: tinted from the normal's side, hatched from its back
    const rx = cxR - halfZ * k;
    const ry = cyS - halfY * k;
    const rw = 2 * halfZ * k;
    const rh = 2 * halfY * k;
    if (rh > 0.5) {
      ctx.save();
      if (c > 0) {
        ctx.fillStyle = withAlpha(p.equip, 0.12);
        ctx.fillRect(rx, ry, rw, rh);
      } else {
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        ctx.strokeStyle = withAlpha(p.equip, 0.35);
        ctx.lineWidth = 1;
        for (let u = -rh; u < rw + rh; u += 9) {
          ctx.beginPath();
          ctx.moveTo(rx + u, ry);
          ctx.lineTo(rx + u - rh, ry + rh);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    for (const y of rows) {
      for (const z of cols) {
        const thread = Math.abs(y) < halfY - 1e-12 && Math.abs(z) < halfZ - 1e-12;
        const sx = cxR + z * k;
        const sy = cyS - y * k;
        if (thread) depthGlyph(ctx, sx, sy, 6, 'out', p.bfield, { fill: p.paper });
        else depthGlyph(ctx, sx, sy, 3.2, 'out', p.bfield, { alpha: 0.4, width: 1 });
      }
    }
    ctx.save();
    ctx.strokeStyle = p.equip;
    ctx.lineWidth = 3;
    if (rh > 0.5) ctx.strokeRect(rx, ry, rw, rh);
    else {
      ctx.beginPath();
      ctx.moveTo(rx, cyS);
      ctx.lineTo(rx + rw, cyS);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  };

  /* ---------------------------------------------------------------- wire */

  /** the r axis: the wire at x = 0.1 of the width, 0.5 m across */
  const wireMap = (W: number) => {
    const k = W / 0.5;
    const x0 = W * 0.12;
    return { k, x0, X: (r: number) => x0 + r * k, R: (x: number) => (x - x0) / k };
  };

  const drawWire = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const { k, x0, X } = wireMap(W);
    const gTop = H * 0.06;
    const gBot = H * 0.36;
    const B = (r: number) => Math.abs(wireB(s.I, r));
    const Bref = Math.abs(wireB(20, 0.05)); // fixed scale; the curve is clipped nearer the wire
    const Y = (b: number) => gBot - (Math.min(b, Bref) / Bref) * (gBot - gTop);

    // ---- the graph of B(r) with the strip bars
    const strips = wireStrips(s.I, s.r1, r2, s.n);
    ctx.save();
    for (const st of strips) {
      const b = Math.abs(st.height);
      ctx.fillStyle = withAlpha(p.bfield, 0.22);
      ctx.strokeStyle = withAlpha(p.bfield, 0.8);
      ctx.lineWidth = 1;
      const xa = X(st.x0);
      const xb = X(st.x1);
      ctx.fillRect(xa, Y(b), xb - xa, gBot - Y(b));
      ctx.strokeRect(xa, Y(b), xb - xa, gBot - Y(b));
    }
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, gTop - 4);
    ctx.lineTo(x0, gBot);
    ctx.lineTo(W - 6, gBot);
    ctx.stroke();
    ctx.strokeStyle = p.bfield;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let started = false;
    for (let x = X(0.012); x < W - 6; x += 2) {
      const b = B((x - x0) / k);
      if (b > Bref) continue; // off the top of the graph: the curve starts where it enters
      if (!started) ctx.moveTo(x, Y(b));
      else ctx.lineTo(x, Y(b));
      started = true;
    }
    ctx.stroke();
    ctx.restore();
    text(ctx, p, 'B', x0 - 12, gTop + 4, { color: p.bfield, size: 14, weight: 600, italic: true });
    text(ctx, p, 'r', W - 12, gBot - 10, { color: p.ink2, size: 14, italic: true });
    text(ctx, p, 'B = μ₀I/(2πr)', W - 10, gTop + 44, { color: p.bfield, size: 12, align: 'right' });

    // ---- the plane: the wire, the field marks, the rectangle
    const pTop = H * 0.44;
    const pBot = H * 0.98;
    const cy = (pTop + pBot) / 2;
    const out = s.I < 0; // the field to the right of the wire is ⊙ when the current runs down
    // marks: columns 2 cm apart, one mark per fixed flux: vertical spacing ∝ 1/B
    const dx = 0.02;
    const markFlux = Math.abs(wireB(10, 0.1)) * dx * 0.03; // at 10 cm from 10 A, one mark per 3 cm
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, pTop, W, pBot - pTop);
    ctx.clip();
    for (let r = dx / 2; X(r) < W; r += dx) {
      const b = B(r);
      if (b === 0) break;
      const dy = Math.max(9 / k, markFlux / (b * dx));
      const n = Math.floor((pBot - pTop) / (dy * k) / 2) + 1;
      // a fixed pseudo-random offset per column, so the marks do not line up into rays from the middle
      const jitter = ((Math.sin(r * 9173.3) * 43758.5453) % 1 + 1) % 1;
      for (let j = -n; j <= n; j++) {
        const sy = cy + (j + jitter - 0.5) * dy * k;
        if (sy < pTop + 4 || sy > pBot - 4) continue;
        for (const side of [1, -1]) {
          const sx = x0 + side * r * k;
          if (sx < 4) continue;
          const dir = side > 0 ? (out ? 'out' : 'in') : out ? 'in' : 'out';
          const inside = side > 0 && r > s.r1 && r < r2 && Math.abs(sy - cy) < (WIRE_H / 2) * k;
          ctx.globalAlpha = inside ? 0.95 : 0.4;
          const d = 3.2;
          ctx.strokeStyle = p.bfield;
          ctx.fillStyle = p.bfield;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          if (dir === 'out') {
            ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.moveTo(sx - d, sy - d);
            ctx.lineTo(sx + d, sy + d);
            ctx.moveTo(sx - d, sy + d);
            ctx.lineTo(sx + d, sy - d);
            ctx.stroke();
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    // the strips inside the rectangle, shaded by their field
    const ry1 = cy - (WIRE_H / 2) * k;
    const ry2 = cy + (WIRE_H / 2) * k;
    for (const st of strips) {
      const a = 0.05 + 0.3 * Math.min(1, Math.abs(st.height) / Bref);
      ctx.fillStyle = withAlpha(p.bfield, a);
      ctx.fillRect(X(st.x0), ry1, X(st.x1) - X(st.x0), ry2 - ry1);
      ctx.strokeStyle = withAlpha(p.equip, 0.6);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X(st.x1), ry1);
      ctx.lineTo(X(st.x1), ry2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = p.equip;
    ctx.lineWidth = 3;
    ctx.strokeRect(X(s.r1), ry1, X(r2) - X(s.r1), ry2 - ry1);
    // the wire
    ctx.strokeStyle = p.current;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0, pTop);
    ctx.lineTo(x0, pBot);
    ctx.stroke();
    ctx.restore();
    const dir = s.I > 0 ? -1 : 1;
    const shift = ((t * 30) % 40) * dir;
    for (let y = pTop + 20 + ((shift % 40) + 40) % 40; y < pBot - 6; y += 40) chevron(ctx, x0, y, 0, dir, 7, p.paper);
    text(ctx, p, 'I', x0 - 14, pTop + 16, { color: p.current, size: 15, weight: 600, italic: true, box: true });
    // distances
    const ly = ry2 + 14;
    text(ctx, p, `r₁ = ${sci(s.r1 * 100)} cm`, X(s.r1), ly, { size: 11, align: 'right', box: true });
    text(ctx, p, `r₂ = ${sci(r2 * 100)} cm`, X(r2) + 4, ly, { size: 11, align: 'left', box: true });
    text(ctx, p, `h = ${WIRE_H * 100} cm`, X(r2) + 6, cy, { size: 11, align: 'left', box: true });
  };

  /* ---------------------------------------------------------------- closed */

  const closedMap = (W: number, H: number) => {
    const k = Math.min(W / CLOSED_W, H / CLOSED_H);
    return { k, X: (x: number) => W / 2 + x * k, Y: (y: number) => H / 2 - y * k };
  };

  const drawClosed = ({ ctx, view, palette: p }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const { k, X, Y } = closedMap(W, H);
    // the circle: tinted inside
    ctx.save();
    ctx.fillStyle = withAlpha(p.accent, 0.07);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(X(s.cx), Y(s.cy), s.r * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // field lines, with arrows along them
    if (lines) {
      for (const l of lines) {
        ctx.save();
        ctx.strokeStyle = p.bfield;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        l.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.stroke();
        ctx.restore();
        let acc = 0;
        for (let i = 1; i < l.length; i++) {
          acc += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
          if (acc > 0.16) {
            acc = 0;
            const ux = l[i][0] - l[i - 1][0];
            const uy = l[i][1] - l[i - 1][1];
            const m = Math.hypot(ux, uy) || 1;
            if (!insideMagnet(MAGNET, l[i][0], l[i][1], 0.005)) chevron(ctx, X(l[i][0]), Y(l[i][1]), ux / m, -uy / m, 6, p.bfield);
          }
        }
      }
    }
    // the magnet
    const mx = X(-MAGNET.L / 2);
    const my = Y(MAGNET.R);
    const mw = MAGNET.L * k;
    const mh = 2 * MAGNET.R * k;
    ctx.save();
    ctx.fillStyle = withAlpha(p.pos, 0.85);
    ctx.fillRect(mx + mw / 2, my, mw / 2, mh);
    ctx.fillStyle = withAlpha(p.bfield, 0.85);
    ctx.fillRect(mx, my, mw / 2, mh);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mx, my, mw, mh);
    ctx.restore();
    text(ctx, p, 'N', mx + mw * 0.9, my + mh / 2, { color: '#ffffff', size: 14, weight: 700 });
    text(ctx, p, 'S', mx + mw * 0.1, my + mh / 2, { color: '#ffffff', size: 14, weight: 700 });
    // the lines inside the magnet, drawn over it
    if (lines) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(mx, my, mw, mh);
      ctx.clip();
      ctx.strokeStyle = withAlpha('#ffffff', 0.85);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      for (const l of lines) {
        ctx.beginPath();
        l.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.stroke();
      }
      ctx.restore();
    }
    // the crossings: a filled dot where a line leaves, a hollow square where it enters
    if (cross) {
      for (const c of cross.at) {
        const sx = X(c.p[0]);
        const sy = Y(c.p[1]);
        ctx.save();
        ctx.lineWidth = 2;
        if (c.out) {
          ctx.fillStyle = p.ink;
          ctx.beginPath();
          ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = p.paper;
          ctx.strokeStyle = p.ink;
          ctx.lineWidth = 1.6;
          ctx.fillRect(sx - 4, sy - 4, 8, 8);
          ctx.strokeRect(sx - 4, sy - 4, 8, 8);
        }
        ctx.restore();
      }
    }
  };

  const draw = (f: FrameInfo) => {
    if (mode === 'uniform') drawUniform(f);
    else if (mode === 'wire') drawWire(f);
    else drawClosed(f);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: ASPECT[mode], worldHeight: 1, animate: mode !== 'closed' });
  useEffect(invalidate, [s, lines]);

  /* ---------------------------------------------------------------- pointer and keyboard */

  const normalTip = (): Vec2 | null => {
    const v = viewRef.current;
    if (!v) return null;
    const W = v.w;
    const H = v.h;
    const gap = W * 0.03;
    const pw = (W - gap) / 2;
    const k = (H * 0.8) / 0.42;
    const top = H * 0.04;
    const cyS = top + (H - BOTTOM - top) / 2;
    const nl = 0.12 * k;
    return [pw / 2 + Math.cos(thRad) * nl, cyS - Math.sin(thRad) * nl];
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    if (mode === 'uniform') {
      const tip = normalTip();
      if (tip && Math.hypot(e.offsetX - tip[0], e.offsetY - tip[1]) < 24) dragging.current = 'normal';
    } else if (mode === 'wire') {
      const { k, X } = wireMap(v.w);
      const cy = (v.h * 0.44 + v.h * 0.98) / 2;
      if (e.offsetX > X(s.r1) - 8 && e.offsetX < X(r2) + 8 && Math.abs(e.offsetY - cy) < (WIRE_H / 2) * k + 8) {
        dragging.current = 'rect';
        dragOff.current = [e.offsetX - X(s.r1), 0];
      }
    } else {
      const { k, X, Y } = closedMap(v.w, v.h);
      if (Math.hypot(e.offsetX - X(s.cx), e.offsetY - Y(s.cy)) < s.r * k) {
        dragging.current = 'circle';
        dragOff.current = [e.offsetX - X(s.cx), e.offsetY - Y(s.cy)];
      }
    }
    if (dragging.current) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const clampCircle = (cx: number, cy: number, r: number): [number, number] => {
    const mx = CLOSED_W / 2 - r - 0.02;
    const my = CLOSED_H / 2 - r - 0.02;
    return [Math.max(-mx, Math.min(mx, round(cx, 0.01))), Math.max(-my, Math.min(my, round(cy, 0.01)))];
  };

  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v || !dragging.current) return;
    if (dragging.current === 'normal') {
      const W = v.w;
      const gap = W * 0.03;
      const pw = (W - gap) / 2;
      const top = v.h * 0.04;
      const cyS = top + (v.h - BOTTOM - top) / 2;
      const a = (Math.atan2(cyS - e.offsetY, e.offsetX - pw / 2) * 180) / Math.PI;
      const next = wrap(round(a, 5));
      if (next !== s.ang) act({ ang: next }, 'theta');
    } else if (dragging.current === 'rect') {
      const { R } = wireMap(v.w);
      const r1 = Math.max(0.02, Math.min(0.15, round(R(e.offsetX - dragOff.current[0]), 0.01)));
      if (Math.abs(r1 - s.r1) > 1e-9) act({ r1 });
    } else {
      const { k } = closedMap(v.w, v.h);
      const cx = (e.offsetX - dragOff.current[0] - v.w / 2) / k;
      const cy = -(e.offsetY - dragOff.current[1] - v.h / 2) / k;
      const [x, y] = clampCircle(cx, cy, s.r);
      if (x !== s.cx || y !== s.cy) act({ cx: x, cy: y });
    }
  };

  const onPointerUp = () => {
    if (dragging.current) setLive(describe());
    dragging.current = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;
    e.preventDefault();
    const sgn = key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 1;
    if (mode === 'uniform') act({ ang: wrap(s.ang + sgn * (e.shiftKey ? 15 : 5)) }, 'theta');
    else if (mode === 'wire') act({ r1: Math.max(0.02, Math.min(0.15, round(s.r1 + sgn * 0.01, 0.01))) });
    else {
      const horiz = key === 'ArrowLeft' || key === 'ArrowRight';
      const [x, y] = clampCircle(s.cx + (horiz ? sgn * 0.02 : 0), s.cy + (horiz ? 0 : sgn * 0.02), s.r);
      act({ cx: x, cy: y });
    }
    setLive(describe());
  };

  /* ---------------------------------------------------------------- panel */

  const readout = () => {
    if (mode === 'uniform')
      return (
        <>
          <span>
            <b class="q">B = {sci(s.B)} T</b>, צלע <b class="q">{sci(s.s * 100)} cm</b>, שטח <b class="q">A = {sci(A)} m²</b>, זווית בין האנך לשדה <b class="q">θ = {theta}°</b>
          </span>
          <span>
            קווים שעוברים דרך הלולאה: <b class="q">{nLines < 0 ? '−' : ''}{Math.abs(nLines)}</b> (כל קו מייצג <b class="q">{sci(LINE_FLUX)} Wb</b>).{' '}
            {theta === 90
              ? 'הלולאה מקבילה לקווים.'
              : Math.cos(thRad) > 0
                ? 'במבט לאורך השדה רואים את הצד של האנך.'
                : 'במבט לאורך השדה רואים את הגב: הקווים עוברים נגד האנך.'}
          </span>
          <span>
            השטף: <b class="q">Φ = B·A·cosθ = {sci(phi)} Wb</b>
            {Math.abs(phiMax) > 0 && (
              <>
                {' '}
                (פי <b class="q">{sci(phi / phiMax, 2)}</b> מהשטף כשהלולאה פונה אל השדה)
              </>
            )}
          </span>
        </>
      );
    if (mode === 'wire')
      return (
        <>
          <span>
            השדה ליד הצלע הקרובה <b class="q">{sci(Math.abs(wireB(s.I, s.r1)))} T</b>, ליד הרחוקה <b class="q">{sci(Math.abs(wireB(s.I, r2)))} T</b>
          </span>
          <span>
            סכום על {s.n === 1 ? 'רצועה אחת' : `${s.n} רצועות`}: <b class="q">Φ ≈ ΣB·h·Δr = {sci(phiStrips)} Wb</b>
          </span>
          <span>
            הערך המדויק: <b class="q">Φ = {sci(phiWire)} Wb</b>. האנך שבחרנו: לתוך הדף (⊗).
          </span>
        </>
      );
    return cross ? (
      <>
        <span>
          יוצאים מהעיגול: <b class="q">{cross.out}</b> · נכנסים אליו: <b class="q">{cross.in}</b> · נטו: <b class="q">{cross.out - cross.in}</b>
        </span>
        <span>
          {inCircle(magnetPoles.N) && !inCircle(magnetPoles.S)
            ? 'בתוך העיגול רק הקוטב הצפוני.'
            : inCircle(magnetPoles.S) && !inCircle(magnetPoles.N)
              ? 'בתוך העיגול רק הקוטב הדרומי.'
              : inCircle(magnetPoles.N)
                ? 'כל המגנט בתוך העיגול.'
                : 'אף קוטב אינו בתוך העיגול.'}
        </span>
      </>
    ) : (
      <span>מחשבים את קווי השדה…</span>
    );
  };

  const controls = () => {
    if (mode === 'uniform')
      return (
        <>
          <Slider label="הזווית θ" value={theta} min={0} max={180} step={5} format={(v) => `${v}°`} onChange={(v) => act({ ang: s.ang < 0 ? -round(v, 5) : round(v, 5) }, 'theta')} />
          <Slider label="השדה B" value={s.B} min={0.1} max={0.5} step={0.1} format={(v) => `${sci(v)} T`} onChange={(v) => act({ B: round(v, 0.1) }, 'B')} />
          <Slider label="צלע הלולאה" value={s.s} min={0.1} max={0.3} step={0.05} format={(v) => `${sci(v * 100)} cm`} onChange={(v) => act({ s: round(v, 0.05) }, 's')} />
          <div class="group" role="group" aria-label="האנך">
            <button type="button" class="toggle" onClick={() => act({ ang: wrap(s.ang + 180) }, 'flip')}>
              הפכו את האנך
            </button>
          </div>
        </>
      );
    if (mode === 'wire') {
      const idx = Math.max(0, STRIP_STEPS.indexOf(s.n));
      return (
        <>
          <Slider label="מספר הרצועות" value={idx} min={0} max={STRIP_STEPS.length - 1} step={1} format={(v) => `${STRIP_STEPS[Math.round(v)]}`} onChange={(v) => act({ n: STRIP_STEPS[Math.round(v)] })} />
          <Slider label="מרחק הצלע הקרובה" value={s.r1} min={0.02} max={0.15} step={0.01} format={(v) => `${sci(v * 100)} cm`} onChange={(v) => act({ r1: round(v, 0.01) })} />
          <Slider label="רוחב המלבן" value={s.w} min={0.05} max={0.2} step={0.01} format={(v) => `${sci(v * 100)} cm`} onChange={(v) => act({ w: round(v, 0.01) })} />
          <Slider label="הזרם" value={Math.abs(s.I)} min={5} max={20} step={5} format={(v) => `${sci(v)} A`} onChange={(v) => act({ I: Math.sign(s.I) * round(v, 5) })} />
          <div class="group" role="group" aria-label="כיוון הזרם">
            <button type="button" class="toggle" onClick={() => act({ I: -s.I }, 'reverse')}>
              כיוון הזרם: {s.I > 0 ? 'למעלה' : 'למטה'}
            </button>
          </div>
        </>
      );
    }
    return (
      <Slider
        label="רדיוס העיגול"
        value={s.r}
        min={0.06}
        max={0.3}
        step={0.02}
        format={(v) => `${sci(v * 100)} cm`}
        onChange={(v) => {
          const r = round(v, 0.02);
          const [x, y] = clampCircle(s.cx, s.cy, r);
          act({ r, cx: x, cy: y });
        }}
      />
    );
  };

  const help =
    mode === 'uniform'
      ? 'גררו את קצה האנך בעכבר או במגע; במקלדת: חיצים מסובבים.'
      : mode === 'wire'
        ? 'גררו את המלבן ימינה ושמאלה; במקלדת: חיצים מזיזים אותו.'
        : 'גררו את העיגול; במקלדת: חיצים מזיזים אותו.';

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${describe()} ${help}`}
      canvasRef={canvasRef}
      aspect={ASPECT[mode]}
      live={live}
      tasks={tasks}
      onReset={() => {
        const fresh = init();
        changed.current.clear();
        startR1.current = fresh.r1;
        setS(fresh);
        setLive('האיור אופס.');
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={mode === 'uniform' ? 'default' : 'grab'}
      readout={readout()}
      controls={controls()}
    />
  );
}
