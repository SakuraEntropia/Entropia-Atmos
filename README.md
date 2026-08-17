# ENTRO ATMOS

AI + Graphics Inspired Spatial Audio Engine

> **"Blender for spatial audio."** Represent → simulate → shade → render →
> deliver, the way modern graphics pipelines produce images.

**Status:** Phase 1 — offline MVP renderer working headless. Docs: [docs/](./docs/) · Roadmap: [docs/ROADMAP.md](./docs/ROADMAP.md)

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
git clone --recursive https://github.com/SakuraEntropia/entropia-atmos.git
cd entropia-atmos
npm install
npm run typecheck
npm test
npm run render -- examples/shoebox.audio_usd.json --impulse --out out.wav
```

Renders the 5×4×3 m shoebox example (image-source early reflections +
FDN late reverberation + HRTF binaural output) to a stereo WAV.

## Repository layout

```
docs/                       SPEC, ARCHITECTURE, ROADMAP, developer intro
src/
├── core/
│   ├── audio_scene/        scene model: emitter, listener, material, environment
│   ├── acoustic_engine/    image-source solver, FDN reverb, air absorption, DIRs
│   ├── renderer/           Acoustic-BRDF, HRTF (parametric + JSON), binaural
│   └── dsp/                FFT convolution, node graph, block processing
├── formats/audio_usd/      Audio-USD v0 schema, JSON reader/writer
├── formats/wav/            PCM 8/16/24/32 + float32 read/write
├── plugins/                VST3 / AU host bridge contracts (Phase 5)
├── tools/                  dataset (AudioGS), converter, headless render CLI
└── research/               papers reading list, experiment log
examples/                   runnable Audio-USD scenes
Entropia-Template-UI_atmos/ UI shell submodule (React + Vite + React Flow),
                            adopted as the Application Layer in Phase 4
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

Core engine and docs: MIT (LICENSE file pending — add before 1.0). The UI
template submodule keeps its own license (MIT, see its README).
