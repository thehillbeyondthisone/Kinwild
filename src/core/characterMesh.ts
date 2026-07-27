import * as THREE from 'three';
import { MAX_PRIMS } from '../shaders/chunks';
import { makeShellMaterials, ShellMaterialSet, ShellUniforms } from '../shaders/materials';
import { makeCarrierGeometry, mergeCarriers, packParams, PrimitiveSpec } from './primitives';
import { packInfluences } from './blendGraph';

/** Live transform of one primitive, written every frame by the animator. */
export interface PrimState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export interface BlendShellOptions {
  /** Neighbor lists (blend graph). Defaults to no blending beyond self. */
  influences?: number[][];
  outlineColor?: THREE.ColorRepresentation;
  outlineWidth?: number;
  /** World-units gradient epsilon; ~1% of character size. */
  gradEps?: number;
}

/**
 * One seamless character: merged carrier meshes + shared shell uniforms +
 * the material set (toon / outline / shadow passes). Animators mutate
 * `prims[i]` transforms and call `sync()` once per frame.
 */
export class BlendShellCharacter {
  readonly specs: PrimitiveSpec[];
  readonly prims: PrimState[];
  readonly group: THREE.Group;
  readonly materials: ShellMaterialSet;
  readonly uniforms: ShellUniforms;
  readonly mainMesh: THREE.Mesh;
  readonly outlineMesh: THREE.Mesh;

  private posK: Float32Array;
  private quat: Float32Array;
  private scaleArr: Float32Array;

  constructor(specs: PrimitiveSpec[], opts: BlendShellOptions = {}) {
    if (specs.length > MAX_PRIMS) {
      throw new Error(`character has ${specs.length} prims; max is ${MAX_PRIMS}`);
    }
    this.specs = specs;
    this.prims = specs.map(() => ({
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
    }));

    this.posK = new Float32Array(MAX_PRIMS * 4);
    this.quat = new Float32Array(MAX_PRIMS * 4);
    this.scaleArr = new Float32Array(MAX_PRIMS * 4);
    const params = new Float32Array(MAX_PRIMS * 4);
    const colors = new Float32Array(MAX_PRIMS * 4);
    const col = new THREE.Color();
    specs.forEach((s, i) => {
      params.set(packParams(s), i * 4);
      col.set(s.color);
      colors.set([col.r, col.g, col.b, 1], i * 4);
      this.posK[i * 4 + 3] = s.blend;
      this.quat[i * 4 + 3] = 1;
      this.scaleArr.set([1, 1, 1, 0], i * 4);
    });

    const influences = opts.influences ?? specs.map(() => []);
    this.uniforms = {
      uPrimPosK: { value: this.posK },
      uPrimQuat: { value: this.quat },
      uPrimScale: { value: this.scaleArr },
      uPrimParams: { value: params },
      uPrimColor: { value: colors },
      uPrimInfl: { value: packInfluences(influences, MAX_PRIMS) },
      uTuck: { value: new THREE.Vector3(0.02, 0.005, 0.035) },
      uGradEps: { value: opts.gradEps ?? 0.012 },
      uOutlineComp: { value: new THREE.Vector3(4, 0.6, 2.5) },
    };

    const geometry = mergeCarriers(specs.map(makeCarrierGeometry));
    this.materials = makeShellMaterials(this.uniforms, {
      outlineColor: opts.outlineColor,
      outlineWidth: opts.outlineWidth,
    });

    this.mainMesh = new THREE.Mesh(geometry, this.materials.main);
    this.mainMesh.customDepthMaterial = this.materials.depth;
    this.mainMesh.customDistanceMaterial = this.materials.distance;
    this.mainMesh.castShadow = true;
    this.mainMesh.receiveShadow = true;
    this.outlineMesh = new THREE.Mesh(geometry, this.materials.outline);
    // Prim transforms live in world space inside the uniforms, so Three's
    // frustum culling (which uses rest-pose bounds) must not interfere.
    this.mainMesh.frustumCulled = false;
    this.outlineMesh.frustumCulled = false;

    this.group = new THREE.Group();
    this.group.add(this.mainMesh, this.outlineMesh);
  }

  /** Push current prim transforms into the uniform arrays. */
  sync(): void {
    for (let i = 0; i < this.prims.length; i++) {
      const p = this.prims[i];
      const o = i * 4;
      this.posK[o] = p.position.x;
      this.posK[o + 1] = p.position.y;
      this.posK[o + 2] = p.position.z;
      this.quat[o] = p.quaternion.x;
      this.quat[o + 1] = p.quaternion.y;
      this.quat[o + 2] = p.quaternion.z;
      this.quat[o + 3] = p.quaternion.w;
      this.scaleArr[o] = p.scale.x;
      this.scaleArr[o + 1] = p.scale.y;
      this.scaleArr[o + 2] = p.scale.z;
    }
  }

  dispose(): void {
    this.mainMesh.geometry.dispose();
    for (const m of [
      this.materials.main,
      this.materials.outline,
      this.materials.depth,
      this.materials.distance,
    ]) {
      m.dispose();
    }
  }
}
