/**
 * Scene "polarise": a charged body near a neutral insulator. No electron leaves its molecule,
 * but each molecule's electron cloud shifts a little, so the near face shows the opposite
 * sign and the far face the same sign. The near charge is closer, so the pull wins and the
 * force is an attraction whatever the sign of the charged body.
 */

import { useEffect, useState } from 'preact/hooks';
import { polarisationAttraction, polarisationShift } from '~/physics/charging';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from '../core/canvas';
import { arrow, withAlpha } from '../core/ink';
import { sci } from '../core/format';
import SimShell, { Slider, Toggle, type TaskDef } from '../core/SimShell';
import { frameOf, glyphFor, label, negative, positive, slab } from './draw';

const ROD = 8;
const R_VALUES = [1, 1.3, 1.6, 1.9, 2.2];
const R_NAMES = ['צמוד כמעט', 'קרוב', 'באמצע', 'רחוק', 'רחוק מאוד'];

const TASK_LABEL: Record<string, string> = {
  'both-signs': 'קרבו גוף שלילי וגוף חיובי אל המבודד. באיזה כיוון פועל הכוח בכל אחד מהמקרים?',
};

const COLS = [110, 130];
const ROWS = [30, 45, 60, 75, 90];

export default function PolariseScene(props: { id: string; tasks?: string[] }) {
  const [rodN, setRodN] = useState(ROD);
  const [ri, setRi] = useState(2);
  const [signs, setSigns] = useState<number[]>([]);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const r = R_VALUES[ri];

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        if (typeof st.rod === 'number') setRodN(st.rod);
        if (typeof st.dist === 'number') setRi(Math.max(0, Math.min(R_VALUES.length - 1, Math.round(st.dist))));
      }),
    [props.id],
  );

  useEffect(() => {
    if (rodN !== 0 && ri <= 2) setSigns((s) => (s.includes(Math.sign(rodN)) ? s : [...s, Math.sign(rodN)]));
  }, [rodN, ri]);
  useEffect(() => {
    if (props.tasks?.includes('both-signs') && signs.length >= 2) markTask(`${props.id}:both-signs`);
  }, [signs, props.id, props.tasks]);

  const F1 = polarisationAttraction(ROD, 1);
  const rel = polarisationAttraction(rodN, r) / F1;
  const shift = polarisationShift(rodN, r);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const f = frameOf(view);
    const gR = 3.1 * f.u;
    // the neutral insulator
    slab(ctx, f.X(98), f.Y(16), 44 * f.u, 88 * f.u, p, { dash: true });
    label(ctx, 'מבודד ניטרלי', f.X(120), f.Y(9), p, { size: 13, color: p.ink });
    const px = Math.max(-9, Math.min(9, shift * 1.1)); // + = toward the rod = to the left
    for (const mx of COLS) {
      for (const my of ROWS) {
        const X = f.X(mx);
        const Y = f.Y(my);
        ctx.save();
        ctx.strokeStyle = withAlpha(p.ink, 0.28);
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(X, Y, 8.5 * f.u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        negative(ctx, X - px * f.u, Y, gR, p);
        positive(ctx, X, Y, gR, p);
      }
    }
    // the charged body
    const xb = 79 - ((r - 1) / 1.2) * 28;
    const yb = 60;
    const rb = 15;
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(f.X(xb), f.Y(yb), rb * f.u, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (rodN !== 0) {
      for (let k = 0; k < Math.min(8, Math.abs(rodN)); k++) {
        const a = (k / 8) * Math.PI * 2 + 0.4;
        glyphFor(ctx, rodN, f.X(xb + (rb - 5) * Math.cos(a)), f.Y(yb + (rb - 5) * Math.sin(a)), gR, p);
      }
    }
    label(ctx, rodN === 0 ? 'גוף ניטרלי' : 'גוף טעון', f.X(xb), f.Y(yb - rb - 8), p, { size: 13, color: p.ink });
    // force on the insulator: toward the charged body, same for both signs
    if (rodN !== 0) {
      const len = Math.min(52, 60 * Math.pow(rel, 0.4)) * f.u;
      const ax = f.X(120);
      const ay = f.Y(112);
      arrow(ctx, ax, ay, ax - len, ay, { color: p.force, width: 3.4, head: 12 });
      label(ctx, 'F', ax - len / 2, ay - 12, p, { size: 15, color: p.force, weight: 700 });
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1.2, animate: false });
  useEffect(invalidate, [rodN, ri]);

  const kind = rodN > 0 ? 'שלילי' : rodN < 0 ? 'חיובי' : 'ניטרלי';
  const say =
    rodN === 0
      ? 'אין גוף טעון: המולקולות לא מקוטבות ואין כוח.'
      : `הגוף הטעון ${kind}. הכוח על המבודד הניטרלי מכוון אל הגוף הטעון (משיכה).`;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: גוף טעון ליד מבודד ניטרלי. ${say} מרחק: ${R_NAMES[ri]}.`}
      canvasRef={canvasRef}
      aspect={160 / 120}
      live={live}
      tasks={tasks}
      onReset={() => {
        setRodN(ROD);
        setRi(2);
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>{say}</span>
          {rodN !== 0 && (
            <span>
              עוצמת הכוח (יחסית): <b class="q">{sci(rel, 2)}</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="סימן הגוף הטעון">
            <Toggle label="גוף שלילי (−)" on={rodN > 0} onChange={() => (setRodN(ROD), setLive('הגוף הטעון שלילי.'))} />
            <Toggle label="גוף חיובי (+)" on={rodN < 0} onChange={() => (setRodN(-ROD), setLive('הגוף הטעון חיובי.'))} />
            <Toggle label="בלי מטען" on={rodN === 0} onChange={() => (setRodN(0), setLive('הגוף ניטרלי.'))} />
          </div>
          <Slider label="מרחק" min={0} max={R_VALUES.length - 1} step={1} value={ri} format={(i) => R_NAMES[i]} onChange={setRi} />
        </>
      }
    />
  );
}
