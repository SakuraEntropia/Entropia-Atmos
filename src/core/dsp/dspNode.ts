/** DSP node: the unit of work in a DSP graph. */
import type { AudioBlock } from "./audioBlock";

export interface DspContext {
  sampleRate: number;
  blockSize: number;
  /** Block start time within the render, seconds. */
  timeSeconds: number;
}

export interface DspNode {
  readonly id: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];

  /** Process one block: read named input blocks, write named output blocks.
   * Must be deterministic and side-effect free (real-time safe by design). */
  process(inputs: Readonly<Record<string, AudioBlock>>, context: DspContext): Record<string, AudioBlock>;
}
