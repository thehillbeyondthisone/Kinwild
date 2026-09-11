import * as THREE from 'three';
import { getToonGradient } from '../shaders/materials';

export interface EyesConfig {
  r: number;
  spread: number;
  y: number;
  /** forward (+z) offset from the head center — push eyes onto the skin. */
  forward?: number;
}

let whiteMat: THREE.MeshToonMaterial | null = null;
let pupilMat: THREE.MeshBasicMaterial | null = null;

/**
 * Crisp separate-mesh eyes (never blended into the field) with idle
 * blinking. Follow the head by copying position/quaternion each frame.
 */
const _local = new THREE.Vector3();
const _inv = new THREE.Quaternion();

export class CritterEyes {
  readonly group = new THREE.Group();
  private lids: THREE.Mesh[] = [];
  private pupils: THREE.Mesh[] = [];
  private r: number;
  private seed = Math.random() * 100;
  /** Set by happy() — squints the eyes for a moment when petted. */
  private happyUntil = -1;

  constructor(cfg: EyesConfig) {
    this.r = cfg.r;
    whiteMat ??= new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: getToonGradient() });
    pupilMat ??= new THREE.MeshBasicMaterial({ color: 0x1a1c2c });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(cfg.r, 16, 12), whiteMat);
      eye.position.set(side * cfg.spread, cfg.y, cfg.forward ?? 0);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(cfg.r * 0.55, 12, 10), pupilMat);
      pupil.position.z = cfg.r * 0.62;
      eye.add(pupil);
      this.group.add(eye);
      this.lids.push(eye);
      this.pupils.push(pupil);
    }
  }

  /** Squint with delight for `dur` seconds from `time`. */
  happy(time: number, dur = 0.8): void {
    this.happyUntil = time + dur;
  }

  /**
   * Slide the pupils within each eyeball toward a world point. Pupils stay
   * on the eyeball's front hemisphere — they never rotate out of sight.
   */
  lookAt(target: THREE.Vector3): void {
    _inv.copy(this.group.quaternion).invert();
    for (let i = 0; i < this.pupils.length; i++) {
      _local.copy(target).sub(this.group.position).applyQuaternion(_inv).sub(this.lids[i].position);
      const len = _local.length();
      if (len < 1e-5) continue;
      _local.divideScalar(len);
      const p = this.pupils[i];
      // Keep the pupil forward-biased so it reads as an eye, not a bead.
      p.position.set(
        THREE.MathUtils.clamp(_local.x, -0.6, 0.6) * this.r * 0.5,
        THREE.MathUtils.clamp(_local.y, -0.6, 0.6) * this.r * 0.5,
        this.r * 0.62,
      );
    }
  }

  /** Copy the head transform and animate blinks. */
  track(pos: THREE.Vector3, quat: THREE.Quaternion, time: number): void {
    this.group.position.copy(pos);
    this.group.quaternion.copy(quat);
    // Blink: a sharp dip of eye y-scale every few seconds.
    const cycle = 2.8 + Math.sin(this.seed) * 1.4;
    const t = (time + this.seed) % cycle;
    const blink = t < 0.13 ? Math.sin((t / 0.13) * Math.PI) : 0;
    const squint = time < this.happyUntil ? 0.55 : 0;
    const sy = 1 - Math.max(blink * 0.85, squint);
    for (const eye of this.lids) eye.scale.y = sy;
  }

  /** Release the per-critter sphere geometries (materials are shared). */
  dispose(): void {
    for (const eye of this.lids) eye.geometry.dispose();
    for (const pupil of this.pupils) pupil.geometry.dispose();
  }
}
