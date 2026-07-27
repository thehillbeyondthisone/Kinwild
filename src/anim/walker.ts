import * as THREE from 'three';
import { BlendShellCharacter } from '../core/characterMesh';
import { PrimitiveSpec } from '../core/primitives';
import { edgesToLists } from '../core/blendGraph';
import { BodyFrame, GaitEngine, GaitLegConfig } from './gait';
import { dampAngle, placeSegment, solveTwoBone, yawQuat } from './ik';
import { Rope } from './rope';
import { getToonGradient } from '../shaders/materials';

export interface WalkerRopeDef {
  anchor: THREE.Vector3;
  dir: THREE.Vector3;
  segments: number;
  segLen: number;
  r: number;
  color: THREE.ColorRepresentation;
  erect?: number;
}

export interface WalkerLegDef {
  /** Hip anchor in body space (+z forward). */
  hip: THREE.Vector3;
  l1: number;
  l2: number;
  /** Leg thickness. */
  rUpper: number;
  rLower: number;
  group: number;
  color: THREE.ColorRepresentation;
  /** Outward splay of the neutral foot position. */
  splay?: number;
}

export interface WalkerArmDef {
  shoulder: THREE.Vector3;
  l1: number;
  l2: number;
  r: number;
  color: THREE.ColorRepresentation;
  /** +1 right side, -1 left side. */
  side: number;
}

export interface WalkerDef {
  /** Body prims: spec + offset in body space. First prim is the blend hub. */
  body: { spec: PrimitiveSpec; offset: THREE.Vector3; lieFlat?: boolean }[];
  head?: { spec: PrimitiveSpec; offset: THREE.Vector3; eyes?: { r: number; spread: number; y: number } };
  legs: WalkerLegDef[];
  arms?: WalkerArmDef[];
  ropes?: WalkerRopeDef[];
  /** Rest height of the body-space origin above ground. */
  bodyHeight: number;
  /** Extra blend edges between prim indices (on top of the auto rig edges). */
  extraEdges?: [number, number][];
  outlineWidth?: number;
}

const _fwd = new THREE.Vector3();
const _hipW = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _ankle = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * A legged critter: builds the blend-shell from a rig definition and drives
 * it with reactive gait + two-bone IK. Works for 2, 4, 6... legs purely by
 * configuration. Call `follow()` each frame with a target, then `update()`.
 */
export class Walker {
  readonly character: BlendShellCharacter;
  readonly group: THREE.Group;
  readonly gait: GaitEngine;
  readonly body: BodyFrame = {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    vel: new THREE.Vector3(),
  };
  heading = 0;
  speed = 1.2;

  private def: WalkerDef;
  private legPrim0: number; // index of first leg prim (2 per leg)
  private armPrim0 = -1;
  private headPrim = -1;
  private ropes: { rope: Rope; prim0: number; segLen: number }[] = [];
  private eyes?: THREE.Group;
  private target = new THREE.Vector3();
  private smoothVel = new THREE.Vector3();
  private lean = new THREE.Vector2(); // pitch, roll
  private bobY = 0;
  private initialized = false;

  constructor(def: WalkerDef) {
    this.def = def;
    const specs: PrimitiveSpec[] = [];
    const edges: [number, number][] = [...(def.extraEdges ?? [])];

    def.body.forEach((b, i) => {
      specs.push(b.spec);
      if (i > 0) edges.push([i - 1, i]);
    });
    if (def.head) {
      this.headPrim = specs.length;
      specs.push(def.head.spec);
      edges.push([0, this.headPrim]);
    }
    // Hosts pick the nearest anchor prim with neighbor budget left, so a
    // busy hub (hexapod front segment) sheds attachments to its neighbor
    // instead of overflowing the influence list.
    const hostLoad = new Map<number, number>();
    edges.forEach(([a, b]) => {
      hostLoad.set(a, (hostLoad.get(a) ?? 0) + 1);
      hostLoad.set(b, (hostLoad.get(b) ?? 0) + 1);
    });
    const pickHost = (
      anchor: THREE.Vector3,
      candidates: { index: number; offset: THREE.Vector3 }[],
    ): number => {
      const sorted = [...candidates].sort(
        (a, b) => a.offset.distanceTo(anchor) - b.offset.distanceTo(anchor),
      );
      const open = sorted.find((c) => (hostLoad.get(c.index) ?? 0) < 6) ?? sorted[0];
      hostLoad.set(open.index, (hostLoad.get(open.index) ?? 0) + 1);
      return open.index;
    };
    const bodyAnchors = def.body.map((b, i) => ({ index: i, offset: b.offset }));
    const allAnchors = def.head
      ? [...bodyAnchors, { index: this.headPrim, offset: def.head.offset }]
      : bodyAnchors;

    this.legPrim0 = specs.length;
    def.legs.forEach((leg) => {
      const upper = specs.length;
      const host = pickHost(leg.hip, bodyAnchors);
      // Limb blends scale with limb thickness — a fixed radius melts small legs.
      specs.push({ type: 'capsule', r: leg.rUpper, hl: leg.l1 / 2, color: leg.color, blend: leg.rUpper * 1.0 });
      specs.push({ type: 'capsule', r: leg.rLower, hl: leg.l2 / 2, color: leg.color, blend: leg.rLower * 0.9 });
      edges.push([host, upper], [upper, upper + 1]);
    });
    if (def.arms?.length) {
      this.armPrim0 = specs.length;
      def.arms.forEach((arm) => {
        const upper = specs.length;
        specs.push({ type: 'capsule', r: arm.r, hl: arm.l1 / 2, color: arm.color, blend: arm.r * 1.0 });
        specs.push({ type: 'capsule', r: arm.r * 0.9, hl: arm.l2 / 2, color: arm.color, blend: arm.r * 0.9 });
        edges.push([0, upper], [upper, upper + 1]);
      });
    }

    def.ropes?.forEach((r) => {
      const prim0 = specs.length;
      // Ropes may hang off the head too (antennae).
      const host = pickHost(r.anchor, allAnchors);
      for (let i = 0; i < r.segments; i++) {
        specs.push({ type: 'capsule', r: r.r, hl: r.segLen / 2, color: r.color, blend: r.r * 0.85 });
        edges.push(i === 0 ? [host, prim0] : [prim0 + i - 1, prim0 + i]);
      }
      this.ropes.push({ rope: new Rope(r.segments, r.segLen, { erect: r.erect ?? 0 }), prim0, segLen: r.segLen });
    });

    this.character = new BlendShellCharacter(specs, {
      influences: edgesToLists(specs.length, edges),
      outlineWidth: def.outlineWidth ?? 0.02,
    });
    this.group = new THREE.Group();
    this.group.add(this.character.group);

    this.gait = new GaitEngine(
      def.legs.map((leg): GaitLegConfig => ({
        hip: leg.hip,
        home: new THREE.Vector3(
          leg.hip.x + Math.sign(leg.hip.x) * (leg.splay ?? 0.05),
          0,
          leg.hip.z,
        ),
        group: leg.group,
      })),
      { trigger: Math.max(0.09, (def.legs[0].l1 + def.legs[0].l2) * 0.28) },
    );

    if (def.head?.eyes) this.buildEyes();
  }

  private buildEyes(): void {
    const eyeCfg = this.def.head!.eyes!;
    this.eyes = new THREE.Group();
    const white = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: getToonGradient() });
    const black = new THREE.MeshBasicMaterial({ color: 0x1a1c2c });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeCfg.r, 16, 12), white);
      eye.position.set(side * eyeCfg.spread, eyeCfg.y, 0);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeCfg.r * 0.55, 12, 10), black);
      pupil.position.z = eyeCfg.r * 0.62;
      eye.add(pupil);
      this.eyes.add(eye);
    }
    this.group.add(this.eyes);
  }

  /** Set the point the walker steers toward. */
  follow(target: THREE.Vector3): void {
    this.target.copy(target);
  }

  teleport(pos: THREE.Vector3, heading = 0): void {
    this.body.pos.copy(pos);
    this.body.pos.y = this.def.bodyHeight;
    this.heading = heading;
    yawQuat(this.body.quat, heading);
    this.gait.init(this.body);
    this.initialized = true;
  }

  update(dt: number, time = 0): void {
    if (!this.initialized) this.teleport(this.target);
    dt = Math.min(dt, 0.05);
    const def = this.def;

    // --- steering: turn toward target, walk forward, arrive smoothly ---
    _tmp.copy(this.target).sub(this.body.pos);
    _tmp.y = 0;
    const dist = _tmp.length();
    const desiredHeading = dist > 1e-3 ? Math.atan2(_tmp.x, _tmp.z) : this.heading;
    this.heading = dampAngle(this.heading, desiredHeading, 6, dt);
    yawQuat(this.body.quat, this.heading);
    const speed = Math.min(this.speed, dist * 1.8);
    _fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    _tmp2.copy(_fwd).multiplyScalar(speed);
    this.smoothVel.lerp(_tmp2, 1 - Math.exp(-8 * dt));
    this.body.pos.addScaledVector(this.smoothVel, dt);
    this.body.vel.copy(this.smoothVel);

    // --- feet ---
    this.gait.update(dt, this.body);

    // --- body posture: height from planted feet count, bob, lean ---
    const speedNow = this.smoothVel.length();
    const bobTarget =
      Math.sin(this.gait.phase * 2) * 0.018 * Math.min(speedNow / this.speed, 1) -
      this.gait.swingCount() * 0.006;
    this.bobY += (bobTarget - this.bobY) * (1 - Math.exp(-10 * dt));
    this.body.pos.y = def.bodyHeight + this.bobY;

    const pitchT = THREE.MathUtils.clamp(speedNow * 0.06, 0, 0.12);
    const rollT = Math.sin(this.gait.phase) * 0.03 * Math.min(speedNow / this.speed, 1);
    this.lean.x += (pitchT - this.lean.x) * (1 - Math.exp(-5 * dt));
    this.lean.y += (rollT - this.lean.y) * (1 - Math.exp(-5 * dt));
    this.body.quat.multiply(
      new THREE.Quaternion().setFromEuler(_e.set(this.lean.x, 0, this.lean.y)),
    );

    // --- place prims ---
    const prims = this.character.prims;
    def.body.forEach((b, i) => {
      const p = prims[i];
      p.position.copy(b.offset).applyQuaternion(this.body.quat).add(this.body.pos);
      p.quaternion.copy(this.body.quat);
      if (b.lieFlat) {
        p.quaternion.multiply(new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2, 0, 0)));
      }
    });
    if (this.headPrim >= 0) {
      const h = prims[this.headPrim];
      h.position.copy(def.head!.offset).applyQuaternion(this.body.quat).add(this.body.pos);
      h.position.y += Math.sin(this.gait.phase * 2 + 0.9) * 0.012;
      h.quaternion.copy(this.body.quat);
      if (this.eyes) {
        this.eyes.position.copy(h.position);
        this.eyes.quaternion.copy(h.quaternion);
      }
    }

    def.legs.forEach((leg, i) => {
      _hipW.copy(leg.hip).applyQuaternion(this.body.quat).add(this.body.pos);
      const foot = this.gait.legs[i].foot;
      _ankle.copy(foot);
      _ankle.y += leg.rLower * 0.9;
      // Never let the ankle escape leg reach — stranded feet must stretch
      // the leg toward them, not tear it apart.
      _tmp.copy(_ankle).sub(_hipW);
      const reach = (leg.l1 + leg.l2) * 0.99;
      if (_tmp.lengthSq() > reach * reach) {
        _ankle.copy(_hipW).addScaledVector(_tmp.normalize(), reach);
      }
      // Knees bend forward and slightly outward.
      _pole.copy(_fwd).addScaledVector(
        _tmp.set(Math.sign(leg.hip.x), 0, 0).applyQuaternion(this.body.quat),
        0.35,
      );
      solveTwoBone(_knee, _hipW, _ankle, leg.l1, leg.l2, _pole);
      placeSegment(prims[this.legPrim0 + i * 2], _hipW, _knee, leg.l1 / 2);
      placeSegment(prims[this.legPrim0 + i * 2 + 1], _knee, _ankle, leg.l2 / 2);
    });

    if (def.arms?.length && this.armPrim0 >= 0) {
      def.arms.forEach((arm, i) => {
        _hipW.copy(arm.shoulder).applyQuaternion(this.body.quat).add(this.body.pos);
        const swing = Math.sin(this.gait.phase + (arm.side > 0 ? Math.PI : 0)) *
          0.55 * Math.min(this.smoothVel.length() / this.speed, 1);
        // FK: upper arm hangs down, swings around body X; forearm adds bend.
        _tmp.set(0, -1, 0).applyAxisAngle(_tmp2.set(1, 0, 0), swing)
          .applyAxisAngle(_tmp2.set(0, 0, 1), -arm.side * 0.28)
          .applyQuaternion(this.body.quat);
        _knee.copy(_hipW).addScaledVector(_tmp, arm.l1);
        _tmp.applyAxisAngle(
          _tmp2.set(1, 0, 0).applyQuaternion(this.body.quat),
          swing * 0.5 - 0.35,
        );
        _ankle.copy(_knee).addScaledVector(_tmp, arm.l2);
        placeSegment(prims[this.armPrim0 + i * 2], _hipW, _knee, arm.l1 / 2);
        placeSegment(prims[this.armPrim0 + i * 2 + 1], _knee, _ankle, arm.l2 / 2);
      });
    }

    this.ropes.forEach((r, i) => {
      const rd = def.ropes![i];
      _tmp.copy(rd.anchor).applyQuaternion(this.body.quat).add(this.body.pos);
      _tmp2.copy(rd.dir).normalize().applyQuaternion(this.body.quat);
      r.rope.update(dt, _tmp, time, _tmp2);
      for (let s = 0; s < r.rope.pts.length - 1; s++) {
        placeSegment(prims[r.prim0 + s], r.rope.pts[s].p, r.rope.pts[s + 1].p, r.segLen / 2);
      }
    });

    this.character.sync();
  }
}
