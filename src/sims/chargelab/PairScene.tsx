/**
 * Scene "pair": two charged balls, each + or −. Like charges repel, unlike attract; the two
 * force arrows are equal and opposite. Direction only: no magnitudes (Coulomb's law is 1.3).
 */

import { useEffect, useState } from 'preact/hooks';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from '../core/canvas';
import { arrow } from '../core/ink';
import SimShell, { Toggle, type TaskDef } from '../core/SimShell';
import { frameOf, label, negative, positive } from './draw';

type Sign = 1 | -1;

const TASK_LABEL: Record<string, string> = {
  'all-four': 'בדקו את כל ארבעת הצירופים של סימני המטענים, ורשמו לעצמכם מתי הם דוחים ומתי מושכים.',
};

const key = (a: Sign, b: Sign) => `${a}${b}`;
const signText = (s: Sign) => (s > 0 ? 'חיובי' : 'שלילי');

export default function PairScene(props: { id: string; tasks?: string[] }) {
  const [a, setA] = useState<Sign>(1);
  const [b, setB] = useState<Sign>(1);
  const [seen, setSeen] = useState<string[]>([key(1, 1)]);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        if (st.a === 1 || st.a === -1) setA(st.a);
        if (st.b === 1 || st.b === -1) setB(st.b);
      }),
    [props.id],
  );

  useEffect(() => {
    setSeen((prev) => (prev.includes(key(a, b)) ? prev : [...prev, key(a, b)]));
  }, [a, b]);
  useEffect(() => {
    if (props.tasks?.includes('all-four') && seen.length >= 4) markTask(`${props.id}:all-four`);
  }, [seen, props.id, props.tasks]);

  const repel = a === b;

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const f = frameOf(view);
    const y = f.Y(55);
    const xa = f.X(48);
    const xb = f.X(112);
    const r = 11 * f.u;
    // strings
    ctx.save();
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.4;
    for (const x of [xa, xb]) {
      ctx.beginPath();
      ctx.moveTo(x, f.Y(8));
      ctx.lineTo(x, y - r);
      ctx.stroke();
    }
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(f.X(30), f.Y(8));
    ctx.lineTo(f.X(130), f.Y(8));
    ctx.stroke();
    ctx.restore();
    (a > 0 ? positive : negative)(ctx, xa, y, r, p);
    (b > 0 ? positive : negative)(ctx, xb, y, r, p);
    // equal and opposite forces: on A (left) and on B (right)
    const L = 15 * f.u;
    const gap = r + 4;
    const dirA = repel ? -1 : 1;
    arrow(ctx, xa + dirA * gap, y, xa + dirA * (gap + L), y, { color: p.force, width: 3, head: 11 });
    arrow(ctx, xb - dirA * gap, y, xb - dirA * (gap + L), y, { color: p.force, width: 3, head: 11 });
    label(ctx, 'F', xa + dirA * (gap + L / 2), y - 14, p, { color: p.force, size: 15, weight: 700 });
    label(ctx, 'F', xb - dirA * (gap + L / 2), y - 14, p, { color: p.force, size: 15, weight: 700 });
    label(ctx, repel ? 'דוחים' : 'מושכים', f.X(80), f.Y(100), p, { size: 24, hand: true, color: p.ink, weight: 700 });
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1.2, animate: false });
  useEffect(invalidate, [a, b]);

  const sentence = `הכדור השמאלי ${signText(a)} והימני ${signText(b)}: הם ${repel ? 'דוחים זה את זה' : 'מושכים זה את זה'}.`;

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: שני כדורים טעונים. ${sentence} שני החצים שווים באורכם ומנוגדים בכיוונם.`}
      canvasRef={canvasRef}
      aspect={160 / 120}
      live={sentence}
      tasks={tasks}
      readout={<span>{sentence}</span>}
      controls={
        <>
          <div class="group" role="group" aria-label="הכדור השמאלי">
            <span class="hint">כדור שמאלי:</span>
            <Toggle label="חיובי (+)" on={a > 0} onChange={() => setA(1)} />
            <Toggle label="שלילי (−)" on={a < 0} onChange={() => setA(-1)} />
          </div>
          <div class="group" role="group" aria-label="הכדור הימני">
            <span class="hint">כדור ימני:</span>
            <Toggle label="חיובי (+)" on={b > 0} onChange={() => setB(1)} />
            <Toggle label="שלילי (−)" on={b < 0} onChange={() => setB(-1)} />
          </div>
        </>
      }
    />
  );
}
