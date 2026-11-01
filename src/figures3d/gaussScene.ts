/**
 * The 3D scene of the Gauss figure: a point charge, rays of its field flowing through a closed
 * surface (sphere or cube) drawn in the ink style. Orbit by dragging. Loaded lazily, only by
 * GaussSpace.tsx, and only when WebGL is available and motion is allowed.
 *
 * Units: metres. The rays that cross the surface are lit in the field colour; the others are
 * faint. Which rays cross is decided by `rayCrossings` (src/physics/gauss.ts), not by the
 * drawing, so the picture and the readout agree.
 */

import * as THREE from 'three';
import { fibonacciSphere } from '~/physics/electrostatics';
import { rayCrossings, type SurfaceShape } from '~/physics/gauss';
import type { Vec3 } from '~/physics/vec';
import { addInkOutline, createInkMaterial, setInkColors, setInkPixelRatio, setOutlineColor } from './ink';

export const N_RAYS = 72;
const RAY_LEN = 2.6;
const PER_RAY = 3;
const SPEED = 0.38;
const CHARGE_R = 0.075;

export interface SceneColors {
  paper: string;
  ink: string;
  accent: string;
  pos: string;
  neg: string;
  efield: string;
}

export interface SceneState {
  shape: SurfaceShape;
  /** position of the charge on the x axis [m] */
  x: number;
  /** sign of the charge: +1 or −1 */
  sign: 1 | -1;
  /** radius of the sphere, or half the side of the cube [m] */
  radius: number;
  /** number of field lines drawn (the same number the readout counts) */
}

export interface GaussScene {
  setState(s: SceneState): void;
  setColors(c: SceneColors): void;
  /** rotate the view by yaw/pitch radians */
  nudge(dYaw: number, dPitch: number): void;
  resize(): void;
  /** stop drawing while the figure is off-screen */
  setVisible(v: boolean): void;
  dispose(): void;
}

const pointVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const pointFragment = /* glsl */ `
uniform vec3 uInk;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(mix(vColor, uInk, smoothstep(0.6, 0.8, d)), 1.0);
}`;

function glyphTexture(sign: 1 | -1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
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
  return new THREE.CanvasTexture(c);
}

export function createGaussScene(canvas: HTMLCanvasElement, colors: SceneColors, initial: SceneState): GaussScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  let yaw = 0.55;
  let pitch = 0.32;
  const DIST = 4.6;
  const placeCamera = () => {
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * DIST, Math.sin(pitch) * DIST, Math.cos(yaw) * Math.cos(pitch) * DIST);
    camera.lookAt(0, 0, 0);
  };
  placeCamera();

  let state = initial;
  let col = colors;
  const dirs: Vec3[] = fibonacciSphere(N_RAYS);

  // ---- the closed surface
  const surfaceMat = createInkMaterial({ color: col.paper, ink: col.accent, hatchGap: 7, mode: 'veil' });
  let surface: THREE.Mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), surfaceMat);
  let edges: THREE.LineSegments | null = null;
  const surfaceGroup = new THREE.Group();
  const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(col.accent) });
  const buildSurface = () => {
    surfaceGroup.clear();
    surface.geometry.dispose();
    if (state.shape === 'sphere') {
      surface = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), surfaceMat);
      edges = null;
    } else {
      const s = 2;
      surface = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), surfaceMat);
      edges?.geometry.dispose();
      edges = new THREE.LineSegments(new THREE.EdgesGeometry(surface.geometry), edgeMat);
    }
    surfaceGroup.add(surface);
    if (edges) surfaceGroup.add(edges);
  };
  scene.add(surfaceGroup);

  // ---- the charge
  const chargeMat = createInkMaterial({ color: col.pos, ink: col.ink, hatchGap: 4 });
  const charge = new THREE.Mesh(new THREE.SphereGeometry(CHARGE_R, 24, 16), chargeMat);
  addInkOutline(charge, col.ink, 0.012);
  scene.add(charge);
  const glyphPlus = glyphTexture(1);
  const glyphMinus = glyphTexture(-1);
  const glyph = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphPlus, depthTest: false, transparent: true }));
  glyph.scale.set(CHARGE_R * 1.7, CHARGE_R * 1.7, 1);
  glyph.renderOrder = 10;
  scene.add(glyph);

  // ---- rays (faint lines) and flowing dots
  const rayPos = new Float32Array(N_RAYS * 6);
  const rayCol = new Float32Array(N_RAYS * 6);
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPos, 3));
  rayGeo.setAttribute('color', new THREE.BufferAttribute(rayCol, 3));
  const rays = new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
  scene.add(rays);

  const nDots = N_RAYS * PER_RAY;
  const dotPos = new Float32Array(nDots * 3);
  const dotCol = new Float32Array(nDots * 3);
  const dotSize = new Float32Array(nDots);
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
  dotGeo.setAttribute('aColor', new THREE.BufferAttribute(dotCol, 3));
  dotGeo.setAttribute('aSize', new THREE.BufferAttribute(dotSize, 1));
  const dotMat = new THREE.ShaderMaterial({
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    uniforms: { uScale: { value: 1 }, uInk: { value: new THREE.Color(col.ink) } },
    transparent: false,
  });
  const dots = new THREE.Points(dotGeo, dotMat);
  dots.frustumCulled = false;
  scene.add(dots);

  const through: boolean[] = new Array(N_RAYS).fill(false);
  const cEf = new THREE.Color();
  const cDim = new THREE.Color();

  const recolor = () => {
    cEf.set(col.efield);
    cDim.set(col.ink).lerp(new THREE.Color(col.paper), 0.72);
    const ink = new THREE.Color(col.ink);
    for (let i = 0; i < N_RAYS; i++) {
      const c = through[i] ? cEf : cDim;
      for (let v = 0; v < 2; v++) {
        rayCol[i * 6 + v * 3] = c.r;
        rayCol[i * 6 + v * 3 + 1] = c.g;
        rayCol[i * 6 + v * 3 + 2] = c.b;
      }
      for (let k = 0; k < PER_RAY; k++) {
        const j = i * PER_RAY + k;
        const d = through[i] ? cEf : ink.clone().lerp(new THREE.Color(col.paper), 0.45);
        dotCol[j * 3] = d.r;
        dotCol[j * 3 + 1] = d.g;
        dotCol[j * 3 + 2] = d.b;
        dotSize[j] = through[i] ? 0.13 : 0.07;
      }
    }
    (rayGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (dotGeo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (dotGeo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    dotMat.uniforms.uInk.value.set(col.ink);
  };

  let builtShape: SurfaceShape | null = null;
  const applyState = () => {
    if (builtShape !== state.shape) {
      buildSurface();
      builtShape = state.shape;
    }
    const origin: Vec3 = [state.x, 0, 0];
    surfaceGroup.scale.setScalar(state.radius);
    charge.position.set(state.x, 0, 0);
    glyph.position.set(state.x, 0, 0);
    chargeMat.uniforms.uColor.value.set(state.sign > 0 ? col.pos : col.neg);
    glyph.material.map = state.sign > 0 ? glyphPlus : glyphMinus;
    glyph.material.needsUpdate = true;
    dirs.forEach((d, i) => {
      rayPos.set([origin[0], origin[1], origin[2], origin[0] + d[0] * RAY_LEN, origin[1] + d[1] * RAY_LEN, origin[2] + d[2] * RAY_LEN], i * 6);
      const c = rayCrossings(state.shape, [0, 0, 0], state.radius, origin, d);
      through[i] = c.out + c.in > 0;
    });
    (rayGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    recolor();
  };

  let visible = true;
  let raf = 0;
  let t0 = performance.now();

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    const t = (now - t0) / 1000;
    for (let i = 0; i < N_RAYS; i++) {
      const d = dirs[i];
      for (let k = 0; k < PER_RAY; k++) {
        const j = i * PER_RAY + k;
        const phase = (k / PER_RAY + ((i * 0.618) % 1) * 0.3 + (t * SPEED) / RAY_LEN) % 1;
        const s = (state.sign > 0 ? phase : 1 - phase) * RAY_LEN;
        dotPos[j * 3] = state.x + d[0] * s;
        dotPos[j * 3 + 1] = d[1] * s;
        dotPos[j * 3 + 2] = d[2] * s;
      }
    }
    (dotGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    renderer.render(scene, camera);
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // point sprites: pixel size per unit of view distance
    dotMat.uniforms.uScale.value = (h * dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 0.185;
    setInkPixelRatio(surfaceMat, dpr);
    setInkPixelRatio(chargeMat, dpr);
  };

  // ---- orbit by dragging
  let drag: { x: number; y: number } | null = null;
  const down = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    api.nudge(-(e.clientX - drag.x) * 0.008, (e.clientY - drag.y) * 0.008);
    drag = { x: e.clientX, y: e.clientY };
  };
  const up = () => {
    drag = null;
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const api: GaussScene = {
    setState(s) {
      state = s;
      applyState();
    },
    setColors(c) {
      col = c;
      setInkColors(surfaceMat, c.paper, c.accent);
      edgeMat.color.set(c.accent);
      chargeMat.uniforms.uInk.value.set(c.ink);
      chargeMat.uniforms.uColor.value.set(state.sign > 0 ? c.pos : c.neg);
      setOutlineColor(charge, c.ink);
      recolor();
    },
    nudge(dYaw, dPitch) {
      yaw += dYaw;
      pitch = Math.max(-1.2, Math.min(1.2, pitch + dPitch));
      placeCamera();
    },
    resize,
    setVisible(v) {
      visible = v;
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
      glyphPlus.dispose();
      glyphMinus.dispose();
      renderer.dispose();
    },
  };

  applyState();
  resize();
  t0 = performance.now();
  raf = requestAnimationFrame(frame);
  return api;
}
