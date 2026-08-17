/** Source node: plays a fixed buffer once (offline rendering). */
import type { AudioBlock } from "../audioBlock";
import type { DspContext, DspNode } from "../dspNode";

export class SourceNode implements DspNode {
  readonly id: string;
  readonly inputs: readonly string[] = [];
  readonly outputs: readonly string[] = ["out"];

  constructor(id: string, private readonly buffer: AudioBlock) {
    this.id = id;
  }

  process(_inputs: Readonly<Record<string, AudioBlock>>, _context: DspContext): Record<string, AudioBlock> {
    return { out: this.buffer };
  }
}
