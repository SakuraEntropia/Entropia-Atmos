/** Sum node: mixes all connected inputs channel-wise into one block. */
import { createAudioBlock, isCompatible, type AudioBlock } from "../audioBlock";
import type { DspContext, DspNode } from "../dspNode";

export class SumNode implements DspNode {
  readonly id: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[] = ["out"];

  constructor(id: string, inputCount: number) {
    this.id = id;
    this.inputs = Array.from({ length: inputCount }, (_, i) => `in${i + 1}`);
  }

  process(inputs: Readonly<Record<string, AudioBlock>>, _context: DspContext): Record<string, AudioBlock> {
    const present = Object.values(inputs).filter((block): block is AudioBlock => block !== undefined);
    if (present.length === 0) throw new Error(`SumNode '${this.id}': no connected inputs`);
    const first = present[0];
    const out = createAudioBlock(first.channels.length, first.length, first.sampleRate);
    for (const block of present) {
      if (!isCompatible(block, first)) {
        throw new Error(`SumNode '${this.id}': incompatible blocks (rate/length)`);
      }
      block.channels.forEach((channel, c) => {
        const target = out.channels[c];
        for (let i = 0; i < channel.length; i++) target[i] += channel[i];
      });
    }
    return { out };
  }
}
