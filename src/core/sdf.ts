/**
 * CPU mirror of the GLSL SDF functions in shaders/chunks.ts.
 * Used for carrier mesh fitting, foot placement, and parity checks.
 * Keep in lockstep with the shader.
 */

export type Vec3 = { x: number; y: number; z: number };

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Polynomial smooth min; returns blended distance and the mix weight h (1 = a dominates). */
export function smin(a: number, b: number, k: number): { d: number; h: number } {
  k = Math.max(k, 1e-4);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return { d: lerp(b, a, h) - k * h * (1 - h), h };
}

export function sdSphere(x: number, y: number, z: number, r: number): number {
  return Math.hypot(x, y, z) - r;
}

/** Capsule along Y, half-length hl (of the segment), radius r. */
export function sdCapsuleY(x: number, y: number, z: number, hl: number, r: number): number {
  const cy = y - clamp(y, -hl, hl);
  return Math.hypot(x, cy, z) - r;
}

/** Rounded cone along Y: radius r1 at y=-hl, radius r2 at y=+hl. */
export function sdRoundConeY(
  x: number, y: number, z: number,
  hl: number, r1: number, r2: number,
): number {
  const h = 2 * hl;
  const qx = Math.hypot(x, z);
  const qy = y + hl;
  const b = (r1 - r2) / Math.max(h, 1e-5);
  const a = Math.sqrt(Math.max(1 - b * b, 1e-6));
  const k = qx * -b + qy * a;
  if (k < 0) return Math.hypot(qx, qy) - r1;
  if (k > a * h) return Math.hypot(qx, qy - h) - r2;
  return qx * a + qy * b - r1;
}

/** Local-space distance for a primitive given its packed params (matches sdPrimLocal). */
export function sdPrimLocal(
  params: readonly [number, number, number, number],
  x: number, y: number, z: number,
): number {
  const t = Math.round(params[3]);
  if (t === 0) return sdSphere(x, y, z, params[0]);
  if (t === 1) return sdCapsuleY(x, y, z, params[0], params[1]);
  return sdRoundConeY(x, y, z, params[0], params[1], params[2]);
}
