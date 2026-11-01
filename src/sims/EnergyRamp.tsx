/**
 * Energy ramp: a charged particle trades potential energy for kinetic energy. Built for
 * lesson 2.4.
 *
 * Gap mode: two parallel plates, the left one at V_L and the right one at 0 V, a distance d
 * apart. The particle leaves the left plate with kinetic energy K₀ (in eV) and either reaches
 * the right plate or stops and turns back (gapTransit, src/physics/potential.ts). Bars show
 * K, U = qV and their sum, which never changes.
 *
 * Nucleus mode: a particle fired straight at a fixed nucleus, drawn as a potential-energy
 * diagram: the curve U(r) = kqQ/r, the level of the total energy (the kinetic energy far
 * away), and the turning point where they meet, r_min = kqQ/K (closestApproach). The particle
 * moves along a time table built from energy conservation, so it slows near the turn.
 *
 * Motion is display time, not physical time (the real transit takes nanoseconds); in still
 * mode the figure shows the end of the motion at once.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { E_CHARGE, M_ELECTRON, M_PROTON } from '~/physics/constants';
import { closestApproach, fromEV, gapPosition, gapTransit, pairEnergy, toEV, type GapTransit } from '~/physics/potential';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, chargeDisc, paperGrid, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const WORLD_W = 2;
const WORLD_H = 1.2;
/** display seconds for one transit */
const SHOW_T = 2.4;
const GOLD_Z = 79;
/** the diagram's r axis: 0 … 30·10⁻¹⁴ m; energy axis 0 … 12 MeV */
const R_MAX = 30e-14;
const MEV = 1e6;
const U_MAX_MEV = 12;

export type RampMode = 'gap' | 'nucleus';
export type Particle = 'electron' | 'proton' | 'alpha';

const PARTICLES: Record<Particle, { q: number; m: number; label: string; name: string }> = {
  electron: { q: -E_CHARGE, m: M_ELECTRON, label: 'אלקטרון', name: 'e⁻' },
  proton: { q: E_CHARGE, m: M_PROTON, label: 'פרוטון', name: 'p⁺' },
  // an alpha particle: two protons and two neutrons, charge 2e, mass about 4 proton masses
  alpha: { q: 2 * E_CHARGE, m: 4 * M_PROTON, label: 'חלקיק אלפא', name: 'α' },
};

const TASK_LABEL: Record<string, string> = {
  launch: 'בחרו חלקיק ומתח, ולחצו "שגרו". קראו את המהירות שבה החלקיק מגיע ללוח הימני.',
  'four-v': 'שגרו את אותו חלקיק ממנוחה פעמיים: פעם במתח מסוים, ופעם במתח גדול פי 4. פי כמה גדלה המהירות?',
  'gap-same': 'שגרו את אותו חלקיק באותו מתח פעמיים, עם מרחק שונה בין הלוחות. מה קרה למהירות בסוף?',
  stop: 'מצאו מתח ואנרגיה התחלתית שבהם החלקיק לא מגיע ללוח הימני, אלא נעצר וחוזר.',
  closest: 'שגרו חלקיק אלפא לעבר גרעין הזהב, וקראו את מרחק הגישה הקרוב ביותר.',
  'double-k': 'שגרו פעמיים: פעם באנרגיה מסוימת ופעם באנרגיה כפולה. מה קרה למרחק הגישה הקרוב ביותר?',
};

export interface EnergyRampProps {
  id: string;
  mode?: RampMode;
  particle?: Particle;
  /** left plate potential [V] (right plate is 0 V) */
  vLeft?: number;
  /** initial kinetic energy [eV in gap mode, MeV in nucleus mode] */
  k0?: number;
  /** gap [m] */
  gap?: number;
  tasks?: string[];
}

interface Launch {
  particle: Particle;
  vLeft: number;
  k0: number;
  gap: number;
  reaches: boolean;
  vEnd: number;
  rMin: number;
}

interface State {
  particle: Particle;
  vLeft: number;
  k0: number;
  gap: number;
  /** a launch is running or has finished; null before the first one */
  launched: boolean;
  log: Launch[];
}

/** Time table r(τ) for the nucleus approach, τ ∈ [0, 1] of the inbound half, from dt = dr/v(r). */
function approachTable(q: number, m: number, kFar: number, rMin: number): { tau: number[]; r: number[] } {
  const n = 400;
  const r: number[] = [];
  const t: number[] = [0];
  // points crowd toward the turn: r = rMin + (R_MAX − rMin)(1 − s)², s ∈ [0, 1]
  for (let i = 0; i <= n; i++) r.push(rMin + (R_MAX - rMin) * (1 - i / n) ** 2);
  for (let i = 1; i <= n; i++) {
    const mid = (r[i - 1] + r[i]) / 2;
    const kHere = Math.max(kFar - pairEnergy(q, GOLD_Z * E_CHARGE, mid), 1e-6 * kFar);
    const v = Math.sqrt((2 * kHere) / m);
    t.push(t[i - 1] + (r[i - 1] - r[i]) / v);
  }
  const T = t[n];
  return { tau: t.map((x) => x / T), r };
}

export default function EnergyRamp(props: EnergyRampProps) {
  const mode = props.mode ?? 'gap';
  const init = (): State => ({
    particle: props.particle ?? (mode === 'nucleus' ? 'alpha' : 'electron'),
    vLeft: props.vLeft ?? (mode === 'nucleus' ? 0 : -1000),
    k0: props.k0 ?? (mode === 'nucleus' ? 5 : 0),
    gap: props.gap ?? 0.6,
    launched: false,
    log: [],
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const tNow = useRef(0);
  const tLaunch = useRef(0);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.particle === 'string' && st.particle in PARTICLES) next.particle = st.particle as Particle;
          if (typeof st.vLeft === 'number') next.vLeft = st.vLeft;
          if (typeof st.k0 === 'number') next.k0 = st.k0;
          if (typeof st.gap === 'number') next.gap = st.gap;
          if (next.particle !== prev.particle || next.vLeft !== prev.vLeft || next.k0 !== prev.k0 || next.gap !== prev.gap) next.launched = false;
          return next;
        });
      }),
    [props.id],
  );

  const P = PARTICLES[s.particle];
  // gap mode: the outcome of this setting
  const v0 = Math.sqrt((2 * fromEV(s.k0)) / P.m);
  const transit: GapTransit = gapTransit(P.q, P.m, s.vLeft, 0, s.gap, v0);
  // nucleus mode: the energy far away and the turning point
  const kFar = fromEV(s.k0 * MEV);
  const vFar = Math.sqrt((2 * kFar) / P.m);
  const rMin = closestApproach(P.q, GOLD_Z * E_CHARGE, P.m, vFar);
  const table = useMemo(() => (mode === 'nucleus' ? approachTable(P.q, P.m, kFar, rMin) : null), [mode, s.particle, s.k0]);

  const launch = () => {
    tLaunch.current = tNow.current;
    const entry: Launch = { particle: s.particle, vLeft: s.vLeft, k0: s.k0, gap: s.gap, reaches: transit.reaches, vEnd: transit.vEnd, rMin };
    const log = [...s.log, entry].slice(-6);
    setS({ ...s, launched: true, log });
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    if (mode === 'gap') {
      if (has('launch') && transit.reaches) done('launch');
      if (has('stop') && !transit.reaches && s.k0 > 0) done('stop');
      const fromRest = log.filter((l) => l.k0 === 0 && l.reaches && l.particle === s.particle);
      if (has('four-v') && fromRest.some((a) => fromRest.some((b) => Math.abs(b.vLeft) === 4 * Math.abs(a.vLeft) && a.vLeft !== 0))) done('four-v');
      const same = log.filter((l) => l.particle === s.particle && l.vLeft === s.vLeft && l.k0 === s.k0 && l.reaches);
      if (has('gap-same') && new Set(same.map((l) => l.gap)).size >= 2) done('gap-same');
      setLive(
        transit.reaches
          ? `${P.label} הגיע ללוח הימני במהירות ${sci(transit.vEnd)} מטר לשנייה.`
          : `${P.label} נעצר אחרי ${Math.round(transit.xTurn * 100)} סנטימטר וחזר ללוח השמאלי.`,
      );
    } else {
      if (has('closest')) done('closest');
      if (has('double-k') && log.some((a) => log.some((b) => b.particle === a.particle && b.k0 === 2 * a.k0))) done('double-k');
      setLive(`מרחק הגישה הקרוב ביותר: ${sci(rMin)} מטר.`);
    }
  };

  // where the particle is now, as a fraction of its trip (1 = finished or still mode)
  const progressNow = (t: number) => {
    if (!s.launched) return 0;
    if (!motionAllowed()) return 1;
    return Math.min(1, (t - tLaunch.current) / SHOW_T);
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    tNow.current = t;
    paperGrid(ctx, view, p);
    const f = progressNow(t);
    const S = (x: number, y: number) => toScreen(view, x, y);
    ctx.save();
    ctx.font = `600 12px ${p.fontUi}`;

    if (mode === 'gap') {
      const cx = -0.35;
      const xL = cx - s.gap / 2;
      const xR = cx + s.gap / 2;
      // plates: sign by potential, with glyphs
      for (const [x, V] of [
        [xL, s.vLeft],
        [xR, 0],
      ] as const) {
        const other = x === xL ? 0 : s.vLeft;
        const sign = V > other ? 1 : V < other ? -1 : 0;
        const [sx, sy0] = S(x, 0.42);
        const [, sy1] = S(x, -0.42);
        ctx.fillStyle = withAlpha(sign > 0 ? p.pos : sign < 0 ? p.neg : p.ink3, 0.4);
        ctx.fillRect(sx - 4, sy0, 8, sy1 - sy0);
        ctx.fillStyle = p.ink;
        ctx.font = `700 14px ${p.fontUi}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (sign !== 0) {
          for (let y = 0.3; y > -0.4; y -= 0.2) {
            const [, gy] = S(x, y);
            ctx.fillText(sign > 0 ? '+' : '−', sx + (x === xL ? -13 : 13), gy);
          }
        }
        ctx.font = `600 12px ${p.fontUi}`;
        ctx.fillText(`${V} V`, sx, sy0 - 12);
      }
      // the field between them
      if (s.vLeft !== 0) {
        const dir = Math.sign(s.vLeft);
        for (const y of [0.3, -0.3]) {
          const [a] = S(cx - 0.12 * dir, y);
          const [b, sy] = S(cx + 0.12 * dir, y);
          arrow(ctx, a, sy, b, sy, { color: withAlpha(p.efield, 0.7), width: 2, head: 8 });
        }
      }
      // the particle
      let x = 0;
      if (s.launched) {
        const tau = f * transit.time;
        x = transit.reaches || transit.time === 0 ? gapPosition(transit, v0, tau) : gapPosition(transit, v0, tau);
        x = Math.max(0, Math.min(s.gap, x));
      }
      const [px, py] = S(xL + x, 0);
      chargeDisc(ctx, px, py, 9, P.q, p, { label: P.name });

      // energy bars in eV: K, U = qV (V = 0 at the right plate) and their sum
      const qe = P.q / E_CHARGE;
      const Vx = s.vLeft * (1 - x / s.gap);
      const U = qe * Vx;
      const total = s.k0 + qe * s.vLeft;
      const Kx = total - U;
      // the largest energy anywhere on this run fills half a metre of bar
      const eMax = Math.max(1, Math.abs(total), Math.abs(qe * s.vLeft), s.k0, Math.abs(s.k0 + qe * s.vLeft));
      const scale = 0.4 / eMax;
      // low enough that a full bar stays clear of the tool buttons in the corner
      const [, y0] = S(0, -0.15);
      const bars: [string, number, string][] = [
        ['K', Kx, p.accent],
        ['U', U, p.equip],
        ['K+U', total, p.ink2],
      ];
      ctx.strokeStyle = p.ink3;
      ctx.lineWidth = 1;
      const [bx0] = S(0.28, 0);
      const [bx1] = S(0.95, 0);
      ctx.beginPath();
      ctx.moveTo(bx0, y0);
      ctx.lineTo(bx1, y0);
      ctx.stroke();
      bars.forEach(([name, val, color], i) => {
        const [bx] = S(0.36 + i * 0.22, 0);
        const h = val * scale * view.ppm;
        const w = 0.12 * view.ppm;
        ctx.fillStyle = withAlpha(color, name === 'K+U' ? 0.15 : 0.75);
        ctx.strokeStyle = color;
        ctx.lineWidth = name === 'K+U' ? 2 : 1;
        ctx.fillRect(bx - w / 2, y0 - Math.max(h, 0), w, Math.abs(h));
        ctx.strokeRect(bx - w / 2, y0 - Math.max(h, 0), w, Math.abs(h));
        ctx.fillStyle = p.ink;
        ctx.textAlign = 'center';
        ctx.direction = 'ltr';
        // labels sit on the side of the zero line away from the bar
        if (h >= 0) {
          ctx.textBaseline = 'top';
          ctx.fillText(name, bx, y0 + 6);
          ctx.fillText(`${Math.round(val)}`, bx, y0 + 22);
        } else {
          ctx.textBaseline = 'bottom';
          ctx.fillText(`${Math.round(val)}`, bx, y0 - 6);
          ctx.fillText(name, bx, y0 - 22);
        }
      });
      // the unit, once, beside the row
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.ink2;
      ctx.fillText('eV', S(0.9, 0)[0], y0 + 28);
    } else {
      // the diagram: r to the right, energy up
      const [gx0, gy0] = S(-0.85, -0.5);
      const [gx1, gy1] = S(0.92, 0.3);
      const rx = (r: number) => gx0 + (r / R_MAX) * (gx1 - gx0);
      const ey = (mev: number) => gy0 - (Math.min(mev, U_MAX_MEV) / U_MAX_MEV) * (gy0 - gy1);
      ctx.strokeStyle = p.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gx0, gy1);
      ctx.lineTo(gx0, gy0);
      ctx.lineTo(gx1, gy0);
      ctx.stroke();
      ctx.fillStyle = p.ink2;
      ctx.font = `11px ${p.fontUi}`;
      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let r = 0; r <= 30; r += 10) ctx.fillText(`${r}`, rx(r * 1e-14), gy0 + 4);
      ctx.fillText('r (10⁻¹⁴ m)', (gx0 + gx1) / 2, gy0 + 18);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const e of [0, 4, 8, 12]) ctx.fillText(`${e}`, gx0 - 4, ey(e));
      ctx.save();
      ctx.translate(gx0 - 26, (gy0 + gy1) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('MeV', 0, 0);
      ctx.restore();
      // U(r)
      const Q = GOLD_Z * E_CHARGE;
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      let pen = false;
      for (let i = 1; i <= 300; i++) {
        const r = (R_MAX * i) / 300;
        const u = toEV(pairEnergy(P.q, Q, r)) / MEV;
        if (u > U_MAX_MEV) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(rx(r), ey(u));
        else ctx.moveTo(rx(r), ey(u));
        pen = true;
      }
      ctx.stroke();
      // total energy level and the turning point
      ctx.strokeStyle = p.accent;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx0, ey(s.k0));
      ctx.lineTo(gx1, ey(s.k0));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = withAlpha(p.ink2, 0.6);
      ctx.beginPath();
      ctx.moveTo(rx(rMin), ey(s.k0));
      ctx.lineTo(rx(rMin), gy0);
      ctx.stroke();
      ctx.fillStyle = p.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = `600 12px ${p.fontUi}`;
      ctx.fillText('r_min', rx(rMin) + 4, gy0 - 4);
      ctx.fillText('U(r)', rx(4e-14), ey(Math.min(U_MAX_MEV - 1, toEV(pairEnergy(P.q, Q, 4e-14)) / MEV)) - 4);

      // the nucleus and the particle on the strip above the diagram
      const [, sy] = S(0, 0.45);
      chargeDisc(ctx, gx0, sy, 11, 1, p, { label: 'Au' });
      let r = R_MAX;
      if (s.launched && table) {
        // in then out: f ∈ [0, ½] inbound, [½, 1] outbound, mirrored in time
        const tau = f <= 0.5 ? f * 2 : 2 - f * 2;
        let i = 1;
        while (i < table.tau.length - 1 && table.tau[i] < tau) i++;
        const a = (tau - table.tau[i - 1]) / (table.tau[i] - table.tau[i - 1] || 1);
        r = table.r[i - 1] + (table.r[i] - table.r[i - 1]) * a;
      }
      chargeDisc(ctx, rx(r), sy, 8, P.q, p, { label: P.name });
      // where the particle is on the diagram: K is the gap between the dashed line and the curve
      const uHere = toEV(pairEnergy(P.q, Q, r)) / MEV;
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.arc(rx(r), ey(uHere), 4.5, 0, Math.PI * 2);
      ctx.fill();
      if (s.k0 - uHere > 0.05) {
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(rx(r), ey(uHere));
        ctx.lineTo(rx(r), ey(s.k0));
        ctx.stroke();
        ctx.fillStyle = p.accent;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('K', rx(r) + 6, (ey(uHere) + ey(s.k0)) / 2);
      }
    }
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: true });
  useEffect(invalidate, [s]);

  const E = s.vLeft / s.gap;
  const last = s.log[s.log.length - 1];

  return (
    <SimShell
      fig={props.id}
      label={
        mode === 'gap'
          ? `איור חי: ${P.label} בין שני לוחות. הלוח השמאלי ב-${s.vLeft} וולט והימני ב-0 וולט, ${Math.round(s.gap * 100)} סנטימטר זה מזה. ${transit.reaches ? `מהירות בהגעה: ${sci(transit.vEnd)} מטר לשנייה.` : 'החלקיק לא מגיע ללוח הימני.'}`
          : `איור חי: ${P.label} נורה לעבר גרעין זהב באנרגיה ${s.k0} מגה-אלקטרון-וולט. מרחק הגישה הקרוב ביותר ${sci(rMin)} מטר.`
      }
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        mode === 'gap' ? (
          <>
            <span>
              השדה בין הלוחות: <b class="q">E = {sci(Math.abs(E))} V/m{E !== 0 ? (E > 0 ? ', ימינה' : ', שמאלה') : ''}</b>
            </span>
            {/* the outcome shows only after a launch: the learner predicts, then presses */}
            {!s.launched ? (
              <span>
                התוצאה: <b class="q">לחצו "שגרו"</b>
              </span>
            ) : (
              <>
                <span>
                  {transit.reaches ? (
                    <>
                      מהירות בהגעה ללוח הימני: <b class="q">v = {sci(transit.vEnd)} m/s</b>
                    </>
                  ) : (
                    <>
                      לא מגיע: <b class="q">נעצר אחרי {Math.round(transit.xTurn * 100)} cm וחוזר</b>
                    </>
                  )}
                </span>
                <span>
                  אנרגיה קינטית בלוח הימני: <b class="q">{transit.reaches ? `${Math.round(s.k0 + (P.q / E_CHARGE) * s.vLeft)} eV` : '—'}</b>
                </span>
              </>
            )}
            {last && s.log.length > 1 && (
              <span>
                שיגורים:{' '}
                <b class="q">
                  {s.log
                    .map((l) => `${PARTICLES[l.particle].name}, ${l.vLeft} V, ${Math.round(l.gap * 100)} cm${l.k0 ? `, K₀ = ${l.k0} eV` : ''} → ${l.reaches ? `${sci(l.vEnd)} m/s` : 'נעצר'}`)
                    .join(' · ')}
                </b>
              </span>
            )}
          </>
        ) : (
          <>
            <span>
              מרחק הגישה הקרוב ביותר: <b class="q">{s.launched ? `r_min = ${sci(rMin)} m` : 'לחצו "שגרו"'}</b>
            </span>
            {s.log.length > 1 && (
              <span>
                שיגורים: <b class="q">{s.log.map((l) => `${l.k0} MeV → ${sci(l.rMin)} m`).join(' · ')}</b>
              </span>
            )}
          </>
        )
      }
      controls={
        <>
          {mode === 'gap' && (
            <div class="group" role="group" aria-label="החלקיק">
              {(Object.keys(PARTICLES) as Particle[]).map((k) => (
                <button
                  type="button"
                  key={k}
                  class={`toggle ${s.particle === k ? 'on' : ''}`}
                  aria-pressed={s.particle === k}
                  onClick={() => setS({ ...s, particle: k, launched: false })}
                >
                  {PARTICLES[k].label}
                </button>
              ))}
            </div>
          )}
          {mode === 'gap' && (
            <>
              <Slider label="הפוטנציאל של הלוח השמאלי" value={s.vLeft} min={-3000} max={3000} step={250} format={(v) => `${v} V`} onChange={(v) => setS({ ...s, vLeft: v, launched: false })} />
              <Slider label="אנרגיה קינטית התחלתית K₀" value={s.k0} min={0} max={3000} step={250} format={(v) => `${v} eV`} onChange={(v) => setS({ ...s, k0: v, launched: false })} />
              <Slider label="המרחק בין הלוחות d" value={s.gap} min={0.2} max={0.8} step={0.1} format={(v) => `${Math.round(v * 100)} cm`} onChange={(v) => setS({ ...s, gap: v, launched: false })} />
            </>
          )}
          {mode === 'nucleus' && (
            <Slider label="האנרגיה הקינטית של האלפא הרחק מהגרעין" value={s.k0} min={2} max={10} step={1} format={(v) => `${v} MeV`} onChange={(v) => setS({ ...s, k0: v, launched: false })} />
          )}
          <button type="button" class="btn primary" onClick={launch}>
            שגרו
          </button>
        </>
      }
    />
  );
}
