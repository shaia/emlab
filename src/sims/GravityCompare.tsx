/**
 * Electric force against gravity for a pair of particles, on a log-log graph. Both laws fall off
 * as 1/r², so the two curves are parallel straight lines and their ratio does not depend on r.
 * The vertical gap between the lines is the ratio, which is why gravity can be ignored in an
 * atom. Built for lesson 1.3; reuses the plotting helper in core/plot.ts.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { E_CHARGE, M_ELECTRON, M_PROTON } from '~/physics/constants';
import { electricToGravityRatio, gravityForce } from '~/physics/coulomb';
import { coulombForce } from '~/physics/electrostatics';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { sci } from './core/format';
import { drawAxes, drawCurve, drawMarker, insetBox, makePlot } from './core/plot';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

type Pair = 'electron-proton' | 'proton-proton';

const PAIRS: Record<Pair, { label: string; m1: number; m2: number }> = {
  'electron-proton': { label: 'אלקטרון ופרוטון', m1: M_ELECTRON, m2: M_PROTON },
  'proton-proton': { label: 'שני פרוטונים', m1: M_PROTON, m2: M_PROTON },
};

/** separations [m]; 5.3·10⁻¹¹ m is about the radius of a hydrogen atom */
const DISTANCES = [1e-11, 2e-11, 5.3e-11, 1e-10, 2e-10, 5e-10, 1e-9];

const TASK_LABEL: Record<string, string> = {
  'move-r': 'שנו את המרחק בין החלקיקים. מה קורה למרחק האנכי בין שני הקווים?',
  'other-pair': 'עברו לזוג שני פרוטונים. עדיין הכוח החשמלי חזק יותר?',
};

interface State {
  pair: Pair;
  /** index into DISTANCES */
  ri: number;
}

export interface GravityCompareProps {
  id: string;
  pair?: Pair;
  tasks?: string[];
}

const initial = (p: GravityCompareProps): State => ({ pair: p.pair ?? 'electron-proton', ri: 2 });

const forces = (pair: Pair, r: number) => {
  const { m1, m2 } = PAIRS[pair];
  return { fe: Math.abs(coulombForce(E_CHARGE, E_CHARGE, r)), fg: gravityForce(m1, m2, r) };
};

export default function GravityCompare(props: GravityCompareProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const start = useRef<State>(initial(props));
  const moved = useRef(false);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => ({ ...prev, pair: st.pair === 'proton-proton' || st.pair === 'electron-proton' ? st.pair : prev.pair }));
      }),
    [props.id],
  );

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    if (has('move-r') && s.ri !== start.current.ri) moved.current = true;
    if (has('move-r') && moved.current) markTask(`${props.id}:move-r`);
    if (has('other-pair') && s.pair !== start.current.pair) markTask(`${props.id}:other-pair`);
  }, [s, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const { w, h } = view;
    const box = insetBox({ x: 0, y: 0, w, h }, { l: 62, r: 16, t: 14, b: 48 });
    const plot = makePlot(
      box,
      { min: 1e-11, max: 1e-9, scale: 'log', label: 'המרחק r במטרים' },
      { min: 1e-50, max: 1e-5, scale: 'log', label: 'גודל הכוח בניוטון', ticks: [1e-50, 1e-40, 1e-30, 1e-20, 1e-10] },
    );
    drawAxes(ctx, plot, p);
    const r = DISTANCES[s.ri];
    const { fe, fg } = forces(s.pair, r);
    drawCurve(ctx, plot, (x) => forces(s.pair, x).fe, { color: p.efield, width: 2.8 });
    drawCurve(ctx, plot, (x) => forces(s.pair, x).fg, { color: p.ink2, width: 2.8, dash: [7, 5] });

    // the gap between the two points is the ratio
    const sx = plot.px(r);
    const ye = plot.py(fe);
    const yg = plot.py(fg);
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, ye);
    ctx.lineTo(sx, yg);
    ctx.stroke();
    ctx.restore();
    drawMarker(ctx, plot, r, fe, p.efield, { radius: 5.5 });
    drawMarker(ctx, plot, r, fg, p.ink2, { radius: 5.5 });

    const ratio = electricToGravityRatio(E_CHARGE, E_CHARGE, PAIRS[s.pair].m1, PAIRS[s.pair].m2);
    ctx.save();
    ctx.direction = 'ltr';
    ctx.font = `600 13px ${p.fontUi}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = sx > box.x + box.w * 0.55 ? 'right' : 'left';
    const off = sx > box.x + box.w * 0.55 ? -10 : 10;
    ctx.fillStyle = p.ink;
    ctx.fillText(`× ${sci(ratio, 2)}`, sx + off, (ye + yg) / 2);
    ctx.font = `700 13px ${p.fontUi}`;
    ctx.fillStyle = p.efield;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.direction = 'rtl';
    ctx.fillText('כוח חשמלי', box.x + 8, plot.py(forces(s.pair, 1e-11).fe) + 8);
    ctx.fillStyle = p.ink2;
    ctx.fillText('כוח הכבידה', box.x + 8, plot.py(forces(s.pair, 1e-11).fg) + 8);
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  const r = DISTANCES[s.ri];
  const { fe, fg } = forces(s.pair, r);
  const ratio = electricToGravityRatio(E_CHARGE, E_CHARGE, PAIRS[s.pair].m1, PAIRS[s.pair].m2);
  const rText = `${sci(r, 2)} מ'`;

  return (
    <SimShell
      fig={props.id}
      label={`גרף של הכוח החשמלי והכוח הכבידתי כפונקציה של המרחק, ל${PAIRS[s.pair].label}, בסקאלה לוגריתמית. במרחק ${rText} הכוח החשמלי גדול פי ${sci(ratio, 2)} מכוח הכבידה.`}
      canvasRef={canvasRef}
      aspect={1.2}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(initial(props));
        moved.current = false;
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            <b class="q">
              F<sub>e</sub> = {sci(fe, 2)} N
            </b>
          </span>
          <span>
            <b class="q">
              F<sub>g</sub> = {sci(fg, 2)} N
            </b>
          </span>
          <span>
            היחס: <b class="q">F<sub>e</sub> / F<sub>g</sub> = {sci(ratio, 2)}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="זוג החלקיקים">
            {(Object.keys(PAIRS) as Pair[]).map((k) => (
              <Toggle
                key={k}
                label={PAIRS[k].label}
                on={s.pair === k}
                onChange={() => {
                  setS({ ...s, pair: k });
                  setLive(`נבחר הזוג: ${PAIRS[k].label}.`);
                }}
              />
            ))}
          </div>
          <Slider
            label="המרחק r"
            min={0}
            max={DISTANCES.length - 1}
            step={1}
            value={s.ri}
            format={(i) => `${sci(DISTANCES[i], 2)} מ'`}
            onChange={(i) => {
              setS({ ...s, ri: i });
              setLive(`המרחק ${sci(DISTANCES[i], 2)} מטר.`);
            }}
          />
        </>
      }
    />
  );
}
