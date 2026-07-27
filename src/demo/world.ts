import * as THREE from 'three';
import { getToonGradient } from '../shaders/materials';

/**
 * Pool of dust puffs as a single Points draw. Slots are recycled; all
 * motion/fade runs in the vertex shader off uTime.
 */
export class Puffs {
  readonly points: THREE.Points;
  private birth: Float32Array;
  private data: Float32Array; // life, size, vx, vz per particle
  private positions: Float32Array;
  private cursor = 0;
  private uTime = { value: 0 };
  private static MAX = 160;

  constructor() {
    const n = Puffs.MAX;
    this.positions = new Float32Array(n * 3);
    this.birth = new Float32Array(n).fill(-1e3);
    this.data = new Float32Array(n * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aBirth', new THREE.BufferAttribute(this.birth, 1));
    geo.setAttribute('aData', new THREE.BufferAttribute(this.data, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: this.uTime },
      vertexShader: /* glsl */ `
        attribute float aBirth;
        attribute vec4 aData; // life, size, vx, vz
        uniform float uTime;
        varying float vFade;
        void main() {
          float age = uTime - aBirth;
          float t = clamp(age / max(aData.x, 1e-3), 0.0, 1.0);
          vFade = (1.0 - t) * step(0.0, age) * step(t, 0.999);
          vec3 p = position + vec3(aData.z * age, age * (0.55 - 0.4 * t), aData.w * age);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          // aData.y is a world-space radius; convert to pixels by depth.
          gl_PointSize = aData.y * (0.5 + t * 1.3) * (720.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vFade;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float d = dot(uv, uv);
          if (d > 1.0) discard;
          float soft = smoothstep(1.0, 0.35, d);
          gl_FragColor = vec4(0.98, 0.95, 0.88, soft * vFade * 0.7);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  spawn(pos: THREE.Vector3, count: number, strength: number, time: number): void {
    for (let i = 0; i < count; i++) {
      const s = this.cursor;
      this.cursor = (this.cursor + 1) % Puffs.MAX;
      const a = Math.random() * Math.PI * 2;
      const r = 0.03 + Math.random() * 0.05;
      this.positions.set([pos.x + Math.cos(a) * r, 0.03, pos.z + Math.sin(a) * r], s * 3);
      this.birth[s] = time;
      this.data.set(
        [
          0.4 + Math.random() * 0.3 + strength * 0.25, // life
          (0.045 + Math.random() * 0.04) * (0.6 + strength * 0.8), // world radius
          Math.cos(a) * (0.12 + strength * 0.25), // vx
          Math.sin(a) * (0.12 + strength * 0.25), // vz
        ],
        s * 4,
      );
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.aBirth as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.aData as THREE.BufferAttribute).needsUpdate = true;
  }

  update(time: number): void {
    this.uTime.value = time;
  }
}

/** Blobby toon scenery: rolling hills, drifting clouds, rocks. */
export function buildWorld(scene: THREE.Scene): { puffs: Puffs; update: (t: number) => void } {
  const gradient = getToonGradient();

  const hillMat = new THREE.MeshToonMaterial({ color: 0x7fb95a, gradientMap: gradient });
  const hillMat2 = new THREE.MeshToonMaterial({ color: 0x6ea850, gradientMap: gradient });
  const hills: [number, number, number, number][] = [
    [-9, -11, 3.4, 0], [7, -13, 4.4, 1], [12, -6, 2.6, 0], [-13, -3, 3.0, 1],
    [-4, -14, 2.6, 0], [13, 3, 3.4, 1], [-12, 7, 2.8, 0], [9, 11, 3.6, 1],
  ];
  for (const [x, z, r, m] of hills) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), m ? hillMat2 : hillMat);
    hill.position.set(x, -r * 0.55, z);
    hill.scale.y = 0.55;
    hill.receiveShadow = true;
    scene.add(hill);
  }

  const rockMat = new THREE.MeshToonMaterial({ color: 0xa8a29b, gradientMap: gradient });
  const rocks: [number, number, number][] = [[2.9, 3.6, 0.16], [-3.6, -2.2, 0.22], [0.6, -4.4, 0.13], [-4.8, 3.0, 0.18]];
  for (const [x, z, r] of rocks) {
    const rock = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), rockMat);
    rock.position.set(x, r * 0.4, z);
    rock.scale.set(1.3, 0.75, 1);
    rock.rotation.y = x * 5;
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  const cloudMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient, fog: false });
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const cloud = new THREE.Group();
    const n = 3 + (i % 3);
    for (let j = 0; j < n; j++) {
      const r = 0.5 + Math.abs(Math.sin(i * 7 + j * 3)) * 0.5;
      const puffMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), cloudMat);
      puffMesh.position.set(j * 0.7 - n * 0.35, Math.sin(j * 2.1) * 0.16, Math.cos(j * 1.3) * 0.3);
      puffMesh.scale.y = 0.62;
      cloud.add(puffMesh);
    }
    cloud.position.set(Math.sin(i * 2.4) * 11, 5.5 + Math.sin(i * 5) * 1.4, Math.cos(i * 2.4) * 11);
    clouds.push(cloud);
    scene.add(cloud);
  }

  const puffs = new Puffs();
  scene.add(puffs.points);

  return {
    puffs,
    update: (t: number) => {
      puffs.update(t);
      clouds.forEach((c, i) => {
        c.position.x += Math.sin(t * 0.01 + i) * 0.0012;
        c.position.z += 0.0008;
        if (c.position.z > 14) c.position.z = -14;
      });
    },
  };
}
