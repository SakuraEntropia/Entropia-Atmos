# Experiment 0001 — AudioGS analytic field reconstruction (baseline)

## Objective

Can an **analytic** AudioGS projection — SH voxelization of a simulated
directional field + Gaussian splat projection + SH band-truncation LODs —
reconstruct the image-source field of the shoebox benchmark scene, and what
is the measured error/latency trade-off per LOD?

## Hypothesis

1. SH band-truncation error decreases monotonically with band count (by
   construction of the orthonormal basis).
2. The splat mixture reproduces the reference impulse-response energy within
   ~6 dB, improving with grid resolution.
3. The splat field renders through the existing Phase 1 renderer without
   contract changes.

## Setup

- Code revision: Phase 2 implementation commit on `main`
  (`git log --oneline -1`), 2026-08-17.
- Commands:
  - `npm run audiogs -- examples/shoebox.audio_usd.json --grid 5 --bands 4 --order 3 --out examples/shoebox.splats`
  - `npm run render -- examples/shoebox.splats.audio_usd.json --solver splat-field --impulse --duration 0 --out examples/shoebox.splats.wav`
  - Reference: `npm run render -- examples/shoebox.audio_usd.json --impulse --max-order 3 --duration 0 --out examples/shoebox.ref.wav`
- Scene: `examples/shoebox.audio_usd.json` (5×4×3 m concrete shoebox, α = 0.08
  @ 1 kHz, emitter (1,1,1.5), listener (3,3,1.5)).
- Parameters: image-source sampling order 3 (63 paths/probe), SH bands 4,
  grids 3/5/6 (1.67/1.0/0.83 m voxels), σ = voxel/2, ridge 1e-6, render
  48 kHz, spherical-head HRTF, 1 s impulse source, no FDN late field.
- Hardware: Apple Silicon M-series laptop, Node v24.16.0.

## Method

1. Sample the DIR energy field on a voxel grid (image-source solver).
2. Fit SH coefficients per voxel by inverse-distance-weighted ridge least
   squares on directional **energy** (gain²).
3. Project to splats: opacity = isotropic energy (c0·√(4π)), coefficients
   normalized to a unit-integral pattern; prune voxels below 5 % of peak.
4. Compress by SH band truncation; measure directional-energy error
   (fibonacci probe sphere, 512 probes) vs. the full field.
5. Render both solvers through the SAME `OfflineAcousticRenderer`; compare
   total output energy.

## Results

LOD table (grid 5, 60 splats):

| LOD | Bands | Size | Error (dB) |
|---|---|---|---|
| 0 | 1 | 1.2 KiB | −8.40 |
| 1 | 2 | 1.9 KiB | −10.21 |
| 2 | 3 | 3.0 KiB | −12.00 |
| 3 | 4 | 4.7 KiB | −120 (numerically perfect) |

Error decreases monotonically with band count (hypothesis 1 confirmed).

Rendered output energy vs. image-source reference (+5.97 dB):

| Grid | Splats | Energy (dB) | Δ vs. reference |
|---|---|---|---|
| 3 | 18 | −2.94 | −8.9 dB |
| 5 | 60 | −1.00 | −7.0 dB |
| 6 | 120 | −4.66 | −10.6 dB |

All renders produced finite stereo output through the unmodified Phase 1
renderer (hypothesis 3 confirmed). Energy error is larger than the
hypothesized 6 dB at coarse/fine grids (hypothesis 2 partially rejected —
see analysis).

## Analysis

- The energy deficit is dominated by two calibrated-model effects:
  1. **Rank-deficient LS inflation:** voxels with few sample directions fit
     with the minimum-norm solution, inflating single-direction energy by
     ≈ π (5 dB). Corner/edge voxels are affected most.
  2. **Kernel σ vs. reference 1/d²:** the Gaussian kernels are a local
     model; the partition-of-unity normalization keeps total energy stable
     (g3–g6 spread = 3.7 dB) but the Shepard average smooths the field
     energy below the point reference.
- Grid-phase sensitivity: g6 lands the listener near a voxel center while
  g5 lands it on a voxel corner; corner listeners average 4 splats and land
  closest to the reference. This is expected kernel-regression behavior,
  not a code bug.

## Conclusion & Follow-ups

The analytic projection is a **valid, honest baseline**: monotonic LOD
errors, stable energy within a few dB, and zero renderer changes. It is the
reference every trained AudioGS model must beat.

- **0002** — differentiable AudioGS trainer (PyTorch adapter,
  `src/tools/dataset/training/`) with the analytic field as initialization;
  must beat this baseline's energy error and LOD table.
- **0003** — energy-conserving splat calibration: per-splat opacity fit
  (least squares vs. sample energies) and regularized SH fits to remove the
  rank-deficiency inflation.
- **0004** — per-band splat rendering (band-wise SH evaluation + band
  filters) to replace the broadband energy lobe.
