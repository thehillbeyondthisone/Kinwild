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
export class CritterEyes {
  readonly group = new THREE.Group();
  private lids: THREE.Mesh[] = [];
  private seed = Math.random() * 100;

  constructor(cfg: EyesConfig) {
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
    const sy = 1 - blink * 0.85;
    for (const eye of this.lids) eye.scale.y = sy;
  }
}
