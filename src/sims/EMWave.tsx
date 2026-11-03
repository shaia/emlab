/**
 * A plane electromagnetic wave (lesson 6.14), drawn in an oblique view: the x axis runs across the page,
 * E arrows stand along y (up the page) and B arrows lie along z, drawn slanting down-left toward the reader.
 * A side view replaces the slanting arrows by ⊙/⊗ glyphs (z out of the page). B is drawn at the scale of
 * cB, so equal arrows mean E = cB. A probe line reads E, B, the energy densities and the Poynting vector at
 * one point, and both sides of Faraday's law and of the Ampère–Maxwell law there. Under the scene, the two
 * energy densities along x, relative to ε₀E₀²/2.
 *
 * A "trial wave" mode lets the reader choose the speed ω/k and a quarter-period lag of B: B₀ = E₀/v always
 * satisfies Faraday's law, and only v = c (no lag) also satisfies Ampère–Maxwell. Every number comes from
 * src/physics/waves.ts (waveAt, curlSides, maxwellResiduals, energy densities, meanPoynting). The wave runs in
 * slow motion: a crest of the true wave crosses one metre of the drawing per real second, whatever the
 * frequency; in still mode nothing moves, and a button steps time by an eighth of a period.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { C_LIGHT, MU0 } from '~/physics/constants';
import { amplitudeB, curlSides, energyDensityB, energyDensityE, maxwellResiduals, meanPoynting, waveAt, wavelength, type PlaneWave } from '~/physics/waves';
import { markTask } from '~/progress/store';
import { motionAllowed } from '~/progress/settings';
import { subscribeSteps } from '~/ui/steps';
import { useMounted } from '~/ui/useMounted';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, depthGlyph, withAlpha } from './core/ink';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const ASPECT = 1.05;
const X_MAX = 6; // metres shown along the axis
const E0_MAX = 40; // V/m at full arrow height
const SLOW = 1 / C_LIGHT; // physical seconds per real second: a true crest moves 1 m of drawing per second
const OK = 1e-3; // residual below which a law "holds at every point"

type View = 'oblique' | 'side';

const TASK_LABEL: Record<string, string> = {
  'in-phase': 'עצרו את הגל, והזיזו את הגשש לנקודה שבה השדה החשמלי הכי חזק. מה השדה המגנטי שם?',
  speed: 'שנו את התדירות פי 2 לפחות. מה קרה לאורך הגל, ומה למהירות שלו?',
  flip: 'הפכו את כיוון השדה המגנטי. לאן הגל נע עכשיו?',
  energy: 'הזיזו את הגשש מנקודה שבה השדה החשמלי הכי חזק לנקודה שבה הוא אפס, וקראו את צפיפויות האנרגיה (מהסעיף על האנרגיה). האם יש נקודה שבה ⁦u_E⁩ שונה מ-⁦u_B⁩?',
  'find-c': 'בגל הניסיוני (מהסעיף על חוק אמפר-מקסוול), בלי פיגור: גררו את המהירות עד ששני החוקים מתקיימים. איזו מהירות זו?',
  lag: 'בגל הניסיוני (מהסעיף על חוק פאראדיי): הוסיפו לשדה המגנטי פיגור של רבע מחזור. מה קורה לחוקים?',
};

export interface EMWaveProps {
  id: string;
  /** frequency [MHz], amplitude of E [V/m], probe position [m] */
  f?: number;
  E0?: number;
  probe?: number;
  view?: View;
  /** trial-wave mode: speed in units of c and a quarter-period lag of B */
  trial?: boolean;
  v?: number;
  lag?: boolean;
  /** +1: the wave travels toward +x */
  dir?: 1 | -1;
  tasks?: string[];
}

interface State {
  f: number;
  E0: number;
  probe: number;
  view: View;
  trial: boolean;
  v: number;
  lag: boolean;
  dir: 1 | -1;
  /** physical time [s] */
  t: number;
  running: boolean;
}

const fmt = (x: number, scale: number) => sci(Math.abs(x) < 1e-9 * scale ? 0 : x);

export default function EMWave(props: EMWaveProps) {
  const init = (): State => ({
    f: props.f ?? 100,
    E0: props.E0 ?? 30,
    probe: props.probe ?? 1.5,
    view: props.view ?? 'oblique',
    trial: props.trial ?? false,
    v: props.v ?? 1,
    lag: props.lag ?? false,
    dir: props.dir ?? 1,
    t: 0,
    running: true,
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const mounted = useMounted();
  const sRef = useRef(s);
  sRef.current = s;
  const lastClock = useRef(0);
  const lastPush = useRef(0);
  const visited = useRef({ crest: false, node: false });
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const has = (t: string) => props.tasks?.includes(t);
  const done = (t: string) => markTask(`${props.id}:${t}`);

  const waveOf = (st: State): PlaneWave => ({
    E0: st.E0,
    f: st.f * 1e6,
    dir: st.dir,
    v: (st.trial ? st.v : 1) * C_LIGHT,
    lag: st.trial && st.lag ? Math.PI / 2 : 0,
  });
  const w = waveOf(s);
  const lam = wavelength(w);
  const B0 = amplitudeB(w);
  const at = waveAt(w, s.probe, s.t);
  const sides = curlSides(w, s.probe, s.t);
  const res = useMemo(() => maxwellResiduals(w, 0), [s.f, s.E0, s.trial, s.v, s.lag, s.dir]);
  const uE = energyDensityE(at.E);
  const uB = energyDensityB(at.B);
  const Sx = (at.E * at.B) / MU0;
  const uScale = energyDensityE(s.E0);
  const dSlope = (2 * Math.PI * s.f * 1e6 * s.E0) / C_LIGHT; // a scale for the derivative readouts

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.f === 'number') next.f = st.f;
          if (typeof st.E0 === 'number') next.E0 = st.E0;
          if (typeof st.probe === 'number') next.probe = st.probe;
          if (st.view === 'oblique' || st.view === 'side') next.view = st.view;
          if (typeof st.trial === 'boolean') next.trial = st.trial;
          if (typeof st.v === 'number') next.v = st.v;
          if (typeof st.lag === 'boolean') next.lag = st.lag;
          // a step that flips B keeps E as it is, like the button: sin(kx + ω(−t)) = sin(kx − ωt)
          if ((st.dir === 1 || st.dir === -1) && st.dir !== prev.dir && typeof st.t !== 'number') next.t = -prev.t;
          if (st.dir === 1 || st.dir === -1) next.dir = st.dir;
          if (typeof st.t === 'number') next.t = st.t * (1 / (next.f * 1e6));
          next.running = st.running !== false;
          return next;
        });
      }),
    [props.id],
  );

  const set = (f: (prev: State) => State) => setS((prev) => f(prev));

  const probeTasks = (st: State) => {
    const e = waveAt(waveOf(st), st.probe, st.t).E / st.E0;
    if (has('in-phase') && Math.abs(e) >= 0.95) done('in-phase');
    if (Math.abs(e) >= 0.9) visited.current.crest = true;
    if (Math.abs(e) <= 0.1) visited.current.node = true;
    if (has('energy') && visited.current.crest && visited.current.node) done('energy');
  };

  const draw = ({ ctx, view, palette: p, t: clock }: FrameInfo) => {
    const st = sRef.current;
    const dt = Math.max(0, Math.min(0.1, clock - lastClock.current));
    lastClock.current = clock;
    if (st.running && motionAllowed() && dt > 0) {
      st.t += dt * SLOW;
      if (clock - lastPush.current > 0.15) {
        lastPush.current = clock;
        const tNow = st.t;
        setS((prev) => ({ ...prev, t: tNow }));
      }
    }
    const wave = waveOf(st);
    const W = view.w;
    const H = view.h;
    const sceneH = H * 0.6;
    const narrow = W < 480;
    drawWave(ctx, p, W, sceneH, st, wave, narrow);

    // the energy densities along x
    const box = insetBox({ x: 0, y: sceneH, w: W, h: H - sceneH }, { l: narrow ? 40 : 50, r: 14, t: 26, b: narrow ? 36 : 40 });
    const u0 = energyDensityE(st.E0);
    const bRatio = (amplitudeB(wave) * C_LIGHT) / st.E0;
    const yMax = Math.max(1, bRatio * bRatio) * 1.12;
    const plot = makePlot(
      box,
      { min: 0, max: X_MAX, label: 'x (מטרים)', ticks: [0, 1, 2, 3, 4, 5, 6] },
      { min: 0, max: yMax, label: narrow ? 'u (יחסי)' : 'u ביחס ל-ε₀E₀²/2', ticks: yMax > 2 ? [0, 1, 2, 3, 4] : [0, 0.5, 1] },
    );
    drawAxes(ctx, plot, p, { grid: true });
    drawCurve(ctx, plot, (x) => energyDensityE(waveAt(wave, x, st.t).E) / u0, { color: p.efield, width: 3, samples: 240 });
    drawCurve(ctx, plot, (x) => energyDensityB(waveAt(wave, x, st.t).B) / u0, { color: p.bfield, width: 2.2, dash: [7, 5], samples: 240 });
    const here = waveAt(wave, st.probe, st.t);
    drawMarker(ctx, plot, st.probe, energyDensityE(here.E) / u0, p.efield, { radius: 5 });
    drawMarker(ctx, plot, st.probe, energyDensityB(here.B) / u0, p.bfield, { radius: 3.5 });
    legend(ctx, p, box.x + box.w - 4, sceneH + 4, narrow, [
      { color: p.efield, dash: [], label: 'u_E = ε₀E²/2' },
      { color: p.bfield, dash: [7, 5], label: 'u_B = B²/(2μ₀)' },
    ]);
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: true });
  useEffect(invalidate, [s]);

  const toggle = (label: string, on: boolean, onClick: () => void) => (
    <button type="button" class={`toggle ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );

  const verdict = (r: number) => (r < OK ? 'מתקיים בכל נקודה' : `לא מתקיים: הפער מגיע ל-${sci(r * 100, 2)}% מהאיבר הגדול`);
  const Smean = meanPoynting(w);
  const goes = (x: number) => (x > 0 ? 'ימינה, בכיוון +x' : x < 0 ? 'שמאלה, בכיוון −x' : 'אפס');

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גל אלקטרומגנטי מישורי בתדירות ${sci(s.f)} מגה-הרץ, אורך גל ${sci(lam)} מטרים, נע ${s.dir > 0 ? 'ימינה' : 'שמאלה'}. השדה החשמלי לאורך y, במשרעת ${sci(s.E0)} וולט למטר; השדה המגנטי לאורך z, במשרעת ${sci(B0 * 1e9)} ננו-טסלה. בגשש, ב-x = ${sci(s.probe)} מטרים: E = ${fmt(at.E, s.E0)} וולט למטר, B = ${fmt(at.B * 1e9, s.E0)} ננו-טסלה. חוק פאראדיי ${res.faraday < OK ? 'מתקיים' : 'לא מתקיים'}, וחוק אמפר-מקסוול ${res.ampere < OK ? 'מתקיים' : 'לא מתקיים'}.`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onReset={() => {
        visited.current = { crest: false, node: false };
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            הגל: <b class="q">f = {sci(s.f)} MHz</b>, <b class="q">λ = {sci(lam)} m</b>, מהירות <b class="q">ω/k = {sci((s.trial ? s.v : 1) * C_LIGHT)} m/s</b>
          </span>
          <span>
            בגשש, <b class="q">x = {sci(s.probe)} m</b>: <b class="q">E = {fmt(at.E, s.E0)} V/m</b>, <b class="q">B = {fmt(at.B * 1e9, s.E0)} nT</b>, <b class="q">cB = {fmt(at.B * C_LIGHT, s.E0)} V/m</b>
          </span>
          <span>
            צפיפות האנרגיה: <b class="q">u_E = {fmt(uE, uScale)} J/m³</b>, <b class="q">u_B = {fmt(uB, uScale)} J/m³</b>; וקטור פוינטינג <b class="q">S = {fmt(Math.abs(Sx), uScale * C_LIGHT)} W/m²</b> {goes(Math.abs(Sx) < 1e-9 * uScale * C_LIGHT ? 0 : Sx)}
          </span>
          <span>
            חוק פאראדיי: <b class="q">∂E/∂x = {fmt(sides.curlE, dSlope)} V/m²</b>, <b class="q">−∂B/∂t = {fmt(sides.minusDBdt, dSlope)} T/s</b>. <b>{verdict(res.faraday)}</b>
          </span>
          <span>
            חוק אמפר-מקסוול: <b class="q">−∂B/∂x = {fmt(sides.curlB, dSlope / C_LIGHT)} T/m</b>, <b class="q">μ₀ε₀∂E/∂t = {fmt(sides.mu0eps0DEdt, dSlope / C_LIGHT)} T/m</b>. <b>{verdict(res.ampere)}</b>
          </span>
          <span>
            העוצמה (S בממוצע על מחזור): <b class="q">⟨S⟩ = {fmt(Math.abs(Smean), uScale * C_LIGHT)} W/m²</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="הזמן">
            {mounted &&
              motionAllowed() &&
              toggle(s.running ? 'עצירה' : 'הפעלה', !s.running, () => set((prev) => ({ ...prev, running: !prev.running })))}
            <button
              type="button"
              class="toggle"
              onClick={() =>
                set((prev) => {
                  const next = { ...prev, running: false, t: prev.t + 1 / (8 * prev.f * 1e6) };
                  setLive('הזמן התקדם בשמינית מחזור.');
                  return next;
                })
              }
            >
              צעד של שמינית מחזור
            </button>
          </div>
          <div class="group" role="group" aria-label="המבט">
            {toggle('מבט אלכסוני', s.view === 'oblique', () => set((prev) => ({ ...prev, view: 'oblique' })))}
            {toggle('מבט מהצד (B כ-⊙/⊗)', s.view === 'side', () => set((prev) => ({ ...prev, view: 'side' })))}
          </div>
          <div class="group" role="group" aria-label="כיוון השדה המגנטי">
            <button
              type="button"
              class="toggle"
              onClick={() => {
                set((prev) => ({ ...prev, dir: prev.dir === 1 ? -1 : 1, t: -prev.t }));
                if (has('flip')) done('flip');
                setLive('כיוון השדה המגנטי התהפך, והגל נע עכשיו לכיוון ההפוך.');
              }}
            >
              הפכו את כיוון B
            </button>
          </div>
          <div class="group" role="group" aria-label="איזה גל">
            {toggle('הגל האמיתי', !s.trial, () => set((prev) => ({ ...prev, trial: false })))}
            {toggle('גל ניסיוני', s.trial, () => set((prev) => ({ ...prev, trial: true })))}
          </div>
          {s.trial && (
            <div class="group" role="group" aria-label="הפיגור">
              {toggle('B בפיגור של רבע מחזור', s.lag, () => {
                set((prev) => ({ ...prev, lag: !prev.lag }));
                if (!s.lag && has('lag')) done('lag');
              })}
            </div>
          )}
          {s.trial && (
            <Slider
              label="מהירות הגל הניסיוני (ביחידות של c)"
              value={s.v}
              min={0.5}
              max={1.5}
              step={0.01}
              format={(v) => `${sci(v)}c`}
              onChange={(v) => {
                set((prev) => ({ ...prev, v }));
                if (has('find-c') && Math.abs(v - 1) < 0.005 && !s.lag) done('find-c');
              }}
            />
          )}
          <Slider
            label="התדירות"
            value={s.f}
            min={50}
            max={300}
            step={5}
            format={(v) => `${sci(v)} MHz`}
            onChange={(v) => {
              const f0 = props.f ?? 100;
              set((prev) => ({ ...prev, f: v, t: (prev.t * prev.f) / v }));
              if (has('speed') && (v >= 2 * f0 || v <= f0 / 2)) done('speed');
            }}
          />
          <Slider
            label="המשרעת של E"
            value={s.E0}
            min={5}
            max={E0_MAX}
            step={1}
            format={(v) => `${sci(v)} V/m`}
            onChange={(v) => set((prev) => ({ ...prev, E0: v }))}
          />
          <Slider
            label="מקום הגשש"
            value={s.probe}
            min={0}
            max={X_MAX}
            step={0.05}
            format={(v) => `${sci(v)} m`}
            onChange={(v) =>
              setS((prev) => {
                const next = { ...prev, probe: v };
                probeTasks(next);
                return next;
              })
            }
          />
        </>
      }
    />
  );
}

/** A small legend at the top right of the graph area (RTL text, swatch on the right). */
function legend(ctx: CanvasRenderingContext2D, p: Palette, xRight: number, yTop: number, narrow: boolean, rows: { color: string; dash: number[]; label: string }[]) {
  ctx.save();
  ctx.font = `${narrow ? 11 : 12}px ${p.fontUi}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  let x = xRight;
  const y = yTop + 8;
  for (const row of rows) {
    const w = ctx.measureText(row.label).width + 30;
    ctx.strokeStyle = row.color;
    ctx.lineWidth = 2.4;
    ctx.setLineDash(row.dash);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 20, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.ink2;
    ctx.fillText(row.label, x - 24, y);
    x -= w + 10;
  }
  ctx.restore();
}

/** The wave: axes, E arrows along y, B arrows along z (oblique) or ⊙/⊗ (side view), the probe and the travel arrow. */
function drawWave(ctx: CanvasRenderingContext2D, p: Palette, W: number, H: number, st: State, wave: PlaneWave, narrow: boolean) {
  const x0 = W * 0.12;
  const x1 = W * 0.95;
  const y0 = H * 0.52;
  const xs = (x: number) => x0 + (x / X_MAX) * (x1 - x0);
  const amp = H * 0.4; // px for E0_MAX
  const scale = amp / E0_MAX; // px per V/m (and per V/m of cB)
  // z toward the reader, drawn slanting down-left and foreshortened
  const zx = -0.55;
  const zy = 0.42;
  const oblique = st.view === 'oblique';
  ctx.save();
  ctx.lineCap = 'round';

  // axes
  ctx.strokeStyle = p.ink2;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x0 - 6, y0);
  ctx.lineTo(x1 + 4, y0);
  ctx.stroke();
  arrow(ctx, x1 - 2, y0, x1 + 10, y0, { color: p.ink2, width: 1.4, head: 8 });
  const yAxisLen = amp * 0.95;
  arrow(ctx, x0, y0, x0, y0 - yAxisLen, { color: p.ink2, width: 1.4, head: 8 });
  // axis names, each with the field that lies along it (the colours of the two fields)
  ctx.font = `italic 600 ${narrow ? 12 : 13}px ${p.fontUi}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = p.ink2;
  ctx.fillText('x', x1 + 8, y0 + 13);
  ctx.textAlign = 'left';
  ctx.fillStyle = p.efield;
  ctx.fillText('y: E', x0 + 8, y0 - yAxisLen + 4);
  ctx.fillStyle = p.bfield;
  if (oblique) {
    const zl = amp * 0.55;
    arrow(ctx, x0, y0, x0 + zx * zl, y0 + zy * zl, { color: p.ink2, width: 1.4, head: 8 });
    ctx.fillText('z: cB', Math.max(2, x0 + zx * zl - 10), y0 + zy * zl + 13);
  } else {
    depthGlyph(ctx, x0 - 16, y0 - 18, 6, 'out', p.ink2, { fill: p.paper });
    ctx.fillText('z: B', 2, y0 - 34);
  }

  // the fields, sampled along x
  const n = narrow ? 40 : 56;
  const pts: { x: number; E: number; B: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * X_MAX;
    const f = waveAt(wave, x, st.t);
    pts.push({ x, E: f.E, B: f.B * C_LIGHT });
  }
  // B first, so the E arrows drawn over it stay readable where the two cross
  if (oblique) {
    ctx.save();
    ctx.strokeStyle = withAlpha(p.bfield, 0.9);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const x = (i / 200) * X_MAX;
      const b = waveAt(wave, x, st.t).B * C_LIGHT * scale;
      const sx = xs(x) + zx * b;
      const sy = y0 + zy * b;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i <= n; i += 2) {
      const q = pts[i];
      const b = q.B * scale;
      if (Math.abs(b) > 3) arrow(ctx, xs(q.x), y0, xs(q.x) + zx * b, y0 + zy * b, { color: p.bfield, width: 1.6, head: Math.min(7, Math.abs(b) * 0.5), alpha: 0.85 });
    }
  } else {
    for (let i = 0; i < n; i += 2) {
      const q = pts[i];
      const r = (Math.abs(q.B) / E0_MAX) * 9;
      if (r > 1.6) depthGlyph(ctx, xs(q.x), y0, r, q.B > 0 ? 'out' : 'in', p.bfield, { fill: p.paper, alpha: 0.9 });
    }
  }
  // E arrows and the curve through their tips
  ctx.save();
  ctx.strokeStyle = p.efield;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const x = (i / 200) * X_MAX;
    const sy = y0 - waveAt(wave, x, st.t).E * scale;
    if (i === 0) ctx.moveTo(xs(x), sy);
    else ctx.lineTo(xs(x), sy);
  }
  ctx.stroke();
  ctx.restore();
  for (let i = oblique ? 0 : 1; i <= n; i += oblique ? 1 : 2) {
    const q = pts[i];
    const e = q.E * scale;
    if (Math.abs(e) > 3) arrow(ctx, xs(q.x), y0, xs(q.x), y0 - e, { color: p.efield, width: 1.8, head: Math.min(8, Math.abs(e) * 0.5) });
  }

  // the probe
  const px = xs(st.probe);
  ctx.strokeStyle = withAlpha(p.accent, 0.85);
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(px, 40);
  ctx.lineTo(px, H - 6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.arc(px, y0, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // the direction of travel, from E×B (dir), with the speed ω/k
  const v = wave.v ?? C_LIGHT;
  const ay = H - 14;
  const ax = W * 0.78;
  const len = 46;
  arrow(ctx, ax - (st.dir * len) / 2, ay, ax + (st.dir * len) / 2, ay, { color: p.accent, width: 2.4, head: 10 });
  ctx.font = `600 12px ${p.fontUi}`;
  ctx.fillStyle = p.accent;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillText(`כיוון ההתקדמות, ${v === C_LIGHT ? 'c' : `${sci(v / C_LIGHT)}c`}`, ax - len / 2 - 8, ay);
  ctx.restore();
}
