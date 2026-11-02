/**
 * Two frames: one wire with a current and one positive charge q moving parallel to it, drawn twice,
 * side by side. Right panel, the lab frame: the ions stand still, the electrons move at u, the two
 * lines have the same spacing (a neutral wire), the magnetic field of the current (⊙/⊗) and the
 * magnetic force qvB on the moving charge. Left panel, the charge's own frame: q stands still, the
 * ions move at −v and the electrons at u′, each line's spacing contracted by its own Lorentz factor,
 * so the wire carries a net line charge, its electric field and the electric force qE′.
 * Built for lesson 6.15. Every number comes from src/physics/relativity.ts.
 *
 * The speeds are imagined (up to 0.9c) so the contraction can be seen; the spacings are drawn to
 * scale for those speeds. In a real wire the electrons drift at a fraction of a millimetre per
 * second and the difference in spacing is far too small to draw; the canvas says so.
 * Charges move only while motion is allowed (still mode freezes t, so the picture is fixed).
 * Tasks tick only from the learner's own slider changes, never from a text step.
 */

import { useEffect, useState } from 'preact/hooks';
import { C_LIGHT } from '~/physics/constants';
import { chargeFrameElectricForce, chargeFrameField, labCurrent, labField, labMagneticForce, lorentzGamma, wireSeenFrom } from '~/physics/relativity';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, depthField, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

/** the thought-experiment wire: ion line density, distance of the charge, the charge */
const LAMBDA0 = 1e-6;
const R = 0.02;
const Q = 1e-9;
const B_MAX = 0.9;
/** screen speed of a body moving at c [px/s] */
const SPEED_PX = 60;
/** spacing of a line of density λ₀ [px] */
const SPACING = 24;
/** force that draws a fifth of a panel's width */
const F_REF = 4e-4;

const TASK_LABEL: Record<string, string> = {
  'stop-charge': 'עצרו את המטען q במערכת המעבדה (v = 0). מה קורה לכוח בשתי המערכות?',
  'flip-v': 'הפכו את כיוון התנועה של q, כך שינוע נגד האלקטרונים. מה קורה לכוח, ולמטען של התיל במערכת של q?',
  'no-current': 'אפסו את מהירות האלקטרונים (u = 0) כש-q עדיין נע. האם התיל טעון באחת המערכות?',
  slow: 'קבעו שתי מהירויות קטנות, עד 0.1c ולא אפס. השוו את שני הכוחות.',
};

export interface TwoFramesProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  /** electron speed in the lab, upward, as a fraction of c */
  u?: number;
  /** speed of the charge in the lab, + upward, as a fraction of c */
  v?: number;
  tasks?: string[];
}

interface State {
  u: number;
  v: number;
}

const clampB = (b: number) => Math.max(-B_MAX, Math.min(B_MAX, b));
const round2 = (b: number) => Math.round(b * 100) / 100;
/** a speed for screen readers: size and the direction in words */
const cWords = (b: number) => (b === 0 ? 'אפס' : `${String(Math.abs(round2(b)))}c ${b > 0 ? 'כלפי מעלה' : 'כלפי מטה'}`);
const microPerM = (l: number) => `${sci(Math.abs(l) < 1e-15 ? 0 : l * 1e6).replace('-', '−')} μC/m`;
/** a speed for the sliders: size and an arrow for its direction along the wire */
const cArrow = (b: number) => (b === 0 ? '0' : `${String(Math.abs(round2(b)))}c ${b > 0 ? '↑' : '↓'}`);
const sideOf = (F: number) => (Math.abs(F) < 1e-15 ? 'אין כוח' : F > 0 ? 'דחייה מהתיל' : 'משיכה אל התיל');

/** All the numbers of one state, from the physics module. */
function compute(s: State) {
  const u = s.u * C_LIGHT;
  const v = s.v * C_LIGHT;
  const lab = wireSeenFrom(LAMBDA0, u, 0);
  const moving = wireSeenFrom(LAMBDA0, u, v);
  return {
    u,
    v,
    lab,
    moving,
    I: labCurrent(LAMBDA0, u),
    B: labField(LAMBDA0, u, R),
    F: labMagneticForce(Q, v, LAMBDA0, u, R),
    E: chargeFrameField(LAMBDA0, u, v, R),
    Fp: chargeFrameElectricForce(Q, v, LAMBDA0, u, R),
    gamma: lorentzGamma(v),
  };
}

/** text in the figure, in the UI font; Hebrew runs right to left */
function text(ctx: CanvasRenderingContext2D, p: Palette, s: string, x: number, y: number, o: { size?: number; weight?: number; color?: string; align?: CanvasTextAlign } = {}) {
  ctx.save();
  ctx.font = `${o.weight ?? 500} ${o.size ?? 12}px ${p.fontUi}`;
  ctx.fillStyle = o.color ?? p.ink2;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = /[֐-׿]/.test(s) ? 'rtl' : 'ltr';
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** a horizontal arrow from (x, y) of signed length L, cut at `room` with a break mark */
function hArrow(ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number, L: number, room: number, color: string, width: number, label?: string) {
  if (Math.abs(L) < 2) return;
  const cut = Math.abs(L) > room;
  const len = Math.sign(L) * Math.min(Math.abs(L), room);
  arrow(ctx, x, y, x + len, y, { color, width, head: Math.min(11, Math.abs(len) * 0.6) });
  if (cut) {
    const bx = x + len / 2;
    ctx.save();
    ctx.strokeStyle = p.paper;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bx - 2, y + 7);
    ctx.lineTo(bx + 2, y - 7);
    ctx.stroke();
    ctx.restore();
  }
  if (label) text(ctx, p, label, x + len / 2, y - 12, { size: 13, weight: 700, color });
}

export default function TwoFrames(props: TwoFramesProps) {
  const initial = (): State => ({ u: clampB(props.u ?? 0.6), v: clampB(props.v ?? 0.6) });
  const [s, setS] = useState<State>(initial);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => ({
          u: typeof st.u === 'number' ? Math.max(0, clampB(st.u)) : prev.u,
          v: typeof st.v === 'number' ? clampB(st.v) : prev.v,
        }));
      }),
    [props.id],
  );

  const n = compute(s);

  /** tasks: only from the learner's own changes */
  const learnerSet = (next: State) => {
    setS(next);
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (has('stop-charge') && next.v === 0 && next.u > 0) done('stop-charge');
    if (has('flip-v') && next.v < 0 && next.u > 0) done('flip-v');
    if (has('no-current') && next.u === 0 && next.v !== 0) done('no-current');
    if (has('slow') && next.u > 0 && next.u <= 0.1 + 1e-9 && next.v !== 0 && Math.abs(next.v) <= 0.1 + 1e-9) done('slow');
    setLive(describe(next));
  };

  const describe = (st: State) => {
    const m = compute(st);
    return (
      `במערכת המעבדה: האלקטרונים נעים במהירות ${cWords(st.u)} והמטען במהירות ${cWords(st.v)}; התיל ניטרלי, ` +
      `והכוח המגנטי ${sci(Math.abs(m.F))} ניוטון, ${sideOf(m.F)}. ` +
      `במערכת של המטען: צפיפות המטען הנטו של התיל ${microPerM(m.moving.net)}, ` +
      `והכוח החשמלי ${sci(Math.abs(m.Fp))} ניוטון, ${sideOf(m.Fp)}.`
    );
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const pw = W / 2;
    const top = 70;
    const bottom = H - 62;
    const mid = (top + bottom) / 2;
    const half = 11; // half the wire's width

    // the divider between the frames
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(pw, 10);
    ctx.lineTo(pw, H - 10);
    ctx.stroke();
    ctx.restore();

    // panel 0 (left): the charge's frame; panel 1 (right): the lab
    const panels = [
      { x0: 0, title: 'המערכת של המטען q', wire: n.moving, qv: 0, force: n.Fp, fLabel: 'F′' },
      { x0: pw, title: 'מערכת המעבדה', wire: n.lab, qv: s.v, force: n.F, fLabel: 'F' },
    ];

    panels.forEach((P, k) => {
      const wx = P.x0 + pw * 0.3;
      const qx = P.x0 + pw * 0.64;
      text(ctx, p, P.title, P.x0 + pw / 2, 52, { size: 13, weight: 700, color: p.ink });

      // fields first, under everything
      if (k === 1 && Math.abs(n.B) > 0) {
        // B of the current: ⊙/⊗ on each side (opposite senses), in the magnetic colour
        const right = n.B > 0 ? 'out' : 'in';
        const left = n.B > 0 ? 'in' : 'out';
        depthField(ctx, { x: wx + half + 6, y: top, w: P.x0 + pw - wx - half - 12, h: bottom - top }, right, p.bfield, 26, 0.5);
        depthField(ctx, { x: P.x0 + 6, y: top, w: wx - half - P.x0 - 12, h: bottom - top }, left, p.bfield, 26, 0.5);
      }
      if (k === 0 && Math.abs(P.wire.net) > 1e-6 * LAMBDA0) {
        // E of the net line charge: horizontal arrows on both sides, away from + / toward −
        const len = Math.min(pw * 0.2, (Math.abs(P.wire.net) / LAMBDA0) * pw * 0.22);
        const sgn = Math.sign(P.wire.net);
        for (let y = top + 22; y < bottom - 10; y += 46) {
          for (const side of [1, -1]) {
            const from = wx + side * (half + 6);
            const x1 = sgn > 0 ? from : from + side * len;
            const x2 = sgn > 0 ? from + side * len : from;
            arrow(ctx, x1, y, x2, y, { color: p.efield, width: 1.6, head: 7, alpha: 0.75 });
          }
        }
      }

      // the wire
      ctx.save();
      ctx.fillStyle = p.paper2;
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(wx - half, top - 6, 2 * half, bottom - top + 12, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(wx - half, top - 4, 2 * half, bottom - top + 8);
      ctx.clip();
      // ions: open rings with +, left column; electrons: filled discs with −, right column
      const lines = [
        { density: P.wire.ions, vel: P.wire.ionVelocity, x: wx - 5, ion: true },
        { density: P.wire.electrons, vel: P.wire.electronVelocity, x: wx + 5, ion: false },
      ];
      for (const L of lines) {
        const spacing = (SPACING * LAMBDA0) / Math.abs(L.density);
        const shift = (((L.vel / C_LIGHT) * SPEED_PX * t) % spacing + spacing) % spacing;
        for (let y = bottom + spacing - shift + (L.ion ? 0 : spacing / 2); y > top - spacing; y -= spacing) {
          if (L.ion) {
            ctx.strokeStyle = p.pos;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(L.x, y, 4.6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(L.x - 2.4, y);
            ctx.lineTo(L.x + 2.4, y);
            ctx.moveTo(L.x, y - 2.4);
            ctx.lineTo(L.x, y + 2.4);
            ctx.stroke();
          } else {
            ctx.fillStyle = p.neg;
            ctx.beginPath();
            ctx.arc(L.x, y, 4.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(L.x - 2.2, y);
            ctx.lineTo(L.x + 2.2, y);
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // the current, in gold, beside the wire (lab: the current of the electrons)
      const Iax = k === 1 ? n.I : P.wire.current;
      if (Math.abs(Iax) > 1e-9) {
        const ax = wx - half - 9;
        const dir = Math.sign(Iax); // + upward
        arrow(ctx, ax, mid + dir * 26, ax, mid - dir * 26, { color: p.current, width: 2.4, head: 9 });
        text(ctx, p, 'I', ax - 9, mid, { size: 13, weight: 700, color: p.current });
      }

      // the net charge of the wire, under it
      const net = P.wire.net;
      const netText = Math.abs(net) < 1e-6 * LAMBDA0 ? 'ניטרלי' : net > 0 ? 'טעון בחיוב' : 'טעון בשלילה';
      text(ctx, p, netText, wx, bottom + 18, { size: 12, weight: 600, color: Math.abs(net) < 1e-6 * LAMBDA0 ? p.ink2 : p.efield });

      // the charge q: a + disc (positive) in the positive colour
      const qy = k === 1 ? wrapY(mid - (P.qv * SPEED_PX * t), top + 18, bottom - 18) : mid;
      if (k === 1 && Math.abs(P.qv) > 0) {
        const L = Math.abs(P.qv) * pw * 0.32;
        arrow(ctx, qx, qy, qx, qy - Math.sign(P.qv) * (12 + L), { color: p.ink2, width: 1.8, head: 8 });
        text(ctx, p, 'v', qx + 11, qy - Math.sign(P.qv) * (12 + L * 0.6), { size: 13, weight: 700, color: p.ink2 });
      }
      if (k === 0) text(ctx, p, 'במנוחה', qx, qy + 20, { size: 11, color: p.ink2 });
      // the force, horizontal: + away from the wire (to the right)
      const Lf = (P.force / F_REF) * pw * 0.2;
      const room = P.force > 0 ? P.x0 + pw - qx - 18 : qx - wx - half - 22;
      hArrow(ctx, p, qx + Math.sign(P.force) * 10, qy, Lf, room, p.force, 3, P.fLabel);
      ctx.save();
      ctx.fillStyle = p.pos;
      ctx.beginPath();
      ctx.arc(qx, qy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(qx - 4, qy);
      ctx.lineTo(qx + 4, qy);
      ctx.moveTo(qx, qy - 4);
      ctx.lineTo(qx, qy + 4);
      ctx.stroke();
      ctx.restore();
      text(ctx, p, 'q', qx - 13, qy - 13, { size: 12, weight: 700, color: p.ink });
    });

    // what is to scale, and what is imagined
    const note = { size: W < 420 ? 10 : 11, color: withAlpha(p.ink2, 0.95) };
    text(ctx, p, 'ניסוי מחשבתי: מהירויות קרובות למהירות האור', W / 2, H - 24, note);
    text(ctx, p, 'בתיל אמיתי ההבדל במרווחים זעיר מכדי לראות', W / 2, H - 10, note);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: true });
  useEffect(invalidate, [s]);

  const readout = (
    <>
      <span>
        מערכת המעבדה: התיל ניטרלי · <b class="q">I = {sci(Math.abs(n.I))} A</b> · <b class="q">B = {sci(Math.abs(n.B))} T</b> · כוח מגנטי{' '}
        <b class="q">F = qvB = {sci(Math.abs(n.F))} N</b> ({sideOf(n.F)})
      </span>
      <span>
        המערכת של q: יונים <b class="q">λ₊′ = {microPerM(n.moving.ions)}</b> · אלקטרונים <b class="q">λ₋′ = {microPerM(n.moving.electrons)}</b> · נטו{' '}
        <b class="q">λ′ = {microPerM(n.moving.net)}</b>
      </span>
      <span>
        <b class="q">E′ = {sci(Math.abs(n.E))} N/C</b> · כוח חשמלי <b class="q">F′ = qE′ = {sci(Math.abs(n.Fp))} N</b> ({sideOf(n.Fp)})
      </span>
      <span>
        <b class="q">γ(v) = {sci(n.gamma)}</b>
        {Math.abs(n.F) > 1e-15 && (
          <>
            {' '}
            · <b class="q">F′/F = {sci(n.Fp / n.F)}</b>
          </>
        )}
      </span>
    </>
  );

  return (
    <SimShell
      fig={props.id}
      label={`איור חי של תיל ומטען נע בשתי מערכות ייחוס. ${describe(s)}`}
      canvasRef={canvasRef}
      aspect={1.05}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(initial());
        setLive('האיור אופס.');
      }}
      readout={readout}
      controls={
        <>
          <Slider
            label="מהירות האלקטרונים, u"
            min={0}
            max={B_MAX}
            step={0.05}
            value={s.u}
            format={cArrow}
            onChange={(b) => learnerSet({ ...s, u: round2(b) })}
          />
          <Slider
            label="מהירות המטען, v"
            min={-B_MAX}
            max={B_MAX}
            step={0.05}
            value={s.v}
            format={cArrow}
            onChange={(b) => learnerSet({ ...s, v: round2(b) })}
          />
        </>
      }
    />
  );
}

/** y wrapped into [lo, hi), so a charge that leaves the panel comes back at the other edge */
function wrapY(y: number, lo: number, hi: number): number {
  const span = hi - lo;
  return lo + ((((y - lo) % span) + span) % span);
}
