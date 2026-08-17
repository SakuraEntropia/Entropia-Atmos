/** Gain node: scales a block by a constant (per-sample multiply). */
import type { AudioBlock } from "../audioBlock";
import type { DspContext, DspNode } from "../dspNode";

export class GainNode implements DspNode {
  readonly id: string;
  readonly inputs: readonly string[] = ["in"];
  readonly outputs: readonly string[] = ["out"];

  constructor(id: string, private readonly gain: number) {
    this.id = id;
  }

  process(inputs: Readonly<Record<string, AudioBlock>>, _context: DspContext): Record<string, AudioBlock> {
    const input = inputs["in"];
    if (!input) throw new Error(`GainNode '${this.id}': missing input 'in'`);
    return {
      out: {
        channels: input.channels.map((channel) => channel.map((v) => v * this.gain)),
        sampleRate: input.sampleRate,
        length: input.length,
      },
    };
  }
}
