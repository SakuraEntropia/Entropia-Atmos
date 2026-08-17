# ENTRO ATMOS

AI + Graphics Inspired Spatial Audio Engine

> **"Blender for spatial audio."** Represent → simulate → shade → render →
> deliver, the way modern graphics pipelines produce images.

**Status:** Phases 1–5 implemented (v0.4.0): offline + real-time renderers
(41.7× headroom), AudioGS splat fields with measured LODs, creator
application, plugin tooling. Measured baselines live in
[`src/research/experiments/`](./src/research/experiments/).
Docs: [docs/](./docs/) · Roadmap: [docs/ROADMAP.md](./docs/ROADMAP.md)

## Introduction

ENTRO ATMOS is an open spatial audio framework.

Inspired by computer graphics pipelines, it applies scene representation and
physical simulation to acoustic computing: **Audio Gaussian Splatting
(AudioGS)** sound fields, **Audio-USD** scene representation, **acoustic
simulation**, **Acoustic-BRDF** material shading, **HRTF binaural rendering**,
and **DSP graph** processing.

## Pipeline

```
Input
Audio Dataset
↓
AudioGS Processing
↓
Audio-USD Scene
↓
Acoustic Simulation
↓
Binaural Renderer
↓
Audio Output
```

## Quick start

```bash
git clone --recursive https://github.com/SakuraEntropia/Entropia-Atmos.git
cd entropia-atmos
npm install
npm run typecheck
npm test
# Phase 1: geometric acoustics render
npm run render -- examples/shoebox.audio_usd.json --impulse --out out.wav
# Phase 2: build an AudioGS splat field and render it
npm run audiogs -- examples/shoebox.audio_usd.json --grid 5 --bands 4 --out examples/shoebox.splats
npm run render -- examples/shoebox.splats.audio_usd.json --solver splat-field --impulse --duration 0 --out out.wav
# Phase 3: real-time latency benchmark
npm run bench-rt -- examples/shoebox.audio_usd.json
# Phase 4: creator application (backend + UI)
cd apps/creator && npm install && npm run server   # then: npm run dev
```

Renders the 5×4×3 m shoebox example (image-source / ray-tracing / AudioGS
solvers, FDN late reverberation, HRTF binaural output) to a WAV, measures
real-time headroom, and serves the creator UI.

## Repository layout

```
docs/                       SPEC, ARCHITECTURE, ROADMAP, developer intro
src/
├── core/
│   ├── audio_scene/        scene model: emitter, listener, material, environment, splats
│   ├── acoustic_engine/    image-source + ray-tracing + splat-field solvers, FDN reverb, DIRs
│   ├── renderer/           Acoustic-BRDF, HRTF (parametric + JSON), binaural (offline)
│   ├── dsp/                FFT, band bank, node graph, realtime streaming convolution
│   └── sh/                 spherical harmonics: basis, projection, compression
├── formats/                audio_usd (v0.2) · wav · obj
├── plugins/                VstBridge/AuBridge, ScenePlugin, DAW host simulator, packaging
├── tools/                  dataset (AudioGS) · converter · benchmark · headless CLIs
├── research/               papers reading list, experiment log (measured numbers)
apps/creator/               Phase 4 creator application (ENTRO workspaces + backend)
examples/                   runnable scenes, meshes, content packs
Entropia-Template-UI_atmos/ UI shell submodule (React + Vite + React Flow),
                            adopted as the Application Layer
```

Full architecture and dependency rules: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Workspaces

The creator application (Phase 4) is organized in five Blender-style
workspaces:

### Bake

AudioGS training and preprocessing.

### Layout

Audio-USD scene construction.

### Shading

Acoustic material definition.

### Simulation

Physical acoustic solving.

### Delivery

Plugin ecosystem.

## Target Platforms

- Standalone Application
- VST3 Plugin
- AU Plugin

## Development philosophy

Interface-first contracts, no fake implementations (unfinished work is an
interface plus a phased `TODO`), documentation before code, and minimal
dependencies — the engine core is plain TypeScript with zero runtime
dependencies. See [docs/README.md](./docs/README.md) for the full guide.

## License

MIT — see [LICENSE](./LICENSE). The UI template submodule keeps its own
license (MIT, see its README).
