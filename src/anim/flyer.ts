import * as THREE from 'three';
import { BlendShellCharacter } from '../core/characterMesh';
import { PrimitiveSpec } from '../core/primitives';
import { edgesToLists } from '../core/blendGraph';
import { dampAngle, placeSegment, yawQuat } from './ik';
import { Rope } from './rope';
import { CritterEyes, EyesConfig } from './eyes';
import { LookAt } from './look';

export interface FlyerDef {
  body: PrimitiveSpec;
  head: PrimitiveSpec;
  headOffset: THREE.Vector3;
  beak?: PrimitiveSpec;
  beakOffset?: THREE.Vector3;
  eyes?: EyesConfig;
  wing: { r: number; len: number; color: THREE.ColorRepresentation; thin: number };
  wingAnchor: THREE.Vector3;
  /** Dangly feet. */
  feet?: { r: number; hl: number; color: THREE.ColorRepresentation; offset: THREE.Vector3 }[];
  tail?: { segments: number; segLen: number; r: number; color: THREE.ColorRepresentation; anchor: THREE.Vector3 };
  altitude: number;
  flapHz?: number;
}

const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _anchor = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/**
 * Hovering flyer: drifts toward a moving target with noise wander, banks
 * into turns, flaps wings on an oscillator with a wingbeat bob, and drags
 * dangly feet + a rope tail behind it.
 */
export class Flyer {
  readonly character: BlendShellCharacter;
  readonly group: THREE.Group;
  pos = new THREE.Vector3();
  heading = 0;
  speed = 1.4;

  private def: FlyerDef;
  private wing0: number;
  private feet0 = -1;
  private tail?: { rope: Rope; prim0: number; segLen: number };
  private eyes?: CritterEyes;
  readonly look = new LookAt();
  private vel = new THREE.Vector3();
  private roll = 0;
  private pitch = 0;
  private target = new THREE.Vector3();
  private flapPhase = Math.random() * 10;
  private initialized = false;

  constructor(def: FlyerDef) {
    this.def = def;
    const specs: PrimitiveSpec[] = [def.body, def.head];
    const edges: [number, number][] = [[0, 1]];
    if (def.beak) {
      specs.push(def.beak);
      edges.push([1, specs.length - 1]);
    }
    this.wing0 = specs.length;
    for (let i = 0; i < 2; i++) {
      specs.push({
        type: 'capsule',
        r: def.wing.r,
        hl: def.wing.len / 2,
        color: def.wing.color,
        blend: def.wing.r * 0.6,
      });
      edges.push([0, this.wing0 + i]);
    }
    if (def.feet?.length) {
      this.feet0 = specs.length;
      def.feet.forEach((f) => {
        specs.push({ type: 'capsule', r: f.r, hl: f.hl, color: f.color, blend: f.r * 0.85 });
        edges.push([0, specs.length - 1]);
      });
    }
    if (def.tail) {
      const prim0 = specs.length;
      for (let i = 0; i < def.tail.segments; i++) {
        specs.push({
          type: 'capsule',
          r: def.tail.r,
          hl: def.tail.segLen / 2,
          color: def.tail.color,
          blend: def.tail.r * 0.85,
        });
        edges.push(i === 0 ? [0, prim0] : [prim0 + i - 1, prim0 + i]);
      }
      this.tail = { rope: new Rope(def.tail.segments, def.tail.segLen, { gravity: 3.2 }), prim0, segLen: def.tail.segLen };
    }

    this.character = new BlendShellCharacter(specs, {
      influences: edgesToLists(specs.length, edges),
      outlineWidth: 0.018,
    });
    this.group = new THREE.Group();
    this.group.add(this.character.group);

    if (def.eyes) {
      this.eyes = new CritterEyes(def.eyes);
      this.group.add(this.eyes.group);
    }
  }

  follow(target: THREE.Vector3): void {
    this.target.copy(target);
  }

  /** Startled flutter: a pop upward and a burst of flapping. */
  pet(time: number): void {
    this.vel.y += 1.6;
    this.flapPhase += 1.2;
    this.eyes?.happy(time);
  }

  update(dt: number, time: number): void {
    dt = Math.min(dt, 0.05);
    const def = this.def;
    if (!this.initialized) {
      this.pos.copy(this.target);
      this.pos.y = def.altitude;
      if (this.tail) {
        yawQuat(_q, this.heading);
        _anchor.copy(def.tail!.anchor).applyQuaternion(_q).add(this.pos);
        this.tail.rope.reset(_anchor, _dir.set(0, -0.4, -1).normalize());
      }
      this.initialized = true;
    }

    // Steering with gentle wander.
    _tmp.copy(this.target);
    _tmp.y = def.altitude + Math.sin(time * 0.9 + this.flapPhase) * 0.12;
    _dir.copy(_tmp).sub(this.pos);
    const dist = _dir.length();
    _tmp2.copy(_dir);
    if (dist > 1e-6) _tmp2.multiplyScalar(Math.min(this.speed, dist * 1.6) / dist);
    this.vel.lerp(_tmp2, 1 - Math.exp(-2.5 * dt));
    this.pos.addScaledVector(this.vel, dt);

    const flatSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (flatSpeed > 0.05) {
      this.heading = dampAngle(this.heading, Math.atan2(this.vel.x, this.vel.z), 4, dt);
    }

    // Bank into the turn, pitch with climb.
    yawQuat(_q, this.heading);
    _tmp.set(1, 0, 0).applyQuaternion(_q);
    const latVel = this.vel.dot(_tmp);
    this.roll += (THREE.MathUtils.clamp(-latVel * 0.55, -0.5, 0.5) - this.roll) * (1 - Math.exp(-4 * dt));
    this.pitch += (THREE.MathUtils.clamp(-this.vel.y * 0.4 + flatSpeed * 0.12, -0.4, 0.4) - this.pitch) * (1 - Math.exp(-4 * dt));

    this.flapPhase += dt * Math.PI * 2 * (def.flapHz ?? 3.4) * (1 + flatSpeed * 0.15);
    this.placePrims(dt, time);
  }

  private placePrims(dt: number, time: number): void {
    const def = this.def;
    const prims = this.character.prims;
    yawQuat(_q, this.heading);
    _q.multiply(new THREE.Quaternion().setFromEuler(_e.set(this.pitch, 0, this.roll)));

    const flap = Math.sin(this.flapPhase);
    const bodyY = this.pos.y + Math.max(0, -flap) * 0.035; // wingbeat bob

    _tmp.copy(this.pos);
    _tmp.y = bodyY;
    prims[0].position.copy(_tmp);
    prims[0].quaternion.copy(_q);

    let pi = 1;
    _tmp2.copy(def.headOffset).applyQuaternion(_q).add(_tmp);
    prims[pi].position.copy(_tmp2);
    this.look.update(dt, _tmp2, this.heading, _q, prims[pi].quaternion);
    this.eyes?.track(_tmp2, prims[pi].quaternion, time);
    if (this.look.target) this.eyes?.lookAt(this.look.target);
    pi++;
    if (def.beak && def.beakOffset) {
      _tmp2.copy(def.beakOffset).applyQuaternion(_q).add(prims[1].position);
      prims[pi].position.copy(_tmp2);
      prims[pi].quaternion.copy(_q).multiply(
        new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2, 0, 0)),
      );
      pi++;
    }

    // Wings: hinge at the shoulder, sweep up/down with the flap oscillator.
    for (const side of [-1, 1]) {
      const idx = this.wing0 + (side < 0 ? 0 : 1);
      const ang = flap * 0.75 - 0.12;
      _anchor.copy(def.wingAnchor);
      _anchor.x *= side;
      _anchor.applyQuaternion(_q).add(prims[0].position);
      _dir.set(side, 0, 0)
        .applyAxisAngle(_tmp2.set(0, 0, 1), side * -ang)
        .applyQuaternion(_q);
      _tmp2.copy(_anchor).addScaledVector(_dir, def.wing.len);
      placeSegment(prims[idx], _anchor, _tmp2, def.wing.len / 2);
      prims[idx].scale.set(1, 1, def.wing.thin);
      // placeSegment sets scale.y for stretch; wings keep length, flatten in z.
      prims[idx].scale.y = 1;
    }

    if (this.feet0 >= 0 && def.feet) {
      def.feet.forEach((f, i) => {
        const p = prims[this.feet0 + i];
        // Dangle down, lagging opposite the motion.
        _dir.set(-this.vel.x * 0.12, -1, -this.vel.z * 0.12).normalize();
        _tmp2.copy(f.offset).applyQuaternion(_q).add(prims[0].position);
        p.position.copy(_tmp2).addScaledVector(_dir, f.hl);
        p.quaternion.setFromUnitVectors(_tmp.set(0, 1, 0), _dir);
      });
    }

    if (this.tail && def.tail) {
      _anchor.copy(def.tail.anchor).applyQuaternion(_q).add(prims[0].position);
      this.tail.rope.update(dt, _anchor, time);
      for (let s = 0; s < this.tail.rope.pts.length - 1; s++) {
        placeSegment(
          prims[this.tail.prim0 + s],
          this.tail.rope.pts[s].p,
          this.tail.rope.pts[s + 1].p,
          this.tail.segLen / 2,
        );
      }
    }

    this.character.sync();
  }
}
