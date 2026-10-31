/**
 * Scene "materials": the same extra electrons are put on a metal bar and on a plastic bar.
 * In the conductor they repel and spread out along the whole bar; in the insulator they stay
 * where they were put. Only the EXCESS electrons are drawn. Counts are toy numbers.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { distributeCharge, type BodyKind } from '~/physics/charging';
import { motionAllowed } from '~/progress/settings';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from '../core/canvas';
import { mix } from '../core/ink';
import SimShell, { type TaskDef } from '../core/SimShell';
import { eText, frameOf, label, negative, slab } from './draw';

const SITES = 6;
const SITE_W = 22;
const BAR_X = 14;
const BAR_H = 30;
const MAX_TOTAL = 12;
const BARS: { kind: BodyKind; y: number; name: string }[] = [
  { kind: 'conductor', y: 16, name: 'מוליך: מוט מתכת' },
  { kind: 'insulator', y: 76, name: 'מבודד: מוט פלסטיק' },
];

const TASK_LABEL: Record<string, string> = {
  'load-both': 'הניחו אלקטרונים באותו מקטע של שני המוטות, והשוו לאן הם מתפשטים.',
};

interface Token {
  x: number;
  y: number;
}

const siteCenterX = (s: number) => BAR_X + SITE_W * (s + 0.5);

/** Position of the k-th electron inside site s of a bar whose top edge is at y0. */
function slot(s: number, k: number, y0: number): Token {
  const col = k % 3;
  const row = Math.floor(k / 3);
  return { x: siteCenterX(s) + (col - 1) * 6.6, y: y0 + BAR_H / 2 + (row - 1.5) * 6.6 };
}

const empty = (): number[] => new Array(SITES).fill(0);

export default function MaterialsScene(props: { id: string; tasks?: string[] }) {
  const [dep, setDep] = useState<number[][]>([empty(), empty()]);
  const tokens = useRef<Token[][]>([[], []]);
  /** electrons the student put on each bar; a text step's `load` does not count for the task */
  const [byStudent, setByStudent] = useState<number[]>([0, 0]);
  const lastT = useRef(0);
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  const total = (i: number) => dep[i].reduce((a, b) => a + b, 0);

  /** Put `k` electrons on site `s` of bar `i`; the new tokens appear there. */
  const add = (i: number, s: number, k: number) => {
    const room = MAX_TOTAL - total(i);
    const put = Math.min(k, room);
    if (put <= 0) return;
    setDep((prev) => prev.map((d, j) => (j === i ? d.map((x, q) => (q === s ? x + put : x)) : d)));
    setByStudent((prev) => prev.map((x, j) => (j === i ? x + put : x)));
    for (let m = 0; m < put; m++) tokens.current[i].push(slot(s, tokens.current[i].length % 12, BARS[i].y));
  };
  const addBoth = (s: number, k: number) => {
    // read the state through the refs: two calls in one handler must not see stale props
    add(0, s, k);
    add(1, s, k);
    setLive(`הונחו ${k} אלקטרונים במקטע ${s + 1} משמאל בשני המוטות.`);
  };
  const reset = () => {
    setDep([empty(), empty()]);
    tokens.current = [[], []];
    setLive('המוטות חזרו להיות ניטרליים.');
  };

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        if (st.reset === true) {
          setDep([empty(), empty()]);
          tokens.current = [[], []];
        }
        if (typeof st.load === 'number') {
          // a scripted state: `load` electrons on site 0 of both bars
          setDep(() => {
            const d = [empty(), empty()];
            d[0][0] = d[1][0] = st.load as number;
            return d;
          });
          tokens.current = [0, 1].map((i) => Array.from({ length: st.load as number }, (_, k) => slot(0, k, BARS[i].y)));
        }
      }),
    [props.id],
  );

  useEffect(() => {
    if (props.tasks?.includes('load-both') && byStudent[0] >= 6 && byStudent[1] >= 6) markTask(`${props.id}:load-both`);
  }, [byStudent, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const f = frameOf(view);
    const dt = Math.max(0, Math.min(0.05, t - lastT.current));
    lastT.current = t;
    const moving = motionAllowed();
    BARS.forEach((bar, i) => {
      slab(ctx, f.X(BAR_X), f.Y(bar.y), SITE_W * SITES * f.u, BAR_H * f.u, p, {
        fill: bar.kind === 'conductor' ? mix(p.paper2, p.ink, 0.14) : p.paper2,
        dash: bar.kind === 'insulator',
      });
      // site separators
      ctx.save();
      ctx.strokeStyle = p.ink3;
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      for (let s = 1; s < SITES; s++) {
        ctx.beginPath();
        ctx.moveTo(f.X(BAR_X + SITE_W * s), f.Y(bar.y + 3));
        ctx.lineTo(f.X(BAR_X + SITE_W * s), f.Y(bar.y + BAR_H - 3));
        ctx.stroke();
      }
      ctx.restore();
      label(ctx, bar.name, f.X(BAR_X + (SITE_W * SITES) / 2), f.Y(bar.y - 7), p, { size: 14, color: p.ink });

      // targets: tokens sorted by x are matched to target slots sorted by x
      const dist = distributeCharge(bar.kind, dep[i]);
      const targets: Token[] = [];
      dist.forEach((c, s) => {
        for (let k = 0; k < c; k++) targets.push(slot(s, k, bar.y));
      });
      targets.sort((a, b) => a.x - b.x || a.y - b.y);
      const toks = tokens.current[i];
      toks.sort((a, b) => a.x - b.x || a.y - b.y);
      toks.forEach((tk, k) => {
        const tg = targets[k];
        if (!tg) return;
        if (!moving) {
          tk.x = tg.x;
          tk.y = tg.y;
        } else {
          const dx = tg.x - tk.x;
          const dy = tg.y - tk.y;
          const d = Math.hypot(dx, dy);
          const stepLen = 90 * (dt || 0.016);
          if (d <= stepLen) {
            tk.x = tg.x;
            tk.y = tg.y;
          } else {
            tk.x += (dx / d) * stepLen;
            tk.y += (dy / d) * stepLen;
          }
        }
        negative(ctx, f.X(tk.x), f.Y(tk.y), 3.1 * f.u, p);
      });
      label(ctx, `q = ${eText(-total(i))}`, f.X(BAR_X + (SITE_W * SITES) / 2), f.Y(bar.y + BAR_H + 9), p, {
        size: 15,
        color: p.hand,
        weight: 700,
        hand: true,
      });
    });
  };

  const { canvasRef, invalidate, viewRef } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1.2, animate: true });
  useEffect(invalidate, [dep]);

  const onPointerDown = (e: PointerEvent) => {
    const v = viewRef.current;
    if (!v) return;
    const f = frameOf(v);
    const x = (e.offsetX - v.w / 2) / f.u + 80;
    const y = (e.offsetY - v.h / 2) / f.u + 60;
    const i = BARS.findIndex((b) => y >= b.y - 4 && y <= b.y + BAR_H + 4);
    const s = Math.floor((x - BAR_X) / SITE_W);
    if (i < 0 || s < 0 || s >= SITES) return;
    add(i, s, 3);
    setLive(`הונחו 3 אלקטרונים על ${BARS[i].name}, במקטע ${s + 1} משמאל.`);
  };

  const spread = (i: number) => distributeCharge(BARS[i].kind, dep[i]).join(' · ');

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: מוט מתכת ומוט פלסטיק. אלקטרונים עודפים במוליך: ${spread(0)} בכל מקטע. במבודד: ${spread(1)}. לחצו על מקטע כדי להניח עליו אלקטרונים.`}
      canvasRef={canvasRef}
      aspect={160 / 120}
      live={live}
      tasks={tasks}
      onReset={reset}
      onPointerDown={onPointerDown}
      cursor="pointer"
      readout={
        <>
          <span>
            מוליך, בכל מקטע: <b class="q">{spread(0)}</b>
          </span>
          <span>
            מבודד, בכל מקטע: <b class="q">{spread(1)}</b>
          </span>
        </>
      }
      controls={
        <div class="group">
          <button type="button" class="toggle on" onClick={() => addBoth(0, 6)} disabled={total(0) + 6 > MAX_TOTAL}>
            הניחו 6 אלקטרונים במקטע השמאלי של שני המוטות
          </button>
          <span class="hint">אפשר גם ללחוץ על מקטע באיור: מוסיף 3 אלקטרונים.</span>
        </div>
      }
    />
  );
}
