/**
 * Gauss surface: a closed surface the learner reshapes and moves, point charges they move
 * in and out, and a live readout of what passes through the surface. Built for lesson 1.7.
 *
 * Model: the plane shows a slice of 3D point charges. Each field line stands for a fixed
 * amount of charge (LINE_UC), so counting lines that leave and enter the surface is counting
 * flux. The readout also gives the enclosed charge and Φ = q/ε₀ (src/physics/gauss.ts).
 * The count is exact when all charges are single or come in a symmetric pair; with several
 * unequal charges the finite number of lines can be one off, which is why the readout labels
 * the line counts as counts, not as the flux itself.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { fieldLines, type PointCharge } from '~/physics/electrostatics';
import { enclosedCharge, lineCrossings, pointInPolygon, polygonArea, polygonFlux } from '~/physics/gauss';
import type { Vec2 } from '~/physics/vec';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { chargeDisc, chevron, paperGrid, polyline, withAlpha } from './core/ink';
import { sciN as sci } from './gaussFormat';
import SimShell, { type TaskDef } from './core/SimShell';

const uC = 1e-6;
const LINE_UC = 0.25 * uC;
const WORLD_W = 2;
const WORLD_H = 1.5;
const CHARGE_PX = 15;
const HANDLE_PX = 7;
const CORE_R = 0.06;
const N_VERTS = 12;
const MAX_CHARGES = 5;

export type Scene = 'single' | 'outside' | 'dipole' | 'three';
export type Shape = 'circle' | 'square' | 'bean';

const SCENES: Record<Scene, { charges: PointCharge[]; shape: Shape; cx: number; cy: number; size: number }> = {
  single: { charges: [{ x: -0.1, y: 0.05, q: 2 * uC }], shape: 'circle', cx: 0, cy: 0, size: 0.42 },
  outside: { charges: [{ x: 0.75, y: 0.1, q: 2 * uC }], shape: 'circle', cx: -0.3, cy: 0, size: 0.38 },
  dipole: {
    charges: [
      { x: -0.2, y: 0, q: 2 * uC },
      { x: 0.2, y: 0, q: -2 * uC },
    ],
    shape: 'circle',
    cx: 0,
    cy: 0,
    size: 0.5,
  },
  three: {
    charges: [
      { x: -0.45, y: 0.1, q: 2 * uC },
      { x: 0.1, y: -0.15, q: -1 * uC },
      { x: 0.65, y: 0.25, q: 1 * uC },
    ],
    shape: 'circle',
    cx: -0.15,
    cy: 0,
    size: 0.45,
  },
};

const SCENE_LABEL: Record<Scene, string> = {
  single: 'מטען אחד',
  outside: 'מטען מחוץ',
  dipole: 'שני מטענים מנוגדים',
  three: 'שלושה מטענים',
};

const SHAPE_LABEL: Record<Shape, string> = { circle: 'עיגול', square: 'ריבוע', bean: 'צורה חופשית' };

const TASK_LABEL: Record<string, string> = {
  'cross-in': 'גררו מטען מבחוץ אל תוך המשטח (או החוצה). מתי השטף משתנה?',
  reshape: 'שנו את צורת המשטח או את גודלו, בלי לגעת במטענים. מה קרה לשטף?',
  'zero-flux': 'הכניסו למשטח מטענים כך שהשטף יהיה אפס, גם שיש בתוכו מטענים.',
};

export function shapePolygon(shape: Shape, cx: number, cy: number, size: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < N_VERTS; i++) {
    const a = (2 * Math.PI * i) / N_VERTS;
    let r = size;
    if (shape === 'square') {
      const c = Math.cos(a);
      const s = Math.sin(a);
      r = size / Math.max(Math.abs(c), Math.abs(s));
    } else if (shape === 'bean') {
      r = size * (1 + 0.28 * Math.cos(2 * a - 0.6) - 0.18 * Math.sin(a));
    }
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

interface State {
  charges: PointCharge[];
  poly: Vec2[];
  scene: Scene;
  shape: Shape;
  showLines: boolean;
  selected: { kind: 'charge' | 'vertex'; i: number } | null;
}

export interface GaussSurfaceProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  scene?: Scene;
  shape?: Shape;
  showLines?: boolean;
  tasks?: string[];
}

function initial(p: { scene?: Scene; shape?: Shape; showLines?: boolean }): State {
  const scene = p.scene ?? 'single';
  const sc = SCENES[scene];
  const shape = p.shape ?? sc.shape;
  return {
    charges: sc.charges.map((c) => ({ ...c })),
    poly: shapePolygon(shape, sc.cx, sc.cy, sc.size),
    scene,
    shape,
    showLines: p.showLines ?? true,
    selected: null,
  };
}

const sameCharges = (a: PointCharge[], b: PointCharge[]) =>
  a.length === b.length && a.every((c, i) => c.x === b[i].x && c.y === b[i].y && c.q === b[i].q);

const signedMicro = (q: number) => {
  const v = Math.round((q / uC) * 100) / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} μC`;
};

export default function GaussSurface(props: GaussSurfaceProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const start = useRef<State>(initial(props));
  const drag = useRef<{ kind: 'charge' | 'vertex' | 'body'; i: number; dx: number; dy: number; last?: [number, number] } | null>(null);
  const [live, setLive] = useState('');
  const prevEnc = useRef<number | null>(null);
  const prevCharges = useRef<PointCharge[] | null>(null);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          let next = { ...prev };
          const sceneChanged = typeof st.scene === 'string' && st.scene in SCENES && st.scene !== prev.scene;
          if (sceneChanged) next = { ...initial({ scene: st.scene as Scene, showLines: prev.showLines }), selected: null };
          if (typeof st.shape === 'string' && st.shape in SHAPE_LABEL) {
            const sc = SCENES[next.scene];
            next.shape = st.shape as Shape;
            next.poly = shapePolygon(next.shape, sc.cx, sc.cy, sc.size);
          }
          if (typeof st.showLines === 'boolean') next.showLines = st.showLines;
          return next;
        });
      }),
    [props.id],
  );

  const enc = enclosedCharge(s.charges, s.poly);
  const flux = polygonFlux(s.charges, s.poly);
  const area = Math.abs(polygonArea(s.poly));
  const startArea = Math.abs(polygonArea(start.current.poly));

  // task detection
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const insideCount = s.charges.filter((c) => pointInPolygon(s.poly, c.x, c.y)).length;
    const prev = prevEnc.current;
    // a charge that only moved (same count, same values) and changed what the surface encloses
    const pc = prevCharges.current;
    const onlyMoved = pc !== null && pc.length === s.charges.length && pc.every((c, i) => c.q === s.charges[i].q);
    if (has('cross-in') && prev !== null && onlyMoved && Math.abs(enc - prev) > 1e-9 && pc.some((c, i) => c.x !== s.charges[i].x || c.y !== s.charges[i].y)) done('cross-in');
    prevEnc.current = enc;
    prevCharges.current = s.charges;
    if (has('reshape') && sameCharges(s.charges, start.current.charges) && Math.abs(enc - enclosedCharge(start.current.charges, start.current.poly)) < 1e-9) {
      if (Math.abs(area - startArea) > 0.3 * startArea) done('reshape');
    }
    if (has('zero-flux') && insideCount >= 2 && Math.abs(enc) < 1e-9) done('zero-flux');
  }, [s, props.id, props.tasks]);

  // the lines do not depend on the screen size, so the readout and the drawing always agree
  const fieldLinesNow = useMemo(() => {
    if (s.charges.length === 0) return [];
    const traced = fieldLines(s.charges, {
      bounds: { xmin: -WORLD_W / 2, xmax: WORLD_W / 2, ymin: -WORLD_H / 2, ymax: WORLD_H / 2 },
      coreRadius: CORE_R,
      maxStep: 0.02,
      chargePerLine: LINE_UC,
      minLines: 1,
    });
    return traced.map((l) => {
      const [sx, sy] = l.points[0];
      const c = s.charges.find((k) => k.x === sx && k.y === sy);
      return { ...l, reversed: !!c && c.q < 0 };
    });
  }, [s.charges]);
  const crossings = useMemo(() => (s.showLines ? lineCrossings(fieldLinesNow, s.poly) : []), [fieldLinesNow, s.poly, s.showLines]);

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    paperGrid(ctx, view, p);

    const lines = s.showLines ? fieldLinesNow : [];
    if (s.showLines) {
      const phase = (t * 28) % 70;
      for (const l of lines) {
        const pts = l.points.map(([x, y]) => toScreen(view, x, y));
        polyline(ctx, pts, p.efield, 1.4, { alpha: 0.7 });
        let acc = 0;
        let next = 35 + phase;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i][0] - pts[i - 1][0];
          const dy = pts[i][1] - pts[i - 1][1];
          const seg = Math.hypot(dx, dy);
          const sgn = l.reversed ? -1 : 1;
          while (seg > 0 && acc + seg >= next) {
            const f = (next - acc) / seg;
            chevron(ctx, pts[i - 1][0] + dx * f, pts[i - 1][1] + dy * f, (sgn * dx) / seg, (sgn * dy) / seg, 4.5, p.efield);
            next += 70;
          }
          acc += seg;
        }
      }
    }

    // the closed surface
    const sp = s.poly.map(([x, y]) => toScreen(view, x, y));
    ctx.save();
    ctx.beginPath();
    sp.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = withAlpha(p.accent, 0.09);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = p.accent;
    ctx.stroke();
    ctx.restore();

    if (s.showLines) {
      for (const c of crossings) {
        const [x, y] = toScreen(view, c.x, c.y);
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.ink;
        ctx.beginPath();
        if (c.outward) {
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = p.efield;
        } else {
          ctx.rect(x - 4.5, y - 4.5, 9, 9);
          ctx.fillStyle = p.paper;
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // reshape handles
    sp.forEach(([x, y], i) => {
      const sel = s.selected?.kind === 'vertex' && s.selected.i === i;
      ctx.save();
      ctx.fillStyle = sel ? p.accent : p.paper;
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, HANDLE_PX * (sel ? 1.2 : 0.8), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    s.charges.forEach((c, i) => {
      const [x, y] = toScreen(view, c.x, c.y);
      chargeDisc(ctx, x, y, CHARGE_PX, c.q, p, {
        selected: s.selected?.kind === 'charge' && s.selected.i === i,
        label: signedMicro(c.q),
      });
    });
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    animate: s.showLines,
  });
  useEffect(invalidate, [s]);

  const clampWorld = (x: number, y: number): [number, number] => [
    Math.max(-WORLD_W / 2 + 0.05, Math.min(WORLD_W / 2 - 0.05, x)),
    Math.max(-WORLD_H / 2 + 0.05, Math.min(WORLD_H / 2 - 0.05, y)),
  ];

  const hit = (v: View, sx: number, sy: number) => {
    for (let i = s.charges.length - 1; i >= 0; i--) {
      const [cx, cy] = toScreen(v, s.charges[i].x, s.charges[i].y);
      if (Math.hypot(sx - cx, sy - cy) < CHARGE_PX + 8) return { kind: 'charge' as const, i };
    }
    for (let i = 0; i < s.poly.length; i++) {
      const [cx, cy] = toScreen(v, s.poly[i][0], s.poly[i][1]);
      if (Math.hypot(sx - cx, sy - cy) < HANDLE_PX + 8) return { kind: 'vertex' as const, i };
    }
    const [wx, wy] = toWorld(v, sx, sy);
    if (pointInPolygon(s.poly, wx, wy)) return { kind: 'body' as const, i: 0 };
    return null;
  };

  const describe = (st: State) => {
    const q = enclosedCharge(st.charges, st.poly);
    return `המטען בתוך המשטח ${signedMicro(q)}. השטף ${sci(polygonFlux(st.charges, st.poly))} ניוטון מטר בריבוע לקולון.`;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h && h.kind !== 'body' ? { kind: h.kind, i: h.i } : null }));
    if (!h) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    if (h.kind === 'body') drag.current = { kind: 'body', i: 0, dx: 0, dy: 0, last: [wx, wy] };
    else {
      const at: Vec2 = h.kind === 'charge' ? [s.charges[h.i].x, s.charges[h.i].y] : s.poly[h.i];
      drag.current = { kind: h.kind, i: h.i, dx: at[0] - wx, dy: at[1] - wy };
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    if (d.kind === 'body') {
      const [lx, ly] = d.last ?? [wx, wy];
      d.last = [wx, wy];
      setS((prev) => ({ ...prev, poly: prev.poly.map(([x, y]) => clampWorld(x + wx - lx, y + wy - ly)) }));
      return;
    }
    const [x, y] = clampWorld(wx + d.dx, wy + d.dy);
    setS((prev) =>
      d.kind === 'charge'
        ? { ...prev, charges: prev.charges.map((c, i) => (i === d.i ? { ...c, x, y } : c)) }
        : { ...prev, poly: prev.poly.map((pt, i) => (i === d.i ? ([x, y] as Vec2) : pt)) },
    );
  };

  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const order: { kind: 'charge' | 'vertex'; i: number }[] = [
      ...s.charges.map((_, i) => ({ kind: 'charge' as const, i })),
      ...s.poly.map((_, i) => ({ kind: 'vertex' as const, i })),
    ];
    const cur = s.selected ? order.findIndex((o) => o.kind === s.selected!.kind && o.i === s.selected!.i) : -1;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const next = order[(cur + 1) % order.length];
      setS((prev) => ({ ...prev, selected: next }));
      setLive(next.kind === 'charge' ? `נבחר מטען ${signedMicro(s.charges[next.i].q)}.` : `נבחרה נקודת אחיזה ${next.i + 1} במשטח.`);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? order[0];
    const step = e.shiftKey ? 0.1 : 0.02;
    setS((prev) => {
      const next: State =
        sel.kind === 'charge'
          ? {
              ...prev,
              selected: sel,
              charges: prev.charges.map((c, i) => {
                if (i !== sel.i) return c;
                const [x, y] = clampWorld(c.x + d[0] * step, c.y + d[1] * step);
                return { ...c, x, y };
              }),
            }
          : {
              ...prev,
              selected: sel,
              poly: prev.poly.map((pt, i) => (i === sel.i ? clampWorld(pt[0] + d[0] * step, pt[1] + d[1] * step) : pt)),
            };
      setLive(describe(next));
      return next;
    });
  };

  const setShape = (shape: Shape) => {
    const sc = SCENES[s.scene];
    setS({ ...s, shape, poly: shapePolygon(shape, sc.cx, sc.cy, sc.size), selected: null });
  };
  const setScene = (scene: Scene) => setS({ ...initial({ scene, showLines: s.showLines }), shape: s.shape, poly: shapePolygon(s.shape, SCENES[scene].cx, SCENES[scene].cy, SCENES[scene].size) });
  const addCharge = (q: number) => {
    if (s.charges.length >= MAX_CHARGES) return;
    // new charges appear in a free corner so they never sit on the surface by accident
    const spots: [number, number][] = [[0.8, 0.5], [-0.8, 0.5], [0.8, -0.5], [-0.8, -0.5], [0, 0.6]];
    const used = s.charges.map((c) => `${c.x},${c.y}`);
    const spot = spots.find((p) => !used.includes(`${p[0]},${p[1]}`)) ?? spots[0];
    setS({ ...s, charges: [...s.charges, { x: spot[0], y: spot[1], q }], selected: { kind: 'charge', i: s.charges.length } });
    setLive(`נוסף מטען ${signedMicro(q)}.`);
  };
  const removeSelected = () => {
    if (s.selected?.kind !== 'charge') return;
    const i = s.selected.i;
    setS({ ...s, charges: s.charges.filter((_, k) => k !== i), selected: null });
    setLive('המטען הוסר.');
  };
  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const nOut = crossings.filter((c) => c.outward).length;
  const nIn = crossings.length - nOut;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: משטח סגור ו-${s.charges.length} מטענים. ${describe(s)} גררו מטענים ונקודות אחיזה בעכבר או במגע; במקלדת: רווח בוחר, חיצים מזיזים.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={
        <>
          <span>
            מטען בתוך המשטח: <b class="q">{signedMicro(enc)}</b>
          </span>
          {s.showLines && (
            <span>
              קווים: <b class="q">יוצאים {nOut}</b> · <b class="q">נכנסים {nIn}</b>
            </span>
          )}
          <span>
            שטף: <b class="q">Φ = q/ε₀ = {sci(flux)} N·m²/C</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="צורת המשטח">
            {(Object.keys(SHAPE_LABEL) as Shape[]).map((k) => (
              <button type="button" key={k} class={`toggle ${s.shape === k ? 'on' : ''}`} aria-pressed={s.shape === k} onClick={() => setShape(k)}>
                {SHAPE_LABEL[k]}
              </button>
            ))}
          </div>
          <div class="group" role="group" aria-label="סידור המטענים">
            {(Object.keys(SCENE_LABEL) as Scene[]).map((k) => (
              <button type="button" key={k} class={`toggle ${s.scene === k ? 'on' : ''}`} aria-pressed={s.scene === k} onClick={() => setScene(k)}>
                {SCENE_LABEL[k]}
              </button>
            ))}
          </div>
          <div class="group" role="group" aria-label="מטענים">
            <button type="button" class="toggle" disabled={s.charges.length >= MAX_CHARGES} onClick={() => addCharge(1 * uC)}>
              הוסיפו +1 μC
            </button>
            <button type="button" class="toggle" disabled={s.charges.length >= MAX_CHARGES} onClick={() => addCharge(-1 * uC)}>
              הוסיפו −1 μC
            </button>
            <button type="button" class="toggle" disabled={s.selected?.kind !== 'charge'} onClick={removeSelected}>
              הסירו את הנבחר
            </button>
            <button type="button" class={`toggle ${s.showLines ? 'on' : ''}`} aria-pressed={s.showLines} onClick={() => setS({ ...s, showLines: !s.showLines })}>
              קווי שדה
            </button>
          </div>
        </>
      }
    />
  );
}
