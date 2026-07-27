import * as THREE from 'three';

export interface RopeOptions {
  gravity?: number;
  /** Velocity damping per second (higher = floppier-comes-to-rest-faster). */
  damping?: number;
  iterations?: number;
  /** Wind wiggle amplitude (m/s^2). */
  wind?: number;
  /**
   * 0 = fully floppy; higher pulls the rope toward its rest direction
   * (given per-update) — ears and antennae stand up, tails droop.
   */
  erect?: number;
}

const _v = new THREE.Vector3();

/**
 * Verlet chain for tails, ears and antennae. Point 0 is pinned to the
 * anchor every step; distance constraints keep segment lengths. The caller
 * maps each segment onto an SDF capsule prim, so the rope stays seamlessly
 * fused with the body while it flops.
 */
export class Rope {
  readonly pts: { p: THREE.Vector3; prev: THREE.Vector3 }[];
  private segLen: number;
  private gravity: number;
  private damping: number;
  private iterations: number;
  private wind: number;
  private erect: number;
  private windPhase = Math.random() * 100;

  constructor(segments: number, segLen: number, opts: RopeOptions = {}) {
    this.segLen = segLen;
    this.gravity = opts.gravity ?? 5.5;
    this.damping = opts.damping ?? 2.2;
    this.iterations = opts.iterations ?? 3;
    this.wind = opts.wind ?? 0.35;
    this.erect = opts.erect ?? 0;
    this.pts = Array.from({ length: segments + 1 }, () => ({
      p: new THREE.Vector3(),
      prev: new THREE.Vector3(),
    }));
  }

  /** Lay the rope out straight from the anchor along dir. */
  reset(anchor: THREE.Vector3, dir: THREE.Vector3): void {
    this.pts.forEach((pt, i) => {
      pt.p.copy(anchor).addScaledVector(dir, i * this.segLen);
      pt.prev.copy(pt.p);
    });
  }

  update(dt: number, anchor: THREE.Vector3, time: number, restDir?: THREE.Vector3): void {
    dt = Math.min(dt, 0.033);
    const decay = Math.exp(-this.damping * dt);
    for (let i = 1; i < this.pts.length; i++) {
      const pt = this.pts[i];
      _v.copy(pt.p).sub(pt.prev).multiplyScalar(decay);
      pt.prev.copy(pt.p);
      pt.p.add(_v);
      pt.p.y -= this.gravity * dt * dt;
      const w = this.wind * dt * dt;
      pt.p.x += Math.sin(time * 2.1 + this.windPhase + i * 0.9) * w;
      pt.p.z += Math.cos(time * 1.7 + this.windPhase * 1.3 + i * 0.7) * w;
      if (this.erect > 0 && restDir) {
        const s = 1 - Math.exp(-this.erect * dt);
        pt.p.x += (anchor.x + restDir.x * i * this.segLen - pt.p.x) * s;
        pt.p.y += (anchor.y + restDir.y * i * this.segLen - pt.p.y) * s;
        pt.p.z += (anchor.z + restDir.z * i * this.segLen - pt.p.z) * s;
      }
    }
    this.pts[0].p.copy(anchor);
    this.pts[0].prev.copy(anchor);
    for (let iter = 0; iter < this.iterations; iter++) {
      for (let i = 0; i < this.pts.length - 1; i++) {
        const a = this.pts[i].p;
        const b = this.pts[i + 1].p;
        _v.copy(b).sub(a);
        const d = _v.length();
        if (d < 1e-6) continue;
        const err = (d - this.segLen) / d;
        if (i === 0) {
          b.addScaledVector(_v, -err);
        } else {
          a.addScaledVector(_v, err * 0.5);
          b.addScaledVector(_v, -err * 0.5);
        }
      }
    }
    // Keep rope above ground.
    for (let i = 1; i < this.pts.length; i++) {
      if (this.pts[i].p.y < 0.02) this.pts[i].p.y = 0.02;
    }
  }
}
