# Experiment 0003 — Energy-conserving splat calibration

## Objective

Does fitting per-splat opacity by least squares (the splat mixture is linear
in opacity) make the analytic AudioGS baseline reproduce the sampled field
energy at the probe positions — and at the listener?

## Hypothesis

Ridge least squares over opacities reduces the mean probe-energy error from
the ~8 dB analytic baseline to < 1 dB, with the listener energy following
suit.

## Setup

- Code revision: Phase 2 wrap-up commit on `main` (2026-08-17).
- Commands:
  - `npm run audiogs -- examples/shoebox.audio_usd.json --grid 5 --bands 4 --order 3 --out examples/shoebox.splats` (4-band, calibrated)
  - `… --field-bands 1 --out examples/shoebox.splats.b1` (broadband, calibrated)
  - `npm run render -- … --solver splat-field --impulse --duration 0 --out …`
- Model: y_p = Σ_s α_s·w_sp·q_sp/Σ_j w_jp, per-band fits, clamp α ≥ 0,
  ridge 1e-3. Reference: image-source order 3 (DIR energy +5.97 dB at the
  listener).

## Results

| Config | Mean \|probe error\| | Listener energy | Δ vs. reference |
|---|---|---|---|
| Uncalibrated broadband (0001 baseline) | 8.30 dB | −1.00 dB | −6.97 dB |
| **Calibrated broadband** | **0.32 dB** | **+6.26 dB** | **+0.29 dB** |
| Calibrated 4-band (0004) | 0.32 dB | −3.47 dB | −9.44 dB |

Hypothesis confirmed for the broadband model: 8.30 → 0.32 dB probe error and
listener energy within 0.29 dB of the reference (was 6.97 dB off).

## Analysis

- The calibration is an ordinary linear fit — cheap, deterministic, and
  analytically justified (partition-of-unity weights are opacity-free).
- The 4-band model's listener regression (−3.47 dB) comes from per-band
  fraction fitting: band-wise fits minimize per-band probe error, but the
  band-energy recombination at the listener accumulates fit bias. Its probe
  error matches broadband (0.32 dB), so the issue is listener-position
  extrapolation, not the LS itself.

## Conclusion & Follow-ups

Calibrated broadband is the **new Phase 2 baseline** (listener energy within
0.29 dB of image-source). Updates:

- **0002** — the differentiable trainer must beat 0.32 dB probe error /
  0.29 dB listener error.
- **0004** — investigate per-band recombination (fit fractions jointly, not
  per band) to close the 4-band listener gap.
- **0001** — superseded baseline; keep its LOD table, which is unchanged.
