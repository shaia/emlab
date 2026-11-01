/**
 * Conducting spheres: one sphere with a probe and a graph of V(r), or two far-apart spheres
 * that can be joined by a wire and earthed. Built for lesson 2.5.
 *
 * Single mode: V = kQ/R everywhere inside and on the sphere, kQ/r outside; E = 0 inside
 * (spherePotentialAt, sphereFieldAt, src/physics/potential.ts).
 *
 * Pair mode: the state holds the charges the spheres carry now, and each action imposes its
 * constraint. Closing the wire shares the charge until the potentials are equal
 * (connectSpheres); earthing sphere 2 sets its potential to zero, so it keeps −qR/D when a
 * point charge q is near and nothing otherwise (earthedSphereCharge). Opening a switch leaves
 * the charges where they are, so earthing near a charge and then letting go charges the sphere
 * by induction, as in lesson 1.2. The spheres are far apart compared with their radii: each
 * one's charge stays uniform, and the drawing is not to scale in distance.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { K } from '~/physics/constants';
import { connectSpheres, earthedSphereCharge, pointPotential, sphereFieldAt, spherePotentialAt, sphereSurfaceField } from '~/physics/potential';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { arrow, chargeDisc, paperGrid, polyline, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const uC = 1e-6;
const WORLD_W = 2;
const MAP_H = 0.95;
const GRAPH_H = 0.6;
const C1: [number, number] = [-0.55, 0.05];
const C2: [number, number] = [0.4, 0.05];
/** the nearby point charge of pair mode, to the right of sphere 2 */
const Q_EXT = 3 * uC;
const EXT: [number, number] = [0.8, 0.05];
const D_EXT = EXT[0] - C2[0];
const D_EXT_1 = EXT[0] - C1[0];

export type SphereMode = 'single' | 'pair';

const TASK_LABEL: Record<string, string> = {
  'inside-same': 'גררו את P לשתי נקודות שונות בתוך הכדור. מה הפוטנציאל בכל אחת?',
  'double-r': 'גררו את P מחוץ לכדור, למרחק של פעמיים הרדיוס מהמרכז. איזה חלק מהפוטנציאל שעל פני הכדור נשאר?',
  connect: 'חברו את הכדורים בתיל. מה קרה לפוטנציאלים? ולמטענים?',
  'size-share': 'קבעו לכדור 2 רדיוס כפול מזה של כדור 1, וחברו אותם בתיל. איך התחלק המטען?',
  ground: 'כשלכדור 2 יש מטען: הארקו אותו. כמה מטען נשאר עליו?',
  induce: 'טענו את כדור 2 בהשראה: קרבו את המטען, הארקו, נתקו את ההארקה ורק אז הרחיקו את המטען.',
};

export interface SphereConnectProps {
  id: string;
  mode?: SphereMode;
  /** radii [m] and charges [μC] */
  R1?: number;
  Q1?: number;
  R2?: number;
  Q2?: number;
  tasks?: string[];
}

interface State {
  R1: number;
  R2: number;
  /** charges carried now [C] */
  q1: number;
  q2: number;
  wire: boolean;
  earth: boolean;
  near: boolean;
  /** single mode: the probe's x [m] (the sphere is at the origin) */
  probe: number;
  /** charge that moved in the last action, onto sphere 2 [C] */
  moved: number;
}

/** Apply the constraints of the switches to the charges. */
function settle(s: State): State {
  const ext = s.near ? Q_EXT : 0;
  if (s.wire && s.earth) return { ...s, q1: 0, q2: 0 };
  if (s.wire) {
    const r = connectSpheres(s.q1, s.R1, s.q2, s.R2);
    return { ...s, q1: r.q1, q2: r.q2 };
  }
  if (s.earth) return { ...s, q2: earthedSphereCharge(ext, D_EXT, s.R2) };
  return s;
}

const muC = (q: number) => {
  const v = Math.round((q / uC) * 100) / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} μC`;
};
const vWords = (v: number) => (Math.abs(v) < 1 ? '0' : sci(v));

export default function SphereConnect(props: SphereConnectProps) {
  const mode = props.mode ?? 'single';
  const init = (): State => ({
    R1: props.R1 ?? (mode === 'single' ? 0.2 : 0.1),
    R2: props.R2 ?? 0.1,
    q1: (props.Q1 ?? (mode === 'single' ? 2 : 6)) * uC,
    q2: (props.Q2 ?? 0) * uC,
    wire: false,
    earth: false,
    near: false,
    probe: 0.45,
    moved: 0,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const dragging = useRef(false);
  const userActed = useRef(false);
  const insideSeen = useRef<number | null>(null);
  // the induction task: earthed while the charge was near, then let go with the charge still near
  const induction = useRef({ earthedNear: false, releasedNear: false });
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const graph = mode === 'single';
  const worldH = graph ? MAP_H + GRAPH_H : MAP_H + 0.25;
  const shift = graph ? -(worldH / 2 - MAP_H / 2) : 0;

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => {
          let next = { ...prev };
          for (const k of ['R1', 'R2'] as const) if (typeof st[k] === 'number') next[k] = st[k] as number;
          for (const k of ['Q1', 'Q2'] as const) if (typeof st[k] === 'number') next[k === 'Q1' ? 'q1' : 'q2'] = (st[k] as number) * uC;
          for (const k of ['wire', 'earth', 'near'] as const) if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          if (typeof st.probe === 'number') next.probe = st.probe;
          next = settle(next);
          return { ...next, moved: 0 };
        });
      }),
    [props.id],
  );

  /** A learner's change: apply it, settle the switches, and remember how much charge moved. */
  const act = (patch: Partial<State>, words?: string) => {
    userActed.current = true;
    setS((prev) => {
      const next = settle({ ...prev, ...patch });
      return { ...next, moved: next.q2 - prev.q2 };
    });
    if (words) setLive(words);
  };

  // potentials and fields of pair mode (each sphere sees the far one and the nearby charge as point charges)
  const ext = s.near ? Q_EXT : 0;
  const V1 = pointPotential(s.q1, s.R1) + (ext ? pointPotential(ext, D_EXT_1) : 0);
  const V2 = pointPotential(s.q2, s.R2) + (ext ? pointPotential(ext, D_EXT) : 0);
  const E1 = sphereSurfaceField(s.q1, s.R1);
  const E2 = sphereSurfaceField(s.q2, s.R2);
  // single mode at the probe
  const r = Math.abs(s.probe);
  const Vp = spherePotentialAt(s.q1, s.R1, r);
  const Ep = sphereFieldAt(s.q1, s.R1, r);

  useEffect(() => {
    if (!userActed.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (mode === 'single') {
      if (r < s.R1) {
        if (insideSeen.current !== null && Math.abs(insideSeen.current - s.probe) > 0.05 && has('inside-same')) done('inside-same');
        if (insideSeen.current === null) insideSeen.current = s.probe;
      }
      if (has('double-r') && Math.abs(r - 2 * s.R1) < 0.015) done('double-r');
      return;
    }
    if (has('connect') && s.wire && Math.abs(s.moved) > 1e-9) done('connect');
    if (has('size-share') && s.wire && !s.earth && s.R2 >= 2 * s.R1 - 1e-9 && Math.abs(s.q1 + s.q2) > 1e-9) done('size-share');
    if (has('ground') && s.earth && !s.near && Math.abs(s.moved) > 1e-9) done('ground');
    const ind = induction.current;
    if (s.earth && s.near && !s.wire) ind.earthedNear = true;
    if (ind.earthedNear && !s.earth && s.near) ind.releasedNear = true;
    if (s.earth && !s.near) ind.releasedNear = false;
    if (has('induce') && ind.releasedNear && !s.near && !s.earth && Math.abs(s.q2) > 1e-9) done('induce');
  }, [s, props.id, props.tasks]);

  /** A sphere with its surface charge: glyphs around the rim, as many as the charge allows. */
  const sphere = (ctx: CanvasRenderingContext2D, p: FrameInfo['palette'], cx: number, cy: number, Rpx: number, q: number, name: string) => {
    ctx.save();
    const g = ctx.createRadialGradient(cx - Rpx * 0.35, cy - Rpx * 0.4, Rpx * 0.1, cx, cy, Rpx);
    g.addColorStop(0, withAlpha(p.paper, 1));
    g.addColorStop(1, withAlpha(p.ink3, 0.55));
    ctx.fillStyle = g;
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, Rpx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // one glyph per half microcoulomb, but never more than fit around the rim (a small sphere on a phone)
    const fit = Math.max(1, Math.floor((2 * Math.PI * Math.max(Rpx - 8, 4)) / 11));
    const n = Math.min(24, fit, Math.round(Math.abs(q) / (0.5 * uC)));
    ctx.fillStyle = q > 0 ? p.pos : p.neg;
    ctx.font = `700 ${Rpx > 25 ? 15 : 12}px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n + Math.PI / 2;
      ctx.fillText(q > 0 ? '+' : '−', cx + (Rpx - 8) * Math.cos(a), cy - (Rpx - 8) * Math.sin(a));
    }
    ctx.fillStyle = p.ink;
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.textBaseline = 'top';
    ctx.fillText(name, cx, cy + Rpx + 6);
    ctx.restore();
  };

  const draw = ({ ctx, view: base, palette: p }: FrameInfo) => {
    const view: View = { ...base, oy: shift };
    const S = (x: number, y: number) => toScreen(view, x, y);
    paperGrid(ctx, view, p);
    if (mode === 'single') {
      const [cx, cy] = S(0, 0);
      const Rpx = s.R1 * view.ppm;
      // radial field arrows outside, none inside
      if (Math.abs(s.q1) > 0) {
        for (let k = 0; k < 12; k++) {
          const a = (k * Math.PI) / 6;
          const r0 = s.R1 + 0.04;
          const r1 = s.R1 + 0.12;
          const [x0, y0] = S(r0 * Math.cos(a), r0 * Math.sin(a));
          const [x1, y1] = S(r1 * Math.cos(a), r1 * Math.sin(a));
          if (s.q1 > 0) arrow(ctx, x0, y0, x1, y1, { color: withAlpha(p.efield, 0.6), width: 2, head: 7 });
          else arrow(ctx, x1, y1, x0, y0, { color: withAlpha(p.efield, 0.6), width: 2, head: 7 });
        }
      }
      sphere(ctx, p, cx, cy, Rpx, s.q1, `Q = ${muC(s.q1)}, R = ${Math.round(s.R1 * 100)} cm`);
      // the axis and the probe
      const [ax0, ay] = S(-0.95, 0);
      const [ax1] = S(0.95, 0);
      ctx.save();
      ctx.strokeStyle = withAlpha(p.ink2, 0.7);
      ctx.setLineDash([1.5, 4]);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      polyline(ctx, [[ax0, ay], [ax1, ay]], withAlpha(p.ink2, 0.7), 2, { dash: [1.5, 4] });
      ctx.restore();
      const [px, py] = S(s.probe, 0);
      ctx.save();
      ctx.strokeStyle = p.ink;
      ctx.fillStyle = p.paper;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `700 13px ${p.fontUi}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('P', px + 9, py - 7);
      ctx.restore();

      // graph of V along the dotted axis
      const [, my1] = S(0, -MAP_H / 2);
      const top = my1 + 24;
      const bottom = base.h - 22;
      const gx = (x: number) => S(x, 0)[0];
      const vTop = (K * 6 * uC) / 0.05;
      const vmax = Math.max(1, Math.abs(spherePotentialAt(s.q1, s.R1, 0))) * 1.15;
      void vTop;
      const gy = (v: number) => bottom - (Math.max(0, Math.min(vmax, Math.abs(v))) / vmax) * (bottom - top);
      ctx.save();
      ctx.strokeStyle = p.rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(gx(-0.95), top, gx(0.95) - gx(-0.95), bottom - top);
      // the sphere's extent on the graph
      ctx.fillStyle = withAlpha(p.ink3, 0.15);
      ctx.fillRect(gx(-s.R1), top, gx(s.R1) - gx(-s.R1), bottom - top);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i <= 380; i++) {
        const x = -0.95 + (1.9 * i) / 380;
        const v = spherePotentialAt(s.q1, s.R1, Math.abs(x));
        if (i === 0) ctx.moveTo(gx(x), gy(v));
        else ctx.lineTo(gx(x), gy(v));
      }
      ctx.stroke();
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(gx(s.probe), gy(Vp), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.ink2;
      ctx.font = `11px ${p.fontUi}`;
      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = -80; x <= 60; x += 40) ctx.fillText(`${x}`, gx(x / 100), bottom + 5);
      ctx.textAlign = 'right';
      ctx.fillText('x (cm)', gx(0.95), bottom + 5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${s.q1 < 0 ? '|V|' : 'V'} max = ${sci(Math.abs(spherePotentialAt(s.q1, s.R1, 0)))} V`, gx(-0.95) + 4, top + 4);
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `600 12px ${p.fontUi}`;
      ctx.fillStyle = p.ink;
      ctx.fillText(s.q1 < 0 ? '|V| לאורך הקו המנוקד' : 'V לאורך הקו המנוקד', gx(0.95) - 4, my1 + 12);
      ctx.restore();
      return;
    }

    // pair mode
    const [c1x, c1y] = S(C1[0], C1[1]);
    const [c2x, c2y] = S(C2[0], C2[1]);
    const R1px = s.R1 * view.ppm;
    const R2px = s.R2 * view.ppm;
    // the wire over the top, with its switch
    const yWire = S(0, 0.42)[1];
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c1x, c1y - R1px);
    ctx.lineTo(c1x, yWire);
    ctx.lineTo((c1x + c2x) / 2 - 18, yWire);
    ctx.moveTo((c1x + c2x) / 2 + 18, yWire);
    ctx.lineTo(c2x, yWire);
    ctx.lineTo(c2x, c2y - R2px);
    ctx.stroke();
    // switch blade: closed lies flat, open is tilted up
    const sx0 = (c1x + c2x) / 2 - 18;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx0, yWire);
    if (s.wire) ctx.lineTo(sx0 + 36, yWire);
    else ctx.lineTo(sx0 + 31, yWire - 18);
    ctx.stroke();
    for (const x of [sx0, sx0 + 36]) {
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(x, yWire, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // the earth connection under sphere 2
    const yEarth = S(0, -0.42)[1];
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c2x, c2y + R2px);
    ctx.lineTo(c2x, s.earth ? yEarth : yEarth - 22);
    ctx.stroke();
    if (s.earth) {
      for (let i = 0; i < 3; i++) {
        const w = 18 - i * 6;
        ctx.beginPath();
        ctx.moveTo(c2x - w, yEarth + i * 5);
        ctx.lineTo(c2x + w, yEarth + i * 5);
        ctx.stroke();
      }
    } else {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(c2x, yEarth - 22);
      ctx.lineTo(c2x, yEarth);
      ctx.stroke();
    }
    ctx.restore();
    sphere(ctx, p, c1x, c1y, R1px, s.q1, `1: ${muC(s.q1)}`);
    sphere(ctx, p, c2x, c2y, R2px, s.q2, `2: ${muC(s.q2)}`);
    if (s.near) {
      const [ex, ey] = S(EXT[0], EXT[1]);
      chargeDisc(ctx, ex, ey, 12, Q_EXT, p, { label: muC(Q_EXT) });
    }
    // which way charge moved in the last action
    if (Math.abs(s.moved) > 1e-9 && s.wire && !s.earth) {
      const mid = (c1x + c2x) / 2;
      const dir = s.moved > 0 ? 1 : -1;
      arrow(ctx, mid - 26 * dir, yWire - 26, mid + 26 * dir, yWire - 26, { color: p.accent, width: 2.4, head: 9 });
    }
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: worldH, animate: false });
  useEffect(invalidate, [s]);

  const mapView = (): View | null => (viewRef.current ? { ...viewRef.current, oy: shift } : null);
  const onPointerDown = (e: PointerEvent) => {
    const v = mapView();
    if (mode !== 'single' || !v) return;
    const [px, py] = toScreen(v, s.probe, 0);
    if (Math.hypot(e.offsetX - px, e.offsetY - py) < 26) {
      dragging.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = mapView();
    if (!dragging.current || !v) return;
    userActed.current = true;
    const [x] = toWorld(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, probe: Math.max(-0.95, Math.min(0.95, x)) }));
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(`P במרחק ${Math.round(r * 100)} סנטימטר מהמרכז. הפוטנציאל ${vWords(Vp)} וולט.`);
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (mode !== 'single' || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    userActed.current = true;
    const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.01);
    setS((prev) => ({ ...prev, probe: Math.max(-0.95, Math.min(0.95, Math.round((prev.probe + d) * 100) / 100)) }));
  };

  return (
    <SimShell
      fig={props.id}
      label={
        mode === 'single'
          ? `איור חי: כדור מוליך עם מטען ${muC(s.q1)} ורדיוס ${Math.round(s.R1 * 100)} סנטימטר. נקודת המדידה P במרחק ${Math.round(r * 100)} סנטימטר מהמרכז, הפוטנציאל בה ${vWords(Vp)} וולט.`
          : `איור חי: שני כדורים מוליכים. כדור 1: ${muC(s.q1)}, ${vWords(V1)} וולט. כדור 2: ${muC(s.q2)}, ${vWords(V2)} וולט. ${s.wire ? 'מחוברים בתיל.' : 'לא מחוברים.'} ${s.earth ? 'כדור 2 מוארק.' : ''}`
      }
      canvasRef={canvasRef}
      aspect={WORLD_W / worldH}
      live={live}
      tasks={tasks}
      cursor={mode === 'single' ? 'grab' : 'default'}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onReset={() => {
        userActed.current = false;
        insideSeen.current = null;
        induction.current = { earthedNear: false, releasedNear: false };
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        mode === 'single' ? (
          <>
            <span>
              המרחק של P מהמרכז: <b class="q">r = {Math.round(r * 100)} cm</b> ({r < s.R1 ? 'בתוך הכדור' : 'מחוץ לכדור'})
            </span>
            <span>
              הפוטנציאל ב-P: <b class="q">V = {vWords(Vp)} V</b>
            </span>
            <span>
              השדה ב-P: <b class="q">E = {Math.abs(Ep) < 1 ? '0' : `${sci(Math.abs(Ep))} N/C`}</b>
            </span>
          </>
        ) : (
          <>
            <span>
              כדור 1: <b class="q">q₁ = {muC(s.q1)}, V₁ = {vWords(V1)} V</b>
            </span>
            <span>
              כדור 2: <b class="q">q₂ = {muC(s.q2)}, V₂ = {vWords(V2)} V</b>
            </span>
            <span>
              השדה על פני הכדורים: <b class="q">E₁ = {sci(Math.abs(E1))} N/C · E₂ = {sci(Math.abs(E2))} N/C</b>
            </span>
            {Math.abs(s.moved) > 1e-9 && (
              <span>
                בפעולה האחרונה עבר לכדור 2: <b class="q">{muC(s.moved)}</b>
              </span>
            )}
          </>
        )
      }
      controls={
        mode === 'single' ? (
          <>
            <Slider label="המטען Q" value={Math.round(s.q1 / uC)} min={-4} max={4} step={1} format={(v) => `${v} μC`} onChange={(v) => act({ q1: v * uC })} />
            <Slider label="הרדיוס R" value={s.R1} min={0.1} max={0.3} step={0.05} format={(v) => `${Math.round(v * 100)} cm`} onChange={(v) => act({ R1: v })} />
          </>
        ) : (
          <>
            <Toggle label="חיבור בתיל" on={s.wire} onChange={(v) => act(v ? { wire: true, near: false } : { wire: false }, v ? 'הכדורים חוברו בתיל.' : 'התיל נותק.')} />
            <Toggle label="הארקה של כדור 2" on={s.earth} onChange={(v) => act({ earth: v }, v ? 'כדור 2 הוארק.' : 'ההארקה נותקה.')} />
            <Toggle label="מטען קרוב לכדור 2" on={s.near} onChange={(v) => act(v ? { near: true, wire: false } : { near: false }, v ? 'מטען חיובי קורב לכדור 2.' : 'המטען הורחק.')} />
            <Slider
              label="הרדיוס של כדור 2"
              value={s.R2}
              min={0.05}
              max={0.2}
              step={0.05}
              format={(v) => `${Math.round(v * 100)} cm`}
              onChange={(v) => act({ R2: v })}
            />
            {!s.wire && !s.earth && (
              <>
                <Slider label="המטען של כדור 1" value={Math.round(s.q1 / uC)} min={-6} max={6} step={1} format={(v) => `${v} μC`} onChange={(v) => act({ q1: v * uC })} />
                <Slider label="המטען של כדור 2" value={Math.round(s.q2 / uC)} min={-6} max={6} step={1} format={(v) => `${v} μC`} onChange={(v) => act({ q2: v * uC })} />
              </>
            )}
          </>
        )
      }
    />
  );
}
