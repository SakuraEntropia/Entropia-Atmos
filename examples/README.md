# Examples

## shoebox.audio_usd.json

A 5 × 4 × 3 m concrete shoebox room with one point emitter and one listener —
the minimal Phase 1 scene. Render it headless:

```bash
# impulse demo (spherical-head parametric HRTF fallback)
npm run render -- examples/shoebox.audio_usd.json --impulse --out examples/shoebox.wav

# with real source audio and a measured HRIR bank
npm run render -- examples/shoebox.audio_usd.json \
  --sources e1=path/to/voice.wav \
  --hrtf path/to/hrtf.json \
  --max-order 6 --duration 2.0 \
  --out examples/shoebox.wav
```

Rendered WAVs under `examples/` are gitignored build artifacts.

## HRTF JSON shape

```json
{
  "sampleRate": 48000,
  "entries": [
    { "azimuthDegrees": 0, "elevationDegrees": 0, "left": [1.0, 0.5, ...], "right": [1.0, 0.5, ...] }
  ]
}
```

Azimuth 0 = front (+z), +90° = right (+x); elevation 0 = horizon, +90° = up.
Lookup is nearest-neighbor over the bank.
