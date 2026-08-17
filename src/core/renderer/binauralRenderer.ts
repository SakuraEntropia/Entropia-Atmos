/** Binaural rendering: DIR + source audio + HRTF → stereo output. */
import type { Hertz } from "../audio_scene";
import type { AudioBlock } from "../dsp";
import type { DirectionalImpulseResponse } from "../acoustic_engine";
import type { HrtfDataset } from "./hrtf";

export interface BinauralRenderRequest {
  /** The directional impulse response to render (engine output). */
  dir: DirectionalImpulseResponse;
  /** Source signal (mono, or the first channel of a multi-channel block). */
  source: Float32Array | AudioBlock;
  hrtf: HrtfDataset;
  sampleRate: Hertz;
}

export interface BinauralRenderer {
  /** Render one DIR into a stereo block. The late field is decorrelated per
   * ear.
   * TODO: partitioned FFT convolution; HRTF interpolation smoothing; GPU. */
  render(request: BinauralRenderRequest): Promise<AudioBlock>;
}
