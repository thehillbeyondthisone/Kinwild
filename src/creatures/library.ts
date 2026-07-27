import { CritterDNA } from './schema';

/**
 * Hand-authored critters — each one is the ~20 lines of data an AI would
 * generate. Body space: +z forward, y up, origin floats at rig height.
 *
 * Art rules of thumb baked in here: heads are 70–90% of body radius and
 * overlap deep (neckless chunk reads cuter), legs are short and thick,
 * bellies are an embedded lighter prim that the color chain turns into a
 * soft tummy gradient, and limbs use a darker accent so they read against
 * the body.
 */
export const LIBRARY: CritterDNA[] = [
  {
    name: 'Trundle',
    mode: 'walker',
    palette: ['#f59a3d', '#ffd166', '#d96c3f', '#ffe9c7'],
    body: [
      { shape: 'cone', size: [0.27, 0.17, 0.2], at: [0, 0, 0] },
      { shape: 'sphere', size: [0.16], at: [0, -0.1, 0.15], color: 3 },
    ],
    head: { size: 0.22, at: [0, 0.44, 0.02], color: 1, eyes: 0.055 },
    legs: { count: 2, length: 0.34, thickness: 0.1, stance: 0.15, color: 2 },
    arms: { length: 0.3, thickness: 0.07, color: 2 },
    ropes: [{ kind: 'tail', at: [0, -0.1, -0.24], segments: 1, length: 0.1, thickness: 0.06, color: 2 }],
    speed: 1.25,
  },
  {
    name: 'Bumble',
    mode: 'walker',
    palette: ['#6cb7f5', '#a5d8ff', '#3f7fc4', '#f2e2c9'],
    body: [
      { shape: 'capsule', size: [0.22, 0.2], flat: true },
      { shape: 'capsule', size: [0.16, 0.14], at: [0, -0.09, 0.02], flat: true, color: 3 },
    ],
    head: { size: 0.21, at: [0, 0.26, 0.4], color: 0, eyes: 0.05, beak: [0.1, 0.14], beakColor: 3 },
    legs: { count: 4, length: 0.36, thickness: 0.08, stance: 0.14, spread: 0.2, color: 2 },
    ropes: [
      { kind: 'ear', at: [-0.16, 0.42, 0.36], segments: 2, length: 0.2, thickness: 0.055, color: 2, floppy: true },
      { kind: 'ear', at: [0.16, 0.42, 0.36], segments: 2, length: 0.2, thickness: 0.055, color: 2, floppy: true },
      { kind: 'tail', at: [0, 0.08, -0.42], segments: 2, length: 0.24, thickness: 0.05, color: 1 },
    ],
    speed: 1.2,
  },
  {
    name: 'Skitter',
    mode: 'walker',
    palette: ['#8fd463', '#c1ef9e', '#4f9e3f', '#f5ffe0'],
    body: [
      { shape: 'sphere', size: [0.19], at: [0, 0.02, 0.14] },
      { shape: 'sphere', size: [0.26], at: [0, 0.06, -0.24], color: 2 },
    ],
    head: { size: 0.16, at: [0, 0.12, 0.4], color: 1, eyes: 0.045 },
    legs: { count: 6, length: 0.36, thickness: 0.048, stance: 0.15, spread: 0.26, color: 2 },
    ropes: [
      { kind: 'antenna', at: [-0.06, 0.26, 0.46], segments: 2, length: 0.24, thickness: 0.03, color: 1 },
      { kind: 'antenna', at: [0.06, 0.26, 0.46], segments: 2, length: 0.24, thickness: 0.03, color: 1 },
    ],
    speed: 1.0,
  },
  {
    name: 'Thumper',
    mode: 'hopper',
    palette: ['#d9a066', '#eec39a', '#b97f4b', '#fdf3e3'],
    body: [{ shape: 'sphere', size: [0.23] }],
    head: { size: 0.175, at: [0, 0.24, 0.14], color: 1, eyes: 0.046 },
    ropes: [
      { kind: 'ear', at: [-0.075, 0.37, 0.08], segments: 2, length: 0.28, thickness: 0.055, color: 1 },
      { kind: 'ear', at: [0.075, 0.37, 0.08], segments: 2, length: 0.28, thickness: 0.055, color: 1 },
      { kind: 'tail', at: [0, -0.02, -0.21], segments: 2, length: 0.16, thickness: 0.06, color: 3 },
    ],
    speed: 1.3,
  },
  {
    name: 'Flit',
    mode: 'flyer',
    palette: ['#ef6ea8', '#f9a8cc', '#c94f86', '#ffd166'],
    body: [{ shape: 'sphere', size: [0.16] }],
    head: { size: 0.14, at: [0, 0.13, 0.16], color: 1, eyes: 0.04, beak: [0.05, 0.11], beakColor: 3 },
    wings: { length: 0.32, thickness: 0.05, color: 2 },
    ropes: [{ kind: 'tail', at: [0, 0, -0.14], segments: 2, length: 0.22, thickness: 0.045, color: 2 }],
    speed: 1.4,
    altitude: 1.5,
  },
  {
    name: 'Noodle',
    mode: 'wiggler',
    palette: ['#a877e8', '#cdaaf5', '#7d4fc4', '#ffe9f7'],
    body: [
      { shape: 'sphere', size: [0.19], color: 0 },
      { shape: 'sphere', size: [0.17], color: 1 },
      { shape: 'sphere', size: [0.155], color: 0 },
      { shape: 'sphere', size: [0.14], color: 1 },
      { shape: 'sphere', size: [0.125], color: 0 },
      { shape: 'sphere', size: [0.105], color: 1 },
      { shape: 'sphere', size: [0.085], color: 2 },
    ],
    head: { size: 0.19, at: [0, 0, 0], eyes: 0.05 },
    speed: 0.85,
  },
];
