/**
 * The SDF blend-shell vertex pipeline, as GLSL chunks injected into Three's
 * built-in materials via onBeforeCompile.
 *
 * Every vertex belongs to one "carrier" primitive (aPrim). The vertex is
 * rigid-transformed by its primitive, then Newton-projected onto the
 * smooth-min isosurface of the primitive's *influence set* (itself + blend
 * graph neighbors). Normals come from the field gradient, colors accumulate
 * through the smooth-min chain, and vertices buried deep inside the union
 * tuck themselves slightly under the skin to avoid coplanar z-fighting.
 */

export const MAX_PRIMS = 24;
export const MAX_INFL = 8; // self + up to 7 neighbors, packed as 2x ivec4

export const shellPars = /* glsl */ `
attribute float aPrim;

// xyz: world position, w: blend radius k
uniform vec4 uPrimPosK[${MAX_PRIMS}];
uniform vec4 uPrimQuat[${MAX_PRIMS}];
// xyz: non-uniform scale (w unused)
uniform vec4 uPrimScale[${MAX_PRIMS}];
// xyz: shape params, w: type (0 sphere, 1 capsule, 2 rounded cone)
uniform vec4 uPrimParams[${MAX_PRIMS}];
uniform vec4 uPrimColor[${MAX_PRIMS}];
// influence list per prim: [prim*2].xyzw + [prim*2+1].xyzw, -1 terminated, [0]=self
uniform ivec4 uPrimInfl[${MAX_PRIMS * 2}];

// x: tuck depth under the skin, y: burial depth where tuck starts, z: where it saturates
uniform vec3 uTuck;
// rgb: pattern color, w: kind (0 none, 1 spots, 2 stripes, 3 gradient)
uniform vec4 uPattern;
// x: scale, y: amount/coverage
uniform vec4 uPatternParams;
// Newton iteration count (distance LOD); SHELL_FAST ignores it
uniform int uIters;
uniform float uGradEps;
// isosurface target offset: 0 for skin, +outlineWidth for the outline hull
uniform float uSurfOffset;
// x: reference camera distance for outline width, y/z: min/max scale factor
uniform vec3 uOutlineComp;

varying vec3 vShellColor;
// depth of penetration into other primitives, for outline fragment culling
varying float vShellBurial;

vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 qrotInv(vec4 q, vec3 v) { return qrot(vec4(-q.xyz, q.w), v); }

float sdPrimLocal(vec4 pr, vec3 p) {
  int t = int(pr.w + 0.5);
  if (t == 0) return length(p) - pr.x;
  if (t == 1) { p.y -= clamp(p.y, -pr.x, pr.x); return length(p) - pr.y; }
  // rounded cone: radius pr.y at y=-pr.x, radius pr.z at y=+pr.x
  float h = 2.0 * pr.x;
  vec2 q = vec2(length(p.xz), p.y + pr.x);
  float b = (pr.y - pr.z) / max(h, 1e-5);
  float a = sqrt(max(1.0 - b * b, 1e-6));
  float k = dot(q, vec2(-b, a));
  if (k < 0.0) return length(q) - pr.y;
  if (k > a * h) return length(q - vec2(0.0, h)) - pr.z;
  return dot(q, vec2(a, b)) - pr.y;
}

// World-space distance to primitive j. Non-uniform scale makes this a
// conservative bound (scaled by min axis), not an exact distance — keeps
// blend widths sane under squash-and-stretch.
float primDist(int j, vec3 pw) {
  vec3 sc = uPrimScale[j].xyz;
  vec3 pl = qrotInv(uPrimQuat[j], pw - uPrimPosK[j].xyz) / sc;
  return sdPrimLocal(uPrimParams[j], pl) * min(sc.x, min(sc.y, sc.z));
}

// Smooth-min field over the influence set. Pairwise blend radius is
// min(k_self, k_other) so thin parts (antennae) cap their own blending.
float fieldFast(vec3 p, ivec4 A, ivec4 B, float kS) {
  float d = primDist(A.x, p);
  for (int i = 1; i < 8; i++) {
    int j = i < 4 ? A[i] : B[i - 4];
    if (j < 0) break;
    float dj = primDist(j, p);
    float k = max(min(kS, uPrimPosK[j].w), 1e-4);
    float h = clamp(0.5 + 0.5 * (dj - d) / k, 0.0, 1.0);
    d = mix(dj, d, h) - k * h * (1.0 - h);
  }
  return d;
}

// Same field, accumulating albedo through the smooth-min chain — the mix
// factor of each pairwise smin is exactly the color blend weight.
float fieldColor(vec3 p, ivec4 A, ivec4 B, float kS, out vec3 col) {
  float d = primDist(A.x, p);
  col = uPrimColor[A.x].rgb;
  for (int i = 1; i < 8; i++) {
    int j = i < 4 ? A[i] : B[i - 4];
    if (j < 0) break;
    float dj = primDist(j, p);
    float k = max(min(kS, uPrimPosK[j].w), 1e-4);
    float h = clamp(0.5 + 0.5 * (dj - d) / k, 0.0, 1.0);
    d = mix(dj, d, h) - k * h * (1.0 - h);
    col = mix(uPrimColor[j].rgb, col, h);
  }
  return d;
}

vec3 fieldGrad(vec3 p, ivec4 A, ivec4 B, float kS) {
  vec2 e = vec2(1.0, -1.0);
  vec3 g = e.xyy * fieldFast(p + e.xyy * uGradEps, A, B, kS)
         + e.yyx * fieldFast(p + e.yyx * uGradEps, A, B, kS)
         + e.yxy * fieldFast(p + e.yxy * uGradEps, A, B, kS)
         + e.xxx * fieldFast(p + e.xxx * uGradEps, A, B, kS);
  float len = length(g);
  return len > 1e-6 ? g / len : vec3(0.0, 1.0, 0.0);
}

// Hard-min distance to every *other* influence — the true burial metric.
// (The smooth-min field goes negative in healthy blend bulges too, so it
// cannot distinguish "in a blend zone" from "inside another primitive".)
float othersDist(vec3 p, ivec4 A, ivec4 B) {
  float d = 1e5;
  for (int i = 1; i < 8; i++) {
    int j = i < 4 ? A[i] : B[i - 4];
    if (j < 0) break;
    d = min(d, primDist(j, p));
  }
  return d;
}

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
        mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
        mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

// Pattern mask sampled in carrier REST space (sticks to the body under
// animation). Coordinates are per-prim, so the mask fades out near blend
// seams (seamFade) — a spot can never straddle two prims and tear.
//
// Spots/stripes use raw rest units so a feature is the same physical size
// on the head as on the body; gradient uses height normalized by the prim's
// own extent so it reads as one sweep regardless of part size.
float patternMask(vec3 restPos, float extent, float primId, float seamFade) {
  int kind = int(uPattern.w + 0.5);
  if (kind == 0) return 0.0;
  float f = uPatternParams.x * 8.0;
  float amount = uPatternParams.y;
  vec3 off = vec3(hash31(vec3(primId + 1.0)), hash31(vec3(primId + 7.0)), hash31(vec3(primId + 13.0))) * 9.0;
  float m = 0.0;
  if (kind == 1) {
    // Crisp edge: toon spots want a hard cut, not a soft blotch.
    float n = vnoise(restPos * f + off);
    float t = 0.74 - amount * 0.34;
    m = smoothstep(t, t + 0.035, n);
  } else if (kind == 2) {
    float s = sin(restPos.y * f * 1.6 + vnoise(restPos * f * 0.5 + off) * 1.5) * 0.5 + 0.5;
    float t = 0.62 - amount * 0.42;
    m = smoothstep(t, t + 0.06, s);
  } else {
    float ny = restPos.y / max(extent, 1e-3);
    float t = 1.0 - amount * 2.0;
    m = smoothstep(t, t + 0.5, ny) * 0.9;
  }
  return m * seamFade;
}

vec3 sPos; vec3 sNrm; vec3 sCol; float sBurial;

void blendShell(vec3 rawPos, out vec3 oPos, out vec3 oNrm, out vec3 oCol) {
  int base = int(aPrim + 0.5);
  ivec4 A = uPrimInfl[base * 2];
  ivec4 B = uPrimInfl[base * 2 + 1];
  float kS = uPrimPosK[base].w;

  vec3 p = qrot(uPrimQuat[base], rawPos * uPrimScale[base].xyz) + uPrimPosK[base].xyz;

  // Outline width scales with camera distance so it stays near-constant in
  // screen space (uSurfOffset is 0 in non-outline passes, so this is inert).
  float distScale = clamp(
    distance(cameraPosition, uPrimPosK[base].xyz) / max(uOutlineComp.x, 1e-3),
    uOutlineComp.y, uOutlineComp.z);
  float surf = uSurfOffset * distScale;

  // Buried vertices (swallowed by another primitive) dive just under the
  // skin in the surface/shadow passes, killing coplanar z-fighting. The
  // outline pass instead keeps everything on the hull and discards buried
  // FRAGMENTS — any vertex-position scheme would drag triangles through
  // the visible skin somewhere, but discarded webbing simply vanishes and
  // the hull stays covered by the other primitive's exposed carriers.
  float dOther = othersDist(p, A, B);
  float burial = max(0.0, -dOther);
  sBurial = burial;
  float tuckAmt = smoothstep(uTuck.y, uTuck.z, burial);
  float target = uSurfOffset > 0.0 ? surf : mix(0.0, -uTuck.x, tuckAmt);

#ifdef SHELL_FAST
  // Shadow passes tolerate ~1cm silhouette error; one step is plenty.
  const int iters = 1;
#else
  int iters = uIters;
#endif
  for (int i = 0; i < iters; i++) {
    float f = fieldFast(p, A, B, kS) - target;
    vec3 n = fieldGrad(p, A, B, kS);
    p -= n * f;
  }

  oPos = p;
#ifdef SHELL_NO_NORMAL
  oNrm = vec3(0.0, 1.0, 0.0);
#else
  oNrm = fieldGrad(p, A, B, kS);
#endif
#ifdef SHELL_NO_COLOR
  oCol = vec3(1.0);
#else
  oCol = vec3(0.0);
  fieldColor(p, A, B, kS, oCol);
  vec4 pr = uPrimParams[base];
  float extent = int(pr.w + 0.5) == 0 ? pr.x : pr.x + pr.y;
  float seamFade = smoothstep(0.015, 0.07, dOther);
  oCol = mix(oCol, uPattern.rgb, patternMask(rawPos, extent, aPrim, seamFade));
#endif
}
`;

/** Runs once at the top of main(); fills the sPos/sNrm/sCol globals. */
export const shellCompute = /* glsl */ `
blendShell(position, sPos, sNrm, sCol);
vShellColor = sCol;
vShellBurial = sBurial;
`;

/** Fragment-side culling for the outline hull pass. */
export const outlineFragPars = /* glsl */ `
varying float vShellBurial;
uniform float uBurialCut;
`;
export const outlineFragCut = /* glsl */ `
if (vShellBurial > uBurialCut) discard;
`;
