# ENTRO ATMOS — Developer Introduction

> You are reading the developer entry point for ENTRO ATMOS.
> Product definition: [SPEC.md](./SPEC.md) · System design: [ARCHITECTURE.md](./ARCHITECTURE.md) · Plan: [ROADMAP.md](./ROADMAP.md)

---

## What is ENTRO ATMOS?

ENTRO ATMOS is an open, research-grade **spatial audio framework** built on
the idea that sound should be produced the way modern renderers produce
images: represent a scene, simulate its physics, shade it with material
models, and render it through a camera — except the camera is a pair of
ears and the film is a binaural mix.

The pipeline in one line:

```
Audio-USD scene → acoustic simulation → directional IR → DSP/HRTF → binaural audio
```

Core technologies: **Audio Gaussian Splatting (AudioGS)**, **Audio-USD** scene
representation, **acoustic simulation** (geometric + wave), **Acoustic-BRDF**
material shading, **HRTF binaural rendering**, and a **DSP graph** runtime.

---

## Why it exists

Graphics has a shared, open toolchain story — USD/glTF, PBR, path tracing,
Blender. Spatial audio does not: production is split across closed middleware,
DAWs, and bespoke scripts, and research re-implements the same pipeline for
every paper. ENTRO ATMOS is the attempt to build that shared, open layer for
acoustics: a **"Blender for spatial audio"**.

It exists for three communities at once:

- **Researchers** — a reproducible simulation/rendering harness to build
  experiments on.
- **Creators** — a scene-centric way to author spatial sound without leaving
  one workspace.
- **Tool builders** — open formats and stable, versioned contracts to extend.

---

## Repository layout

```
entropia-atmos/                  (GitHub: SakuraEntropia/Entropia-Atmos)
├── docs/                       ← you are here: SPEC, ARCHITECTURE, ROADMAP
├── src/                        ← the engine foundation (TypeScript contracts)
│   ├── core/
│   │   ├── audio_scene/        ← in-memory scene model (emitter, listener,
│   │   │                          environment, material) — pure data
│   │   ├── acoustic_engine/    ← geometry, ray tracing, simulation, reverb
│   │   ├── renderer/           ← Acoustic-BRDF, HRTF, binaural rendering
│   │   └── dsp/                ← DSP graph + block processing
│   ├── formats/audio_usd/      ← Audio-USD scene format (JSON-first)
│   ├── plugins/                ← host bridges: vst/, au/
│   ├── tools/                  ← dataset/ (AudioGS pipeline), converter/
│   └── research/               ← papers/ reading list, experiments/ log
└── Entropia-Template-UI_atmos/ ← the UI template: React + Vite + React Flow
                                   + Zustand. Adopted as the Application Layer.
```

The full module map and dependency rules live in
[`src/README.md`](../src/README.md) and in
[ARCHITECTURE.md](./ARCHITECTURE.md#5-module-map).

---

## Architecture overview

Five layers, inward-only dependencies:

1. **Application** — the UI shell (`Entropia-Template-UI_atmos`), workspaces,
   interaction. Adopted as-is; extended through its existing preset and node
   registry mechanisms.
2. **Scene** — Audio-USD: emitters, listeners, environments, materials.
3. **Engine** — geometry processing, ray tracing, acoustic simulation,
   reverberation. Output: directional impulse responses (DIRs).
4. **Rendering** — DSP graph, Acoustic-BRDF, HRTF, binaural output.
5. **Data** — AudioGS fields, SH compression, scene storage, streaming.

The stable contracts between layers are what make the project modular:

| Contract | Between |
|---|---|
| `AudioScene` model | formats ↔ engine |
| DIR (directional impulse response) | engine ↔ renderer |
| Audio blocks (`AudioBlock`) | renderer ↔ hosts/plugins |
| Splat field + LOD manifest | data layer ↔ engine/renderer |

---

## Development philosophy

- **Interface-first.** Every module ships contracts before implementations.
  Unfinished work is an interface plus a `TODO` marker with a concrete note —
  never a stub that pretends to work.
- **No fake complexity.** If a module is not implemented, it says so, loudly,
  in its header. "Simulated" behavior that looks real but is not is a
  research hazard.
- **Documentation before implementation.** A module's responsibility is
  written in its header and referenced from `src/README.md` before its code
  lands. Docs and code change in the same PR.
- **Minimal dependencies.** The foundation is plain TypeScript with zero
  runtime dependencies. Heavy runtimes (GPU, PyTorch, native DSP) enter only
  as optional adapters behind existing contracts.
- **Physics first, product second.** Quality is measured in energy error and
  ABX listening tests (see SPEC §7), not in feature count.
- **The template is the foundation, not a sandbox.** We do not redesign the
  UI shell; we extend it through its existing extension points.

---

## Getting started

```bash
npm install                      # installs the four dev dependencies
npm run typecheck                # validates all module contracts + implementations
npm test                         # 43 unit tests (formats, FFT, DSP, SH, solvers, pipelines)
npm run render -- examples/shoebox.audio_usd.json --impulse --out out.wav
npm run audiogs -- examples/shoebox.audio_usd.json --grid 5 --bands 4 --out examples/shoebox.splats
npm run render -- examples/shoebox.splats.audio_usd.json --solver splat-field --impulse --duration 0 --out out.wav
```

The `render` command runs the Phase 1 pipeline: Audio-USD scene →
image-source + FDN simulation → HRTF binaural render → WAV. The `audiogs`
command builds an AudioGS splat sound field from the same scene and renders
it through the same pipeline (`--solver splat-field`); measured baseline
numbers live in `src/research/experiments/0001`. For the UI template,
follow its own README:

```bash
cd Entropia-Template-UI_atmos && npm install && npm run dev
```

---

## Contributing

1. Read [SPEC.md](./SPEC.md) to learn *what* we build and [ARCHITECTURE.md](./ARCHITECTURE.md) to learn *how*.
2. Pick work from [ROADMAP.md](./ROADMAP.md); Phase 0 research tasks are
   always open.
3. Record findings and experiments in `src/research/` using the templates
   there.
4. New modules must declare their responsibility in `src/README.md` and obey
   the dependency rules. Breaking a dependency rule or faking an
   implementation is a review-blocking issue.
5. Papers read and experiments run are part of the deliverable — link them.

---

## Status

**Phases 1–5 implemented (v0.4.0).** Offline + real-time renderers, AudioGS
splat fields with calibrated, measured LODs, the creator application, and
plugin tooling are all in the repository with 71 passing tests. Remaining
research TODOs: the differentiable trainer result (experiment 0002),
microphone-array ingestion, native VST3/AU binaries (SDK-dependent), and
GPU backends. See the [status board](./ROADMAP.md#status-board) for the
per-phase detail.
