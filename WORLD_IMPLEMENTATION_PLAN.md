# Living Procedural Worlds — Implementation Plan

Status: Foundation executing  
Last updated: 2026-07-26

## 1. Objective

Build a cohesive procedural wildlife sanctuary in which every seed creates a
composed miniature world containing recognizable flora and fauna species with
relationships worth discovering, observing, influencing, and revisiting.

The quality target is not “more random content.” It is authored-feeling
composition, species identity, expressive procedural motion, visible ecological
causality, and coordinated presentation polish.

The intended player promise is:

> Every world contains plant and animal species that have never existed before,
> yet remain coherent, reproducible, nameable, photographable, and emotionally
> legible.

Identity directive: the result is an original world called **Kinwild**. Small
World is a temporary engineering donor and A/B harness, not the product,
brand, art direction, content taxonomy, or long-term shell. The current
foundation sprint deliberately excludes gameplay and portals; it proves one
cohesive living field of generated flora and fauna first.

## 2. Product pillars

1. **Generate species, not unrelated individuals.**  
   Each world should contain approximately 6–10 flora species and 3–5 fauna
   species. Individuals inherit recognizable silhouettes, markings, motion,
   voices, and habitat preferences.

2. **Compose before scattering.**  
   Reserve landmarks, vistas, paths, clearings, habitat pockets, and negative
   space before placing plants and creatures.

3. **Make ecology visible.**  
   Creatures eat fruit, pollinate flowers, shelter under plants, perch on fungi,
   spread seeds, disturb grass, and react to weather.

4. **Let AI author semantics while code guarantees taste.**  
   AI produces compact genomes. Validators, constraints, complexity budgets,
   and deterministic compilers produce the runtime content.

5. **Give every important event physical consequences.**  
   Pose, secondary animation, foliage, particles, sound, lighting, camera, and
   aftermath should respond through one presentation-event system.

6. **Keep worlds deterministic and versioned.**  
   A world or species must remain reproducible after generators evolve.

## 3. System ownership

### Kinwild world runtime

Kinwild owns the product identity and the orchestration layer:

- terrain, water, atmosphere, time of day, and weather;
- world composition and placement;
- ecological simulation and navigation;
- families, personalities, sleep, burrowing, perching, and other behavior;
- portals, cameras, Field Guide, photo mode, persistence, and sharing;
- post-processing, audio mixing, and performance tiers.

During migration, selected Small World systems supply implementation
scaffolding for terrain, lifecycle, camera, and post-processing. Every borrowed
system must sit behind a Kinwild-owned contract, remain replaceable, and expose
no Small World-specific name, silhouette, biome, catalog, music, or interaction
assumption in generated mode.

### Creature Creator

Creature Creator becomes the fauna phenotype and presentation runtime:

- semantic fauna DNA;
- anatomy compilation;
- seamless SDF body rendering;
- gait, IK, hopping, flying, wiggling, gaze, and secondary motion;
- expression and contact events;
- fauna rendering LOD and interaction proxies.

### Flora Creator

Flora Creator is a parallel system and owns:

- semantic flora DNA;
- deterministic growth graphs;
- hybrid SDF and instanced-organ rendering;
- wind, touch, growth, seasonal, and lifecycle presentation;
- flora rendering LOD, collision proxies, and interaction events.

### WorldPlan

A new serializable `WorldPlan` coordinates the three systems:

```text
World seed + generator version
  → namespaced deterministic streams
  → world identity and shared style genome
  → composition and habitat graph
  → flora and fauna species rosters
  → placement records and ecological relationships
  → runtime construction
  → simulation events
  → pose, foliage, VFX, audio, camera, and UI
```

## 4. Repository architecture

Do not begin with a large rewrite. Prove one integrated creature and one
generated plant first. After that proof, organize the reusable systems as
internal packages:

```text
apps/
  kinwild/
  legacy-harness/

packages/
  generation-core/   RNG, hashing, schemas, migrations, budgets
  fauna-runtime/     Creature Creator compiler, rigs, and rendering
  flora-runtime/     FloraDNA, growth graphs, rendering, lifecycle
  ecology-runtime/   habitats, affordances, and behavior cards
  style-runtime/     palettes, materials, lines, and lighting contract
  content-tools/     inspectors, batch generation, and visual QA
```

All packages must share one `three` peer dependency. Align the donor runtime
and Creature Creator on one Three.js version before shader integration.

## 5. Runtime contracts

Add provider contracts and legacy adapters before replacing any rendering.
Legacy mode must remain visually and deterministically identical.

```ts
interface WorldContext {
  surface: SurfaceSampler;
  wind: WindField;
  climate: ClimateState;
  affordances: AffordanceIndex;
  events: PresentationEventBus;
  rng: SeedStreams;
}

interface CreatureAgent {
  root: THREE.Object3D;
  interactionRoot: THREE.Object3D;
  traits: CreatureTraits;

  anchor(out: THREE.Vector3): THREE.Vector3;
  bounds(out: THREE.Box3): THREE.Box3;
  setIntent(intent: CreatureIntent): void;
  update(frame: CreatureFrame): void;
  lookAt(target: THREE.Vector3 | null): void;
  react(event: CreatureStimulus): void;
  dispose(): void;
}

interface FloraInstance {
  root: THREE.Object3D;
  speciesHash: string;

  bounds(out: THREE.Box3): THREE.Box3;
  affordances(): readonly Affordance[];
  applyImpulse(point: THREE.Vector3, force: THREE.Vector3): void;
  update(frame: FloraFrame): void;
  dispose(): void;
}
```

Feature flags:

```text
generatedFauna=false
generatedFlora=false
livingWorld=false
```

Support `legacy`, `hybrid`, and `livingWorld` modes during migration. A failed
generated specimen should fall back to its legacy archetype rather than aborting
world construction.

## 6. Source integration map

### Donor-scaffold changes

- Wrap existing `FLORA_BUILDERS` with `LegacyFloraProvider`.
- Split `src/world/flora-placement.js` into:
  - content selection;
  - placement planning;
  - instance construction;
  - affordance registration.
- Move footprint, canopy, obstacle, perch, nectar, and nest-host metadata into
  flora archetype definitions.
- Replace direct `makeCreature()` calls in
  `src/world/fauna-population.js` with a creature provider.
- Replace direct assumptions about `group.position`, `scale`, `flies`, and
  `landState` in:
  - `main.js`;
  - `src/grass.js`;
  - `src/shadows.js`;
  - selection and locator UI;
  - follow and POV cameras.
- Make `src/portal.js` and `src/inspect.js` consume provider preview/specimen
  APIs.
- Extend catalog identity to:

  ```text
  speciesId + genomeHash + generatorVersion + biomeId
  ```

- Preserve aliases for existing Field Guide discoveries.

### Creature Creator changes

- Convert primitive transforms from world-like coordinates to actor-local pose
  space.
- Make the actor root movable, scalable, and parentable.
- Separate movement/behavior authority from rig presentation.
- Add terrain height, normal, material, water, and perch queries.
- Inject deterministic RNG into eyes, ropes, wings, idle timing, and effects.
- Add robust bounds, culling, proxy/custom raycasting, and full disposal.
- Make normalization accept `unknown` and enforce the 24-primitive budget before
  construction.
- Add near, mid, proxy, and offscreen LOD.
- Expose typed anchors for head, eyes, mouth, feet, wings, and tail.
- Expose typed events for footfall, landing, takeoff, sleep, wake, notice, and
  pet reactions.

## 7. Deterministic generation

Create namespaced streams instead of consuming one order-sensitive random
sequence:

```text
world/terrain
world/composition
world/weather
flora/species/2
flora/placement/canopy
fauna/species/1
fauna/individual/7
behavior/individual/7
cosmetic/individual/7
```

Adding a flower variant must not move the landmark or change every creature.

Each generated artifact must include:

- `schemaVersion`;
- `generatorVersion`;
- canonical normalized representation;
- stable content hash;
- diagnostics and repairs;
- estimated render and simulation cost.

Share links and saved catalog entries must include the generator version.

## 8. WorldPlan

Generate a serializable plan before constructing Three.js objects:

```text
WorldPlan
├─ seed, generator version, and world name
├─ climate and biome
├─ shared style genome
├─ terrain and water recipe
├─ arrival vista and postcard camera
├─ hero landmark
├─ paths, clearings, and portal site
├─ habitat patches
├─ flora species roster
├─ fauna species roster
├─ placement records
├─ ecological relationships
├─ weather and focal-event schedule
└─ audio and presentation profile
```

Generation order:

1. Derive independent named RNG streams.
2. Select climate, terrain profile, and world motif.
3. Generate macro terrain and water.
4. Plan arrival vista, landmark, paths, and negative space.
5. Build habitat suitability fields.
6. Generate flora and fauna species rosters.
7. Validate ecological dependencies.
8. Place canopy and landmark flora.
9. Place understory, ground cover, and microflora.
10. Register affordances and obstacles.
11. Allocate fauna territories, families, nests, and gathering points.
12. Select presentation events and camera candidates.
13. Run readability, reachability, and performance repair passes.
14. Instantiate the approved plan.

## 9. Shared style genome

Each world receives a small set of style axes:

- round ↔ angular;
- squat ↔ vertical;
- sparse ↔ clustered;
- smooth ↔ ribbed;
- symmetrical ↔ asymmetric;
- calm ↔ buoyant motion;
- matte ↔ waxy/glassy;
- bands ↔ spots ↔ spirals;
- restrained ↔ magical emission.

These axes influence both flora and fauna. Examples:

- curled plants produce curled horns, tails, or markings;
- fan-shaped flora accompanies fan wings or ears;
- glassy volcanic flora corresponds to reflective shells and crisp accents;
- buoyant cloud flora accompanies floating or hopping fauna.

Art rules:

- fauna uses seamless soft-clay anatomy with hue-derived hull ink;
- flora combines chunky structural forms with layered cut-paper organs;
- environmental screen-space edges remain lighter than fauna ink;
- outlines weaken and disappear with distance;
- background saturation and contrast remain below hero fauna;
- bloom is reserved for emission, discovery, and magic;
- important actions follow anticipation → action → impact → settle;
- no more than one or two focal effects dominate the frame at once.

## 10. Flora Creator

### FloraDNA

Generate species-level genomes. Core fields:

- archetype: tree, shrub, grass, flower, fern, vine, succulent, fungus,
  aquatic, or coral;
- mature height and spread;
- dominant silhouette and asymmetry;
- trunk/stem taper, curvature, and gnarl;
- branching rhythm, angle, twist, and branch order;
- leaf, petal, cap, fruit, thorn, and tendril modules;
- semantic palette roles;
- surface pattern and material family;
- wind stiffness and touch response;
- bloom, fruit, and leaf-drop lifecycle;
- moisture, temperature, light, and slope requirements;
- ecological tags and affordances;
- allowed instance variation;
- hard complexity budget.

Use discriminated schemas so grass cannot request tree-only properties. AI
never writes recursive production strings, matrices, or individual branches.

### Compiler

```text
unknown JSON
→ schema migration
→ defaults and scalar clamping
→ relational repairs
→ complexity estimate
→ deterministic growth graph
→ deterministic pruning
→ organ placement
→ LOD artifact generation
→ phenotype hash + diagnostics
```

Growth-graph nodes need stable path-derived IDs so growth, damage, and saves do
not rebuild unpredictable topology.

### Hybrid renderer

Use SDF where seamlessness materially improves the result:

- trunks and major branch junctions;
- roots entering terrain;
- bulbs and cactus lobes;
- mushroom stems and caps;
- thick vines.

Use instancing for:

- leaves;
- petals;
- needles;
- grass blades;
- fruit;
- spores;
- thorns;
- small flowers.

Compile each species once. Create 8–32 deterministic structural variants for
common plants and instance them across the world. Reserve unique high-detail SDF
graphs for landmarks and hero specimens.

Never create a unique geometry or material for every plant.

### Motion and lifecycle

- CPU updates only primary branch axes.
- GPU handles leaf and petal flutter.
- Wind comes from the same spatial field used by particles and fauna.
- Stiffness depends on radius, branch order, age, and weather load.
- Touch impulses propagate as damped waves.
- Blooming and unfurling use anticipation and slight overshoot.

Flora events:

```text
rustle
pollenBurst
petalDrop
fruitDrop
seedReleased
bloomed
branchSnap
harvest
```

### Flora LOD

- **LOD0:** hero SDF structure, individual organs, full interaction.
- **LOD1:** reduced projection iterations and deterministic organ thinning.
- **LOD2:** swept branch mesh with leaf/petal clusters.
- **LOD3:** multi-view toon impostor.
- **LOD4:** terrain-level canopy or ground-cover mass.

LOD changes presentation only; ecology and gameplay identity remain unchanged.

## 11. Fauna species model

Separate species and individual data.

```text
FaunaSpeciesGenome
  body plan
  proportions
  palette grammar
  markings
  locomotion signature
  ecology role
  temperament range
  voice family
  biome adaptations

FaunaIndividualGenome
  size
  hue/marking offset
  personality
  voice pitch
  age
  relationship state
```

The Kinwild world runtime owns the brain. Creature Creator receives intent:

```text
desired velocity
desired heading
look target
action
expression
sleep/alert state
terrain and perch context
```

The procedural rig translates that intent into grounded, expressive motion.

Fauna LOD:

- **LOD0:** full SDF carrier, three projection iterations, hull ink, secondary
  motion, detailed shadows.
- **LOD1:** reduced carrier, one projection iteration, reduced ropes, lighter
  outline.
- **LOD2:** baked proxy or impostor with simplified motion.
- **Offscreen:** culled rendering and 5–15 Hz simulation/pose updates.

## 12. Ecology and affordances

Generalize current flower, perch, and obstacle collections into a spatial
affordance index:

```text
nectar
food
fruit
shelter
shade
perch
nestHost
nestMaterial
burrow
waterEdge
playObject
hazard
obstacle
observationPoint
```

Examples:

- a mushroom advertises `perch`, `shelter`, and `spore-event`;
- a berry bush advertises `food`;
- reeds advertise `nestMaterial`;
- a giant flower advertises `nectar` and `observationPoint`.

Use legible behavior cards rather than a full survival simulator:

```text
dawn       → forage near favored flora
rain       → seek canopy or mushroom shelter
night      → return to nest, sleep, or emit glow
social     → greet, groom, chase, or play
hungry     → visit food affordance
curious    → inspect player or landmark
pollinator → alternate between nectar sources
```

Validate the resource graph before construction:

- every pollinator has nectar;
- every perching species has perches;
- every nesting species has valid materials and locations;
- fauna populations do not exceed habitat capacity;
- critical habitats remain reachable.

Run ecology at a low fixed tick. Pose and render only visible actors at full
frequency.

## 13. Composition director

Reserve the following before scattering content:

- one readable arrival vista;
- one hero landmark;
- one traversable visual corridor;
- one quiet negative-space region;
- several habitat pockets;
- visible fauna gathering points;
- a deliberate portal destination.

Placement order:

```text
landmark
→ paths and clearings
→ canopy
→ understory
→ ground cover
→ microflora
→ fauna territories
→ focal presentation events
```

Add deterministic postcard-camera scoring using:

- landmark visibility;
- depth layering;
- fauna separation;
- horizon quality;
- foreground framing;
- obstruction;
- color and value contrast.

Run a repair pass that removes obstructing flora, opens encounter clearings,
relocates unreadable fauna, and reduces content if budgets are exceeded.

## 14. Presentation and juice

One event bus coordinates every presentation layer.

| Event | Character or plant | World response | Presentation |
| --- | --- | --- | --- |
| Footfall | Compression and planted foot | Grass bend, mark, dust | Spatial step and subtle shadow pulse |
| Landing | Anticipation, squash, appendage lag | Impact ring and foliage impulse | Low thump and restrained camera impulse |
| Plant contact | Branch bend and leaf flutter | Pollen, petals, or fruit | Rustle and species-colored particles |
| Discovery | Gaze and curiosity pose | Nearby glow or environmental response | Audio sting and focus adjustment |
| Feeding | Mouth and head animation | Fruit removal and branch rebound | Chew/chirp and affinity feedback |
| Weather shift | Shelter or brace behavior | Rain, snow load, stronger wind | Ambience crossfade and light transition |

Audio layers:

- biome ambient beds;
- wind and foliage;
- spatial creature voices;
- footstep material variation;
- localized rustles and pollen bursts;
- discovery and relationship motifs;
- mix ducking around focal events.

Effects must be event-shaped rather than constantly noisy.

## 15. Player loop

Initial loop:

```text
arrive
→ notice
→ follow
→ observe a behavior
→ interact
→ photograph/catalog
→ learn a relationship
→ revisit or share
```

Upgrade Field Guide entries with:

- species appearance;
- habitat;
- temperament;
- observed behaviors;
- flora/fauna relationships;
- best photograph;
- world and seed provenance.

Prove discovery and attachment before adding breeding, trading, economies,
multiplayer, or unrestricted prompt-to-world creation.

## 16. AI content-authoring pipeline

```text
prompt or design intent
→ candidate semantic genome
→ schema validation
→ normalization and repair
→ complexity estimation
→ compile
→ thumbnails and turntable
→ locomotion/lifecycle capture
→ automated scoring
→ AI or human critique
→ mutation loop
→ approved canonical genome
```

Automated checks:

- no NaN or Infinity;
- no primitive or organ budget overflow;
- no detached anatomy;
- readable face and silhouette;
- valid ground contact;
- sufficient palette contrast;
- stable genome hash;
- deterministic replay;
- valid affordance sockets;
- target LOD and frame cost.

Runtime generation uses only validated grammars and bounded mutations.

## 17. Delivery phases

### Phase 0 — Baseline and art lock

- Tag both current projects.
- Capture seed galleries and performance baselines.
- Create a one-page art bible.
- Define three target fauna species and six flora species.
- Use Mushroom Grove for the visual vertical slice.
- Use Verdant Grove as the performance stress scene.

**Exit gate:** approved target frame, motion reference, device list, measurable
budgets, and explicit exclusions.

### Phase 1 — Contracts and legacy adapters

- Align Three.js.
- Add provider interfaces and feature flags.
- Wrap current flora and fauna without changing visuals.
- Add generator/schema versioning and namespaced RNG.
- Make CI run tests, lint, and build before deployment.

**Exit gate:** legacy mode remains visually and deterministically identical.

### Phase 2 — Fauna proof

- Refactor local-space transforms and movement authority.
- Integrate one generated walker.
- Connect terrain, shadows, grass, picking, follow, photo, and disposal.
- Add initial culling and LOD.

**Exit gate:** the walker survives regeneration, pause, sleep, follow, photo,
context restoration, and repeated disposal with no warnings or leaks.

### Phase 3 — Flora Creator MVP

Implement:

- one canopy tree;
- one mushroom family;
- one flower;
- one grass or groundcover;
- one vine or fern;
- one magical or glowing family.

Add growth-graph viewer, hybrid rendering, instancing, wind, touch, and LOD.

**Exit gate:** thousands of compiled genomes produce no crashes; common plants
remain batched; hero plants react convincingly.

### Phase 4 — WorldPlan and composition

- Generate vistas, landmarks, paths, clearings, and habitats.
- Generate flora/fauna rosters from a shared style genome.
- Place flora by suitability and composition roles.
- Place fauna by resources and territories.
- Add postcard-camera and repair passes.

**Exit gate:** at least 100 uncurated seeds, at least 95% readable landmarks,
and no blocked starts, inaccessible portals, empty worlds, or uniform scatter.

### Phase 5 — Ecology and presentation

- Add affordance queries and behavior cards.
- Connect feeding, pollination, shelter, perching, seed spreading, and weather.
- Add presentation event bus, spatial foley, and focal camera treatment.

**Exit gate:** every five-minute deterministic session produces at least three
clearly readable ecological interactions within performance budgets.

### Phase 6 — Player vertical slice

Implement the arrive → observe → interact → catalog → learn → revisit loop.
Add versioned world/species persistence and share links.

**Exit gate:** new players catalog a species within two minutes, understand
their next goal, and form a favorite species during testing.

### Phase 7 — Scale and ship

Expand by biome family:

1. lush/fungal;
2. aquatic/marsh;
3. arid/volcanic;
4. cold/cloud;
5. twilight/magical.

Every family must introduce a new ecological relationship or presentation
mechanic, not merely recolored content.

## 18. Performance plan

Initial constraints:

- no more than approximately eight full-quality SDF fauna simultaneously until
  profiling proves more;
- common flora batches by species and LOD;
- portal previews use proxy flora and fauna;
- offscreen ecology runs at low frequency;
- distant pose updates run at 5–15 Hz;
- no steady-state allocations in animation hot paths;
- distant outlines, detailed shadows, and secondary physics disable first;
- world construction is progressive rather than one blocking generation spike.

Reference gates:

- desktop p95 frame time at or below 16.6 ms on named reference hardware;
- stable mid-mobile 33.3 ms tier, with higher tiers where supported;
- no progressive memory growth across 100 regenerations;
- no shader warnings;
- WebGL context restoration works;
- simulation results do not change materially with rendering LOD.

Stress scenes:

- Verdant: grass, fur, and population;
- Coral: water and reflection;
- Mushroom: complex flora and spores;
- Twilight/Obsidian: bloom and emission;
- portal scene: preview render targets and duplicate content.

## 19. QA and tooling

### Per-commit CI

- type-check;
- unit tests;
- schema and migration tests;
- determinism snapshots;
- lint;
- production build;
- shader compilation;
- provider/adapter contract tests.

### Nightly

- malformed-genome fuzzing;
- batch generation of thousands of flora/fauna genomes;
- canonical-seed screenshots;
- performance captures;
- repeated-regeneration leak tests;
- fixed-tick ecology replay;
- context-loss recovery;
- desktop, mobile, and LOWFX coverage.

### Required tools

- flora skeleton viewer;
- fauna rig inspector;
- genome editor;
- seed gallery/contact-sheet generator;
- world composition overlay;
- habitat and affordance visualization;
- LOD debugger;
- draw/triangle/uniform/GPU-time HUD;
- presentation-event timeline recorder;
- side-by-side legacy/generated comparison.

## 20. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Procedural random soup | Generate composition and species rosters before individuals |
| Generic AI aesthetic | AI writes bounded semantic genomes; runtime enforces the style |
| Flora destroys batching | Compile species once and instance bounded variants |
| Ecology scope explosion | Use affordances and behavior cards, not general artificial life |
| SDF mobile cost | Hard budgets, culling, LOD, and proxy actors |
| Seed drift | Namespaced streams and generator versions |
| Style mismatch | One palette, line, lighting, lens, and motion contract |
| Architecture rewrite trap | Legacy adapters and phase-boundary refactors |
| Infinite content without attachment | Prove discovery, interaction, and revisit first |
| Twelve-biome dilution | One extraordinary Mushroom Grove slice gates expansion |

## 21. First implementation sprint

1. Tag the donor scaffold and Creature Creator baselines.
2. Define reference desktop/mobile devices and record worst-case scenes.
3. Write the art and style contract.
4. Add generated-fauna, generated-flora, and exclusive living-world flags.
5. Define `WorldContext`, `CreatureAgent`, `FloraInstance`, and event contracts.
6. Wrap legacy builders behind those contracts.
7. Align Three.js and eliminate shader warnings.
8. Add namespaced RNG, canonical hashing, and generator versions.
9. Refactor one Creature Creator walker into local actor space.
10. Render it in a neutral generated-specimen harness.
11. Put it on real Verdant terrain with correct picking and footfalls.
12. Begin the FloraDNA schema and growth-graph debug viewer.

## 22. Schedule expectation

For one strong senior generalist working full-time with AI assistance, a truly
polished vertical slice is approximately an 18–24 week program:

- baseline and foundations: 2–3 weeks;
- fauna integration: 2–3 weeks;
- Flora Creator MVP: 3–5 weeks;
- WorldPlan and composition: 3–4 weeks;
- ecology and presentation: 3–4 weeks;
- player slice, stabilization, and polish: 4–6 weeks.

A commercial game remains a larger-team, multi-year effort. This plan is
designed to produce a defensible, trailer-quality proof without sacrificing the
iteration speed or originality of the current systems.
