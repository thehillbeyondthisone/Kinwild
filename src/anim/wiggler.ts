import * as THREE from 'three';
import { BlendShellCharacter } from '../core/characterMesh';
import { PrimitiveSpec } from '../core/primitives';
import { edgesToLists } from '../core/blendGraph';
import { dampAngle } from './ik';
import { CritterEyes, EyesConfig } from './eyes';

export interface WigglerDef {
  /** head-first chain of spheres */
  segments: { r: number; color: THREE.ColorRepresentation }[];
  segLen: number;
  eyes?: EyesConfig;
  swayAmp?: number;
  swayHz?: number;
}

const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/**
 * Legless slitherer: the spine is a follow-the-leader chain; a traveling
 * sine wave displaces each segment sideways, so the body S-curves while
 * the whole chain snakes after the head.
 */
export class Wiggler {
  readonly character: BlendShellCharacter;
  readonly group: THREE.Group;
  heading = 0;
  speed = 0.9;

  private def: WigglerDef;
  private spine: THREE.Vector3[];
  private eyes?: CritterEyes;
  private target = new THREE.Vector3();
  private wavePhase = Math.random() * 10;
  private initialized = false;

  constructor(def: WigglerDef) {
    this.def = def;
    const specs: PrimitiveSpec[] = def.segments.map((s) => ({
      type: 'sphere',
      r: s.r,
      color: s.color,
      blend: s.r * 0.75,
    }));
    const edges: [number, number][] = [];
    for (let i = 1; i < specs.length; i++) edges.push([i - 1, i]);

    this.character = new BlendShellCharacter(specs, {
      influences: edgesToLists(specs.length, edges),
      outlineWidth: 0.018,
    });
    this.group = new THREE.Group();
    this.group.add(this.character.group);
    this.spine = def.segments.map(() => new THREE.Vector3());

    if (def.eyes) {
      this.eyes = new CritterEyes(def.eyes);
      this.group.add(this.eyes.group);
    }
  }

  follow(target: THREE.Vector3): void {
    this.target.copy(target);
  }

  /** Excited squirm. */
  pet(time: number): void {
    this.wavePhase += 2.0;
    this.eyes?.happy(time);
  }

  /** Release GPU resources for the shell and the separate eye meshes. */
  dispose(): void {
    this.character.dispose();
    this.eyes?.dispose();
  }

  update(dt: number, time: number): void {
    dt = Math.min(dt, 0.05);
    const def = this.def;
    if (!this.initialized) {
      this.spine.forEach((p, i) => {
        p.copy(this.target);
        p.z -= i * def.segLen;
      });
      this.initialized = true;
    }

    // Head steers and advances.
    const head = this.spine[0];
    _dir.copy(this.target).sub(head);
    _dir.y = 0;
    const dist = _dir.length();
    if (dist > 1e-3) {
      this.heading = dampAngle(this.heading, Math.atan2(_dir.x, _dir.z), 3.2, dt);
    }
    const speed = Math.min(this.speed, dist * 1.5);
    head.x += Math.sin(this.heading) * speed * dt;
    head.z += Math.cos(this.heading) * speed * dt;

    // Followers keep their distance.
    for (let i = 1; i < this.spine.length; i++) {
      const prev = this.spine[i - 1];
      const cur = this.spine[i];
      _dir.copy(cur).sub(prev);
      _dir.y = 0;
      const d = _dir.length() || 1e-5;
      _dir.multiplyScalar(def.segLen / d);
      cur.copy(prev).add(_dir);
    }

    // Render positions: spine + traveling lateral wave, resting on ground.
    this.wavePhase += dt * (def.swayHz ?? 2.6) * (0.4 + speed);
    const prims = this.character.prims;
    const amp = (def.swayAmp ?? 0.5) * Math.min(0.06 + speed * 0.05, 0.11);
    for (let i = 0; i < this.spine.length; i++) {
      const p = this.spine[i];
      const ahead = i === 0 ? this.spine[0] : this.spine[i - 1];
      _dir.copy(i === 0 ? _tmp.set(Math.sin(this.heading), 0, Math.cos(this.heading)) : _tmp.copy(ahead).sub(p));
      _dir.y = 0;
      _dir.normalize();
      _perp.set(-_dir.z, 0, _dir.x);
      const sway = Math.sin(this.wavePhase - i * 1.15) * amp * (i === 0 ? 0.5 : 1);
      prims[i].position.copy(p).addScaledVector(_perp, sway);
      prims[i].position.y = def.segments[i].r * 0.92 + Math.sin(time * 3 + i) * 0.004;
      prims[i].quaternion.setFromUnitVectors(_tmp.set(0, 0, 1), _dir);
    }
    this.eyes?.track(prims[0].position, prims[0].quaternion, time);
    this.character.sync();
  }
}
