/** Binaural rendering: DIR + source audio + HRTF → stereo output. */
import type { Hertz } from "../audio_scene";
import type { AudioBlock } from "../dsp";
import { fftConvolve } from "../dsp";
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
   * ear when the engine supplied per-ear IRs. */
  render(request: BinauralRenderRequest): Promise<AudioBlock>;
}

function addInto(target: Float32Array, source: Float32Array): void {
  const n = Math.min(target.length, source.length);
  for (let i = 0; i < n; i++) target[i] += source[i];
}

/** Offline binaural renderer: convolves each DIR path with its HRIR pair
 * and the source signal using the FFT overlap-add convolver.
 *
 * Per-path material filtering is baked into the path IRs by the engine
 * (MVP: broadband 1 kHz coefficients). */
export class SimpleBinauralRenderer implements BinauralRenderer {
  async render(request: BinauralRenderRequest): Promise<AudioBlock> {
    const { dir, hrtf, sampleRate } = request;
    const source = request.source instanceof Float32Array ? request.source : request.source.channels[0];
    if (!source || source.length === 0) throw new Error("binaural render: empty source");

    // Longest kernel decides the output length: per-path stereo IRs or the
    // late tail (its stereo pair when the engine supplied one).
    let maxKernel = 0;
    const pathKernels: Float32Array[][] = [];
    for (const path of dir.early) {
      const pair = hrtf.query(path.azimuthRadians, path.elevationRadians) ?? hrtf.query(0, 0);
      if (!pair) throw new Error("binaural render: HRTF dataset is empty");
      const left = fftConvolve(pair.left, path.samples);
      const right = fftConvolve(pair.right, path.samples);
      pathKernels.push([left, right]);
      maxKernel = Math.max(maxKernel, left.length, right.length);
    }
    const lateLeft = dir.late.stereo?.left ?? dir.late.samples;
    const lateRight = dir.late.stereo?.right ?? dir.late.samples;
    if (lateLeft.length > 0) maxKernel = Math.max(maxKernel, lateLeft.length, lateRight.length);

    const outLength = source.length + maxKernel - 1;
    const left = new Float32Array(outLength);
    const right = new Float32Array(outLength);
    for (const [l, r] of pathKernels) {
      addInto(left, fftConvolve(source, l));
      addInto(right, fftConvolve(source, r));
    }
    if (lateLeft.length > 0) {
      addInto(left, fftConvolve(source, lateLeft));
      addInto(right, fftConvolve(source, lateRight));
    }

    return { channels: [left, right], sampleRate, length: outLength };
  }
}
