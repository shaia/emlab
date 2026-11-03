/**
 * Relaxation grid (lesson 6.9): Laplace's equation solved live. A grid of nodes 1 cm apart; the
 * conductors (and the box's walls) are held at fixed potentials, and every other node is replaced,
 * sweep after sweep, by the average of its four neighbours (Jacobi) or pushed past it (over-relaxation).
 * The heat map and the equipotential lines show the potential, the strip below the map shows the
 * residual (how far the grid is from solving the equation) falling on a log scale, and the probe reads
 * a node's potential beside the mean of its neighbours. The learner can paint conductors, scramble the
 * guess and relax again (the same answer: uniqueness), and in the image scene compare the relaxed grid
 * with the exact image solution of a long line charge in front of a grounded plane.
 *
 * Physics: src/physics/laplace.ts (jacobiStep, sorStep, residual, relax) and src/physics/relaxation.ts
 * (scenes, lineImagePotential, neighbourMean, freeExtremes). The grid is a cross-section of a geometry
 * that does not change perpendicular to the page, so its "charge" is a line charge, not a point charge.
 *
 * Motion: sweeps run only while the figure is visible and motion is allowed. In still mode nothing
 * moves; "סבב אחד" and "עד הסוף" advance the grid by hand, and text steps show the solved grid.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { contourFromGrid } from '~/physics/potential';
import { jacobiStep, relax, residual, sorStep, type Grid } from '~/physics/laplace';
import {
  buildScene,
  freeExtremes,
  lineImagePotential,
  maxDifference,
  neighbourMean,
  SCENE_H,
  SCENE_NX,
  SCENE_NY,
  SCENE_V0,
  touchesFixed,
  type Scene,
  type SceneId,
} from '~/physics/relaxation';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useMounted } from '~/ui/useMounted';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type Palette, type View } from './core/canvas';
import { chargeDisc, mix, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Toggle, type TaskDef } from './core/SimShell';

const MAP_W = (SCENE_NX - 1) * SCENE_H + SCENE_H;
const MAP_H = (SCENE_NY - 1) * SCENE_H + SCENE_H;
const GRAPH_H = 0.17;
const WORLD_W = MAP_W + 0.02;
const WORLD_H = MAP_H + GRAPH_H + 0.02;
/** the grid has solved the equation once the residual is below this [V/m²] */
const RES_TOL = 1;
const OMEGA = 1.85;
/** Jacobi is slow: it takes several sweeps per frame, over-relaxation one */
const SWEEPS_PER_FRAME = { jacobi: 20, sor: 1 } as const;
const LOG_TOP = 7;
const LOG_BOTTOM = -1;

type Method = keyof typeof SWEEPS_PER_FRAME;
type Tool = 'probe' | 'paint+' | 'paint0' | 'paint-' | 'erase';

const SCENE_LABEL: Record<SceneId, string> = {
  box: 'קופסה עם מכסה',
  plates: 'שני לוחות',
  free: 'קופסה ריקה',
  image: 'תיל מול מישור',
};
const TOOL_LABEL: Record<Tool, string> = {
  probe: 'גשש',
  'paint+': 'מוליך +100 V',
  paint0: 'מוליך 0 V',
  'paint-': 'מוליך −100 V',
  erase: 'מחיקה',
};
const TOOL_V: Partial<Record<Tool, number>> = { 'paint+': SCENE_V0, paint0: 0, 'paint-': -SCENE_V0 };
const LEVELS: Record<SceneId, number[]> = {
  box: [10, 20, 30, 40, 50, 60, 70, 80, 90],
  plates: [-80, -60, -40, -20, 0, 20, 40, 60, 80],
  free: [-80, -60, -40, -20, 20, 40, 60, 80],
  image: [3, 6, 10, 15, 20, 30],
};
/** heat-map scale: |V| at full tint [V] */
const V_SCALE: Record<SceneId, number> = { box: 100, plates: 100, free: 100, image: 40 };
const PROBE_START: Record<SceneId, [number, number]> = { box: [40, 25], plates: [40, 25], free: [40, 25], image: [55, 26] };

const TASK_LABEL: Record<string, string> = {
  relax: 'הריצו את הרלקסציה (או לחצו "עד הסוף") עד שהשארית יורדת מתחת ל-1 V/m².',
  mean: 'אחרי שהרשת התכנסה, הזיזו את הגשש לצומת חופשי והשוו את V לממוצע ארבעת השכנים.',
  draw: 'צבעו מוליך משלכם (לפחות 4 צמתים), והריצו שוב עד ההתכנסות.',
  unique: 'אחרי התכנסות לחצו "ניחוש אקראי" והריצו שוב: האם הפתרון החדש שונה מהקודם?',
  image: 'בתצוגה "תיל מול מישור": הדליקו את "פתרון מטען הדמות" אחרי ההתכנסות, והשוו את הקווים.',
};

export interface RelaxationGridProps {
  id: string;
  scene?: SceneId;
  scenes?: SceneId[];
  method?: Method;
  tasks?: string[];
}

interface Ui {
  scene: SceneId;
  method: Method;
  running: boolean;
  tool: Tool;
  probe: [number, number];
  compare: boolean;
  /** bumped to re-render readouts while the grid changes underneath */
  tick: number;
}

/** colour ramps for the heat map, rebuilt when the palette changes */
interface Ramp {
  key: string;
  pos: [number, number, number][];
  neg: [number, number, number][];
}
const RAMP_N = 48;
const rgb = (s: string): [number, number, number] => {
  const m = s.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0'];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
};
function makeRamp(p: Palette): Ramp {
  const ramp = (to: string) => Array.from({ length: RAMP_N + 1 }, (_, n) => rgb(mix(p.paper, to, 0.62 * (n / RAMP_N))));
  return { key: `${p.paper}|${p.pos}|${p.neg}`, pos: ramp(p.pos), neg: ramp(p.neg) };
}

const nodeIndex = (g: Grid, i: number, j: number) => j * g.nx + i;
/** an LTR run (a number with its unit) isolated inside a Hebrew canvas label, so "0 V" never reads "V 0" */
const iso = (t: string) => `⁦${t}⁩`;
/** potentials below half a millivolt read as 0, not as rounding noise like 2·10⁻⁶ */
const fmtV = (v: number) => (Math.abs(v) < 5e-4 ? '0' : sci(v));

export default function RelaxationGrid(props: RelaxationGridProps) {
  const mounted = useMounted();
  const initUi = (): Ui => {
    const scene = props.scene ?? 'box';
    return { scene, method: props.method ?? 'jacobi', running: false, tool: 'probe', probe: PROBE_START[scene], compare: false, tick: 0 };
  };
  const [ui, setUi] = useState<Ui>(initUi);
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const [live, setLive] = useState('');

  const sceneRef = useRef<Scene>(buildScene(ui.scene));
  const sweeps = useRef(0);
  const history = useRef<Vec2[]>([]);
  const lastPush = useRef(0);
  // learner actions: tasks tick only from these, never from a text step
  const userRun = useRef(false);
  const userMoved = useRef(false);
  const userCompare = useRef(false);
  const painted = useRef(0);
  const beforeScramble = useRef<Float64Array | null>(null);
  const ramp = useRef<Ramp | null>(null);
  const offscreen = useRef<HTMLCanvasElement | null>(null);

  const tasks: TaskDef[] = (props.tasks ?? []).map((t) => ({ id: t, label: TASK_LABEL[t] ?? t }));
  const has = (t: string) => props.tasks?.includes(t) ?? false;
  const done = (t: string) => markTask(`${props.id}:${t}`);

  const res = () => residual(sceneRef.current.grid);
  const record = () => {
    history.current.push([sweeps.current, res()]);
    if (history.current.length > 4000) history.current.splice(0, history.current.length - 4000);
  };

  /** start a scene from the zero guess */
  const load = (scene: SceneId) => {
    sceneRef.current = buildScene(scene);
    sweeps.current = 0;
    history.current = [];
    painted.current = 0;
    beforeScramble.current = null;
    record();
  };
  /** relax to the end at once (still mode, text steps that want the answer, "עד הסוף") */
  const solve = () => {
    const g = sceneRef.current.grid;
    let n = 0;
    // well below the running threshold, so two solves from different guesses agree to a fraction of a millivolt
    while (residual(g) > RES_TOL / 100 && n < 4000) {
      sorStep(g, OMEGA);
      n++;
      sweeps.current++;
      if (n % 4 === 0) record();
    }
    record();
  };
  const sweep = (method: Method, count: number) => {
    const g = sceneRef.current.grid;
    for (let n = 0; n < count; n++) {
      if (method === 'jacobi') jacobiStep(g);
      else sorStep(g, OMEGA);
      sweeps.current++;
    }
    record();
  };
  const converged = () => res() <= RES_TOL;

  // text steps
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userRun.current = false;
        userMoved.current = false;
        userCompare.current = false;
        const prev = uiRef.current;
        const scene = typeof st.scene === 'string' && st.scene in SCENE_LABEL ? (st.scene as SceneId) : prev.scene;
        const fresh = scene !== prev.scene || st.fresh === true;
        if (fresh) load(scene);
        const method: Method = st.method === 'jacobi' || st.method === 'sor' ? st.method : prev.method;
        // the answer at once when asked, and always when nothing may move
        const instant = st.relaxed === true || !motionAllowed();
        if (instant) solve();
        const probe: [number, number] = Array.isArray(st.probe) && st.probe.length === 2 ? [Number(st.probe[0]), Number(st.probe[1])] : fresh ? PROBE_START[scene] : prev.probe;
        setUi({
          ...prev,
          scene,
          method,
          probe,
          tool: 'probe',
          compare: typeof st.compare === 'boolean' ? st.compare : fresh ? false : prev.compare,
          running: !instant && !converged(),
          tick: prev.tick + 1,
        });
      }),
    [props.id],
  );

  // in still mode nothing will ever run on its own: show the solved grid from the start
  useEffect(() => {
    if (!mounted || motionAllowed() || sweeps.current > 0) return;
    solve();
    setUi((u) => ({ ...u, tick: u.tick + 1 }));
  }, [mounted]);

  // tasks
  useEffect(() => {
    if (!mounted) return;
    const ok = converged();
    if (!ok) return;
    const g = sceneRef.current.grid;
    if (has('relax') && userRun.current) done('relax');
    if (has('mean') && userMoved.current && !g.fixed[nodeIndex(g, ui.probe[0], ui.probe[1])]) done('mean');
    if (has('draw') && userRun.current && painted.current >= 4) done('draw');
    if (has('unique') && userRun.current && beforeScramble.current && maxDifference(beforeScramble.current, g.V) < 0.1) done('unique');
    if (has('image') && ui.scene === 'image' && ui.compare && userCompare.current) done('image');
  }, [ui, mounted]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const st = uiRef.current;
    // the relaxation itself: only while running, visible and allowed (the frame loop checks the first two)
    if (st.running && motionAllowed()) {
      sweep(st.method, SWEEPS_PER_FRAME[st.method]);
      const now = performance.now();
      const finished = converged();
      if (finished || now - lastPush.current > 120) {
        lastPush.current = now;
        setUi((u) => ({ ...u, running: u.running && !finished, tick: u.tick + 1 }));
        if (finished) setLive(`הרשת התכנסה אחרי ${sweeps.current} סבבים.`);
      }
    }
    const sc = sceneRef.current;
    const g = sc.grid;
    const S = (x: number, y: number) => toScreen(view, x, y);
    const mapOx = -WORLD_W / 2 + 0.01 + SCENE_H / 2;
    const mapOy = WORLD_H / 2 - 0.01 - MAP_H + SCENE_H / 2;
    // world position of node (i, j) in the canvas
    const N = (i: number, j: number) => S(mapOx + i * SCENE_H, mapOy + j * SCENE_H);
    const cell = SCENE_H * view.ppm;

    // heat map: one pixel per node, scaled up and smoothed
    if (!ramp.current || ramp.current.key !== `${p.paper}|${p.pos}|${p.neg}`) ramp.current = makeRamp(p);
    if (!offscreen.current) {
      offscreen.current = document.createElement('canvas');
      offscreen.current.width = g.nx;
      offscreen.current.height = g.ny;
    }
    const oc = offscreen.current.getContext('2d');
    if (oc) {
      const img = oc.createImageData(g.nx, g.ny);
      const vs = V_SCALE[st.scene];
      const r = ramp.current;
      for (let j = 0; j < g.ny; j++) {
        for (let i = 0; i < g.nx; i++) {
          const v = g.V[nodeIndex(g, i, j)];
          const n = Math.min(RAMP_N, Math.round((Math.abs(v) / vs) * RAMP_N));
          const c = v >= 0 ? r.pos[n] : r.neg[n];
          const o = ((g.ny - 1 - j) * g.nx + i) * 4;
          img.data[o] = c[0];
          img.data[o + 1] = c[1];
          img.data[o + 2] = c[2];
          img.data[o + 3] = 255;
        }
      }
      oc.putImageData(img, 0, 0);
      const [ax, ay] = N(-0.5, g.ny - 0.5);
      const [bx, by] = N(g.nx - 0.5, -0.5);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen.current, ax, ay, bx - ax, by - ay);
      ctx.restore();
    }

    // equipotential lines of the grid, and (image scene) the exact image solution dashed on top
    const bounds = { xmin: mapOx, xmax: mapOx + (g.nx - 1) * SCENE_H, ymin: mapOy, ymax: mapOy + (g.ny - 1) * SCENE_H };
    const vals: number[][] = [];
    for (let j = 0; j < g.ny; j++) {
      const row: number[] = [];
      // the outer edge is left out: a level equal to the grounded walls would otherwise be traced along them
      for (let i = 0; i < g.nx; i++) row.push(i === 0 || j === 0 || i === g.nx - 1 || j === g.ny - 1 ? Number.NaN : g.V[nodeIndex(g, i, j)]);
      vals.push(row);
    }
    const strokeSegs = (segs: [Vec2, Vec2][]) => {
      ctx.beginPath();
      for (const [a, b] of segs) {
        const [x1, y1] = S(a[0], a[1]);
        const [x2, y2] = S(b[0], b[1]);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.lineCap = 'round';
    for (const lv of LEVELS[st.scene]) {
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = lv === 0 ? 2.2 : 1.5;
      ctx.setLineDash(lv < 0 ? [5, 4] : []);
      strokeSegs(contourFromGrid(vals, bounds, lv));
    }
    ctx.setLineDash([]);
    if (st.scene === 'image' && st.compare) {
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([2, 5]);
      for (const seg of exactContours) strokeSegs(seg.map(([a, b]) => [[a[0] + mapOx - sc.x0, a[1] + mapOy - sc.y0], [b[0] + mapOx - sc.x0, b[1] + mapOy - sc.y0]] as [Vec2, Vec2]));
    }
    ctx.restore();

    // conductors and walls: fixed nodes as solid cells with their sign
    ctx.save();
    for (let j = 0; j < g.ny; j++) {
      for (let i = 0; i < g.nx; i++) {
        const k = nodeIndex(g, i, j);
        if (!g.fixed[k]) continue;
        const edge = i === 0 || j === 0 || i === g.nx - 1 || j === g.ny - 1;
        const metal = sc.planeRow !== undefined && j <= sc.planeRow;
        if (edge && !metal && st.scene === 'image') continue; // the image scene's far edges are just a boundary
        const v = g.V[k];
        const [cx, cy] = N(i, j);
        ctx.fillStyle = metal ? withAlpha(p.ink3, 0.55) : v > 0 ? p.pos : v < 0 ? p.neg : p.ink3;
        ctx.fillRect(cx - cell / 2 - 0.3, cy - cell / 2 - 0.3, cell + 0.6, cell + 0.6);
        if (!edge && !metal && cell >= 6 && v !== 0) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          const gl = cell * 0.28;
          ctx.beginPath();
          ctx.moveTo(cx - gl, cy);
          ctx.lineTo(cx + gl, cy);
          if (v > 0) {
            ctx.moveTo(cx, cy - gl);
            ctx.lineTo(cx, cy + gl);
          }
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // labels of the scene
    ctx.save();
    ctx.font = `600 12px ${p.fontUi}`;
    ctx.fillStyle = p.ink;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    // a Hebrew label runs right to left inside the LTR stage, or "100 V" lands on the wrong side
    const tag = (text: string, x: number, y: number) => {
      ctx.direction = /[֐-׿]/.test(text) ? 'rtl' : 'ltr';
      ctx.textAlign = 'center';
      const w = ctx.measureText(text).width + 10;
      ctx.fillStyle = withAlpha(p.paper, 0.85);
      ctx.fillRect(x - w / 2, y - 9, w, 18);
      ctx.fillStyle = p.ink;
      ctx.fillText(text, x, y);
    };
    if (st.scene === 'box') {
      const [lx, ly] = N((g.nx - 1) / 2, g.ny - 1);
      tag(`מכסה: ${iso('100 V')}`, lx, ly + 16);
      const [bx, by] = N((g.nx - 1) / 2, 0);
      tag(`דפנות: ${iso('0 V')}`, bx, by - 16);
    } else if (st.scene === 'plates') {
      const plateX = [Math.round((g.nx - 1) / 2 - Math.round(g.nx * 0.3) / 2), Math.round((g.nx - 1) / 2 + Math.round(g.nx * 0.3) / 2)];
      const top = Math.round((g.ny - Math.round(g.ny * 0.56)) / 2) + Math.round(g.ny * 0.56);
      const [ax, ay] = N(plateX[0], top);
      tag('+100 V', ax, ay - 4);
      const [bx, by] = N(plateX[1], top);
      tag('−100 V', bx, by - 4);
      const [fx, fy] = N((g.nx - 1) / 2, 0);
      tag(`דפנות: ${iso('0 V')}`, fx, fy - 16);
    } else if (st.scene === 'free') {
      const [fx, fy] = N((g.nx - 1) / 2, 0);
      tag(`דפנות: ${iso('0 V')}`, fx, fy - 16);
    } else if (sc.source && sc.planeRow !== undefined) {
      const [px, py] = N(18, sc.planeRow / 2);
      tag(`מתכת מוארקת, ${iso('V = 0')}`, px, py);
      const [sx, sy] = N(sc.source.i, sc.source.j);
      ctx.direction = 'ltr';
      chargeDisc(ctx, sx, sy, 8, 1, p, { label: '+λ' });
      if (st.compare) {
        // the image: not a real charge, so a dashed ring with its sign, inside the metal
        const [ix, iy] = N(sc.source.i, 2 * sc.planeRow - sc.source.j);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = p.neg;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(ix, iy, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(ix - 4, iy);
        ctx.lineTo(ix + 4, iy);
        ctx.stroke();
        tag(`דמות: ${iso('−λ')}`, ix + 52, iy);
      }
    }
    ctx.restore();

    // the probe and its four neighbours
    const [pi, pj] = st.probe;
    const [px, py] = N(pi, pj);
    ctx.save();
    ctx.fillStyle = p.ink;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [nx, ny] = N(pi + di, pj + dj);
      ctx.beginPath();
      ctx.arc(nx, ny, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = p.ink;
    ctx.fillStyle = withAlpha(p.paper, 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(6, cell * 0.9), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = p.ink;
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 13px ${p.fontUi}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('P', px + 9, py - 7);
    ctx.restore();

    // the residual on a log scale against the sweep count
    const [gx0, gy0] = S(-WORLD_W / 2 + 0.06, -WORLD_H / 2 + GRAPH_H - 0.025);
    const [gx1, gy1] = S(WORLD_W / 2 - 0.02, -WORLD_H / 2 + 0.03);
    const hist = history.current;
    const nMax = Math.max(200, ...(hist.length ? [hist[hist.length - 1][0]] : [0]));
    const X = (n: number) => gx0 + (n / nMax) * (gx1 - gx0);
    const Y = (r: number) => {
      const l = Math.max(LOG_BOTTOM, Math.min(LOG_TOP, Math.log10(Math.max(r, 1e-12))));
      return gy0 + ((LOG_TOP - l) / (LOG_TOP - LOG_BOTTOM)) * (gy1 - gy0);
    };
    ctx.save();
    ctx.strokeStyle = p.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    ctx.font = `11px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const e of [6, 3, 0]) ctx.fillText(`10${e === 0 ? '⁰' : e === 3 ? '³' : '⁶'}`, gx0 - 4, Y(10 ** e));
    // the convergence line
    ctx.strokeStyle = p.ink3;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(gx0, Y(RES_TOL));
    ctx.lineTo(gx1, Y(RES_TOL));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach(([n, r], k) => (k === 0 ? ctx.moveTo(X(n), Y(r)) : ctx.lineTo(X(n), Y(r))));
    ctx.stroke();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = p.ink;
    ctx.font = `600 11px ${p.fontUi}`;
    ctx.fillText('השארית (V/m²) לפי מספר הסבבים', gx1 - 4, gy0 + 3);
    ctx.textAlign = 'left';
    ctx.font = `11px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.fillText(`${nMax}`, gx1 - 22, gy1 + 2);
    ctx.restore();
  };

  // the exact image solution's lines, in scene coordinates (static)
  const exactContours = useMemo(() => {
    const sc = buildScene('image');
    const src = sc.source!;
    const vals: number[][] = [];
    for (let j = 0; j < SCENE_NY; j++) {
      const row: number[] = [];
      for (let i = 0; i < SCENE_NX; i++) {
        const near = Math.hypot(i - src.i, j - src.j) < 1.5;
        row.push(near ? Number.NaN : lineImagePotential(src.lambda, src.d, sc.x0 + i * SCENE_H, sc.y0 + j * SCENE_H));
      }
      vals.push(row);
    }
    const b = { xmin: sc.x0, xmax: sc.x0 + (SCENE_NX - 1) * SCENE_H, ymin: sc.y0, ymax: sc.y0 + (SCENE_NY - 1) * SCENE_H };
    return LEVELS.image.map((lv) => contourFromGrid(vals, b, lv));
  }, []);

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: ui.running });
  useEffect(invalidate, [ui]);

  /* ---------------------------------------------------------------- input */

  const nodeAt = (v: View, sx: number, sy: number): [number, number] => {
    const [x, y] = toWorld(v, sx, sy);
    const mapOx = -WORLD_W / 2 + 0.01 + SCENE_H / 2;
    const mapOy = WORLD_H / 2 - 0.01 - MAP_H + SCENE_H / 2;
    return [Math.round((x - mapOx) / SCENE_H), Math.round((y - mapOy) / SCENE_H)];
  };
  const inside = ([i, j]: [number, number]) => i >= 1 && j >= 1 && i <= SCENE_NX - 2 && j <= SCENE_NY - 2;
  const canPaint = (t: Tool) => t !== 'probe' && uiRef.current.scene !== 'image';

  const paintAt = (i0: number, j0: number, t: Tool) => {
    const g = sceneRef.current.grid;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = i0 + di;
        const j = j0 + dj;
        if (!inside([i, j])) continue;
        const k = nodeIndex(g, i, j);
        if (t === 'erase') {
          if (g.fixed[k]) {
            g.fixed[k] = 0;
            painted.current++;
          }
        } else {
          g.fixed[k] = 1;
          g.V[k] = TOOL_V[t] ?? 0;
          painted.current++;
        }
      }
    }
    userRun.current = true;
    record();
  };
  const afterEdit = () => setUi((u) => ({ ...u, running: motionAllowed() && !converged(), tick: u.tick + 1 }));

  const dragging = useRef(false);
  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const n = nodeAt(v, e.offsetX, e.offsetY);
    if (!inside(n)) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (canPaint(ui.tool)) {
      paintAt(n[0], n[1], ui.tool);
      afterEdit();
    } else {
      userMoved.current = true;
      setUi((u) => ({ ...u, probe: n }));
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!dragging.current || !v) return;
    const n = nodeAt(v, e.offsetX, e.offsetY);
    if (!inside(n)) return;
    if (canPaint(ui.tool)) {
      paintAt(n[0], n[1], ui.tool);
      afterEdit();
    } else {
      userMoved.current = true;
      setUi((u) => (u.probe[0] === n[0] && u.probe[1] === n[1] ? u : { ...u, probe: n }));
    }
  };
  const onPointerUp = () => {
    if (dragging.current) setLive(describe());
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (d[e.key]) {
      e.preventDefault();
      userMoved.current = true;
      setUi((u) => {
        const n: [number, number] = [Math.max(1, Math.min(SCENE_NX - 2, u.probe[0] + d[e.key][0])), Math.max(1, Math.min(SCENE_NY - 2, u.probe[1] + d[e.key][1]))];
        return { ...u, probe: n };
      });
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && canPaint(ui.tool)) {
      e.preventDefault();
      paintAt(ui.probe[0], ui.probe[1], ui.tool);
      afterEdit();
    }
  };

  /* ---------------------------------------------------------------- readouts */

  const sc = sceneRef.current;
  const g = sc.grid;
  const kP = nodeIndex(g, ui.probe[0], ui.probe[1]);
  const vP = g.V[kP];
  const fixedP = !!g.fixed[kP];
  const chargedP = !!(g.rho && g.rho[kP] !== 0);
  const meanP = neighbourMean(g, ui.probe[0], ui.probe[1]);
  const r = res();
  const isConverged = r <= RES_TOL;
  const ext = freeExtremes(g);
  const nextToSource = (e: { i: number; j: number }) => !!sc.source && Math.abs(e.i - sc.source.i) + Math.abs(e.j - sc.source.j) === 1;
  const where = (e: { i: number; j: number }) => (nextToSource(e) ? 'צמוד לתיל הטעון' : touchesFixed(g, e.i, e.j) ? 'צמוד למוליך או לדופן' : 'בתוך האזור הריק');
  const exactP =
    sc.source && ui.probe[1] > (sc.planeRow ?? 0)
      ? lineImagePotential(sc.source.lambda, sc.source.d, sc.x0 + ui.probe[0] * SCENE_H, sc.y0 + ui.probe[1] * SCENE_H)
      : sc.source
        ? 0
        : null;
  const describe = () => `ב-P: ${fmtV(vP)} V; ממוצע ארבעת השכנים ${fmtV(meanP)} V. ${sweeps.current} סבבים, השארית ${sci(r)} V/m².`;

  const still = mounted ? !motionAllowed() : true;
  const offered = props.scenes ?? (Object.keys(SCENE_LABEL) as SceneId[]);
  const userAct = () => {
    userRun.current = true;
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: רשת רלקסציה, ${SCENE_LABEL[ui.scene]}. ${describe()} הזיזו את הגשש בחיצים; בכלי צביעה Enter צובע מוליך במקום הגשש.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      cursor={canPaint(ui.tool) ? 'crosshair' : 'pointer'}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onReset={() => {
        userRun.current = false;
        userMoved.current = false;
        userCompare.current = false;
        const u = initUi();
        load(u.scene);
        if (!motionAllowed()) solve();
        setUi({ ...u, running: false, tick: ui.tick + 1 });
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            ב-P: <b class="q">V = {fmtV(vP)} V</b>
          </span>
          <span>
            {fixedP ? (
              'P על מוליך: הפוטנציאל שלו קבוע'
            ) : chargedP ? (
              <>
                P על התיל הטעון: <b class="q">V = ממוצע השכנים + h²ρ/(4ε₀)</b>
              </>
            ) : (
              <>
                ממוצע ארבעת השכנים: <b class="q">{fmtV(meanP)} V</b>
              </>
            )}
          </span>
          {exactP !== null && ui.compare && (
            <span>
              פתרון מטען הדמות ב-P:{' '}
              <b class="q">
                {sci(exactP)} V{Math.abs(exactP) > 0.5 && !fixedP && !chargedP ? ` (הפרש ${sci((Math.abs(vP - exactP) / Math.abs(exactP)) * 100, 2)}%)` : ''}
              </b>
            </span>
          )}
          <span>
            סבבים: <b class="q">{sweeps.current}</b> · השארית: <b class="q">{sci(r)} V/m²</b>
            {isConverged ? ' (התכנסה)' : ''}
          </span>
          {ext.max.i >= 0 && ext.max.V > 0.5 && (
            <span>
              הערך הגבוה ביותר בצומת ריק: <b class="q">{sci(ext.max.V)} V</b>, {where(ext.max)}
            </span>
          )}
          {ext.min.i >= 0 && ext.min.V < -0.5 && (
            <span>
              הנמוך ביותר: <b class="q">{sci(ext.min.V)} V</b>, {where(ext.min)}
            </span>
          )}
        </>
      }
      controls={
        <>
          {offered.length > 1 && (
            <div class="group" role="group" aria-label="המצב שעל הרשת">
              {offered.map((k) => (
                <button
                  type="button"
                  key={k}
                  class={`toggle ${ui.scene === k ? 'on' : ''}`}
                  aria-pressed={ui.scene === k}
                  onClick={() => {
                    load(k);
                    if (!motionAllowed()) solve();
                    setUi({ ...ui, scene: k, probe: PROBE_START[k], compare: false, tool: 'probe', running: false, tick: ui.tick + 1 });
                  }}
                >
                  {SCENE_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          <div class="group" role="group" aria-label="הרלקסציה">
            {!still && (
              <button
                type="button"
                class={`toggle ${ui.running ? 'on' : ''}`}
                aria-pressed={ui.running}
                onClick={() => {
                  userAct();
                  setUi({ ...ui, running: !ui.running && !converged(), tick: ui.tick + 1 });
                }}
              >
                {ui.running ? 'עצירה' : 'הרצה'}
              </button>
            )}
            <button
              type="button"
              class="toggle"
              onClick={() => {
                userAct();
                sweep(ui.method, 1);
                setUi({ ...ui, running: false, tick: ui.tick + 1 });
                setLive(describe());
              }}
            >
              סבב אחד
            </button>
            <button
              type="button"
              class="toggle"
              onClick={() => {
                userAct();
                solve();
                setUi({ ...ui, running: false, tick: ui.tick + 1 });
                setLive(`הרשת התכנסה אחרי ${sweeps.current} סבבים.`);
              }}
            >
              עד הסוף
            </button>
            <button
              type="button"
              class="toggle"
              onClick={() => {
                const gg = sceneRef.current.grid;
                beforeScramble.current = converged() ? gg.V.slice() : null;
                for (let k = 0; k < gg.V.length; k++) if (!gg.fixed[k]) gg.V[k] = (Math.random() * 2 - 1) * SCENE_V0;
                userAct();
                record();
                setUi({ ...ui, running: motionAllowed(), tick: ui.tick + 1 });
                setLive('הניחוש הוחלף בערכים אקראיים.');
              }}
            >
              ניחוש אקראי
            </button>
          </div>
          <div class="group" role="group" aria-label="שיטת הרלקסציה">
            {(['jacobi', 'sor'] as Method[]).map((m) => (
              <button type="button" key={m} class={`toggle ${ui.method === m ? 'on' : ''}`} aria-pressed={ui.method === m} onClick={() => setUi({ ...ui, method: m })}>
                {m === 'jacobi' ? 'יעקובי: ממוצע השכנים' : 'רלקסציית-יתר: מהירה'}
              </button>
            ))}
          </div>
          {ui.scene !== 'image' ? (
            <div class="group" role="group" aria-label="כלי">
              {(Object.keys(TOOL_LABEL) as Tool[]).map((t) => (
                <button type="button" key={t} class={`toggle ${ui.tool === t ? 'on' : ''}`} aria-pressed={ui.tool === t} onClick={() => setUi({ ...ui, tool: t })}>
                  {TOOL_LABEL[t]}
                </button>
              ))}
            </div>
          ) : (
            <Toggle
              label="פתרון מטען הדמות"
              on={ui.compare}
              onChange={(v) => {
                userCompare.current = v;
                setUi({ ...ui, compare: v });
              }}
            />
          )}
        </>
      }
    />
  );
}
