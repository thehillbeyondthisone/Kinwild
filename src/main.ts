import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCritter, Critter } from './creatures/factory';
import { LIBRARY } from './creatures/library';
import { generateDNA } from './creatures/generate';
import { buildWorld } from './demo/world';
import { buildUi } from './demo/ui';
import { Roam } from './demo/roam';
import { enablePetting } from './demo/pet';
import { decodeDNAFromHash } from './demo/share';
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
const roster: Critter[] = [];
const roam = new Roam({ range: 7 });

function addCritter(critter: Critter): void {
  scene.add(critter.group);
  critter.setLandHandler((pos, s) => world.puffs.spawn(pos, 1 + Math.round(s * 3), s, nowT));
  roster.push(critter);
  roam.add(critter);
}

LIBRARY.forEach((dna) => addCritter(createCritter(dna)));

function spawnRandom(seed?: number): Critter {
  const s = seed ?? Math.floor(Math.random() * 1e9);
  const critter = createCritter(generateDNA(s));
  addCritter(critter);
  return critter;
}

function clearSpawned(): void {
  while (roster.length > LIBRARY.length) {
    const c = roster.pop()!;
    if (c === selected) select(null);
    roam.remove(c);
    scene.remove(c.group);
    c.dispose();
  }
}

// --- selection: clicking a critter pets it and selects it in the panel ---
let selected: Critter | null = null;

const selectRing = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1, 40),
  new THREE.MeshBasicMaterial({
    color: 0xfff0a8,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
selectRing.rotation.x = -Math.PI / 2;
selectRing.visible = false;
selectRing.renderOrder = 2;
scene.add(selectRing);

function select(critter: Critter | null): void {
  selected = critter;
  selectRing.visible = !!critter;
  ui.setSelected(critter);
}

const petColor = new THREE.Color(0xff8ec4);
enablePetting(renderer.domElement, camera, {
  critters: () => roster,
  onPet: (critter, point) => {
    const radius = critter.bounds(point);
    critter.pet(nowT);
    world.puffs.spawn(point, 9, 0.5, nowT, petColor, radius * 0.5);
    select(critter);
  },
  onMiss: () => select(null),
});

const ui = buildUi({
  spawnRandom,
  clearSpawned,
  critters: () => roster,
  // Import runs through the normalizing factory, so hand-edited or
  // AI-generated JSON degrades gracefully instead of crashing.
  // One malformed critter must not sink the rest of a batch.
  importDNA: (list) => {
    let n = 0;
    for (const dna of list) {
      try {
        addCritter(createCritter(dna));
        n++;
      } catch (e) {
        console.warn(`[import] skipped "${dna?.name ?? '?'}"`, e);
      }
    }
    return n;
  },
  exportDNA: () => roster.map((c) => c.dna),
  replaceCritter: (old, dna) => {
    const i = roster.indexOf(old);
    if (i < 0) return;
    roam.remove(old);
    scene.remove(old.group);
    old.dispose();
    roster.splice(i, 1);
    const next = createCritter(dna);
    addCritter(next);
    // The edited critter stays selected, so repeated tweaks keep working.
    select(next);
  },
  onSelect: (critter) => select(critter),
});

// A shared link spawns its critters alongside the library.
// A stale or hand-edited link must not take the whole app down with it: this
// runs at module top level, above the render loop.
decodeDNAFromHash().forEach((dna) => {
  try {
    addCritter(createCritter(dna));
  } catch (e) {
    console.warn(`[share] skipped "${dna?.name ?? '?'}"`, e);
  }
});

function update(t: number, dt: number): void {
  nowT = t;
  world.update(t);
  sunDirUniform.value.copy(sun.position).normalize();
  roam.update(dt, t, camera);

  for (const critter of roster) {
    // Distance LOD: fewer Newton iterations far away, no outline at range.
    const dist = camera.position.distanceTo(critter.position());
    critter.shell.uniforms.uIters.value = dist < 8 ? 3 : dist < 16 ? 2 : 1;
    critter.shell.outlineMesh.visible = dist < 18;
  }

  if (selected) {
    const radius = selected.bounds(_ringAt);
    selectRing.position.set(_ringAt.x, 0.012, _ringAt.z);
    const pulse = 1 + Math.sin(t * 4) * 0.04;
    selectRing.scale.setScalar(radius * 0.62 * pulse);
  }
}
const _ringAt = new THREE.Vector3();

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
