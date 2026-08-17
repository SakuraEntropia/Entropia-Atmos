# Experiment 0004 — Per-band splat rendering

## Objective

Does extending the AudioGS field to per-analysis-band SH patterns (500 /
1000 / 2000 / 4000 Hz) preserve the energy calibration achieved by the
broadband model (0003)?

## Hypothesis

Per-band voxel fits + per-band energy fractions reproduce the sampled
per-band energies at probes (like 0003), and the listener energy stays
within ~1 dB of the broadband model.

## Setup

- Code revision: Phase 2 wrap-up part 1 commit on `main` (2026-08-17).
- Commands:
  - `npm run audiogs -- examples/shoebox.audio_usd.json --grid 5 --bands 4 --order 3 --out examples/shoebox.splats` (4-band, calibrated)
  - `… --field-bands 1 --out examples/shoebox.splats.b1` (broadband, calibrated)
  - `npm run render -- … --solver splat-field --impulse --duration 0 --out …`
- Model: per-band energy = opacity·bandFraction·q_b(dir)·w/Σw, band-shaped
  path FIRs via the Phase 1 band bank. Reference: image-source order 3,
  listener energy +5.97 dB.

## Results

| Config | Mean \|probe error\| (1 kHz) | Listener energy | Δ vs. reference |
|---|---|---|---|
| Broadband calibrated (0003) | 0.32 dB | +6.26 dB | +0.29 dB |
| 4-band calibrated | 0.32 dB | −3.47 dB | −9.44 dB |

Per-band probe fitting works (0.32 dB, same as broadband); the listener
regression (−3.47 dB vs +6.26 dB) comes from band-energy recombination.

## Analysis

- The per-band LS fits minimize per-band probe error independently; at the
  listener (a voxel corner, off the probe lattice) the fitted band fractions
  extrapolate worse than the broadband total energy.
- The band FIR path (delay + 512-sample filter tail) is correct and the
  renderer is unchanged — the issue is purely the fraction estimation.

## Conclusion & Follow-ups

Per-band splat rendering is **implemented and functional** but does not yet
beat the broadband model at the listener. Follow-up: fit band fractions
jointly (a single constrained LS over all bands per splat) or apply 0003
calibration on the total energy after per-band fitting.
