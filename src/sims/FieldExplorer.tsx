/**
 * Field explorer: point charges, their field (vector grid and field lines) and a test charge
 * q₀ that shows both the force on it and E = F/q₀. Built for lessons 1.5–1.6.
 *
 * Arrow scales are fixed, not auto-normalised, so "double the charge" visibly doubles an
 * arrow. The probe's E arrow and F arrow share a scale at q₀ = 1 nC: with a larger q₀ the
 * F arrow grows while the E arrow stays put, which is the point of lesson 1.5.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { fieldAt, fieldLines, type PointCharge } from '~/physics/electrostatics';
import { K } from '~/physics/constants';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { arrow, chargeDisc, chevron, paperGrid, polyline, scaleBar, withAlpha } from './core/ink';
import { directionHe, sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const uC = 1e-6;
const nC = 1e-9;
const WORLD_W = 2;
const WORLD_H = 1.5;
const CHARGE_PX = 15;
const PROBE_PX = 9;

export type Preset = 'single' | 'single-neg' | 'like' | 'dipole' | 'unequal';

const PRESETS: Record<Preset, PointCharge[]> = {
  single: [{ x: -0.25, y: 0, q: 2 * uC }],
  'single-neg': [{ x: -0.25, y: 0, q: -2 * uC }],
  like: [
    { x: -0.45, y: 0, q: 2 * uC },
    { x: 0.45, y: 0, q: 2 * uC },
  ],
  dipole: [
    { x: -0.45, y: 0, q: 2 * uC },
    { x: 0.45, y: 0, q: -2 * uC },
  ],
  // like signs: the null point lies between them, at x ≈ 0.17 m, on the stage. With opposite
  // signs it would sit outside the pair, at x = 1.3 m, off the 2 m-wide stage.
  unequal: [
    { x: -0.4, y: 0, q: 4 * uC },
    { x: 0.45, y: 0, q: 1 * uC },
  ],
};

const PRESET_LABEL: Record<Preset, string> = {
  single: 'מטען יחיד',
  'single-neg': 'מטען שלילי',
  like: 'שני מטענים זהים',
  dipole: 'דיפול',
  unequal: 'מטענים שונים',
};

const TASK_LABEL: Record<string, string> = {
  'move-probe': 'גררו את מטען הבוחן למקום אחר. מה קורה לאורך החצים כשמתרחקים ממטען המקור?',
  'change-q0': 'הגדילו את מטען הבוחן פי 2. מה קרה לכוח F? ומה קרה ל-E?',
  'negative-q0': 'הפכו את מטען הבוחן לשלילי. לאן מצביע הכוח עכשיו, ולאן E?',
  'double-Q': 'הגדילו את מטען המקור פי 2 ובדקו מה קורה לשדה בנקודה.',
  'find-null': 'בסידור של שני מטענים חיוביים: מצאו נקודה שבה השדה מתאפס, וגררו לשם את מטען הבוחן.',
  'lines-double': 'לחצו על המטען והגדילו אותו פי 2. כמה קווים נוספו? מה קרה לצפיפות הקווים ליד המטען?',
  'probe-tangent': 'גררו את מטען הבוחן למקומות שונים. באיזה כיוון החץ E ביחס לקווים שליד מטען הבוחן?',
  'flip-sign': 'לחצו על אחד המטענים והפכו את סימנו. לאן הולכים עכשיו הקווים שיוצאים מהמטען החיובי?',
};

/** One field line per this much charge: the rule "the number of lines is proportional to the charge". */
const LINE_Q = uC / 6;

/** q₀ choices in nC; zero is excluded because E = F/q₀ needs a test charge. */
const Q0_STEPS = [-4, -3, -2, -1, 1, 2, 3, 4];

/** px per (N/C) for arrows at the probe: 5·10⁴ N/C draws 60 px. */
const PX_PER_E = 60 / 5e4;
// q₀ = 4 nC at the single-charge start point draws 192 px: the cap must not hide that 4×
const ARROW_CAP = 200;

/** Where the test charge starts: off the axis, far enough out that its arrows fit the stage. */
const PROBE_START: Record<Preset, [number, number]> = {
  single: [0.35, 0.3],
  'single-neg': [0.35, 0.3],
  like: [0, 0.42],
  dipole: [0, 0.42],
  unequal: [0.05, 0.42],
};

interface State {
  charges: PointCharge[];
  probe: [number, number];
  /** test charge [C] */
  q0: number;
  showLines: boolean;
  showVectors: boolean;
  showProbe: boolean;
  showE: boolean;
  selected: number | 'probe' | null;
  preset: Preset;
}

export interface FieldExplorerProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  preset?: Preset;
  showLines?: boolean;
  showVectors?: boolean;
  showProbe?: boolean;
  showE?: boolean;
  /** allow adding/removing charges and switching presets */
  editable?: boolean;
  /** fewest lines drawn from one charge; lesson 1.6 passes 1 so the count stays proportional to the charge */
  minLines?: number;
  /** show under the figure how many lines are drawn for each charge (lesson 1.6) */
  lineCounts?: boolean;
  /** keep the direction chevrons still, so nothing looks like it flows along the lines (lesson 1.6) */
  staticArrows?: boolean;
  /** draw the force arrow on the test charge and its F readout (default true) */
  showForce?: boolean;
  /** show the q₀ slider (default true) */
  showQ0Control?: boolean;
  tasks?: string[];
}

function initial(p: FieldExplorerProps): State {
  const preset = p.preset ?? 'single';
  return {
    charges: PRESETS[preset].map((c) => ({ ...c })),
    probe: PROBE_START[preset],
    q0: 1 * nC,
    showLines: p.showLines ?? false,
    showVectors: p.showVectors ?? true,
    showProbe: p.showProbe ?? true,
    showE: p.showE ?? true,
    selected: null,
    preset,
  };
}

const chargeLabel = (q: number) => {
  const v = Math.round((q / uC) * 10) / 10;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} μC`;
};

const q0Label = (q: number) => `${q > 0 ? '+' : '−'}${Math.abs(Math.round(q / nC))} nC`;

/** Reference field of a charge 30 cm away, to judge "the field is (almost) zero here". */
const refField = (charges: PointCharge[]) => Math.max(0, ...charges.map((c) => (K * Math.abs(c.q)) / 0.09));

export default function FieldExplorer(props: FieldExplorerProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const start = useRef<State>(initial(props));
  const drag = useRef<{ what: number | 'probe'; dx: number; dy: number } | null>(null);
  const linesCache = useRef<{ key: string; lines: [number, number][][] }>({ key: '', lines: [] });
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  // text steps beside the figure set its state
  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.preset === 'string' && st.preset in PRESETS && st.preset !== prev.preset) {
            next.preset = st.preset as Preset;
            next.charges = PRESETS[next.preset].map((c) => ({ ...c }));
            next.probe = PROBE_START[next.preset];
            next.selected = null;
          }
          for (const k of ['showLines', 'showVectors', 'showProbe', 'showE'] as const) {
            if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          }
          if (Array.isArray(st.probe) && st.probe.length === 2) next.probe = [Number(st.probe[0]), Number(st.probe[1])];
          if (typeof st.q0 === 'number') next.q0 = st.q0 * nC;
          return next;
        });
      }),
    [props.id],
  );

  // task detection
  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const st = start.current;
    if (has('move-probe') && Math.hypot(s.probe[0] - st.probe[0], s.probe[1] - st.probe[1]) > 0.2) done('move-probe');
    if (has('change-q0') && Math.abs(s.q0) >= 2 * Math.abs(st.q0) && s.q0 > 0) done('change-q0');
    if (has('negative-q0') && s.q0 < 0) done('negative-q0');
    const sumQ = (cs: PointCharge[]) => cs.reduce((a, c) => a + Math.abs(c.q), 0);
    if (has('double-Q') && sumQ(s.charges) >= 2 * sumQ(st.charges) - 1e-12) done('double-Q');
    // tasks of lesson 1.6 compare with the preset the learner is looking at, so a step that
    // switches presets never ticks them by itself
    const base = PRESETS[s.preset];
    const absSum = (cs: PointCharge[]) => cs.reduce((a, c) => a + Math.abs(c.q), 0);
    if (has('lines-double') && s.showLines && absSum(s.charges) >= 2 * absSum(base) - 1e-12) done('lines-double');
    if (has('flip-sign') && s.charges.length === base.length && s.charges.some((c, i) => Math.sign(c.q) !== Math.sign(base[i].q))) {
      done('flip-sign');
    }
    if (has('probe-tangent') && s.showLines && s.showProbe && Math.hypot(s.probe[0] - st.probe[0], s.probe[1] - st.probe[1]) > 0.2) {
      done('probe-tangent');
    }
    if (has('find-null') && s.charges.length >= 2 && s.showProbe) {
      const [ex, ey] = fieldAt(s.charges, s.probe[0], s.probe[1]);
      if (Math.hypot(ex, ey) < 0.12 * refField(s.charges)) done('find-null');
    }
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    paperGrid(ctx, view, p);
    const xmin = view.ox - view.w / 2 / view.ppm;
    const xmax = view.ox + view.w / 2 / view.ppm;
    const ymin = view.oy - view.h / 2 / view.ppm;
    const ymax = view.oy + view.h / 2 / view.ppm;

    if (s.showLines && s.charges.some((c) => c.q !== 0)) {
      const key = JSON.stringify([s.charges, view.w, view.h, props.minLines]);
      if (linesCache.current.key !== key) {
        const traced = fieldLines(s.charges, {
          bounds: { xmin, xmax, ymin, ymax },
          coreRadius: CHARGE_PX / view.ppm,
          maxStep: 0.02,
          chargePerLine: LINE_Q,
          minLines: props.minLines ?? 6,
        });
        linesCache.current = { key, lines: traced.map((l) => l.points.map(([x, y]) => toScreen(view, x, y))) };
      }
      const phase = props.staticArrows ? 0 : (t * 28) % 70;
      for (const pts of linesCache.current.lines) {
        polyline(ctx, pts, p.efield, 1.6, { glow: p.efieldGlow, alpha: 0.9 });
        // chevrons every 70 px along the line show the direction (and drift when motion is on)
        let acc = 0;
        let next = 35 + phase;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i][0] - pts[i - 1][0];
          const dy = pts[i][1] - pts[i - 1][1];
          const seg = Math.hypot(dx, dy);
          while (seg > 0 && acc + seg >= next) {
            const f = (next - acc) / seg;
            chevron(ctx, pts[i - 1][0] + dx * f, pts[i - 1][1] + dy * f, dx / seg, dy / seg, 5, p.efield);
            next += 70;
          }
          acc += seg;
        }
      }
    }

    if (s.showVectors) drawVectorGrid(ctx, view, s.charges, p.efield);

    s.charges.forEach((c, i) => {
      const [x, y] = toScreen(view, c.x, c.y);
      chargeDisc(ctx, x, y, CHARGE_PX, c.q, p, { selected: s.selected === i, label: chargeLabel(c.q) });
    });

    if (s.showProbe) {
      const [px, py] = toScreen(view, s.probe[0], s.probe[1]);
      const [ex, ey] = fieldAt(s.charges, s.probe[0], s.probe[1]);
      const E = Math.hypot(ex, ey);
      if (E > 0) {
        const ux = ex / E;
        const uy = -ey / E; // screen y grows downward
        const lenE = Math.min(ARROW_CAP, E * PX_PER_E);
        const F = Math.abs(s.q0) * E;
        const lenF = Math.min(ARROW_CAP, (F / nC) * PX_PER_E);
        const sf = Math.sign(s.q0);
        // labels sit beside the arrow tips on opposite sides, so equal-length E and F never collide
        const nx = -uy * 13;
        const ny = ux * 13;
        if (s.showE) {
          arrow(ctx, px, py, px + ux * lenE, py + uy * lenE, { color: p.efield, width: 7, head: 16, alpha: 0.45 });
          label(ctx, 'E', px + ux * (lenE - 6) + nx, py + uy * (lenE - 6) + ny, p.efield, p.fontUi);
        }
        if (props.showForce !== false) {
          arrow(ctx, px, py, px + sf * ux * lenF, py + sf * uy * lenF, { color: p.force, width: 2.6, head: 11 });
          label(ctx, 'F', px + sf * ux * (lenF - 6) - nx, py + sf * uy * (lenF - 6) - ny, p.force, p.fontUi);
        }
      }
      chargeDisc(ctx, px, py, PROBE_PX, s.q0, p, { selected: s.selected === 'probe' });
      // q₀ label sits beside the probe, perpendicular to the field: E and F both run along it
      const [fx, fy] = fieldAt(s.charges, s.probe[0], s.probe[1]);
      const fm = Math.hypot(fx, fy) || 1;
      const lx = px + (fy / fm) * 20;
      const ly = py + (fx / fm) * 20;
      ctx.save();
      ctx.font = `italic 600 13px ${p.fontUi}`;
      ctx.fillStyle = p.ink2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('q₀', lx, ly);
      ctx.restore();
    }
    scaleBar(ctx, view, p);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, {
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    animate: s.showLines && !props.staticArrows,
  });
  useEffect(invalidate, [s]);

  const clampWorld = (x: number, y: number): [number, number] => [
    Math.max(-WORLD_W / 2 + 0.05, Math.min(WORLD_W / 2 - 0.05, x)),
    Math.max(-WORLD_H / 2 + 0.05, Math.min(WORLD_H / 2 - 0.05, y)),
  ];

  const hit = (v: View, sx: number, sy: number): number | 'probe' | null => {
    if (s.showProbe) {
      const [px, py] = toScreen(v, s.probe[0], s.probe[1]);
      if (Math.hypot(sx - px, sy - py) < PROBE_PX + 10) return 'probe';
    }
    for (let i = s.charges.length - 1; i >= 0; i--) {
      const [cx, cy] = toScreen(v, s.charges[i].x, s.charges[i].y);
      if (Math.hypot(sx - cx, sy - cy) < CHARGE_PX + 8) return i;
    }
    return null;
  };

  const describe = (st: State) => {
    if (!st.showProbe) return `${st.charges.length} מטענים באיור.`;
    const [ex, ey] = fieldAt(st.charges, st.probe[0], st.probe[1]);
    const E = Math.hypot(ex, ey);
    return `מטען הבוחן ב-(${Math.round(st.probe[0] * 100)}, ${Math.round(st.probe[1] * 100)}) ס"מ. השדה ${sci(E)} ניוטון לקולון, ${directionHe(Math.atan2(ey, ex))}.`;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (h === null) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const at = h === 'probe' ? s.probe : [s.charges[h].x, s.charges[h].y];
    drag.current = { what: h, dx: at[0] - wx, dy: at[1] - wy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const [x, y] = clampWorld(wx + d.dx, wy + d.dy);
    setS((prev) =>
      d.what === 'probe'
        ? { ...prev, probe: [x, y] }
        : { ...prev, charges: prev.charges.map((c, i) => (i === d.what ? { ...c, x, y } : c)) },
    );
  };

  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const order: (number | 'probe')[] = [...(s.showProbe ? (['probe'] as const) : []), ...s.charges.map((_, i) => i)];
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const i = order.indexOf(s.selected ?? order[order.length - 1]);
      const next = order[(i + 1) % order.length];
      setS((prev) => ({ ...prev, selected: next }));
      setLive(next === 'probe' ? 'נבחר מטען הבוחן.' : `נבחר מטען ${chargeLabel(s.charges[next].q)}.`);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? order[0];
    if (sel === undefined) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    setS((prev) => {
      const next =
        sel === 'probe'
          ? { ...prev, selected: sel, probe: clampWorld(prev.probe[0] + d[0] * step, prev.probe[1] + d[1] * step) }
          : {
              ...prev,
              selected: sel,
              charges: prev.charges.map((c, i) => {
                if (i !== sel) return c;
                const [x, y] = clampWorld(c.x + d[0] * step, c.y + d[1] * step);
                return { ...c, x, y };
              }),
            };
      setLive(describe(next));
      return next;
    });
  };

  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const selectedCharge = typeof s.selected === 'number' ? s.charges[s.selected] : null;
  const [ex, ey] = fieldAt(s.charges, s.probe[0], s.probe[1]);
  const E = Math.hypot(ex, ey);
  const F = Math.abs(s.q0) * E;
  const fDir = Math.atan2(Math.sign(s.q0) * ey, Math.sign(s.q0) * ex);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${s.charges.map((c) => chargeLabel(c.q)).join(', ')}. ${describe(s)} גררו מטענים בעכבר או במגע; במקלדת: רווח בוחר, חיצים מזיזים.`}
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
        s.showProbe || (props.lineCounts && s.showLines) ? (
          <>
            {props.lineCounts && s.showLines && (
              <span>
                קווים לכל מטען:{' '}
                {s.charges.map((c, i) => (
                  <span key={i}>
                    {i > 0 && ' · '}
                    <b class="q" dir="ltr">
                      {chargeLabel(c.q)}: {c.q === 0 ? 0 : Math.max(props.minLines ?? 6, Math.round(Math.abs(c.q) / LINE_Q))}
                    </b>
                  </span>
                ))}
              </span>
            )}
            {s.showProbe && props.showForce !== false && (
            <span>
              כוח על <span class="q">q₀</span>: <b class="q">F = {sci(F)} N</b> ({directionHe(fDir)})
            </span>
            )}
            {s.showProbe && (
            <span>
              שדה: <b class="q">E = {props.showForce === false ? '' : 'F/q₀ = '}{sci(E)} N/C</b> ({directionHe(Math.atan2(ey, ex))})
            </span>
            )}
          </>
        ) : undefined
      }
      controls={
        <>
          <div class="group" role="group" aria-label="מה להציג">
            <Toggle label="וקטורי שדה" on={s.showVectors} swatch="var(--efield)" onChange={(v) => setS({ ...s, showVectors: v })} />
            <Toggle label="קווי שדה" on={s.showLines} swatch="var(--efield)" onChange={(v) => setS({ ...s, showLines: v })} />
            <Toggle label="מטען בוחן" on={s.showProbe} swatch="var(--force)" onChange={(v) => setS({ ...s, showProbe: v })} />
            {s.showProbe && <Toggle label="חץ E" on={s.showE} onChange={(v) => setS({ ...s, showE: v })} />}
          </div>
          {props.editable && (
            <div class="group" role="group" aria-label="סידור מוכן">
              {(Object.keys(PRESETS) as Preset[]).map((k) => (
                <Toggle
                  key={k}
                  label={PRESET_LABEL[k]}
                  on={s.preset === k}
                  onChange={() =>
                    setS({ ...s, preset: k, charges: PRESETS[k].map((c) => ({ ...c })), probe: PROBE_START[k], selected: null })
                  }
                />
              ))}
            </div>
          )}
          {s.showProbe && props.showQ0Control !== false && (
            <Slider
              label="מטען הבוחן q₀"
              min={0}
              max={Q0_STEPS.length - 1}
              step={1}
              value={Math.max(0, Q0_STEPS.indexOf(Math.round(s.q0 / nC)))}
              format={(i) => q0Label(Q0_STEPS[i] * nC)}
              onChange={(i) => setS({ ...s, q0: Q0_STEPS[i] * nC })}
            />
          )}
          {selectedCharge && (
            <Slider
              label="המטען הנבחר"
              min={-5}
              max={5}
              step={0.5}
              value={selectedCharge.q / uC}
              format={(v) => chargeLabel(v * uC)}
              onChange={(v) =>
                setS({ ...s, charges: s.charges.map((c, i) => (i === s.selected ? { ...c, q: v * uC } : c)) })
              }
            />
          )}
          {!selectedCharge && s.charges.length > 0 && (
            <p class="hint hand">לחצו על מטען כדי לשנות את גודלו.</p>
          )}
        </>
      }
    />
  );
}

function drawVectorGrid(ctx: CanvasRenderingContext2D, v: View, charges: PointCharge[], color: string) {
  const spacing = 46;
  const Lmax = spacing * 0.78;
  const lo = Math.log10(1e3);
  const hi = Math.log10(1e6);
  const nx = Math.floor(v.w / spacing);
  const ny = Math.floor(v.h / spacing);
  const offX = (v.w - (nx - 1) * spacing) / 2;
  const offY = (v.h - (ny - 1) * spacing) / 2;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const sx = offX + i * spacing;
      const sy = offY + j * spacing;
      const [x, y] = toWorld(v, sx, sy);
      if (charges.some((c) => Math.hypot(c.x - x, c.y - y) * v.ppm < CHARGE_PX * 1.9)) continue;
      const [ex, ey] = fieldAt(charges, x, y);
      const m = Math.hypot(ex, ey);
      if (m === 0) continue;
      const f = Math.max(0, Math.min(1, (Math.log10(m) - lo) / (hi - lo)));
      if (f < 0.04) continue;
      const L = Lmax * (0.25 + 0.75 * f);
      const ux = ex / m;
      const uy = -ey / m;
      arrow(ctx, sx - (ux * L) / 2, sy - (uy * L) / 2, sx + (ux * L) / 2, sy + (uy * L) / 2, {
        color: withAlpha(color, 0.25 + 0.75 * f),
        width: 1.6,
        head: 6,
      });
    }
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, font: string) {
  ctx.save();
  ctx.font = `italic 700 15px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}
