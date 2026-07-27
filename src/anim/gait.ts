import * as THREE from 'three';

export interface GaitLegConfig {
  /** Hip anchor in body space (+z forward, y up). */
  hip: THREE.Vector3;
  /** Neutral foot offset in body space (usually hip.xz splayed slightly out). */
  home: THREE.Vector3;
  /** Phase group; a leg steps only while every other group is planted. */
  group: number;
}

export interface GaitOptions {
  /** Seconds a swing takes at reference speed. */
  stepDur?: number;
  /** Swing arc height as a fraction of trigger distance. */
  liftRatio?: number;
  /** Foot error (m) that triggers a step, at standstill. */
  trigger?: number;
  /** How much the trigger grows with speed (s). */
  triggerLead?: number;
}

export interface BodyFrame {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  vel: THREE.Vector3;
}

interface LegState {
  foot: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  swingT: number;
  swinging: boolean;
  /** 0..1 how recently this foot landed — drives body reactions. */
  landPulse: number;
}

const _home = new THREE.Vector3();
const _desired = new THREE.Vector3();

/**
 * Reactive stepping for any leg count. Feet stay planted in world space
 * until their error vs. the (velocity-led) home position exceeds a trigger,
 * then swing along an arc to an overshot target. Phase groups enforce
 * alternation: pairs for bipeds, diagonals for quadrupeds, tripods for
 * hexapods — all just group assignments.
 */
export class GaitEngine {
  readonly legs: LegState[];
  private cfg: GaitLegConfig[];
  private stepDur: number;
  private liftRatio: number;
  private trigger: number;
  private triggerLead: number;
  private groupCount: number;
  /** Accumulated stride phase in cycles, for bob/arm-swing coupling. */
  phase = 0;
  /** Fired when a foot lands; strength scales with stride length. */
  onLand?: (foot: THREE.Vector3, strength: number) => void;

  constructor(cfg: GaitLegConfig[], opts: GaitOptions = {}) {
    this.cfg = cfg;
    this.stepDur = opts.stepDur ?? 0.22;
    this.liftRatio = opts.liftRatio ?? 0.45;
    this.trigger = opts.trigger ?? 0.12;
    this.triggerLead = opts.triggerLead ?? 0.25;
    this.groupCount = cfg.reduce((m, c) => Math.max(m, c.group), 0) + 1;
    this.legs = cfg.map(() => ({
      foot: new THREE.Vector3(),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      swingT: 0,
      swinging: false,
      landPulse: 0,
    }));
  }

  /** Plant all feet at their home positions (call once after first frame). */
  init(body: BodyFrame): void {
    this.legs.forEach((leg, i) => {
      this.worldHome(_home, body, i, 0);
      leg.foot.copy(_home);
    });
  }

  private worldHome(out: THREE.Vector3, body: BodyFrame, i: number, lead: number): void {
    out.copy(this.cfg[i].home).applyQuaternion(body.quat).add(body.pos);
    out.addScaledVector(body.vel, lead);
    out.y = 0;
  }

  private groupsBusy(except: number): boolean {
    for (let i = 0; i < this.legs.length; i++) {
      if (this.cfg[i].group !== except && this.legs[i].swinging) return true;
    }
    return false;
  }

  update(dt: number, body: BodyFrame): void {
    const speed = Math.hypot(body.vel.x, body.vel.z);
    const trig = this.trigger * (1 + speed * 0.35);

    // Advance the gait clock with travel speed, with a floor whenever any
    // foot is out of place (turning on the spot, recovering from a stumble).
    let maxErr = 0;
    for (let i = 0; i < this.legs.length; i++) {
      if (this.legs[i].swinging) continue;
      this.worldHome(_desired, body, i, this.triggerLead);
      maxErr = Math.max(maxErr, this.legs[i].foot.distanceTo(_desired));
    }
    let rate = speed / Math.max(this.trigger * 4, 0.02);
    if (maxErr > trig) rate = Math.max(rate, 1.4);
    this.phase += rate * dt;

    // Each group owns a slice of the cycle — starvation-free alternation.
    const u = this.phase % 1;
    const windowOf = (g: number) =>
      u >= g / this.groupCount && u < (g + 1) / this.groupCount;

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const group = this.cfg[i].group;
      leg.landPulse = Math.max(0, leg.landPulse - dt * 6);

      if (leg.swinging) {
        leg.swingT = Math.min(1, leg.swingT + dt / this.stepDur);
        // Keep chasing the live target so direction changes mid-swing land well.
        this.worldHome(_desired, body, i, this.stepDur * 0.6);
        leg.to.lerp(_desired, 1 - Math.exp(-12 * dt));
        const t = leg.swingT;
        const ease = t * t * (3 - 2 * t);
        leg.foot.lerpVectors(leg.from, leg.to, ease);
        const stride = leg.from.distanceTo(leg.to);
        leg.foot.y = Math.sin(Math.PI * t) * Math.max(stride * this.liftRatio, 0.03);
        if (leg.swingT >= 1) {
          leg.swinging = false;
          leg.foot.y = 0;
          leg.landPulse = 1;
          this.onLand?.(leg.foot, Math.min(stride * 2.5, 1));
        }
      } else {
        this.worldHome(_desired, body, i, this.triggerLead);
        const err = leg.foot.distanceTo(_desired);
        if (err > trig && windowOf(group) && !this.groupsBusy(group)) {
          leg.swinging = true;
          leg.swingT = 0;
          leg.from.copy(leg.foot);
          this.worldHome(leg.to, body, i, this.stepDur * 0.6);
        }
      }
    }
  }

  /** Number of currently swinging legs. */
  swingCount(): number {
    return this.legs.reduce((n, l) => n + (l.swinging ? 1 : 0), 0);
  }
}
