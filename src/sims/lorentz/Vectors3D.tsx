/**
 * Figure 4.5א: the magnetic force on a moving charge, F = qv×B, drawn in 3D on a flat canvas.
 * A charge sits at the origin of a tilted sheet of paper (the page); the student picks the field's
 * direction, the direction the velocity leans toward, the angle α between v and B, the speed, the
 * field strength and the particle, and swings the view from "straight at the page" (the Bagrut
 * drawing, where vectors through the page become ⊙/⊗) to an oblique view where all three
 * vectors stand apart. All numbers come from magnetism.ts (`lorentzForce`, `lorentzMagnitude`).
 */

import { useEffect, useState } from 'preact/hooks';
import { E_CHARGE } from '~/physics/constants';
import { lorentzForce, lorentzMagnitude } from '~/physics/magnetism';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from '../core/canvas';
import { arrow, chargeDisc, chevron, handNote, mix, withAlpha } from '../core/ink';
import { sci } from '../core/format';
import SimShell, { Slider, Toggle, type TaskDef } from '../core/SimShell';
import { add3, camera, depth, flat, scale3, type Camera, type V3 } from './project';

export type Axis = 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-';
export type Particle = 'proton' | 'electron';

const UNIT: Record<Axis, V3> = {
  'x+': [1, 0, 0],
  'x-': [-1, 0, 0],
  'y+': [0, 1, 0],
  'y-': [0, -1, 0],
  'z+': [0, 0, 1],
  'z-': [0, 0, -1],
};
const AXES = Object.keys(UNIT) as Axis[];
/** direction names, in the chapter's wording */
export const AXIS_HE: Record<Axis, string> = {
  'x+': 'ימינה',
  'x-': 'שמאלה',
  'y+': 'למעלה',
  'y-': 'למטה',
  'z+': '⊙ החוצה מהדף',
  'z-': '⊗ לתוך הדף',
};
const B_CHOICES: Axis[] = ['x+', 'y+', 'z-', 'z+'];

const PARTICLES: Record<Particle, { q: number; name: string }> = {
  proton: { q: E_CHARGE, name: 'פרוטון' },
  electron: { q: -E_CHARGE, name: 'אלקטרון' },
};

const WORLD_W = 4.6;
const WORLD_H = 3.4;
const SHEET_X = 1.9;
const SHEET_Y = 1.3;
/** speed range [m/s] and field range [T] */
const V_MAX = 3e6;
const V_STEP = 0.25e6;
const B_MAX = 1;
const B_STEP = 0.1;
/** the force arrow is 0.6 world units long at this force (2·10⁶ m/s across 0.5 T, |q| = e) */
const F_REF = E_CHARGE * 2e6 * 0.5;
const FACE_ON = 5;
const V_MAX_VIEW = 70;
/** a vector shorter than this on screen [px] is seen end-on and drawn as ⊙/⊗ */
const END_ON = 14;

const TASK_LABEL: Record<string, string> = {
  rest: 'עצרו את המטען (מהירות אפס). מה קורה לכוח?',
  along: 'סובבו את המהירות עד שהיא לאורך השדה (α = 0° או 180°).',
  electron: 'החליפו את הפרוטון באלקטרון. לאן פונה הכוח עכשיו?',
  'face-on': 'כשהכוח יוצא מהדף או נכנס אליו, הסתכלו ישר על הדף. מה נשאר מהחץ שלו?',
};

export interface Vectors3DProps {
  id: string;
  B?: Axis;
  /** the direction v leans toward from B; at α = 90° the velocity points this way */
  u?: Axis;
  /** angle between v and B [degrees] */
  alpha?: number;
  /** speed [m/s] */
  speed?: number;
  /** field strength [T] */
  Bmag?: number;
  particle?: Particle;
  /** view angle [degrees]: 0 looks straight at the page */
  view?: number;
  tasks?: string[];
}

interface State {
  B: Axis;
  u: Axis;
  alpha: number;
  speed: number;
  Bmag: number;
  particle: Particle;
  view: number;
}

const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const perpTo = (b: Axis) => AXES.filter((a) => dot3(UNIT[a], UNIT[b]) === 0);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const snap = (x: number, step: number) => Math.round(x / step) * step;

function fit(s: State): State {
  const u = perpTo(s.B).includes(s.u) ? s.u : perpTo(s.B)[0];
  return {
    ...s,
    u,
    alpha: clamp(snap(s.alpha, 5), 0, 180),
    speed: clamp(snap(s.speed, V_STEP), 0, V_MAX),
    Bmag: clamp(Number(snap(s.Bmag, B_STEP).toFixed(1)), 0, B_MAX),
    view: clamp(s.view, 0, V_MAX_VIEW),
  };
}

const initial = (p: Vectors3DProps): State =>
  fit({
    B: p.B ?? 'z-',
    u: p.u ?? 'x+',
    alpha: p.alpha ?? 90,
    speed: p.speed ?? 2e6,
    Bmag: p.Bmag ?? 0.5,
    particle: p.particle ?? 'proton',
    view: p.view ?? 40,
  });

/** Everything drawn and read out, from the physics module. */
function solve(s: State) {
  const q = PARTICLES[s.particle].q;
  const a = (s.alpha * Math.PI) / 180;
  const bHat = UNIT[s.B];
  const uHat = UNIT[s.u];
  const vHat = add3(scale3(bHat, Math.cos(a)), scale3(uHat, Math.sin(a)));
  const v = scale3(vHat, s.speed);
  const B = scale3(bHat, s.Bmag);
  const F = lorentzForce(q, v, B);
  const Fmag = lorentzMagnitude(q, s.speed, s.Bmag, a);
  const sinA = Math.sin(a);
  // F is along ±(û × B̂): name it by the nearest axis
  let fAxis: Axis | null = null;
  if (Fmag > 1e-30) {
    fAxis = AXES.reduce((best, ax) => (dot3(UNIT[ax], F) > dot3(UNIT[best], F) ? ax : best), 'x+' as Axis);
  }
  const why =
    s.speed === 0 ? 'rest' : s.Bmag === 0 ? 'no-field' : Math.abs(sinA) < 1e-9 ? 'along' : null;
  return { q, a, bHat, vHat, v, B, F, Fmag, fAxis, why };
}

type Sol = ReturnType<typeof solve>;

function describe(s: State, sol: Sol): string {
  const who = PARTICLES[s.particle].name;
  const base = `${who} נע במהירות ${sci(s.speed)} מטר לשנייה בשדה של ${sci(s.Bmag)} טסלה שמצביע ${AXIS_HE[s.B]}, בזווית ${s.alpha} מעלות לשדה.`;
  if (sol.why === 'rest') return `${who} במנוחה בשדה של ${sci(s.Bmag)} טסלה: אין כוח מגנטי.`;
  if (sol.why === 'no-field') return `${base} אין שדה, ולכן אין כוח.`;
  if (sol.why === 'along') return `${base} המהירות לאורך השדה: אין כוח.`;
  return `${base} הכוח ${sci(sol.Fmag)} ניוטון, ${AXIS_HE[sol.fAxis!]}.`;
}

export default function Vectors3D(props: Vectors3DProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) =>
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.B === 'string' && st.B in UNIT) next.B = st.B as Axis;
          if (typeof st.u === 'string' && st.u in UNIT) next.u = st.u as Axis;
          if (typeof st.alpha === 'number') next.alpha = st.alpha;
          if (typeof st.speed === 'number') next.speed = st.speed;
          if (typeof st.Bmag === 'number') next.Bmag = st.Bmag;
          if (st.particle === 'proton' || st.particle === 'electron') next.particle = st.particle;
          if (typeof st.view === 'number') next.view = st.view;
          return fit(next);
        }),
      ),
    [props.id],
  );

  const sol = solve(s);

  /** Tasks tick only on the student's own changes. */
  const checkTasks = (next: State, prev: State) => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const n = solve(next);
    // stopping the charge: the student brings a moving charge to rest
    if (has('rest') && prev.speed > 0 && next.speed === 0 && next.Bmag > 0) done('rest');
    if (has('along') && n.why === 'along') done('along');
    if (has('electron') && next.particle === 'electron' && n.Fmag > 0) done('electron');
    if (has('face-on') && next.view <= FACE_ON && (n.fAxis === 'z+' || n.fAxis === 'z-')) done('face-on');
  };

  const change = (patch: Partial<State>) => {
    const next = fit({ ...s, ...patch });
    setS(next);
    checkTasks(next, s);
    setLive(describe(next, solve(next)));
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const cam = camera(s.view);
    const k = view.ppm;
    const cx = view.w / 2;
    const cy = view.h / 2;
    const scr = (pt: V3): [number, number] => {
      const [x, y] = flat(cam, pt);
      return [cx + x * k, cy - y * k];
    };

    // field lines of the uniform B, behind the sheet first
    const lines = fieldLines(s.B, s.Bmag);
    for (const l of lines.filter((l) => l.behind)) drawFieldLine(ctx, scr, cam, l.a, l.b, p, s.B);
    drawSheet(ctx, scr, p);
    if (s.B.startsWith('z') && s.view > FACE_ON) {
      // where each field line pierces the page
      ctx.save();
      ctx.fillStyle = withAlpha(p.bfield, 0.75);
      for (const l of lines.filter((l) => l.behind)) {
        const [x, y] = scr(l.b);
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const l of lines.filter((l) => !l.behind)) drawFieldLine(ctx, scr, cam, l.a, l.b, p, s.B);
    axes(ctx, cam, 88, 52, p);

    // vectors at the charge, far ones first
    const O: V3 = [0, 0, 0];
    const vecs: { tip: V3; color: string; label: string; glyph?: [number, number] }[] = [];
    if (s.Bmag > 0) vecs.push({ tip: scale3(sol.bHat, 1.4 * (s.Bmag / B_MAX)), color: p.bfield, label: 'B' });
    if (s.speed > 0) vecs.push({ tip: scale3(sol.vHat, 0.5 * (s.speed / 1e6)), color: p.ink, label: 'v' });
    if (sol.Fmag > 0) vecs.push({ tip: scale3(sol.F, 0.6 / F_REF), color: p.force, label: 'F' });
    // a vector seen almost end-on becomes a ⊙/⊗ glyph beside the charge, placed away from the arrows
    const screenLen = (tip: V3) => {
      const [x, y] = scr(tip);
      return Math.hypot(x - cx, y - cy);
    };
    const taken: number[] = vecs.filter((v) => screenLen(v.tip) >= END_ON).map((v) => {
      const [x, y] = scr(v.tip);
      return Math.atan2(y - cy, x - cx);
    });
    for (const v of vecs.filter((v) => screenLen(v.tip) < END_ON)) {
      let best = 0;
      let bestGap = -1;
      for (let i = 0; i < 8; i++) {
        const ang = -Math.PI * 0.75 + (i * Math.PI) / 4; // start up-left
        const gap = Math.min(Math.PI, ...taken.map((t) => Math.abs(Math.atan2(Math.sin(ang - t), Math.cos(ang - t)))));
        if (gap > bestGap + 1e-6) {
          bestGap = gap;
          best = ang;
        }
      }
      taken.push(best);
      v.glyph = [cx + 46 * Math.cos(best), cy + 46 * Math.sin(best)];
    }
    const behind = vecs.filter((v) => v.tip[2] < -1e-9);
    const front = vecs.filter((v) => v.tip[2] >= -1e-9);
    // a vector into the page is seen through the paper: dim it slightly
    behind.sort((a, b) => depth(cam, a.tip) - depth(cam, b.tip));
    front.sort((a, b) => depth(cam, a.tip) - depth(cam, b.tip));

    // the angle α between v and B, in their common plane (hidden when either is seen end-on)
    const arc = () => {
      if (s.speed === 0 || s.Bmag === 0 || s.alpha === 0) return;
      if (vecs.some((v) => v.label !== 'F' && v.glyph)) return;
      const pts: [number, number][] = [];
      const R = 0.42;
      const uHat = UNIT[s.u];
      for (let i = 0; i <= 24; i++) {
        const t = (sol.a * i) / 24;
        pts.push(scr(add3(scale3(sol.bHat, R * Math.cos(t)), scale3(uHat, R * Math.sin(t)))));
      }
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.stroke();
      const mid = sol.a / 2;
      const [lx, ly] = scr(add3(scale3(sol.bHat, (R + 0.16) * Math.cos(mid)), scale3(uHat, (R + 0.16) * Math.sin(mid))));
      ctx.font = `italic 700 15px ${p.fontUi}`;
      ctx.fillStyle = p.ink2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('α', lx, ly);
      ctx.restore();
    };

    for (const v of behind) drawVector(ctx, scr, cam, O, v.tip, v.color, v.label, v.glyph, p, 0.75);
    arc();
    chargeDisc(ctx, cx, cy, 11, sol.q, p);
    for (const v of front) drawVector(ctx, scr, cam, O, v.tip, v.color, v.label, v.glyph, p, 1);

    // the verdict, in the margin
    const note =
      sol.why === 'rest'
        ? 'המטען במנוחה: אין כוח מגנטי'
        : sol.why === 'along'
          ? 'המטען נע לאורך השדה: אין כוח'
          : sol.why === 'no-field'
            ? 'אין שדה, ואין כוח'
            : 'הכוח ניצב גם למהירות וגם לשדה';
    handNote(ctx, note, cx, view.h - 18, p, 16);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') change({ alpha: s.alpha + 5 });
    else if (e.key === 'ArrowLeft') change({ alpha: s.alpha - 5 });
    else if (e.key === 'ArrowUp') change({ view: s.view + 5 });
    else if (e.key === 'ArrowDown') change({ view: s.view - 5 });
    else if (e.key === ' ' || e.key === 'Enter') change({ particle: s.particle === 'proton' ? 'electron' : 'proton' });
    else return;
    e.preventDefault();
  };

  const verdict =
    sol.why === 'rest'
      ? 'אין כוח: המטען במנוחה'
      : sol.why === 'along'
        ? 'אין כוח: המהירות לאורך השדה'
        : sol.why === 'no-field'
          ? 'אין כוח: אין שדה'
          : `כיוון הכוח: ${AXIS_HE[sol.fAxis!]}`;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: מטען נע בשדה מגנטי, במבט תלת-ממדי. ${describe(s, sol)} במקלדת: חיצים ימינה ושמאלה משנים את הזווית α, חיצים למעלה ולמטה את זווית ההסתכלות, רווח מחליף בין פרוטון לאלקטרון.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(initial(props));
        setLive('האיור אופס.');
      }}
      onKeyDown={onKeyDown}
      readout={
        <>
          <span>
            <b class="q">
              F = |q|vB·sinα = {sci(sol.Fmag)} N
            </b>
          </span>
          <span>
            <b class="q">α = {s.alpha}°</b>
          </span>
          <span>
            <b>{verdict}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="החלקיק">
            {(['proton', 'electron'] as Particle[]).map((k) => (
              <Toggle
                key={k}
                label={`${PARTICLES[k].name} (${k === 'proton' ? '+' : '−'})`}
                on={s.particle === k}
                swatch={k === 'proton' ? 'var(--pos)' : 'var(--neg)'}
                onChange={() => change({ particle: k })}
              />
            ))}
          </div>
          <div class="group" role="group" aria-label="כיוון השדה B">
            <span style={{ color: 'var(--ink-2)' }}>השדה B:</span>
            {B_CHOICES.map((ax) => (
              <Toggle key={ax} label={AXIS_HE[ax]} on={s.B === ax} swatch="var(--bfield)" onChange={() => change({ B: ax })} />
            ))}
          </div>
          <div class="group" role="group" aria-label="כיוון המהירות כש-α = 90°">
            <span style={{ color: 'var(--ink-2)' }}>כיוון המהירות כש-α = 90°:</span>
            {perpTo(s.B).map((ax) => (
              <Toggle key={ax} label={AXIS_HE[ax]} on={s.u === ax} onChange={() => change({ u: ax })} />
            ))}
          </div>
          <Slider label="הזווית α בין v ל-B" min={0} max={180} step={5} value={s.alpha} format={(x) => `${x}°`} onChange={(x) => change({ alpha: x })} />
          <Slider label="המהירות v" min={0} max={V_MAX} step={V_STEP} value={s.speed} format={(x) => `${sci(x)} m/s`} onChange={(x) => change({ speed: x })} />
          <Slider label="עוצמת השדה B" min={0} max={B_MAX} step={B_STEP} value={s.Bmag} format={(x) => `${sci(x)} T`} onChange={(x) => change({ Bmag: x })} />
          <Slider
            label="זווית ההסתכלות"
            min={0}
            max={V_MAX_VIEW}
            step={1}
            value={s.view}
            format={(x) => (x <= FACE_ON ? `${Math.round(x)}° (ישר על הדף)` : `${Math.round(x)}°`)}
            onChange={(x) => change({ view: x })}
          />
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------ drawing */

type Scr = (p: V3) => [number, number];

/** A small triad in the corner: right, up and out of the page, as the camera sees them. */
function axes(ctx: CanvasRenderingContext2D, cam: Camera, ox: number, oy: number, p: Palette) {
  const L = 26;
  const items: [V3, string][] = [
    [[1, 0, 0], 'ימינה'],
    [[0, 1, 0], 'למעלה'],
    [[0, 0, 1], 'החוצה מהדף'],
  ];
  ctx.save();
  ctx.font = `11px ${p.fontUi}`;
  ctx.fillStyle = p.ink3;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [d, name] of items) {
    const [fx, fy] = flat(cam, d);
    const tx = ox + fx * L;
    const ty = oy - fy * L;
    if (Math.hypot(fx, fy) * L < 6) {
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ox, oy, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ox, oy, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`⊙ ${name}`, ox + 10, oy + 16);
      continue;
    }
    arrow(ctx, ox, oy, tx, ty, { color: p.ink3, width: 1.3, head: 6 });
    const n = Math.hypot(tx - ox, ty - oy);
    ctx.fillText(name, tx + ((tx - ox) / n) * 22, ty + ((ty - oy) / n) * 10);
  }
  ctx.restore();
}

/** The page: a sheet in the x–y plane, with ruled lines so its tilt reads at a glance. */
function drawSheet(ctx: CanvasRenderingContext2D, scr: Scr, p: Palette) {
  const c: V3[] = [
    [-SHEET_X, -SHEET_Y, 0],
    [SHEET_X, -SHEET_Y, 0],
    [SHEET_X, SHEET_Y, 0],
    [-SHEET_X, SHEET_Y, 0],
  ];
  ctx.save();
  ctx.beginPath();
  c.forEach((q, i) => (i ? ctx.lineTo(...scr(q)) : ctx.moveTo(...scr(q))));
  ctx.closePath();
  ctx.fillStyle = withAlpha(mix(p.paper, p.ink, 0.05), 0.72);
  ctx.fill();
  ctx.strokeStyle = p.ink3;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = withAlpha(p.ink, 0.08);
  for (let y = -SHEET_Y + 0.26; y < SHEET_Y; y += 0.26) {
    ctx.beginPath();
    ctx.moveTo(...scr([-SHEET_X + 0.1, y, 0]));
    ctx.lineTo(...scr([SHEET_X - 0.1, y, 0]));
    ctx.stroke();
  }
  ctx.font = `12px ${p.fontUi}`;
  ctx.fillStyle = p.ink3;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  const [tx, ty] = scr([SHEET_X - 0.08, SHEET_Y - 0.06, 0]);
  ctx.fillText('הדף', tx, ty);
  ctx.restore();
}

/** Straight field lines parallel to B, on a lattice around the charge; split at the sheet. */
function fieldLines(b: Axis, Bmag: number): { a: V3; b: V3; behind: boolean }[] {
  if (Bmag === 0) return [];
  const bHat = UNIT[b];
  const [e1, e2] = AXES.filter((a) => a.endsWith('+') && dot3(UNIT[a], bHat) === 0).map((a) => UNIT[a]);
  const out: { a: V3; b: V3; behind: boolean }[] = [];
  const S = 0.95;
  const half = b.startsWith('z') ? 1.25 : 1.85;
  for (const i of [-1, 0, 1]) {
    for (const j of [-1, 0, 1]) {
      if (i === 0 && j === 0) continue;
      const base = add3(scale3(e1, i * S), scale3(e2, j * S));
      const a = add3(base, scale3(bHat, -half));
      const c = add3(base, scale3(bHat, half));
      if (b.startsWith('z')) {
        // pierce the page: the half below z = 0 is behind the sheet
        const mid: V3 = [base[0], base[1], 0];
        const lo = a[2] < 0 ? a : c;
        const hi = a[2] < 0 ? c : a;
        out.push({ a: lo, b: mid, behind: true }, { a: mid, b: hi, behind: false });
      } else {
        out.push({ a, b: c, behind: base[2] < 0 });
      }
    }
  }
  return out;
}

/** A thin field line from a to b (along B), with a chevron; seen end-on it becomes a small ⊙/⊗. */
function drawFieldLine(ctx: CanvasRenderingContext2D, scr: Scr, cam: Camera, a: V3, b: V3, p: Palette, B: Axis) {
  const [x1, y1] = scr(a);
  const [x2, y2] = scr(b);
  const L = Math.hypot(x2 - x1, y2 - y1);
  const bHat = UNIT[B];
  if (L < 6) {
    // looking along the line: a field mark, dot if B comes at the reader, cross if it goes away
    const toward = depth(cam, bHat) > 0;
    ctx.save();
    ctx.strokeStyle = withAlpha(p.bfield, 0.7);
    ctx.fillStyle = withAlpha(p.bfield, 0.7);
    ctx.lineWidth = 1.6;
    if (toward) {
      ctx.beginPath();
      ctx.arc(x2, y2, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const d = 4;
      ctx.beginPath();
      ctx.moveTo(x2 - d, y2 - d);
      ctx.lineTo(x2 + d, y2 + d);
      ctx.moveTo(x2 - d, y2 + d);
      ctx.lineTo(x2 + d, y2 - d);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.strokeStyle = withAlpha(p.bfield, 0.38);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // a chevron along B on the longer pieces
  ctx.restore();
  if (L > 40) {
    // the screen direction of +B: from a toward a point one unit further along B
    const along = scr(add3(a, bHat));
    const fx = along[0] - x1;
    const fy = along[1] - y1;
    const fl = Math.hypot(fx, fy) || 1;
    chevron(ctx, (x1 + x2) / 2, (y1 + y2) / 2, fx / fl, fy / fl, 6, withAlpha(p.bfield, 0.65));
  }
}

/** A vector from o to tip; a vector seen almost end-on becomes ⊙ (coming at the reader) or ⊗. */
function drawVector(
  ctx: CanvasRenderingContext2D,
  scr: Scr,
  cam: Camera,
  o: V3,
  tip: V3,
  color: string,
  label: string,
  glyph: [number, number] | undefined,
  p: Palette,
  alpha: number,
) {
  const [x1, y1] = scr(o);
  const [x2, y2] = scr(tip);
  const L = Math.hypot(x2 - x1, y2 - y1);
  ctx.save();
  ctx.font = `italic 700 17px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (glyph) {
    const toward = depth(cam, tip) > depth(cam, o);
    const [gx, gy] = glyph;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gx, gy, 11, 0, Math.PI * 2);
    ctx.stroke();
    if (toward) {
      ctx.beginPath();
      ctx.arc(gx, gy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const d = 7;
      ctx.beginPath();
      ctx.moveTo(gx - d, gy - d);
      ctx.lineTo(gx + d, gy + d);
      ctx.moveTo(gx - d, gy + d);
      ctx.lineTo(gx + d, gy - d);
      ctx.stroke();
    }
    ctx.fillText(label, gx + 20, gy);
    ctx.restore();
    return;
  }
  ctx.restore();
  arrow(ctx, x1, y1, x2, y2, { color, width: 3, head: 13, alpha });
  ctx.save();
  ctx.font = `italic 700 17px ${p.fontUi}`;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x2 + ((x2 - x1) / L) * 14, y2 + ((y2 - y1) / L) * 14);
  ctx.restore();
}
