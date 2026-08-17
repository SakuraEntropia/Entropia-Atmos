# ENTRO ATMOS — Roadmap

> Status: Draft v0.1 (foundation)
> Scope: development phases, deliverables, and exit criteria.
> Companion documents: [SPEC.md](./SPEC.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [README.md](./README.md).

Phases are sequential in intent but overlap in practice: research tasks from
Phase 0 continue in the background of every later phase, and interfaces for a
phase are sketched one phase ahead so contracts never block progress.

---

## Phase 0 — Research Prototype

**Goal:** establish the theoretical foundation and validate feasibility on
one small scene end to end.

**Scope**

- Literature review pinned in `src/research/papers/`:
  - AudioGS and acoustic neural fields (AudioGS arXiv 2604.08967, AV-GS,
    Neural Acoustic Fields)
  - geometric room acoustics (image source, ray/beam tracing)
  - statistical reverberation (FDN / energy-decay models)
  - HRTF datasets and binaural synthesis
  - 3D Gaussian Splatting and SH compression techniques
- Define the Audio-USD v0 schema (prims, layers, versioning).
- Define the DIR (directional impulse response) contract.
- Benchmark suite: 2–3 reference scenes with ground-truth IRs (measured or
  high-accuracy image-source).

**Deliverables**

- `src/research/experiments/` log with a feasibility notebook per question.
- Frozen Audio-USD v0 schema document.
- Reference IR benchmark + evaluation script skeleton in `src/tools/dataset`.

**Exit criteria**

- A single emitter/listener pair in a shoebox scene renders a plausible
  binaural impulse response from a handwritten pipeline (no engine yet).
- The team can answer: which simulation method for which scene class, at what
  cost/accuracy envelope.
- Audio-USD v0 schema has survived one serialization round-trip review.

---

## Phase 1 — Minimum Viable Acoustic Renderer

**Goal:** offline, headless, reproducible spatial audio rendering from an
Audio-USD scene.

**Scope**

- `src/core/audio_scene` — full scene model + validation (pure data).
- `src/formats/audio_usd` — JSON-first reader/writer + round-trip tests.
- `src/core/acoustic_engine` — image-source + ray-tracing early reflections,
  edge-diffraction pass, statistical late reverb (FDN), solver registry.
- `src/core/dsp` — block-processing DSP graph with sources, convolvers,
  mixers, gain, delay.
- `src/core/renderer` — HRTF dataset interface (SOFA-style), Acoustic-BRDF
  shading of reflection paths, partitioned-convolution binaural renderer.
- CLI: one command renders `scene.audio_usd` → stereo/binaural WAV.

**Deliverables**

- `entropy-atmos render scene.audio_usd --out scene.wav` working headless.
- Unit tests: serialization round-trips, DSP graph scheduling, IR energy
  conservation checks.
- Benchmark harness: per-scene render time and IR error vs. Phase 0 references.

**Exit criteria**

- Full pipeline runs from one scene file (SPEC FR-01…FR-14).
- DIR energy error vs. reference below the Phase 0 threshold on all benchmark
  scenes.
- ≥ 80 % interface coverage by tests in the modules touched this phase.

---

## Phase 2 — AudioGS Integration

**Goal:** neural sound-field representation as a first-class scene citizen.

**Scope**

- `src/tools/dataset` — ingestion of microphone-array recordings and
  simulated fields; voxelization; training/eval split tooling.
- AudioGS training adapter (PyTorch, dataset-side): Gaussian primitives with
  spectrogram/SH directional content.
- SH compression with LODs + streaming manifest; reconstruction error metrics
  (spectral distance, directional energy error).
- Engine integration: splat fields as an alternative scene representation
  feeding the same renderer (hybrid geometric + neural).

**Deliverables**

- Trained AudioGS model for one benchmark scene with published eval numbers
  in `src/research/experiments/`.
- Compression LODs: 3 levels with measured error/latency trade-off.
- Converter: splat field ↔ Audio-USD reference/override.

**Exit criteria**

- AudioGS reconstruction error improves monotonically per LOD.
- Renderer consumes a splat field without API changes to `renderer`'s public
  contracts (proving the DIR/scene contracts hold).
- One preprint-quality write-up of the pipeline (SPEC M-08).

---

## Phase 3 — Real-Time Engine

**Goal:** interactive listener movement at DAW-grade latency.

**Scope**

- Native core (Rust/C++ bindings behind the TS contracts) with GPU
  acceleration: BVH ray queries, partitioned convolution, HRTF interpolation.
- DIR interpolation / switching over listener movement; streaming LODs from
  Phase 2 compression.
- Real-time-safe DSP graph (lock-free scheduling, fixed block sizes, denormals
  handling, latency budget).
- `src/plugins/` host bridge contracts finalized (VST3/AU skeleton).

**Deliverables**

- Real-time render loop with < 20 ms added latency on the benchmark scenes.
- Benchmark: CPU/GPU cost curves, listener-move transition quality (no
  audible artifacts under stress test).
- Plugin bridge proof-of-concept loading a baked scene.

**Exit criteria**

- Interactive head-tracked listening demo.
- Latency and CPU/GPU budgets met on reference hardware (documented in
  `src/research/experiments/`).

---

## Phase 4 — Creator Application

**Goal:** make the engine usable by humans — "Blender for spatial audio".

**Scope**

- Adopt `Entropia-Template-UI_atmos` as the Application Layer (unchanged
  shell; no redesign).
- Add ENTRO workspace presets via the existing `WORKSPACE_PRESETS`
  mechanism: **Bake / Layout / Shading / Simulation / Delivery**.
- Acoustic node categories in the node library (sources, materials, solvers,
  DSP, meters).
- Backend service behind the template's `/api` proxy: scene CRUD, bake
  jobs, DIR inspection, export.

**Deliverables**

- Creator application with the five ENTRO workspaces.
- 3D viewport (debug aid) with emitter/listener manipulators.
- Headless and GUI paths share 100 % of the engine code.

**Exit criteria**

- A sound designer, without reading engine docs, can: build a scene, assign
  materials, bake, audition binaurally, and export.
- UI demo video + user study (SPEC M-09 groundwork).

---

## Phase 5 — Plugin Ecosystem

**Goal:** deliver ENTRO ATMOS scenes anywhere audio is made.

**Scope**

- VST3 plugin: load baked scene, render inside DAW, automation-addressable
  listener/emitter/mix parameters.
- AU plugin (macOS) with the same surface.
- Plugin SDK: third-party solvers, materials, DSP nodes, and converter
  registration with versioned, documented contracts.
- Package/distribution tooling: signed bundles, upgrade paths, example
  content pack.

**Deliverables**

- VST3 + AU builds passing host validation (e.g., in Reaper / Logic / Live).
- SDK guide + one third-party example plugin (e.g., a custom reverb solver).
- Content pack: example Audio-USD scenes + baked artifacts.

**Exit criteria**

- A DAW user loads a baked scene and renders in real time without ENTRO
  tooling installed (SPEC F-13/F-14, M-10).
- ≥ 1 external plugin exists that the core team did not write.

---

## Status Board

| Phase | State | Current focus |
|---|---|---|
| 0 — Research Prototype | Active (background) | literature review, benchmark reference IRs |
| 1 — MVP Renderer | **Complete** | exit criteria met: benchmark harness (0.44 dB ray vs image-source), general-geometry ray tracer, per-band materials |
| 2 — AudioGS | **In progress** | 0003 calibration (0.32 dB probe error), 0004 per-band splats done; 0002 differentiable trainer running |
| 3 — Real-Time Engine | **Implemented (TS core)** | streaming convolution, IR crossfade, LOD streaming, 41.7× headroom benchmark; native/GPU TODO |
| 4 — Creator App | **Implemented** | apps/creator (ENTRO workspaces + backend API), built and smoke-tested |
| 5 — Ecosystem | **Implemented (contracts + tooling)** | ScenePlugin + host simulator + packaging + native build specs; real VST3/AU binaries need the SDK |

### Phase 1 progress (v0.1.0)

Implemented and tested (28 unit tests, `npm test`):

- `formats/audio_usd` — v0 schema frozen; JSON parse/serialize + validated
  `toAudioScene` mapping (emitter, listener, material, environment, geometry,
  room).
- `core/acoustic_engine` — `ImageSourceSolver` (Allen & Berkley, ±order
  enumeration), `FdnReverbSystem` (Householder FDN + Sabine T60),
  ISO 9613-1 air absorption, `DefaultAcousticEngine` + solver registry.
- `core/renderer` — `SimpleBinauralRenderer` (FFT overlap-add), parametric
  `SphericalHeadHrtf` (Woodworth ITD + head shadow), JSON HRIR bank loader.
- `core/dsp` — FFT/overlap-add convolver, node library (source/gain/sum/
  convolver), topological graph scheduling.
- `formats/wav` — PCM 8/16/24/32 + float32 read/write.
- `tools/cli` — headless renderer: `npm run render -- <scene> --impulse --out out.wav`.

Remaining for Phase 1 exit: benchmark harness vs. reference IRs (energy
error), ray tracer + general geometry, per-band material filtering.

### Phase 2 progress (v0.2.0)

Implemented and tested (43 unit tests):

- `core/sh` — orthonormal real SH basis, weighted ridge LS projection, band
  truncation, directional-energy error metric.
- `tools/dataset` — image-source field sampling, SH voxelization
  (energy = gain²), splat projection (opacity + normalized patterns),
  band-truncation LODs with measured error, JSON serialization + streaming
  manifest.
- `core/acoustic_engine` — `SplatFieldSolver` (partition-of-unity kernel
  regression, energy-fraction patterns) feeding the unchanged Phase 1
  renderer; FDN bypass via `lateFieldDurationSeconds: 0`.
- `formats/audio_usd` — schema 0.2.0 (additive `splatField` prim).
- `tools/converter` — `SplatFieldConverter` (splat field ↔ Audio-USD).
- `tools/cli` — `npm run audiogs` field builder; `render --solver splat-field`.
- `research/experiments/0001` — baseline measured: energy within 1–4.7 dB of
  the image-source reference across grids; LOD errors −8.4/−10.2/−12.0 dB.

Remaining for Phase 2 exit: differentiable PyTorch trainer (must beat the
0001 baseline), microphone-array ingestion, energy-conserving calibration
(0003), per-band splat rendering (0004).

### Phase 1 wrap-up (v0.3.0)

- `core/dsp/bands` — 4th-order Butterworth octave-band bank; image-source
  and ray paths carry per-band gains (material bands × ISO 9613-1 per band)
  baked into band-shaped path FIRs.
- `formats/obj` + `RayTracingSolver` — SBR specular ray tracing on triangle
  meshes (Möller–Trumbore, DOA-clustered capture); cross-validated against
  image-source: 0.44 dB DIR energy delta, identical direct gain.
- `tools/benchmark` + `npm run bench` — SPEC M-05 comparison harness.

### Phase 3 progress (v0.4.0)

- `core/dsp/realtime` — uniformly partitioned overlap-save
  `StreamingConvolver` (one-block latency), `RealtimeBinauralRenderer` with
  scene-IR crossfade on listener moves, `buildSceneIr` bake.
- `tools/dataset/streaming` — manifest-driven LOD selection + streamer.
- `npm run bench-rt` — 41.7× real-time headroom at 512 samples/48 kHz on
  reference hardware.
- TODO(Phase 3): native/GPU backends behind the existing contracts.

### Phase 4 progress (v0.4.0)

- `apps/creator` — Vite app extending the template component library with
  the five ENTRO workspaces, an ENTRO inspector panel (template's
  `registerPanelContent` hook), and acoustic node definitions.
- `apps/creator/server.ts` — dependency-free backend (`/api/status`,
  `/api/nodes`, `/api/scene/load`, `/api/render`, `/api/audiogs`,
  `/api/export`) driving the engine core; all endpoints smoke-tested.

### Phase 5 progress (v0.4.0)

- `src/plugins/vst/scenePlugin` — reference `VstBridge` implementation on
  the Phase 3 realtime renderer (automation: `master_gain`).
- `src/plugins/vst/hostSimulator` — DAW-style block sessions with
  automation, suspend/resume, and real-time budget verification.
- `src/plugins/packaging` + `npm run pack` — content-pack manifests +
  validation; starter pack in `examples/packs/entropia-starter`.
- Native build specs (`vst/native`, `au/native`) with CMake skeleton;
  actual VST3/AU binaries require the respective SDKs (documented TODO).

> Phases are gated by exit criteria, not by dates. Dates are added only when a
> phase exits; see the experiment log for progress evidence.
