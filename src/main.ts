import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Walker } from './anim/walker';

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ecbe8);
scene.fog = new THREE.Fog(0x8ecbe8, 16, 34);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4.2, 3.0, 5.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xbfe8ff, 0x7a9a5a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d9, 2.2);
sun.position.set(4, 7, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -7;
sun.shadow.camera.right = 7;
sun.shadow.camera.top = 7;
sun.shadow.camera.bottom = -7;
sun.shadow.bias = -0.0005;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(14, 48),
  new THREE.MeshToonMaterial({ color: 0x9ccc68 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Milestone 3: one gait engine, three body plans ---
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const biped = new Walker({
  body: [{ spec: { type: 'cone', r: 0.26, r2: 0.2, hl: 0.22, color: 0xf2994a, blend: 0.12 }, offset: v3(0, 0, 0) }],
  head: {
    spec: { type: 'sphere', r: 0.2, color: 0xf7d154, blend: 0.09 },
    offset: v3(0, 0.62, 0.02),
    eyes: { r: 0.045, spread: 0.075, y: 0.02 },
  },
  legs: [
    { hip: v3(-0.12, -0.18, 0), l1: 0.24, l2: 0.24, rUpper: 0.09, rLower: 0.07, group: 0, color: 0xe86a5a },
    { hip: v3(0.12, -0.18, 0), l1: 0.24, l2: 0.24, rUpper: 0.09, rLower: 0.07, group: 1, color: 0xe86a5a },
  ],
  arms: [
    { shoulder: v3(-0.26, 0.26, 0), l1: 0.2, l2: 0.18, r: 0.065, color: 0xf2994a, side: -1 },
    { shoulder: v3(0.26, 0.26, 0), l1: 0.2, l2: 0.18, r: 0.065, color: 0xf2994a, side: 1 },
  ],
  bodyHeight: 0.64,
});

const quad = new Walker({
  body: [{ spec: { type: 'capsule', r: 0.22, hl: 0.28, color: 0x5bb0f0, blend: 0.11 }, offset: v3(0, 0, 0), lieFlat: true }],
  head: {
    spec: { type: 'sphere', r: 0.18, color: 0x8ed0ff, blend: 0.08 },
    offset: v3(0, 0.2, 0.5),
    eyes: { r: 0.042, spread: 0.07, y: 0.02 },
  },
  legs: [
    { hip: v3(-0.14, -0.08, 0.24), l1: 0.22, l2: 0.22, rUpper: 0.075, rLower: 0.06, group: 0, color: 0x4a90d9 },
    { hip: v3(0.14, -0.08, 0.24), l1: 0.22, l2: 0.22, rUpper: 0.075, rLower: 0.06, group: 1, color: 0x4a90d9 },
    { hip: v3(-0.14, -0.08, -0.24), l1: 0.22, l2: 0.22, rUpper: 0.075, rLower: 0.06, group: 1, color: 0x4a90d9 },
    { hip: v3(0.14, -0.08, -0.24), l1: 0.22, l2: 0.22, rUpper: 0.075, rLower: 0.06, group: 0, color: 0x4a90d9 },
  ],
  bodyHeight: 0.5,
});

const hex = new Walker({
  body: [
    { spec: { type: 'sphere', r: 0.2, color: 0x7ed07e, blend: 0.1 }, offset: v3(0, 0, 0.16) },
    { spec: { type: 'sphere', r: 0.24, color: 0x5cb85c, blend: 0.11 }, offset: v3(0, 0.02, -0.2) },
  ],
  head: {
    spec: { type: 'sphere', r: 0.13, color: 0xa8e6a0, blend: 0.06 },
    offset: v3(0, 0.05, 0.42),
    eyes: { r: 0.035, spread: 0.055, y: 0.02 },
  },
  legs: [
    { hip: v3(-0.12, -0.04, 0.28), l1: 0.18, l2: 0.2, rUpper: 0.045, rLower: 0.038, group: 0, color: 0x3f9c3f, splay: 0.14 },
    { hip: v3(0.12, -0.04, 0.28), l1: 0.18, l2: 0.2, rUpper: 0.045, rLower: 0.038, group: 1, color: 0x3f9c3f, splay: 0.14 },
    { hip: v3(-0.13, -0.04, 0.0), l1: 0.18, l2: 0.2, rUpper: 0.045, rLower: 0.038, group: 1, color: 0x3f9c3f, splay: 0.16 },
    { hip: v3(0.13, -0.04, 0.0), l1: 0.18, l2: 0.2, rUpper: 0.045, rLower: 0.038, group: 0, color: 0x3f9c3f, splay: 0.16 },
    { hip: v3(-0.12, -0.04, -0.3), l1: 0.18, l2: 0.2, rUpper: 0.045, rLower: 0.038, group: 0, color: 0x3f9c3f, splay: 0.14 },
    { hip: v3(0.12, -0.04, -0.3), l1: 0.18, l2: 0.2, rUpper: 0.045, rLower: 0.038, group: 1, color: 0x3f9c3f, splay: 0.14 },
  ],
  bodyHeight: 0.38,
});

const walkers = [biped, quad, hex];
const paths = [
  { center: v3(0, 0, 0), radius: 2.2, w: 0.55, phase: 0 },
  { center: v3(0.4, 0, -0.4), radius: 3.1, w: -0.38, phase: 2.4 },
  { center: v3(-0.5, 0, 0.5), radius: 1.4, w: 0.7, phase: 4.2 },
];
biped.speed = 1.25;
quad.speed = 1.2;
hex.speed = 1.0;

walkers.forEach((w) => scene.add(w.group));

const _target = new THREE.Vector3();
function update(t: number, dt: number): void {
  walkers.forEach((w, i) => {
    const p = paths[i];
    const a = t * p.w + p.phase;
    _target.set(
      p.center.x + Math.sin(a) * p.radius,
      0,
      p.center.z + Math.cos(a) * p.radius,
    );
    w.follow(_target);
    w.update(dt);
  });
}

const clock = new THREE.Clock();
let last = 0;
function tick(): void {
  const t = clock.getElapsedTime();
  const dt = Math.min(t - last, 0.05);
  last = t;
  update(t, dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Debug hooks for driving/inspecting the scene from the console.
(window as unknown as Record<string, unknown>).__cc = {
  renderer,
  scene,
  camera,
  walkers,
  tickOnce: (t?: number, dt = 1 / 60) => {
    update(t ?? clock.getElapsedTime(), dt);
    renderer.render(scene, camera);
  },
  // Simulate n fixed steps ending at time t1 so gaits settle into a real pose.
  simulate: (t1: number, seconds = 3, fps = 60) => {
    const n = Math.round(seconds * fps);
    for (let i = n; i >= 0; i--) update(t1 - (i / fps), 1 / fps);
    renderer.render(scene, camera);
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
