/**
 * Compass under a wire, seen from above: the tangent method of lesson 4.11 for measuring the
 * horizontal component of the Earth's magnetic field. A long straight wire runs over a compass at
 * a height r; the learner sets the current, the height and the direction of the wire, reads the
 * needle's deflection on the dial and records a table of current, angle and tanθ.
 *
 * Map view: north up, east to the right, the wire above the needle (closer to the viewer). The
 * needle rests along the horizontal resultant of the Earth's field and the wire's field
 * (needleDeflection in src/physics/compass.ts). Beside the dial, the field triangle: B_E, the
 * wire's field and their sum, with the angle θ between B_E and the sum. The figure is static: it
 * redraws on every change and never animates, so still mode needs nothing extra.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { horizontalField, needleDeflection, signedWireField, wireFieldAtNeedle } from '~/physics/compass';
import { EARTH_B_HORIZONTAL } from '~/physics/magnetism';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo, type Palette } from './core/canvas';
import { arrow, chevron, withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';
import './CompassWire.css';

const ASPECT = 1.3;
const DEG = Math.PI / 180;
const I_MAX = 10;

const TASK_LABEL: Record<string, string> = {
  'wire-ew': 'כשזורם זרם בתיל, סובבו את התיל לכיוון מזרח–מערב (90°). מה עושה המחט?',
  'record-five': 'החזירו את התיל לכיוון צפון–דרום (0°), ורשמו לפחות חמש מדידות בזרמים שונים, באותו גובה.',
  'near-90': 'נסו להביא את המחט ל-90°: הגדילו את הזרם והנמיכו את התיל. מה הזווית הגדולה ביותר שהצלחתם?',
};

export interface CompassWireProps {
  id: string;
  /** current magnitude [A] */
  I?: number;
  /** +1: current along the wire's arrow (north when the wire runs north–south); −1: against it */
  dir?: 1 | -1;
  /** height of the wire above the needle [m] */
  r?: number;
  /** direction of the wire, from north toward east [degrees] */
  az?: number;
  showTriangle?: boolean;
  tasks?: string[];
}

interface Point {
  I: number;
  r: number;
  az: number;
  deg: number;
}

interface State {
  I: number;
  dir: 1 | -1;
  r: number;
  az: number;
  showTriangle: boolean;
  points: Point[];
}

/** the needle as a reader sees it: degrees from north, rounded to the whole degree (east positive) */
const reading = (th: number) => Math.round(th / DEG);
const cm = (r: number) => `${Number((r * 100).toFixed(1))} cm`;
const sideHe = (deg: number) => (deg === 0 ? '' : Math.abs(deg) === 180 ? 'דרומה' : deg < 0 ? 'מערבה' : 'מזרחה');
const tanText = (deg: number) => (Math.abs(deg) >= 90 ? '—' : sci(Math.tan(Math.abs(deg) * DEG)));

export default function CompassWire(props: CompassWireProps) {
  const init = (): State => ({
    I: props.I ?? 0,
    dir: props.dir ?? 1,
    r: props.r ?? 0.03,
    az: props.az ?? 0,
    showTriangle: props.showTriangle ?? true,
    points: [],
  });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const userActed = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const setup = { I: s.dir * s.I, r: s.r, azimuth: s.az * DEG, BE: EARTH_B_HORIZONTAL };
  const th = needleDeflection(setup);
  const deg = Number.isNaN(th) ? NaN : reading(th);
  const Bw = Math.abs(signedWireField(s.I, s.r));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => ({
          ...prev,
          I: typeof st.I === 'number' ? st.I : prev.I,
          dir: st.dir === 1 || st.dir === -1 ? st.dir : prev.dir,
          r: typeof st.r === 'number' ? st.r : prev.r,
          az: typeof st.az === 'number' ? st.az : prev.az,
          showTriangle: typeof st.showTriangle === 'boolean' ? st.showTriangle : prev.showTriangle,
          points: st.clear === true ? [] : prev.points,
        }));
      }),
    [props.id],
  );

  /** every user action goes through here, so tasks are only ever completed by the learner */
  const act = (f: (prev: State) => State) => {
    userActed.current = true;
    setS((prev) => {
      const next = f(prev);
      const has = (t: string) => props.tasks?.includes(t);
      const done = (t: string) => markTask(`${props.id}:${t}`);
      if (has('wire-ew') && next.I > 0 && Math.abs(next.az - 90) <= 5) done('wire-ew');
      const ns = next.points.filter((q) => q.az === 0 && q.r === next.r && q.I !== 0);
      if (has('record-five') && new Set(ns.map((q) => q.I)).size >= 5) done('record-five');
      const thn = needleDeflection({ I: next.dir * next.I, r: next.r, azimuth: next.az * DEG, BE: EARTH_B_HORIZONTAL });
      if (has('near-90') && next.az === 0 && Math.abs(thn) >= 75 * DEG) done('near-90');
      return next;
    });
  };

  const record = () =>
    act((prev) => {
      const t = needleDeflection({ I: prev.dir * prev.I, r: prev.r, azimuth: prev.az * DEG, BE: EARTH_B_HORIZONTAL });
      if (Number.isNaN(t)) return prev;
      const q: Point = { I: prev.dir * prev.I, r: prev.r, az: prev.az, deg: reading(t) };
      const rest = prev.points.filter((p) => !(p.I === q.I && p.r === q.r && p.az === q.az));
      return { ...prev, points: [...rest, q].slice(-8) };
    });

  useEffect(() => {
    if (!userActed.current) return;
    setLive(
      Number.isNaN(deg)
        ? 'השדה האופקי במחט מתאפס: המחט לא מצביעה לשום כיוון מסוים.'
        : `זרם ${sci(s.I)} אמפר, גובה ${cm(s.r)}. המחט סטתה ב-${Math.abs(deg)} מעלות ${sideHe(deg)}.`,
    );
  }, [s]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const narrow = W < 480;
    // the dial on the left two thirds, the field triangle on the right third
    const cx = W * (s.showTriangle ? 0.37 : 0.5);
    const cy = H * 0.5 + 6;
    // room above and below the dial for the direction words
    const R = Math.min(W * 0.25, H * 0.5 - 34);
    dial(ctx, cx, cy, R, p, narrow);
    needle(ctx, cx, cy, R * 0.78, Number.isNaN(th) ? null : th, p);
    wire(ctx, cx, cy, R, s.az * DEG, s.I === 0 ? 0 : s.dir, p, narrow);
    north(ctx, 22, 40, p, narrow);
    // the triangle's box keeps clear of the corner buttons (top) and of the right edge (labels)
    if (s.showTriangle) triangle(ctx, W * 0.68, 64, W * 0.32 - 30, H - 100, p, narrow);
  };

  const triangle = (ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, p: Palette, narrow: boolean) => {
    const BE = EARTH_B_HORIZONTAL;
    const wv = wireFieldAtNeedle(setup);
    const tot = horizontalField(setup);
    // fit the three points (0,0), (0,B_E), (tot) into the box, B_E at most 55% of the height
    const xs = [0, 0, tot.east];
    const ys = [0, BE, tot.north];
    const minx = Math.min(...xs);
    const maxx = Math.max(...xs);
    const miny = Math.min(...ys);
    const maxy = Math.max(...ys);
    const k = Math.min(w / Math.max(maxx - minx, 1e-30), h / Math.max(maxy - miny, 1e-30), (0.55 * h) / BE);
    const ox = x0 + w / 2 - ((minx + maxx) / 2) * k;
    const oy = y0 + h / 2 + ((miny + maxy) / 2) * k;
    const P = (e: number, n: number): [number, number] => [ox + e * k, oy - n * k];
    const [ex, ey] = P(0, BE);
    const [tx, ty] = P(tot.east, tot.north);
    ctx.save();
    ctx.font = `600 ${narrow ? 11 : 13}px ${p.fontUi}`;
    ctx.fillStyle = p.ink2;
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    // under the triangle: the corner buttons sit above it
    ctx.textBaseline = 'top';
    ctx.fillText('משולש השדות', x0 + w / 2, y0 + h + 10);
    ctx.restore();
    arrow(ctx, ox, oy, ex, ey, { color: p.bfield, width: 2.4, head: 10 });
    label(ctx, 'B', 'E', ox + 8, (oy + ey) / 2, p.bfield, narrow, 'left');
    if (Math.hypot(tx - ex, ty - ey) > 2) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      arrow(ctx, ex, ey, tx, ty, { color: withAlpha(p.bfield, 0.75), width: 2, head: 9 });
      ctx.restore();
      label(ctx, 'B', 'w', (ex + tx) / 2, Math.min(ey, ty) - 12, p.bfield, narrow, 'center');
      // a right angle where the wire's field meets B_E, when they are perpendicular
      if (Math.abs(wv.north) < 1e-9 * BE) {
        const sgn = Math.sign(tx - ex);
        ctx.save();
        ctx.strokeStyle = p.ink3;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ex + sgn * 9, ey);
        ctx.lineTo(ex + sgn * 9, ey + 9);
        ctx.lineTo(ex, ey + 9);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (Math.hypot(tx - ox, ty - oy) > 2) {
      arrow(ctx, ox, oy, tx, ty, { color: p.bfield, width: 3.4, head: 12 });
      label(ctx, 'B', '', tx + (tx < ox ? -8 : 8), ty + 2, p.bfield, narrow, tx < ox ? 'right' : 'left');
      // the angle θ between B_E and the resultant, at the origin
      if (!Number.isNaN(th) && Math.abs(th) > 1.5 * DEG) {
        const rr = Math.min(34, 0.4 * Math.hypot(tx - ox, ty - oy), 0.4 * (oy - ey));
        ctx.save();
        ctx.strokeStyle = p.hand;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        // canvas angles: up is −π/2; the resultant is at −π/2 + θ
        ctx.arc(ox, oy, rr, -Math.PI / 2, -Math.PI / 2 + th, th < 0);
        ctx.stroke();
        ctx.font = `italic 600 ${narrow ? 12 : 14}px ${p.fontUi}`;
        ctx.fillStyle = p.hand;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const a = -Math.PI / 2 + th / 2;
        ctx.fillText('θ', ox + (rr + 10) * Math.cos(a), oy + (rr + 10) * Math.sin(a));
        ctx.restore();
      }
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  const wireDirHe = s.az === 0 ? 'צפון–דרום' : s.az === 90 ? 'מזרח–מערב' : `${s.az}° מהצפון`;
  const currentHe = s.I === 0 ? 'אין זרם' : s.az === 0 ? (s.dir > 0 ? 'הזרם צפונה' : 'הזרם דרומה') : s.dir > 0 ? 'הזרם בכיוון החץ' : 'הזרם נגד החץ';
  const needleHe = Number.isNaN(deg) ? 'המחט לא מצביעה לשום כיוון מסוים' : deg === 0 ? 'המחט מצביעה צפונה' : `המחט סטתה ב-${Math.abs(deg)} מעלות ${sideHe(deg)}`;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: מצפן מתחת לתיל ישר, במבט מלמעלה, הצפון למעלה. התיל בכיוון ${wireDirHe}, בגובה ${cm(s.r)} מעל המחט. ${currentHe}${s.I ? `, ${sci(s.I)} אמפר` : ''}. ${needleHe}. נרשמו ${s.points.length} מדידות.`}
      canvasRef={canvasRef}
      aspect={ASPECT}
      live={live}
      tasks={tasks}
      onReset={() => {
        userActed.current = false;
        setS(init());
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            השדה של התיל במחט: <b class="q">B<sub>w</sub> = {sci(Bw)} T</b>
          </span>
          <span>
            השדה של כדור הארץ (הרכיב האופקי): <b class="q">B<sub>E</sub> = {sci(EARTH_B_HORIZONTAL)} T</b>
          </span>
          <span>
            {Number.isNaN(deg) ? (
              'המחט: אין כיוון מסוים'
            ) : (
              <>
                המחט: <b class="q">θ = {Math.abs(deg)}°</b> {sideHe(deg)}
                {Math.abs(deg) < 90 && Math.abs(deg) > 0 && (
                  <>
                    {' '}
                    ומכאן <b class="q">tanθ = {tanText(deg)}</b>
                  </>
                )}
              </>
            )}
          </span>
        </>
      }
      controls={
        <>
          <Slider label="הזרם בתיל" value={s.I} min={0} max={I_MAX} step={0.5} format={(v) => `${v} A`} onChange={(v) => act((prev) => ({ ...prev, I: v }))} />
          <Slider label="גובה התיל מעל המחט" value={s.r * 100} min={1} max={8} step={0.5} format={(v) => `${v} cm`} onChange={(v) => act((prev) => ({ ...prev, r: Number((v / 100).toFixed(4)) }))} />
          <Slider label="כיוון התיל, בזווית מהצפון" value={s.az} min={0} max={180} step={5} format={(v) => `${v}°`} onChange={(v) => act((prev) => ({ ...prev, az: v }))} />
          <div class="group" role="group" aria-label="כיוון הזרם ומדידות">
            <button type="button" class="btn" onClick={() => act((prev) => ({ ...prev, dir: prev.dir > 0 ? -1 : 1 }))}>
              הפכו את כיוון הזרם
            </button>
            <button type="button" class="btn primary" onClick={record}>
              רשמו מדידה
            </button>
            <button type="button" class="btn" onClick={() => act((prev) => ({ ...prev, points: [] }))}>
              נקו את הטבלה
            </button>
            <Toggle label="משולש השדות" on={s.showTriangle} swatch="var(--bfield)" onChange={(v) => act((prev) => ({ ...prev, showTriangle: v }))} />
          </div>
          {s.points.length > 0 && (
            <div class="cw-table-wrap">
              <table class="cw-table">
                <caption>המדידות שרשמתם</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <bdi dir="ltr">I (A)</bdi>
                    </th>
                    <th scope="col">
                      <bdi dir="ltr">r (cm)</bdi>
                    </th>
                    <th scope="col">כיוון התיל</th>
                    <th scope="col">
                      <bdi dir="ltr">θ (°)</bdi>
                    </th>
                    <th scope="col">
                      <bdi dir="ltr">tanθ</bdi>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.points.map((q) => (
                    <tr key={`${q.I}-${q.r}-${q.az}`}>
                      <td class="q">{Math.abs(q.I)}</td>
                      <td class="q">{Number((q.r * 100).toFixed(1))}</td>
                      <td>{q.az === 0 ? 'צפון–דרום' : `${q.az}°`}</td>
                      <td class="q">{Math.abs(q.deg)}</td>
                      <td class="q">{tanText(q.deg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------ drawing */

/** a symbol with a subscript, "B" + "E", in the magnetic colour */
function label(ctx: CanvasRenderingContext2D, sym: string, sub: string, x: number, y: number, color: string, narrow: boolean, align: CanvasTextAlign) {
  ctx.save();
  const big = narrow ? 13 : 15;
  ctx.font = `italic 700 ${big}px ${'serif'}`;
  const w1 = ctx.measureText(sym).width;
  ctx.font = `italic 600 ${big * 0.72}px serif`;
  const w2 = sub ? ctx.measureText(sub).width : 0;
  const total = w1 + w2;
  const left = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `italic 700 ${big}px serif`;
  ctx.fillText(sym, left, y);
  if (sub) {
    ctx.font = `italic 600 ${big * 0.72}px serif`;
    ctx.fillText(sub, left + w1, y + big * 0.32);
  }
  ctx.restore();
}

/** the compass dial: ticks every 10°, numbers 0–90 from north on both sides, and the four directions */
function dial(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, p: Palette, narrow: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = p.paper;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = p.ink;
  ctx.stroke();
  for (let a = 0; a < 360; a += 5) {
    const long = a % 30 === 0;
    const mid = a % 10 === 0;
    const r0 = R * (long ? 0.86 : mid ? 0.9 : 0.94);
    const u = a * DEG;
    ctx.beginPath();
    ctx.moveTo(cx + r0 * Math.sin(u), cy - r0 * Math.cos(u));
    ctx.lineTo(cx + R * 0.99 * Math.sin(u), cy - R * 0.99 * Math.cos(u));
    ctx.strokeStyle = long ? p.ink2 : p.ink3;
    ctx.lineWidth = long ? 1.6 : 1;
    ctx.stroke();
  }
  // deflection numbers: 0 at north and south, 90 at east and west
  ctx.font = `${narrow ? 9 : 11}px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let a = 0; a < 360; a += 30) {
    const n = a <= 90 ? a : a <= 270 ? Math.abs(180 - a) : 360 - a;
    const u = a * DEG;
    ctx.fillText(String(n), cx + R * 0.76 * Math.sin(u), cy - R * 0.76 * Math.cos(u));
  }
  // the four directions outside the dial
  ctx.font = `600 ${narrow ? 11 : 13}px ${p.fontUi}`;
  ctx.fillStyle = p.ink;
  ctx.direction = 'rtl';
  ctx.fillText('צפון', cx, cy - R - 12);
  ctx.fillText('דרום', cx, cy + R + 13);
  ctx.textAlign = 'left';
  ctx.fillText('מזרח', cx + R + 6, cy);
  ctx.textAlign = 'right';
  ctx.fillText('מערב', cx - R - 6, cy);
  ctx.restore();
}

/** the needle: the north half filled and marked N, the south half pale and marked S */
function needle(ctx: CanvasRenderingContext2D, cx: number, cy: number, L: number, th: number | null, p: Palette) {
  ctx.save();
  ctx.translate(cx, cy);
  if (th === null) {
    // no horizontal field: a grey, undecided needle
    ctx.globalAlpha = 0.35;
    th = 0;
  }
  ctx.rotate(th);
  const w = L * 0.11;
  ctx.beginPath();
  ctx.moveTo(0, -L);
  ctx.lineTo(w, 0);
  ctx.lineTo(-w, 0);
  ctx.closePath();
  ctx.fillStyle = p.pos;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = p.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, L);
  ctx.lineTo(w, 0);
  ctx.lineTo(-w, 0);
  ctx.closePath();
  ctx.fillStyle = p.paper2;
  ctx.fill();
  ctx.stroke();
  ctx.font = `700 ${Math.max(10, L * 0.13)}px ${p.fontUi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = p.ink;
  ctx.fillText('N', 0, -L - 12);
  ctx.fillText('S', 0, L + 12);
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fillStyle = p.ink;
  ctx.fill();
  ctx.restore();
}

/** the wire, above the needle: a gold band across the dial with chevrons along the current */
function wire(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, az: number, dir: number, p: Palette, narrow: boolean) {
  const ux = Math.sin(az);
  const uy = -Math.cos(az);
  // the wire is long; only the part across the dial is drawn, clear of the direction words
  const L = R * 0.98;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = withAlpha(p.ink, 0.55);
  ctx.lineWidth = 9;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - ux * L, cy - uy * L);
  ctx.lineTo(cx + ux * L, cy + uy * L);
  ctx.stroke();
  ctx.strokeStyle = p.current;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
  if (dir !== 0) {
    for (const f of [-0.95, -0.45, 0.45, 0.95]) chevron(ctx, cx + ux * L * f, cy + uy * L * f, ux * dir, uy * dir, 7, p.ink);
    // "I" beside the wire, near the end the current flows to
    const ex = cx + ux * dir * L * 0.72 - uy * 14;
    const ey = cy + uy * dir * L * 0.72 + ux * 14;
    ctx.save();
    ctx.font = `italic 700 ${narrow ? 13 : 15}px serif`;
    ctx.fillStyle = p.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('I', ex, ey);
    ctx.restore();
  }
}

/** a north arrow for the map, in the corner */
function north(ctx: CanvasRenderingContext2D, x: number, y: number, p: Palette, narrow: boolean) {
  arrow(ctx, x, y + 26, x, y - 6, { color: p.ink2, width: 1.8, head: 8 });
  ctx.save();
  ctx.font = `600 ${narrow ? 10 : 12}px ${p.fontUi}`;
  ctx.fillStyle = p.ink2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.direction = 'rtl';
  ctx.fillText('צפון', x, y + 30);
  ctx.restore();
}
