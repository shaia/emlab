/**
 * The force on a current-carrying wire in a uniform magnetic field, F = I L×B. Built for lesson 4.7.
 *
 * Three views, chosen by `mode` (and the mode buttons when `modes` lists more than one):
 * - `perp`: seen from above, a long straight wire crosses a field region of ⊗ (or ⊙) between the
 *   poles of a magnet above and below the page. Only the piece inside the region (its width is the
 *   "length in the field" slider) gets a force, drawn as an arrow in the page. The carriers can be
 *   shown, as positive charges moving with I or as electrons moving against it: each one inside the
 *   field carries its own small Lorentz force arrow, all of them the same way as the wire's.
 * - `angle`: the field runs across the page from a N pole on the left to a S pole on the right, and a
 *   piece of wire of length L turns to an angle α from B. The force is perpendicular to the page,
 *   ⊙ or ⊗, of size BIL·sinα; the dashed sides show the parts L·sinα and L·cosα of the wire.
 * - `balance`: a current balance. A U-shaped wire frame hangs from one end of a balance beam, its
 *   lower side (5 cm) inside a ⊗ field; masses go on the pan at the other end. With the current
 *   on, the beam tips until the weight of the masses equals BIL. The field is hidden: the learner
 *   measures it, and the readout gives B = mg/(IL) once the beam is level.
 *
 * Every number comes from src/physics (wireForce, wireForceVec, balanceField). The drawing is not
 * to scale: the force arrow is proportional to F up to a cap, the frame is drawn larger than 5 cm.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { G } from '~/physics/constants';
import { wireForce, wireForceVec } from '~/physics/magnetism';
import { balanceField } from '~/physics/wireforce';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, chevron, depthField, depthGlyph, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const ASPECT = 1.6;
type Mode = 'perp' | 'angle' | 'balance';
type Carriers = 'none' | 'pos' | 'neg';

/** length of the balance frame's lower side, inside the field [m] */
export const L_BALANCE = 0.05;
/** smallest mass on the balance [g] */
const MASS_STEP = 0.1;
/** force drawn at the full arrow length [N]; larger forces are capped (and say so) */
const F_REF = 0.1;

const MODE_NAME: Record<Mode, string> = {
  perp: 'תיל ניצב לשדה',
  angle: 'תיל בזווית לשדה',
  balance: 'מאזני זרם',
};

const TASK_LABEL: Record<string, string> = {
  'reverse-current': 'הפכו את כיוון הזרם. לאן פונה הכוח עכשיו?',
  'reverse-field': 'הפכו את כיוון השדה (⊗ או ⊙). מה קרה לכוח?',
  'double-length': 'הכפילו את האורך שבתוך השדה. פי כמה גדל הכוח?',
  electrons: 'הציגו את נושאי המטען כאלקטרונים. האם כיוון הכוח השתנה?',
  parallel: 'סובבו את התיל עד שיהיה מקביל לשדה. כמה הכוח?',
  half: 'מצאו זווית שבה הכוח הוא חצי מהכוח בזווית ישרה.',
  balance: 'הפעילו זרם, ואזנו את המאזניים במשקולות. מה השדה?',
};

export interface WireForceProps {
  id: string;
  mode?: Mode;
  /** the modes the learner may switch between (buttons appear when there are two or more) */
  modes?: Mode[];
  /** current [A], field [T], length in the field [m], angle between I and B [deg] */
  I?: number;
  B?: number;
  L?: number;
  alpha?: number;
  /** current direction: perp +1 = to the right; balance +1 = right-to-left along the lower side (force down) */
  dirI?: 1 | -1;
  dirB?: 'in' | 'out';
  carriers?: Carriers;
  /** mass on the balance pan [g] */
  mass?: number;
  tasks?: string[];
}

interface State {
  mode: Mode;
  I: number;
  B: number;
  L: number;
  alpha: number;
  dirI: 1 | -1;
  dirB: 'in' | 'out';
  carriers: Carriers;
  mass: number;
}

const round = (x: number, step: number) => Math.round(x / step) * step;

/** The physics of the current state: the force vector [N] and what the balance does. */
function physics(s: State) {
  if (s.mode === 'perp') {
    const F = wireForceVec(s.I, [s.dirI * s.L, 0, 0], [0, 0, s.dirB === 'out' ? s.B : -s.B]);
    return { F, mag: Math.abs(F[1]), down: 0, balanced: false };
  }
  if (s.mode === 'angle') {
    const a = (s.alpha * Math.PI) / 180;
    const F = wireForceVec(s.I, [s.L * Math.cos(a), s.L * Math.sin(a), 0], [s.B, 0, 0]);
    return { F, mag: wireForce(s.I, s.L, s.B, a), down: 0, balanced: false };
  }
  // balance: lower side carries I right-to-left when dirI = +1, in a ⊗ field
  const F = wireForceVec(s.I, [-s.dirI * L_BALANCE, 0, 0], [0, 0, -s.B]);
  const weight = (s.mass / 1000) * G;
  const down = -F[1] - weight; // net downward pull on the frame's side [N]
  return { F, mag: Math.abs(F[1]), down, balanced: Math.abs(down) < 0.5 * (MASS_STEP / 1000) * G };
}

export default function WireForce(props: WireForceProps) {
  const init = (): State => ({
    mode: props.mode ?? 'perp',
    I: props.I ?? (props.mode === 'balance' ? 0 : 2),
    B: props.B ?? (props.mode === 'balance' ? 0.08 : 0.2),
    L: props.L ?? 0.1,
    alpha: props.alpha ?? 90,
    dirI: props.dirI ?? 1,
    dirB: props.dirB ?? 'in',
    carriers: props.carriers ?? 'none',
    mass: props.mass ?? 0,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const userActed = useRef(false);
  /** the length the "double it" task compares against; it moves only when another control changes */
  const baseL = useRef(s.L);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const modes = props.modes ?? [s.mode];
  const ph = physics(s);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => {
          const num = (k: keyof State) => (typeof st[k] === 'number' ? (st[k] as number) : (prev[k] as number));
          const next: State = {
            mode: st.mode === 'perp' || st.mode === 'angle' || st.mode === 'balance' ? st.mode : prev.mode,
            I: num('I'),
            B: num('B'),
            L: num('L'),
            alpha: num('alpha'),
            dirI: st.dirI === 1 || st.dirI === -1 ? st.dirI : prev.dirI,
            dirB: st.dirB === 'in' || st.dirB === 'out' ? st.dirB : prev.dirB,
            carriers: st.carriers === 'none' || st.carriers === 'pos' || st.carriers === 'neg' ? st.carriers : prev.carriers,
            mass: num('mass'),
          };
          baseL.current = next.L;
          return next;
        });
      }),
    [props.id],
  );

  const act = (patch: Partial<State>) => {
    userActed.current = true;
    setS((prev) => {
      const next = { ...prev, ...patch };
      const has = (t: string) => props.tasks?.includes(t);
      const done = (t: string) => markTask(`${props.id}:${t}`);
      if (patch.L !== undefined) {
        if (has('double-length') && Math.abs(patch.L - 2 * baseL.current) < 1e-9 && next.I > 0) done('double-length');
      } else baseL.current = next.L;
      if (has('reverse-current') && patch.dirI !== undefined && patch.dirI !== prev.dirI && next.mode === 'perp' && next.I > 0) done('reverse-current');
      if (has('reverse-field') && patch.dirB !== undefined && patch.dirB !== prev.dirB && next.I > 0) done('reverse-field');
      if (has('electrons') && patch.carriers === 'neg' && prev.carriers !== 'neg') done('electrons');
      if (next.mode === 'angle' && patch.alpha !== undefined && next.I > 0) {
        if (has('parallel') && (patch.alpha === 0 || patch.alpha === 180)) done('parallel');
        if (has('half') && (patch.alpha === 30 || patch.alpha === 150)) done('half');
      }
      if (has('balance') && next.mode === 'balance' && next.I > 0 && next.dirI === 1 && physics(next).balanced) done('balance');
      return next;
    });
  };

  const forceWords = (): string => {
    if (ph.mag < 1e-12) return 'אין כוח';
    if (s.mode === 'perp') return ph.F[1] > 0 ? 'למעלה, במישור הדף' : 'למטה, במישור הדף';
    if (s.mode === 'angle') return ph.F[2] > 0 ? 'החוצה מהדף (⊙)' : 'לתוך הדף (⊗)';
    return ph.F[1] < 0 ? 'למטה' : 'למעלה';
  };

  const describe = (): string => {
    if (s.mode === 'perp')
      return `תיל ניצב לשדה של ${sci(s.B)} טסלה ${s.dirB === 'in' ? 'לתוך הדף' : 'החוצה מהדף'}, זרם ${sci(s.I)} אמפר ${s.dirI === 1 ? 'ימינה' : 'שמאלה'}, ${sci(s.L * 100)} סנטימטרים בתוך השדה. הכוח ${sci(ph.mag)} ניוטון, ${forceWords()}.`;
    if (s.mode === 'angle')
      return `קטע תיל באורך ${sci(s.L * 100)} סנטימטרים בזווית ${s.alpha} מעלות לשדה של ${sci(s.B)} טסלה שפונה ימינה, זרם ${sci(s.I)} אמפר. הכוח ${sci(ph.mag)} ניוטון, ${forceWords()}.`;
    const state = ph.balanced ? 'המאזניים מאוזנים' : ph.down > 0 ? 'צד המסגרת נמשך למטה' : 'צד המשקולות כבד יותר';
    return `מאזני זרם: זרם ${sci(s.I)} אמפר, משקולות ${sci(s.mass)} גרם. ${state}.`;
  };

  useEffect(() => {
    if (!userActed.current) return;
    setLive(describe());
  }, [s]);

  /* ------------------------------------------------------------------ drawing */

  const drawCarriers = (ctx: CanvasRenderingContext2D, p: FrameInfo['palette'], x0: number, x1: number, y: number, box: { a: number; b: number }, t: number, fdir: number) => {
    if (s.carriers === 'none' || s.I === 0) return;
    const sign = s.carriers === 'pos' ? 1 : -1;
    const vdir = s.dirI * sign; // carriers move with I if positive, against it if negative
    const gap = 30;
    const shift = (((motionAllowed() ? t * 26 : 0) * vdir) % gap + gap) % gap;
    for (let x = x0 - gap + shift; x < x1 + gap; x += gap) {
      if (x < x0 || x > x1) continue;
      const inField = x > box.a && x < box.b;
      if (inField && fdir !== 0) arrow(ctx, x, y, x, y - 13 * fdir, { color: p.force, width: 1.3, head: 5, alpha: 0.75 });
      ctx.save();
      ctx.lineWidth = 1.4;
      if (sign > 0) {
        ctx.fillStyle = p.pos;
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x + 3, y);
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x, y + 3);
        ctx.stroke();
      } else {
        // an electron: a hollow ring with a minus, so it differs in shape as well as colour
        ctx.fillStyle = p.paper;
        ctx.strokeStyle = p.neg;
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x + 3, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const label = (ctx: CanvasRenderingContext2D, p: FrameInfo['palette'], text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center', size = 14) => {
    ctx.save();
    ctx.font = `600 ${size}px ${p.fontUi}`;
    ctx.fillStyle = color;
    ctx.direction = 'ltr';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  const drawPerp = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const wy = H * 0.55;
    const bw = (s.L / 0.2) * W * 0.62;
    const box = { x: W / 2 - bw / 2, y: H * 0.17, w: bw, h: H * 0.68 };
    // the field region
    ctx.save();
    ctx.fillStyle = withAlpha(p.bfield, 0.07);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = withAlpha(p.bfield, 0.7);
    ctx.lineWidth = 1.3;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    depthField(ctx, { x: box.x, y: box.y, w: box.w, h: box.h }, s.dirB, p.bfield, 26, 0.6);
    label(ctx, p, `B ${s.dirB === 'in' ? '⊗' : '⊙'}`, box.x + 6, box.y - 11, p.bfield, 'left');
    // the wire, across the whole stage
    ctx.save();
    ctx.strokeStyle = withAlpha(p.current, 0.55);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W * 0.03, wy);
    ctx.lineTo(W * 0.97, wy);
    ctx.stroke();
    ctx.strokeStyle = p.current;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(box.x, wy);
    ctx.lineTo(box.x + box.w, wy);
    ctx.stroke();
    ctx.restore();
    if (s.I > 0) {
      for (const fx of [0.09, 0.91]) chevron(ctx, W * fx, wy, s.dirI, 0, 9, p.current);
      label(ctx, p, 'I', s.dirI > 0 ? W * 0.05 : W * 0.95, wy - 16, p.current);
    }
    // bracket: the length in the field
    const by = box.y + box.h + 12;
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x, by - 5);
    ctx.lineTo(box.x, by);
    ctx.lineTo(box.x + box.w, by);
    ctx.lineTo(box.x + box.w, by - 5);
    ctx.stroke();
    ctx.restore();
    label(ctx, p, `L = ${sci(s.L * 100)} cm`, W / 2, by + 11, p.ink2, 'center', 13);
    const fdir = ph.mag < 1e-12 ? 0 : Math.sign(ph.F[1]);
    drawCarriers(ctx, p, W * 0.03, W * 0.97, wy, { a: box.x, b: box.x + box.w }, t, fdir);
    // the force on the wire, from the middle of the piece in the field
    if (fdir !== 0) {
      const len = Math.max(30, Math.min(1, ph.mag / F_REF) * H * 0.34);
      const x = W / 2;
      const tip = wy - fdir * len;
      arrow(ctx, x, wy, x, tip, { color: p.force, width: 3.6, head: 13, glow: withAlpha(p.paper, 0.9) });
      label(ctx, p, `F = ${sci(ph.mag)} N`, x + 14, tip + fdir * 6, p.force, 'left', 13);
    } else label(ctx, p, 'F = 0', W / 2 + 40, wy - 22, p.force, 'left', 13);
  };

  const drawAngle = ({ ctx, view, palette: p }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const pw = W * 0.09;
    // poles: N on the left, S on the right
    ctx.save();
    for (const [x, name] of [
      [0, 'N'],
      [W - pw, 'S'],
    ] as const) {
      ctx.fillStyle = withAlpha(p.ink2, 0.18);
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.4;
      ctx.fillRect(x, H * 0.08, pw, H * 0.84);
      ctx.strokeRect(x, H * 0.08, pw, H * 0.84);
      label(ctx, p, name, x + pw / 2, H * 0.5, p.ink, 'center', 20);
    }
    ctx.restore();
    // field lines, N → S
    for (let k = 0; k < 7; k++) {
      const y = H * (0.14 + k * 0.12);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.bfield, 0.55);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(pw, y);
      ctx.lineTo(W - pw, y);
      ctx.stroke();
      ctx.restore();
      chevron(ctx, pw + (W - 2 * pw) * 0.18, y, 1, 0, 6, withAlpha(p.bfield, 0.8));
      chevron(ctx, pw + (W - 2 * pw) * 0.82, y, 1, 0, 6, withAlpha(p.bfield, 0.8));
    }
    label(ctx, p, 'B →', pw + 10, H * 0.14 - 12, p.bfield, 'left');
    // the wire piece
    const a = (s.alpha * Math.PI) / 180;
    const half = (s.L / 0.2) * H * 0.36;
    const cx = W / 2;
    const cy = H * 0.52;
    const ux = Math.cos(a);
    const uy = -Math.sin(a); // screen y down
    const tx = cx - ux * half;
    const ty = cy - uy * half;
    const hx = cx + ux * half;
    const hy = cy + uy * half;
    // the parts of the wire across and along B, dashed
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.restore();
    if (Math.abs(hy - ty) > 18) label(ctx, p, 'L·sinα', hx + (ux >= 0 ? 8 : -8), (ty + hy) / 2, p.ink2, ux >= 0 ? 'left' : 'right', 13);
    if (Math.abs(hx - tx) > 40) label(ctx, p, 'L·cosα', (tx + hx) / 2, ty + 14, p.ink2, 'center', 13);
    // the angle α from B's direction to the current's
    ctx.save();
    ctx.strokeStyle = p.hand;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(tx, ty, 26, -a, 0);
    ctx.stroke();
    ctx.restore();
    if (s.alpha > 8) label(ctx, p, 'α', tx + 36 * Math.cos(a / 2), ty - 36 * Math.sin(a / 2), p.hand, 'center', 14);
    ctx.save();
    ctx.strokeStyle = p.current;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.restore();
    if (s.I > 0) {
      chevron(ctx, cx - ux * half * 0.55, cy - uy * half * 0.55, ux, uy, 9, p.paper);
      chevron(ctx, cx + ux * half * 0.55, cy + uy * half * 0.55, ux, uy, 9, p.paper);
      label(ctx, p, 'I', hx + ux * 16, hy + uy * 16, p.current);
    }
    // the force, perpendicular to the page
    if (ph.mag > 1e-9) {
      const r = 8 + 16 * Math.min(1, ph.mag / F_REF);
      depthGlyph(ctx, cx, cy, r, ph.F[2] > 0 ? 'out' : 'in', p.force, { fill: p.paper, width: 2.4 });
      // the label goes where the wire is not: upper left when the wire leans right, upper right otherwise
      if (ux >= 0) label(ctx, p, `F = ${sci(ph.mag)} N`, cx - r - 8, cy - r - 6, p.force, 'right', 13);
      else label(ctx, p, `F = ${sci(ph.mag)} N`, cx + r + 8, cy - r - 6, p.force, 'left', 13);
    } else label(ctx, p, 'F = 0', cx + 12, cy - 18, p.force, 'left', 13);
  };

  const drawBalance = ({ ctx, view, palette: p }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const px = W * 0.47;
    const py = H * 0.16;
    const arm = W * 0.3;
    const tilt = (10 * Math.PI) / 180 * Math.tanh(ph.down / 0.004);
    const rx = px + arm * Math.cos(tilt);
    const ry = py + arm * Math.sin(tilt);
    const lx = px - arm * Math.cos(tilt);
    const ly = py - arm * Math.sin(tilt);
    // stand
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.fillStyle = withAlpha(p.ink2, 0.2);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, H * 0.94);
    ctx.stroke();
    ctx.fillRect(px - 40, H * 0.94, 80, 6);
    // beam
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    // level pointer and scale
    ctx.strokeStyle = ph.balanced ? p.accent : p.ink2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - 46 * Math.sin(tilt), py + 46 * Math.cos(tilt));
    ctx.stroke();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1;
    for (const k of [-2, -1, 0, 1, 2]) {
      const a = (k * 5 * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(px - 50 * Math.sin(a), py + 50 * Math.cos(a));
      ctx.lineTo(px - 56 * Math.sin(a), py + 56 * Math.cos(a));
      ctx.stroke();
    }
    ctx.restore();
    // the pan and its masses, on the left
    const panY = ly + H * 0.36;
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx - 38, panY);
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 38, panY);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = p.ink;
    ctx.beginPath();
    ctx.moveTo(lx - 44, panY);
    ctx.lineTo(lx + 44, panY);
    ctx.stroke();
    const n = Math.round(s.mass / MASS_STEP);
    ctx.fillStyle = withAlpha(p.ink2, 0.55);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 0.8;
    for (let k = 0; k < Math.min(n, 60); k++) {
      const col = k % 6;
      const row = Math.floor(k / 6);
      ctx.fillRect(lx - 36 + col * 12, panY - 8 - row * 8, 10, 6);
      ctx.strokeRect(lx - 36 + col * 12, panY - 8 - row * 8, 10, 6);
    }
    ctx.restore();
    label(ctx, p, `m = ${sci(s.mass)} g`, lx, panY + 16, p.ink, 'center', 13);
    // the frame, hanging from the right end
    const fw = W * 0.2;
    const top = ry + 12;
    const bottom = top + H * 0.5;
    const fl = rx - fw / 2;
    const fr = rx + fw / 2;
    // the field region around the lower side
    const box = { x: rx - fw / 2 - W * 0.07, y: H * 0.56, w: fw + W * 0.14, h: H * 0.3 };
    ctx.save();
    ctx.fillStyle = withAlpha(p.bfield, 0.07);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = withAlpha(p.bfield, 0.7);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    depthField(ctx, box, 'in', p.bfield, 24, 0.6);
    label(ctx, p, 'B ⊗', box.x + 4, box.y - 10, p.bfield, 'left', 13);
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx, top);
    ctx.stroke();
    ctx.strokeStyle = p.current;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(fl, top);
    ctx.lineTo(fl, bottom);
    ctx.lineTo(fr, bottom);
    ctx.lineTo(fr, top);
    ctx.lineTo(fl, top);
    ctx.stroke();
    ctx.restore();
    if (s.I > 0) {
      // dirI = +1: down the right side, right-to-left along the bottom, up the left side
      const d = s.dirI;
      chevron(ctx, fr, (top + bottom) / 2, 0, d, 8, p.paper);
      chevron(ctx, rx, bottom, -d, 0, 8, p.paper);
      chevron(ctx, fl, (top + bottom) / 2, 0, -d, 8, p.paper);
      label(ctx, p, 'I', fr + 14, (top + bottom) / 2 - 18, p.current);
      // forces: on the lower side (up or down), and the pair on the sides, which cancel
      const fdir = Math.sign(ph.F[1]);
      const len = Math.max(14, Math.min(1, ph.mag / 0.02) * H * 0.16);
      arrow(ctx, rx, bottom, rx, bottom - fdir * len, { color: p.force, width: 3, head: 11 });
      label(ctx, p, `F = ${sci(ph.mag)} N`, rx - 8, bottom - fdir * len * 0.75, p.force, 'right', 13);
      const sy = Math.max(box.y + 10, bottom - 22);
      arrow(ctx, fr, sy, fr + d * 18, sy, { color: p.force, width: 1.8, head: 7, alpha: 0.8 });
      arrow(ctx, fl, sy, fl - d * 18, sy, { color: p.force, width: 1.8, head: 7, alpha: 0.8 });
    }
    label(ctx, p, `L = ${L_BALANCE * 100} cm`, rx, bottom - 40, p.ink2, 'center', 12);
  };

  const draw = (f: FrameInfo) => {
    if (s.mode === 'perp') drawPerp(f);
    else if (s.mode === 'angle') drawAngle(f);
    else drawBalance(f);
  };

  const moving = s.mode === 'perp' && s.carriers !== 'none' && s.I > 0;
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: moving });
  useEffect(invalidate, [s]);

  /* ------------------------------------------------------------------ panel */

  const sliderI = <Slider label="הזרם I" value={s.I} min={0} max={5} step={0.5} format={(v) => `${sci(v)} A`} onChange={(v) => act({ I: round(v, 0.5) })} />;
  const sliderB = <Slider label="השדה B" value={s.B} min={0.05} max={0.5} step={0.05} format={(v) => `${sci(v)} T`} onChange={(v) => act({ B: round(v, 0.05) })} />;
  const sliderL = (
    <Slider
      label={s.mode === 'perp' ? 'האורך שבתוך השדה' : 'אורך הקטע'}
      value={s.L}
      min={0.02}
      max={0.2}
      step={0.01}
      format={(v) => `${sci(v * 100)} cm`}
      onChange={(v) => act({ L: round(v, 0.01) })}
    />
  );

  const balanceLine = () => {
    if (s.I === 0) return <span>אין זרם, ואין כוח על המסגרת: המאזניים מאוזנים בלי משקולות.</span>;
    if (ph.F[1] > 0)
      return <span>הכוח על הצלע התחתונה דוחף אותה למעלה. משקולות בכף השנייה רק יגדילו את חוסר האיזון: הפכו את כיוון הזרם.</span>;
    if (ph.balanced)
      return (
        <span>
          מאוזן: <b class="q">mg = BIL</b>, ולכן <b class="q">B = mg/(IL) = {sci(balanceField(s.mass / 1000, s.I, L_BALANCE))} T</b>
        </span>
      );
    return <span>{ph.down > 0 ? 'צד המסגרת נמשך למטה: הוסיפו משקולות.' : 'צד המשקולות כבד מדי: הסירו משקולות.'}</span>;
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${describe()}`}
      canvasRef={canvasRef}
      aspect={s.mode === 'balance' ? 1.2 : ASPECT}
      live={live}
      tasks={tasks}
      onReset={() => {
        userActed.current = false;
        const fresh = init();
        baseL.current = fresh.L;
        setS(fresh);
        setLive('האיור אופס.');
      }}
      readout={
        s.mode === 'balance' ? (
          <>
            <span>
              הצלע שבשדה: <b class="q">L = {L_BALANCE * 100} cm</b>; הזרם <b class="q">I = {sci(s.I)} A</b>; המשקולות <b class="q">m = {sci(s.mass)} g</b>, ומשקלן{' '}
              <b class="q">mg = {sci((s.mass / 1000) * G)} N</b>
            </span>
            {balanceLine()}
          </>
        ) : (
          <>
            <span>
              {s.mode === 'perp' ? (
                <>
                  הכוח על התיל: <b class="q">F = BIL = {sci(ph.mag)} N</b>
                </>
              ) : (
                <>
                  הכוח על התיל: <b class="q">F = BIL·sinα = {sci(ph.mag)} N</b> (בזווית <b class="q">α = {s.alpha}°</b>)
                </>
              )}
            </span>
            <span>כיוון הכוח: {forceWords()}</span>
          </>
        )
      }
      controls={
        <>
          {modes.length > 1 && (
            <div class="group" role="group" aria-label="המצב">
              {modes.map((m) => (
                <button type="button" key={m} class={`toggle ${s.mode === m ? 'on' : ''}`} aria-pressed={s.mode === m} onClick={() => act({ mode: m })}>
                  {MODE_NAME[m]}
                </button>
              ))}
            </div>
          )}
          {s.mode === 'perp' && (
            <>
              <div class="group" role="group" aria-label="כיוונים">
                <button type="button" class="toggle" onClick={() => act({ dirI: s.dirI === 1 ? -1 : 1 })}>
                  כיוון הזרם: {s.dirI === 1 ? 'ימינה' : 'שמאלה'}
                </button>
                <button type="button" class="toggle" onClick={() => act({ dirB: s.dirB === 'in' ? 'out' : 'in' })}>
                  השדה: {s.dirB === 'in' ? '⊗ לתוך הדף' : '⊙ החוצה מהדף'}
                </button>
              </div>
              <div class="group" role="group" aria-label="נושאי המטען">
                {(
                  [
                    ['none', 'בלי נושאי מטען'],
                    ['pos', 'מטענים חיוביים'],
                    ['neg', 'אלקטרונים'],
                  ] as const
                ).map(([c, name]) => (
                  <button type="button" key={c} class={`toggle ${s.carriers === c ? 'on' : ''}`} aria-pressed={s.carriers === c} onClick={() => act({ carriers: c })}>
                    {name}
                  </button>
                ))}
              </div>
              {sliderI}
              {sliderB}
              {sliderL}
            </>
          )}
          {s.mode === 'angle' && (
            <>
              <Slider label="הזווית α בין הזרם לשדה" value={s.alpha} min={0} max={180} step={5} format={(v) => `${v}°`} onChange={(v) => act({ alpha: round(v, 5) })} />
              {sliderI}
              {sliderB}
              {sliderL}
            </>
          )}
          {s.mode === 'balance' && (
            <>
              {sliderI}
              <div class="group" role="group" aria-label="משקולות וזרם">
                <button type="button" class="toggle" onClick={() => act({ mass: round(s.mass + MASS_STEP, MASS_STEP) })}>
                  הוסיפו 0.1 גרם
                </button>
                <button type="button" class="toggle" onClick={() => act({ mass: round(s.mass + 0.5, MASS_STEP) })}>
                  הוסיפו 0.5 גרם
                </button>
                <button type="button" class="toggle" onClick={() => act({ mass: Math.max(0, round(s.mass - MASS_STEP, MASS_STEP)) })}>
                  הסירו 0.1 גרם
                </button>
                <button type="button" class="toggle" onClick={() => act({ dirI: s.dirI === 1 ? -1 : 1 })}>
                  הפכו את הזרם
                </button>
              </div>
            </>
          )}
        </>
      }
    />
  );
}
