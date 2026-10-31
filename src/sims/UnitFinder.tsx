/**
 * Ten oil-drop charges on a number line, and a comb of marks at multiples of a unit the student
 * chooses. The comb shows how Millikan's data reveal a smallest charge: the unit must put every
 * point on a mark, and must not leave marks that no drop ever reached. Built for the chapter
 * review (lesson 1.11).
 *
 * The charges come from src/physics/lab-data.ts (a fixed seed, 2% error on each); the misfit and
 * the empty-mark count are computed there. The figure shows what the data allow; the claim that
 * charge is quantised rests on the experiment itself.
 */

import { useEffect, useState } from 'preact/hooks';
import { E_CHARGE } from '~/physics/constants';
import { drops, emptyMarks, unitMisfit } from '~/physics/lab-data';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { Slider, type TaskDef } from './core/SimShell';
import SimShell from './core/SimShell';
import { withAlpha } from './core/ink';
import { sci } from './core/format';

/** counts of elementary charges behind each measured drop (hidden from the student) */
const COUNTS = [3, 1, 5, 2, 4, 2, 3, 6, 1, 4];
const QS = drops(COUNTS, 0.02, 3);
const UNIT_E19_MIN = 0.5;
const UNIT_E19_MAX = 4;
const AXIS_MAX_E19 = 10.5;
/** a unit "fits" when the rms distance of the drops from the marks is below this fraction of the unit */
const FIT_LIMIT = 0.12;

const TASK_LABEL: Record<string, string> = {
  'find-unit': 'מצאו את היחידה הגדולה ביותר שעליה כל הנקודות יושבות על סימונים בלי שיישארו סימונים ריקים.',
  'smaller-unit': 'הקטינו את היחידה לחצי ממנה. האם הנקודות עדיין על סימונים? מה קרה לסימונים?',
};

interface State {
  /** the unit being tried, in 10⁻¹⁹ C */
  unit: number;
}

export interface UnitFinderProps {
  id: string;
  unit?: number;
  tasks?: string[];
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export default function UnitFinder(props: UnitFinderProps) {
  const [s, setS] = useState<State>({ unit: props.unit ?? 2.4 });
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        if (typeof st.unit === 'number') setS({ unit: Math.max(UNIT_E19_MIN, Math.min(UNIT_E19_MAX, round1(st.unit))) });
      }),
    [props.id],
  );

  const unit = s.unit * 1e-19;
  const misfit = unitMisfit(QS, unit);
  const empty = emptyMarks(QS, unit);
  const fits = misfit < FIT_LIMIT;
  const verdict = fits
    ? empty === 0
      ? 'כל הנקודות על סימונים, ואין סימונים ריקים'
      : `כל הנקודות על סימונים, אבל ${empty} סימונים נשארו ריקים`
    : 'חלק מהנקודות נופלות בין הסימונים';

  useEffect(() => {
    const nearE = Math.abs(s.unit - (E_CHARGE * 1e19)) < 0.15;
    if (props.tasks?.includes('find-unit') && fits && empty === 0 && nearE) markTask(`${props.id}:find-unit`);
    if (props.tasks?.includes('smaller-unit') && fits && empty > 0 && s.unit < 1.2) markTask(`${props.id}:smaller-unit`);
  }, [s, props.id, props.tasks]);

  useEffect(() => {
    const id = setTimeout(() => setLive(`יחידה ${sci(unit)} קולון: ${verdict}.`), 300);
    return () => clearTimeout(id);
  }, [s.unit]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const ml = 28;
    const mr = 28;
    const axisY = view.h - 54;
    const W = view.w - ml - mr;
    const X = (q19: number) => ml + (q19 / AXIS_MAX_E19) * W;
    ctx.save();
    // the comb
    ctx.lineWidth = 1.6;
    for (let k = 1; k * s.unit <= AXIS_MAX_E19; k++) {
      const x = X(k * s.unit);
      const hit = QS.some((q) => Math.abs(q / unit - k) <= 0.15);
      ctx.strokeStyle = hit ? withAlpha(p.accent, 0.9) : withAlpha(p.accent, 0.35);
      ctx.setLineDash(hit ? [] : [4, 5]);
      ctx.beginPath();
      ctx.moveTo(x, 26);
      ctx.lineTo(x, axisY);
      ctx.stroke();
      if (k <= 12) {
        ctx.setLineDash([]);
        ctx.fillStyle = p.accent;
        ctx.font = `600 11px ${p.fontUi}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(k), x, 24);
      }
    }
    ctx.setLineDash([]);
    // axis
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(ml, axisY);
    ctx.lineTo(view.w - mr, axisY);
    ctx.stroke();
    ctx.fillStyle = p.ink2;
    ctx.font = `12px ${p.fontUi}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = 0; v <= 10; v += 2) {
      ctx.beginPath();
      ctx.moveTo(X(v), axisY);
      ctx.lineTo(X(v), axisY + 5);
      ctx.stroke();
      ctx.fillText(String(v), X(v), axisY + 7);
    }
    ctx.fillStyle = p.ink;
    ctx.font = `italic 600 13px ${p.fontUi}`;
    ctx.textBaseline = 'bottom';
    ctx.fillText('q (10⁻¹⁹ C)', ml + W / 2, view.h - 4);
    // the drops, stacked when they share a place
    const sorted = QS.map((q) => q * 1e19).sort((a, b) => a - b);
    const stack: number[] = [];
    sorted.forEach((q, i) => {
      let level = 0;
      for (let j = i - 1; j >= 0 && q - sorted[j] < 0.3; j--) level++;
      stack.push(level);
    });
    sorted.forEach((q, i) => {
      const y = axisY - 14 - stack[i] * 15;
      ctx.fillStyle = p.paper;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(q), y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.efield, 0.6);
      ctx.beginPath();
      ctx.arc(X(q), y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 2, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: עשר טיפות על ציר המטען. היחידה שנבחרה ${sci(unit)} קולון. ${verdict}.`}
      canvasRef={canvasRef}
      aspect={2}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS({ unit: props.unit ?? 2.4 });
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            היחידה שנבדקת: <b class="q">{sci(unit)} C</b>
          </span>
          <span>
            סטייה ממוצעת מהסימונים: <b class="q">{(misfit * 100).toFixed(0)}% מהיחידה</b>
          </span>
          <span>
            <b>{verdict}</b>
          </span>
        </>
      }
      controls={
        <Slider
          label="היחידה"
          min={UNIT_E19_MIN}
          max={UNIT_E19_MAX}
          step={0.1}
          value={s.unit}
          format={(v) => `${v.toFixed(1)}·10⁻¹⁹ C`}
          onChange={(v) => setS({ unit: round1(v) })}
        />
      }
    />
  );
}
