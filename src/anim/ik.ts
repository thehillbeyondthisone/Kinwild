import * as THREE from 'three';
import { PrimState } from '../core/characterMesh';

const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

/** Frame-rate independent exponential damping toward a target. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

/**
 * Place a capsule prim so its segment spans a → b (cap centers at the
 * endpoints). The prim's local Y axis is the segment axis. If the prim's
 * authored half-length is given, the prim stretches along Y to fit — a
 * mid-air fixed-size capsule between distant joints reads as a detached
 * floating pill otherwise.
 */
export function placeSegment(
  prim: PrimState,
  a: THREE.Vector3,
  b: THREE.Vector3,
  halfLen?: number,
): void {
  prim.position.copy(a).add(b).multiplyScalar(0.5);
  _dir.copy(b).sub(a);
  const len = _dir.length();
  if (len > 1e-6) {
    _dir.divideScalar(len);
    prim.quaternion.setFromUnitVectors(_up, _dir);
  }
  if (halfLen && halfLen > 1e-4) {
    prim.scale.y = THREE.MathUtils.clamp(len / 2 / halfLen, 0.35, 3);
  }
}

/**
 * Analytic two-bone IK: given hip and foot, bone lengths l1/l2 and a pole
 * hint (rough direction the knee should point), writes the knee position.
 */
export function solveTwoBone(
  out: THREE.Vector3,
  hip: THREE.Vector3,
  foot: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
): void {
  _dir.copy(foot).sub(hip);
  let d = _dir.length();
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  _dir.normalize();

  // Distance from hip to the knee's projection on the hip-foot axis.
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));

  // Bend direction: pole made orthogonal to the hip-foot axis.
  out.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (out.lengthSq() < 1e-8) {
    // Pole parallel to the limb — pick any perpendicular.
    out.crossVectors(_dir, _up);
    if (out.lengthSq() < 1e-8) out.set(1, 0, 0);
  }
  out.normalize();

  out.multiplyScalar(h).addScaledVector(_dir, a).add(hip);
}

/** Yaw-only quaternion from a heading angle (radians, 0 = +Z). */
export function yawQuat(out: THREE.Quaternion, heading: number): THREE.Quaternion {
  return out.setFromAxisAngle(_up, heading);
}

/** Shortest-arc angle interpolation. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export { _q as scratchQuat };
