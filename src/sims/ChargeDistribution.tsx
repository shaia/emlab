/**
 * Charge distribution: a rod, a ring or a disc cut into N point charges. At the probe P each piece's
 * field dE is drawn tip to tail, so the chain of arrows ends at the vector sum; the dashed arrow is the
 * closed form (the integral). As N grows the chain smooths into a curve and its end meets the dashed
 * tip. Built for lesson 6.4.
 *
 * - Rod: the probe moves anywhere in the plane; the readout compares the sum, the closed form and the
 *   two limit models (infinite line 2kλ/d, point charge kQ/r²).
 * - Ring and disc: the probe moves on the axis; an oblique view shows the body, a graph on the right
 *   shows E along the axis (the ring's peak at R/√2, the disc's approach to σ/(2ε₀)).
 *
 * Every number drawn or printed comes from src/physics/charge-pieces.ts and continuous.ts. Arrow lengths
 * are compressed (tanh) so that both weak and strong fields fit; the chain and the dashed arrow share one
 * scale, so their geometry is exact.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { discModels, discPieces, ringModels, ringOpposite, ringPieces, rodMirror, rodModels, rodPieces, vectorError } from '~/physics/charge-pieces';
import { discAxisField, discAxisFieldByRings, ringAxisField, ringAxisPeak, rodField } from '~/physics/continuous';
import { K } from '~/physics/constants';
import type { Vec2, Vec3 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, chargeDisc, paperGrid, scaleBar, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, makePlot, type Plot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Mode = 'rod' | 'ring' | 'disc';

/** the rod's line density [C/m] */
const LAMBDA = 1e-8;
/** the ring: 4 nC on a radius of 10 cm */
const RING_Q = 4e-9;
const RING_R = 0.1;
/** the disc's surface density: the ring's 4 nC spread over a disc of radius 10 cm [C/m²] */
const SIGMA = RING_Q / (Math.PI * RING_R * RING_R);
/** pieces on each ring of the disc */
const PER_RING = 24;

const WORLD_W = 1.3;
const WORLD_H = WORLD_W / 1.5;
const X_MAX = 0.6;
const Y_MAX = 0.4;
/** the axis range of the ring and the disc [m] */
const Z_RANGE: Record<'ring' | 'disc', [number, number]> = { ring: [-0.1, 0.25], disc: [0.005, 0.4] };
const DISC_R_MAX = 0.25;
/** oblique view: the depth axis X is drawn this much along +z */
const OBLIQUE = 0.4;
/** field strengths [N/C] at which the arrow is ~76% of its longest */
const E0: Record<Mode, number> = { rod: 2500, ring: 1400, disc: 5000 };

const MODE_LABEL: Record<Mode, string> = { rod: 'מוט', ring: 'טבעת', disc: 'דיסקה' };

const TASK_LABEL: Record<string, string> = {
  'rod-converge': 'קרבו את P למוט, עד 3 ס״מ ממנו (ולא מעבר לקצה), והגדילו את N עד שההפרש בין הסכום לאינטגרל קטן מ-1%.',
  'rod-line': 'מצאו מקום (או אורך מוט) שבו השדה של המוט שווה, בהפרש של פחות מ-1%, לשדה של תיל אינסופי.',
  'rod-point': 'מצאו מקום (או אורך מוט) שבו השדה של המוט שווה, בהפרש של פחות מ-2%, לשדה של מטען נקודתי.',
  'ring-centre': 'בחרו טבעת, והביאו את P למרכז הטבעת. מה קורה לשרשרת החצים?',
  'ring-peak': 'מצאו את המקום על הציר שבו השדה של הטבעת חזק ביותר.',
  'disc-converge': 'הגדילו את מספר הטבעות N עד שהסכום קרוב לאינטגרל בפחות מ-1%.',
  'disc-plane': 'מצאו מקום (או רדיוס) שבו הדיסקה נותנת, בהפרש של פחות מ-3%, את השדה של לוח אינסופי.',
  'disc-far': 'מצאו מקום (או רדיוס) שבו הדיסקה נותנת, בהפרש של פחות מ-3%, את השדה של מטען נקודתי.',
};

export interface ChargeDistributionProps {
  id: string;
  mode?: Mode;
  /** the bodies the reader may switch between; one body hides the switch */
  modes?: Mode[];
  /** number of pieces (rod, ring) or of rings (disc) */
  n?: number;
  /** rod length [m] */
  L?: number;
  /** disc radius [m] */
  R?: number;
  /** rod probe [m] */
  probe?: [number, number];
  /** ring/disc probe height on the axis [m] */
  z?: number;
  /** highlight one symmetric pair of pieces */
  pair?: boolean;
  tasks?: string[];
}

interface State {
  mode: Mode;
  n: number;
  L: number;
  R: number;
  probe: [number, number];
  z: number;
  pair: boolean;
}

const N_MAX: Record<Mode, number> = { rod: 40, ring: 48, disc: 40 };
const round = (v: number, step: number) => Math.round(v / step) * step;
const cm = (m: number) => `${sci(Math.round(m * 1000) / 10)} cm`;
const pct = (f: number) => (f < 0.001 ? 'פחות מ-0.1%' : `${sci(f * 100, 2)}%`);

function initial(p: ChargeDistributionProps): State {
  const mode = p.mode ?? 'rod';
  return {
    mode,
    n: p.n ?? (mode === 'disc' ? 2 : mode === 'ring' ? 8 : 4),
    L: p.L ?? 0.4,
    R: p.R ?? RING_R,
    probe: p.probe ?? [0.06, 0.08],
    z: p.z ?? (mode === 'disc' ? 0.05 : 0.15),
    pair: p.pair ?? false,
  };
}

/** keep the rod probe in the frame and off the rod itself */
function clampProbe(L: number, [x, y]: [number, number]): [number, number] {
  let px = Math.max(-X_MAX, Math.min(X_MAX, round(x, 0.005)));
  let py = Math.max(-Y_MAX, Math.min(Y_MAX, round(y, 0.005)));
  if (Math.abs(py) < 0.01 && Math.abs(px) < L / 2 + 0.01) {
    if (Math.abs(px) <= L / 2) py = py < 0 ? -0.01 : 0.01;
    else px = px < 0 ? -L / 2 - 0.01 : L / 2 + 0.01;
  }
  return [px, py];
}
const clampZ = (mode: 'ring' | 'disc', z: number) => {
  const [a, b] = Z_RANGE[mode];
  return Math.max(a, Math.min(b, round(z, 0.005)));
};

/** arrow scale [px per N/C] for a field of strength e: compressed so weak and strong fields both fit */
const arrowScale = (e: number, e0: number, maxPx: number) => (e < 1e-9 * e0 ? maxPx / e0 : (maxPx * Math.tanh(e / e0)) / e);

export default function ChargeDistribution(props: ChargeDistributionProps) {
  const [s, setS] = useState<State>(() => initial(props));
  // the state a text step (or the first render) produced: it must not tick a task, only the reader's own moves do
  const notMine = useRef<State>(s);
  const [live, setLive] = useState('');
  const drag = useRef(false);
  const fromSlider = useRef(false);
  const modes = props.modes ?? [s.mode];
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const mode = (st.mode as Mode) ?? prev.mode;
          const L = typeof st.L === 'number' ? st.L : prev.L;
          return (notMine.current = {
            mode,
            n: typeof st.n === 'number' ? st.n : prev.n,
            L,
            R: typeof st.R === 'number' ? st.R : prev.R,
            probe: Array.isArray(st.probe) ? clampProbe(L, st.probe as [number, number]) : prev.probe,
            z: typeof st.z === 'number' ? st.z : prev.z,
            pair: typeof st.pair === 'boolean' ? st.pair : prev.pair,
          });
        });
      }),
    [props.id],
  );

  /* ------------------------------------------------------------- physics */

  const rod = s.mode === 'rod' ? rodPieces(LAMBDA, s.L, s.n, s.probe) : null;
  const rodExact: Vec2 = rodField(LAMBDA, s.L, s.probe);
  const rodM = rodModels(LAMBDA, s.L, s.probe);
  const ring = s.mode === 'ring' ? ringPieces(RING_Q, RING_R, s.n, s.z) : null;
  const ringM = ringModels(RING_Q, RING_R, s.z);
  const disc = s.mode === 'disc' ? discPieces(SIGMA, s.R, s.n, PER_RING, s.z) : null;
  const discM = discModels(SIGMA, s.R, s.z);

  const sumErr =
    s.mode === 'rod'
      ? vectorError(rod!.sum, rodExact)
      : s.mode === 'ring'
        ? vectorError(ring!.sum, [0, 0, ringM.exact])
        : vectorError(disc!.sum, [0, 0, discM.exact]);

  useEffect(() => {
    const slider = fromSlider.current;
    fromSlider.current = false;
    if (s === notMine.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const [x, y] = s.probe;
    if (s.mode === 'rod') {
      if (has('rod-converge') && Math.abs(y) <= 0.03 && Math.abs(x) <= s.L / 2 && sumErr < 0.01) done('rod-converge');
      if (has('rod-line') && y !== 0 && Math.abs(rodM.exact - rodM.line) / rodM.line < 0.01) done('rod-line');
      if (has('rod-point') && Math.abs(rodM.exact - rodM.point) / rodM.point < 0.02) done('rod-point');
    }
    if (s.mode === 'ring') {
      if (has('ring-centre') && Math.abs(s.z) < 0.003) done('ring-centre');
      if (has('ring-peak') && Math.abs(s.z - ringAxisPeak(RING_R)) < 0.004) done('ring-peak');
    }
    if (s.mode === 'disc') {
      if (has('disc-converge') && slider && sumErr < 0.01) done('disc-converge');
      if (has('disc-plane') && Math.abs(discM.exact - discM.plane) / discM.plane < 0.03) done('disc-plane');
      if (has('disc-far') && Math.abs(discM.exact - discM.point) / discM.point < 0.03) done('disc-far');
    }
  }, [s, props.id, props.tasks]);

  /* -------------------------------------------------------------- layout */

  /** ring/disc: scene on the left, graph on the right */
  const axisLayout = (w: number, h: number, mode: 'ring' | 'disc') => {
    const sceneW = w * 0.56;
    const [z0, z1] = Z_RANGE[mode];
    const half = mode === 'disc' ? DISC_R_MAX + 0.04 : RING_R + 0.07;
    const k = Math.min(sceneW / (z1 - z0 + 0.12), h / (2 * half));
    const sx0 = 14 + (0.06 - z0) * k;
    const sy0 = h * 0.5;
    const project = ([X, Y, Z]: Vec3): Vec2 => [sx0 + k * (Z + OBLIQUE * X), sy0 - k * Y];
    const plotBox = { x: w * 0.6 + 44, y: 52, w: w * 0.4 - 56, h: h - 52 - 50 };
    return { sceneW, k, sx0, sy0, project, plotBox };
  };

  const plotOf = (w: number, h: number, mode: 'ring' | 'disc'): Plot => {
    const { plotBox } = axisLayout(w, h, mode);
    if (mode === 'ring')
      return makePlot(
        plotBox,
        { min: Z_RANGE.ring[0] * 100, max: Z_RANGE.ring[1] * 100, label: 'הגובה z (cm)', ticks: [-10, 0, 10, 20] },
        { min: -1600, max: 1600, label: 'E (N/C)', ticks: [-1500, 0, 1500] },
      );
    return makePlot(
      plotBox,
      { min: 0, max: Z_RANGE.disc[1] * 100, label: 'הגובה z (cm)', ticks: [0, 10, 20, 30, 40] },
      { min: 0, max: 8000, label: 'E (N/C)', ticks: [0, 2500, 5000, 7500] },
    );
  };

  /* ---------------------------------------------------------------- draw */

  const legend = (ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number) => {
    ctx.save();
    ctx.font = `12px ${p.fontUi}`;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.ink2;
    const row = (dy: number, label: string, draw: () => void) => {
      draw();
      ctx.fillText(label, x - 30, y + dy);
    };
    row(0, `סכום ${s.n} ${s.mode === 'disc' ? 'הטבעות' : 'החתיכות'}`, () => arrow(ctx, x - 24, y, x, y, { color: p.efield, width: 3, head: 7 }));
    row(17, 'האינטגרל', () => {
      ctx.setLineDash([4, 3]);
      arrow(ctx, x - 24, y + 17, x, y + 17, { color: p.ink, width: 1.6, head: 7 });
      ctx.setLineDash([]);
    });
    ctx.restore();
  };

  /** the chain of dE arrows from (x0, y0); returns its end */
  const chain = (ctx: CanvasRenderingContext2D, p: Palette, x0: number, y0: number, vecs: Vec2[], hi: Set<number>, alternate = false) => {
    let x = x0;
    let y = y0;
    const n = vecs.length;
    const head = Math.max(4, Math.min(9, 70 / n));
    vecs.forEach(([dx, dy], i) => {
      const on = hi.has(i);
      const color = on ? p.accent : alternate && i % 2 ? withAlpha(p.efield, 0.5) : withAlpha(p.efield, 0.8);
      arrow(ctx, x, y, x + dx, y + dy, { color, width: on ? 2.6 : n > 16 ? 1.1 : 1.5, head: on ? 8 : head });
      x += dx;
      y += dy;
    });
    return [x, y] as const;
  };

  const drawRod = (ctx: CanvasRenderingContext2D, v: FrameInfo['view'], p: Palette) => {
    const pieces = rod!;
    paperGrid(ctx, v, p, 0.1);
    scaleBar(ctx, v, p, 0.2, '20 ס״מ');
    const [ax, ay] = toScreen(v, -s.L / 2, 0);
    const [bx, by] = toScreen(v, s.L / 2, 0);
    // the continuous rod behind its pieces
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = withAlpha(p.pos, 0.22);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // piece boundaries: each piece is Δx = L/N long
    ctx.strokeStyle = withAlpha(p.ink2, 0.6);
    ctx.lineWidth = 1;
    if (s.n <= 40) {
      for (let i = 0; i <= s.n; i++) {
        const [tx, ty] = toScreen(v, -s.L / 2 + (i * s.L) / s.n, 0);
        ctx.beginPath();
        ctx.moveTo(tx, ty - 8);
        ctx.lineTo(tx, ty + 8);
        ctx.stroke();
      }
    }
    ctx.restore();
    const [px, py] = toScreen(v, s.probe[0], s.probe[1]);
    const hi = new Set<number>();
    if (s.pair && s.n > 1) {
      hi.add(0);
      hi.add(rodMirror(0, s.n));
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = withAlpha(p.accent, 0.7);
      ctx.lineWidth = 1.2;
      for (const i of hi) {
        const [cx, cy] = toScreen(v, pieces.charges[i].x, 0);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
      ctx.restore();
    }
    const r = Math.max(3.5, Math.min(10, 40 / Math.sqrt(s.n)));
    pieces.charges.forEach((c, i) => {
      const [cx, cy] = toScreen(v, c.x, 0);
      chargeDisc(ctx, cx, cy, r, 1, p, { selected: hi.has(i) });
    });

    const sc = arrowScale(rodM.exact, E0.rod, Math.min(v.w, v.h) * 0.38);
    const vecs: Vec2[] = pieces.dE.map(([ex, ey]) => [ex * sc, -ey * sc]);
    chain(ctx, p, px, py, vecs, hi);
    arrow(ctx, px, py, px + pieces.sum[0] * sc, py - pieces.sum[1] * sc, { color: p.efield, width: 3.2, head: 11 });
    ctx.setLineDash([5, 4]);
    arrow(ctx, px, py, px + rodExact[0] * sc, py - rodExact[1] * sc, { color: p.ink, width: 1.6, head: 10 });
    ctx.setLineDash([]);
    probeDot(ctx, p, px, py);
    legend(ctx, p, v.w - 14, 58);
  };

  const probeDot = (ctx: CanvasRenderingContext2D, p: Palette, x: number, y: number) => {
    ctx.save();
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.ink;
    ctx.font = `600 13px ${p.fontUi}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('P', x + 7, y - 6);
    ctx.restore();
  };

  const drawAxisBody = (ctx: CanvasRenderingContext2D, v: FrameInfo['view'], p: Palette) => {
    const mode = s.mode as 'ring' | 'disc';
    const { k, sx0, sy0, project, sceneW } = axisLayout(v.w, v.h, mode);
    const [z0, z1] = Z_RANGE[mode];
    const zLo = Math.min(z0, -0.04);
    // the axis
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(sx0 + zLo * k, sy0);
    ctx.lineTo(Math.min(sceneW, sx0 + (z1 + 0.03) * k), sy0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.ink2;
    ctx.font = `12px ${p.fontUi}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('z', Math.min(sceneW, sx0 + (z1 + 0.03) * k), sy0 - 4);
    ctx.restore();

    const radius = mode === 'ring' ? RING_R : s.R;
    const ellipse = (rr: number, back: boolean, color: string, width: number) => {
      ctx.beginPath();
      // the half with X < 0 (behind the axis) first, faint
      const a0 = back ? Math.PI / 2 : -Math.PI / 2;
      for (let j = 0; j <= 48; j++) {
        const t = a0 + (Math.PI * j) / 48;
        const [x, y] = project([rr * Math.cos(t), rr * Math.sin(t), 0]);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    const hi = new Set<number>();
    if (mode === 'ring') {
      const pieces = ring!;
      ellipse(radius, true, withAlpha(p.pos, 0.25), 6);
      ellipse(radius, false, withAlpha(p.pos, 0.4), 6);
      if (s.pair && s.n % 2 === 0) {
        hi.add(0);
        hi.add(ringOpposite(0, s.n));
      }
      const [px, py] = project([0, 0, s.z]);
      const r = Math.max(3.5, Math.min(9, 32 / Math.sqrt(s.n)));
      // back pieces first, so the front ones overlap them
      const order = pieces.charges.map((_, i) => i).sort((a, b) => pieces.charges[a].pos[0] - pieces.charges[b].pos[0]);
      for (const i of order) {
        const [cx, cy] = project(pieces.charges[i].pos);
        if (hi.has(i)) {
          ctx.save();
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = withAlpha(p.accent, 0.75);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(px, py);
          ctx.stroke();
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = pieces.charges[i].pos[0] < 0 ? 0.55 : 1;
        chargeDisc(ctx, cx, cy, r, 1, p, { selected: hi.has(i) });
        ctx.restore();
      }
      const sc = arrowScale(Math.abs(ringM.exact), E0.ring, Math.min(v.w * 0.56, v.h) * 0.42);
      const toPx = ([ex, ey, ez]: Vec3): Vec2 => [sc * (ez + OBLIQUE * ex), -sc * ey];
      chain(ctx, p, px, py, pieces.dE.map(toPx), hi);
      const [sx, sy] = toPx(pieces.sum);
      arrow(ctx, px, py, px + sx, py + sy, { color: p.efield, width: 3.2, head: 11 });
      ctx.setLineDash([5, 4]);
      arrow(ctx, px, py, px + sc * ringM.exact, py, { color: p.ink, width: 1.6, head: 10 });
      ctx.setLineDash([]);
      probeDot(ctx, p, px, py);
    } else {
      const pieces = disc!;
      // the disc face, then each ring of pieces
      ctx.save();
      ctx.beginPath();
      for (let j = 0; j <= 64; j++) {
        const t = (2 * Math.PI * j) / 64;
        const [x, y] = project([radius * Math.cos(t), radius * Math.sin(t), 0]);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.fillStyle = withAlpha(p.pos, 0.14);
      ctx.fill();
      ctx.restore();
      const dr = radius / s.n;
      for (let i = 0; i < s.n; i++) {
        const rr = (i + 0.5) * dr;
        const c = i % 2 ? withAlpha(p.pos, 0.45) : withAlpha(p.pos, 0.8);
        ellipse(rr, true, c, 1.4);
        ellipse(rr, false, c, 1.4);
      }
      // sign glyphs on the face: the charge is never colour-only
      ctx.save();
      ctx.fillStyle = p.ink;
      ctx.font = `700 13px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [a, f] of [
        [0.5, 0.75],
        [2.1, 0.55],
        [3.6, 0.8],
        [5.0, 0.45],
      ] as const) {
        const [x, y] = project([radius * f * Math.cos(a), radius * f * Math.sin(a), 0]);
        ctx.fillText('+', x, y);
      }
      ctx.restore();
      const [px, py] = project([0, 0, s.z]);
      const sc = arrowScale(discM.exact, E0.disc, Math.min(v.w * 0.56, v.h) * 0.42);
      chain(ctx, p, px, py, pieces.dE.map(([, , ez]) => [sc * ez, 0] as Vec2), hi, true);
      arrow(ctx, px, py + 7, px + sc * pieces.sum[2], py + 7, { color: p.efield, width: 3.2, head: 11 });
      ctx.setLineDash([5, 4]);
      arrow(ctx, px, py - 7, px + sc * discM.exact, py - 7, { color: p.ink, width: 1.6, head: 10 });
      ctx.setLineDash([]);
      probeDot(ctx, p, px, py);
    }
    // scale bar of 10 cm under the scene
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.5;
    const by = v.h - 16;
    ctx.beginPath();
    ctx.moveTo(14, by - 4);
    ctx.lineTo(14, by);
    ctx.lineTo(14 + 0.1 * k, by);
    ctx.lineTo(14 + 0.1 * k, by - 4);
    ctx.stroke();
    ctx.fillStyle = p.ink2;
    ctx.font = `12px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.direction = 'rtl';
    ctx.fillText('10 ס״מ', 14 + 0.05 * k, by - 5);
    ctx.restore();

    drawPlot(ctx, v, p, mode);
  };

  const drawPlot = (ctx: CanvasRenderingContext2D, v: FrameInfo['view'], p: Palette, mode: 'ring' | 'disc') => {
    const plot = plotOf(v.w, v.h, mode);
    drawAxes(ctx, plot, p);
    if (mode === 'ring') {
      // far model kQ/z², drawn only where it is on scale
      drawCurve(ctx, plot, (zc) => (Math.abs(zc) < 4 ? NaN : (Math.sign(zc) * K * RING_Q) / (zc / 100) ** 2), { color: p.ink3, width: 1.4, dash: [4, 4] });
      drawCurve(ctx, plot, (zc) => ringAxisField(RING_Q, RING_R, zc / 100), { color: p.efield, width: 2.4, samples: 200 });
      const zp = ringAxisPeak(RING_R) * 100;
      ctx.save();
      ctx.strokeStyle = withAlpha(p.accent, 0.7);
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(plot.px(zp), plot.box.y);
      ctx.lineTo(plot.px(zp), plot.py(0));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = p.ink2;
      ctx.font = `11px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('R/√2', plot.px(zp), plot.py(0) + 3);
      ctx.restore();
      drawMarker(ctx, plot, s.z * 100, ring!.sum[2], p.accent, { radius: 5 });
    } else {
      drawCurve(ctx, plot, () => discM.plane, { color: p.ink3, width: 1.4, dash: [6, 4] });
      drawCurve(ctx, plot, (zc) => (zc < 2 ? NaN : (K * SIGMA * Math.PI * s.R * s.R) / (zc / 100) ** 2), { color: p.ink3, width: 1.4, dash: [2, 3] });
      drawCurve(ctx, plot, (zc) => discAxisFieldByRings(SIGMA, s.R, Math.max(zc, 0.05) / 100, s.n), { color: withAlpha(p.efield, 0.55), width: 1.6, dash: [1, 3], samples: 120 });
      drawCurve(ctx, plot, (zc) => discAxisField(SIGMA, s.R, zc / 100), { color: p.efield, width: 2.4, samples: 200 });
      ctx.save();
      ctx.fillStyle = p.ink2;
      ctx.font = `11px ${p.fontUi}`;
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('לוח אינסופי', plot.box.x + plot.box.w, plot.py(discM.plane) - 2);
      ctx.restore();
      drawMarker(ctx, plot, s.z * 100, discM.exact, p.accent, { radius: 5 });
    }
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    if (s.mode === 'rod') drawRod(ctx, view, p);
    else drawAxisBody(ctx, view, p);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  /* ------------------------------------------------------------- input */

  const describe = (st: State): string => {
    if (st.mode === 'rod') {
      const m = rodModels(LAMBDA, st.L, st.probe);
      return `מוט באורך ${cm(st.L)} מחולק ל-${st.n} חתיכות. הנקודה P ב-x = ${cm(st.probe[0])}, y = ${cm(st.probe[1])}. השדה המדויק ${sci(m.exact)} ניוטון לקולון.`;
    }
    if (st.mode === 'ring') return `טבעת מחולקת ל-${st.n} חתיכות. P על הציר, z = ${cm(st.z)}. השדה ${sci(ringAxisField(RING_Q, RING_R, st.z))} ניוטון לקולון.`;
    return `דיסקה ברדיוס ${cm(st.R)} מחולקת ל-${st.n} טבעות. P על הציר, z = ${cm(st.z)}. השדה ${sci(discAxisField(SIGMA, st.R, st.z))} ניוטון לקולון.`;
  };

  const moveTo = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    if (s.mode === 'rod') {
      const [x, y] = toWorld(v, e.offsetX, e.offsetY);
      setS((prev) => ({ ...prev, probe: clampProbe(prev.L, [x, y]) }));
      return;
    }
    const mode = s.mode;
    const { sx0, k, sceneW } = axisLayout(v.w, v.h, mode);
    let z: number;
    if (e.offsetX <= sceneW) z = (e.offsetX - sx0) / k;
    else {
      const plot = plotOf(v.w, v.h, mode);
      z = ((plot.x.min + ((e.offsetX - plot.box.x) / plot.box.w) * (plot.x.max - plot.x.min)) as number) / 100;
    }
    setS((prev) => ({ ...prev, z: clampZ(mode, z) }));
  };
  const onPointerDown = (e: PointerEvent) => {
    drag.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    moveTo(e);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (drag.current) moveTo(e);
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.05 : 0.01;
    setS((prev) => {
      let next: State;
      if (prev.mode === 'rod') {
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
        next = { ...prev, probe: clampProbe(prev.L, [prev.probe[0] + dx, prev.probe[1] + dy]) };
      } else {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
        next = { ...prev, z: clampZ(prev.mode, prev.z + d * (e.shiftKey ? 0.02 : 0.005)) };
      }
      setLive(describe(next));
      return next;
    });
  };

  const setMode = (mode: Mode) => {
    // the props describe the figure's own body; another body starts from its defaults
    const st = { ...initial(mode === props.mode ? props : { id: props.id, mode }), pair: s.pair };
    setS(st);
    setLive(`מוצג: ${MODE_LABEL[mode]}. ${describe(st)}`);
  };
  const slide = (patch: Partial<State>) => {
    fromSlider.current = true;
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (patch.L !== undefined) next.probe = clampProbe(next.L, next.probe);
      return next;
    });
  };

  /* ------------------------------------------------------------ readout */

  const readout = (() => {
    if (s.mode === 'rod') {
      const dq = (LAMBDA * s.L) / s.n;
      return (
        <>
          <span>
            <b class="q">N = {s.n}</b>, כל חתיכה <b class="q">Δx = {cm(s.L / s.n)}</b>, <b class="q">Δq = λΔx = {sci(dq * 1e9)} nC</b>
          </span>
          <span>
            סכום {s.n} המטענים: <b class="q">E = {sci(Math.hypot(rod!.sum[0], rod!.sum[1]))} N/C</b>
          </span>
          <span>
            האינטגרל: <b class="q">E = {sci(rodM.exact)} N/C</b> (לאורך המוט <b class="q">Eₓ = {sci(Math.abs(rodExact[0]) < 1e-9 ? 0 : rodExact[0])} N/C</b>)
          </span>
          <span>
            ההפרש: <b class="q">{pct(sumErr)}</b>
          </span>
          <span>
            תיל אינסופי, <b class="q">2kλ/y</b>: <b class="q">{s.probe[1] === 0 ? '—' : `${sci(rodM.line)} N/C`}</b>
          </span>
          <span>
            מטען נקודתי במרכז המוט, <b class="q">kQ/r²</b>: <b class="q">{sci(rodM.point)} N/C</b>
          </span>
        </>
      );
    }
    if (s.mode === 'ring') {
      const trans = Math.hypot(ring!.sum[0], ring!.sum[1]);
      return (
        <>
          <span>
            <b class="q">N = {s.n}</b>, <b class="q">z = {cm(s.z)}</b>
          </span>
          <span>
            לאורך הציר, סכום {s.n} המטענים: <b class="q">E = {sci(Math.abs(ring!.sum[2]) < 1e-9 ? 0 : ring!.sum[2])} N/C</b>, ניצב לציר:{' '}
            <b class="q">{sci(trans < 1e-6 ? 0 : trans)} N/C</b>
          </span>
          <span>
            האינטגרל: <b class="q">E = {sci(Math.abs(ringM.exact) < 1e-9 ? 0 : ringM.exact)} N/C</b>
          </span>
          <span>
            מטען נקודתי, <b class="q">kQ/z²</b>: <b class="q">{s.z === 0 ? '—' : `${sci(ringM.point)} N/C`}</b>
          </span>
        </>
      );
    }
    return (
      <>
        <span>
          <b class="q">N = {s.n}</b> טבעות, <b class="q">R = {cm(s.R)}</b>, <b class="q">z = {cm(s.z)}</b>
        </span>
        <span>
          סכום {s.n} הטבעות: <b class="q">E = {sci(disc!.sum[2])} N/C</b>
        </span>
        <span>
          האינטגרל: <b class="q">E = {sci(discM.exact)} N/C</b>
        </span>
        <span>
          ההפרש: <b class="q">{pct(sumErr)}</b>
        </span>
        <span>
          לוח אינסופי, <b class="q">σ/(2ε₀)</b>: <b class="q">{sci(discM.plane)} N/C</b>
        </span>
        <span>
          מטען נקודתי, <b class="q">kQ/z²</b>: <b class="q">{sci(discM.point)} N/C</b>
        </span>
      </>
    );
  })();

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${MODE_LABEL[s.mode]} טעונה מחולקת למטענים נקודתיים, והשדה בנקודה P כסכום של התרומות שלהם. ${describe(s)} גררו את P או לחצו במקום אחר; במקלדת: חיצים מזיזים את P.`}
      canvasRef={canvasRef}
      aspect={1.5}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(initial(props));
        setLive('האיור אופס.');
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor="crosshair"
      readout={readout}
      controls={
        <>
          {modes.length > 1 && (
            <div class="group" role="group" aria-label="איזה גוף">
              {modes.map((m) => (
                <button type="button" key={m} class={`toggle ${s.mode === m ? 'on' : ''}`} aria-pressed={s.mode === m} onClick={() => setMode(m)}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          )}
          <Slider
            label={s.mode === 'disc' ? 'מספר הטבעות N' : 'מספר החתיכות N'}
            value={s.n}
            min={1}
            max={N_MAX[s.mode]}
            step={1}
            format={(v) => String(v)}
            onChange={(v) => slide({ n: v })}
          />
          {s.mode === 'rod' && (
            <Slider label="אורך המוט L" value={s.L} min={0.05} max={1.2} step={0.05} format={cm} onChange={(v) => slide({ L: Math.round(v * 100) / 100 })} />
          )}
          {s.mode === 'disc' && (
            <Slider label="רדיוס הדיסקה R" value={s.R} min={0.03} max={DISC_R_MAX} step={0.01} format={cm} onChange={(v) => slide({ R: Math.round(v * 100) / 100 })} />
          )}
          {s.mode !== 'disc' && (
            <div class="group" role="group" aria-label="תצוגה">
              <Toggle label="זוג חתיכות סימטרי" on={s.pair} onChange={(v) => setS({ ...s, pair: v })} />
            </div>
          )}
        </>
      }
    />
  );
}
