/**
 * The 3D scene of the potential landscape (lesson 2.3): the potential map is printed on a sheet
 * of paper, and the sheet rises off the page into hills and sinks into pits, its height at
 * every point standing for V there (landscape.ts). The equipotentials are printed on the
 * sheet, so as it rises they become its contour lines, at the height of their own V. P is a
 * bead resting on the sheet, and an arrow from it shows the direction of E, down the slope.
 * Loaded lazily, only by PotentialLandscape.tsx, and only when WebGL is available and motion
 * is allowed. Frames are drawn on demand.
 *
 * World axes: map x → world x, map y → world −z (the top of the map lies away from the
 * reader), height → world y. Units are the map's metres.
 */

import * as THREE from 'three';
import { fieldAt, type PointCharge } from '~/physics/electrostatics';
import type { Vec2 } from '~/physics/vec';
import type { Palette } from '~/sims/core/canvas';
import { chargeDisc } from '~/sims/core/ink';
import { MAP } from '~/sims/potentialPresets';
import { addInkOutline, createInkMaterial, setInkColors, setInkPixelRatio, setOutlineColor } from './ink';
import { heightOf, landscapeContours, landscapeGrid, vAt } from './landscape';

const W = MAP.xmax - MAP.xmin;
const H = MAP.ymax - MAP.ymin;
const NX = 160;
const NY = 92;
const TEX_W = 2048;
const TEX_H = Math.round((TEX_W * H) / W);
const TEX_PPM = TEX_W / W;
const LIFT_SECONDS = 1.3;
const BEAD_R = 0.032;
const ARROW_LEN = 0.3;
/** an arrow is drawn only where the field is at least this strong [N/C] */
const E_MIN = 2e3;

export interface LandscapeState {
  charges: PointCharge[];
  probe: Vec2;
  /** true: the sheet stands as the landscape; false: it lies flat as the map */
  lifted: boolean;
}

export interface LandscapeScene {
  setState(s: LandscapeState): void;
  setColors(p: Palette): void;
  /** the first reveal: the flat map rises into the landscape */
  popUp(): void;
  resize(): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

const sheetVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  // world space: the flat paper faces the light fully and stays clean; only slopes are shaded
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// the printed map, lit in a few flat tones and hatched on the slopes that face away from the light
const sheetFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uInk;
uniform vec3 uLight;
uniform float uGap;
uniform float uPixelRatio;
varying vec2 vUv;
varying vec3 vNormal;
// strict: a weight of zero draws nothing (step() would still hit pixels where d is exactly 0)
float stroke(float coord, float w) {
  float d = abs(fract(coord) - 0.5) * 2.0;
  return d < w ? 1.0 : 0.0;
}
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float lit = dot(n, normalize(uLight)) * 0.5 + 0.5;
  float tone = floor(lit * 5.0 + 0.5) / 5.0;
  float dark = clamp((1.0 - tone) * 1.6 - 0.15, 0.0, 1.0);
  vec3 col = texture2D(uMap, vUv).rgb * mix(1.0, 0.8, dark);
  float px = gl_FragCoord.x / uPixelRatio;
  float py = gl_FragCoord.y / uPixelRatio;
  float hatch = stroke((px + py) / uGap, clamp(dark * 1.3 - 0.45, 0.0, 0.55));
  gl_FragColor = vec4(mix(col, uInk, hatch * 0.4), 1.0);
  #include <colorspace_fragment>
}`;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function labelTexture(text: string, color: string, font: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = `700 44px ${font}`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createLandscapeScene(
  canvas: HTMLCanvasElement,
  palette: Palette,
  initial: LandscapeState,
  onProbe: (p: Vec2, final: boolean) => void,
): LandscapeScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1.45, 0.05, 40);
  const target = new THREE.Vector3(0, 0.1, 0.02);
  let yaw = 0.32;
  let pitch = 0.8;
  const DIST = 2.65;
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
  let state = initial;

  // ---- the sheet: the printed map, displaced by the potential
  const geo = new THREE.PlaneGeometry(W, H, NX, NY);
  geo.rotateX(-Math.PI / 2);
  geo.translate((MAP.xmin + MAP.xmax) / 2, 0, -(MAP.ymin + MAP.ymax) / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const heights = new Float32Array(pos.count);
  const texCanvas = document.createElement('canvas');
  texCanvas.width = TEX_W;
  texCanvas.height = TEX_H;
  const tex = new THREE.CanvasTexture(texCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sheetMat = new THREE.ShaderMaterial({
    vertexShader: sheetVertex,
    fragmentShader: sheetFragment,
    uniforms: {
      uMap: { value: tex },
      uInk: { value: new THREE.Color(pal.ink) },
      uLight: { value: new THREE.Vector3(-0.5, 1, 0.35) },
      uGap: { value: 6 },
      uPixelRatio: { value: dpr },
    },
    side: THREE.DoubleSide,
  });
  const sheet = new THREE.Mesh(geo, sheetMat);
  scene.add(sheet);

  // the rim of the sheet, inked, following its edge up and down
  const rimN = 2 * (NX + NY);
  const rimPos = new Float32Array((rimN + 1) * 3);
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.BufferAttribute(rimPos, 3));
  const rimMat = new THREE.LineBasicMaterial({ color: new THREE.Color(pal.ink) });
  const rim = new THREE.Line(rimGeo, rimMat);
  rim.frustumCulled = false;
  scene.add(rim);
  /** vertex index of grid node (i across, r down from the top row) */
  const node = (i: number, r: number) => r * (NX + 1) + i;
  const rimNodes: number[] = [];
  for (let i = 0; i < NX; i++) rimNodes.push(node(i, 0));
  for (let r = 0; r < NY; r++) rimNodes.push(node(NX, r));
  for (let i = NX; i > 0; i--) rimNodes.push(node(i, NY));
  for (let r = NY; r > 0; r--) rimNodes.push(node(0, r));
  rimNodes.push(node(0, 0));

  // ---- P: a bead on the sheet, its label, and the arrow of E
  const beadMat = createInkMaterial({ color: pal.paper, ink: pal.ink, hatchGap: 4 });
  const bead = new THREE.Mesh(new THREE.SphereGeometry(BEAD_R, 20, 14), beadMat);
  addInkOutline(bead, pal.ink, 0.006);
  scene.add(bead);
  let labelTex = labelTexture('P', pal.ink, pal.fontUi);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, depthTest: false, transparent: true }));
  label.scale.set(0.09, 0.09, 1);
  label.renderOrder = 10;
  scene.add(label);
  const arrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.efield) });
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ARROW_LEN - 0.07, 10), arrowMat);
  shaft.position.y = (ARROW_LEN - 0.07) / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 14), arrowMat);
  head.position.y = ARROW_LEN - 0.035;
  arrow.add(shaft, head);
  scene.add(arrow);

  /** world position of a map point on the sheet at the current lift */
  let lift = 0;
  const onSheet = (x: number, y: number) => new THREE.Vector3(x, heightOf(vAt(state.charges, x, y)) * lift, -y);

  const drawMap = () => {
    const g = texCanvas.getContext('2d')!;
    const X = (x: number) => (x - MAP.xmin) * TEX_PPM;
    const Y = (y: number) => (MAP.ymax - y) * TEX_PPM;
    g.fillStyle = pal.paper;
    g.fillRect(0, 0, TEX_W, TEX_H);
    // a dot every 10 cm, as on the flat map
    g.fillStyle = pal.rule;
    for (let x = Math.ceil(MAP.xmin * 10) / 10; x <= MAP.xmax; x += 0.1)
      for (let y = Math.ceil(MAP.ymin * 10) / 10; y <= MAP.ymax; y += 0.1) g.fillRect(X(x) - 3, Y(y) - 3, 6, 6);
    const vals = landscapeGrid(state.charges, 140, 80);
    g.strokeStyle = pal.equip;
    g.lineCap = 'round';
    for (const c of landscapeContours(state.charges, vals)) {
      g.lineWidth = c.v === 0 ? 7 : 4.5;
      g.setLineDash(c.v < 0 ? [15, 12] : []);
      g.beginPath();
      for (const [a, b] of c.segs) {
        g.moveTo(X(a[0]), Y(a[1]));
        g.lineTo(X(b[0]), Y(b[1]));
      }
      g.stroke();
    }
    g.setLineDash([]);
    // the charges sit on the flat tops of their hills, or the floors of their pits
    for (const c of state.charges) {
      g.save();
      g.translate(X(c.x), Y(c.y));
      g.scale(3, 3);
      chargeDisc(g, 0, 0, 17, c.q, pal);
      g.restore();
    }
    tex.needsUpdate = true;
  };

  let builtFor = '';
  const buildHeights = () => {
    for (let k = 0; k < pos.count; k++) heights[k] = heightOf(vAt(state.charges, pos.getX(k), -pos.getZ(k)));
  };

  const applyLift = () => {
    for (let k = 0; k < pos.count; k++) pos.setY(k, heights[k] * lift);
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    rimNodes.forEach((n, k) => rimPos.set([pos.getX(n), pos.getY(n) + 0.002, pos.getZ(n)], k * 3));
    (rimGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    placeProbe();
  };

  const placeProbe = () => {
    const [px, py] = state.probe;
    const p = onSheet(px, py);
    bead.position.copy(p).setY(p.y + BEAD_R * 0.8);
    label.position.set(p.x - 0.05, p.y + 0.1, p.z);
    const [ex, ey] = fieldAt(state.charges, px, py);
    const m = Math.hypot(ex, ey);
    arrow.visible = m >= E_MIN;
    if (!arrow.visible) return;
    // E lies in the page; drawn on the sheet it follows the slope, which falls along E
    const ux = ex / m;
    const uy = ey / m;
    const ahead = onSheet(px + ux * 0.02, py + uy * 0.02);
    const dir = ahead.sub(p).normalize();
    arrow.position.copy(p).setY(p.y + BEAD_R * 0.8);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  };

  const applyState = () => {
    const key = JSON.stringify(state.charges);
    if (key !== builtFor) {
      builtFor = key;
      buildHeights();
      drawMap();
      applyLift();
    } else placeProbe();
  };

  // ---- drawing on demand; the lift animates towards its target
  let visible = true;
  let raf = 0;
  let anim: { from: number; to: number; t0: number } | null = null;
  let revealed = false;
  const frame = (now: number) => {
    raf = 0;
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / 1000 / LIFT_SECONDS);
      lift = anim.from + (anim.to - anim.from) * easeInOut(t);
      applyLift();
      if (t < 1) raf = requestAnimationFrame(frame);
      else anim = null;
    }
    renderer.render(scene, camera);
  };
  const invalidate = () => {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  };
  const liftTo = (to: number) => {
    if (lift === to && !anim) return;
    anim = { from: lift, to, t0: performance.now() };
    invalidate();
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    sheetMat.uniforms.uPixelRatio.value = dpr;
    setInkPixelRatio(beadMat, dpr);
    invalidate();
  };

  // ---- pointer: drag P along the sheet, or drag elsewhere to turn the view
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const flat = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  const mapPointUnder = (e: PointerEvent): Vec2 | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(sheet, false)[0];
    if (hit) return [hit.point.x, -hit.point.z];
    return ray.ray.intersectPlane(flat, hitPoint) ? [hitPoint.x, -hitPoint.z] : null;
  };
  const beadOnScreen = () => {
    const r = canvas.getBoundingClientRect();
    const p = bead.position.clone().project(camera);
    return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height] as const;
  };
  let mode: 'probe' | 'orbit' | null = null;
  let last = { x: 0, y: 0 };
  const down = (e: PointerEvent) => {
    const [bx, by] = beadOnScreen();
    mode = Math.hypot(e.clientX - bx, e.clientY - by) < 26 ? 'probe' : 'orbit';
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (mode === 'probe') {
      const p = mapPointUnder(e);
      if (p) onProbe(p, false);
    } else if (mode === 'orbit') {
      yaw = Math.max(-1.2, Math.min(1.2, yaw - (e.clientX - last.x) * 0.007));
      // turned all the way down, the sheet is seen from straight above: the flat map again
      pitch = Math.max(0.25, Math.min(1.5, pitch + (e.clientY - last.y) * 0.007));
      last = { x: e.clientX, y: e.clientY };
      placeCamera();
      invalidate();
    }
  };
  const up = (e: PointerEvent) => {
    if (mode === 'probe') {
      const p = mapPointUnder(e);
      if (p) onProbe(p, true);
    }
    mode = null;
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const api: LandscapeScene = {
    setState(s) {
      const liftChanged = s.lifted !== state.lifted;
      state = s;
      applyState();
      if (liftChanged && revealed) liftTo(s.lifted ? 1 : 0);
      invalidate();
    },
    setColors(p) {
      pal = p;
      sheetMat.uniforms.uInk.value.set(p.ink);
      rimMat.color.set(p.ink);
      setInkColors(beadMat, p.paper, p.ink);
      setOutlineColor(bead, p.ink);
      arrowMat.color.set(p.efield);
      labelTex.dispose();
      labelTex = labelTexture('P', p.ink, p.fontUi);
      label.material.map = labelTex;
      label.material.needsUpdate = true;
      drawMap();
      invalidate();
    },
    popUp() {
      if (revealed) return;
      revealed = true;
      if (state.lifted) liftTo(1);
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
      tex.dispose();
      labelTex.dispose();
      renderer.dispose();
    },
  };

  applyState();
  resize();
  return api;
}
