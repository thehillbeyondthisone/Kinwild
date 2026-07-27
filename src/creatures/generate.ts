import { CritterDNA, CritterMode } from './schema';

/** mulberry32 — tiny deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hsl = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/**
 * Seeded random critter DNA. Proportions are sampled inside ranges the
 * validator likes, and the palette is an HSL harmony around a random hue —
 * every seed yields a coherent, seamless critter.
 */
export function generateDNA(seed: number): CritterDNA {
  const r = rng(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
  const range = (lo: number, hi: number): number => lo + r() * (hi - lo);

  const mode = pick(['walker', 'walker', 'walker', 'hopper', 'flyer', 'wiggler'] as const) as CritterMode;
  const hue = r();
  const palette = [
    hsl(hue, range(0.55, 0.75), range(0.55, 0.65)),
    hsl((hue + range(0.04, 0.09)) % 1, range(0.5, 0.7), range(0.68, 0.78)),
    hsl((hue - 0.06 + 1) % 1, range(0.5, 0.7), range(0.42, 0.52)),
    hsl((hue + 0.45) % 1, range(0.35, 0.6), range(0.75, 0.85)),
  ];

  const r0 = range(0.16, 0.28);
  const dna: CritterDNA = {
    name: `seed-${seed}`,
    mode,
    palette,
    body: [],
    speed: range(0.8, 1.6),
  };
  if (r() < 0.5) {
    dna.pattern = {
      kind: pick(['spots', 'stripes', 'gradient'] as const),
      color: pick([2, 3]),
      scale: range(2, 6),
      amount: range(0.25, 0.65),
    };
  }

  if (mode === 'walker') {
    const count = pick([2, 4, 6] as const);
    const flat = count > 2;
    if (flat) {
      dna.body.push({ shape: pick(['capsule', 'sphere']), size: [r0, r0 * range(0.9, 1.4)], flat: true });
      if (r() < 0.4) {
        dna.body.push({ shape: 'sphere', size: [r0 * range(0.85, 1.15)], at: [0, 0.02, -r0 * 1.6], color: 2 });
      }
    } else {
      dna.body.push({ shape: 'cone', size: [r0, r0 * range(0.6, 0.9), r0 * range(0.7, 0.9)] });
    }
    const legLen = range(0.3, 0.55);
    dna.legs = {
      count,
      length: legLen,
      thickness: range(0.04, 0.09) * (count === 6 ? 0.7 : 1),
      stance: r0 * range(0.5, 0.75),
      spread: r0 * range(1.0, 1.5),
      color: 2,
    };
    dna.head = {
      size: r0 * range(0.6, 0.9),
      at: flat ? [0, r0 * range(0.7, 1.1), r0 * range(1.7, 2.2)] : [0, r0 * range(1.9, 2.3), r0 * 0.15],
      color: 1,
      eyes: r0 * range(0.16, 0.24),
    };
    if (flat && r() < 0.55) {
      dna.head.beak = [r0 * range(0.3, 0.42), r0 * range(0.4, 0.6)];
      dna.head.beakColor = 3;
    }
    if (count === 2 && r() < 0.8) {
      dna.arms = { length: legLen * range(0.7, 0.9), thickness: range(0.04, 0.07) };
    }
    if (r() < 0.65) {
      dna.ropes = [{ kind: 'tail', at: [0, r0 * 0.1, -r0 * (dna.body[0].flat ? 2 : 1)], segments: 2, length: range(0.15, 0.3), thickness: range(0.035, 0.06), color: 1 }];
    }
    if (count === 6 || (count === 4 && r() < 0.3)) {
      (dna.ropes ??= []).push(
        { kind: 'antenna', at: [-r0 * 0.3, r0 * 0.8, r0 * 2], segments: 2, length: range(0.14, 0.24), thickness: 0.028, color: 2 },
        { kind: 'antenna', at: [r0 * 0.3, r0 * 0.8, r0 * 2], segments: 2, length: range(0.14, 0.24), thickness: 0.028, color: 2 },
      );
    }
  } else if (mode === 'hopper') {
    dna.body.push({ shape: 'sphere', size: [r0] });
    dna.head = { size: r0 * range(0.6, 0.75), at: [0, r0 * 0.95, r0 * 0.6], color: 1, eyes: r0 * 0.18 };
    dna.ropes = [
      { kind: 'ear', at: [-r0 * 0.32, r0 * 1.45, r0 * 0.35], segments: 2, length: r0 * range(0.9, 1.4), thickness: r0 * 0.23, color: 1 },
      { kind: 'ear', at: [r0 * 0.32, r0 * 1.45, r0 * 0.35], segments: 2, length: r0 * range(0.9, 1.4), thickness: r0 * 0.23, color: 1 },
      { kind: 'tail', at: [0, -r0 * 0.1, -r0 * 0.9], segments: 2, length: r0 * 0.8, thickness: r0 * 0.25, color: 3 },
    ];
  } else if (mode === 'flyer') {
    dna.body.push({ shape: 'sphere', size: [r0 * 0.85] });
    dna.head = {
      size: r0 * 0.6,
      at: [0, r0 * 0.6, r0 * 0.85],
      color: 1,
      eyes: r0 * 0.16,
      beak: [r0 * 0.22, r0 * range(0.4, 0.7)],
      beakColor: 3,
    };
    dna.wings = { length: range(0.22, 0.38), thickness: range(0.04, 0.06), color: 2 };
    dna.ropes = [{ kind: 'tail', at: [0, 0, -r0], segments: 2, length: range(0.15, 0.25), thickness: range(0.035, 0.05), color: 2 }];
    dna.altitude = range(1.2, 2.0);
  } else {
    dna.body.push({ shape: 'sphere', size: [range(0.14, 0.2)] });
    dna.head = { size: 0.1, at: [0, 0, 0], eyes: range(0.03, 0.045) };
  }

  return dna;
}
