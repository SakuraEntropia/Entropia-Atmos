# AudioGS Training Adapter (dataset-side, PyTorch)

The differentiable AudioGS trainer lives **outside** the TypeScript core by
design (ARCHITECTURE.md §7): research code is PyTorch-first, and the core
must stay dependency-free.

## Contract

Input (produced by the TS tooling):

- a `VoxelField` exported as JSON (per-voxel SH coefficients, see
  `../fieldSynthesis.ts`), or raw microphone recordings via `DatasetSource`.

Output:

- a splat-field JSON in the `SerializedSplatField` format
  (`../fieldSynthesis.ts`) — same format the engine solver consumes, so a
  trained model drops into the renderer without API changes.

## TODO(Phase 2 research)

- Spectrogram/SH loss (compare reconstructed directional field against the
  voxel field on a probe sphere).
- Gradient-based densification & pruning (mirroring 3DGS), with the
  analytic `projectFieldToSplats` output as the initialization.
- Evaluation: reuse `splatFieldErrorDb` from the TS core for parity.

The analytic projection pipeline in `../fieldSynthesis.ts` is the reference
baseline every trained model must beat (see `src/research/experiments/`).
