/**
 * The cover figure: an open book in 3D whose left page raises a live board, as in a pop-up
 * book. Two charges sit on the board and can be dragged; the field lines follow (bookScene.ts).
 *
 * The server HTML is the 2D cover drawing passed in as children. It stays when there is no
 * WebGL, in still mode, and until the three.js chunk has loaded; the 3D book then fades in over
 * it. The charges are dragged through HTML handles placed over the beads, so a phone can still
 * scroll the page by swiping the rest of the figure, and the keyboard reaches them by Tab.
 */

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PointCharge } from '~/physics/electrostatics';
import { motionAllowed } from '~/progress/settings';
import { readPalette } from '~/sims/core/canvas';
import '~/sims/core/SimShell.css';
import './BookPopup.css';
import { webglAvailable } from './webgl';

type SceneModule = typeof import('./bookScene');
type Scene = ReturnType<SceneModule['createBookScene']>;

const KEY_STEP = 0.05;
const NAMES = ['המטען הראשון', 'המטען השני'];

const signWord = (q: number) => (q > 0 ? 'חיובי' : 'שלילי');

function describe(cs: PointCharge[]): string {
  const d = Math.round(Math.hypot(cs[0].x - cs[1].x, cs[0].y - cs[1].y) * 100);
  return `מטען ${signWord(cs[0].q)} ומטען ${signWord(cs[1].q)}, ${d} ס"מ זה מזה.`;
}

export default function BookPopup(props: { children?: ComponentChildren }) {
  const [want3d, setWant3d] = useState(false);
  const [mod, setMod] = useState<SceneModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const sceneRef = useRef<Scene | null>(null);
  const [charges, setCharges] = useState<PointCharge[]>([]);
  const [like, setLike] = useState(false);
  const [live, setLive] = useState('');

  // 3D only with WebGL and motion allowed; re-checked when still mode or reduced motion change
  useEffect(() => {
    const check = () => setWant3d(webglAvailable() && motionAllowed());
    check();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', check);
    window.addEventListener('emlab:settings', check);
    return () => {
      mq.removeEventListener('change', check);
      window.removeEventListener('emlab:settings', check);
    };
  }, []);

  useEffect(() => {
    if (!want3d || mod || failed) return;
    import('./bookScene').then(setMod).catch(() => setFailed(true));
  }, [want3d, mod, failed]);

  const view3d = want3d && !!mod && !failed;
  const shown = view3d && ready;

  const pick = (l: boolean) => {
    setLike(l);
    sceneRef.current?.setSigns(l ? 1 : -1);
  };

  return (
    <figure class={`book3d ${shown ? 'ready' : ''}`}>
      <div class="book-frame">
        <div class="book-fallback" aria-hidden={shown ? 'true' : undefined}>
          {props.children}
        </div>
        {view3d && (
          <Book3D
            mod={mod!}
            sceneRef={sceneRef}
            charges={charges}
            onReady={(v) => setReady(v)}
            onFail={() => setFailed(true)}
            onChange={(cs, final) => {
              setCharges(cs);
              if (final) setLive(describe(cs));
            }}
          />
        )}
      </div>
      {shown && (
        <figcaption class="book-caption">
          <span class="hand">גררו את המטענים על הלוח, וראו איך קווי השדה משתנים.</span>
          <span class="book-choice" role="group" aria-label="סימני המטענים">
            <button type="button" class={`toggle ${!like ? 'on' : ''}`} aria-pressed={!like} onClick={() => pick(false)}>
              מטענים מנוגדים
            </button>
            <button type="button" class={`toggle ${like ? 'on' : ''}`} aria-pressed={like} onClick={() => pick(true)}>
              מטענים זהים
            </button>
          </span>
          <span class="sr-only" aria-live="polite">
            {live}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

interface Book3DProps {
  mod: SceneModule;
  sceneRef: { current: Scene | null };
  charges: PointCharge[];
  onReady: (ready: boolean) => void;
  onFail: () => void;
  onChange: (charges: PointCharge[], final: boolean) => void;
}

function Book3D(p: Book3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRefs = [useRef<HTMLButtonElement | null>(null), useRef<HTMLButtonElement | null>(null)];
  const { sceneRef } = p;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.view = '3d';
    const fonts = () => {
      const cs = getComputedStyle(canvas);
      return { serif: cs.getPropertyValue('--font-serif').trim(), ui: cs.getPropertyValue('--font-ui').trim(), hand: cs.getPropertyValue('--font-hand').trim() };
    };
    // the handles follow the beads on every frame, without a Preact render
    const place = () => {
      const scene = sceneRef.current;
      if (!scene) return;
      handleRefs.forEach((h, i) => {
        const el = h.current;
        if (!el) return;
        const at = scene.screenOf(i);
        el.hidden = !at;
        if (!at) return;
        const size = Math.max(36, at.r * 2.6);
        el.style.width = el.style.height = `${size}px`;
        el.style.transform = `translate(${at.x - size / 2}px, ${at.y - size / 2}px)`;
      });
    };
    const changed = (cs: PointCharge[], final: boolean) => {
      canvas.dataset.charges = JSON.stringify(cs.map((c) => [Math.round(c.x * 100), Math.round(c.y * 100), Math.sign(c.q)]));
      p.onChange(cs, final);
    };
    let scene: Scene;
    try {
      scene = p.mod.createBookScene(canvas, readPalette(canvas), fonts(), changed, place);
    } catch {
      p.onFail();
      return;
    }
    sceneRef.current = scene;
    p.onReady(true);
    // canvas text needs its fonts loaded first: they load only on use, and a canvas does not ask
    const f = fonts();
    Promise.all([`700 92px ${f.serif}`, `500 34px ${f.ui}`, `500 54px ${f.hand}`].map((spec) => document.fonts.load(spec, 'אבג')))
      .then(() => sceneRef.current?.setColors(readPalette(canvas), fonts()))
      .catch(() => {});
    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(canvas);
    let popTimer = 0;
    const io = new IntersectionObserver((es) => {
      const v = es.some((e) => e.isIntersecting);
      scene.setVisible(v);
      // a beat after it comes into view, so the reader sees the board rise
      if (v && !popTimer) popTimer = window.setTimeout(() => scene.popUp(), 350);
    });
    io.observe(canvas);
    const theme = () => scene.setColors(readPalette(canvas), fonts());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', theme);
    window.addEventListener('emlab:settings', theme);
    return () => {
      window.clearTimeout(popTimer);
      ro.disconnect();
      io.disconnect();
      mq.removeEventListener('change', theme);
      window.removeEventListener('emlab:settings', theme);
      scene.dispose();
      sceneRef.current = null;
      p.onReady(false);
    };
  }, []);

  const drag = (i: number) => ({
    onPointerDown: (e: PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onPointerMove: (e: PointerEvent) => {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) sceneRef.current?.dragTo(i, e.clientX, e.clientY);
    },
    onPointerUp: (e: PointerEvent) => {
      if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
      sceneRef.current?.dragTo(i, e.clientX, e.clientY, true);
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    onKeyDown: (e: KeyboardEvent) => {
      // the board is physics space: right is +x and up is +y, whatever the page direction
      const m: Record<string, [number, number]> = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] };
      const d = m[e.key];
      if (!d) return;
      e.preventDefault();
      sceneRef.current?.moveBy(i, d[0], d[1]);
    },
  });

  return (
    <>
      <canvas
        ref={canvasRef}
        class="book-canvas"
        role="img"
        aria-label={`ספר פתוח, ומתוך העמוד השמאלי קם לוח. על הלוח קווי השדה של שני מטענים. ${p.charges.length ? describe(p.charges) : ''} גררו את הספר כדי לסובב אותו.`}
      />
      {[0, 1].map((i) => (
        <button
          key={i}
          ref={handleRefs[i]}
          type="button"
          hidden
          class="book-handle"
          aria-label={`${NAMES[i]}${p.charges[i] ? `, ${signWord(p.charges[i].q)}` : ''}. גררו אותו, או הזיזו בחיצים.`}
          {...drag(i)}
        />
      ))}
    </>
  );
}
