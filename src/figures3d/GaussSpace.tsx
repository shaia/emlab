/**
 * The Gauss figure in space (lesson 1.7): a point charge, a closed surface (sphere or cube) and
 * the rays of the field flowing through it. The course's first 3D figure.
 *
 * 3D (three.js, ink shader) is used only when WebGL exists and motion is allowed. Otherwise, and
 * until the three.js chunk has loaded, the same scene is drawn as a 2D cross-section. The
 * library is imported dynamically, so no other page pays for it. The readout and controls are
 * identical in both views and come from src/physics, never from the drawing.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fluxThroughCube, fluxThroughSphere, gaussFlux } from '~/physics/electrostatics';
import { rayCrossings, type SurfaceShape } from '~/physics/gauss';
import { fibonacciSphere } from '~/physics/electrostatics';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { readPalette, toScreen, useFigureCanvas, type FrameInfo } from '~/sims/core/canvas';
import { chargeDisc, chevron, paperGrid, polyline, withAlpha } from '~/sims/core/ink';
import { sci } from '~/sims/core/format';
import SimShell, { Slider, type TaskDef } from '~/sims/core/SimShell';
import { webglAvailable } from './webgl';

const uC = 1e-6;
const Q_MAG = 2 * uC;
const N_RAYS = 72;
const N_PLANAR = 24;
const WORLD_W = 3.2;
const WORLD_H = 2.4;
const CHARGE_PX = 11;

type SceneModule = typeof import('./gaussScene');

const SHAPE_LABEL: Record<SurfaceShape, string> = { sphere: 'כדור', cube: 'קובייה' };

const TASK_LABEL: Record<string, string> = {
  resize: 'הגדילו את המשטח כשהמטען בתוכו, וחזרו וקטינו אותו. מה קרה למספר הקווים שחוצים אותו ולשטף?',
  'cross-surface': 'הזיזו את המטען מחוץ למשטח אל תוכו ובחזרה. מתי הקרניים והשטף משתנים?',
  'cube-same': 'כשהמטען בתוך המשטח, עברו בין כדור לקובייה. מה קרה לשטף?',
  'negative-inside': 'הפכו את המטען לשלילי כשהוא בתוך המשטח. מה קרה לכיוון הזרימה ולסימן של השטף?',
};

export interface GaussSpaceProps {
  id: string;
  shape?: SurfaceShape;
  /** charge position along the x axis [cm] */
  x?: number;
  /** radius of the sphere (half the side of the cube) [cm] */
  radius?: number;
  tasks?: string[];
}

interface State {
  shape: SurfaceShape;
  /** cm */
  x: number;
  sign: 1 | -1;
  /** cm */
  radius: number;
  /** the readout names the law only from the step that names it */
  showLaw: boolean;
}

const dirs3 = fibonacciSphere(N_RAYS);
/** the 2D cross-section draws its own lines in the plane: the ones of the 3D set that lie in it are too few */
const dirsPlanar: [number, number, number][] = Array.from({ length: N_PLANAR }, (_, i) => {
  const a = (2 * Math.PI * (i + 0.5)) / N_PLANAR;
  return [Math.cos(a), Math.sin(a), 0];
});

/** Count what is drawn: 72 lines in 3D, 24 in the cross-section. */
function analyse(s: State, view3d: boolean) {
  const origin: [number, number, number] = [s.x / 100, 0, 0];
  const R = s.radius / 100;
  let out = 0;
  let inn = 0;
  for (const d of view3d ? dirs3 : dirsPlanar) {
    const c = rayCrossings(s.shape, [0, 0, 0], R, origin, d);
    out += c.out;
    inn += c.in;
  }
  const inside = Math.abs(origin[0]) < R;
  // field lines of a negative charge run inward: what the rays do geometrically, the field does reversed
  return s.sign > 0 ? { out, in: inn, inside } : { out: inn, in: out, inside };
}

function numericFlux(s: State): number {
  const R = s.radius / 100;
  const q = [{ pos: [s.x / 100, 0, 0] as [number, number, number], q: s.sign * Q_MAG }];
  return s.shape === 'sphere' ? fluxThroughSphere(q, [0, 0, 0], R, 6000) : fluxThroughCube(q, [0, 0, 0], R * 2, 50);
}

const signed = (sign: number) => `${sign > 0 ? '+' : '−'}2 μC`;

export default function GaussSpace(props: GaussSpaceProps) {
  const initialState = (): State => ({ shape: props.shape ?? 'sphere', x: props.x ?? 120, sign: 1, radius: props.radius ?? 55, showLaw: false });
  const [s, setS] = useState<State>(initialState);
  // a state change that came from a text step must not tick a task: only the student's own controls do
  const fromStep = useRef(false);
  const [live, setLive] = useState('');
  const [want3d, setWant3d] = useState(false);
  const [mod, setMod] = useState<SceneModule | null>(null);
  const [failed, setFailed] = useState(false);
  const seen = useRef({ inside: false, outside: false, sphereInside: null as number | null, radii: [] as number[] });
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
    import('./gaussScene').then(setMod).catch(() => setFailed(true));
  }, [want3d, mod, failed]);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        fromStep.current = true;
        setS((prev) => {
          const next = { ...prev };
          if (st.shape === 'sphere' || st.shape === 'cube') next.shape = st.shape;
          if (typeof st.x === 'number') next.x = st.x;
          if (st.sign === 1 || st.sign === -1) next.sign = st.sign;
          if (typeof st.radius === 'number') next.radius = st.radius;
          if (typeof st.showLaw === 'boolean') next.showLaw = st.showLaw;
          return next;
        });
      }),
    [props.id],
  );

  const view3d = want3d && !!mod && !failed;
  const info = useMemo(() => analyse(s, view3d), [s.shape, s.x, s.sign, s.radius, view3d]);
  const flux = useMemo(() => numericFlux(s), [s.shape, s.x, s.sign, s.radius]);
  const expected = info.inside ? gaussFlux(s.sign * Q_MAG) : 0;
  // a numeric sum is never exactly zero: show what it means to the reader
  const shownFlux = Math.abs(flux) < 0.005 * gaussFlux(Q_MAG) ? 0 : flux;

  useEffect(() => {
    if (fromStep.current) {
      fromStep.current = false;
      return;
    }
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (info.inside) {
      if (!seen.current.radii.includes(s.radius)) seen.current.radii.push(s.radius);
      if (has('resize') && Math.max(...seen.current.radii) >= 2 * Math.min(...seen.current.radii)) done('resize');
    }
    if (info.inside) seen.current.inside = true;
    else seen.current.outside = true;
    if (has('cross-surface') && seen.current.inside && seen.current.outside) done('cross-surface');
    if (info.inside && s.shape === 'sphere' && s.sign > 0) seen.current.sphereInside = shownFlux;
    if (has('cube-same') && info.inside && s.shape === 'cube' && s.sign > 0 && seen.current.sphereInside !== null) done('cube-same');
    if (has('negative-inside') && info.inside && s.sign < 0) done('negative-inside');
  }, [s, info.inside, props.id, props.tasks, shownFlux]);

  const describe = (st: State) => {
    const a = analyse(st, view3d);
    const place = a.inside ? `בתוך ה${SHAPE_LABEL[st.shape]}` : `מחוץ ל${SHAPE_LABEL[st.shape]}`;
    return `המטען ${signed(st.sign)} ב-${st.x} ס"מ מהמרכז, ${place}. ${a.out} קווי שדה יוצאים ו-${a.in} נכנסים.`;
  };

  const shell = {
    fig: props.id,
    label: `איור חי: מטען נקודתי, משטח סגור ${SHAPE_LABEL[s.shape]} וקווי השדה. ${describe(s)} השטף ${sci(shownFlux)} ניוטון מטר בריבוע לקולון.`,
    aspect: WORLD_W / WORLD_H,
    live,
    tasks,
    onReset: () => {
      setS(initialState());
      setLive('האיור אופס.');
    },
    readout: (
      <>
        <span>
          מיקום המטען: <b class="q">{info.inside ? 'בתוך המשטח' : 'מחוץ למשטח'}</b>
        </span>
        <span>
          קווי שדה: <b class="q">יוצאים {info.out}</b> · <b class="q">נכנסים {info.in}</b>
        </span>
        <span>
          שטף דרך המשטח: <b class="q">Φ = {sci(shownFlux)} N·m²/C</b>
        </span>
        {s.showLaw && info.inside && (
          <span>
            לפי חוק גאוס: <b class="q">q/ε₀ = {sci(expected)} N·m²/C</b>
          </span>
        )}
      </>
    ),
    controls: (
      <>
        <div class="group" role="group" aria-label="צורת המשטח">
          {(Object.keys(SHAPE_LABEL) as SurfaceShape[]).map((k) => (
            <button type="button" key={k} class={`toggle ${s.shape === k ? 'on' : ''}`} aria-pressed={s.shape === k} onClick={() => setS({ ...s, shape: k })}>
              {SHAPE_LABEL[k]}
            </button>
          ))}
          <span class="sep" />
          {([1, -1] as const).map((k) => (
            <button type="button" key={k} class={`toggle ${s.sign === k ? 'on' : ''}`} aria-pressed={s.sign === k} onClick={() => setS({ ...s, sign: k })}>
              מטען {signed(k)}
            </button>
          ))}
        </div>
        <Slider
          label="גודל המשטח"
          value={s.radius}
          min={35}
          max={105}
          step={10}
          format={(v) => `${v} cm`}
          onChange={(v) => {
            setS({ ...s, radius: v });
            setLive(describe({ ...s, radius: v }));
          }}
        />
        <Slider
          label="מיקום המטען"
          value={s.x}
          min={-140}
          max={140}
          step={10}
          format={(v) => `${v} cm`}
          onChange={(v) => {
            setS({ ...s, x: v });
            setLive(describe({ ...s, x: v }));
          }}
        />
      </>
    ),
  };

  return want3d && mod && !failed ? (
    <Canvas3D mod={mod} s={s} shell={shell} onFail={() => setFailed(true)} />
  ) : (
    <Canvas2D s={s} shell={shell} />
  );
}

type ShellProps = Omit<Parameters<typeof SimShell>[0], 'canvasRef'>;

/* ------------------------------- the 3D view ------------------------------- */

function Canvas3D(p: { mod: SceneModule; s: State; shell: ShellProps; onFail: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<ReturnType<SceneModule['createGaussScene']> | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.dataset.view = '3d';
    const colors = () => {
      const pal = readPalette(canvas);
      return { paper: pal.paper, ink: pal.ink, accent: pal.accent, pos: pal.pos, neg: pal.neg, efield: pal.efield };
    };
    let scene: ReturnType<SceneModule['createGaussScene']>;
    try {
      scene = p.mod.createGaussScene(canvas, colors(), { shape: p.s.shape, x: p.s.x / 100, sign: p.s.sign, radius: p.s.radius / 100 });
    } catch {
      p.onFail();
      return;
    }
    sceneRef.current = scene;
    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(canvas);
    const io = new IntersectionObserver((es) => scene.setVisible(es.some((e) => e.isIntersecting)));
    io.observe(canvas);
    const theme = () => scene.setColors(colors());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', theme);
    window.addEventListener('emlab:settings', theme);
    return () => {
      ro.disconnect();
      io.disconnect();
      mq.removeEventListener('change', theme);
      window.removeEventListener('emlab:settings', theme);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setState({ shape: p.s.shape, x: p.s.x / 100, sign: p.s.sign, radius: p.s.radius / 100 });
  }, [p.s.shape, p.s.x, p.s.sign, p.s.radius]);

  const onKeyDown = (e: KeyboardEvent) => {
    const step = 0.12;
    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = m[e.key];
    if (!d) return;
    e.preventDefault();
    sceneRef.current?.nudge(d[0], d[1]);
  };

  return <SimShell {...p.shell} canvasRef={ref} onKeyDown={onKeyDown} cursor="grab" label={`${p.shell.label} גררו כדי לסובב את המבט; במקלדת: חיצים.`} />;
}

/* --------------------- the 2D cross-section (fallback and loading) --------------------- */

function Canvas2D(p: { s: State; shell: ShellProps }) {
  const { s } = p;
  const draw = ({ ctx, view, palette: pal, t }: FrameInfo) => {
    paperGrid(ctx, view, pal);
    const cx = s.x / 100;
    // the surface seen in the plane z = 0
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = pal.accent;
    ctx.fillStyle = withAlpha(pal.accent, 0.09);
    ctx.beginPath();
    if (s.shape === 'sphere') {
      const [x, y] = toScreen(view, 0, 0);
      ctx.arc(x, y, (s.radius / 100) * view.ppm, 0, Math.PI * 2);
    } else {
      const R = s.radius / 100;
      const [x0, y0] = toScreen(view, -R, R);
      ctx.rect(x0, y0, 2 * R * view.ppm, 2 * R * view.ppm);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // rays in the plane; which ones cross is decided in 3D, as in the 3D view
    const phase = (t * 24) % 60;
    for (let i = 0; i < N_PLANAR; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / N_PLANAR;
      const d: [number, number, number] = [Math.cos(a), Math.sin(a), 0];
      const c = rayCrossings(s.shape, [0, 0, 0], s.radius / 100, [cx, 0, 0], d);
      const crossing = c.out + c.in > 0;
      const len = 1.9;
      const a0 = toScreen(view, cx, 0);
      const a1 = toScreen(view, cx + d[0] * len, d[1] * len);
      polyline(ctx, [a0, a1], pal.efield, crossing ? 2.4 : 1.1, { alpha: crossing ? 1 : 0.4, glow: crossing ? pal.efieldGlow : undefined });
      const L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      const ux = (a1[0] - a0[0]) / L;
      const uy = (a1[1] - a0[1]) / L;
      for (let k = 35 + phase; k < L; k += 60) {
        const f = s.sign > 0 ? k : L - k;
        chevron(ctx, a0[0] + ux * f, a0[1] + uy * f, s.sign * ux, s.sign * uy, 4.5, pal.efield);
      }
    }
    const [qx, qy] = toScreen(view, cx, 0);
    chargeDisc(ctx, qx, qy, CHARGE_PX, s.sign, pal);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: true });
  useEffect(invalidate, [s]);
  useEffect(() => {
    if (canvasRef.current) canvasRef.current.dataset.view = '2d';
  }, []);
  return <SimShell {...p.shell} canvasRef={canvasRef} />;
}
