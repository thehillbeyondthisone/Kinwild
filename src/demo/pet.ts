import * as THREE from 'three';
import { Critter } from '../creatures/factory';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _center = new THREE.Vector3();
const _sphere = new THREE.Sphere();

export interface PetOptions {
  critters: () => Critter[];
  onPet: (critter: Critter, point: THREE.Vector3) => void;
  /** Clicking empty ground — used to clear the selection. */
  onMiss?: () => void;
}

/**
 * Click/tap a critter to pet it. Picking uses each critter's bounding
 * sphere rather than the mesh: the CPU-side geometry is the undeformed rest
 * pose (all the shaping happens in the vertex shader), so a mesh raycast
 * would hit shapes that aren't where they appear.
 */
export function enablePetting(
  dom: HTMLElement,
  camera: THREE.Camera,
  opts: PetOptions,
): void {
  let downX = 0;
  let downY = 0;

  dom.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
  });

  dom.addEventListener('pointerup', (e) => {
    // Ignore drags — those are camera orbits.
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;

    const rect = dom.getBoundingClientRect();
    _ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    _ray.setFromCamera(_ndc, camera);

    let hit: Critter | null = null;
    let hitDist = Infinity;
    for (const critter of opts.critters()) {
      const radius = critter.bounds(_center);
      _sphere.set(_center, radius);
      if (!_ray.ray.intersectsSphere(_sphere)) continue;
      const d = _ray.ray.origin.distanceTo(_center);
      if (d < hitDist) {
        hitDist = d;
        hit = critter;
      }
    }
    if (hit) {
      hit.bounds(_center);
      opts.onPet(hit, _center);
    } else {
      opts.onMiss?.();
    }
  });
}
