/**
 * The potential landscape (lesson 2.3): the potential map printed on a sheet that rises off the
 * page, its height at each point standing for V there (landscape.ts). Hills around positive
 * charges, pits around negative ones; the equipotentials become contour lines, and E points
 * down the slope, steepest where the lines crowd. P can be dragged over the sheet.
 *
 * 3D (three.js) only when WebGL exists and motion is allowed. Otherwise, and until the chunk
 * has loaded, the same landscape is drawn in 2D from a fixed oblique angle. The readout comes
 * from src/physics in both views, never from the drawing.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fieldAt, potentialAt } from '~/physics/electrostatics';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { readPalette, useFigureCanvas, type FrameInfo } from '~/sims/core/canvas';
import { arrow, chargeDisc, mix } from '~/sims/core/ink';
import SimShell, { type TaskDef } from '~/sims/core/SimShell';
import {
  CHARGE_PRESETS,
  CHARGE_PROBE_START,
  E_REF,
  eWords,
  MAP,
  PRESET_LABEL,
  V_REF,
  vWords,
  type ChargePreset,
} from '~/sims/potentialPresets';
import { H_CLIP, heightOf, landscapeContours, landscapeGrid, V_CLIP, vAt } from './landscape';
import { webglAvailable } from './webgl';

type SceneModule = typeof import('./landscapeScene');
type Scene = ReturnType<SceneModule['createLandscapeScene']>;

const ASPECT = 1.45;
const KEY_STEP = 0.05;
/** P snaps to the midpoint of a pair from this close [m], as on the flat map */
const SNAP = 0.035;
const E_MIN = 2e3;

const TASK_LABEL: Record<string, string> = {
  flatten: 'השטיחו את הנוף בחזרה למפה, והרימו אותו שוב. האם הקווים שעל הדף זזים, או נשארים במקומם?',
  'flat-spot': 'בשני מטענים זהים: מצאו נקודה שבה הדף שטוח והחץ נעלם. כמה השדה שם, וכמה הפוטנציאל?',
};

export interface PotentialLandscapeProps {
  id: string;
  preset?: ChargePreset;
  /** the presets offered as buttons */
  presets?: ChargePreset[];
  tasks?: string[];
}

interface State {
  preset: ChargePreset;
  probe: Vec2;
  lifted: boolean;
}

const clampProbe = (p: Vec2, preset: ChargePreset): Vec2 => {
  let x = Math.max(MAP.xmin + 0.03, Math.min(MAP.xmax - 0.03, p[0]));
  let y = Math.max(MAP.ymin + 0.03, Math.min(MAP.ymax - 0.03, p[1]));
  const cs = CHARGE_PRESETS[preset];
  // P stays off a clipped top or floor: drawn flat there, while the real slope (the field) is steepest
  for (let k = 0; k < 40 && Math.abs(vAt(cs, x, y)) > V_CLIP; k++) {
    const c = cs.reduce((a, b) => (Math.hypot(x - b.x, y - b.y) < Math.hypot(x - a.x, y - a.y) ? b : a));
    const d = Math.hypot(x - c.x, y - c.y) || 1e-9;
    const ux = d > 1e-9 ? (x - c.x) / d : 1;
    const uy = d > 1e-9 ? (y - c.y) / d : 0;
    x = c.x + ux * (d + 0.01);
    y = c.y + uy * (d + 0.01);
  }
  if (cs.length === 2) {
    const mx = (cs[0].x + cs[1].x) / 2;
    const my = (cs[0].y + cs[1].y) / 2;
    if (Math.hypot(x - mx, y - my) < SNAP) [x, y] = [mx, my];
  }
  return [x, y];
};

function here(s: State) {
  const cs = CHARGE_PRESETS[s.preset];
  return { V: potentialAt(cs, s.probe[0], s.probe[1]), E: fieldAt(cs, s.probe[0], s.probe[1]) };
}

export default function PotentialLandscape(props: PotentialLandscapeProps) {
  const initial = (): State => {
    const preset = props.preset ?? 'single';
    return { preset, probe: CHARGE_PROBE_START[preset], lifted: true };
  };
  const [s, setS] = useState<State>(initial);
  // a change that came from a text step must not tick a task: only the learner's own moves do
  const fromStep = useRef(false);
  const lowered = useRef(false);
  const [live, setLive] = useState('');
  const [want3d, setWant3d] = useState(false);
  const [mod, setMod] = useState<SceneModule | null>(null);
  const [failed, setFailed] = useState(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  // 3D only with WebGL and motion allowed; re-checked when still mode or reduced motion change
  useEffect(() => {
    const check = () => setWant3d(webglAvailable() && motionAllowed());
    check();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', check);
    window.addEventListener('emlab:settings', check);
    return () => {
      mq.removeEventListener('change', check);
      window.removeEventListener('emlab:settings', check);
    };
  }, []);

  useEffect(() => {
    if (!want3d || mod || failed) return;
    import('./landscapeScene').then(setMod).catch(() => setFailed(true));
  }, [want3d, mod, failed]);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        fromStep.current = true;
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.preset === 'string' && st.preset in CHARGE_PRESETS && st.preset !== prev.preset) {
            next.preset = st.preset as ChargePreset;
            next.probe = CHARGE_PROBE_START[next.preset];
          }
          if (Array.isArray(st.probe) && st.probe.length === 2) next.probe = [Number(st.probe[0]), Number(st.probe[1])];
          if (typeof st.lifted === 'boolean') next.lifted = st.lifted;
          return next;
        });
      }),
    [props.id],
  );

  const h = here(s);
  const Emag = Math.hypot(h.E[0], h.E[1]);

  useEffect(() => {
    if (fromStep.current) {
      fromStep.current = false;
      return;
    }
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (!s.lifted) lowered.current = true;
    if (has('flatten') && s.lifted && lowered.current) done('flatten');
    if (has('flat-spot') && s.preset === 'like' && Emag < 0.03 * E_REF && Math.abs(h.V) > 0.5 * V_REF) done('flat-spot');
  }, [s, props.id, props.tasks]);

  const say = (st: State) => {
    const k = here(st);
    return `נקודת המדידה: ${vWords(k.V)}, ${eWords(k.E)}.`;
  };
  const moveProbe = (p: Vec2, final: boolean) => {
    setS((prev) => {
      const next = { ...prev, probe: clampProbe(p, prev.preset) };
      if (final) setLive(say(next));
      return next;
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const m: Record<string, Vec2> = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] };
    const d = m[e.key];
    if (!d) return;
    e.preventDefault();
    moveProbe([s.probe[0] + d[0], s.probe[1] + d[1]], true);
  };

  const offered = props.presets ?? (Object.keys(CHARGE_PRESETS) as ChargePreset[]);
  const shell = {
    fig: props.id,
    label: `איור חי: ${PRESET_LABEL[s.preset]}. ${s.lifted ? 'המפה מורמת לנוף: גובה הדף בכל נקודה מייצג את הפוטנציאל שם.' : 'המפה שטוחה על הדף.'} בנקודת המדידה P: ${vWords(h.V)}, ${eWords(h.E)}. גררו את P; במקלדת: חיצים.`,
    aspect: ASPECT,
    live,
    tasks,
    onKeyDown,
    onReset: () => {
      setS(initial());
      setLive('האיור אופס.');
    },
    readout: (
      <>
        <span>
          הפוטנציאל ב-P: <b class="q">{vWords(h.V)}</b>
        </span>
        <span>
          השדה ב-P: <b class="q">{eWords(h.E)}</b>
        </span>
      </>
    ),
    controls: (
      <>
        <div class="group" role="group" aria-label="סידור המטענים">
          {offered.map((k) => (
            <button
              type="button"
              key={k}
              class={`toggle ${s.preset === k ? 'on' : ''}`}
              aria-pressed={s.preset === k}
              onClick={() => setS({ ...s, preset: k, probe: CHARGE_PROBE_START[k] })}
            >
              {PRESET_LABEL[k]}
            </button>
          ))}
        </div>
        <div class="group" role="group" aria-label="מפה או נוף">
          <button type="button" class={`toggle ${!s.lifted ? 'on' : ''}`} aria-pressed={!s.lifted} onClick={() => setS({ ...s, lifted: false })}>
            מפה שטוחה
          </button>
          <button type="button" class={`toggle ${s.lifted ? 'on' : ''}`} aria-pressed={s.lifted} onClick={() => setS({ ...s, lifted: true })}>
            נוף של גבהים
          </button>
        </div>
      </>
    ),
  };

  return want3d && mod && !failed ? (
    <Canvas3D mod={mod} s={s} shell={shell} onProbe={moveProbe} onFail={() => setFailed(true)} />
  ) : (
    <Canvas2D s={s} shell={shell} onProbe={moveProbe} />
  );
}

type ShellProps = Omit<Parameters<typeof SimShell>[0], 'canvasRef'>;

/* ------------------------------- the 3D view ------------------------------- */

function Canvas3D(p: { mod: SceneModule; s: State; shell: ShellProps; onProbe: (q: Vec2, final: boolean) => void; onFail: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const onProbe = useRef(p.onProbe);
  onProbe.current = p.onProbe;
  const sceneState = (s: State) => ({ charges: CHARGE_PRESETS[s.preset], probe: s.probe, lifted: s.lifted });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.dataset.view = '3d';
    let scene: Scene;
    try {
      scene = p.mod.createLandscapeScene(canvas, readPalette(canvas), sceneState(p.s), (q, final) => onProbe.current(q, final));
    } catch {
      p.onFail();
      return;
    }
    sceneRef.current = scene;
    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(canvas);
    let popTimer = 0;
    const io = new IntersectionObserver((es) => {
      const v = es.some((e) => e.isIntersecting);
      scene.setVisible(v);
      // a beat after it comes into view, so the reader sees the map rise off the page
      if (v && !popTimer) popTimer = window.setTimeout(() => scene.popUp(), 400);
    });
    io.observe(canvas);
    const theme = () => scene.setColors(readPalette(canvas));
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', theme);
    window.addEventListener('emlab:settings', theme);
    return () => {
      window.clearTimeout(popTimer);
      ro.disconnect();
      io.disconnect();
      mq.removeEventListener('change', theme);
      window.removeEventListener('emlab:settings', theme);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setState(sceneState(p.s));
    if (ref.current) ref.current.dataset.lift = p.s.lifted ? '1' : '0';
  }, [p.s.preset, p.s.probe, p.s.lifted]);

  return <SimShell {...p.shell} canvasRef={ref} cursor="grab" label={`${p.shell.label} גררו את הדף כדי לסובב אותו.`} />;
}

/* ------------------- the 2D oblique view (fallback and loading) ------------------- */

const NX2 = 140;
const NY2 = 80;
/**
 * The oblique projection: depth of the map and height, as fractions of the map scale. The view
 * looks down at about 50°, steep enough that a pit stays inside the sheet's front edge.
 */
const K_DEPTH = 0.75;
const K_HEIGHT = 0.62;

function Canvas2D(p: { s: State; shell: ShellProps; onProbe: (q: Vec2, final: boolean) => void }) {
  const { s } = p;
  const lift = s.lifted ? 1 : 0;
  const cs = CHARGE_PRESETS[s.preset];
  const grid = useMemo(() => {
    const vals = landscapeGrid(cs, NX2, NY2);
    // contour segments filed by the grid row they cross, so each is drawn with its own row
    const rows: { v: number; a: Vec2; b: Vec2 }[][] = Array.from({ length: NY2 }, () => []);
    const dy = (MAP.ymax - MAP.ymin) / NY2;
    for (const c of landscapeContours(cs, vals)) {
      for (const [a, b] of c.segs) {
        const j = Math.min(NY2 - 1, Math.max(0, Math.floor(((a[1] + b[1]) / 2 - MAP.ymin) / dy)));
        rows[j].push({ v: c.v, a, b });
      }
    }
    return { heights: vals.map((row) => row.map(heightOf)), rows };
  }, [s.preset]);

  const project = (w: number, h: number) => {
    const scale = Math.min((w * 0.94) / (MAP.xmax - MAP.xmin), (h * 0.92) / ((MAP.ymax - MAP.ymin) * K_DEPTH + 2 * H_CLIP * K_HEIGHT));
    return {
      scale,
      at: (x: number, y: number, z: number): [number, number] => [w / 2 + x * scale, h / 2 - (y * K_DEPTH + z * lift * K_HEIGHT) * scale],
    };
  };

  const draw = ({ ctx, view, palette: pal }: FrameInfo) => {
    const { at } = project(view.w, view.h);
    const dx = (MAP.xmax - MAP.xmin) / NX2;
    const dy = (MAP.ymax - MAP.ymin) / NY2;
    const X = (i: number) => MAP.xmin + i * dx;
    const Y = (j: number) => MAP.ymin + j * dy;
    const hs = grid.heights;
    ctx.lineJoin = 'round';
    // far rows first, so nearer hills cover what lies behind them
    for (let j = NY2 - 1; j >= 0; j--) {
      for (let i = 0; i < NX2; i++) {
        const h00 = hs[j][i] * lift;
        const h10 = hs[j][i + 1] * lift;
        const h01 = hs[j + 1][i] * lift;
        const h11 = hs[j + 1][i + 1] * lift;
        // light from the upper left, towards the reader: slopes facing away are darker
        const gx = (h10 + h11 - h00 - h01) / (2 * dx);
        const gy = (h01 + h11 - h00 - h10) / (2 * dy);
        const lam = (0.5 * gx - 0.35 * gy + 0.8) / Math.sqrt(1 + gx * gx + gy * gy);
        const fill = mix(pal.paper, pal.ink, 0.25 * (1 - Math.max(0, Math.min(1, lam))));
        const q = [at(X(i), Y(j), hs[j][i]), at(X(i + 1), Y(j), hs[j][i + 1]), at(X(i + 1), Y(j + 1), hs[j + 1][i + 1]), at(X(i), Y(j + 1), hs[j + 1][i])];
        ctx.fillStyle = fill;
        ctx.strokeStyle = fill;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(q[0][0], q[0][1]);
        for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = pal.equip;
      for (const seg of grid.rows[j]) {
        const z = heightOf(seg.v);
        ctx.lineWidth = seg.v === 0 ? 2.4 : 1.5;
        ctx.setLineDash(seg.v < 0 ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(...at(seg.a[0], seg.a[1], z));
        ctx.lineTo(...at(seg.b[0], seg.b[1], z));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // a charge at the floor of a pit is drawn with its row, so the pit's near wall can hide it
      for (const c of cs) {
        if (c.q < 0 && c.y >= Y(j) && c.y < Y(j + 1)) chargeDisc(ctx, ...at(c.x, c.y, -H_CLIP), 9, c.q, pal);
      }
    }
    // on a hilltop nothing stands in front: drawn last, after every row
    for (const c of cs) if (c.q > 0) chargeDisc(ctx, ...at(c.x, c.y, H_CLIP), 9, c.q, pal);
    // the rim of the sheet
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const rim: [number, number][] = [];
    for (let i = 0; i <= NX2; i++) rim.push([i, NY2]);
    for (let j = NY2; j >= 0; j--) rim.push([NX2, j]);
    for (let i = NX2; i >= 0; i--) rim.push([i, 0]);
    for (let j = 0; j <= NY2; j++) rim.push([0, j]);
    rim.forEach(([i, j], k) => {
      const [sx, sy] = at(X(i), Y(j), hs[j][i]);
      if (k) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.stroke();

    // P and the arrow of E, down the slope
    const [px, py] = s.probe;
    const hp = heightOf(vAt(cs, px, py));
    const [sx, sy] = at(px, py, hp);
    const [ex, ey] = fieldAt(cs, px, py);
    const m = Math.hypot(ex, ey);
    if (m >= E_MIN) {
      const tx = px + (ex / m) * 0.16;
      const ty = py + (ey / m) * 0.16;
      const [ax, ay] = at(tx, ty, heightOf(vAt(cs, tx, ty)));
      arrow(ctx, sx, sy, ax, ay, { color: pal.efield, width: 2.6, head: 9 });
    }
    ctx.fillStyle = pal.paper;
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 14px ${pal.fontUi}`;
    ctx.textAlign = 'center';
    ctx.fillText('P', sx - 10, sy - 12);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 2, worldHeight: 2 / ASPECT, animate: false });
  useEffect(invalidate, [s, grid]);
  useEffect(() => {
    if (canvasRef.current) canvasRef.current.dataset.view = '2d';
  }, []);
  useEffect(() => {
    if (canvasRef.current) canvasRef.current.dataset.lift = s.lifted ? '1' : '0';
  }, [s.lifted]);

  /** screen → map: the height depends on where the point lands, so refine a few times */
  const toMap = (e: PointerEvent): Vec2 | null => {
    const view = viewRef.current;
    const canvas = canvasRef.current;
    if (!view || !canvas) return null;
    const r = canvas.getBoundingClientRect();
    const { scale } = project(view.w, view.h);
    const x = (e.clientX - r.left - view.w / 2) / scale;
    const up = (view.h / 2 - (e.clientY - r.top)) / scale;
    let y = up / K_DEPTH;
    for (let k = 0; k < 6; k++) y = (up - heightOf(vAt(cs, x, y)) * lift * K_HEIGHT) / K_DEPTH;
    return [x, y];
  };
  const dragging = useRef(false);
  const onPointerDown = (e: PointerEvent) => {
    const view = viewRef.current;
    const canvas = canvasRef.current;
    if (!view || !canvas) return;
    const r = canvas.getBoundingClientRect();
    const [sx, sy] = project(view.w, view.h).at(s.probe[0], s.probe[1], heightOf(vAt(cs, s.probe[0], s.probe[1])));
    if (Math.hypot(e.clientX - r.left - sx, e.clientY - r.top - sy) > 26) return;
    dragging.current = true;
    canvas.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const q = toMap(e);
    if (q) p.onProbe(q, false);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const q = toMap(e);
    if (q) p.onProbe(q, true);
  };

  return (
    <SimShell {...p.shell} canvasRef={canvasRef} cursor="grab" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
  );
}
