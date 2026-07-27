import * as THREE from 'three';
import { sdPrimLocal } from './sdf';

export type PrimType = 'sphere' | 'capsule' | 'cone';

/** Authoring-time description of one SDF primitive. */
export interface PrimitiveSpec {
  type: PrimType;
  /** sphere/capsule radius, or cone bottom radius. */
  r: number;
  /** half-length along local Y (capsule segment / cone axis). Ignored for spheres. */
  hl?: number;
  /** cone top radius (at +Y). */
  r2?: number;
  color: THREE.ColorRepresentation;
  /** smooth-min blend radius k. Small k on thin parts caps their blending. */
  blend: number;
  /** tessellation multiplier (1 = default density). */
  detail?: number;
}

export const PRIM_TYPE_ID: Record<PrimType, number> = { sphere: 0, capsule: 1, cone: 2 };

/** Packed shape params [x, y, z, type] matching the shader layout. */
export function packParams(spec: PrimitiveSpec): [number, number, number, number] {
  const t = PRIM_TYPE_ID[spec.type];
  if (t === 0) return [spec.r, 0, 0, 0];
  if (t === 1) return [spec.hl ?? 0.1, spec.r, 0, 1];
  return [spec.hl ?? 0.1, spec.r, spec.r2 ?? spec.r * 0.6, 2];
}

/**
 * Carrier mesh for a primitive, in primitive-local (unscaled) space.
 * Built as a lathe profile that is Newton-projected onto the primitive's own
 * CPU SDF, so any primitive type gets an exact-fitting, evenly tessellated
 * carrier — the vertex shader only ever needs small corrections from here.
 */
export function makeCarrierGeometry(spec: PrimitiveSpec): THREE.BufferGeometry {
  const params = packParams(spec);
  const detail = spec.detail ?? 1;
  const hl = spec.type === 'sphere' ? 0 : (spec.hl ?? 0.1);
  const rMax = Math.max(spec.r, spec.r2 ?? 0);
  // Rough arc length pole-to-pole; densify so blend zones have vertices to bend.
  const arc = 2 * hl + Math.PI * rMax;
  const profileSegs = Math.max(12, Math.round(arc * 26 * detail));
  const radialSegs = Math.max(12, Math.round(2 * Math.PI * rMax * 20 * detail));

  const top = hl + (spec.r2 ?? spec.r);
  const bottom = -hl - spec.r;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= profileSegs; i++) {
    const t = i / profileSegs;
    // Sample along a stadium-ish path, then project onto the SDF in the XY plane.
    const ang = Math.PI * t; // 0 = bottom pole, PI = top pole
    let x = Math.sin(ang) * rMax * 1.2;
    let y = lerpSmooth(bottom, top, t);
    for (let it = 0; it < 6; it++) {
      const d = sdPrimLocal(params, x, y, 0);
      const e = 1e-4;
      let gx = (sdPrimLocal(params, x + e, y, 0) - sdPrimLocal(params, x - e, y, 0)) / (2 * e);
      let gy = (sdPrimLocal(params, x, y + e, 0) - sdPrimLocal(params, x, y - e, 0)) / (2 * e);
      const gl = Math.hypot(gx, gy) || 1;
      x -= (gx / gl) * d;
      y -= (gy / gl) * d;
    }
    points.push(new THREE.Vector2(Math.max(x, 0), y));
  }
  // Lathe requires monotonic-ish profile starting at the axis; pin the poles.
  points[0].x = 0;
  points[points.length - 1].x = 0;

  const geo = new THREE.LatheGeometry(points, radialSegs);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  return geo;
}

function lerpSmooth(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Merge carrier geometries into one indexed BufferGeometry with an aPrim
 * attribute mapping every vertex to its primitive.
 */
export function mergeCarriers(carriers: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertCount = 0;
  let idxCount = 0;
  for (const c of carriers) {
    vertCount += c.attributes.position.count;
    idxCount += c.index ? c.index.count : c.attributes.position.count;
  }
  const positions = new Float32Array(vertCount * 3);
  const aPrim = new Float32Array(vertCount);
  const indices = vertCount > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);

  let vOff = 0;
  let iOff = 0;
  carriers.forEach((c, prim) => {
    const pos = c.attributes.position;
    positions.set(pos.array as Float32Array, vOff * 3);
    aPrim.fill(prim, vOff, vOff + pos.count);
    const idx = c.index;
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices[iOff + i] = idx.getX(i) + vOff;
      iOff += idx.count;
    } else {
      for (let i = 0; i < pos.count; i++) indices[iOff + i] = i + vOff;
      iOff += pos.count;
    }
    vOff += pos.count;
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aPrim', new THREE.BufferAttribute(aPrim, 1));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}
