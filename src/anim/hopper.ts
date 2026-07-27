import * as THREE from 'three';
import { BlendShellCharacter } from '../core/characterMesh';
import { PrimitiveSpec } from '../core/primitives';
import { edgesToLists } from '../core/blendGraph';
import { dampAngle, placeSegment, yawQuat } from './ik';
import { Rope } from './rope';
import { CritterEyes, EyesConfig } from './eyes';
import { LookAt } from './look';

export interface HopperDef {
  body: PrimitiveSpec;
  head: PrimitiveSpec;
  headOffset: THREE.Vector3;
  eyes?: EyesConfig;
  /** Rope appendages anchored in body space. */
  ropes: {
    anchor: THREE.Vector3;
    segments: number;
    segLen: number;
    r: number;
    color: THREE.ColorRepresentation;
    /** rest/lay direction in body space (ears point up, tails back). */
    dir: THREE.Vector3;
    /** stiffness pulling toward dir; 0 = floppy tail, ~14 = perky ear. */
    erect?: number;
  }[];
  feet?: { offset: THREE.Vector3; r: number; hl: number; color: THREE.ColorRepresentation }[];
  restHeight: number;
  hopRange?: number;
}

type HopState = 'idle' | 'crouch' | 'air' | 'land';

const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _anchor = new THREE.Vector3();

/**
 * Squash-and-stretch hopper: crouch → launch → ballistic air → landing
 * squash, with rope ears/tail lagging behind through every phase. The
 * squash drives non-uniform prim scale, exercising the shell's
 * conservative-distance path.
 */
export class Hopper {
  readonly character: BlendShellCharacter;
  readonly group: THREE.Group;
  pos = new THREE.Vector3();
  heading = 0;
  hopLen = 0.9;
  /** Fired on landing; strength scales with impact speed. */
  onLand?: (pos: THREE.Vector3, strength: number) => void;

  private def: HopperDef;
  private ropes: { rope: Rope; prim0: number; segLen: number; r: number }[] = [];
  private feet0 = -1;
  private eyes?: CritterEyes;
  readonly look = new LookAt();
  private state: HopState = 'idle';
  private stateT = 0;
  private pause = 0.4;
  private vel = new THREE.Vector3();
  private squash = 1; // y scale; xz derive as 1/sqrt
  private squashV = 0;
  private squashTarget = 1;
  private target = new THREE.Vector3();
  private initialized = false;

  constructor(def: HopperDef) {
    this.def = def;
    const specs: PrimitiveSpec[] = [def.body, def.head];
    const edges: [number, number][] = [[0, 1]];

    def.ropes.forEach((r) => {
      const prim0 = specs.length;
      for (let i = 0; i < r.segments; i++) {
        specs.push({ type: 'capsule', r: r.r, hl: r.segLen / 2, color: r.color, blend: r.r * 0.85 });
        edges.push(i === 0 ? [r.anchor.y > def.headOffset.y * 0.6 ? 1 : 0, prim0] : [prim0 + i - 1, prim0 + i]);
      }
      this.ropes.push({
        rope: new Rope(r.segments, r.segLen, { erect: r.erect ?? 0 }),
        prim0,
        segLen: r.segLen,
        r: r.r,
      });
    });

    if (def.feet?.length) {
      this.feet0 = specs.length;
      def.feet.forEach((f) => {
        specs.push({ type: 'capsule', r: f.r, hl: f.hl, color: f.color, blend: f.r * 0.9 });
        edges.push([0, specs.length - 1]);
      });
    }

    this.character = new BlendShellCharacter(specs, {
      influences: edgesToLists(specs.length, edges),
      outlineWidth: 0.02,
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

  /** Petting makes it hop right now, no matter where it was in the cycle. */
  pet(time: number): void {
    if (this.state !== 'air') {
      this.setState('crouch');
      this.stateT = 0.12;
    }
    this.eyes?.happy(time);
  }

  update(dt: number, time: number): void {
    dt = Math.min(dt, 0.05);
    const def = this.def;
    if (!this.initialized) {
      this.pos.copy(this.target);
      this.pos.y = def.restHeight;
      const q = new THREE.Quaternion();
      yawQuat(q, this.heading);
      this.ropes.forEach((r, i) => {
        _anchor.copy(def.ropes[i].anchor).applyQuaternion(q).add(this.pos);
        _dir.copy(def.ropes[i].dir).applyQuaternion(q);
        r.rope.reset(_anchor, _dir);
      });
      this.initialized = true;
    }
    this.stateT += dt;

    _dir.copy(this.target).sub(this.pos);
    _dir.y = 0;
    const dist = _dir.length();

    switch (this.state) {
      case 'idle': {
        this.squashTarget = 1 + Math.sin(time * 2.2) * 0.015; // breathing
        if (dist > 1e-3) {
          this.heading = dampAngle(this.heading, Math.atan2(_dir.x, _dir.z), 5, dt);
        }
        if (dist > 0.3 && this.stateT > this.pause) this.setState('crouch');
        break;
      }
      case 'crouch': {
        this.squashTarget = 0.72;
        if (this.stateT > 0.2) {
          const hop = Math.min(dist, this.hopLen * (def.hopRange ?? 1));
          const airT = 0.42 + hop * 0.12;
          _dir.normalize();
          this.vel.copy(_dir).multiplyScalar(hop / airT);
          this.vel.y = 9.8 * airT * 0.5;
          this.squashTarget = 1.28; // launch stretch
          this.setState('air');
        }
        break;
      }
      case 'air': {
        this.vel.y -= 9.8 * dt;
        this.pos.addScaledVector(this.vel, dt);
        // Stretch along flight, easing toward neutral at apex.
        this.squashTarget = 1 + THREE.MathUtils.clamp(Math.abs(this.vel.y) * 0.045, 0, 0.3);
        if (this.pos.y <= def.restHeight && this.vel.y < 0) {
          this.pos.y = def.restHeight;
          this.squash = 1 - Math.min(-this.vel.y * 0.05, 0.32); // impact
          this.squashV = 0;
          const impact = Math.min(-this.vel.y * 0.28, 1);
          this.vel.set(0, 0, 0);
          this.pause = 0.25 + Math.random() * 0.5;
          this.setState('land');
          _tmp.copy(this.pos);
          _tmp.y = 0;
          this.onLand?.(_tmp, impact);
        }
        break;
      }
      case 'land': {
        this.squashTarget = 1;
        if (this.stateT > 0.28) this.setState('idle');
        break;
      }
    }

    // Springy squash toward target (slight overshoot sells the bounce).
    const k = 26;
    const damp = 7.5;
    this.squashV += (this.squashTarget - this.squash) * k * dt;
    this.squashV *= Math.exp(-damp * dt);
    this.squash += this.squashV * dt;

    this.placePrims(dt, time);
  }

  private setState(s: HopState): void {
    this.state = s;
    this.stateT = 0;
  }

  private placePrims(dt: number, time: number): void {
    const def = this.def;
    const prims = this.character.prims;
    const q = new THREE.Quaternion();
    yawQuat(q, this.heading);

    const sy = this.squash;
    const sxz = 1 / Math.sqrt(Math.max(sy, 0.3));
    const groundY = this.pos.y - def.restHeight;

    const squashPoint = (out: THREE.Vector3, offset: THREE.Vector3): THREE.Vector3 => {
      out.copy(offset).applyQuaternion(q);
      out.x *= sxz;
      out.z *= sxz;
      out.y = (out.y + def.restHeight) * sy - def.restHeight;
      return out.add(this.pos);
    };

    // Body at origin offset.
    prims[0].position.copy(squashPoint(_tmp, _tmp.set(0, 0, 0)));
    prims[0].quaternion.copy(q);
    prims[0].scale.set(sxz, sy, sxz);

    prims[1].position.copy(squashPoint(_tmp, def.headOffset));
    this.look.update(dt, prims[1].position, this.heading, q, prims[1].quaternion);
    prims[1].scale.set(sxz, sy, sxz);
    if (this.eyes) {
      this.eyes.track(prims[1].position, prims[1].quaternion, time);
      if (this.look.target) this.eyes.lookAt(this.look.target);
      // Counter most of the body squash so eyes stay round-ish.
      const es = 1 / Math.max(sy, 0.6);
      this.eyes.group.scale.set(1, Math.min(es, 1.15), 1);
    }

    this.ropes.forEach((r, i) => {
      squashPoint(_anchor, def.ropes[i].anchor);
      _dir.copy(def.ropes[i].dir).normalize().applyQuaternion(q);
      r.rope.update(dt, _anchor, time, _dir);
      for (let s = 0; s < r.rope.pts.length - 1; s++) {
        placeSegment(prims[r.prim0 + s], r.rope.pts[s].p, r.rope.pts[s + 1].p, r.segLen / 2);
      }
    });

    if (this.feet0 >= 0 && def.feet) {
      def.feet.forEach((f, i) => {
        const p = prims[this.feet0 + i];
        squashPoint(_tmp, f.offset);
        // Feet stay planted-ish: pull them to ground level unless airborne.
        if (groundY < 0.02) _tmp.y = Math.min(_tmp.y, f.r);
        p.position.copy(_tmp);
        p.quaternion.copy(q).multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
        );
      });
    }

    this.character.sync();
  }
}
