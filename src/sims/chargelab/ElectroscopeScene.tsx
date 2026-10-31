/**
 * Scene "electroscope": a charged rod, an electroscope and a ground wire. The student (or a
 * text step) brings the rod near, touches, grounds and removes it; `src/physics/charging.ts`
 * decides where the excess electrons are, and the leaves open by the charge ON THE LEAVES.
 *
 * Text steps drive it with `set={{ stage: 'ind-ground', rod: 8 }}`: a named stage runs a fixed
 * list of actions from a fresh electroscope, so a step always shows the same picture.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import {
  freshElectroscope,
  leafAngleDeg,
  run,
  step,
  zones,
  type Electroscope,
  type ElectroscopeAction,
} from '~/physics/charging';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from '../core/canvas';
import { withAlpha } from '../core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from '../core/SimShell';
import { chargeInE, eText, frameOf, glyphFor, label, roundRectPath, type Frame } from './draw';

/** Excess electrons on the rod (8 electrons: a negative rod) and the sign-flipped positive rod. */
const ROD = 8;

const approach = (prox: number): ElectroscopeAction => ({ type: 'approach', prox });
const TOUCH: ElectroscopeAction = { type: 'touch' };
const ground = (on: boolean): ElectroscopeAction => ({ type: 'ground', on });

/** Named stages: the actions that lead to each picture, from a fresh electroscope. */
export const STAGES: Record<string, (r: number) => ElectroscopeAction[]> = {
  start: () => [],
  near: () => [approach(1)],
  away: () => [approach(1), approach(0)],
  'contact-touch': () => [approach(1), TOUCH],
  'contact-away': () => [approach(1), TOUCH, approach(0)],
  'ind-near': () => [approach(1)],
  'ind-ground': () => [approach(1), ground(true)],
  'ind-unground': () => [approach(1), ground(true), ground(false)],
  'ind-away': () => [approach(1), ground(true), ground(false), approach(0)],
  'ind-wrong-order': () => [approach(1), ground(true), approach(0), ground(false)],
  // a rod of the same sign as the charged electroscope, and of the opposite sign
  'probe-same': (r) => [approach(1), TOUCH, approach(0), { type: 'rod', n: r }, approach(1)],
  'probe-opposite': (r) => [approach(1), TOUCH, approach(0), { type: 'rod', n: -r }, approach(1)],
};

function stageState(name: string, r: number): Electroscope {
  const make = STAGES[name];
  return run(freshElectroscope(r), make ? make(r) : []);
}

const PROX_NAMES = ['רחוק מאוד', 'רחוק', 'באמצע', 'קרוב', 'צמוד, בלי לגעת'];

const TASK_LABEL: Record<string, string> = {
  'neutral-diverge': 'קרבו מוט טעון אל אלקטרוסקופ ניטרלי, בלי לגעת. האם העלים נפתחים? ומה קורה כשמרחיקים את המוט?',
  'charge-contact': 'טענו את האלקטרוסקופ במגע, והרחיקו את המוט. איזה סימן יש עכשיו לאלקטרוסקופ?',
  'charge-induction': 'טענו את האלקטרוסקופ בהשראה: מוט קרוב, הארקה, ניתוק ההארקה, ורק אז הרחקת המוט. איזה סימן קיבלתם?',
};

const sign = (x: number) => Math.sign(x) || 0;

export default function ElectroscopeScene(props: { id: string; tasks?: string[] }) {
  const [s, setS] = useState<Electroscope>(() => freshElectroscope(ROD));
  const angle = useRef(0);
  const lastT = useRef(0);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const dispatch = (a: ElectroscopeAction, say?: string) => {
    setS((prev) => step(prev, a));
    if (say) setLive(say);
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        if (typeof st.stage === 'string') setS(stageState(st.stage, typeof st.rod === 'number' ? st.rod : ROD));
      }),
    [props.id],
  );

  const z = zones(s);
  const target = leafAngleDeg(z.leaves);

  useEffect(() => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const rodIntact = Math.abs(s.rodN) === ROD;
    if (has('neutral-diverge') && s.n === 0 && z.leaves !== 0 && rodIntact && s.prox >= 0.75) done('neutral-diverge');
    if (has('charge-contact') && s.prox === 0 && s.n !== 0 && sign(s.n) === sign(s.rodN) && !s.grounded && s.earth === 0)
      done('charge-contact');
    if (has('charge-induction') && s.prox === 0 && !s.grounded && s.n !== 0 && sign(s.n) === -sign(s.rodN) && rodIntact)
      done('charge-induction');
  }, [s, z.leaves, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const f: Frame = frameOf(view);
    const dt = Math.max(0, Math.min(0.05, t - lastT.current));
    lastT.current = t;
    if (!motionAllowed()) angle.current = target;
    else {
      const d = target - angle.current;
      const stepDeg = 140 * (dt || 0.016);
      angle.current = Math.abs(d) <= stepDeg ? target : angle.current + Math.sign(d) * stepDeg;
    }
    const half = (angle.current / 2) * (Math.PI / 180);
    const cx = 96;
    const R = 3.1 * f.u;

    // ground branch: wire from the knob to the Earth symbol, with a switch
    const wx = 140;
    ctx.save();
    ctx.strokeStyle = s.grounded ? p.ink : p.ink3;
    ctx.lineWidth = s.grounded ? 2.4 : 1.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(f.X(cx + 8), f.Y(26));
    ctx.lineTo(f.X(wx), f.Y(26));
    ctx.lineTo(f.X(wx), f.Y(54));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(f.X(wx), f.Y(s.grounded ? 54 : 56));
    ctx.lineTo(f.X(s.grounded ? wx : wx + 9), f.Y(s.grounded ? 72 : 66));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(f.X(wx), f.Y(72));
    ctx.lineTo(f.X(wx), f.Y(90));
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(f.X(wx - 9 + 3 * k), f.Y(90 + 5 * k));
      ctx.lineTo(f.X(wx + 9 - 3 * k), f.Y(90 + 5 * k));
      ctx.stroke();
    }
    ctx.restore();
    label(ctx, 'הארקה', f.X(wx), f.Y(112), p, { size: 13, color: s.grounded ? p.ink : p.ink2 });
    label(ctx, s.grounded ? 'מחוברת' : 'מנותקת', f.X(wx), f.Y(40), p, { size: 12, color: p.ink2 });

    // jar
    ctx.save();
    roundRectPath(ctx, f.X(70), f.Y(46), 52 * f.u, 62 * f.u, 7 * f.u);
    ctx.fillStyle = withAlpha(p.paper2, 0.7);
    ctx.fill();
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // stem, knob and leaves (metal): one conductor
    ctx.save();
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(f.X(cx), f.Y(33));
    ctx.lineTo(f.X(cx), f.Y(68));
    ctx.stroke();
    ctx.fillStyle = p.paper;
    ctx.beginPath();
    ctx.arc(f.X(cx), f.Y(26), 7.5 * f.u, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const leafLen = 28;
    const tips: [number, number][] = [];
    for (const sd of [-1, 1]) {
      const tx = cx + sd * leafLen * Math.sin(half);
      const ty = 68 + leafLen * Math.cos(half);
      tips.push([tx, ty]);
      ctx.strokeStyle = '#b8892b';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(f.X(cx), f.Y(68));
      ctx.lineTo(f.X(tx), f.Y(ty));
      ctx.stroke();
    }
    ctx.restore();
    label(ctx, 'עלים', f.X(cx), f.Y(114), p, { size: 12, color: p.ink2 });

    // excess charge on the knob end and on the leaves
    const knobSlots: [number, number][] = [38, 46, 54, 62].flatMap((y) => [
      [cx - 5.5, y] as [number, number],
      [cx + 5.5, y] as [number, number],
    ]);
    const knobCount = Math.min(Math.abs(z.knob), knobSlots.length);
    for (let k = 0; k < knobCount; k++) glyphFor(ctx, z.knob, f.X(knobSlots[k][0]), f.Y(knobSlots[k][1]), R, p);
    const leafCount = Math.min(Math.abs(z.leaves), 8);
    for (let k = 0; k < leafCount; k++) {
      const leaf = k % 2;
      const fr = 0.3 + 0.22 * Math.floor(k / 2);
      const [tx, ty] = tips[leaf];
      const gx = cx + (tx - cx) * fr;
      const gy = 68 + (ty - 68) * fr;
      glyphFor(ctx, z.leaves, f.X(gx + (leaf === 0 ? -5 : 5)), f.Y(gy), R, p);
    }

    // rod
    const tip = 50 + (cx - 8 - 50) * s.prox;
    const len = 42;
    ctx.save();
    ctx.fillStyle = p.paper2;
    ctx.strokeStyle = p.ink2;
    ctx.lineWidth = 1.6;
    roundRectPath(ctx, f.X(tip - len), f.Y(20), len * f.u, 12 * f.u, 5 * f.u);
    ctx.fill();
    ctx.stroke();
    // an insulating handle at the far end
    ctx.fillStyle = withAlpha(p.ink, 0.18);
    roundRectPath(ctx, f.X(tip - len), f.Y(20), 12 * f.u, 12 * f.u, 5 * f.u);
    ctx.fill();
    ctx.restore();
    const rodCount = Math.min(Math.abs(s.rodN), 8);
    for (let k = 0; k < rodCount; k++) {
      glyphFor(ctx, s.rodN, f.X(tip - 6 - 6.6 * Math.floor(k / 2)), f.Y(k % 2 === 0 ? 23 : 29), R, p);
    }
    if (s.rodN === 0) label(ctx, 'אין מוט', f.X(tip - len / 2), f.Y(26), p, { size: 12 });
    else label(ctx, 'מוט', f.X(tip - len / 2 - 6), f.Y(12), p, { size: 13, color: p.ink });
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1.2, animate: true });
  useEffect(invalidate, [s]);

  const rodKind = s.rodN > 0 ? 'neg' : s.rodN < 0 ? 'pos' : 'none';
  const proxIdx = Math.round(s.prox * 4);
  const spoken = `מטען כולל של האלקטרוסקופ ${eText(chargeInE(s.n))}. על העלים ${eText(chargeInE(z.leaves))}. העלים פתוחים ב-${target} מעלות.`;

  const setRod = (n: number) => dispatch({ type: 'rod', n }, n === 0 ? 'המוט הוסר.' : n > 0 ? 'מוט שלילי.' : 'מוט חיובי.');
  const touch = () => {
    setS((prev) => step(step(prev, approach(1)), TOUCH));
    setLive('המוט נגע בכדור.');
  };

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: אלקטרוסקופ ומוט. ${spoken} מוט: ${rodKind === 'none' ? 'אין' : rodKind === 'neg' ? 'שלילי' : 'חיובי'}, ${PROX_NAMES[proxIdx]}. הארקה ${s.grounded ? 'מחוברת' : 'מנותקת'}.`}
      canvasRef={canvasRef}
      aspect={160 / 120}
      live={live}
      tasks={tasks}
      onReset={() => {
        setS(freshElectroscope(ROD));
        setLive('האיור אופס.');
      }}
      readout={
        <>
          <span>
            מטען כולל של האלקטרוסקופ: <b class="q">Q = {eText(chargeInE(s.n))}</b>
          </span>
          <span>
            על העלים: <b class="q">{eText(chargeInE(z.leaves))}</b>
          </span>
          <span>
            פתיחת העלים: <b class="q">{target}°</b>
          </span>
          <span>
            המוט: <b class="q">Q = {eText(chargeInE(s.rodN))}</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="המוט">
            <Toggle label="מוט שלילי (−)" on={rodKind === 'neg'} onChange={() => setRod(ROD)} />
            <Toggle label="מוט חיובי (+)" on={rodKind === 'pos'} onChange={() => setRod(-ROD)} />
            <Toggle label="בלי מוט" on={rodKind === 'none'} onChange={() => setRod(0)} />
          </div>
          <Slider
            label="קרבת המוט"
            min={0}
            max={4}
            step={1}
            value={proxIdx}
            format={(v) => PROX_NAMES[v]}
            onChange={(v) => dispatch(approach(v / 4))}
          />
          <div class="group">
            <button type="button" class="toggle" onClick={touch} disabled={s.rodN === 0}>
              גע בכדור
            </button>
            <Toggle
              label="הארקה"
              on={s.grounded}
              onChange={(v) => dispatch(ground(v), v ? 'האלקטרוסקופ מוארק.' : 'ההארקה נותקה.')}
            />
            <span class="hint">
              אלקטרונים שעברו לאדמה (מספר שלילי: הגיעו ממנה): <span class="q">{s.earth}</span>
            </span>
          </div>
        </>
      }
    />
  );
}
