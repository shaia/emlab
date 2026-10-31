/**
 * Cathode-ray tube: a beam of electrons or protons enters the uniform field between two plates
 * and lands on a screen. The student changes the field, the speed, its direction and the
 * particle, and reads the deflection. Built for lesson 1.10.
 *
 * All numbers come from src/physics/charge-in-field.ts. The path between the plates is the
 * parabola y = qEx²/(2mv²); beyond them a straight line. Beads move uniformly in x (the
 * horizontal motion is uniform), so equal time marks are equally spaced along x.
 */

import { useEffect, useState } from 'preact/hooks';
import { E_CHARGE, M_ELECTRON, M_PROTON } from '~/physics/constants';
import { acceleration, beamY, crtPath, positionAtTime, type CrtGeometry } from '~/physics/charge-in-field';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, chargeDisc, paperGrid, polyline, withAlpha } from './core/ink';
import { sciFull as sci } from './core-sci';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Particle = 'electron' | 'proton';

const GEO: CrtGeometry = { plateLength: 0.06, halfGap: 0.02, screenDistance: 0.12 };
const SCREEN_HALF = 0.07;
const GUN_X = -0.06;
/** the world is centred on this x [m] (the span −0.09 … 0.21 m is 0.30 m wide) */
const X0 = 0.06;
const WORLD_W = 0.3;
const WORLD_H = 0.17;
const PLATE_T = 0.004;
const MARKS = 6;

const PARTICLES: Record<Particle, { q: number; m: number; name: string; speeds: number[] }> = {
  electron: { q: -E_CHARGE, m: M_ELECTRON, name: 'אלקטרון', speeds: [5, 10, 15, 20, 25, 30, 35, 40] },
  proton: { q: E_CHARGE, m: M_PROTON, name: 'פרוטון', speeds: [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2] },
};

const FIELD_KN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const TASK_LABEL: Record<string, string> = {
  'spot-up': 'אלקטרון: הביאו את הכתם על המסך לגובה של לפחות 3 ס"מ מעל המרכז, בלי לפגוע בלוח.',
  'proton-spot': 'עברו לפרוטון והסיטו את הכתם בלפחות 1 ס"מ מהמרכז. מה צריך לשנות במהירות?',
  'hit-plate': 'הגדילו את השדה או האטו את החלקיק עד שהקרן פוגעת באחד הלוחות.',
};

interface State {
  particle: Particle;
  /** speed, in the particle's own unit list, as a value in 10⁶ m/s */
  speed: number;
  /** field strength in N/C */
  E: number;
  /** direction of the field: the plates' polarity */
  dir: 'down' | 'up';
  showMarks: boolean;
}

export interface CathodeRayTubeProps {
  id: string;
  particle?: Particle;
  speed?: number;
  /** field in kN/C */
  fieldKN?: number;
  showMarks?: boolean;
  tasks?: string[];
}

function initial(p: CathodeRayTubeProps): State {
  return {
    particle: p.particle ?? 'electron',
    speed: p.speed ?? 20,
    E: (p.fieldKN ?? 5) * 1000,
    dir: 'down',
    showMarks: p.showMarks ?? false,
  };
}

function nearestSpeed(particle: Particle, v: number): number {
  const list = PARTICLES[particle].speeds;
  return list.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), list[0]);
}

/** Everything the figure and the readout show, computed once per state. */
function solve(s: State) {
  const { q, m } = PARTICLES[s.particle];
  const v = s.speed * 1e6;
  const Ey = s.dir === 'down' ? -s.E : s.E;
  const res = crtPath(q, m, Ey, v, GEO);
  const a = acceleration(q, m, Ey);
  const screenHit = res.outcome === 'screen' && Math.abs(res.yScreen) <= SCREEN_HALF;
  return { q, m, v, Ey, res, a, screenHit };
}

const sideHe = (y: number) => (y > 0 ? 'למעלה' : 'למטה');

export default function CathodeRayTube(props: CathodeRayTubeProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (st.particle === 'electron' || st.particle === 'proton') next.particle = st.particle;
          if (typeof st.speed === 'number') next.speed = nearestSpeed(next.particle, st.speed);
          else next.speed = nearestSpeed(next.particle, next.speed);
          if (typeof st.fieldKN === 'number') next.E = Math.max(1, Math.min(10, Math.round(st.fieldKN))) * 1000;
          if (st.dir === 'down' || st.dir === 'up') next.dir = st.dir;
          if (typeof st.showMarks === 'boolean') next.showMarks = st.showMarks;
          return next;
        });
      }),
    [props.id],
  );

  const sol = solve(s);

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const { res, screenHit } = sol;
    if (has('spot-up') && s.particle === 'electron' && screenHit && res.yScreen >= 0.03) done('spot-up');
    if (has('proton-spot') && s.particle === 'proton' && screenHit && Math.abs(res.yScreen) >= 0.01) done('proton-spot');
    if (has('hit-plate') && res.outcome === 'plate') done('hit-plate');
  }, [s, props.id, props.tasks]);

  const describe = () => {
    const { res, screenHit } = sol;
    const who = PARTICLES[s.particle].name;
    if (res.outcome === 'plate') return `${who}: הקרן פוגעת בלוח ${sideHe(res.yHit)}.`;
    if (!screenHit) return `${who}: הקרן יוצאת בין הלוחות אבל מחטיאה את המסך, ${sideHe(res.yScreen)}.`;
    return `${who}: הכתם על המסך ${sci(Math.abs(res.yScreen) * 100)} ס"מ ${sideHe(res.yScreen)} מהמרכז.`;
  };

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const P = (x: number, y: number) => toScreen(view, x - X0, y);
    const { q, m, v, Ey, res, screenHit } = sol;
    const L = GEO.plateLength;
    const xScreen = L + GEO.screenDistance;
    const partColor = q < 0 ? p.neg : p.pos;
    paperGrid(ctx, view, p, 0.02);

    // the horizontal axis the particle would follow with no field
    {
      const [ax, ay] = P(GUN_X, 0);
      const [bx] = P(xScreen, 0);
      polyline(ctx, [[ax, ay], [bx, ay]], p.ink3, 1, { dash: [4, 5], alpha: 0.6 });
    }

    // plates: top positive when the field points down
    const topPositive = s.dir === 'down';
    const plate = (yEdge: number, positive: boolean, up: boolean) => {
      const [x1, y1] = P(0, yEdge);
      const [x2, y2] = P(L, yEdge + (up ? PLATE_T : -PLATE_T));
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.28);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(x1, Math.min(y1, y2), x2 - x1, Math.abs(y2 - y1));
      ctx.fill();
      ctx.stroke();
      ctx.font = `700 ${Math.max(11, Math.round(view.ppm * 0.011))}px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = positive ? p.pos : p.neg;
      const yy = (y1 + y2) / 2;
      for (let i = 0; i < 6; i++) ctx.fillText(positive ? '+' : '−', x1 + ((i + 0.5) * (x2 - x1)) / 6, yy);
      ctx.restore();
    };
    plate(GEO.halfGap, topPositive, true);
    plate(-GEO.halfGap, !topPositive, false);

    // the field between the plates
    if (s.E > 0) {
      const len = 12 + (s.E / 10000) * 22;
      // screen y grows downward: a field pointing down draws toward larger screen y
      const dy = s.dir === 'down' ? len : -len;
      for (const [x, y] of [[0.012, 0.0145], [0.048, 0.0145], [0.012, -0.0145], [0.048, -0.0145]]) {
        const [sx, sy] = P(x, y);
        arrow(ctx, sx, sy - dy / 2, sx, sy + dy / 2, { color: p.efield, width: 1.8, head: 7, alpha: 0.75 });
      }
    }

    // screen with a centimetre scale
    {
      const [sx, sy1] = P(xScreen, SCREEN_HALF);
      const [, sy2] = P(xScreen, -SCREEN_HALF);
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.35);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(sx, sy1, view.ppm * 0.004, sy2 - sy1);
      ctx.fill();
      ctx.stroke();
      ctx.font = `11px ${p.fontUi}`;
      ctx.fillStyle = p.ink2;
      ctx.strokeStyle = p.ink2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let cm = -7; cm <= 7; cm++) {
        const [, ty] = P(xScreen, cm / 100);
        const major = cm % 2 === 0;
        ctx.beginPath();
        ctx.moveTo(sx + view.ppm * 0.004, ty);
        ctx.lineTo(sx + view.ppm * 0.004 + (major ? 6 : 3), ty);
        ctx.stroke();
        if (major && cm !== 0) ctx.fillText(String(Math.abs(cm)), sx + view.ppm * 0.004 + 9, ty);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.direction = 'rtl';
      ctx.fillText('ס"מ', sx + view.ppm * 0.004 + 6, sy1 - 3);
      ctx.restore();
    }

    // particle source
    {
      const [gx, gy] = P(GUN_X - 0.026, 0);
      const [gx2] = P(GUN_X, 0);
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.28);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(gx, gy - view.ppm * 0.012, gx2 - gx, view.ppm * 0.024);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      chargeDisc(ctx, gx2 + 2, gy, Math.max(7, view.ppm * 0.0075), q, p, {});
    }

    // the path
    const xEnd = res.outcome === 'plate' ? res.xHit : xScreen;
    const pts: [number, number][] = [];
    const N = 140;
    for (let i = 0; i <= N; i++) {
      const x = GUN_X + ((xEnd - GUN_X) * i) / N;
      pts.push(P(x, beamY(q, m, Ey, v, GEO, x)));
    }
    // a path that leaves the screen's range is cut at the screen edge
    polyline(ctx, pts, partColor, 2.4, { glow: withAlpha(partColor, 0.6), alpha: 0.9 });

    // beads: uniform motion in x
    const dx = 0.012;
    const phase = ((t * 0.05) % dx + dx) % dx;
    for (let x = GUN_X + phase; x < xEnd; x += dx) {
      const [bx, by] = P(x, beamY(q, m, Ey, v, GEO, x));
      ctx.save();
      ctx.fillStyle = partColor;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // equal-time marks: x = vt, y = ½at²
    if (s.showMarks && s.E > 0) {
      const dt = GEO.plateLength / v / MARKS;
      const [, y0] = P(0, 0);
      for (let k = 1; k <= MARKS; k++) {
        const [xk, yk] = positionAtTime(q, m, Ey, v, k * dt);
        if (res.outcome === 'plate' && xk > res.xHit) break;
        const [mx, my] = P(xk, yk);
        polyline(ctx, [[mx, y0], [mx, my]], p.ink2, 1, { dash: [3, 3], alpha: 0.8 });
        ctx.save();
        ctx.fillStyle = p.paper;
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(mx, my, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (Math.abs(my - y0) > 16) {
          ctx.font = `600 11px ${p.fontUi}`;
          ctx.fillStyle = p.ink2;
          ctx.textAlign = 'center';
          ctx.textBaseline = my > y0 ? 'top' : 'bottom';
          ctx.fillText(String(k * k), mx + 9, (my + y0) / 2 + (my > y0 ? -6 : 6));
        }
        ctx.restore();
      }
    }

    // the force on the particle in mid-field
    if (s.E > 0) {
      const xm = L / 2;
      const [fx, fy] = P(xm, beamY(q, m, Ey, v, GEO, xm));
      const up = q * Ey > 0;
      const len = 30;
      arrow(ctx, fx, fy, fx, fy + (up ? -len : len), { color: p.force, width: 2.6, head: 10 });
      ctx.save();
      ctx.font = `italic 700 15px ${p.fontUi}`;
      ctx.fillStyle = p.force;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('F', fx + 12, fy + (up ? -len : len) / 2);
      ctx.restore();
    }

    // end of the path: a spot on the screen, a cross on the plate, or a miss
    if (res.outcome === 'plate') {
      const [hx, hy] = P(res.xHit, res.yHit);
      polyline(ctx, [[hx - 6, hy - 6], [hx + 6, hy + 6]], p.ink, 2.4);
      polyline(ctx, [[hx - 6, hy + 6], [hx + 6, hy - 6]], p.ink, 2.4);
    } else if (screenHit) {
      const [spx, spy] = P(xScreen, res.yScreen);
      const g = ctx.createRadialGradient(spx, spy, 1, spx, spy, 16);
      g.addColorStop(0, withAlpha(p.current, 0.95));
      g.addColorStop(1, withAlpha(p.current, 0));
      ctx.save();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(spx, spy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.current;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(spx, spy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: WORLD_W, worldHeight: WORLD_H, animate: true });
  useEffect(invalidate, [s]);

  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const change = (next: Partial<State>) => {
    setS((prev) => {
      const merged = { ...prev, ...next };
      if (next.particle && next.particle !== prev.particle) merged.speed = next.particle === 'electron' ? 20 : 0.6;
      return merged;
    });
  };
  // announce the outcome after the controls settle
  useEffect(() => {
    const id = setTimeout(() => setLive(describe()), 400);
    return () => clearTimeout(id);
  }, [s]);

  const { res, a, v } = sol;
  const speeds = PARTICLES[s.particle].speeds;
  const speedIndex = Math.max(0, speeds.indexOf(s.speed));
  const fieldIndex = Math.max(0, FIELD_KN.indexOf(s.E / 1000));
  const outcomeText =
    res.outcome === 'plate'
      ? `הקרן פגעה בלוח ${sideHe(res.yHit)}`
      : sol.screenHit
        ? `הכתם על המסך: Y = ${sci(Math.abs(res.yScreen) * 100)} ס"מ ${sideHe(res.yScreen)}`
        : `הקרן מחטיאה את המסך (${sideHe(res.yScreen)})`;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${PARTICLES[s.particle].name} בין שני לוחות טעונים. שדה ${sci(s.E)} ניוטון לקולון, מהירות ${sci(v)} מטר לשנייה. ${describe()}`}
      canvasRef={canvasRef}
      aspect={WORLD_W / WORLD_H}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span>
            תאוצה: <b class="q">a = qE/m = {sci(Math.abs(a))} m/s²</b> ({a === 0 ? 'אין' : sideHe(a)})
          </span>
          <span>
            זמן בין הלוחות: <b class="q">t = L/v = {sci(res.transitTime)} s</b>
          </span>
          <span>
            הסטה ביציאה: <b class="q">y = {sci(Math.abs(res.yExit) * 100)} cm</b>
          </span>
          <span>
            <b>{outcomeText}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="החלקיק">
            {(['electron', 'proton'] as Particle[]).map((k) => (
              <Toggle
                key={k}
                label={PARTICLES[k].name}
                on={s.particle === k}
                swatch={PARTICLES[k].q < 0 ? 'var(--neg)' : 'var(--pos)'}
                onChange={() => change({ particle: k })}
              />
            ))}
            <Toggle label="סימוני זמן שווים" on={s.showMarks} onChange={(on) => change({ showMarks: on })} />
          </div>
          <div class="group" role="group" aria-label="כיוון השדה">
            <Toggle label="השדה כלפי מטה (העליון +)" on={s.dir === 'down'} onChange={() => change({ dir: 'down' })} />
            <Toggle label="השדה כלפי מעלה (העליון −)" on={s.dir === 'up'} onChange={() => change({ dir: 'up' })} />
          </div>
          <Slider
            label="עוצמת השדה E"
            min={0}
            max={FIELD_KN.length - 1}
            step={1}
            value={fieldIndex}
            format={(i) => `${sci(FIELD_KN[i] * 1000)} N/C`}
            onChange={(i) => change({ E: FIELD_KN[i] * 1000 })}
          />
          <Slider
            label="מהירות הכניסה v"
            min={0}
            max={speeds.length - 1}
            step={1}
            value={speedIndex}
            format={(i) => `${sci(speeds[i] * 1e6)} m/s`}
            onChange={(i) => change({ speed: speeds[i] })}
          />
        </>
      }
    />
  );
}
