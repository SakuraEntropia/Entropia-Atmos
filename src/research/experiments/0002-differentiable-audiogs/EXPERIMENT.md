# Experiment 0002 — Differentiable AudioGS trainer (PyTorch)

## Objective

Does gradient-based refinement of the analytic AudioGS splat field beat the
0003 energy-conserving calibration baseline on the shoebox benchmark?

## Hypothesis

A PyTorch re-implementation of the splat render model, training log-opacity
(and optionally SH coefficients) with Adam against the dB-domain probe
energy loss, reduces the mean |dB error| below the 0003 baseline (0.32 dB)
and the listener energy delta below +0.29 dB.

## Setup

- Code revision: `src/tools/dataset/training/train_audiogs.py` on `main`
  (2026-08-17).
- Command:
  `python3 src/tools/dataset/training/train_audiogs.py --field examples/shoebox.splats.field.json --samples examples/shoebox.splats.samples.json --out /tmp/audioGS_optimized.field.json --steps 400 --seed 42`
- Model: broadband (1 kHz) render — y_p = Σ_s α_s·w_sp·q_sp/Σ_j w_jp with
  the same real SH basis as the TS core (cross-checked by round-tripping the
  optimized field JSON through the TS loader and renderer).
- Parameters: log-opacity θ_s (α_s = exp θ_s) from the calibrated analytic
  init; Adam; loss = mean (10·log10(y+1e-9) − 10·log10(t+1e-9))².
- Hardware: Apple Silicon M-series laptop CPU, Python 3.14.6, PyTorch 2.13.0.

## Method

1. Initialize from the calibrated analytic field (0003).
2. Train 400 Adam steps on log-opacity.
3. Evaluate mean/max |dB error| at probes (same metric as
   `calibrationErrorDb`).
4. Export the optimized broadband field in the `SerializedSplatField` schema
   and render it through the REAL TypeScript pipeline
   (`npm run render -- examples/shoebox.audio_usd.json --splats
   /tmp/audioGS_optimized.field.json --solver splat-field --impulse
   --duration 0`) to verify cross-language compatibility and measure the
   listener energy against the image-source reference (+5.97 dB).

## Results

| Metric | 0003 analytic calibration | 0002 trained |
|---|---|---|
| Mean \|probe error\| | 0.32 dB | **0.188 dB** |
| Max \|probe error\| | — | 0.919 dB (init 2.97 dB) |
| Listener energy | +6.26 dB (Δ +0.29) | **+6.13 dB (Δ +0.16)** |
| Loss (dB²) | 0.469 → | 0.090 |

The optimized field round-tripped through the TS loader unchanged — the
Python render model and the TypeScript solver agree (cross-language contract
compatibility confirmed).

## Analysis

- Hypothesis confirmed on both metrics. The gain over 0003 comes from
  minimizing the exact dB-domain objective with gradient descent instead of
  the ridge-clamped linear fit.
- The trained model is broadband (1 kHz); per-band joint fitting (0004
  follow-up) is the natural next step and shares the same loss scaffolding.
- 6 of 60 splats trained to α = 0 (pruned by the non-negativity of exp) —
  density control emerges from the optimization, foreshadowing full
  densification/pruning training.

## Conclusion & Follow-ups

The differentiable trainer **beats the analytic baseline** and closes the
Phase 2 exit criterion ("renderer consumes a splat field without API
changes" + "trainer must beat 0001/0003"). Follow-ups:

- 0004-followup: joint per-band training (bandEnergies + per-band SH).
- 0006: differentiable positions/scales + densification/pruning (full 3DGS
  loop) and spectrogram-domain loss (AudioGS proper).
