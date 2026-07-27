/**
 * Critter DNA: the tiny JSON description an AI (or human, or RNG) writes.
 * Everything is semantic — leg counts and proportions, not transforms.
 * `normalizeDNA` clamps out-of-range values instead of rejecting, so
 * sloppy generated input degrades to a valid critter, never a crash.
 */

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
}

export interface CritterDNA {
  name: string;
  mode: CritterMode;
  /** hex color strings, e.g. "#f2994a"; 2-4 entries. */
  palette: string[];
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

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

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
  for (const seg of out.body) {
    if (!['sphere', 'capsule', 'cone'].includes(seg.shape)) seg.shape = 'sphere';
    seg.size = (seg.size ?? [0.2]).map((s) => clamp(s, 0.03, 0.6));
    if (seg.shape !== 'sphere' && seg.size.length < 2) seg.size.push(seg.size[0]);
    if (seg.at) seg.at = seg.at.map((v) => clamp(v, -0.8, 0.8)) as [number, number, number];
  }

  if (out.head) {
    out.head.size = clamp(out.head.size, 0.05, 0.4);
    out.head.at = out.head.at?.map((v) => clamp(v, -0.9, 0.9)) as [number, number, number] ?? [0, 0.25, 0.2];
    if (out.head.eyes) out.head.eyes = clamp(out.head.eyes, 0.015, out.head.size * 0.45);
  }

  if (out.mode === 'walker') {
    if (!out.legs) out.legs = fix('walker without legs → 4 default legs', { count: 4, length: 0.4, thickness: 0.06, stance: 0.14 });
    if (![2, 4, 6].includes(out.legs.count)) {
      out.legs.count = fix(`leg count ${out.legs.count} → nearest of 2/4/6`, (out.legs.count < 3 ? 2 : out.legs.count < 5 ? 4 : 6) as 2 | 4 | 6);
    }
    out.legs.length = clamp(out.legs.length, 0.15, 0.9);
    out.legs.thickness = clamp(out.legs.thickness, 0.025, out.legs.length * 0.35);
    out.legs.stance = clamp(out.legs.stance, 0.05, 0.5);
    if (out.legs.count > 2) out.legs.spread = clamp(out.legs.spread ?? 0.25, 0.1, 0.7);
  }
  if (out.arms) {
    out.arms.length = clamp(out.arms.length, 0.1, 0.7);
    out.arms.thickness = clamp(out.arms.thickness, 0.02, 0.12);
  }
  if (out.mode === 'flyer' && !out.wings) {
    out.wings = fix('flyer without wings → default wings', { length: 0.28, thickness: 0.05 });
  }
  if (out.wings) {
    out.wings.length = clamp(out.wings.length, 0.12, 0.6);
    out.wings.thickness = clamp(out.wings.thickness, 0.02, 0.1);
  }
  out.ropes = (out.ropes ?? []).slice(0, 4);
  for (const r of out.ropes) {
    if (!['ear', 'tail', 'antenna'].includes(r.kind)) r.kind = 'tail';
    r.segments = Math.round(clamp(r.segments ?? 2, 1, 4));
    r.length = clamp(r.length, 0.06, 0.6);
    r.thickness = clamp(r.thickness, 0.02, 0.12);
    r.at = r.at?.map((v) => clamp(v, -0.9, 0.9)) as [number, number, number] ?? [0, 0, -0.2];
  }
  out.speed = clamp(out.speed ?? 1.1, 0.2, 3);
  out.altitude = clamp(out.altitude ?? 1.4, 0.6, 3);

  return { dna: out, notes };
}

/** Palette lookup with graceful fallback. */
export function paletteColor(dna: CritterDNA, index: number | undefined, fallback = 0): string {
  const i = index ?? fallback;
  return dna.palette[Math.min(Math.max(i, 0), dna.palette.length - 1)];
}
