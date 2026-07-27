import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BlendShellCharacter } from './core/characterMesh';
import { edgesToLists, fullyConnected } from './core/blendGraph';

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
scene.fog = new THREE.Fog(0x8ecbe8, 14, 30);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2.6, 1.8, 3.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xbfe8ff, 0x7a9a5a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d9, 2.2);
sun.position.set(4, 7, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -6;
sun.shadow.camera.right = 6;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -6;
sun.shadow.bias = -0.0005;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(12, 48),
  new THREE.MeshToonMaterial({ color: 0x9ccc68 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Milestone 2 rig: blend-graph isolation, squash-stretch, shadows ---
// 0 torso, 1 head, 2/3 arms (blend with torso), 4/5 crossing tails that are
// NOT graph neighbors of each other — they must overlap crisply, never weld.
const blob = new BlendShellCharacter(
  [
    { type: 'cone', r: 0.34, r2: 0.26, hl: 0.28, color: 0xf2994a, blend: 0.2 },
    { type: 'sphere', r: 0.26, color: 0xf7d154, blend: 0.18 },
    { type: 'capsule', r: 0.11, hl: 0.26, color: 0x5bb0f0, blend: 0.14 },
    { type: 'capsule', r: 0.11, hl: 0.26, color: 0x5bb0f0, blend: 0.14 },
    { type: 'capsule', r: 0.09, hl: 0.34, color: 0x7ed07e, blend: 0.12 },
    { type: 'capsule', r: 0.09, hl: 0.34, color: 0xb98ae0, blend: 0.12 },
  ],
  {
    influences: edgesToLists(6, [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
    ]),
    outlineWidth: 0.025,
  },
);
scene.add(blob.group);

// Separate squash tester: sphere on a stubby base, y-scale animated.
const squash = new BlendShellCharacter(
  [
    { type: 'capsule', r: 0.22, hl: 0.12, color: 0xe86a6a, blend: 0.16 },
    { type: 'sphere', r: 0.26, color: 0xf0c05a, blend: 0.16 },
  ],
  { influences: fullyConnected(2), outlineWidth: 0.025 },
);
scene.add(squash.group);

const clock = new THREE.Clock();
const euler = new THREE.Euler();
function update(t: number): void {
  const [torso, head, armL, armR, tailA, tailB] = blob.prims;
  torso.position.set(0, 0.85, 0);
  torso.quaternion.setFromEuler(euler.set(0, 0, Math.sin(t * 0.8) * 0.08));
  head.position.set(0, 1.35 + Math.sin(t * 1.1) * 0.05, 0.06);
  const swing = Math.sin(t * 1.4) * 0.5;
  armL.position.set(-0.42, 1.0, 0);
  armL.quaternion.setFromEuler(euler.set(0, 0, 1.9 + swing * 0.4));
  armR.position.set(0.42, 1.0, 0);
  armR.quaternion.setFromEuler(euler.set(0, 0, -1.9 + swing * 0.4));
  // Tails scissor across each other behind the body — the welding test.
  const cross = Math.sin(t * 0.9) * 0.5;
  tailA.position.set(-0.15, 0.55, -0.35);
  tailA.quaternion.setFromEuler(euler.set(0.9, 0, -0.7 + cross));
  tailB.position.set(0.15, 0.55, -0.35);
  tailB.quaternion.setFromEuler(euler.set(0.9, 0, 0.7 - cross));
  blob.sync();

  const [base, ball] = squash.prims;
  base.position.set(-1.4, 0.16, 0.3);
  const s = 1 + Math.sin(t * 3) * 0.45;
  ball.position.set(-1.4, 0.42 + (s - 1) * 0.2, 0.3);
  ball.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
  squash.sync();
}

function tick(): void {
  update(clock.getElapsedTime());
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
  blob,
  squash,
  tickOnce: (t?: number) => {
    update(t ?? clock.getElapsedTime());
    renderer.render(scene, camera);
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
