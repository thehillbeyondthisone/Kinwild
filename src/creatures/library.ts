import { CritterDNA } from './schema';

/**
 * Hand-authored critters — each one is the ~20 lines of data an AI would
 * generate. Body space: +z forward, y up, origin floats at rig height.
 */
export const LIBRARY: CritterDNA[] = [
  {
    name: 'Trundle',
    mode: 'walker',
    palette: ['#f2994a', '#f7d154', '#e86a5a', '#fff1dc'],
    body: [{ shape: 'cone', size: [0.26, 0.2, 0.21], at: [0, 0, 0] }],
    head: { size: 0.2, at: [0, 0.56, 0.03], color: 1, eyes: 0.045 },
    legs: { count: 2, length: 0.46, thickness: 0.085, stance: 0.12, color: 2 },
    arms: { length: 0.36, thickness: 0.06 },
    speed: 1.25,
  },
  {
    name: 'Bumble',
    mode: 'walker',
    palette: ['#5bb0f0', '#8ed0ff', '#4a90d9', '#dff1ff'],
    body: [{ shape: 'capsule', size: [0.22, 0.26], flat: true }],
    head: { size: 0.18, at: [0, 0.22, 0.48], color: 1, eyes: 0.045 },
    legs: { count: 4, length: 0.42, thickness: 0.07, stance: 0.15, spread: 0.24 },
    ropes: [{ kind: 'tail', at: [0, 0.05, -0.5], segments: 2, length: 0.28, thickness: 0.05, color: 1 }],
    speed: 1.2,
  },
  {
    name: 'Skitter',
    mode: 'walker',
    palette: ['#7ed07e', '#a8e6a0', '#3f9c3f', '#eaffdf'],
    body: [
      { shape: 'sphere', size: [0.19], at: [0, 0, 0.15] },
      { shape: 'sphere', size: [0.23], at: [0, 0.02, -0.2], color: 2 },
    ],
    head: { size: 0.13, at: [0, 0.06, 0.4], color: 1, eyes: 0.035 },
    legs: { count: 6, length: 0.38, thickness: 0.042, stance: 0.14, spread: 0.28 },
    ropes: [
      { kind: 'antenna', at: [-0.05, 0.16, 0.42], segments: 2, length: 0.2, thickness: 0.028, color: 2 },
      { kind: 'antenna', at: [0.05, 0.16, 0.42], segments: 2, length: 0.2, thickness: 0.028, color: 2 },
    ],
    speed: 1.0,
  },
  {
    name: 'Thumper',
    mode: 'hopper',
    palette: ['#d9a066', '#e8bb88', '#c98d55', '#f5e6d0'],
    body: [{ shape: 'sphere', size: [0.22] }],
    head: { size: 0.15, at: [0, 0.21, 0.14], color: 1, eyes: 0.038 },
    ropes: [
      { kind: 'ear', at: [-0.07, 0.32, 0.08], segments: 2, length: 0.24, thickness: 0.05, color: 1 },
      { kind: 'ear', at: [0.07, 0.32, 0.08], segments: 2, length: 0.24, thickness: 0.05, color: 1 },
      { kind: 'tail', at: [0, -0.02, -0.2], segments: 2, length: 0.18, thickness: 0.055, color: 3 },
    ],
    speed: 1.3,
  },
  {
    name: 'Flit',
    mode: 'flyer',
    palette: ['#e25f9c', '#f08ab8', '#c74d86', '#f7d154'],
    body: [{ shape: 'sphere', size: [0.17] }],
    head: { size: 0.12, at: [0, 0.12, 0.17], color: 1, eyes: 0.032, beak: [0.045, 0.1], beakColor: 3 },
    wings: { length: 0.3, thickness: 0.05, color: 2 },
    ropes: [{ kind: 'tail', at: [0, 0, -0.15], segments: 2, length: 0.2, thickness: 0.045, color: 2 }],
    speed: 1.4,
    altitude: 1.5,
  },
  {
    name: 'Noodle',
    mode: 'wiggler',
    palette: ['#b98ae0', '#8f5fc7', '#7649b0', '#f3e5ff'],
    body: [{ shape: 'sphere', size: [0.17] }],
    head: { size: 0.17, at: [0, 0, 0], eyes: 0.04 },
    speed: 0.85,
  },
];
