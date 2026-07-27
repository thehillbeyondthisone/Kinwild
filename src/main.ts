import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BlendShellCharacter } from './core/characterMesh';
import { fullyConnected } from './core/blendGraph';

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

// --- Milestone 1 proof: overlapping primitives render as one seamless blob ---
const blob = new BlendShellCharacter(
  [
    { type: 'capsule', r: 0.34, hl: 0.28, color: 0xf2994a, blend: 0.22 }, // torso
    { type: 'capsule', r: 0.2, hl: 0.3, color: 0x5bb0f0, blend: 0.22 }, // arm-ish cross
    { type: 'sphere', r: 0.28, color: 0xf7d154, blend: 0.2 }, // head
  ],
  { influences: fullyConnected(3), outlineWidth: 0.025 },
);
scene.add(blob.group);

const clock = new THREE.Clock();
function update(t: number): void {
  const [torso, arm, head] = blob.prims;
  torso.position.set(0, 0.85, 0);
  torso.quaternion.setFromEuler(new THREE.Euler(0, 0, Math.sin(t * 0.8) * 0.12));
  arm.position.set(Math.sin(t * 0.7) * 0.25, 0.95 + Math.sin(t * 1.3) * 0.1, 0);
  arm.quaternion.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2 + Math.sin(t * 0.9) * 0.5));
  head.position.set(0, 1.45 + Math.sin(t * 1.1) * 0.06, 0.05);
  blob.sync();
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
