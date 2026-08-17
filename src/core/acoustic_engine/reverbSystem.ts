/** Late-reverberation stage: statistical late field from geometry + materials. */
import type { AudioScene, Hertz, Seconds } from "../audio_scene";
import type { LateField } from "./impulseResponse";

export interface ReverbRequest {
  scene: AudioScene;
  emitterId: string;
  listenerId: string;
  /** Late-field duration to synthesize, seconds. */
  durationSeconds: Seconds;
  /** Target late-field sample rate. */
  sampleRate: Hertz;
}

export interface ReverbSystem {
  /** Estimate per-band decay (T60) and energy from scene volume and mean
   * absorption.
   * TODO: Eyring/Sabine estimation; ray-based energy histograms. */
  estimateLateField(request: ReverbRequest): Promise<LateField>;

  /** Synthesize a decorrelated late-tail IR from a decay estimate.
   * TODO: feedback delay networks (FDN); velvet noise; modal synthesis. */
  synthesize(request: ReverbRequest, estimate: LateField): Promise<Float32Array>;
}
