# src/ — Module Map

The engine foundation. Every module here is either a **contract** (interface +
types), a **real, small implementation** (validation, scheduling, parsing),
or an explicit **TODO**. Nothing pretends to work.

## Layout & responsibilities

| Module | Responsibility | Depends on |
|---|---|---|
| `core/audio_scene/` | In-memory scene model: emitter, listener, environment, material. Pure data + validation. | — (nothing) |
| `formats/audio_usd/` | Audio-USD serialization (JSON-first) and document model. | `core/audio_scene` |
| `core/acoustic_engine/` | Geometry processing, ray tracing, acoustic simulation, reverberation. Produces directional impulse responses (DIRs). | `core/audio_scene` |
| `core/dsp/` | Audio blocks and DSP graphs with compile-time scheduling. | `core/audio_scene` (unit types only) |
| `core/renderer/` | Acoustic-BRDF, HRTF datasets, binaural rendering orchestration. | `core/audio_scene`, `core/acoustic_engine`, `core/dsp` |
| `tools/dataset/` | AudioGS pipeline: ingestion → voxelization → training → compression → streaming. | `core/audio_scene` |
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
| `core/acoustic_engine` | Contracts only; solver implementations are Phase 1 TODOs |
| `core/dsp` | Block types + graph scheduling (implemented); node library is Phase 1 TODO |
| `core/renderer` | Contracts only; convolution/HRTF are Phase 1 TODOs, GPU is Phase 3 |
| `formats/audio_usd` | Document model + JSON parse/serialize (implemented); prim→scene mapping is Phase 1 TODO |
| `tools/dataset` | Contracts only (Phase 2) |
| `tools/converter` | Registry (implemented); concrete converters are Phase 2 TODOs |
| `plugins/*` | Contracts only (Phase 5) |

## Typecheck

```bash
npm run typecheck   # from the repository root
```

There is no build output yet by design: this foundation is documentation and
contracts. See `docs/ROADMAP.md` for what gets implemented when.
