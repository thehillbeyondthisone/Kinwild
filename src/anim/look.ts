import * as THREE from 'three';
import { dampAngle } from './ik';

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();

const MAX_YAW = THREE.MathUtils.degToRad(45);
const MAX_PITCH = THREE.MathUtils.degToRad(25);

/**
 * Head aiming with lag. Yaw/pitch are tracked relative to the body so the
 * head can only crane so far before the critter has to turn — clamping in
 * body space is what keeps it from owl-necking.
 */
export class LookAt {
  target: THREE.Vector3 | null = null;
  private yaw = 0;
  private pitch = 0;

  /** Writes the aimed head orientation into `out`. */
  update(
    dt: number,
    headPos: THREE.Vector3,
    bodyHeading: number,
    bodyQuat: THREE.Quaternion,
    out: THREE.Quaternion,
  ): void {
    let ty = 0;
    let tp = 0;
    if (this.target) {
      const dx = this.target.x - headPos.x;
      const dy = this.target.y - headPos.y;
      const dz = this.target.z - headPos.z;
      const horiz = Math.hypot(dx, dz);
      if (horiz > 1e-4) {
        // Shortest arc from the body's facing to the target.
        let rel = Math.atan2(dx, dz) - bodyHeading;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        ty = THREE.MathUtils.clamp(rel, -MAX_YAW, MAX_YAW);
        tp = THREE.MathUtils.clamp(Math.atan2(dy, horiz), -MAX_PITCH, MAX_PITCH);
      }
    }
    this.yaw = dampAngle(this.yaw, ty, 5, dt);
    this.pitch = dampAngle(this.pitch, tp, 5, dt);
    // Negative pitch: +X rotation tips the nose down in this rig.
    out.copy(bodyQuat).multiply(_q.setFromEuler(_e.set(-this.pitch, this.yaw, 0)));
  }
}
