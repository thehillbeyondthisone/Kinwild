/**
 * Critter DNA: the tiny JSON description an AI (or human, or RNG) writes.
 * Everything is semantic — leg counts and proportions, not transforms.
 * `normalizeDNA` clamps out-of-range values instead of rejecting, so
 * sloppy generated input degrades to a valid critter, never a crash.
 */

import { MAX_PRIMS } from '../shaders/chunks';
import { sdPrimLocal } from '../core/sdf';

export type CritterMode = 'walker' | 'hopper' | 'flyer' | 'wiggler';

export interface BodySegDNA {
  /** sphere: [r] · capsule/cone: [r, halfLen] · cone may add [.., rTop] */
  shape: 'sphere' | 'capsule' | 'cone';
  size: number[];
  /** center offset in body space [x, y, z]; +z is forward. */
  at?: [number, number, number];
  /** lay the capsule axis along +z (quadruped torsos). */
  flat?: boolean;
  /** palette index */
  color?: number;
}

export interface HeadDNA {
  size: number;
  at: [number, number, number];
  color?: number;
  eyes?: number; // eye radius, 0 = none
  /** small crisp cone poking forward: [baseR, len] */
  beak?: [number, number];
  beakColor?: number;
}

export interface LegsDNA {
  count: 2 | 4 | 6;
  /** total leg length hip→ground */
  length: number;
  thickness: number;
  /** lateral hip offset from centerline */
  stance: number;
  /** front-back hip extent for 4/6 legs */
  spread?: number;
  color?: number;
}

export interface ArmsDNA {
  length: number;
  thickness: number;
  /** shoulder height relative to body origin */
  height?: number;
  color?: number;
}

export interface WingsDNA {
  length: number;
  thickness: number;
  color?: number;
}

export interface RopeDNA {
  kind: 'ear' | 'tail' | 'antenna';
  at: [number, number, number];
  segments?: number;
  length: number;
  thickness: number;
  color?: number;
  /** ears only: droop instead of standing up (puppy ears). */
  floppy?: boolean;
}

export interface PatternDNA {
  kind: 'spots' | 'stripes' | 'gradient';
  /** palette index of the pattern color */
  color?: number;
  /** feature density, ~1 (big) to ~8 (fine) */
  scale?: number;
  /** coverage/strength 0..1 */
  amount?: number;
}

export interface CritterDNA {
  name: string;
  mode: CritterMode;
  /** hex color strings, e.g. "#f2994a"; 2-4 entries. */
  palette: string[];
  pattern?: PatternDNA;
  body: BodySegDNA[];
  head?: HeadDNA;
  legs?: LegsDNA;
  arms?: ArmsDNA;
  wings?: WingsDNA;
  ropes?: RopeDNA[];
  speed?: number;
  /** flyer hover height */
  altitude?: number;
}

/**
 * Coercing clamp. DNA arriving from a language model is untyped at runtime
 * and small models routinely quote their numbers ("-0.09"), so anything
 * number-shaped is accepted; only genuine junk falls back to `lo`.
 */
const clamp = (v: unknown, lo: number, hi: number): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

/**
 * Clamp every field into workable ranges and fill defaults. Returns the
 * normalized DNA plus human-readable notes about anything it had to fix.
 */
export function normalizeDNA(dna: CritterDNA): { dna: CritterDNA; notes: string[] } {
  const notes: string[] = [];
  const fix = <T>(what: string, v: T): T => {
    notes.push(what);
    return v;
  };

  const out: CritterDNA = JSON.parse(JSON.stringify(dna));
  if (!['walker', 'hopper', 'flyer', 'wiggler'].includes(out.mode)) {
    out.mode = fix(`unknown mode "${dna.mode}" → walker`, 'walker');
  }
  if (!Array.isArray(out.palette) || out.palette.length === 0) {
    out.palette = fix('missing palette → defaults', ['#f2994a', '#f7d154', '#e86a5a']);
  }
  while (out.palette.length < 4) out.palette.push(out.palette[out.palette.length - 1]);

  if (!out.body?.length) {
    out.body = fix('missing body → default blob', [{ shape: 'sphere', size: [0.22] }]);
  }
  out.body = out.body.slice(0, 3);
  const askedR0 = out.body[0]?.size?.[0];
  for (const seg of out.body) {
    if (!['sphere', 'capsule', 'cone'].includes(seg.shape)) seg.shape = 'sphere';
    seg.size = (seg.size ?? [0.2]).map((s) => clamp(s, 0.03, 0.6));
    if (seg.shape !== 'sphere' && seg.size.length < 2) seg.size.push(seg.size[0]);
    if (seg.at) seg.at = seg.at.map((v) => clamp(v, -0.8, 0.8)) as [number, number, number];
  }

  // If the body had to be resized to fit, resize everything else by the same
  // factor. Clamping alone would keep the author's absolute ear/leg numbers
  // against a body that shrank 8x, which is how you get pin-eared giants.
  const bodyScale =
    Number.isFinite(askedR0) && askedR0! > 1e-4 ? out.body[0].size[0] / askedR0! : 1;
  if (Math.abs(bodyScale - 1) > 0.01) {
    notes.push(`body resized ×${bodyScale.toFixed(2)}; scaled the rest to match`);
    const s3 = (v?: [number, number, number]) =>
      (v ? (v.map((n) => n * bodyScale) as [number, number, number]) : v);
    if (out.head) {
      out.head.size *= bodyScale;
      out.head.at = s3(out.head.at)!;
      if (out.head.eyes) out.head.eyes *= bodyScale;
      if (out.head.beak) out.head.beak = [out.head.beak[0] * bodyScale, out.head.beak[1] * bodyScale];
    }
    if (out.legs) {
      out.legs.length *= bodyScale;
      out.legs.thickness *= bodyScale;
      out.legs.stance *= bodyScale;
      if (out.legs.spread) out.legs.spread *= bodyScale;
    }
    if (out.arms) {
      out.arms.length *= bodyScale;
      out.arms.thickness *= bodyScale;
      if (out.arms.height) out.arms.height *= bodyScale;
    }
    if (out.wings) {
      out.wings.length *= bodyScale;
      out.wings.thickness *= bodyScale;
    }
    for (const r of out.ropes ?? []) {
      r.length *= bodyScale;
      r.thickness *= bodyScale;
      r.at = s3(r.at)!;
    }
  }

  // Everything below is clamped RELATIVE to body size. Absolute-only limits
  // let a big imported body keep pin-sized ears; proportional limits mean a
  // critter scaled anywhere in range still reads as the same creature.
  const r0 = out.body[0].size[0];

  if (out.head) {
    out.head.size = clamp(out.head.size, r0 * 0.3, r0 * 1.2);
    out.head.at = out.head.at?.map((v) => clamp(v, -0.9, 0.9)) as [number, number, number] ?? [0, 0.25, 0.2];
    if (out.head.eyes) out.head.eyes = clamp(out.head.eyes, out.head.size * 0.12, out.head.size * 0.42);
    if (out.head.beak) {
      out.head.beak = [
        clamp(out.head.beak[0], out.head.size * 0.15, out.head.size * 0.7),
        clamp(out.head.beak[1], out.head.size * 0.3, out.head.size * 1.6),
      ];
    }
  }

  if (out.mode === 'walker') {
    if (!out.legs) out.legs = fix('walker without legs → 4 default legs', { count: 4, length: 0.4, thickness: 0.06, stance: 0.14 });
    const askedCount = clamp(out.legs.count, 1, 12);
    if (![2, 4, 6].includes(out.legs.count)) {
      out.legs.count = fix(
        `leg count ${out.legs.count} → nearest of 2/4/6`,
        (askedCount < 3 ? 2 : askedCount < 5 ? 4 : 6) as 2 | 4 | 6,
      );
    }
    out.legs.length = clamp(out.legs.length, r0 * 0.8, r0 * 3.5);
    out.legs.thickness = clamp(out.legs.thickness, r0 * 0.12, out.legs.length * 0.32);
    out.legs.stance = clamp(out.legs.stance, r0 * 0.3, r0 * 1.3);
    if (out.legs.count > 2) out.legs.spread = clamp(out.legs.spread ?? r0, r0 * 0.5, r0 * 2.2);
  }
  if (out.arms) {
    out.arms.length = clamp(out.arms.length, r0 * 0.6, r0 * 2.6);
    out.arms.thickness = clamp(out.arms.thickness, r0 * 0.1, r0 * 0.42);
  }
  if (out.mode === 'flyer' && !out.wings) {
    out.wings = fix('flyer without wings → default wings', { length: 0.28, thickness: 0.05 });
  }
  if (out.wings) {
    out.wings.length = clamp(out.wings.length, r0 * 0.8, r0 * 3);
    out.wings.thickness = clamp(out.wings.thickness, r0 * 0.12, r0 * 0.45);
  }
  out.ropes = (out.ropes ?? []).slice(0, 4);
  for (const r of out.ropes) {
    if (!['ear', 'tail', 'antenna'].includes(r.kind)) r.kind = 'tail';
    r.segments = Math.round(clamp(r.segments ?? 2, 1, 4));
    r.length = clamp(r.length, r0 * 0.3, r0 * 2.5);
    r.thickness = clamp(r.thickness, r0 * 0.08, r0 * 0.45);
    r.at = r.at?.map((v) => clamp(v, -0.9, 0.9)) as [number, number, number] ?? [0, 0, -0.2];

    // Ears and antennae belong on top of the head. Generators regularly
    // anchor them under the body, where they render buried or underground;
    // nobody means that, so lift them onto the head instead.
    if (r.kind !== 'tail' && out.head) {
      const headY = out.head.at[1];
      if (r.at[1] < headY) {
        r.at = [r.at[0], headY + out.head.size * 0.75, out.head.at[2] + out.head.size * 0.1];
        notes.push(`${r.kind} was below the head; moved on top of it`);
      }
    }
    // Tails belong behind the body.
    if (r.kind === 'tail' && r.at[2] > 0) {
      r.at = [r.at[0], r.at[1], -Math.abs(r.at[2])];
      notes.push('tail was in front; moved behind');
    }
  }
  if (out.pattern) {
    if (!['spots', 'stripes', 'gradient'].includes(out.pattern.kind)) {
      out.pattern.kind = fix(`unknown pattern "${out.pattern.kind}" → spots`, 'spots');
    }
    out.pattern.scale = clamp(out.pattern.scale ?? 3, 1, 8);
    out.pattern.amount = clamp(out.pattern.amount ?? 0.5, 0.08, 0.9);
  }
  out.speed = clamp(out.speed ?? 1.1, 0.2, 3);
  out.altitude = clamp(out.altitude ?? 1.4, 0.6, 3);

  anchorHead(out, notes);
  trimToPrimBudget(out, notes);
  return { dna: out, notes };
}

/**
 * Pull the head in until it actually overlaps the torso.
 *
 * The blend shell fuses primitives only where their fields meet; a head
 * placed beyond that range renders as a separate floating ball, which is
 * exactly the seam the whole technique exists to prevent. Generated DNA
 * puts heads too high often enough that it needs guaranteeing here rather
 * than hoping the model gets it right.
 */
function anchorHead(d: CritterDNA, notes: string[]): void {
  if (!d.head) return;
  const seg = d.body[0];
  const [hx, hy, hz] = d.head.at;

  // Distance from the head center to the torso surface, in the torso's own
  // local frame (a flat body lies along +z, so y and z swap).
  const params = (): [number, number, number, number] => {
    if (seg.shape === 'sphere') return [seg.size[0], 0, 0, 0];
    if (seg.shape === 'capsule') return [seg.size[1] ?? seg.size[0], seg.size[0], 0, 1];
    return [seg.size[1] ?? seg.size[0], seg.size[0], seg.size[2] ?? seg.size[0] * 0.72, 2];
  };
  const at = seg.at ?? [0, 0, 0];
  const surfaceGap = (px: number, py: number, pz: number): number => {
    const lx = px - at[0];
    const ly = py - at[1];
    const lz = pz - at[2];
    // Flat bodies are rotated 90° about X, so local Y runs along world Z.
    return seg.flat ? sdPrimLocal(params(), lx, lz, ly) : sdPrimLocal(params(), lx, ly, lz);
  };

  // Overlap target: the head should sink ~25% of its radius into the torso.
  const want = -d.head.size * 0.25;
  if (surfaceGap(hx, hy, hz) <= want) return;

  // Walk the head along the line back to the torso center until it does.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const gap = surfaceGap(
      at[0] + (hx - at[0]) * t,
      at[1] + (hy - at[1]) * t,
      at[2] + (hz - at[2]) * t,
    );
    if (gap > want) hi = t;
    else lo = t;
  }
  d.head.at = [
    at[0] + (hx - at[0]) * lo,
    at[1] + (hy - at[1]) * lo,
    at[2] + (hz - at[2]) * lo,
  ];
  notes.push('head was floating clear of the body; pulled in to fuse');
}

/** Mirrors how factory.ts turns DNA into primitives. */
function countPrims(d: CritterDNA): number {
  let n = d.body.length;
  if (d.head) n += 1 + (d.head.beak ? 1 : 0);
  if (d.mode === 'walker' && d.legs) n += d.legs.count * 2;
  if (d.mode === 'walker' && d.arms) n += 4;
  if (d.mode === 'flyer') n += 4; // two wings + two dangling feet
  if (d.mode === 'hopper') n += 2; // two feet
  for (const r of d.ropes ?? []) n += r.segments ?? 2;
  return n;
}

/**
 * The shell packs every primitive into fixed-size uniform arrays, so a
 * character that exceeds MAX_PRIMS cannot be built at all. Generated DNA
 * hits this regularly (six legs plus four multi-segment ropes overflows),
 * so trim the least essential parts until it fits rather than rejecting a
 * critter outright.
 */
function trimToPrimBudget(d: CritterDNA, notes: string[]): void {
  if (countPrims(d) <= MAX_PRIMS) return;
  const before = countPrims(d);

  // 1. Shorten multi-segment ropes.
  for (const r of d.ropes ?? []) {
    while (countPrims(d) > MAX_PRIMS && (r.segments ?? 2) > 1) r.segments = (r.segments ?? 2) - 1;
  }
  // 2. Drop whole ropes, last authored first.
  while (countPrims(d) > MAX_PRIMS && d.ropes?.length) d.ropes.pop();
  // 3. Drop arms.
  if (countPrims(d) > MAX_PRIMS && d.arms) delete d.arms;
  // 4. Last resort: fewer legs.
  while (countPrims(d) > MAX_PRIMS && d.legs && d.legs.count > 2) {
    d.legs.count = (d.legs.count - 2) as 2 | 4 | 6;
  }
  // 5. Still over? Shed body segments down to one.
  while (countPrims(d) > MAX_PRIMS && d.body.length > 1) d.body.pop();

  notes.push(`trimmed ${before} prims to ${countPrims(d)} (max ${MAX_PRIMS})`);
}

/** Palette lookup with graceful fallback. */
export function paletteColor(dna: CritterDNA, index: number | undefined, fallback = 0): string {
  const i = index ?? fallback;
  return dna.palette[Math.min(Math.max(i, 0), dna.palette.length - 1)];
}
