import * as THREE from 'three';
import { CritterDNA, normalizeDNA, paletteColor } from './schema';
import { PrimitiveSpec } from '../core/primitives';
import { Walker, WalkerDef, WalkerRopeDef } from '../anim/walker';
import { Hopper, HopperDef } from '../anim/hopper';
import { Flyer, FlyerDef } from '../anim/flyer';
import { Wiggler, WigglerDef } from '../anim/wiggler';

/** Common handle the demo drives, whatever the locomotion mode. */
export interface Critter {
  dna: CritterDNA;
  group: THREE.Group;
  /** ground-projected position the critter is at (for pathing) */
  position(): THREE.Vector3;
  follow(target: THREE.Vector3): void;
  update(dt: number, time: number): void;
  dispose(): void;
}

const v3 = (a: [number, number, number] | undefined, def: [number, number, number] = [0, 0, 0]) =>
  new THREE.Vector3(...(a ?? def));

function bodySpec(dna: CritterDNA, i: number): PrimitiveSpec {
  const seg = dna.body[i];
  const color = paletteColor(dna, seg.color, 0);
  if (seg.shape === 'sphere') {
    return { type: 'sphere', r: seg.size[0], color, blend: seg.size[0] * 0.5 };
  }
  if (seg.shape === 'capsule') {
    return { type: 'capsule', r: seg.size[0], hl: seg.size[1], color, blend: seg.size[0] * 0.5 };
  }
  return {
    type: 'cone',
    r: seg.size[0],
    hl: seg.size[1],
    r2: seg.size[2] ?? seg.size[0] * 0.72,
    color,
    blend: seg.size[0] * 0.5,
  };
}

function ropeDefs(dna: CritterDNA): WalkerRopeDef[] {
  return (dna.ropes ?? []).map((r) => {
    const sx = Math.sign(r.at[0]) || 0;
    const presets = {
      ear: { dir: new THREE.Vector3(sx * 0.25, 1, -0.15), erect: 13 },
      antenna: { dir: new THREE.Vector3(sx * 0.15, 1, 0.2), erect: 16 },
      tail: { dir: new THREE.Vector3(0, -0.35, -1), erect: 0 },
    } as const;
    const p = presets[r.kind];
    const segments = r.segments ?? 2;
    return {
      anchor: v3(r.at),
      dir: p.dir.clone(),
      segments,
      segLen: r.length / segments,
      r: r.thickness,
      color: paletteColor(dna, r.color, 1),
      erect: p.erect,
    };
  });
}

function headFor(dna: CritterDNA) {
  if (!dna.head) return undefined;
  return {
    spec: {
      type: 'sphere' as const,
      r: dna.head.size,
      color: paletteColor(dna, dna.head.color, 1),
      blend: dna.head.size * 0.45,
    },
    offset: v3(dna.head.at),
    eyes: dna.head.eyes
      ? { r: dna.head.eyes, spread: dna.head.size * 0.38, y: dna.head.size * 0.12 }
      : undefined,
  };
}

function buildWalker(dna: CritterDNA): Walker {
  const legs = dna.legs!;
  const r0 = dna.body[0].size[0];
  const bodyHeight = legs.length * 0.95 + r0 * 0.3;
  const hipY = -r0 * 0.32;
  const l1 = legs.length * 0.52;
  const l2 = legs.length * 0.52;
  const legColor = paletteColor(dna, legs.color, 2);

  const zs = legs.count === 2 ? [0] : legs.count === 4
    ? [legs.spread!, -legs.spread!]
    : [legs.spread!, 0, -legs.spread!];
  const legDefs = zs.flatMap((z, row) =>
    [-1, 1].map((side, col) => ({
      hip: new THREE.Vector3(side * legs.stance, hipY, z),
      l1,
      l2,
      rUpper: legs.thickness,
      rLower: legs.thickness * 0.82,
      // pairs alternate; diagonals/tripods fall out of row+col parity
      group: (row + col) % 2,
      color: legColor,
      splay: legs.thickness * 1.2,
    })),
  );

  const def: WalkerDef = {
    body: dna.body.map((seg, i) => ({
      spec: bodySpec(dna, i),
      offset: v3(seg.at),
      lieFlat: seg.flat,
    })),
    head: headFor(dna),
    legs: legDefs,
    arms: dna.arms
      ? [-1, 1].map((side) => ({
          shoulder: new THREE.Vector3(side * (r0 * 0.95), dna.arms!.height ?? r0 * 0.85, 0),
          l1: dna.arms!.length * 0.55,
          l2: dna.arms!.length * 0.5,
          r: dna.arms!.thickness,
          color: paletteColor(dna, dna.arms!.color, 0),
          side,
        }))
      : undefined,
    ropes: ropeDefs(dna),
    bodyHeight,
  };
  const w = new Walker(def);
  w.speed = dna.speed ?? 1.1;
  return w;
}

function buildHopper(dna: CritterDNA): Hopper {
  const r0 = dna.body[0].size[0];
  const def: HopperDef = {
    body: bodySpec(dna, 0),
    head: dna.head
      ? { type: 'sphere', r: dna.head.size, color: paletteColor(dna, dna.head.color, 1), blend: dna.head.size * 0.45 }
      : { type: 'sphere', r: r0 * 0.6, color: paletteColor(dna, 1), blend: r0 * 0.28 },
    headOffset: v3(dna.head?.at, [0, r0 * 0.95, r0 * 0.6]),
    eyes: dna.head?.eyes
      ? { r: dna.head.eyes, spread: dna.head.size * 0.38, y: dna.head.size * 0.12 }
      : undefined,
    ropes: ropeDefs(dna),
    feet: [-1, 1].map((side) => ({
      offset: new THREE.Vector3(side * r0 * 0.5, -r0 * 0.82, r0 * 0.3),
      r: r0 * 0.24,
      hl: r0 * 0.34,
      color: paletteColor(dna, 2),
    })),
    restHeight: r0 * 1.18,
  };
  const h = new Hopper(def);
  h.hopLen = 0.55 + (dna.speed ?? 1.1) * 0.4;
  return h;
}

function buildFlyer(dna: CritterDNA): Flyer {
  const r0 = dna.body[0].size[0];
  const tailDna = (dna.ropes ?? []).find((r) => r.kind === 'tail');
  const def: FlyerDef = {
    body: bodySpec(dna, 0),
    head: dna.head
      ? { type: 'sphere', r: dna.head.size, color: paletteColor(dna, dna.head.color, 1), blend: dna.head.size * 0.42 }
      : { type: 'sphere', r: r0 * 0.65, color: paletteColor(dna, 1), blend: r0 * 0.26 },
    headOffset: v3(dna.head?.at, [0, r0 * 0.7, r0]),
    beak: dna.head?.beak
      ? {
          type: 'cone',
          r: dna.head.beak[0],
          r2: dna.head.beak[0] * 0.18,
          hl: dna.head.beak[1] / 2,
          color: paletteColor(dna, dna.head.beakColor, 2),
          blend: 0.02,
        }
      : undefined,
    beakOffset: dna.head?.beak ? new THREE.Vector3(0, -dna.head.size * 0.08, dna.head.size * 0.85) : undefined,
    eyes: dna.head?.eyes
      ? { r: dna.head.eyes, spread: dna.head.size * 0.4, y: dna.head.size * 0.18 }
      : undefined,
    wing: {
      r: dna.wings!.thickness,
      len: dna.wings!.length,
      color: paletteColor(dna, dna.wings!.color, 2),
      thin: 0.5,
    },
    wingAnchor: new THREE.Vector3(r0 * 0.85, r0 * 0.3, 0),
    feet: [-1, 1].map((side) => ({
      offset: new THREE.Vector3(side * r0 * 0.35, -r0 * 0.75, -r0 * 0.1),
      r: r0 * 0.16,
      hl: r0 * 0.28,
      color: paletteColor(dna, 2),
    })),
    tail: tailDna
      ? {
          segments: tailDna.segments ?? 2,
          segLen: tailDna.length / (tailDna.segments ?? 2),
          r: tailDna.thickness,
          color: paletteColor(dna, tailDna.color, 2),
          anchor: new THREE.Vector3(0, r0 * 0.1, -r0 * 0.9),
        }
      : undefined,
    altitude: dna.altitude ?? 1.4,
  };
  const f = new Flyer(def);
  f.speed = dna.speed ?? 1.3;
  return f;
}

function buildWiggler(dna: CritterDNA): Wiggler {
  const segs =
    dna.body.length >= 3
      ? dna.body.map((b, i) => ({ r: b.size[0], color: paletteColor(dna, b.color, i % 2) }))
      : Array.from({ length: 6 }, (_, i) => ({
          r: dna.body[0].size[0] * (1 - i * 0.11),
          color: paletteColor(dna, i % 2, i % 2),
        }));
  const def: WigglerDef = {
    segments: segs,
    segLen: segs[0].r * 1.05,
    eyes: dna.head?.eyes
      ? { r: dna.head.eyes, spread: segs[0].r * 0.42, y: segs[0].r * 0.3 }
      : { r: segs[0].r * 0.22, spread: segs[0].r * 0.42, y: segs[0].r * 0.3 },
  };
  const w = new Wiggler(def);
  w.speed = dna.speed ?? 0.9;
  return w;
}

export function createCritter(raw: CritterDNA): Critter {
  const { dna, notes } = normalizeDNA(raw);
  if (notes.length) console.info(`[critter:${dna.name}]`, notes.join('; '));

  let impl: Walker | Hopper | Flyer | Wiggler;
  switch (dna.mode) {
    case 'walker': impl = buildWalker(dna); break;
    case 'hopper': impl = buildHopper(dna); break;
    case 'flyer': impl = buildFlyer(dna); break;
    case 'wiggler': impl = buildWiggler(dna); break;
  }
  const anyImpl = impl as { pos?: THREE.Vector3; body?: { pos: THREE.Vector3 } };
  return {
    dna,
    group: impl.group,
    position: () =>
      anyImpl.pos ?? anyImpl.body?.pos ?? (impl as Wiggler).character.prims[0].position,
    follow: (t) => impl.follow(t),
    update: (dt, time) => impl.update(dt, time),
    dispose: () => impl.character.dispose(),
  };
}
