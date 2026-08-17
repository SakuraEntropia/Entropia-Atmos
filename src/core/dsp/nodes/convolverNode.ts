/** Convolver node: convolves its input with a fixed impulse-response kernel
 * using the FFT overlap-add convolver.
 *
 * Mono kernel (1 channel): output keeps the input's channel count, each
 * channel convolved with the kernel. Stereo kernel (2 channels): output is
 * stereo; both channels are driven by input channel 0.
 */
import type { AudioBlock } from "../audioBlock";
import type { DspContext, DspNode } from "../dspNode";
import { fftConvolve } from "../fft";

export class ConvolverNode implements DspNode {
  readonly id: string;
  readonly inputs: readonly string[] = ["in"];
  readonly outputs: readonly string[] = ["out"];

  constructor(id: string, private readonly kernel: AudioBlock) {
    this.id = id;
  }

  process(inputs: Readonly<Record<string, AudioBlock>>, _context: DspContext): Record<string, AudioBlock> {
    const input = inputs["in"];
    if (!input) throw new Error(`ConvolverNode '${this.id}': missing input 'in'`);

    let channels: Float32Array[];
    if (this.kernel.channels.length >= 2) {
      const mono = input.channels[0];
      channels = [
        fftConvolve(mono, this.kernel.channels[0]),
        fftConvolve(mono, this.kernel.channels[1]),
      ];
    } else {
      channels = input.channels.map((channel) => fftConvolve(channel, this.kernel.channels[0]));
    }
    return {
      out: {
        channels,
        sampleRate: input.sampleRate,
        length: channels[0].length,
      },
    };
  }
}
