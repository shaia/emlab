/**
 * Superposition explorer: three point charges, A, B and C. For the chosen charge it draws the
 * force from each of the other two, then their vector sum, tip to tail, and the x and y
 * components of that sum. Built for lesson 1.4.
 *
 * The arrow scale is set from the longest arrow on the stage (it always draws at the same
 * length) and a scale bar says how many newtons a bar stands for. Numbers in the readout come
 * from src/physics/coulomb.ts, the same functions the tests check.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { forcesOnCharge, netForceOnCharge } from '~/physics/coulomb';
import type { PointCharge } from '~/physics/electrostatics';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, toWorld, useFigureCanvas, type FrameInfo, type View } from './core/canvas';
import { arrow, chargeDisc, paperGrid, scaleBar } from './core/ink';
import { directionHe, sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

const uC = 1e-6;
const WORLD_W = 2;
const WORLD_H = 1.5;
const CHARGE_PX = 15;
const NAMES = ['A', 'B', 'C'];
/** charge steps in μC; zero is excluded so that every charge exerts a force */
const Q_STEPS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];

export type Preset = 'line' | 'right' | 'general';

const PRESETS: Record<Preset, { charges: PointCharge[]; target: number }> = {
  // all on one line: the forces on B point along that line, so they add or subtract as numbers
  line: {
    charges: [
      { x: -0.55, y: 0, q: 3 * uC },
      { x: 0, y: 0, q: 1 * uC },
      { x: 0.55, y: 0, q: 1 * uC },
    ],
    target: 1,
  },
  // 3-4-5 triangle with the right angle at A: each force lies along an axis
  right: {
    charges: [
      { x: -0.4, y: -0.1, q: 2 * uC },
      { x: -0.4, y: 0.5, q: 3 * uC },
      { x: 0.4, y: -0.1, q: -4 * uC },
    ],
    target: 0,
  },
  // no special angle: the components must be found
  general: {
    charges: [
      { x: -0.3, y: 0, q: 2 * uC },
      { x: 0.1, y: 0.5, q: 3 * uC },
      { x: 0.6, y: -0.1, q: 3 * uC },
    ],
    target: 0,
  },
};

const PRESET_LABEL: Record<Preset, string> = {
  line: 'על קו אחד',
  right: 'משולש ישר-זווית',
  general: 'משולש כללי',
};

const TASK_LABEL: Record<string, string> = {
  cancel: 'גררו את B לנקודה שבה שני החצים שווים ומנוגדים, והכוח השקול מתאפס. באיזה צד של האמצע היא?',
  'tip-to-tail': 'ודאו ש"חיבור ראש-לזנב" פעיל, וראו איך החץ השני מתחיל בראש החץ הראשון.',
  components: 'הפעילו את "רכיבים x ו-y" וקראו את Fx ואת Fy בשורה שמתחת לאיור.',
  'move-charge': 'גררו את A או את C למקום אחר, וראו איזה כוח משתנה ואיזה לא.',
};

interface State {
  charges: PointCharge[];
  target: number;
  showSum: boolean;
  showParts: boolean;
  selected: number | null;
  preset: Preset;
  /** the force [N] drawn at the reference arrow length; fixed until a preset, target or "fit" change */
  refF: number;
}

/** The longest of the separate forces and their sum: the scale that fits the whole picture. */
function fitScale(charges: readonly PointCharge[], target: number): number {
  const m = (f: readonly [number, number]) => Math.hypot(f[0], f[1]);
  const biggest = Math.max(...forcesOnCharge(charges, target).map(m), m(netForceOnCharge(charges, target)));
  return biggest > 0 ? biggest : 1;
}

export interface SuperpositionExplorerProps {
  id: string;
  preset?: Preset;
  showSum?: boolean;
  showParts?: boolean;
  /** show the buttons that switch between the presets */
  editable?: boolean;
  /** hide the target buttons, the tip-to-tail and component toggles, and the F_x, F_y readout */
  simple?: boolean;
  tasks?: string[];
}

function initial(p: SuperpositionExplorerProps): State {
  const preset = p.preset ?? 'right';
  return {
    charges: PRESETS[preset].charges.map((c) => ({ ...c })),
    target: PRESETS[preset].target,
    showSum: p.showSum ?? false,
    showParts: p.showParts ?? false,
    selected: null,
    preset,
    refF: fitScale(PRESETS[preset].charges, PRESETS[preset].target),
  };
}

/** 3 significant figures, with exact decimals (0.1125) rounded the way a student rounds them. */
const r3 = (x: number) => sci(x + x * 1e-10, 3);

const qText = (q: number) => `${q > 0 ? '+' : '−'}${Math.abs(Math.round((q / uC) * 10) / 10)} μC`;

/** 1, 2 or 5 times a power of ten that is at most v. */
function niceFloor(v: number): number {
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [5, 2, 1]) if (m * mag <= v) return m * mag;
  return mag;
}

/** `base` with a small subscript, drawn left-to-right. */
function subLabel(ctx: CanvasRenderingContext2D, base: string, sub: string, x: number, y: number, color: string, font: string) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = `italic 700 15px ${font}`;
  const wb = ctx.measureText(base).width;
  const ws = (() => {
    ctx.font = `italic 700 11px ${font}`;
    return ctx.measureText(sub).width;
  })();
  const x0 = x - (wb + ws) / 2;
  ctx.font = `italic 700 15px ${font}`;
  ctx.fillText(base, x0, y);
  ctx.font = `italic 700 11px ${font}`;
  ctx.fillText(sub, x0 + wb + 1, y + 4);
  ctx.restore();
}

export default function SuperpositionExplorer(props: SuperpositionExplorerProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const start = useRef<State>(initial(props));
  const drag = useRef<{ what: number; dx: number; dy: number } | null>(null);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          // a step with a preset puts the charges back where that preset has them
          if (typeof st.preset === 'string' && st.preset in PRESETS) {
            const pr = st.preset as Preset;
            next.preset = pr;
            next.charges = PRESETS[pr].charges.map((c) => ({ ...c }));
            next.target = PRESETS[pr].target;
            next.selected = null;
            next.refF = fitScale(next.charges, next.target);
          }
          if (typeof st.target === 'number' && st.target >= 0 && st.target < 3) {
            next.target = st.target;
            next.refF = fitScale(next.charges, next.target);
          }
          if (typeof st.showSum === 'boolean') next.showSum = st.showSum;
          if (typeof st.showParts === 'boolean') next.showParts = st.showParts;
          return next;
        });
      }),
    [props.id],
  );

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const forces = forcesOnCharge(s.charges, s.target);
    const net = netForceOnCharge(s.charges, s.target);
    const biggest = Math.max(...forces.map((f) => Math.hypot(f[0], f[1])));
    if (has('cancel') && biggest > 0 && Math.hypot(net[0], net[1]) < 0.1 * biggest && s.target === 1) done('cancel');
    if (has('tip-to-tail') && s.showSum) done('tip-to-tail');
    if (has('components') && s.showParts) done('components');
    if (has('move-charge')) {
      const st = start.current;
      if (s.charges.some((c, i) => i !== s.target && Math.hypot(c.x - st.charges[i].x, c.y - st.charges[i].y) > 0.15)) done('move-charge');
    }
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    paperGrid(ctx, view, p);
    const t = s.target;
    const others = [0, 1, 2].filter((i) => i !== t);
    const forces = forcesOnCharge(s.charges, t);
    const net = netForceOnCharge(s.charges, t);
    const mag = (f: readonly [number, number]) => Math.hypot(f[0], f[1]);
    const biggest = Math.max(...forces.map(mag), mag(net));
    const pxPerN = biggest > 0 ? (0.26 * view.w) / s.refF : 0;
    const [ox, oy] = toScreen(view, s.charges[t].x, s.charges[t].y);
    const tip = (f: readonly [number, number], fromx = ox, fromy = oy): [number, number] => [fromx + f[0] * pxPerN, fromy - f[1] * pxPerN];

    // faint copies for the tip-to-tail construction, under everything else
    if (s.showSum && pxPerN > 0) {
      const [t1x, t1y] = tip(forces[0]);
      const [t2x, t2y] = tip(forces[1]);
      arrow(ctx, t1x, t1y, ...tip(forces[1], t1x, t1y), { color: p.force, width: 2.4, head: 10, alpha: 0.5 });
      ctx.save();
      ctx.strokeStyle = p.force;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(t2x, t2y);
      ctx.lineTo(...tip(forces[0], t2x, t2y));
      ctx.stroke();
      ctx.restore();
    }

    // components of the sum, along the axes
    if (s.showParts && pxPerN > 0) {
      const [nx, ny] = tip(net);
      ctx.save();
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(nx, oy);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.restore();
      subLabel(ctx, 'F', 'x', (ox + nx) / 2, oy + (net[1] >= 0 ? 16 : -16), p.ink2, p.fontUi);
      subLabel(ctx, 'F', 'y', nx + (net[0] >= 0 ? 18 : -18), (oy + ny) / 2, p.ink2, p.fontUi);
    }

    // charges
    s.charges.forEach((c, i) => {
      const [x, y] = toScreen(view, c.x, c.y);
      chargeDisc(ctx, x, y, CHARGE_PX, c.q, p, { selected: s.selected === i, focused: i === t, label: `${NAMES[i]} ${qText(c.q)}` });
    });

    // the forces on the chosen charge: one from each of the other two, then their sum
    if (pxPerN > 0) {
      // forces on one line would hide under the sum: draw them on separate rails beside it
      const [f0, f1] = forces;
      const collinear = Math.abs(f0[0] * f1[1] - f0[1] * f1[0]) < 1e-9 * (mag(f0) * mag(f1) || 1);
      others.forEach((j, k) => {
        const f = forces[k];
        const L = mag(f) * pxPerN || 1;
        const ux = (f[0] * pxPerN) / L;
        const uy = (-f[1] * pxPerN) / L;
        const off = collinear ? (k === 0 ? -14 : 14) : 0;
        const sx0 = ox - uy * off;
        const sy0 = oy + ux * off;
        const tx = sx0 + f[0] * pxPerN;
        const ty = sy0 - f[1] * pxPerN;
        if (collinear) {
          ctx.save();
          ctx.strokeStyle = p.ink3;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(sx0, sy0);
          ctx.stroke();
          ctx.restore();
        }
        arrow(ctx, sx0, sy0, tx, ty, { color: p.force, width: 2.8, head: 12, alpha: 0.9 });
        subLabel(ctx, 'F', NAMES[j], tx + ux * 16 - uy * 8 - (collinear ? uy * off * 0.6 : 0), ty + uy * 16 + ux * 8 + (collinear ? ux * off * 0.6 : 0), p.force, p.fontUi);
      });
      if (mag(net) > 1e-12 * biggest) {
        const [nx, ny] = tip(net);
        arrow(ctx, ox, oy, nx, ny, { color: p.force, width: 5.5, head: 17 });
        const L = mag(net) * pxPerN || 1;
        const ux = (nx - ox) / L;
        const uy = (ny - oy) / L;
        ctx.save();
        ctx.font = `italic 800 17px ${p.fontUi}`;
        ctx.fillStyle = p.force;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.direction = 'ltr';
        ctx.fillText('F', nx + ux * 18 + uy * 12, ny + uy * 18 - ux * 12);
        ctx.restore();
      }
    }

    // axes key and the arrow scale
    ctx.save();
    ctx.strokeStyle = p.ink2;
    ctx.fillStyle = p.ink2;
    ctx.lineWidth = 1.4;
    ctx.font = `italic 600 13px ${p.fontUi}`;
    ctx.direction = 'ltr';
    const ax = view.w - 40;
    const ay = view.h - 44;
    ctx.beginPath();
    ctx.moveTo(ax - 22, ay);
    ctx.lineTo(ax + 22, ay);
    ctx.moveTo(ax, ay + 22);
    ctx.lineTo(ax, ay - 22);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('x', ax + 26, ay);
    ctx.textAlign = 'center';
    ctx.fillText('y', ax, ay - 30);
    if (pxPerN > 0) {
      const unit = niceFloor(70 / pxPerN);
      const L = unit * pxPerN;
      const sy = 20;
      ctx.beginPath();
      ctx.moveTo(14, sy - 4);
      ctx.lineTo(14, sy + 4);
      ctx.moveTo(14, sy);
      ctx.lineTo(14 + L, sy);
      ctx.moveTo(14 + L, sy - 4);
      ctx.lineTo(14 + L, sy + 4);
      ctx.stroke();
      ctx.font = `600 12px ${p.fontUi}`;
      ctx.textAlign = 'left';
      ctx.fillText(`= ${sci(unit, 1)} N`, 14 + L + 6, sy);
    }
    ctx.restore();
    scaleBar(ctx, view, p);
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: false });
  useEffect(invalidate, [s]);

  // on the line preset the charges stay on the axis, so every force stays along it
  const clampWorld = (x: number, y: number): [number, number] => [
    Math.max(-WORLD_W / 2 + 0.05, Math.min(WORLD_W / 2 - 0.05, x)),
    s.preset === 'line' ? 0 : Math.max(-WORLD_H / 2 + 0.05, Math.min(WORLD_H / 2 - 0.05, y)),
  ];

  const hit = (v: View, sx: number, sy: number): number | null => {
    for (let i = s.charges.length - 1; i >= 0; i--) {
      const [cx, cy] = toScreen(v, s.charges[i].x, s.charges[i].y);
      if (Math.hypot(sx - cx, sy - cy) < CHARGE_PX + 8) return i;
    }
    return null;
  };

  const forces = forcesOnCharge(s.charges, s.target);
  const net = netForceOnCharge(s.charges, s.target);
  const others = [0, 1, 2].filter((i) => i !== s.target);
  const Fm = Math.hypot(net[0], net[1]);

  const describe = (st: State) => {
    const f = netForceOnCharge(st.charges, st.target);
    const m = Math.hypot(f[0], f[1]);
    return `הכוח השקול על ${NAMES[st.target]}: ${sci(m, 2)} ניוטון${m > 1e-12 ? `, ${directionHe(Math.atan2(f[1], f[0]))}` : ''}.`;
  };

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const h = hit(v, e.offsetX, e.offsetY);
    setS((prev) => ({ ...prev, selected: h }));
    if (h === null) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    drag.current = { what: h, dx: s.charges[h].x - wx, dy: s.charges[h].y - wy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const v = viewRef.current;
    const d = drag.current;
    if (!v || !d) return;
    const [wx, wy] = toWorld(v, e.offsetX, e.offsetY);
    const [x, y] = clampWorld(wx + d.dx, wy + d.dy);
    setS((prev) => ({ ...prev, charges: prev.charges.map((c, i) => (i === d.what ? { ...c, x, y } : c)) }));
  };
  const onPointerUp = () => {
    if (drag.current) setLive(describe(s));
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const next = ((s.selected ?? -1) + 1) % 3;
      setS({ ...s, selected: next });
      setLive(`נבחר מטען ${NAMES[next]}.`);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const sel = s.selected ?? s.target;
    const step = e.shiftKey ? 0.1 : 0.02;
    const next: State = {
      ...s,
      selected: sel,
      charges: s.charges.map((c, i) => {
        if (i !== sel) return c;
        const [x, y] = clampWorld(c.x + d[0] * step, c.y + d[1] * step);
        return { ...c, x, y };
      }),
    };
    setS(next);
    setLive(describe(next));
  };

  const selectedCharge = s.selected !== null ? s.charges[s.selected] : null;
  const dirOf = (f: readonly [number, number]) => directionHe(Math.atan2(f[1], f[0]));

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: שלושה מטענים, ${s.charges.map((c, i) => `${NAMES[i]} ${qText(c.q)}`).join(', ')}. ${describe(s)} גררו מטענים בעכבר או במגע; במקלדת: רווח בוחר, חיצים מזיזים.`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
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
      cursor={drag.current ? 'grabbing' : 'grab'}
      readout={
        <>
          {others.map((j, k) => (
            <span key={j}>
              <b class="q">
                F<sub>{NAMES[j]}</sub> = {r3(Math.hypot(forces[k][0], forces[k][1]))} N
              </b>{' '}
              ({dirOf(forces[k])})
            </span>
          ))}
          {!props.simple && (
            <span>
              <b class="q">
                F<sub>x</sub> = {r3(net[0])} N, F<sub>y</sub> = {r3(net[1])} N
              </b>
            </span>
          )}
          <span>
            הכוח השקול על {NAMES[s.target]}: <b class="q">F = {r3(Fm)} N</b>
            {Fm > 1e-12 ? ` (${dirOf(net)})` : ''}
          </span>
        </>
      }
      controls={
        <>
          {!props.simple && (
            <div class="group" role="group" aria-label="על איזה מטען מחשבים את הכוח">
              <span class="hint">מחשבים את הכוח על:</span>
              {NAMES.map((n, i) => (
                <Toggle key={n} label={n} on={s.target === i} onChange={() => setS({ ...s, target: i, refF: fitScale(s.charges, i) })} />
              ))}
            </div>
          )}
          <div class="group" role="group" aria-label="מה להציג">
            {!props.simple && (
              <>
                <Toggle label="חיבור ראש-לזנב" on={s.showSum} swatch="var(--force)" onChange={(v) => setS({ ...s, showSum: v })} />
                <Toggle label="רכיבים x ו-y" on={s.showParts} onChange={(v) => setS({ ...s, showParts: v })} />
              </>
            )}
            <button
              type="button"
              class="toggle"
              title="קנה המידה של החצים נשאר קבוע כשמזיזים מטענים. הלחצן מתאים אותו לחץ הארוך ביותר."
              onClick={() => setS({ ...s, refF: fitScale(s.charges, s.target) })}
            >
              התאמת קנה המידה
            </button>
          </div>
          {props.editable && (
            <div class="group" role="group" aria-label="סידור מוכן">
              {(Object.keys(PRESETS) as Preset[]).map((k) => (
                <Toggle
                  key={k}
                  label={PRESET_LABEL[k]}
                  on={s.preset === k}
                  onChange={() =>
                    setS({
                      ...s,
                      preset: k,
                      charges: PRESETS[k].charges.map((c) => ({ ...c })),
                      target: PRESETS[k].target,
                      selected: null,
                      refF: fitScale(PRESETS[k].charges, PRESETS[k].target),
                    })
                  }
                />
              ))}
            </div>
          )}
          {selectedCharge && s.selected !== null ? (
            <Slider
              label={`המטען ${NAMES[s.selected]}`}
              min={0}
              max={Q_STEPS.length - 1}
              step={1}
              value={Math.max(0, Q_STEPS.indexOf(Math.round(selectedCharge.q / uC)))}
              format={(i) => qText(Q_STEPS[i] * uC)}
              onChange={(i) =>
                setS({ ...s, charges: s.charges.map((c, k) => (k === s.selected ? { ...c, q: Q_STEPS[i] * uC } : c)) })
              }
            />
          ) : (
            <p class="hint hand">לחצו על מטען כדי לשנות אותו (גודל וסימן). גררו מטען כדי להזיז אותו. קנה המידה של החצים קבוע, עד שלוחצים על "התאמת קנה המידה".</p>
          )}
        </>
      }
    />
  );
}
