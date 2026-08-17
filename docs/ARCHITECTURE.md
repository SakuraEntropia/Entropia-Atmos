# ENTRO ATMOS — Architecture

> Status: Draft v0.1 (foundation)
> Scope: HOW the system is structured, layered, and wired together.
> Companion documents: [SPEC.md](./SPEC.md) (what), [ROADMAP.md](./ROADMAP.md) (when), [README.md](./README.md) (developer entry point).

---

## 1. Design Principles

1. **Graphics-pipeline metaphor.** Acoustics is organized like a renderer:
   scene → simulation → shading → output. Every layer has a direct graphics
   analogue, which keeps the design explainable.
2. **Clean architecture / dependency rule.** Layers depend inward only
   (Application → Scene, Engine, Rendering, Data), never upward. Data flows
   through well-defined intermediate representations (DIRs, splat fields),
   not through direct layer-to-layer calls.
3. **Modular, interface-first.** Every module exposes contracts first and
   implementations later. Unfinished work is an interface plus a `TODO`
   marker — never a fake implementation.
4. **No unnecessary dependencies.** The core is plain TypeScript contracts.
   Heavy runtimes (GPU, ML frameworks, native DSP) are optional adapters
   behind those contracts.
5. **Documentation before implementation.** Every module's responsibility is
   written down (here, in `src/README.md`, and in module headers) before its
   code is written.

---

## 2. System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. APPLICATION LAYER      UI shell, workspaces, user interaction │
│    Entropia-Template-UI_atmos (React + Vite + React Flow + Zustand) │
└──────────────────────────────┬──────────────────────────────────┘
                               │ commands / queries (JSON over /api)
┌──────────────────────────────▼──────────────────────────────────┐
│ 2. SCENE LAYER            Audio-USD scene representation         │
│    Emitter · Listener · Environment · Acoustic Material          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ scene graph
┌──────────────────────────────▼──────────────────────────────────┐
│ 3. ENGINE LAYER           Geometry processing · Ray tracing ·    │
│                           Acoustic simulation · Reverberation    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ directional impulse responses (DIR)
┌──────────────────────────────▼──────────────────────────────────┐
│ 4. RENDERING LAYER        DSP graph · Acoustic-BRDF · HRTF ·     │
│                           Binaural rendering                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ audio buffers (stereo / ambisonic / object)
┌──────────────────────────────▼──────────────────────────────────┐
│ 5. DATA LAYER             AudioGS fields · SH compression ·      │
│                           Scene storage · Streaming              │
└─────────────────────────────────────────────────────────────────┘
```

The Data layer is drawn as the pipeline's tail (storage/streaming) but it is
also a **cross-cutting foundation**: every layer persists through it, and the
AudioGS dataset tooling (layer 5's training half) feeds *back into* the scene
and engine as a neural scene representation. See §4 for the full data flow.

---

## 3. Layer Responsibilities

### 3.1 Application Layer

**Purpose:** everything a human touches.

- **UI** — the Blender-style node-graph shell from
  `Entropia-Template-UI_atmos`: workspace tabs, panel areas, node canvas,
  inspectors, file manager, theming. **This template is the foundation and is
  not redesigned.** It is adopted as-is in Phase 4 and extended with acoustic
  workspace presets and node categories.
- **Workspace system** — ENTRO's five stages map to five workspace presets,
  following the existing `WORKSPACE_PRESETS` mechanism in `src/areas.ts`:
  - **Bake** — AudioGS training and preprocessing (dataset → splats).
  - **Layout** — Audio-USD scene construction (emitters, listeners, geometry).
  - **Shading** — acoustic material assignment and Acoustic-BRDF tuning.
  - **Simulation** — solver selection, bake runs, DIR inspection.
  - **Delivery** — binaural export, plugin packaging.
- **User interaction** — selection, drag-and-drop scene authoring, run status,
  logs. The template's `/api` proxy (`vite.config.ts` → `localhost:8000`) is
  the integration point to the engine backend.

### 3.2 Scene Layer

**Purpose:** the authoring-time truth. A scene is *what the user built*; it is
not tied to any solver or renderer.

**Objects:**

- **Sound emitter** — position/orientation, source type (point / area /
  ambient), per-band directivity, attached signal source.
- **Listener** — head transform (position + orientation), ear spacing, HRTF
  set reference.
- **Environment** — the medium: temperature, humidity, speed of sound,
  air-absorption model, default late-reverb parameters.
- **Acoustic material** — per-frequency-band absorption, scattering, and
  transmission coefficients; the parameter surface of the Acoustic-BRDF.

**Representation:** Audio-USD (`src/formats/audio_usd`). Audio-USD is a layered
scene description in the spirit of Pixar's USD — composable prims, references,
and overrides — but specialized for acoustics. A stable in-memory model
(`src/core/audio_scene`) is the engine-facing API; serialization lives in the
format module so the scene core never depends on file formats.

### 3.3 Engine Layer

**Purpose:** turn a scene into *physics* — the propagation of sound energy.

**Components:**

- **Geometry processing** — mesh loading/normalization, voxelization,
  simplification, acceleration-structure build (BVH). Feeds both ray tracing
  and the AudioGS training pipeline.
- **Ray tracing** — direct sound, specular reflections, occlusion,
  diffraction-edge sampling. Computes the early part of the directional
  impulse response.
- **Acoustic simulation** — the solver registry that orchestrates: geometric
  methods (image source, ray/beam tracing) now; wave-based solvers (FDTD/BEM)
  later as optional plugins.
- **Reverberation** — statistical late-field synthesis (energy decay, T60,
  FDN feedback delay networks) from geometry and materials.

**Canonical output:** a **directional impulse response (DIR)** — time ×
direction-of-arrival energy — which is the stable contract between engine and
renderer, analogous to the rendered image buffer in graphics.

### 3.4 Rendering Layer

**Purpose:** turn DIRs plus source signals into *audio*.

**Components:**

- **DSP graph** — compile-time node graph (sources, convolvers, mixers,
  panners, meters). Block-based processing contract: offline via the
  overlap-add convolver, real-time via the uniformly partitioned
  overlap-save `StreamingConvolver` (one-block latency) and the
  `RealtimeBinauralRenderer` (scene-IR crossfade on listener moves).
- **Acoustic-BRDF** — evaluates a material's directional reflection response
  for engine-driven shading (i.e., how reflection paths are weighted and
  filtered per material). Implemented surface: per-band path FIRs from
  material band coefficients (4th-order Butterworth octave bank).
- **HRTF** — dataset abstraction (SOFA-style), direction lookup, interpolation,
  personalization hooks. Implemented: parametric spherical-head model
  (Woodworth ITD + head shadow) and JSON HRIR bank loader.
- **Binaural rendering** — partitioned convolution of source audio with
  DIRs through per-direction HRTFs → 2-channel output, offline and
  real-time. GPU acceleration is a Phase 3 TODO behind the same contracts.

### 3.5 Data Layer

**Purpose:** representation, compression, and persistence at scale.

**Components:**

- **AudioGS** — sound-field representation as localized Gaussian primitives
  with directional spectral content (see
  [AudioGS, arXiv 2604.08967](https://arxiv.org/abs/2604.08967)). The
  dataset pipeline (`src/tools/dataset`) implements ingestion →
  voxelization → splat projection → calibration → training adapters →
  evaluation.
- **SH compression** — spherical-harmonics projection of directional data
  (AudioGS coefficients, directivity, HRTF subsets) with per-band error
  budgets and levels of detail; `selectLod` streams levels by measured
  error (`tools/dataset/streaming`).
- **Scene storage** — Audio-USD save/load, content-addressed caching of
  baked artifacts (DIRs, splat fields, IR banks), schema versioning and
  migration. Content packs (`plugins/packaging`) bundle scenes for
  delivery targets.

---

## 4. End-to-End Data Flow

```
microphone array / measurements ──┐
simulated sound fields ───────────┼─► Dataset pipeline ─► Voxelization
                                  │          (tools/dataset)        │
                                  │                                 ▼
                                  │                        AudioGS training
                                  │                                 │
                                  ▼                                 ▼
                       Audio-USD scene ◄──────────── Splat field + SH LODs
                    (formats/audio_usd)                     (Data layer)
                                  │
                                  ▼
                     AudioScene model (core/audio_scene)
                                  │
                                  ▼
              Geometry processing ─► Ray tracing ─► Reverb model
                                  │         (core/acoustic_engine)
                                  ▼
                       Directional IR (DIR) bank
                                  │
                                  ▼
        DSP graph: source ─► convolvers ─► mixers  (core/dsp)
                                  │
                                  ▼
              Acoustic-BRDF shading + HRTF convolution (core/renderer)
                                  │
                                  ▼
                      Binaural output (stereo buffers)
                                  │
                                  ▼
             Delivery: standalone render, VST3 / AU plugin hosts
```

Two loops are worth calling out:

1. **Bake loop (offline):** dataset → AudioGS → splat field → scene →
   simulation → DIR bank → cache. Run headless, cached in scene storage.
2. **Render loop (online):** cached DIR bank → DSP graph → binaural output,
   re-evaluated per listener move with sub-20 ms latency target (Phase 3+).

---

## 5. Module Map

| Layer | Repository location |
|---|---|
| Application | `apps/creator/` (ENTRO workspaces + backend; extends the template) |
| Scene | `src/core/audio_scene/` (model), `src/formats/audio_usd/` (format) |
| Engine | `src/core/acoustic_engine/` (image-source, ray-tracing, splat-field solvers) |
| Rendering | `src/core/renderer/`, `src/core/dsp/` (incl. `dsp/realtime/`) |
| Data | `src/core/sh/`, `src/tools/dataset/`, `src/tools/converter/` |
| Plugins | `src/plugins/` (bridges, ScenePlugin, host simulator, packaging) |
| Research | `src/research/papers/`, `src/research/experiments/` |

See `src/README.md` for the dependency rules between these modules.

---

## 6. Dependency Rules

- `audio_scene` is **pure data + validation**; it imports nothing from the
  other modules.
- `formats/audio_usd` depends on `audio_scene` types only; the scene core
  never knows about files.
- `acoustic_engine` reads `audio_scene` and writes DIRs; it never renders.
- `renderer` consumes DIRs + audio; it never simulates.
- `dsp` is self-contained (graphs of blocks); the renderer *uses* it.
- `plugins` adapt the renderer to host formats (VST3 / AU); the core never
  imports plugin code.
- `tools/dataset` consumes `audio_scene` geometry and produces splat fields;
  it is allowed to be the heaviest, slowest part of the codebase.
- Any violation of the above (e.g., a scene type importing a renderer type)
  is a review-blocking bug.

---

## 7. Technology Decisions (current)

| Decision | Choice | Rationale |
|---|---|---|
| Contract language for the core | TypeScript interfaces + `TODO` markers | Matches the template's language and toolchain; cheap to evolve; trivially bound from a future native core |
| Hot-path implementation (later) | Native (Rust/C++ with GPU backends) behind the TS contracts | Real-time + GPU needs; kept optional so the foundation stays dependency-free. The TS real-time core already holds 41.7× headroom at 512/48 kHz |
| Training tooling | Python (PyTorch) as a dataset-side adapter | Research ecosystem; AudioGS literature is PyTorch-first |
| Scene format | Audio-USD, JSON-first, USD-crate later | Start with a readable, diffable format; binary USD compatibility is an adapter, not a rewrite |
| Intermediate representation | DIR (directional impulse response) | Decouples solvers from renderers; enables caching and scene-IR baking |
| UI shell | Adopt `Entropia-Template-UI_atmos` as a component library (`file:` submodule) | The template is the foundation; the creator app extends it through its existing registry/preset mechanisms |

---

## 8. Extension Points

1. **Solvers** — register a new simulator in the engine's solver registry;
   it must emit DIRs.
2. **Materials / Acoustic-BRDFs** — new parameter surfaces and reflection
   models plug into the shading stage.
3. **DSP nodes** — any block-processable node can join the DSP graph.
4. **Formats** — `src/tools/converter` registers readers/writers; Audio-USD
   remains the canonical form.
5. **Hosts** — VST3 and AU are the first plugin bridges; the same renderer
   contract serves future targets (game engines, web audio).
