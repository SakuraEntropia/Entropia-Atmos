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
| [0001-audiogs-field-reconstruction](./0001-audiogs-field-reconstruction/EXPERIMENT.md) | Can the analytic AudioGS projection reconstruct the shoebox field? What are the LOD errors? | done — LOD errors −8.4/−10.2/−12.0 dB; superseded by 0003 calibration |
| [0002-differentiable-audiogs](./0002-differentiable-audiogs/EXPERIMENT.md) | Does the PyTorch trainer beat the analytic baseline? | done — 0.317 → 0.188 dB probe error; listener Δ +0.16 dB (beats 0003) |
| [0003-energy-conserving-calibration](./0003-energy-conserving-calibration/EXPERIMENT.md) | Does per-splat opacity LS calibration conserve field energy? | done — 8.30 → 0.32 dB probe error; listener within 0.29 dB of reference |
| [0004-perband-splat-rendering](./0004-perband-splat-rendering/EXPERIMENT.md) | Does per-band splat rendering keep the calibration? | done — probe error matches; listener recombination open (follow-up: joint per-band training) |
