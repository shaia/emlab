/**
 * Wire lab: a uniform wire whose length, diameter and material the learner chooses, with its
 * resistance R = ρL/A from wireResistance (src/physics/circuits.ts). Built for lesson 3.3.
 *
 * The drawing is to scale in its own way: length on screen ∝ L, thickness on screen ∝ d. The
 * readout gives ρ, A and R, and the voltage the wire would take from 1 A, V = IR, so the learner
 * sees why copper leads count as equipotential beside a nichrome element.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { RESISTIVITY, roundArea, wireResistance, type Material } from '~/physics/circuits';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { withAlpha } from './core/ink';
import { sci } from './core/format';
import SimShell, { Slider, type TaskDef } from './core/SimShell';

const ASPECT = 2.4;

const MATERIAL_NAME: Record<Material, string> = {
  copper: 'נחושת',
  aluminium: 'אלומיניום',
  iron: 'ברזל',
  constantan: 'קונסטנטן',
  nichrome: 'ניכרום',
};

const TASK_LABEL: Record<string, string> = {
  'double-length': 'הכפילו את אורך התיל. פי כמה גדלה ההתנגדות?',
  'double-diameter': 'הכפילו את הקוטר של התיל. מה קרה להתנגדות?',
  material: 'החליפו את החומר לניכרום, באותו אורך ובאותו קוטר. פי כמה גדלה ההתנגדות?',
};

export interface WireLabProps {
  id: string;
  material?: Material;
  /** length [m] and diameter [mm] */
  L?: number;
  d?: number;
  tasks?: string[];
}

interface State {
  material: Material;
  L: number;
  d: number;
}

export default function WireLab(props: WireLabProps) {
  const init = (): State => ({ material: props.material ?? 'copper', L: props.L ?? 1, d: props.d ?? 0.5 });
  const [s, setS] = useState<State>(init);
  const [live, setLive] = useState('');
  const userActed = useRef(false);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));
  const rho = RESISTIVITY[s.material];
  const A = roundArea(s.d * 1e-3);
  const R = wireResistance(rho, s.L, A);

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        userActed.current = false;
        setS((prev) => ({
          material: typeof st.material === 'string' && st.material in RESISTIVITY ? (st.material as Material) : prev.material,
          L: typeof st.L === 'number' ? st.L : prev.L,
          d: typeof st.d === 'number' ? st.d : prev.d,
        }));
      }),
    [props.id],
  );

  const act = (patch: Partial<State>) => {
    userActed.current = true;
    setS((prev) => {
      const next = { ...prev, ...patch };
      const has = (t: string) => props.tasks?.includes(t);
      const done = (t: string) => markTask(`${props.id}:${t}`);
      if (has('double-length') && patch.L !== undefined && Math.abs(patch.L - 2 * prev.L) < 1e-9) done('double-length');
      if (has('double-diameter') && patch.d !== undefined && Math.abs(patch.d - 2 * prev.d) < 1e-9) done('double-diameter');
      if (has('material') && patch.material === 'nichrome' && prev.material !== 'nichrome') done('material');
      return next;
    });
  };

  useEffect(() => {
    if (!userActed.current) return;
    setLive(`תיל ${MATERIAL_NAME[s.material]}, ${s.L} מטר, קוטר ${s.d} מילימטר: התנגדות ${sci(R)} אוהם.`);
  }, [s]);

  const draw = ({ ctx, view, palette: p }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    const x0 = W * 0.06;
    const span = W * 0.88;
    const len = (s.L / 2) * span;
    const th = 6 + 30 * s.d;
    const cy = H * 0.46;
    ctx.save();
    // the wire, with a light shine along it
    const grad = ctx.createLinearGradient(0, cy - th / 2, 0, cy + th / 2);
    grad.addColorStop(0, withAlpha(p.ink2, 0.35));
    grad.addColorStop(0.35, withAlpha(p.ink3, 0.15));
    grad.addColorStop(1, withAlpha(p.ink2, 0.55));
    ctx.fillStyle = grad;
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x0, cy - th / 2, len, th, Math.min(th / 2, 8));
    ctx.fill();
    ctx.stroke();
    // a ruler under it, in 0.5 m steps
    ctx.strokeStyle = p.ink3;
    ctx.fillStyle = p.ink2;
    ctx.font = `11px ${p.fontUi}`;
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ry = cy + 24;
    ctx.beginPath();
    ctx.moveTo(x0, ry);
    ctx.lineTo(x0 + span, ry);
    ctx.stroke();
    for (let m = 0; m <= 2; m += 0.5) {
      const x = x0 + (m / 2) * span;
      ctx.beginPath();
      ctx.moveTo(x, ry - 4);
      ctx.lineTo(x, ry + 4);
      ctx.stroke();
      ctx.fillText(`${m} m`, x, ry + 7);
    }
    // the result, large, under the ruler
    ctx.fillStyle = p.ink;
    ctx.font = `700 18px ${p.fontUi}`;
    ctx.fillText(`R = ${sci(R)} Ω`, W / 2, H * 0.8);
    ctx.restore();
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: ASPECT, worldHeight: 1, animate: false });
  useEffect(invalidate, [s]);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: תיל ${MATERIAL_NAME[s.material]} באורך ${s.L} מטר ובקוטר ${s.d} מילימטר. ההתנגדות שלו ${sci(R)} אוהם.`}
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
            ההתנגדות הסגולית של {MATERIAL_NAME[s.material]}: <b class="q">ρ = {sci(rho)} Ω·m</b>
          </span>
          <span>
            שטח החתך: <b class="q">A = {sci(A)} m²</b>
          </span>
          <span>
            ההתנגדות: <b class="q">R = ρL/A = {sci(R)} Ω</b>; בזרם של אמפר אחד המתח עליו <b class="q">{sci(R)} V</b>
          </span>
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="החומר">
            {(Object.keys(RESISTIVITY) as Material[]).map((m) => (
              <button type="button" key={m} class={`toggle ${s.material === m ? 'on' : ''}`} aria-pressed={s.material === m} onClick={() => act({ material: m })}>
                {MATERIAL_NAME[m]}
              </button>
            ))}
          </div>
          <Slider label="האורך" value={s.L} min={0.25} max={2} step={0.25} format={(v) => `${v} m`} onChange={(v) => act({ L: v })} />
          <Slider label="הקוטר" value={s.d} min={0.2} max={1} step={0.1} format={(v) => `${sci(v)} mm`} onChange={(v) => act({ d: Math.round(v * 10) / 10 })} />
        </>
      }
    />
  );
}
