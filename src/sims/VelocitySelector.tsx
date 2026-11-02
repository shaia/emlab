/**
 * Velocity selector (and the Bainbridge spectrometer): ions fired to the right between two charged
 * plates, with an electric field E between them and a magnetic field B ⊗ over the same region. Only
 * the speed v = E/B goes straight through the exit slit. With `stage2`, the ions that pass enter a
 * second field B′ ⊗, turn a half circle and land on a detector beside the slit. Built for lesson 4.6.
 *
 * Every path is integrated by traceSelector (src/physics/crossed-fields.ts, Boris push); the readouts
 * come from selectorSpeed, bainbridgeRadius and the force functions, never from the drawing.
 * Ions only: an electron in these fields would gyrate with a micrometre amplitude (see the model
 * specification), so the classroom picture would be wrong for it.
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import { E_CHARGE, M_ELECTRON, M_PROTON } from '~/physics/constants';
import {
  bainbridgeRadius,
  electricForceY,
  magneticForceY,
  traceSelector,
  type SelectorGeometry,
  type SelectorPath,
} from '~/physics/crossed-fields';
import { selectorSpeed } from '~/physics/magnetism';
import { markTask } from '~/progress/store';
import { subscribeSteps } from '~/ui/steps';
import { toScreen, useFigureCanvas, type FrameInfo } from './core/canvas';
import { sci } from './core/format';
import { arrow, chargeDisc, depthField, paperGrid, polyline, withAlpha } from './core/ink';
import SimShell, { Slider, Toggle, type TaskDef } from './core/SimShell';

export type Species = 'p' | 'd' | 'alpha' | 'hminus';

const SPECIES: Record<Species, { q: number; m: number; name: string; short: string; dash?: number[] }> = {
  p: { q: E_CHARGE, m: M_PROTON, name: 'פרוטון', short: 'p' },
  d: { q: E_CHARGE, m: 2 * M_PROTON, name: 'דאוטרון', short: 'd', dash: [7, 4] },
  alpha: { q: 2 * E_CHARGE, m: 4 * M_PROTON, name: 'חלקיק אלפא', short: 'α', dash: [2, 4] },
  hminus: { q: -E_CHARGE, m: M_PROTON + 2 * M_ELECTRON, name: 'יון מימן שלילי', short: 'H⁻' },
};
const ORDER: Species[] = ['p', 'd', 'alpha', 'hminus'];

/** slider stops: E in V/m, B and B′ in T, v in m/s (chosen so the selector never refocuses a wrong speed) */
const E_LIST = [3, 4, 5, 6, 7, 8, 9, 10].map((k) => k * 1e4);
const B_LIST = [0.05, 0.08, 0.1];
const B2_LIST = [0.2, 0.3, 0.4, 0.5];
const V_LIST = Array.from({ length: 17 }, (_, i) => (2 + i * 0.5) * 1e5);
/** the speeds in a mixed beam */
const BEAM = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => k * 1e5);

const L = 0.1;
const H = 0.015;
const PLATE_T = 0.003;
const SLIT_X = 0.11;
const SLIT_HALF = 0.0015;
const SOURCE_X = -0.025;

function geometry(stage2: boolean): SelectorGeometry & { world: { x0: number; y0: number; w: number; h: number } } {
  const box = stage2 ? { xMin: -0.035, xMax: 0.26, yMin: -0.13, yMax: 0.13 } : { xMin: -0.035, xMax: 0.125, yMin: -0.045, yMax: 0.045 };
  return {
    plateLength: L,
    halfGap: H,
    slitX: SLIT_X,
    slitHalf: SLIT_HALF,
    sourceX: SOURCE_X,
    box,
    world: { x0: (box.xMin + box.xMax) / 2, y0: 0, w: box.xMax - box.xMin, h: stage2 ? 0.26 : 0.09 },
  };
}

const TASK_LABEL: Record<string, string> = {
  'balance-new': 'שנו את E או את B, ומצאו מהירות שעוברת שוב ישר בסדק.',
  'other-ion': 'כשהפרוטון עובר ישר, החליפו לחלקיק אחר (אלפא או יון שלילי) בלי לשנות שום דבר אחר. האם הוא עובר?',
  'too-fast': 'הגדילו את המהירות מעל E/B. לאיזה צד נוטה המסלול: לצד של הכוח החשמלי או של הכוח המגנטי?',
  'two-spots': 'שלחו שני סוגי יונים לפחות, וראו כל אחד פוגע בגלאי במקום אחר.',
  'alpha-d': 'הוסיפו חלקיקי אלפא לדאוטרונים. איפה הם פוגעים, ולמה?',
  'change-b2': 'שנו את B′. איך זזים הכתמים על הגלאי?',
};

interface State {
  species: Species[];
  E: number;
  B: number;
  v: number;
  B2: number;
  eOn: boolean;
  bOn: boolean;
  /** the top plate is negative: E points up */
  flip: boolean;
  beam: boolean;
}

export interface VelocitySelectorProps {
  id: string;
  /** add the second field and the detector (Bainbridge spectrometer) */
  stage2?: boolean;
  species?: Species[];
  /** V/m */
  E?: number;
  /** T */
  B?: number;
  /** m/s */
  v?: number;
  /** T */
  B2?: number;
  beam?: boolean;
  tasks?: string[];
}

const nearest = (list: number[], x: number) => list.reduce((b, s) => (Math.abs(s - x) < Math.abs(b - x) ? s : b), list[0]);

function initial(p: VelocitySelectorProps): State {
  return {
    species: p.species?.length ? p.species : p.stage2 ? ['p', 'd'] : ['p'],
    E: nearest(E_LIST, p.E ?? 5e4),
    B: nearest(B_LIST, p.B ?? 0.1),
    v: nearest(V_LIST, p.v ?? 5e5),
    B2: nearest(B2_LIST, p.B2 ?? 0.2),
    eOn: true,
    bOn: true,
    flip: false,
    beam: p.beam ?? !!p.stage2,
  };
}

interface Trace {
  sp: Species;
  v: number;
  path: SelectorPath;
}

function solve(s: State, stage2: boolean) {
  const geo = geometry(stage2);
  const Ey = s.eOn ? (s.flip ? s.E : -s.E) : 0;
  const Bz = s.bOn ? -s.B : 0;
  const fields = { Ey, Bz, B2z: stage2 ? -s.B2 : null };
  const speeds = s.beam ? BEAM : [s.v];
  const traces: Trace[] = [];
  for (const sp of s.species) {
    const { q, m } = SPECIES[sp];
    for (const v of speeds) traces.push({ sp, v, path: traceSelector(q, m, v, geo, fields, stage2 ? 3e-4 : 2e-4) });
  }
  const vSel = selectorSpeed(s.E, s.B);
  return { geo, Ey, Bz, traces, vSel };
}

/** where on the wall, relative to the slit */
const slitSideHe = (y: number) => (y > 0 ? 'מעל הסדק' : 'מתחת לסדק');

export default function VelocitySelector(props: VelocitySelectorProps) {
  const stage2 = !!props.stage2;
  const [s, setS] = useState<State>(() => initial(props));
  const [live, setLive] = useState('');
  const tasks: TaskDef[] = (props.tasks ?? []).map((id) => ({ id, label: TASK_LABEL[id] ?? id }));

  useEffect(
    () =>
      subscribeSteps(props.id, (st) => {
        // a step describes the figure relative to its starting state, so steps never depend on order
        setS(() => {
          const next = initial(props);
          if (Array.isArray(st.species)) next.species = (st.species as string[]).filter((k): k is Species => k in SPECIES);
          else if (typeof st.species === 'string' && st.species in SPECIES) next.species = [st.species as Species];
          if (typeof st.E === 'number') next.E = nearest(E_LIST, st.E);
          if (typeof st.B === 'number') next.B = nearest(B_LIST, st.B);
          if (typeof st.v === 'number') next.v = nearest(V_LIST, st.v);
          if (typeof st.B2 === 'number') next.B2 = nearest(B2_LIST, st.B2);
          for (const k of ['eOn', 'bOn', 'flip', 'beam'] as const) if (typeof st[k] === 'boolean') next[k] = st[k] as boolean;
          if (next.species.length === 0) next.species = ['p'];
          return next;
        });
      }),
    [props.id],
  );

  const sol = useMemo(() => solve(s, stage2), [s, stage2]);

  /** Tasks tick only when the student changes a control: steps in the text never complete them. */
  const checkTasks = (next: State) => {
    const has = (t: string) => props.tasks?.includes(t);
    const done = (t: string) => markTask(`${props.id}:${t}`);
    const { traces, vSel } = solve(next, stage2);
    const normal = next.eOn && next.bOn && !next.flip;
    const first = traces[0];
    const start = initial(props);
    if (has('balance-new') && normal && !next.beam && first?.path.passed && (next.E !== start.E || next.B !== start.B)) done('balance-new');
    if (has('other-ion') && normal && !next.beam && next.species[0] !== 'p' && first?.path.passed) done('other-ion');
    if (has('too-fast') && normal && !next.beam && next.v > 1.05 * vSel && first && !first.path.passed) done('too-fast');
    const landed = traces.filter((t) => t.path.outcome === 'detector');
    const spotsBy = new Set(landed.map((t) => t.sp));
    if (has('two-spots') && spotsBy.size >= 2) done('two-spots');
    if (has('alpha-d') && spotsBy.has('alpha') && spotsBy.has('d')) done('alpha-d');
    if (has('change-b2') && next.B2 !== start.B2 && landed.length > 0) done('change-b2');
  };

  const change = (next: Partial<State>) => {
    const merged = { ...s, ...next };
    setS(merged);
    checkTasks(merged);
  };

  const toggleSpecies = (k: Species) => {
    if (!stage2) return change({ species: [k] });
    const on = s.species.includes(k);
    const list = on ? s.species.filter((x) => x !== k) : ORDER.filter((x) => x === k || s.species.includes(x));
    if (list.length > 0) change({ species: list });
  };

  /* ---------------------------------------------------------------- description */

  const outcomeOf = (t: Trace): string => {
    const p = t.path;
    if (p.outcome === 'plate') return `פוגע בלוח ה${p.end[1] > 0 ? 'עליון' : 'תחתון'}`;
    if (p.outcome === 'wall') return `נעצר בדופן, ${slitSideHe(p.end[1])}`;
    if (p.outcome === 'detector') return `פוגע בגלאי ${sci(Math.abs(p.end[1]) * 100)} ס"מ ${slitSideHe(p.end[1])}`;
    if (p.passed) return stage2 ? 'עובר בסדק ויוצא מהאיור' : 'עובר ישר בסדק';
    return 'יוצא מהאיור';
  };

  const describe = () => {
    const passing = sol.traces.filter((t) => t.path.passed);
    if (!s.beam) {
      const t = sol.traces[0];
      return `${SPECIES[t.sp].name} במהירות ${sci(t.v)} מטר לשנייה: ${outcomeOf(t)}.`;
    }
    if (passing.length === 0) return 'אף מהירות בקרן לא עוברת בסדק.';
    const speeds = [...new Set(passing.map((t) => t.v))];
    return `בסדק עוברים רק יונים במהירות ${speeds.map((v) => sci(v)).join(', ')} מטר לשנייה.${stage2 ? ' ' + passing.map((t) => `${SPECIES[t.sp].name}: ${outcomeOf(t)}`).join('; ') + '.' : ''}`;
  };

  useEffect(() => {
    const id = setTimeout(() => setLive(describe()), 400);
    return () => clearTimeout(id);
  }, [s]);

  /* ---------------------------------------------------------------- drawing */

  const draw = ({ ctx, view, palette: p, t }: FrameInfo) => {
    const { geo, Ey, traces } = sol;
    const W = geo.world;
    const P = (x: number, y: number) => toScreen(view, x - W.x0, y - W.y0);
    const px = (m: number) => m * view.ppm;
    paperGrid(ctx, view, p, stage2 ? 0.02 : 0.01);

    // the axis the ions would follow with no field
    {
      const [ax, ay] = P(geo.sourceX, 0);
      const [bx] = P(geo.box.xMax, 0);
      polyline(ctx, [[ax, ay], [bx, ay]], p.ink3, 1, { dash: [4, 5], alpha: 0.5 });
    }

    // magnetic field regions (⊗)
    if (s.bOn) {
      const [x1, y1] = P(0, H);
      const [x2, y2] = P(L, -H);
      depthField(ctx, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, 'in', p.bfield, stage2 ? 16 : 22, 0.5);
    }
    if (stage2) {
      const [x1, y1] = P(SLIT_X + 0.004, geo.box.yMax);
      const [x2, y2] = P(geo.box.xMax, geo.box.yMin);
      ctx.save();
      ctx.fillStyle = withAlpha(p.bfield, 0.05);
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.restore();
      depthField(ctx, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, 'in', p.bfield, 30, 0.45);
      ctx.save();
      ctx.font = `italic 700 ${stage2 ? 14 : 15}px ${p.fontUi}`;
      ctx.fillStyle = p.bfield;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('B′ ⊗', x2 - 8, y2 - 8);
      ctx.restore();
    }

    // plates, with their polarity
    const topPositive = !s.flip;
    const plate = (yEdge: number, sign: number, up: boolean) => {
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
      if (s.eOn) {
        ctx.font = `700 ${stage2 ? 10 : 12}px ${p.fontUi}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = sign > 0 ? p.pos : p.neg;
        const yy = (y1 + y2) / 2;
        for (let i = 0; i < 8; i++) ctx.fillText(sign > 0 ? '+' : '−', x1 + ((i + 0.5) * (x2 - x1)) / 8, yy);
      }
      ctx.restore();
    };
    plate(H, topPositive ? 1 : -1, true);
    plate(-H, topPositive ? -1 : 1, false);

    // the electric field between the plates
    if (s.eOn) {
      const len = Math.min(px(2 * H) * 0.7, 10 + (s.E / 1e5) * 22);
      const down = Ey < 0;
      for (const x of [0.01, 0.03, 0.05, 0.07, 0.09]) {
        const [sx, sy] = P(x, 0);
        const d = down ? len : -len;
        arrow(ctx, sx, sy - d / 2, sx, sy + d / 2, { color: p.efield, width: 1.8, head: 7, alpha: 0.7 });
      }
    }

    // labels for the fields, above the top plate
    {
      const [lx, ly] = P(0.0, H + PLATE_T);
      ctx.save();
      ctx.font = `italic 700 ${stage2 ? 13 : 14}px ${p.fontUi}`;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      let x = lx;
      if (s.eOn) {
        ctx.fillStyle = p.efield;
        ctx.fillText(Ey < 0 ? 'E ↓' : 'E ↑', x, ly - 4);
        x += 44;
      }
      if (s.bOn) {
        ctx.fillStyle = p.bfield;
        ctx.fillText('B ⊗', x, ly - 4);
      }
      ctx.restore();
    }

    // the wall with the exit slit (the detector in the second stage)
    {
      const wallW = Math.max(3, px(0.0025));
      const [wx, wTop] = P(SLIT_X, geo.box.yMax);
      const [, sTop] = P(SLIT_X, SLIT_HALF);
      const [, sBot] = P(SLIT_X, -SLIT_HALF);
      const [, wBot] = P(SLIT_X, geo.box.yMin);
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.4);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(wx - wallW / 2, wTop, wallW, sTop - wTop);
      ctx.rect(wx - wallW / 2, sBot, wallW, wBot - sBot);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (stage2) {
        // a centimetre scale on the detector, measured from the slit
        ctx.save();
        ctx.strokeStyle = p.ink2;
        ctx.fillStyle = p.ink2;
        ctx.font = `11px ${p.fontUi}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 1;
        for (let cm = -12; cm <= 12; cm++) {
          if (cm === 0) continue;
          const [, ty] = P(SLIT_X, cm / 100);
          const major = cm % 2 === 0;
          ctx.beginPath();
          ctx.moveTo(wx + wallW / 2, ty);
          ctx.lineTo(wx + wallW / 2 + (major ? 6 : 3), ty);
          ctx.stroke();
          if (major) ctx.fillText(String(Math.abs(cm)), wx + wallW / 2 + 8, ty);
        }
        // the unit sits left of the wall, clear of the tick labels
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const [, yUnit] = P(SLIT_X, 0.12);
        ctx.fillText('ס"מ', wx - wallW - 6, yUnit);
        ctx.restore();
      }
    }

    // the source
    {
      const [gx, gy] = P(geo.sourceX - 0.008, 0);
      const [gx2] = P(geo.sourceX, 0);
      ctx.save();
      ctx.fillStyle = withAlpha(p.equip, 0.28);
      ctx.strokeStyle = p.equip;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(gx, gy - px(0.006), gx2 - gx, px(0.012));
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // paths: blocked ones faint, passing ones bold
    const color = (sp: Species) => (SPECIES[sp].q < 0 ? p.neg : p.pos);
    for (const tr of traces) {
      const pts = tr.path.points.map(([x, y]) => P(x, y));
      const strong = tr.path.passed || !s.beam;
      polyline(ctx, pts, color(tr.sp), strong ? 2.4 : 1.4, {
        alpha: strong ? 0.95 : 0.4,
        dash: SPECIES[tr.sp].dash,
        glow: strong ? withAlpha(color(tr.sp), 0.5) : undefined,
      });
      const [ex, ey] = P(tr.path.end[0], tr.path.end[1]);
      if (tr.path.outcome === 'plate' || tr.path.outcome === 'wall') {
        ctx.save();
        ctx.globalAlpha = strong ? 1 : 0.5;
        polyline(ctx, [[ex - 4, ey - 4], [ex + 4, ey + 4]], p.ink, 1.8);
        polyline(ctx, [[ex - 4, ey + 4], [ex + 4, ey - 4]], p.ink, 1.8);
        ctx.restore();
      }
    }

    // moving ions: beads advancing at their real speed (a scaled clock)
    const SIM_PER_S = 1.2e-7; // simulated seconds per real second
    for (const tr of traces) {
      const pts = tr.path.points;
      const n = pts.length;
      if (n < 3) continue;
      const stepsPerSimS = tr.v / (stage2 ? 3e-4 : 2e-4);
      const spacing = Math.max(20, Math.round(n / 5));
      // the frame clock can start slightly negative (first rAF stamp before the loop's start): keep the phase ≥ 0
      const head = (((t * SIM_PER_S * stepsPerSimS) % spacing) + spacing) % spacing;
      for (let k = head; k < n - 1; k += spacing) {
        const [bx, by] = P(pts[Math.floor(k)][0], pts[Math.floor(k)][1]);
        ctx.save();
        ctx.globalAlpha = tr.path.passed || !s.beam ? 1 : 0.45;
        ctx.fillStyle = color(tr.sp);
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, stage2 ? 2.6 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // the ion at the source, with its sign glyph
    if (!stage2) {
      const [gx2, gy] = P(geo.sourceX, 0);
      chargeDisc(ctx, gx2 + 2, gy, Math.max(7, px(0.0035)), SPECIES[s.species[0]].q, p, {});
    }

    // forces on a single ion just inside the plates: F_E and F_B, to scale with each other
    if (!s.beam && !stage2) {
      const tr = traces[0];
      const { q } = SPECIES[tr.sp];
      const fe = electricForceY(q, Ey);
      const fb = magneticForceY(q, tr.v, s.bOn ? -s.B : 0);
      const big = Math.max(Math.abs(fe), Math.abs(fb));
      if (big > 0) {
        const x = 0.018;
        const yPath = tr.path.points.find(([xx]) => xx >= x)?.[1] ?? 0;
        if (Math.abs(yPath) < H * 0.6) {
          const [fx, fy] = P(x, yPath);
          const scale = px(H) * 0.85;
          const draws: [number, string, number][] = [
            [fe, 'E', -10],
            [fb, 'B', 10],
          ];
          for (const [f, label, dx] of draws) {
            if (f === 0) continue;
            const len = (Math.abs(f) / big) * scale;
            const dir = f > 0 ? -1 : 1; // screen y grows downward
            arrow(ctx, fx + dx, fy, fx + dx, fy + dir * len, { color: p.force, width: 2.6, head: 9 });
            // "F" with a subscript E or B
            const lx = fx + dx + (dx < 0 ? -5 : 5);
            const ly = fy + dir * len * 0.6;
            ctx.save();
            ctx.fillStyle = p.force;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.font = `italic 700 14px ${p.fontUi}`;
            const wF = ctx.measureText('F').width;
            ctx.font = `italic 700 10px ${p.fontUi}`;
            const wS = ctx.measureText(label).width;
            const x0 = dx < 0 ? lx - wF - wS : lx;
            ctx.font = `italic 700 14px ${p.fontUi}`;
            ctx.fillText('F', x0, ly);
            ctx.font = `italic 700 10px ${p.fontUi}`;
            ctx.fillText(label, x0 + wF, ly + 5);
            ctx.restore();
          }
        }
      }
    }

    // spots on the detector, labelled with the ion
    if (stage2) {
      const seen = new Map<string, number>();
      for (const tr of traces) {
        if (tr.path.outcome !== 'detector') continue;
        const [spx, spy] = P(SLIT_X, tr.path.end[1]);
        const g = ctx.createRadialGradient(spx, spy, 1, spx, spy, 12);
        g.addColorStop(0, withAlpha(p.current, 0.95));
        g.addColorStop(1, withAlpha(p.current, 0));
        ctx.save();
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(spx, spy, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.current;
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(spx, spy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // labels of ions landing at the same place are stacked to the left of the wall
        const key = tr.path.end[1].toFixed(3);
        const k = seen.get(key) ?? 0;
        seen.set(key, k + 1);
        ctx.font = `700 13px ${p.fontUi}`;
        ctx.fillStyle = p.ink;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(SPECIES[tr.sp].short, spx - 10 - k * 22, spy);
        ctx.restore();
      }
    }
  };

  const [world] = useState(() => geometry(stage2).world);
  const { canvasRef, invalidate } = useFigureCanvas(draw, { worldWidth: world.w, worldHeight: world.h, animate: true });
  useEffect(invalidate, [sol]);

  const reset = () => {
    setS(initial(props));
    setLive('האיור אופס.');
  };

  /* ---------------------------------------------------------------- readout */

  const single = sol.traces[0];
  const q0 = SPECIES[s.species[0]].q;
  const fe = Math.abs(electricForceY(q0, sol.Ey));
  const fb = Math.abs(magneticForceY(q0, s.v, sol.Bz));
  const passing = sol.traces.filter((t) => t.path.passed);
  const passSpeeds = [...new Set(passing.map((t) => t.v))];
  const vSelText = s.eOn && s.bOn ? `${sci(sol.vSel)} m/s` : '—';

  return (
    <SimShell
      fig={props.id}
      label={`איור חי: ${stage2 ? 'ספקטרומטר של ביינברידג׳: בורר מהירויות ואחריו שדה מגנטי שני וגלאי. ' : 'בורר מהירויות: לוחות טעונים ושדה מגנטי לתוך הדף. '}שדה חשמלי ${s.eOn ? sci(s.E) + ' וולט למטר ' + (sol.Ey < 0 ? 'כלפי מטה' : 'כלפי מעלה') : 'כבוי'}, שדה מגנטי ${s.bOn ? sci(s.B) + ' טסלה לתוך הדף' : 'כבוי'}. ${describe()}`}
      canvasRef={canvasRef}
      aspect={world.w / world.h}
      live={live}
      tasks={tasks}
      onReset={reset}
      readout={
        <>
          <span>
            המהירות שעוברת ישר: <b class="q">v = E/B = {vSelText}</b>
          </span>
          {!s.beam && !stage2 && (
            <>
              <span>
                כוח חשמלי: <b class="q">F = qE = {sci(fe)} N</b>
              </span>
              <span>
                כוח מגנטי: <b class="q">F = qvB = {sci(fb)} N</b>
              </span>
              <span>
                <b>{outcomeOf(single)}</b>
              </span>
            </>
          )}
          {s.beam && (
            <span>
              <b>{passSpeeds.length ? `עוברים בסדק: v = ${passSpeeds.map((v) => sci(v)).join(', ')} m/s` : 'אף מהירות בקרן לא עוברת בסדק'}</b>
            </span>
          )}
          {stage2 &&
            s.species.map((sp) => {
              const { q, m } = SPECIES[sp];
              const r = bainbridgeRadius(m, q, s.E, s.B, s.B2);
              const hit = sol.traces.find((t) => t.sp === sp && t.path.outcome === 'detector');
              return (
                <span key={sp}>
                  {SPECIES[sp].name}: <b class="q">r = mE/(qBB′) = {sci(r * 100)} cm</b>
                  {hit ? ` · פוגע ${sci(2 * r * 100)} ס"מ ${slitSideHe(hit.path.end[1])}` : s.eOn && s.bOn && passing.some((t) => t.sp === sp) ? ' · מחוץ לגלאי' : ''}
                </span>
              );
            })}
        </>
      }
      controls={
        <>
          <div class="group" role="group" aria-label="החלקיק">
            {ORDER.map((k) => (
              <Toggle
                key={k}
                label={`${SPECIES[k].name} (${SPECIES[k].short})`}
                on={s.species.includes(k)}
                swatch={SPECIES[k].q < 0 ? 'var(--neg)' : 'var(--pos)'}
                onChange={() => toggleSpecies(k)}
              />
            ))}
          </div>
          <div class="group" role="group" aria-label="השדות">
            <Toggle label="שדה חשמלי" on={s.eOn} onChange={(on) => change({ eOn: on })} />
            <Toggle label="שדה מגנטי" on={s.bOn} onChange={(on) => change({ bOn: on })} />
            {!stage2 && <Toggle label="הפכו את הלוחות (העליון −)" on={s.flip} onChange={(on) => change({ flip: on })} />}
            <Toggle label="קרן עם מהירויות שונות" on={s.beam} onChange={(on) => change({ beam: on })} />
          </div>
          <Slider
            label="השדה החשמלי E"
            min={0}
            max={E_LIST.length - 1}
            step={1}
            value={Math.max(0, E_LIST.indexOf(s.E))}
            format={(i) => `${sci(E_LIST[i])} V/m`}
            onChange={(i) => change({ E: E_LIST[i] })}
          />
          <Slider
            label="השדה המגנטי B"
            min={0}
            max={B_LIST.length - 1}
            step={1}
            value={Math.max(0, B_LIST.indexOf(s.B))}
            format={(i) => `${sci(B_LIST[i])} T`}
            onChange={(i) => change({ B: B_LIST[i] })}
          />
          {!s.beam && (
            <Slider
              label="מהירות הכניסה v"
              min={0}
              max={V_LIST.length - 1}
              step={1}
              value={Math.max(0, V_LIST.indexOf(s.v))}
              format={(i) => `${sci(V_LIST[i])} m/s`}
              onChange={(i) => change({ v: V_LIST[i] })}
            />
          )}
          {stage2 && (
            <Slider
              label="השדה השני B′"
              min={0}
              max={B2_LIST.length - 1}
              step={1}
              value={Math.max(0, B2_LIST.indexOf(s.B2))}
              format={(i) => `${sci(B2_LIST[i])} T`}
              onChange={(i) => change({ B2: B2_LIST[i] })}
            />
          )}
        </>
      }
    />
  );
}
