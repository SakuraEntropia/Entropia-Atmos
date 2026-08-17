/** Parametric spherical-head HRTF (Woodworth ITD + first-order head shadow).
 *
 * A simplified research model used when no measured HRTF set is available:
 * Woodworth's ITD formula plus a first-order lowpass head shadow on the far
 * ear. Honest approximation, not a substitute for measured data — measured
 * sets load via the JSON HRTF dataset, and SOFA loading is a Phase 2 TODO.
 *
 * Direction conventions match the engine's DIR output: azimuth 0 = front
 * (+z), +90° = right (+x); elevation 0 = horizon, +90° = up (+y).
 */
import type { Hertz } from "../../audio_scene";
import type { HrirPair, HrtfDataset } from "../hrtf";

const SPEED_OF_SOUND = 343;

export class SphericalHeadHrtf implements HrtfDataset {
  readonly id = "spherical-head";
  readonly sampleRate: Hertz;
  private readonly cache = new Map<string, HrirPair>();

  constructor(sampleRate: Hertz, private readonly headRadiusMeters = 0.0875) {
    this.sampleRate = sampleRate;
  }

  query(azimuthRadians: number, elevationRadians: number): HrirPair | undefined {
    // Quantize to whole degrees so repeated queries hit the cache.
    const az = Math.round((azimuthRadians * 180) / Math.PI);
    const el = Math.round((elevationRadians * 180) / Math.PI);
    const key = `${az},${el}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const lateral = Math.abs(azimuthRadians);
    // ITD (Woodworth): d = (r/c)·(θ + sin θ), compressed by elevation.
    const itdSeconds =
      (this.headRadiusMeters / SPEED_OF_SOUND) *
      (lateral + Math.sin(lateral)) *
      Math.cos(elevationRadians);
    const itdSamples = Math.max(0, Math.round(itdSeconds * this.sampleRate));
    // Head shadow: contralateral attenuation 1 → 0 across the horizon.
    const farGain = 0.5 + 0.5 * Math.cos(lateral);
    // Lowpass pole depth grows with the shadow; at farGain = 1 (frontal)
    // the far ear degenerates to the near ear exactly.
    const alpha = 0.85 * (1 - farGain);
    const length = itdSamples + 128;

    const near = new Float32Array(length);
    near[0] = 1;
    const far = new Float32Array(length);
    for (let n = itdSamples; n < length; n++) {
      far[n] = (1 - alpha) * Math.pow(alpha, n - itdSamples) * farGain;
    }

    const pair: HrirPair = azimuthRadians >= 0 ? { left: far, right: near } : { left: near, right: far };
    this.cache.set(key, pair);
    return pair;
  }
}
