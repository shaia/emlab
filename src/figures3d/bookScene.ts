/**
 * The cover's 3D scene: an open book lying on the desk, and a board that pops up from its left
 * page, the way a pop-up book's card rises as the page opens. The board is a live figure: two
 * charges sit on it, and their field lines are traced by `fieldLines` (src/physics) and inked
 * onto the board whenever a charge moves. Loaded lazily, only by BookPopup.tsx, and only when
 * WebGL is available and motion is allowed.
 *
 * World units are arbitrary (the book is 4 wide). The board maps to a physical window of
 * PHYS_W metres, so the field lines are the engine's, in metres, scaled onto the card.
 * Frames are drawn on demand: nothing renders while nothing changes.
 */

import * as THREE from 'three';
import { fieldLines, type PointCharge } from '~/physics/electrostatics';
import type { Palette } from '~/sims/core/canvas';
import { chevron, polyline, withAlpha } from '~/sims/core/ink';
import { addInkOutline, createInkMaterial, setInkColors, setInkPixelRatio, setOutlineColor } from './ink';

/** page width and depth, page-block thickness */
const PW = 2;
const PD = 2.7;
const T = 0.16;
/** the board: width, height, thickness; its hinge line on the left page */
const BW = 1.76;
const BH = 1.16;
const BT = 0.035;
const BX = -1.03;
const HINGE_Z = 0.5;
/** the board leans back a little once it stands */
const STAND = -0.14;
const FLAT = -Math.PI / 2;
/** the physical window the board shows [m], and the charge size on it */
export const PHYS_W = 1.8;
const PHYS_H = (PHYS_W * BH) / BW;
const K_WORLD = BW / PHYS_W;
const CHARGE_R = 0.08;
/** charges stay this far from the board's edge [m] */
const MARGIN = 0.12;
const Q = 2e-6;
const POP_SECONDS = 1.4;

const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * BH) / BW);
const PAGE_TEX_W = 1024;
const PAGE_TEX_H = Math.round((PAGE_TEX_W * PD) / PW);

export interface BookFonts {
  serif: string;
  ui: string;
  hand: string;
}

export interface BookScene {
  /** charge positions on the board [m], board centre = origin, y up */
  readonly charges: PointCharge[];
  setSigns(second: 1 | -1): void;
  setColors(p: Palette, fonts: BookFonts): void;
  /** move charge i to the board point under a pointer (client coordinates) */
  dragTo(i: number, clientX: number, clientY: number, final?: boolean): void;
  /** move charge i by (dx, dy) metres: the keyboard path */
  moveBy(i: number, dx: number, dy: number): void;
  /** where charge i appears on the canvas, in CSS pixels; null while the board lies flat */
  screenOf(i: number): { x: number; y: number; r: number } | null;
  /** raise the board (once) */
  popUp(): void;
  resize(): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

/** the page surface: down into the gutter at the spine, flat across the rest */
const pageY = (u: number) => T * (1 - (1 - Math.min(1, Math.max(0, u))) ** 8);

const easeOutBack = (t: number) => {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

function canvasTexture(w: number, h: number): [THREE.CanvasTexture, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return [tex, c.getContext('2d')!];
}

function glyphTexture(sign: 1 | -1): THREE.CanvasTexture {
  const [tex, g] = canvasTexture(64, 64);
  g.lineCap = 'round';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(16, 32);
  g.lineTo(48, 32);
  if (sign > 0) {
    g.moveTo(32, 16);
    g.lineTo(32, 48);
  }
  g.stroke();
  return tex;
}

/** A curved page lying in the xz plane, x from x0 to x0 + PW. */
function pageGeometry(x0: number, side: 1 | -1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(PW, PD, 48, 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + x0 + PW / 2;
    pos.setX(i, x);
    pos.setY(i, pageY((side * x) / PW));
  }
  g.computeVertexNormals();
  return g;
}

/** The front edge of a page block: the strip between the desk and the curved page. */
function edgeGeometry(x0: number, side: 1 | -1, z: number): THREE.BufferGeometry {
  const n = 48;
  const p: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + (PW * i) / n;
    const y = pageY((side * x) / PW);
    p.push(x, 0, z, x, y, z);
    uv.push(i / n, 0, i / n, y / T);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** The outline of a page: its rim, following the curve. */
function rimGeometry(x0: number, side: 1 | -1): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = 48;
  const at = (x: number, z: number) => new THREE.Vector3(x, pageY((side * x) / PW) + 0.002, z);
  for (let i = 0; i <= n; i++) pts.push(at(x0 + (PW * i) / n, PD / 2));
  for (let i = n; i >= 0; i--) pts.push(at(x0 + (PW * i) / n, -PD / 2));
  pts.push(pts[0].clone());
  return new THREE.BufferGeometry().setFromPoints(pts);
}

export function createBookScene(
  canvas: HTMLCanvasElement,
  palette: Palette,
  fonts: BookFonts,
  onChange: (charges: PointCharge[], final: boolean) => void,
  onFrame: () => void,
): BookScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1.5, 0.1, 60);
  const target = new THREE.Vector3(-0.15, 0.4, 0.12);
  let yaw = 0.16;
  let pitch = 0.62;
  const DIST = 7.2;
  const placeCamera = () => {
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * DIST,
      target.y + Math.sin(pitch) * DIST,
      target.z + Math.cos(yaw) * Math.cos(pitch) * DIST,
    );
    camera.lookAt(target);
  };
  placeCamera();

  let pal = palette;
  let fnt = fonts;
  const charges: PointCharge[] = [
    { x: -0.38, y: 0, q: Q },
    { x: 0.38, y: 0, q: -Q },
  ];

  // ---- the book: cover boards, page blocks, pages
  const book = new THREE.Group();
  scene.add(book);
  const coverMat = createInkMaterial({ color: pal.accent, ink: pal.ink, hatchGap: 5 });
  const cover = new THREE.Mesh(new THREE.BoxGeometry(2 * PW + 0.18, 0.05, PD + 0.16), coverMat);
  cover.position.y = -0.025;
  book.add(cover);
  const inkLine = new THREE.LineBasicMaterial({ color: new THREE.Color(pal.ink) });
  const coverEdges = new THREE.LineSegments(new THREE.EdgesGeometry(cover.geometry), inkLine);
  cover.add(coverEdges);

  // soft shadow under the book, so it rests on the desk instead of floating
  const [shadowTex, sg] = canvasTexture(256, 256);
  const drawShadow = () => {
    sg.clearRect(0, 0, 256, 256);
    const grad = sg.createRadialGradient(128, 128, 30, 128, 128, 128);
    grad.addColorStop(0, withAlpha(pal.ink, 0.28));
    grad.addColorStop(1, withAlpha(pal.ink, 0));
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 256, 256);
    shadowTex.needsUpdate = true;
  };
  const deskShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * PW + 1.4, PD + 1.2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  deskShadow.rotation.x = -Math.PI / 2;
  deskShadow.position.set(0.1, -0.06, 0.12);
  book.add(deskShadow);

  // the paper layers seen at the front edge of each page block
  const [edgeTex, eg] = canvasTexture(8, 64);
  const drawEdge = () => {
    eg.fillStyle = pal.paper2;
    eg.fillRect(0, 0, 8, 64);
    eg.fillStyle = withAlpha(pal.ink, 0.16);
    for (let y = 3; y < 64; y += 5) eg.fillRect(0, y, 8, 1);
    edgeTex.needsUpdate = true;
  };
  edgeTex.wrapS = THREE.RepeatWrapping;
  const edgeMat = new THREE.MeshBasicMaterial({ map: edgeTex, side: THREE.DoubleSide });

  const [rightTex, rg] = canvasTexture(PAGE_TEX_W, PAGE_TEX_H);
  const [leftTex, lg] = canvasTexture(PAGE_TEX_W, PAGE_TEX_H);
  for (const t of [rightTex, leftTex]) t.anisotropy = maxAniso;
  const rightPage = new THREE.Mesh(pageGeometry(0, 1), new THREE.MeshBasicMaterial({ map: rightTex }));
  const leftPage = new THREE.Mesh(pageGeometry(-PW, -1), new THREE.MeshBasicMaterial({ map: leftTex }));
  book.add(rightPage, leftPage);
  for (const [x0, side] of [
    [0, 1],
    [-PW, -1],
  ] as const) {
    book.add(new THREE.Mesh(edgeGeometry(x0, side, PD / 2), edgeMat));
    book.add(new THREE.Line(rimGeometry(x0, side), inkLine));
    // the outer side of the block
    const sideFace = new THREE.Mesh(new THREE.PlaneGeometry(PD, T), edgeMat);
    sideFace.rotation.y = side * (Math.PI / 2);
    sideFace.position.set(side * PW, T / 2, 0);
    book.add(sideFace);
  }

  /** canvas pixel on a page texture for a world point on that page */
  const leftPx = (x: number, z: number): [number, number] => [((x + PW) / PW) * PAGE_TEX_W, ((z + PD / 2) / PD) * PAGE_TEX_H];

  const textLines = (g: CanvasRenderingContext2D, right: number, top: number, width: number, rows: number, seed: number) => {
    g.fillStyle = withAlpha(pal.ink, 0.22);
    for (let r = 0; r < rows; r++) {
      // ragged on the left: Hebrew lines start at the right margin
      const last = r === rows - 1;
      const f = last ? 0.35 + 0.3 * ((seed * 7 + r) % 3) / 3 : 0.86 + 0.14 * (((seed + r * 5) % 7) / 7);
      const w = width * f;
      g.beginPath();
      g.roundRect(right - w, top + r * 40, w, 13, 6);
      g.fill();
    }
  };

  const drawRightPage = () => {
    const g = rg;
    g.fillStyle = pal.paper;
    g.fillRect(0, 0, PAGE_TEX_W, PAGE_TEX_H);
    // the gutter darkens towards the spine (the left edge of the right page)
    const gut = g.createLinearGradient(0, 0, 140, 0);
    gut.addColorStop(0, withAlpha(pal.ink, 0.16));
    gut.addColorStop(1, withAlpha(pal.ink, 0));
    g.fillStyle = gut;
    g.fillRect(0, 0, 140, PAGE_TEX_H);
    g.direction = 'rtl';
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    const right = PAGE_TEX_W - 110;
    g.fillStyle = pal.accent;
    g.font = `500 34px ${fnt.ui}`;
    g.fillText('פרק 1 · מטען ושדה', right, 160);
    g.fillStyle = pal.ink;
    g.font = `700 92px ${fnt.serif}`;
    g.fillText('השדה החשמלי', right, 270);
    textLines(g, right, 340, 760, 6, 1);
    textLines(g, right, 640, 760, 5, 4);
    // the handwritten note points across the spine, at the board
    g.fillStyle = pal.hand;
    g.font = `500 54px ${fnt.hand}`;
    g.fillText('גררו את המטענים', right - 40, 960);
    g.strokeStyle = pal.hand;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(right - 470, 945);
    g.quadraticCurveTo(right - 620, 900, 150, 980);
    g.moveTo(150, 980);
    g.lineTo(186, 952);
    g.moveTo(150, 980);
    g.lineTo(192, 996);
    g.stroke();
    textLines(g, right, 1060, 760, 4, 2);
    g.fillStyle = pal.ink2;
    g.font = `400 34px ${fnt.serif}`;
    g.textAlign = 'center';
    g.fillText('15', PAGE_TEX_W / 2, PAGE_TEX_H - 70);
    rightTex.needsUpdate = true;
  };

  const drawLeftPage = () => {
    const g = lg;
    g.fillStyle = pal.paper;
    g.fillRect(0, 0, PAGE_TEX_W, PAGE_TEX_H);
    const gut = g.createLinearGradient(PAGE_TEX_W, 0, PAGE_TEX_W - 140, 0);
    gut.addColorStop(0, withAlpha(pal.ink, 0.16));
    gut.addColorStop(1, withAlpha(pal.ink, 0));
    g.fillStyle = gut;
    g.fillRect(PAGE_TEX_W - 140, 0, 140, PAGE_TEX_H);
    // the cut the board was punched out of, and its fold line
    const [x0, y0] = leftPx(BX - BW / 2, HINGE_Z - BH);
    const [x1, y1] = leftPx(BX + BW / 2, HINGE_Z);
    g.fillStyle = pal.paper2;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = withAlpha(pal.ink, 0.35);
    g.lineWidth = 3;
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.setLineDash([14, 10]);
    g.beginPath();
    g.moveTo(x0 - 30, y1);
    g.lineTo(x1 + 30, y1);
    g.stroke();
    g.setLineDash([]);
    g.direction = 'rtl';
    g.fillStyle = pal.ink2;
    g.font = `400 34px ${fnt.serif}`;
    g.textAlign = 'center';
    g.fillText('14', PAGE_TEX_W / 2, PAGE_TEX_H - 70);
    leftTex.needsUpdate = true;
  };

  // ---- the board, hinged on the left page
  const hinge = new THREE.Group();
  hinge.position.set(BX, pageY((-BX) / PW), HINGE_Z);
  hinge.rotation.x = FLAT;
  scene.add(hinge);
  const [boardTex, bg] = canvasTexture(TEX_W, TEX_H);
  boardTex.anisotropy = maxAniso;
  const boardFront = new THREE.MeshBasicMaterial({ map: boardTex });
  const boardSide = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.paper2) });
  const boardBack = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.paper2) });
  // BoxGeometry faces: +x, −x, +y, −y, +z (front), −z (back)
  const board = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BT), [boardSide, boardSide, boardSide, boardSide, boardFront, boardBack]);
  board.position.set(0, BH / 2, 0);
  hinge.add(board);
  const boardEdges = new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), inkLine);
  board.add(boardEdges);

  // the paper strut that props the board from behind, as in a pop-up card
  const strutPos = new Float32Array(12);
  const strutGeo = new THREE.BufferGeometry();
  strutGeo.setAttribute('position', new THREE.BufferAttribute(strutPos, 3));
  strutGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const strutMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.paper2), side: THREE.DoubleSide });
  const strut = new THREE.Mesh(strutGeo, strutMat);
  strut.frustumCulled = false;
  const strutLines = new THREE.LineLoop(strutGeo, inkLine);
  strutLines.frustumCulled = false;
  scene.add(strut, strutLines);

  // the board's shadow falls on the page behind it
  const [castTex, cg] = canvasTexture(16, 128);
  const drawCast = () => {
    cg.clearRect(0, 0, 16, 128);
    const grad = cg.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, withAlpha(pal.ink, 0.3));
    grad.addColorStop(1, withAlpha(pal.ink, 0));
    cg.fillStyle = grad;
    cg.fillRect(0, 0, 16, 128);
    castTex.needsUpdate = true;
  };
  const castMat = new THREE.MeshBasicMaterial({ map: castTex, transparent: true, depthWrite: false, opacity: 0 });
  const cast = new THREE.Mesh(new THREE.PlaneGeometry(BW * 1.04, 1), castMat);
  cast.rotation.x = -Math.PI / 2;
  scene.add(cast);

  // ---- the charges: ink-shaded beads standing out of the board
  const chargeMats = charges.map(() => createInkMaterial({ color: pal.pos, ink: pal.ink, hatchGap: 4 }));
  const beads = charges.map((_, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(CHARGE_R, 24, 16), chargeMats[i]);
    board.add(m);
    return m;
  });
  const outlines = beads.map((b) => addInkOutline(b, pal.ink, 0.006));
  const glyphPlus = glyphTexture(1);
  const glyphMinus = glyphTexture(-1);
  const glyphs = charges.map(() => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphPlus, depthTest: false, transparent: true }));
    s.scale.set(CHARGE_R * 1.6, CHARGE_R * 1.6, 1);
    s.renderOrder = 10;
    board.add(s);
    return s;
  });

  const toBoard = (x: number, y: number) => new THREE.Vector3(x * K_WORLD, y * K_WORLD, BT / 2 + CHARGE_R * 0.55);
  const texPx = (x: number, y: number): [number, number] => [TEX_W / 2 + (x / PHYS_W) * TEX_W, TEX_H / 2 - (y / PHYS_W) * TEX_W];

  const placeCharges = () => {
    charges.forEach((c, i) => {
      const p = toBoard(c.x, c.y);
      beads[i].position.copy(p);
      glyphs[i].position.copy(p).setZ(p.z + CHARGE_R * 0.2);
      chargeMats[i].uniforms.uColor.value.set(c.q > 0 ? pal.pos : pal.neg);
      glyphs[i].material.map = c.q > 0 ? glyphPlus : glyphMinus;
      glyphs[i].material.needsUpdate = true;
      // sign is never colour-only: the negative bead also carries a heavier outline
      (outlines[i].material as THREE.ShaderMaterial).uniforms.uWidth.value = c.q > 0 ? 0.006 : 0.016;
    });
  };

  /** Ink the field of the current charges onto the board. `glow` is skipped mid-drag: shadows are slow. */
  const drawBoard = (glow: boolean) => {
    const g = bg;
    g.fillStyle = pal.paper;
    g.fillRect(0, 0, TEX_W, TEX_H);
    // a dot every 10 cm, as on the course's other figures
    g.fillStyle = pal.rule;
    const step = (0.1 / PHYS_W) * TEX_W;
    for (let x = TEX_W / 2 % step; x < TEX_W; x += step) for (let y = TEX_H / 2 % step; y < TEX_H; y += step) g.fillRect(x - 3, y - 3, 6, 6);
    const lines = fieldLines(charges, {
      bounds: { xmin: -PHYS_W / 2, xmax: PHYS_W / 2, ymin: -PHYS_H / 2, ymax: PHYS_H / 2 },
      coreRadius: CHARGE_R / K_WORLD,
      maxStep: 0.01,
      chargePerLine: Q / 14,
    });
    for (const l of lines) {
      const pts = l.points.map(([x, y]) => texPx(x, y));
      polyline(g, pts, pal.efield, 6, { glow: glow ? pal.efieldGlow : undefined });
      // a line traced from a negative charge runs against E: its chevrons point the other way
      const [sx, sy] = l.points[0];
      const fromNeg = charges.some((c) => c.q < 0 && c.x === sx && c.y === sy);
      const dir = fromNeg ? -1 : 1;
      let acc = 0;
      let next = 70;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0];
        const dy = pts[i][1] - pts[i - 1][1];
        const seg = Math.hypot(dx, dy);
        while (seg > 0 && acc + seg >= next) {
          const f = (next - acc) / seg;
          // the helper's pen is sized for a screen canvas: scale it up to the card's resolution
          g.save();
          g.translate(pts[i - 1][0] + dx * f, pts[i - 1][1] + dy * f);
          g.scale(3, 3);
          chevron(g, 0, 0, (dir * dx) / seg, (dir * dy) / seg, 5, pal.efield);
          g.restore();
          next += 140;
        }
        acc += seg;
      }
    }
    // each bead throws a small shadow on the card
    for (const c of charges) {
      const [x, y] = texPx(c.x, c.y);
      g.fillStyle = withAlpha(pal.ink, 0.18);
      g.beginPath();
      g.ellipse(x + 10, y + 14, (CHARGE_R / K_WORLD / PHYS_W) * TEX_W * 1.05, (CHARGE_R / K_WORLD / PHYS_W) * TEX_W * 0.9, 0, 0, Math.PI * 2);
      g.fill();
    }
    boardTex.needsUpdate = true;
  };

  // ---- the pop-up: the board's angle, the strut and the shadow follow it
  let angle = FLAT;
  const tmpA = new THREE.Vector3();
  const applyAngle = () => {
    hinge.rotation.x = angle;
    hinge.updateMatrixWorld(true);
    const up = (angle - FLAT) / (STAND - FLAT); // 0 flat … 1 standing
    const baseY = hinge.position.y;
    // strut: from the back of the board at 55 % height to the page behind the hinge
    const half = BW * 0.22;
    const zFoot = HINGE_Z - 0.62;
    const corners: [number, number, number][] = [];
    for (const sx of [-half, half]) {
      tmpA.set(sx, BH * 0.55 - BH / 2, -BT / 2 - 0.002);
      board.localToWorld(tmpA);
      corners.push([tmpA.x, tmpA.y, tmpA.z]);
    }
    const foot = (sx: number): [number, number, number] => [BX + sx, baseY + 0.003, zFoot];
    const quad = [corners[0], corners[1], foot(half), foot(-half)];
    quad.forEach((v, k) => strutPos.set(v, k * 3));
    (strutGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    strutGeo.computeBoundingSphere();
    strut.visible = strutLines.visible = up > 0.25;
    // shadow: a strip on the page behind the board, longer and darker as it rises
    const len = Math.max(0.01, BH * 0.55 * up);
    cast.scale.set(1, len, 1);
    cast.position.set(BX, baseY + 0.004, HINGE_Z - len / 2 - 0.01);
    castMat.opacity = Math.min(1, up);
  };

  // ---- drawing on demand
  let visible = true;
  let raf = 0;
  let popStart: number | null = null;
  let popped = false;
  const frame = (now: number) => {
    raf = 0;
    if (popStart !== null) {
      const t = Math.min(1, (now - popStart) / 1000 / POP_SECONDS);
      angle = FLAT + (STAND - FLAT) * easeOutBack(t);
      applyAngle();
      if (t < 1) raf = requestAnimationFrame(frame);
      else popStart = null;
    }
    renderer.render(scene, camera);
    onFrame();
  };
  const invalidate = () => {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // a narrow canvas backs the camera off so the whole book stays in frame
    camera.fov = w / h < 1.4 ? 30 * (1.4 / (w / h)) ** 0.8 : 30;
    camera.updateProjectionMatrix();
    for (const m of [coverMat, ...chargeMats]) setInkPixelRatio(m, dpr);
    invalidate();
  };

  // ---- orbit by dragging the desk (charges are dragged through their own handles)
  let orbit: { x: number; y: number } | null = null;
  const down = (e: PointerEvent) => {
    orbit = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!orbit) return;
    yaw = Math.max(-0.6, Math.min(0.6, yaw - (e.clientX - orbit.x) * 0.006));
    pitch = Math.max(0.35, Math.min(1.15, pitch + (e.clientY - orbit.y) * 0.006));
    orbit = { x: e.clientX, y: e.clientY };
    placeCamera();
    invalidate();
  };
  const up = () => {
    orbit = null;
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const clampCharge = (c: PointCharge, other: PointCharge) => {
    c.x = Math.max(-PHYS_W / 2 + MARGIN, Math.min(PHYS_W / 2 - MARGIN, c.x));
    c.y = Math.max(-PHYS_H / 2 + MARGIN, Math.min(PHYS_H / 2 - MARGIN, c.y));
    // two beads never overlap: push the moving one out of the other
    const dx = c.x - other.x;
    const dy = c.y - other.y;
    const d = Math.hypot(dx, dy);
    const min = (2.4 * CHARGE_R) / K_WORLD;
    if (d < min) {
      const ux = d > 1e-9 ? dx / d : 1;
      const uy = d > 1e-9 ? dy / d : 0;
      c.x = other.x + ux * min;
      c.y = other.y + uy * min;
    }
  };

  const changed = (final: boolean) => {
    placeCharges();
    drawBoard(final);
    onChange(charges.map((c) => ({ ...c })), final);
    invalidate();
  };

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const api: BookScene = {
    charges,
    setSigns(second) {
      charges[1].q = second * Q;
      changed(true);
    },
    setColors(p, f) {
      pal = p;
      fnt = f;
      setInkColors(coverMat, p.accent, p.ink);
      inkLine.color.set(p.ink);
      boardSide.color.set(p.paper2);
      boardBack.color.set(p.paper2);
      strutMat.color.set(p.paper2);
      chargeMats.forEach((m) => m.uniforms.uInk.value.set(p.ink));
      beads.forEach((b) => setOutlineColor(b, p.ink));
      drawShadow();
      drawEdge();
      drawCast();
      drawRightPage();
      drawLeftPage();
      changed(true);
    },
    dragTo(i, clientX, clientY, final = false) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      board.updateMatrixWorld(true);
      normal.set(0, 0, 1).transformDirection(board.matrixWorld);
      const onFace = board.localToWorld(new THREE.Vector3(0, 0, BT / 2 + CHARGE_R * 0.55));
      plane.setFromNormalAndCoplanarPoint(normal, onFace);
      if (!ray.ray.intersectPlane(plane, hit)) return;
      board.worldToLocal(hit);
      charges[i].x = hit.x / K_WORLD;
      charges[i].y = hit.y / K_WORLD;
      clampCharge(charges[i], charges[1 - i]);
      changed(final);
    },
    moveBy(i, dx, dy) {
      charges[i].x += dx;
      charges[i].y += dy;
      clampCharge(charges[i], charges[1 - i]);
      changed(true);
    },
    screenOf(i) {
      if (angle < FLAT + 0.6) return null;
      const r = canvas.getBoundingClientRect();
      const p = beads[i].getWorldPosition(new THREE.Vector3());
      const edge = p.clone().add(new THREE.Vector3(CHARGE_R, 0, 0));
      p.project(camera);
      edge.project(camera);
      return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height, r: Math.abs(edge.x - p.x) * 0.5 * r.width };
    },
    popUp() {
      if (popped) return;
      popped = true;
      popStart = performance.now();
      invalidate();
    },
    resize,
    setVisible(v) {
      visible = v;
      if (v) invalidate();
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      for (const t of [glyphPlus, glyphMinus, boardTex, rightTex, leftTex, edgeTex, shadowTex, castTex]) t.dispose();
      renderer.dispose();
    },
  };

  api.setColors(pal, fnt);
  applyAngle();
  resize();
  return api;
}
