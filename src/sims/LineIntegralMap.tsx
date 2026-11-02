/**
 * Line integral and gradient on a potential map (lesson 6.6). Two modes share one map:
 *
 * - `paths`: two paths from A to B. Path 1 is straight; path 2 is bent, and the learner drags its
 *   midpoint. Under the map: ∫E·dl along each path (lineIntegral, a midpoint sum over 1500
 *   segments), their difference (the integral round the closed loop), and V(A) − V(B). Scene
 *   `charge` is one point charge, a conservative field: the two integrals agree, wherever path 2
 *   goes, even round the far side of the charge. Scene `swirl` is the rigid-rotation teaching field
 *   (vectorcalc.ts), which is not electrostatic: the integrals differ, and no potential exists.
 * - `gradient`: a probe P with two arrows, −∇V computed from the potential alone (central
 *   differences, minusGradient) and E from Coulomb's law (fieldAt), which coincide; and a "step"
 *   direction û the learner turns, with the rate dV/ds = ∇V·û read out. The rate is zero along the
 *   equipotential and largest along ∇V, opposite to E. An optional grid of −∇V arrows shows them
 *   crossing every equipotential at right angles.
 *
 * Equipotentials come from marching squares over potentialAt (contourFromGrid), as in PotentialMap.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fieldAt, potentialAt, type PointCharge } from '~/physics/electrostatics';
import { bentPath, directionalDerivative, lineIntegral, loopOf, minDistance, minusGradient, straightPath, windingNumber } from '~/physics/lineintegral';
import { contourFromGrid } from '~/physics/potential';
import type { Vec2 } from '~/physics/vec';
import { rotationField, type Field2 } from '~/physics/vectorcalc';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { arrow, chargeDisc, paperGrid, polyline, withAlpha } from './core/ink';
import { directionHe, sci } from './core/format';
import SimShell, { Toggle, type TaskDef } from './core/SimShell';
import { CHARGE_PRESETS, E_REF, MAP, PRESET_LABEL, uC, V_LEVELS, type ChargePreset } from './potentialPresets';

const WORLD_W = 2;
const WORLD_H = 1.15;
const NX = 120;
const NY = 70;
const SEGMENTS = 1500;
/** a path closer than this to a charge is "through it": its integral is not defined [m] */
const CORE = 0.05;
/** rotation step of the direction û, from the buttons and the keyboard [rad] */
const TURN = (5 * Math.PI) / 180;

/* ------------------------------------------------------------ paths mode */

export type PathScene = 'charge' | 'swirl';
const PATH_CHARGE: PointCharge[] = [{ x: -0.3, y: -0.1, q: 2 * uC }];
const A: Vec2 = [-0.55, 0.15];
const B: Vec2 = [0.6, 0.3];
/** where path 2's midpoint starts: above the straight path, the charge outside the loop */
const MID_START: Vec2 = [0, 0.5];
/** the swirl's strength: |E| = ω·r, 10⁵ N/C half a metre from the centre [N/(C·m)] */
const OMEGA = 2e5;
const SWIRL = rotationField(OMEGA);
const SCENE_LABEL: Record<PathScene, string> = { charge: 'מטען נקודתי', swirl: 'שדה מערבולת' };

/** The control point that puts a quadratic path's midpoint at M: C = 2M − (A + B)/2. */
const controlFor = (M: Vec2): Vec2 => [2 * M[0] - (A[0] + B[0]) / 2, 2 * M[1] - (A[1] + B[1]) / 2];

/* --------------------------------------------------------- gradient mode */

const GRAD_PRESETS: ChargePreset[] = ['single', 'dipole', 'unequal'];
const GRAD_PROBE: Vec2 = [0.05, 0.3];

const TASK_LABEL: Record<string, string> = {
  'bend-path': 'גררו את הנקודה שבאמצע מסלול 2 עד שהמסלול יהיה ארוך לפחות פי 1.5 ממסלול 1. השוו את שני האינטגרלים.',
  'other-side': 'גררו את מסלול 2 כך שיעבור מהצד השני של המטען (המטען בין שני המסלולים). האם האינטגרל השתנה?',
  swirl: 'עברו לשדה המערבולת, ושנו את מסלול 2. האם שני האינטגרלים עדיין שווים?',
  level: 'סובבו את חץ הצעד עד שקצב השינוי של V בכיוונו יהיה (כמעט) אפס. לאורך מה הוא מצביע עכשיו?',
  steepest: 'סובבו את חץ הצעד לכיוון שבו V עולה הכי מהר. איך הכיוון הזה קשור לחץ של ‎−∇V‎?',
  compare: 'גררו את P למקום אחר (לפחות 15 ס"מ), והשוו את ‎−∇V‎ ל-E שבשורה שמתחת לאיור.',
};

export interface LineIntegralMapProps {
  id: string;
  mode: 'paths' | 'gradient';
  scene?: PathScene;
  preset?: ChargePreset;
  /** draw the grid of −∇V arrows (gradient mode) */
  grid?: boolean;
  tasks?: string[];
}

interface State {
  scene: PathScene;
  mid: Vec2;
  preset: ChargePreset;
  probe: Vec2;
  /** direction of the step û [rad] */
  theta: number;
  grid: boolean;
  equip: boolean;
}

const chargesOf = (s: State, mode: LineIntegralMapProps['mode']): PointCharge[] =>
  mode === 'paths' ? (s.scene === 'charge' ? PATH_CHARGE : []) : CHARGE_PRESETS[s.preset];

const integralWords = (v: number) => `${Math.abs(v) < 1 ? '0' : sci(v)} V`;

export default function LineIntegralMap(props: LineIntegralMapProps) {
  const mode = props.mode;
  const init = (): State => ({
    scene: props.scene ?? 'charge',
    mid: MID_START,
    preset: props.preset ?? 'unequal',
    probe: GRAD_PROBE,
    theta: Math.PI / 4,
    grid: props.grid ?? mode === 'gradient',
    equip: true,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const drag = useRef<'mid' | 'probe' | 'knob' | null>(null);
  // tasks tick only from the learner's own moves, never from a text step
  const userMoved = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userMoved.current = false;
        setS((prev) => {
          const next = { ...prev };
          if (st.scene === 'charge' || st.scene === 'swirl') next.scene = st.scene;
          if (typeof st.preset === 'string' && GRAD_PRESETS.includes(st.preset as ChargePreset)) next.preset = st.preset as ChargePreset;
          if (Array.isArray(st.mid) && st.mid.length === 2) next.mid = [Number(st.mid[0]), Number(st.mid[1])];
          if (Array.isArray(st.probe) && st.probe.length === 2) next.probe = [Number(st.probe[0]), Number(st.probe[1])];
          if (typeof st.theta === 'number') next.theta = (st.theta * Math.PI) / 180;
          if (typeof st.grid === 'boolean') next.grid = st.grid;
          return next;
        });
      }),
    [props.id],
  );

  const charges = chargesOf(s, mode);
  const field: Field2 = mode === 'paths' && s.scene === 'swirl' ? SWIRL : (x, y) => fieldAt(charges, x, y);
  const Vfun = (x: number, y: number) => potentialAt(charges, x, y);

  /* ---------------- paths */
  const path1 = useMemo(() => straightPath(A, B, SEGMENTS), []);
  const path2 = useMemo(() => bentPath(A, controlFor(s.mid), B, SEGMENTS), [s.mid]);
  const through = mode === 'paths' && charges.some((c) => minDistance(path2, [c.x, c.y]) < CORE);
  const I1 = mode === 'paths' ? lineIntegral(field, path1) : 0;
  const I2 = mode === 'paths' && !through ? lineIntegral(field, path2) : Number.NaN;
  const len = (p: readonly Vec2[]) => p.reduce((acc, q, i) => (i ? acc + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
  const L1 = len(path1);
  const L2 = len(path2);
  const encloses = mode === 'paths' && s.scene === 'charge' && windingNumber(loopOf(path1, path2), [PATH_CHARGE[0].x, PATH_CHARGE[0].y]) !== 0;
  const dVab = mode === 'paths' && s.scene === 'charge' ? Vfun(...A) - Vfun(...B) : Number.NaN;

  /* ---------------- gradient */
  const g = mode === 'gradient' ? minusGradient(Vfun, s.probe[0], s.probe[1]) : ([0, 0] as Vec2);
  const Ec = mode === 'gradient' ? fieldAt(charges, s.probe[0], s.probe[1]) : ([0, 0] as Vec2);
  const gMag = Math.hypot(g[0], g[1]);
  const rate = mode === 'gradient' ? directionalDerivative(Vfun, s.probe[0], s.probe[1], s.theta) : 0;
  // the angle between the step and the drawn arrow −∇V, in degrees, 0…180: 90° along the
  // equipotential, 180° straight uphill
  const downAngle = Math.atan2(g[1], g[0]);
  const between = Math.abs(((((s.theta - downAngle) * 180) / Math.PI + 540) % 360) - 180);

  const contours = useMemo(() => {
    if (charges.length === 0) return [];
    const dx = (MAP.xmax - MAP.xmin) / NX;
    const dy = (MAP.ymax - MAP.ymin) / NY;
    const vals: number[][] = [];
    for (let j = 0; j <= NY; j++) {
      const row: number[] = [];
      for (let i = 0; i <= NX; i++) {
        const x = MAP.xmin + i * dx;
        const y = MAP.ymin + j * dy;
        const near = charges.some((c) => Math.hypot(x - c.x, y - c.y) < 0.045);
        row.push(near ? Number.NaN : potentialAt(charges, x, y));
      }
      vals.push(row);
    }
    const hasZero = charges.some((c) => c.q > 0) && charges.some((c) => c.q < 0);
    return V_LEVELS.filter((v) => v !== 0 || hasZero).map((v) => ({ v, segs: contourFromGrid(vals, MAP, v) }));
  }, [charges]);

  useEffect(() => {
    if (!userMoved.current) return;
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (mode === 'paths') {
      if (has('bend-path') && s.scene === 'charge' && !through && L2 > 1.5 * L1) done('bend-path');
      if (has('other-side') && s.scene === 'charge' && !through && encloses) done('other-side');
      if (has('swirl') && s.scene === 'swirl' && Math.abs(I1 - I2) > 0.05 * Math.abs(I1)) done('swirl');
    } else {
      if (has('level') && gMag > 0 && Math.abs(rate) < 0.1 * gMag) done('level');
      if (has('steepest') && gMag > 0 && rate > 0.995 * gMag) done('steepest');
      if (has('compare') && Math.hypot(s.probe[0] - GRAD_PROBE[0], s.probe[1] - GRAD_PROBE[1]) > 0.15) done('compare');
    }
  }, [s, props.id, props.tasks]);

  /** arrow length on screen for a field of magnitude m, compressed so weak fields still show */
  const arrowLen = (m: number, view: View, max = 0.09) => Math.min(max * view.ppm, 0.07 * view.ppm * Math.sqrt(m / E_REF));

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const S = (x: number, y: number) => toScreen(view, x, y);
    paperGrid(ctx, view, p);

    // a faint field grid: E in paths mode (the only picture of the swirl), −∇V in gradient mode
    const showGrid = mode === 'paths' || s.grid;
    if (showGrid) {
      const step = mode === 'paths' ? 0.2 : 0.125;
      for (let gy = -0.5; gy <= 0.51; gy += step) {
        for (let gx = -0.9; gx <= 0.91; gx += step) {
          // keep clear of each charge and of its label, which sits under it
          if (charges.some((c) => Math.abs(gx - c.x) < 0.13 && gy - c.y < 0.09 && gy - c.y > -0.14)) continue;
          const f = mode === 'paths' ? field(gx, gy) : minusGradient(Vfun, gx, gy);
          const m = Math.hypot(f[0], f[1]);
          if (m < 1) continue;
          const L = arrowLen(m, view, mode === 'paths' ? 0.11 : 0.08);
          const [cx, cy] = S(gx, gy);
          const [ux, uy] = [f[0] / m, -f[1] / m];
          arrow(ctx, cx - (ux * L) / 2, cy - (uy * L) / 2, cx + (ux * L) / 2, cy + (uy * L) / 2, {
            color: withAlpha(p.efield, mode === 'paths' ? 0.45 : 0.6),
            width: 1.6,
            head: 6,
          });
        }
      }
    }

    if (s.equip && contours.length) {
      ctx.save();
      ctx.strokeStyle = p.equip;
      ctx.lineCap = 'round';
      for (const c of contours) {
        ctx.lineWidth = c.v === 0 ? 2.2 : 1.4;
        ctx.setLineDash(c.v < 0 ? [5, 4] : []);
        ctx.beginPath();
        for (const [a, b] of c.segs) {
          const [ax, ay] = S(a[0], a[1]);
          const [bx, by] = S(b[0], b[1]);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    if (mode === 'paths' && s.scene === 'swirl') {
      // the swirl's centre: a small open square, a place and not a charge (this field has no source)
      const [cx, cy] = S(0, 0);
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 5, cy - 5, 10, 10);
      ctx.restore();
    }

    charges.forEach((c, i) => {
      const [sx, sy] = S(c.x, c.y);
      const v = Math.round((c.q / uC) * 10) / 10;
      const name = charges.length > 1 ? `q${i === 0 ? '₁' : '₂'} = ` : '';
      chargeDisc(ctx, sx, sy, 13, c.q, p, { label: `${name}${v > 0 ? '+' : '−'}${Math.abs(v)} μC` });
    });

    if (mode === 'paths') {
      const p1 = path1.map(([x, y]) => S(x, y));
      const p2 = path2.map(([x, y]) => S(x, y));
      polyline(ctx, p1, p.accent, 2.6);
      polyline(ctx, p2, p.hand, 2.6, through ? { dash: [6, 5] } : {});
      // direction chevrons at a third of each path: both run from A to B
      for (const [pts, color] of [
        [path1, p.accent],
        [path2, p.hand],
      ] as const) {
        const k = Math.floor(pts.length * 0.3);
        const [ax, ay] = S(...pts[k - 3]);
        const [bx, by] = S(...pts[k + 3]);
        const L = Math.hypot(bx - ax, by - ay) || 1;
        arrow(ctx, ax, ay, ax + ((bx - ax) / L) * 14, ay + ((by - ay) / L) * 14, { color, width: 2.4, head: 9 });
      }
      // labels 1 and 2 beside the paths
      ctx.save();
      ctx.font = `700 13px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const l1 = S(...path1[Math.floor(SEGMENTS * 0.62)]);
      ctx.fillStyle = p.accent;
      ctx.fillText('1', l1[0], l1[1] - 13);
      const l2 = S(...path2[Math.floor(SEGMENTS * 0.75)]);
      ctx.fillStyle = p.hand;
      ctx.fillText('2', l2[0] + 10, l2[1] + 12);
      ctx.restore();
      // A and B
      for (const [pt, name] of [
        [A, 'A'],
        [B, 'B'],
      ] as const) {
        const [x, y] = S(pt[0], pt[1]);
        ctx.save();
        ctx.fillStyle = p.ink;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `700 15px ${p.fontUi}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(name, x, y - 8);
        ctx.restore();
      }
      // the handle at path 2's midpoint: a solid disc in the path's colour (a ring with a dot would read as ⊙)
      const [mx, my] = S(s.mid[0], s.mid[1]);
      ctx.save();
      ctx.fillStyle = p.hand;
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(mx, my, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    // gradient mode: the probe, −∇V (orange, from the potential) and the step û (accent)
    const [px, py] = S(s.probe[0], s.probe[1]);
    if (gMag >= 1) {
      const L = Math.max(26, arrowLen(gMag, view, 0.2) * 1.6);
      const [ux, uy] = [g[0] / gMag, -g[1] / gMag];
      arrow(ctx, px + ux * 10, py + uy * 10, px + ux * (10 + L), py + uy * (10 + L), { color: p.efield, width: 3, head: 10 });
    }
    const R = 0.16 * view.ppm;
    // the circle the knob runs on
    ctx.save();
    ctx.strokeStyle = withAlpha(p.accent, 0.35);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(px, py, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const [kx, ky] = [px + R * Math.cos(s.theta), py - R * Math.sin(s.theta)];
    arrow(ctx, px + 10 * Math.cos(s.theta), py - 10 * Math.sin(s.theta), kx, ky, { color: p.accent, width: 2.4, head: 9 });
    ctx.save();
    ctx.fillStyle = p.paper;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(kx, ky, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.fillStyle = p.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('û', kx + 9, ky - 9);
    ctx.restore();
    // P: a hollow ring with a dot, a place and not a charge
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
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('P', px - 9, py - 7);
    ctx.restore();
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  const clampMap = (pt: Vec2): Vec2 => [Math.max(-0.95, Math.min(0.95, pt[0])), Math.max(-0.53, Math.min(0.53, pt[1]))];
  const clampProbe = (pt: Vec2): Vec2 => {
    let q = clampMap(pt);
    for (const c of charges) {
      const d = Math.hypot(q[0] - c.x, q[1] - c.y);
      if (d < 0.08) q = [c.x + ((q[0] - c.x) / (d || 1)) * 0.08 + (d ? 0 : 0.08), c.y + ((q[1] - c.y) / (d || 1)) * 0.08];
    }
    return q;
  };

  const say = (st: State) => {
    if (mode === 'paths') return;
    const gg = minusGradient((x, y) => potentialAt(CHARGE_PRESETS[st.preset], x, y), st.probe[0], st.probe[1]);
    const r = directionalDerivative((x, y) => potentialAt(CHARGE_PRESETS[st.preset], x, y), st.probe[0], st.probe[1], st.theta);
    setLive(`מינוס הגרדיאנט ב-P: ${sci(Math.hypot(gg[0], gg[1]))} N/C, ${directionHe(Math.atan2(gg[1], gg[0]))}. קצב השינוי של V בכיוון הצעד: ${sci(r)} V/m.`);
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const near = (pt: Vec2, r: number) => {
      const [x, y] = toScreen(v, pt[0], pt[1]);
      return Math.hypot(e.offsetX - x, e.offsetY - y) < r;
    };
    if (mode === 'paths') {
      if (near(s.mid, 26)) drag.current = 'mid';
    } else {
      const R = 0.16 * v.ppm;
      const [px, py] = toScreen(v, s.probe[0], s.probe[1]);
      const [kx, ky] = [px + R * Math.cos(s.theta), py - R * Math.sin(s.theta)];
      if (Math.hypot(e.offsetX - kx, e.offsetY - ky) < 20) drag.current = 'knob';
      else if (near(s.probe, 26)) drag.current = 'probe';
    }
    if (drag.current) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!drag.current || !v) return;
    userMoved.current = true;
    const w = toWorld(v, e.offsetX, e.offsetY);
    if (drag.current === 'mid') setS((prev) => ({ ...prev, mid: clampMap(w) }));
    else if (drag.current === 'probe') setS((prev) => ({ ...prev, probe: clampProbe(w) }));
    else setS((prev) => ({ ...prev, theta: Math.atan2(w[1] - prev.probe[1], w[0] - prev.probe[0]) }));
  };
  const onPointerUp = () => {
    if (drag.current) {
      if (mode === 'paths') setLive(`מסלול 2: ${Math.round(L2 * 100)} ס"מ, האינטגרל ${Number.isNaN(I2) ? 'לא מוגדר' : integralWords(I2)}.`);
      else say(s);
    }
    drag.current = null;
  };
  const turn = (d: number) => {
    userMoved.current = true;
    setS((prev) => {
      const next = { ...prev, theta: prev.theta + d };
      say(next);
      return next;
    });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (mode === 'gradient' && (e.key === '[' || e.key === ']')) {
      e.preventDefault();
      turn(e.key === '[' ? TURN : -TURN);
      return;
    }
    const step = e.shiftKey ? 0.1 : 0.02;
    const d: Record<string, Vec2> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const dv = d[e.key];
    if (!dv) return;
    e.preventDefault();
    userMoved.current = true;
    setS((prev) => {
      if (mode === 'paths') return { ...prev, mid: clampMap([prev.mid[0] + dv[0], prev.mid[1] + dv[1]]) };
      const next = { ...prev, probe: clampProbe([prev.probe[0] + dv[0], prev.probe[1] + dv[1]]) };
      say(next);
      return next;
    });
  };

  const label =
    mode === 'paths'
      ? `איור חי: ${SCENE_LABEL[s.scene]}, שני מסלולים מ-A ל-B. האינטגרל הקווי במסלול 1: ${integralWords(I1)}; במסלול 2: ${Number.isNaN(I2) ? 'לא מוגדר' : integralWords(I2)}. גררו את אמצע מסלול 2; במקלדת: חיצים.`
      : `איור חי: ${PRESET_LABEL[s.preset]}. ב-P: מינוס הגרדיאנט ${sci(gMag)} N/C. קצב השינוי של V בכיוון הצעד: ${sci(rate)} V/m. גררו את P ואת קצה חץ הצעד; במקלדת: חיצים, ו-[ ] לסיבוב.`;

  return (
    <SimShell
      fig={props.id}
      label={label}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      cursor="grab"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onReset={() => {
        userMoved.current = false;
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        mode === 'paths' ? (
          <>
            <span>
              מסלול 1 (ישר, <bdi class="q">{Math.round(L1 * 100)} cm</bdi>): <b class="q">∫E·dl = {integralWords(I1)}</b>
            </span>
            <span>
              מסלול 2 (<bdi class="q">{Math.round(L2 * 100)} cm</bdi>):{' '}
              {Number.isNaN(I2) ? <b>עובר דרך המטען: לא מוגדר</b> : <b class="q">∫E·dl = {integralWords(I2)}</b>}
            </span>
            {!Number.isNaN(I2) && (
              <span>
                סביב המסלול הסגור (הלוך ב-1, חזור ב-2): <b class="q">∮E·dl = {integralWords(I1 - I2)}</b>
              </span>
            )}
            <span>{s.scene === 'charge' ? <b class="q">V(A) − V(B) = {integralWords(dVab)}</b> : <b>לשדה הזה אין פוטנציאל</b>}</span>
          </>
        ) : (
          <>
            <span>
              הפוטנציאל ב-P: <b class="q">V = {sci(Vfun(s.probe[0], s.probe[1]))} V</b>
            </span>
            <span>
              <bdi dir="ltr">−∇V</bdi> (מהפוטנציאל): <b class="q">{sci(gMag)} N/C, {directionHe(Math.atan2(g[1], g[0]))}</b>
            </span>
            <span>
              E (מחוק קולון): <b class="q">{sci(Math.hypot(Ec[0], Ec[1]))} N/C, {directionHe(Math.atan2(Ec[1], Ec[0]))}</b>
            </span>
            <span>
              קצב השינוי של V בכיוון הצעד: <b class="q">dV/ds = {Math.abs(rate) < 0.5 ? '0' : sci(rate)} V/m</b>
            </span>
            <span>
              הזווית בין הצעד לחץ הכתום: <b class="q">{Math.round(between)}°</b>
            </span>
          </>
        )
      }
      controls={
        mode === 'paths' ? (
          <div class="group" role="group" aria-label="השדה">
            {(Object.keys(SCENE_LABEL) as PathScene[]).map((k) => (
              <button
                type="button"
                key={k}
                class={`toggle ${s.scene === k ? 'on' : ''}`}
                aria-pressed={s.scene === k}
                onClick={() => {
                  userMoved.current = true;
                  setS({ ...s, scene: k });
                }}
              >
                {SCENE_LABEL[k]}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div class="group" role="group" aria-label="סידור המטענים">
              {GRAD_PRESETS.map((k) => (
                <button
                  type="button"
                  key={k}
                  class={`toggle ${s.preset === k ? 'on' : ''}`}
                  aria-pressed={s.preset === k}
                  onClick={() => setS({ ...s, preset: k, probe: GRAD_PROBE })}
                >
                  {PRESET_LABEL[k]}
                </button>
              ))}
            </div>
            <div class="group" role="group" aria-label="סיבוב חץ הצעד">
              <button type="button" class="btn" onClick={() => turn(TURN)}>
                ↺ סיבוב הצעד
              </button>
              <button type="button" class="btn" onClick={() => turn(-TURN)}>
                ↻ סיבוב הצעד
              </button>
            </div>
            <Toggle label="קווים שווי פוטנציאל" on={s.equip} onChange={(v) => setS({ ...s, equip: v })} />
            <Toggle label={<>חיצי <bdi dir="ltr">−∇V</bdi> ברשת</>} on={s.grid} onChange={(v) => setS({ ...s, grid: v })} />
          </>
        )
      }
    />
  );
}
