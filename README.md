**[Live Demo →](https://thehillbeyondthisone.github.io/Kinwild/legacy/)**

# Creature Creator

Procedurally animated toon critters built from primitive shapes that render
as one seamless, hand-sculpted-looking body — via an **SDF blend-shell**:
a vertex-shader technique that gives metaball-quality blending at ordinary
mesh-rasterization cost. A critter is ~20 lines of JSON, so an AI (or a
random seed) can generate endless new ones that always come out coherent.

```bash
npm install
npm run dev
```

## The technique: SDF blend-shell v2

Characters are plain capsule / cone / sphere meshes merged into **one draw
call**. The vertex shader snaps every vertex onto the smooth-min SDF
isosurface of the shapes' *influence set*, so where shapes overlap, their
meshes converge onto the same blended surface — seams cease to exist.
Normals come from the field gradient (lighting flows continuously across
joins) and albedo accumulates through the smooth-min chain (soft color
gradients at every join for free). No raymarching, no skinning, no
isosurface extraction: cost is per-vertex, not per-pixel.

This build engineers out the failure modes of the naive version:

| Problem in naive version | Fix here |
| --- | --- |
| Field eval is O(verts × prims) | **Blend graph**: each vertex evaluates only its primitive + graph neighbors (≤8 total), packed as `ivec4` influence lists ([blendGraph.ts](src/core/blendGraph.ts)) |
| Hands weld to thighs mid-stride | Same blend graph — blending is structural (skeleton adjacency), never mere spatial proximity |
| Z-fighting where carriers converge | Buried vertices (hard-min depth into *other* prims — smooth-min bulge can't false-positive) tuck under the skin ([chunks.ts](src/shaders/chunks.ts)) |
| Shadows show raw unblended primitives | Custom depth/distance materials share the exact same vertex chunk ([materials.ts](src/shaders/materials.ts)) |
| Squash-and-stretch breaks distances | SDF evaluated in primitive local space with conservative `min(scale)` correction |
| Outline webbing across concave creases | Outline keeps vertices on the offset hull and **discards buried fragments** — webbing vanishes, the hull stays covered by the neighboring prim's carriers |
| Outline width varies with distance | Hull offset scales with camera distance (screen-consistent width) |

Carrier meshes are lathe profiles Newton-projected onto their primitive's
CPU SDF at build time ([primitives.ts](src/core/primitives.ts)), so any
primitive type gets an exact-fitting carrier and the GPU only ever makes
small corrections. The CPU SDF ([sdf.ts](src/core/sdf.ts)) mirrors the GLSL.

Everything is injected into Three.js built-in materials via
`onBeforeCompile` — toon lighting, shadow mapping, and fog come from
Three's own pipeline.

## Procedural animation — no clips anywhere

- **Walkers** ([gait.ts](src/anim/gait.ts), [walker.ts](src/anim/walker.ts)):
  one reactive gait engine for 2/4/6 legs. Feet stay planted in world space
  until error triggers a step; phase-group time slices give starvation-free
  alternation (pairs / diagonal trot / tripod are just group assignments).
  Analytic two-bone IK with pole hints; segments stretch to their joints so
  limbs can never tear off. Bipeds swing FK arms off the gait phase.
- **Hoppers** ([hopper.ts](src/anim/hopper.ts)): crouch → launch → ballistic
  air → landing squash, springy with overshoot, pivoted at ground contact.
- **Flyers** ([flyer.ts](src/anim/flyer.ts)): hover with noise drift,
  banking from lateral velocity, wing-flap oscillator with wingbeat bob,
  dangly feet.
- **Wigglers** ([wiggler.ts](src/anim/wiggler.ts)): follow-the-leader spine
  with a traveling sine wave.
- **Ropes** ([rope.ts](src/anim/rope.ts)): verlet chains whose segments are
  SDF capsules — tails/ears/antennae stay seamlessly fused while flopping.
  An erectness parameter makes ears stand and tails droop.
- **Juice**: footfall/landing dust puffs (GPU point pool), blinking eyes,
  body bob, landing impact squash, acceleration lean.

## Critters as data

A critter is a ~20-line semantic JSON ([schema.ts](src/creatures/schema.ts)):

```json
{
  "name": "Thumper", "mode": "hopper",
  "palette": ["#d9a066", "#e8bb88", "#c98d55", "#f5e6d0"],
  "body": [{ "shape": "sphere", "size": [0.22] }],
  "head": { "size": 0.15, "at": [0, 0.21, 0.14], "color": 1, "eyes": 0.038 },
  "ropes": [
    { "kind": "ear", "at": [-0.07, 0.32, 0.08], "length": 0.24, "thickness": 0.05 },
    { "kind": "ear", "at": [0.07, 0.32, 0.08], "length": 0.24, "thickness": 0.05 },
    { "kind": "tail", "at": [0, -0.02, -0.2], "length": 0.18, "thickness": 0.055, "color": 3 }
  ]
}
```

The normalizer **clamps instead of rejecting**, blend radii derive from
limb thickness, and blend-graph hosts balance their neighbor budget — so
sloppy generated input degrades gracefully to a valid, seamless critter.
[library.ts](src/creatures/library.ts) has six hand-authored critters;
[generate.ts](src/creatures/generate.ts) turns any seed into new DNA
(HSL-harmony palettes, proportion ranges the validator likes).

**Import/export**: the *critter DNA* panel exports the whole roster as
`critters.json` and imports a single DNA object or an array — via the
file picker or by dropping a `.json` anywhere on the page. Imports run
through the same normalizer, so hand-edited or LLM-written JSON is safe
to feed in directly.

**Describe a critter** (*🧬 dream a critter* panel): type a description
and a local [LM Studio](https://lmstudio.ai) server turns it into DNA
that spawns immediately. Start LM Studio with any chat model loaded on
its default port; Vite proxies `/llm` → `localhost:1234`, so the browser
stays same-origin and no key is involved (point `LLM_URL` elsewhere for
another OpenAI-compatible server). The prompt in
[dream.ts](src/creatures/dream.ts) embeds the schema plus two library
critters as few-shot examples, and the reply parser tolerates markdown
fences and chatter — small local models are rarely clean, and the
normalizer catches whatever slips through.

**Editing & sharing**: the *edit* panel opens a critter's DNA in a live
textarea — apply rebuilds it in place — and copies a share link with the
DNA packed into the URL hash (~700 chars, no server involved).

Because clamping alone would leave a shrunk-to-fit body wearing its
original ear sizes, the normalizer also **rescales the whole critter** by
whatever factor the body was resized by, so imported proportions survive.

## Performance notes

Vertex-bound by design (resolution-independent — verified by profiling):
12 critters ≈ 74k tris across main + outline + shadow passes at 60fps on
desktop, ~14ms/frame at a dpr-2 mobile viewport in a throttled tab.
Headroom levers, in order: carrier tessellation density, shadow-pass
Newton iterations, influence-list length. All critters share two shader
programs; per-character state is uniform arrays (24 prims max).

## Layout

```
src/
  core/      sdf.ts primitives.ts blendGraph.ts characterMesh.ts
  shaders/   chunks.ts (GLSL) materials.ts (injection factory)
  anim/      gait.ts ik.ts walker.ts hopper.ts flyer.ts wiggler.ts rope.ts eyes.ts
  creatures/ schema.ts factory.ts library.ts generate.ts
  demo/      world.ts ui.ts
```
