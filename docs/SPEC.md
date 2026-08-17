# ENTRO ATMOS — Specification

> Status: Draft v0.1 (foundation)
> Scope: WHAT the project is, for whom, and what it will and will not do.
> Companion documents: [ARCHITECTURE.md](./ARCHITECTURE.md) (how), [ROADMAP.md](./ROADMAP.md) (when), [README.md](./README.md) (developer entry point).

---

## 1. Project Vision

ENTRO ATMOS is an open, research-grade spatial audio framework that treats
**sound the way modern renderers treat light**.

Computer graphics went from hard-coded tricks to principled pipelines —
scene representation (USD, glTF), physically-based shading (BRDFs), real-time
ray tracing, and neural scene reconstruction (NeRF, 3D Gaussian Splatting).
Spatial audio production has not made the same leap: it is still dominated by
closed ecosystems, hand-tuned effects chains, and formats that cannot describe
an acoustic scene.

ENTRO ATMOS ports the graphics pipeline metaphor to acoustics:

| Graphics concept | ENTRO ATMOS equivalent |
|---|---|
| 3D scene (USD / glTF) | **Audio-USD** acoustic scene |
| Surface material + BRDF | **Acoustic material + Acoustic-BRDF** |
| Ray tracing / global illumination | **Acoustic simulation** (geometric + wave) |
| Radiance field / 3DGS | **Audio Gaussian Splatting (AudioGS)** sound fields |
| Camera + film + tone mapping | **Listener + HRTF + binaural renderer** |
| Shader graph | **DSP graph** |
| DCC application (Blender) | **Creator application** (the template UI shell) |

The product vision is a single sentence: **"Blender for spatial audio."**

---

## 2. Problem Statement

Traditional spatial audio workflows suffer from four structural problems:

1. **High production complexity.** Authoring an immersive scene requires
   stitching together game-audio middleware, DAW routing, measurement-grade
   IR libraries, and bespoke scripts. There is no single scene-centric
   authoring environment.
2. **Expensive, non-reproducible rendering.** Quality acoustic rendering is
   either offline and slow (wave solvers) or real-time and approximate
   (geometric), with little control over the accuracy/latency trade-off and
   few reproducible pipelines.
3. **Closed ecosystems.** Binaural data, HRTF sets, and scene formats are
   locked to vendor runtimes, making research comparisons and tool
   interoperability difficult.
4. **Missing physically-based acoustic workflows.** Unlike graphics — which
   has PBR materials, BRDF models, and path tracing as common ground — acoustics
   lacks a shared, open scene description plus a pluggable simulation/rendering
   stack around it.

ENTRO ATMOS addresses all four with one integrated, open pipeline:
represent → simulate → render → deliver.

---

## 3. Target Users

| Persona | What they need | Primary surface |
|---|---|---|
| **Acoustic researchers** | Reproducible simulation experiments, dataset pipelines, pluggable solvers | Engine core, `src/research` |
| **Spatial audio / sound designers** | Scene-centric authoring, material "shading" of sound, fast iteration | Creator application (workspaces) |
| **Game / XR audio developers** | Real-time binaural engine, plugin & library integration | Engine core, plugin SDK |
| **ML audio researchers** | AudioGS training/compression tooling, evaluation harnesses | `src/tools/dataset`, experiments |
| **Tool builders** | Open formats and stable contracts to build on | Audio-USD, plugin APIs |

---

## 4. Core Features

Priorities: P0 = foundation, P1 = MVP, P2 = research/scale, P3 = product.

| ID | Feature | Priority | Phase |
|---|---|---|---|
| F-01 | Audio-USD scene representation (emitter, listener, environment, material) | P0 | 1 |
| F-02 | Acoustic material model with per-band absorption / scattering / transmission | P0 | 1 |
| F-03 | Acoustic-BRDF reflection model | P0 | 1 |
| F-04 | Geometric acoustic simulation (image source / ray tracing: early reflections, occlusion, diffraction) | P1 | 1 |
| F-05 | Late reverberation synthesis (statistical / FDN) | P1 | 1 |
| F-06 | HRTF-based binaural rendering with per-listener orientation | P1 | 1 |
| F-07 | DSP graph processing (compile-time graph, block processing) | P1 | 1 |
| F-08 | AudioGS training from measured / simulated sound fields | P2 | 2 |
| F-09 | SH (spherical harmonics) compression & streaming of AudioGS fields | P2 | 2 |
| F-10 | Scene storage: asset pipeline, caching, versioning | P2 | 2 |
| F-11 | Real-time engine: GPU acceleration, BVH acceleration, low-latency streaming | P2 | 3 |
| F-12 | Creator application: Blender-style workspaces (Bake / Layout / Shading / Simulation / Delivery) | P3 | 4 |
| F-13 | VST3 / AU plugin delivery of rendered scenes | P3 | 5 |
| F-14 | Plugin ecosystem SDK (custom solvers, materials, node types) | P3 | 5 |

---

## 5. Functional Requirements

### 5.1 Scene representation (Audio-USD)

- **FR-01** A scene SHALL contain any number of sound emitters, listeners,
  acoustic materials, and environments.
- **FR-02** Emitters SHALL support point, area, and ambient source types and
  per-band directivity.
- **FR-03** Listeners SHALL define a head transform (position + orientation)
  plus an HRTF set reference.
- **FR-04** Materials SHALL define per-frequency-band absorption, scattering,
  and transmission coefficients.
- **FR-05** Environments SHALL define the propagation medium (temperature,
  humidity, speed of sound, air-absorption model).
- **FR-06** Scenes SHALL be serializable to and from the Audio-USD format
  without loss of the above data.

### 5.2 Acoustic simulation

- **FR-07** The engine SHALL compute early reflections (direct sound + specular
  reflections + diffraction paths) for an emitter/listener pair.
- **FR-08** The engine SHALL estimate a late-reverberation tail from scene
  geometry and materials (energy decay, T60, modal density proxy).
- **FR-09** Simulation SHALL produce a directional impulse response (DIR) as
  its canonical intermediate representation.
- **FR-10** Every solver SHALL be selectable per bake (pluggable solver
  registry) and SHALL report its own accuracy/cost envelope.

### 5.3 Rendering

- **FR-11** The renderer SHALL convolve source audio with DIRs and produce
  binaural (2-channel) output for a listener.
- **FR-12** HRTF processing SHALL support interpolation over listener
  orientation and, eventually, personalization.
- **FR-13** Rendering SHALL be expressible as a DSP graph that can be compiled
  and executed block-wise (offline first, real-time later).
- **FR-14** Rendering SHALL support arbitrary sample rates and report
  CPU/memory cost per rendered second.

### 5.4 AudioGS / data

- **FR-15** The dataset pipeline SHALL ingest microphone-array recordings
  and/or simulated sound fields into a common training representation.
- **FR-16** AudioGS training SHALL output a splat field (position, orientation,
  spectrogram/SH coefficients, opacity proxy) reconstructing the sound field.
- **FR-17** Compression SHALL produce streamable levels of detail with a
  measurable reconstruction error (e.g., spectrogram distance).
- **FR-18** Scene storage SHALL support save/load, content-addressed caching,
  and schema versioning.

### 5.5 Application & delivery

- **FR-19** The creator application SHALL expose the five ENTRO workspaces:
  Bake, Layout, Shading, Simulation, Delivery.
- **FR-20** Plugins (VST3, AU) SHALL load a baked scene and render it inside a
  DAW with automation-addressable parameters.

---

## 6. Non-Goals

- **Not a DAW.** Sequencing, MIDI composition, and audio editing are out of
  scope; ENTRO ATMOS renders and delivers, it does not record or arrange.
- **Not a visual renderer.** We borrow graphics *concepts and formats*, but
  visual output is only a debugging aid, never a product goal.
- **Not a closed middleware runtime.** No license-locked SDK; everything in
  the core is open and pluggable.
- **Not a game-engine replacement.** The engine core is engine-agnostic;
  per-engine integrations (Unity/Unreal) are third-party plugin territory,
  not a core deliverable.
- **Not a measurement suite.** While dataset tooling exists, ENTRO ATMOS is
  not a certified acoustical measurement product (ISO 3382, etc.).
- **Not v1 scope:** full wave-based solvers (FDTD/BEM) live behind interfaces
  as optional plugins; the MVP ships geometric + statistical acoustics.

---

## 7. Success Metrics

### 7.1 Engineering

- **M-01** Full pipeline (scene → simulation → binaural render) runs headless
  from a single Audio-USD file with one command (Phase 1).
- **M-02** ≥ 95 % of public core APIs are interface-first with unit tests
  covering contracts and serialization round-trips.
- **M-03** Render-time regression budget: every solver commit ships a
  benchmark; no solver PR merges with > 5 % slowdown without review sign-off.
- **M-04** Schema stability: breaking Audio-USD changes require a documented
  migration path (Phase 1+).

### 7.2 Acoustic quality

- **M-05** Directional IR energy error vs. reference (image-source or
  measured benchmark) below a per-scene threshold defined in Phase 0
  benchmark suite.
- **M-06** AudioGS reconstruction error (spectral distance vs. held-out
  measurements) improves monotonically per LOD level.
- **M-07** Listening-test parity: binaural output indistinguishable from the
  reference pipeline in ≥ 60 % of ABX trials on the Phase 0 test set.

### 7.3 Adoption / product

- **M-08** ≥ 1 peer-reviewed publication or arXiv preprint using ENTRO ATMOS
  as its evaluation harness (Phase 2-3).
- **M-09** ≥ 1 external contributor per active module (Phase 4+).
- **M-10** VST3/AU plugin loads a baked scene in a major DAW with
  < 20 ms added latency (Phase 5).

---

## 8. Terminology

| Term | Definition |
|---|---|
| **AudioGS** | Audio Gaussian Splatting: reconstructing a sound field as a set of localized Gaussian primitives carrying directional spectral content; see [AudioGS (arXiv 2604.08967)](https://arxiv.org/abs/2604.08967) and related work in `src/research/papers`. |
| **Audio-USD** | An acoustic scene description format with USD-style layered prims for emitters, listeners, materials, and environments. |
| **Acoustic-BRDF** | A reflection model describing how sound energy is re-radiated by a surface given incident and outgoing directions and the material parameters — the acoustic analogue of a BRDF. |
| **DIR** | Directional Impulse Response: the time- and direction-dependent energy arriving at the listener; the canonical intermediate between simulation and rendering. |
| **HRTF / HRIR** | Head-Related Transfer Function / Impulse Response: the filter a human head applies to a sound depending on its direction of arrival. |
| **SH** | Spherical Harmonics: the orthonormal basis used to compress directional data (AudioGS coefficients, directivity, HRTFs). |
| **Workspace** | A Blender-style panel layout for one stage of the workflow: Bake, Layout, Shading, Simulation, Delivery. |
