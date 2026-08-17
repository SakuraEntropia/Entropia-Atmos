# src/ — Module Map

The engine foundation. Every module here is either a **contract** (interface +
types), a **real, small implementation** (validation, scheduling, parsing),
or an explicit **TODO**. Nothing pretends to work.

## Layout & responsibilities

| Module | Responsibility | Depends on |
|---|---|---|
| `core/audio_scene/` | In-memory scene model: emitter, listener, environment, material, room. Pure data + validation. | — (nothing) |
| `formats/audio_usd/` | Audio-USD serialization (JSON-first), document model, validated `toAudioScene` mapping. | `core/audio_scene` |
| `formats/wav/` | RIFF/WAVE PCM 8/16/24/32 + float32 read/write. | — |
| `core/acoustic_engine/` | Image-source + splat-field solvers, FDN reverb, Sabine T60, ISO 9613-1 air absorption, engine wiring. Produces DIRs. | `core/audio_scene`, `core/sh` |
| `core/dsp/` | Audio blocks, FFT overlap-add convolution, node library, graph scheduling. | `core/audio_scene` (unit types only) |
| `core/sh/` | Real spherical harmonics: basis, weighted LS projection, truncation, error metrics. | — |
| `core/renderer/` | Acoustic-BRDF contract, HRTF (parametric + JSON), offline binaural rendering. | `core/audio_scene`, `core/acoustic_engine`, `core/dsp` |
| `tools/cli/` | Headless renderer + AudioGS field builder (`render`, `audiogs`). | formats, core modules |
| `tools/dataset/` | AudioGS pipeline: field sampling, SH voxelization, splat projection, LOD compression, manifest. | `core/audio_scene`, `core/sh`, `core/acoustic_engine` |
| `tools/converter/` | Format converters and their registry; Audio-USD is the hub format. | `formats/audio_usd` |
| `plugins/vst/`, `plugins/au/` | Host bridge contracts for VST3 / Audio Unit delivery. | `core/dsp`, `formats/audio_usd` |
| `research/` | Papers reading list and experiment logs (not code). | — |

## Dependency rules (enforced by review)

1. `audio_scene` imports nothing from the other modules.
2. Dependencies flow inward only: scene ← engine ← renderer; tools and
   formats sit outside the core and may read core types, never the reverse.
3. The core never imports plugin code.
4. A `TODO` comment in code must name the phase that will implement it,
   e.g. `TODO(Phase 3): ...`. A TODO without a phase is a review nit.

## Conventions

- File naming follows the template: camelCase TS modules, `index.ts` barrels.
- One responsibility per file; barrels export the public surface only.
- Contracts are interfaces with docstring contracts; unfinished work is an
  interface plus a phased TODO — never a stub that pretends to run.
- Real code (validation, scheduling, parsing) is small, honest, and testable.

## Implementation status

| Module | Status |
|---|---|
| `core/audio_scene` | Contracts + structural validation (implemented) |
| `core/sh` | SH basis, weighted LS projection, truncation, error metric (implemented) |
| `core/acoustic_engine` | Image-source + splat-field solvers, FDN reverb, air absorption (implemented); ray tracer/GPU TODO |
| `core/dsp` | FFT overlap-add convolution, node library, graph scheduling (implemented); real-time scheduling TODO (Phase 3) |
| `core/renderer` | Offline binaural renderer, parametric + JSON HRTF (implemented); Acoustic-BRDF/GPU TODO |
| `formats/audio_usd` | v0.2 schema, JSON parse/serialize, `toAudioScene` mapping incl. splatField (implemented) |
| `formats/wav` | PCM/float32 read/write (implemented) |
| `tools/dataset` | Field sampling, SH voxelization, splat projection, LOD compression, manifest (implemented); microphone ingestion + PyTorch trainer TODO |
| `tools/converter` | Registry + splat-field ↔ Audio-USD converter (implemented) |
| `tools/cli` | `render` + `audiogs` headless CLIs (implemented) |
| `plugins/*` | Contracts only (Phase 5) |

## Checks & usage

```bash
npm run typecheck   # strict TypeScript across all contracts and implementations
npm test            # vitest: 43 tests (formats, FFT, DSP, SH, solvers, HRTF, pipelines)
npm run render -- examples/shoebox.audio_usd.json --impulse --out out.wav
npm run audiogs -- examples/shoebox.audio_usd.json --grid 5 --bands 4 --out examples/shoebox.splats
npm run render -- examples/shoebox.splats.audio_usd.json --solver splat-field --impulse --duration 0 --out out.wav
```

Implemented code is honest and testable; everything else remains an
interface plus a phased TODO. See `docs/ROADMAP.md` for what is next.
