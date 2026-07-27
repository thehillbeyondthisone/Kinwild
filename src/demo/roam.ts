import * as THREE from 'three';
import { Critter } from '../creatures/factory';

export interface RoamOptions {
  /** Radius of the area critters wander within. */
  range?: number;
  /** Extra spacing kept between critters, on top of their radii. */
  spacing?: number;
}

interface Agent {
  critter: Critter;
  /** Where it currently wants to be. */
  goal: THREE.Vector3;
  /** Goal after separation push — what the critter actually follows. */
  steer: THREE.Vector3;
  /** Per-critter gaze point (lookAt keeps the reference, so never shared). */
  gaze: THREE.Vector3;
  radius: number;
  /** Seconds left standing still before picking a new goal. */
  idleFor: number;
  /** Which idle emote is playing: 0 none, 1 sniff, 2 look around. */
  emote: number;
  emoteT: number;
  seed: number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _push = new THREE.Vector3();

/**
 * Wander behavior for the whole roster: each critter picks a waypoint,
 * travels to it, idles a beat (sometimes sniffing or looking around), then
 * picks another. Separation acts on *goals* rather than positions — nudging
 * where they want to be, so the locomotion systems stay in charge and
 * nothing gets teleported out of a stride.
 */
export class Roam {
  private agents: Agent[] = [];
  private range: number;
  private spacing: number;

  constructor(opts: RoamOptions = {}) {
    this.range = opts.range ?? 7;
    this.spacing = opts.spacing ?? 0.35;
  }

  add(critter: Critter): void {
    const goal = new THREE.Vector3();
    const agent: Agent = {
      critter,
      goal,
      steer: new THREE.Vector3(),
      gaze: new THREE.Vector3(),
      radius: critter.bounds(_a) * 0.42,
      idleFor: Math.random() * 2,
      emote: 0,
      emoteT: 0,
      seed: Math.random() * 100,
    };
    this.pickGoal(agent);
    // Start where the goal is so nobody walks in from the origin.
    critter.follow(goal);
    this.agents.push(agent);
  }

  remove(critter: Critter): void {
    const i = this.agents.findIndex((a) => a.critter === critter);
    if (i >= 0) this.agents.splice(i, 1);
  }

  private pickGoal(a: Agent): void {
    const ang = Math.random() * Math.PI * 2;
    // sqrt keeps the distribution even instead of clustering at the center
    const r = Math.sqrt(Math.random()) * this.range;
    a.goal.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    a.steer.copy(a.goal);
  }

  update(dt: number, t: number, camera: THREE.Camera): void {
    // --- goals: arrive, idle, pick again ---
    for (const a of this.agents) {
      a.critter.bounds(_a);
      _a.y = 0;
      const arrived = _a.distanceTo(a.goal) < 0.45;
      if (arrived) {
        if (a.idleFor <= 0) {
          // Just landed at the goal: idle, and maybe play an emote.
          a.idleFor = 1 + Math.random() * 3;
          a.emote = Math.random() < 0.55 ? (Math.random() < 0.5 ? 1 : 2) : 0;
          a.emoteT = 0;
        } else {
          a.idleFor -= dt;
          a.emoteT += dt;
          if (a.idleFor <= 0) {
            this.pickGoal(a);
            a.emote = 0;
          }
        }
      }
    }

    // --- separation: push overlapping goals apart ---
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      a.steer.copy(a.goal);
      if (a.critter.dna.mode === 'flyer') continue; // flyers use altitude
      a.critter.bounds(_a);
      _a.y = 0;
      _push.set(0, 0, 0);
      for (let j = 0; j < this.agents.length; j++) {
        if (i === j) continue;
        const b = this.agents[j];
        if (b.critter.dna.mode === 'flyer') continue;
        b.critter.bounds(_b);
        _b.y = 0;
        const min = a.radius + b.radius + this.spacing;
        const d = _a.distanceTo(_b);
        if (d < min && d > 1e-4) {
          _push.add(_b.sub(_a).multiplyScalar(-(min - d) / d));
        }
      }
      if (_push.lengthSq() > 1e-6) {
        a.steer.add(_push.multiplyScalar(1.4));
        // Being crowded ends an idle early — they shuffle out of the way.
        if (a.idleFor > 0.4) a.idleFor = 0.4;
      }
    }

    // --- drive ---
    for (const a of this.agents) {
      a.critter.follow(a.steer);
      a.critter.update(dt, t);
    }

    this.updateGaze(t, camera);
  }

  /**
   * Look at the nearest neighbor, with periodic glances at the viewer and
   * emote-driven overrides (sniff = look at the ground ahead, look-around =
   * sweep side to side).
   */
  private updateGaze(t: number, camera: THREE.Camera): void {
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      a.critter.bounds(_a);

      if (a.emote === 1) {
        // Sniff: nose down at the ground just in front, twice.
        const h = a.critter.heading();
        const dip = Math.sin(a.emoteT * 7) > 0 ? 0.0 : 0.25;
        a.gaze.set(_a.x + Math.sin(h) * 0.8, dip, _a.z + Math.cos(h) * 0.8);
        a.critter.lookAt(a.gaze);
        continue;
      }
      if (a.emote === 2) {
        // Look around: sweep left and right of the facing direction.
        const h = a.critter.heading() + Math.sin(a.emoteT * 1.3) * 1.1;
        a.gaze.set(_a.x + Math.sin(h) * 2, _a.y, _a.z + Math.cos(h) * 2);
        a.critter.lookAt(a.gaze);
        continue;
      }

      let found = false;
      let bestD = 3.2;
      for (let j = 0; j < this.agents.length; j++) {
        if (i === j) continue;
        const rad = this.agents[j].critter.bounds(_b);
        const d = _a.distanceTo(_b);
        if (d < bestD) {
          bestD = d;
          found = true;
          a.gaze.set(_b.x, _b.y + rad * 0.12, _b.z);
        }
      }
      // Every ~9s, a 2s look at the viewer — staggered so they never all
      // turn in unison.
      const glance = (t + a.seed) % 9;
      a.critter.lookAt(glance < 2 ? camera.position : found ? a.gaze : null);
    }
  }
}
