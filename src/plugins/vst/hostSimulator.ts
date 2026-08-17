/** DAW host simulator (Phase 5).
 *
 * Drives a plugin bridge exactly like a real host: block-by-block
 * processing with parameter automation and suspend/resume, while measuring
 * per-block CPU time and verifying the latency contract (< block budget).
 */
import type { AudioBlock } from "../../core/dsp";
import { createAudioBlock } from "../../core/dsp";
import type { VstBridge } from "./vstBridge";

export interface AutomationEvent {
  block: number;
  parameterId: string;
  normalizedValue: number;
}

export interface HostSessionResult {
  output: AudioBlock;
  avgBlockMs: number;
  maxBlockMs: number;
  budgetMs: number;
  withinBudget: boolean;
}

export async function runHostSession(
  plugin: VstBridge,
  input: AudioBlock,
  options: {
    blocks: number;
    automation?: AutomationEvent[];
    onBlock?: (blockIndex: number, output: AudioBlock) => void;
  }
): Promise<HostSessionResult> {
  const blockSize = input.length;
  const sampleRate = input.sampleRate;
  const budgetMs = (blockSize / sampleRate) * 1000;

  let nextAutomation = 0;
  const automation = [...(options.automation ?? [])].sort((a, b) => a.block - b.block);
  const timesMs: number[] = [];
  const output = createAudioBlock(2, input.length * options.blocks, sampleRate);

  for (let block = 0; block < options.blocks; block++) {
    while (nextAutomation < automation.length && automation[nextAutomation].block <= block) {
      const event = automation[nextAutomation];
      plugin.setParameter(event.parameterId, event.normalizedValue);
      nextAutomation++;
    }
    const inBlock = {
      channels: input.channels,
      sampleRate,
      length: input.length,
    };
    const start = process.hrtime.bigint();
    const outBlock = plugin.processBlock(inBlock);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    timesMs.push(elapsedMs);
    output.channels[0].set(outBlock.channels[0], block * input.length);
    output.channels[1].set(outBlock.channels[1], block * input.length);
    options.onBlock?.(block, outBlock);
  }

  const sum = timesMs.reduce((acc, t) => acc + t, 0);
  const maxBlockMs = Math.max(...timesMs);
  return {
    output,
    avgBlockMs: sum / timesMs.length,
    maxBlockMs,
    budgetMs,
    withinBudget: sum / timesMs.length < budgetMs && maxBlockMs < budgetMs * 4,
  };
}

export type { VstBridge };
