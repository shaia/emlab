/**
 * Millikan's oil drop: a charged drop between two horizontal plates. The student tunes the field
 * until the drop hovers (qE = mg), reads the charge off the balance, and collects several drops
 * to see that every charge is a whole multiple of e. Built for lesson 1.10.
 *
 * Air drag makes the drop move at a steady speed v = (qE − mg)/γ instead of accelerating, so
 * "hover" means zero net force and zero speed. Numbers come from src/physics/charge-in-field.ts.
 * The drop's counts of elementary charges are hidden from the student until the balance shows
 * q/e (rounded), which is the point of the experiment.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { E_CHARGE, G } from '~/physics/constants';
import {
  chargeFromBalance,
  dragCoefficient,
  driftSpeed,
  inUnitsOfE,
  isHovering,
  netForceUp,
} from '~/physics/charge-in-field';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { useFigureCanvas, type FrameInfo } from './core/canvas';
import { arrow, chargeDisc, withAlpha } from './core/ink';
import { sciFull as sci } from './core-sci';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

/** mass of every drop [kg], given to the student */
const DROP_MASS = 1.6e-15;
/** fall speed with no field [m/s]: sets the drag coefficient */
const FALL_SPEED = 1e-3;
/** half the gap between the plates [m] */
const HALF_GAP = 0.002;
const GAMMA = dragCoefficient(DROP_MASS, FALL_SPEED);
const WEIGHT = DROP_MASS * G;
const FIELD_MAX_KN = 120;
/** a hover is declared when the net force is within 1.5% of the weight: then |q/e − n| < 0.05 for every drop here */
const HOVER_TOL = 0.015;

export type DropId = 'a' | 'b' | 'c' | 'd';
/** number of elementary charges on each drop (negative charges): hidden from the student */
const DROPS: Record<DropId, { n: number; name: string }> = {
  a: { n: 3, name: 'טיפה א' },
  b: { n: 5, name: 'טיפה ב' },
  c: { n: 2, name: 'טיפה ג' },
  d: { n: 4, name: 'טיפה ד' },
};
const DROP_IDS = Object.keys(DROPS) as DropId[];
const chargeOf = (d: DropId) => -DROPS[d].n * E_CHARGE;

const TASK_LABEL: Record<string, string> = {
  'balance-one': 'כווננו את השדה עד שהטיפה מרחפת, ולחצו "רשמו מדידה".',
  'three-drops': 'מדדו שלוש טיפות שונות. מה משותף ליחסים ⁦q/e⁩ שקיבלתם?',
};

interface State {
  drop: DropId;
  /** field strength [N/C] */
  E: number;
  showForces: boolean;
  /** recorded measurements: q = mg/E, per drop */
  records: Partial<Record<DropId, number>>;
}

export interface OilDropProps {
  id: string;
  drop?: DropId;
  fieldKN?: number;
  showForces?: boolean;
  tasks?: string[];
}

function initial(p: OilDropProps): State {
  return { drop: p.drop ?? 'a', E: (p.fieldKN ?? 0) * 1000, showForces: p.showForces ?? true, records: {} };
}

export default function OilDrop(props: OilDropProps) {
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  /** the drop's height as a fraction of the half-gap: +1 at the top plate */
  const pos = useRef(0);
  const lastT = useRef(0);
  /** while t is below this, the figure says that a new drop has entered */
  const newUntil = useRef(0);
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        setS((prev) => {
          const next = { ...prev };
          if (typeof st.drop === 'string' && st.drop in DROPS) next.drop = st.drop as DropId;
          if (typeof st.fieldKN === 'number') next.E = Math.max(0, Math.min(FIELD_MAX_KN, Math.round(st.fieldKN))) * 1000;
          if (typeof st.showForces === 'boolean') next.showForces = st.showForces;
          return next;
        });
        pos.current = 0;
      }),
    [props.id],
  );

  const q = chargeOf(s.drop);
  const Ey = -s.E; // the top plate is positive: the field points down
  const net = netForceUp(q, DROP_MASS, Ey);
  const hovering = isHovering(q, DROP_MASS, Ey, HOVER_TOL);
  const speed = driftSpeed(q, DROP_MASS, Ey, GAMMA);

  useEffect(() => {
    const recorded = Object.keys(s.records).length;
    if (props.tasks?.includes('balance-one') && recorded >= 1) markTask(`${props.id}:balance-one`);
    if (props.tasks?.includes('three-drops') && recorded >= 3) markTask(`${props.id}:three-drops`);
  }, [s.records, props.id, props.tasks]);

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const W = view.w;
    const H = view.h;
    // the drop moves only while motion is allowed (t is frozen otherwise)
    const dt = t - lastT.current;
    lastT.current = t;
    if (dt > 0) {
      pos.current += (speed / HALF_GAP) * dt;
      if (Math.abs(pos.current) >= 1) {
        // the drop hit a plate and is gone: a new drop of the same kind enters from the opposite plate
        pos.current = pos.current > 0 ? -0.92 : 0.92;
        newUntil.current = t + 3;
      }
    }
    const plateH = 16;
    const topY = 30;
    const botY = H - 30;
    const midY = (topY + botY) / 2;
    const halfPx = (botY - topY - plateH) / 2;
    const cx = W / 2;

    // plates
    const plate = (y: number, positive: boolean) => {
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.28);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(W * 0.12, y - plateH / 2, W * 0.76, plateH);
      ctx.fill();
      ctx.stroke();
      ctx.font = `700 15px ${p.fontUi}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = positive ? p.pos : p.neg;
      for (let i = 0; i < 9; i++) ctx.fillText(positive ? '+' : '−', W * 0.12 + ((i + 0.5) * W * 0.76) / 9, y);
      ctx.restore();
    };
    plate(topY, true);
    plate(botY, false);

    // field arrows (E points down, from + to −)
    if (s.E > 0) {
      const len = 14 + (s.E / (FIELD_MAX_KN * 1000)) * 40;
      for (const f of [0.2, 0.34, 0.66, 0.8]) {
        const x = W * f;
        arrow(ctx, x, midY - len / 2, x, midY + len / 2, { color: p.efield, width: 1.8, head: 7, alpha: 0.7 });
      }
    }

    // the drop
    const dy = midY - pos.current * halfPx;
    const r = 10;
    if (hovering) {
      ctx.save();
      ctx.strokeStyle = p.force;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, dy, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    chargeDisc(ctx, cx, dy, r, q, p, {});
    if (t < newUntil.current) {
      ctx.save();
      ctx.font = `600 13px ${p.fontUi}`;
      ctx.fillStyle = p.ink2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'rtl';
      ctx.fillText('טיפה חדשה מאותו סוג', cx, dy + (dy > midY ? -(r + 18) : r + 18));
      ctx.restore();
    }

    if (s.showForces) {
      const wPx = 52;
      const qePx = Math.min(halfPx * 0.9, wPx * Math.abs(q * Ey) / WEIGHT);
      // weight down (left of the drop), electric force up (right of the drop)
      const lx = cx - r - 12;
      const rx = cx + r + 12;
      arrow(ctx, lx, dy, lx, dy + wPx, { color: p.force, width: 2.6, head: 10 });
      if (qePx > 1) arrow(ctx, rx, dy, rx, dy - qePx, { color: p.force, width: 2.6, head: 10 });
      ctx.save();
      ctx.font = `italic 700 15px ${p.fontUi}`;
      ctx.fillStyle = p.force;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('mg', lx - 18, dy + wPx / 2);
      if (qePx > 14) ctx.fillText('qE', rx + 18, dy - qePx / 2);
      ctx.restore();
    }
  };

  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: 1.6, worldHeight: 1.2, animate: true });
  useEffect(invalidate, [s]);

  useEffect(() => {
    const id = setTimeout(() => {
      setLive(
        hovering
          ? `${DROPS[s.drop].name} מרחפת.`
          : net > 0
            ? `${DROPS[s.drop].name} עולה, כי כוח השדה גדול ממשקלה.`
            : `${DROPS[s.drop].name} יורדת, כי המשקל גדול מכוח השדה.`,
      );
    }, 400);
    return () => clearTimeout(id);
  }, [s.drop, s.E]);

  const reset = () => {
    pos.current = 0;
    setS(initial(props));
    setLive('האיור אופס.');
  };

  const record = () => {
    if (!hovering || s.E === 0) return;
    const qm = chargeFromBalance(DROP_MASS, s.E);
    setS((prev) => ({ ...prev, records: { ...prev.records, [prev.drop]: qm } }));
    setLive(`נרשמה מדידה של ${DROPS[s.drop].name}.`);
  };

  const status = hovering
    ? 'הטיפה מרחפת: כוח השדה שווה למשקל'
    : net > 0
      ? 'הטיפה עולה: כוח השדה גדול מהמשקל'
      : 'הטיפה יורדת: המשקל גדול מכוח השדה';
  const recordedIds = DROP_IDS.filter((d) => s.records[d] !== undefined);

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${DROPS[s.drop].name} בין שני לוחות אופקיים, העליון חיובי. שדה ${sci(s.E)} ניוטון לקולון. ${status}.`}
      canvasRef={canvasRef}
      aspect={1.6 / 1.2}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span>
            משקל: <b class="q">mg = {sci(WEIGHT)} N</b>
          </span>
          <span>
            כוח השדה: <b class="q">qE = {sci(Math.abs(q) * s.E)} N</b>
          </span>
          <span>
            <b>{status}</b>
          </span>
          {hovering && s.E > 0 && (
            <span>
              <b class="q">q = mg/E = {sci(chargeFromBalance(DROP_MASS, s.E))} C</b>, כלומר <b class="q">q/e ≈ {inUnitsOfE(chargeFromBalance(DROP_MASS, s.E)).toFixed(1)}</b>
            </span>
          )}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="הטיפה">
            {DROP_IDS.map((d) => (
              <Toggle
                key={d}
                label={DROPS[d].name}
                on={s.drop === d}
                onChange={() => {
                  pos.current = 0;
                  setS((prev) => ({ ...prev, drop: d }));
                }}
              />
            ))}
            <Toggle label="חיצי כוחות" on={s.showForces} onChange={(on) => setS((prev) => ({ ...prev, showForces: on }))} />
          </div>
          <Slider
            label="עוצמת השדה E"
            min={0}
            max={FIELD_MAX_KN}
            step={1}
            value={s.E / 1000}
            format={(v) => `${sci(v * 1000)} N/C`}
            onChange={(v) => {
              setS((prev) => ({ ...prev, E: v * 1000 }));
            }}
          />
          <div class="group">
            <button type="button" class="toggle" onClick={record} disabled={!hovering || s.E === 0} aria-label="רשמו מדידה">
              רשמו מדידה
            </button>
            <button
              type="button"
              class="toggle"
              onClick={() => {
                pos.current = 0;
                setS((prev) => ({ ...prev, records: {} }));
              }}
              disabled={recordedIds.length === 0}
            >
              נקו את הרשימה
            </button>
          </div>
          {recordedIds.length > 0 && (
            <ul class="sim-readout" style={{ listStyle: 'none', margin: 0 }} aria-label="המדידות שנרשמו">
              {recordedIds.map((d) => (
                <li key={d}>
                  {DROPS[d].name}: <span class="q">q = {sci(s.records[d]!)} C = {inUnitsOfE(s.records[d]!).toFixed(1)}·e</span>
                </li>
              ))}
            </ul>
          )}
        </>
      }
    />
  );
}
