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
uniform float uGradEps;
// isosurface target offset: 0 for skin, +outlineWidth for the outline hull
uniform float uSurfOffset;

varying vec3 vShellColor;

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

vec3 sPos; vec3 sNrm; vec3 sCol;

void blendShell(vec3 rawPos, out vec3 oPos, out vec3 oNrm, out vec3 oCol) {
  int base = int(aPrim + 0.5);
  ivec4 A = uPrimInfl[base * 2];
  ivec4 B = uPrimInfl[base * 2 + 1];
  float kS = uPrimPosK[base].w;

  vec3 p = qrot(uPrimQuat[base], rawPos * uPrimScale[base].xyz) + uPrimPosK[base].xyz;

  // Vertices swallowed by another primitive dive under the skin in EVERY
  // pass (the outline hull included — otherwise their triangles would
  // emerge across concave creases as visible webbing). The buried/exposed
  // transition triangles pierce the skin right at the crease, which reads
  // as a thin ink line — a feature for the toon style.
  float burial = max(0.0, -othersDist(p, A, B));
  float tuckAmt = smoothstep(uTuck.y, uTuck.z, burial);
  float target = mix(uSurfOffset, -uTuck.x, tuckAmt);

  for (int i = 0; i < 3; i++) {
    float f = fieldFast(p, A, B, kS) - target;
    vec3 n = fieldGrad(p, A, B, kS);
    p -= n * f;
  }

  oPos = p;
  oNrm = fieldGrad(p, A, B, kS);
  oCol = vec3(0.0);
  fieldColor(p, A, B, kS, oCol);
}
`;

/** Runs once at the top of main(); fills the sPos/sNrm/sCol globals. */
export const shellCompute = /* glsl */ `
blendShell(position, sPos, sNrm, sCol);
vShellColor = sCol;
`;
