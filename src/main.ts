import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCritter, Critter } from './creatures/factory';
import { LIBRARY } from './creatures/library';
import { generateDNA } from './creatures/generate';
import { buildWorld } from './demo/world';
import { buildUi } from './demo/ui';
import { sunDirUniform } from './shaders/materials';

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

const hemi = new THREE.HemisphereLight(0xbfe8ff, 0x7a9a5a, 0.65);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d9, 2.5);
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

const world = buildWorld(scene);
let nowT = 0;

// --- critters from DNA ---
interface Roaming {
  critter: Critter;
  radius: number;
  w: number;
  phase: number;
  cx: number;
  cz: number;
  /** Per-critter gaze point — lookAt() keeps the reference, so it can't be shared. */
  gaze: THREE.Vector3;
}
const roster: Roaming[] = [];

function addCritter(critter: Critter, slot: number): void {
  scene.add(critter.group);
  critter.setLandHandler((pos, s) => world.puffs.spawn(pos, 1 + Math.round(s * 3), s, nowT));
  const golden = slot * 2.4;
  roster.push({
    critter,
    radius: 1.6 + (slot % 4) * 0.75,
    w: (0.3 + (slot % 3) * 0.14) * (slot % 2 ? -1 : 1),
    phase: golden,
    cx: Math.sin(golden) * 0.8,
    cz: Math.cos(golden) * 0.8,
    gaze: new THREE.Vector3(),
  });
}

LIBRARY.forEach((dna, i) => addCritter(createCritter(dna), i));

function spawnRandom(seed?: number): Critter {
  const s = seed ?? Math.floor(Math.random() * 1e9);
  const critter = createCritter(generateDNA(s));
  addCritter(critter, roster.length);
  return critter;
}

function clearSpawned(): void {
  while (roster.length > LIBRARY.length) {
    const r = roster.pop()!;
    scene.remove(r.critter.group);
    r.critter.dispose();
  }
}

const ui = buildUi({
  spawnRandom,
  clearSpawned,
  critters: () => roster.map((r) => r.critter),
  // Import runs through the normalizing factory, so hand-edited or
  // AI-generated JSON degrades gracefully instead of crashing.
  importDNA: (list) => {
    let n = 0;
    for (const dna of list) {
      addCritter(createCritter(dna), roster.length);
      n++;
    }
    return n;
  },
  exportDNA: () => roster.map((r) => r.critter.dna),
});

const _target = new THREE.Vector3();
const _selfC = new THREE.Vector3();
const _otherC = new THREE.Vector3();

/**
 * Pick something for each critter to look at: the nearest neighbor within
 * range, with an occasional glance at the camera (staggered per critter so
 * they never all turn at once).
 */
function updateGaze(t: number): void {
  for (let i = 0; i < roster.length; i++) {
    const me = roster[i].critter;
    me.bounds(_selfC);
    let found = false;
    let bestD = 3.2;
    for (let j = 0; j < roster.length; j++) {
      if (i === j) continue;
      const rad = roster[j].critter.bounds(_otherC);
      const d = _selfC.distanceTo(_otherC);
      if (d < bestD) {
        bestD = d;
        found = true;
        roster[i].gaze.set(_otherC.x, _otherC.y + rad * 0.12, _otherC.z);
      }
    }
    // Every ~9s each critter takes a 2s look at the viewer (staggered, so
    // they never all turn in unison).
    const glance = (t + i * 2.7) % 9;
    me.lookAt(glance < 2 ? camera.position : found ? roster[i].gaze : null);
  }
}

function update(t: number, dt: number): void {
  nowT = t;
  world.update(t);
  sunDirUniform.value.copy(sun.position).normalize();
  updateGaze(t);
  for (const r of roster) {
    const a = t * r.w + r.phase;
    _target.set(r.cx + Math.sin(a) * r.radius, 0, r.cz + Math.cos(a) * r.radius);
    r.critter.follow(_target);
    r.critter.update(dt, t);

    // Distance LOD: fewer Newton iterations far away, no outline at range.
    const dist = camera.position.distanceTo(r.critter.position());
    r.critter.shell.uniforms.uIters.value = dist < 8 ? 3 : dist < 16 ? 2 : 1;
    r.critter.shell.outlineMesh.visible = dist < 18;
  }
}

const clock = new THREE.Clock();
let last = 0;
let fpsAccum = 0;
let fpsFrames = 0;
function tick(): void {
  const t = clock.getElapsedTime();
  const dt = Math.min(t - last, 0.05);
  last = t;
  update(t, dt);
  controls.update();
  renderer.render(scene, camera);

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    ui.setFps(fpsFrames / fpsAccum, renderer.info.render.calls, renderer.info.render.triangles);
    fpsAccum = 0;
    fpsFrames = 0;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Debug hooks for driving/inspecting the scene from the console.
(window as unknown as Record<string, unknown>).__cc = {
  renderer,
  scene,
  camera,
  roster,
  spawnRandom,
  tickOnce: (t?: number, dt = 1 / 60) => {
    update(t ?? clock.getElapsedTime(), dt);
    renderer.render(scene, camera);
  },
  // Simulate n fixed steps ending at time t1 so gaits settle into a real pose.
  simulate: (t1: number, seconds = 3, fps = 60) => {
    const n = Math.round(seconds * fps);
    for (let i = n; i >= 0; i--) update(t1 - i / fps, 1 / fps);
    renderer.render(scene, camera);
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
