/**
 * Scene "rub": two bodies rubbed together. Each press of "rub" moves one electron from the body
 * that holds its electrons less tightly to the other. Protons stay put, the total never
 * changes, and the charge of each body is a whole number of e. The counts are toy numbers.
 */

import { useEffect, useState } from 'preact/hooks';
import { chargeOfElectrons, electronReceiver, transferElectrons, type Material } from '~/physics/charging';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from '../core/canvas';
import { sci } from '../core/format';
import SimShell, { Toggle, type TaskDef } from '../core/SimShell';
import { chargeInE, eText, frameOf, hole, label, negative, positive, slab } from './draw';

export type RubPair = 'glass-silk' | 'pvc-wool';

const PAIRS: Record<RubPair, { a: Material; b: Material; nameA: string; nameB: string; choice: string }> = {
  'glass-silk': { a: 'glass', b: 'silk', nameA: 'מוט זכוכית', nameB: 'בד משי', choice: 'זכוכית ומשי' },
  'pvc-wool': { a: 'pvc', b: 'wool', nameA: 'מוט PVC', nameB: 'בד צמר', choice: 'PVC וצמר' },
};

const MAX_RUBS = 8;
const COLS = 8;

const TASK_LABEL: Record<string, string> = {
  'rub-3': 'שפשפו עד ששלושה אלקטרונים עברו מגוף אחד לשני, ובדקו את סך המטען של שני הגופים.',
  'both-pairs': 'שפשפו כל אחד משני צמדי החומרים, וראו איזה גוף נטען חיובית בכל צמד.',
};

/** n electrons in excess in each body from the number of rubs. */
function counts(pair: RubPair, rubs: number): [number, number] {
  const { a, b } = PAIRS[pair];
  const k = electronReceiver(a, b) === 'b' ? rubs : -rubs; // electrons that left body A
  return transferElectrons(0, 0, k);
}

const minus = (s: string) => s.replace('-', '−');

export default function RubScene(props: { id: string; tasks?: string[] }) {
  const [pair, setPair] = useState<RubPair>('glass-silk');
  const [rubs, setRubs] = useState(0);
  const [rubbed, setRubbed] = useState<RubPair[]>([]);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        if (st.pair === 'glass-silk' || st.pair === 'pvc-wool') setPair(st.pair);
        if (typeof st.rubs === 'number') setRubs(Math.max(0, Math.min(MAX_RUBS, Math.round(st.rubs))));
      }),
    [props.id],
  );

  useEffect(() => {
    if (rubs > 0) setRubbed((r) => (r.includes(pair) ? r : [...r, pair]));
    if (props.tasks?.includes('rub-3') && rubs >= 3) markTask(`${props.id}:rub-3`);
  }, [rubs, pair, props.id, props.tasks]);
  useEffect(() => {
    if (props.tasks?.includes('both-pairs') && rubbed.length >= 2) markTask(`${props.id}:both-pairs`);
  }, [rubbed, props.id, props.tasks]);

  const [nA, nB] = counts(pair, rubs);
  const names = PAIRS[pair];

  const drawBody = (
    ctx: CanvasRenderingContext2D,
    f: ReturnType<typeof frameOf>,
    p: FrameInfo['palette'],
    x0: number,
    n: number,
    name: string,
  ) => {
    const top = 34;
    slab(ctx, f.X(x0), f.Y(top), 64 * f.u, 50 * f.u, p);
    const r = 3 * f.u;
    // lattice: fixed positive cores and the electrons between them
    const electronSlots: [number, number][] = [];
    for (let j = 0; j < COLS; j++) {
      const x = f.X(x0 + 4 + 7.4 * j);
      const y0 = f.Y(top + 9);
      const y1 = f.Y(top + 25);
      if (j % 2 === 0) {
        positive(ctx, x, y0, r, p);
        electronSlots.push([x, y1]);
      } else {
        electronSlots.push([x, y0]);
        positive(ctx, x, y1, r, p);
      }
    }
    // surplus electrons sit on the surface row
    for (let j = 0; j < COLS; j++) electronSlots.push([f.X(x0 + 4 + 7.4 * j), f.Y(top + 41)]);
    const present = COLS + n;
    electronSlots.forEach(([x, y], i) => {
      if (i < present) negative(ctx, x, y, r, p);
      else if (i < COLS) hole(ctx, x, y, r, p);
    });
    label(ctx, name, f.X(x0 + 32), f.Y(top - 8), p, { size: 14, color: p.ink });
    label(ctx, `Q = ${eText(chargeInE(n))}`, f.X(x0 + 32), f.Y(top + 62), p, { size: 15, color: p.ink, weight: 700 });
  };

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const f = frameOf(view);
    drawBody(ctx, f, p, 8, nA, names.nameA);
    drawBody(ctx, f, p, 88, nB, names.nameB);
    label(ctx, `Q₁ + Q₂ = ${eText(chargeInE(nA + nB))}`, f.X(80), f.Y(108), p, { size: 16, color: p.hand, weight: 700, hand: true });
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1.2, animate: false });
  useEffect(invalidate, [nA, nB, pair]);

  const rub = () => {
    if (rubs >= MAX_RUBS) return;
    const next = rubs + 1;
    setRubs(next);
    const [a, b] = counts(pair, next);
    setLive(`עבר עוד אלקטרון. ${names.nameA}: ${eText(chargeInE(a))}. ${names.nameB}: ${eText(chargeInE(b))}. סך הכול ${eText(chargeInE(a + b))}.`);
  };
  const reset = () => {
    setRubs(0);
    setLive('הגופים חזרו להיות ניטרליים.');
  };

  const qA = chargeOfElectrons(nA);
  const qB = chargeOfElectrons(nB);
  const row = (name: string, n: number, q: number) => (
    <span>
      {name}: <b class="q">Q = {eText(chargeInE(n))} = {minus(sci(q))} C</b>
    </span>
  );

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${names.nameA} ו${names.nameB} אחרי ${rubs} העברות של אלקטרון. ${names.nameA}: ${eText(chargeInE(nA))}. ${names.nameB}: ${eText(chargeInE(nB))}. סך המטען ${eText(chargeInE(nA + nB))}.`}
      canvasRef={canvasRef}
      aspect={160 / 120}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          {row(names.nameA, nA, qA)}
          {row(names.nameB, nB, qB)}
          <span>
            סך הכול: <b class="q">Q₁ + Q₂ = {sci(qA + qB)} C</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="צמד החומרים">
            {(Object.keys(PAIRS) as RubPair[]).map((k) => (
              <Toggle
                key={k}
                label={PAIRS[k].choice}
                on={pair === k}
                onChange={() => {
                  setPair(k);
                  setRubs(0);
                }}
              />
            ))}
          </div>
          <div class="group">
            <button type="button" class="toggle on" onClick={rub} disabled={rubs >= MAX_RUBS}>
              שפשפו: עוד אלקטרון עובר
            </button>
            <span class="hint">אלקטרונים שעברו: {rubs}</span>
          </div>
        </>
      }
    />
  );
}
