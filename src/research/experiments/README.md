# Experiments — Log & Conventions

Every research claim in ENTRO ATMOS is backed by an experiment logged here.
Experiments are the project's evidence trail: roadmap exit criteria cite them
by id, and papers cite them by id plus artifact hash.

## Directory layout

```
experiments/
├── README.md                  ← this file
├── EXPERIMENT_TEMPLATE.md     ← start new experiments from this
├── 0000-template/             ← one folder per experiment, zero-padded ids
│   ├── EXPERIMENT.md          ← the log (required)
│   └── artifacts/             ← figures, audio, IR files (git-lfs later)
└── ...
```

## Naming & ids

- One folder per experiment: `NNNN-short-slug`, e.g. `0001-shoebox-ir-energy`.
- Ids are allocated sequentially; never reused.
- Artifacts live in the experiment's `artifacts/` folder and are referenced
  by relative path plus content hash (sha256) in the log.

## Log format

Copy `EXPERIMENT_TEMPLATE.md` into your experiment folder as `EXPERIMENT.md`.
Fill every section — a section that does not apply is written as
"Not applicable: <why>", never deleted.

## Reproducibility rules

1. State the code revision (git commit) and the exact command line.
2. Random seeds are explicit and fixed.
3. Reference benchmark scenes/IRs are pinned by hash in `tools/dataset`.
4. A "result" without a measured number and its artifact is not a result —
   reopen the experiment.
5. Failed experiments are logged too; they are first-class evidence.

## Status board

| Experiment | Question | Status |
|---|---|---|
| [0001-audiogs-field-reconstruction](./0001-audiogs-field-reconstruction/EXPERIMENT.md) | Can the analytic AudioGS projection reconstruct the shoebox field? What are the LOD errors? | done — energy within 1–4.7 dB of reference; LOD errors −8.4/−10.2/−12.0 dB |
| 0002 | Differentiable AudioGS trainer must beat the 0001 baseline | allocated |
| 0003 | Energy-conserving splat calibration (opacity fit, SH regularization) | allocated |
| 0004 | Per-band splat rendering | allocated |
