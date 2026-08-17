/** Audio block: the buffer contract of the DSP layer. */
import type { Hertz } from "../audio_scene";

export interface AudioBlock {
  /** Channel data; all channels have identical length. */
  readonly channels: Float32Array[];
  readonly sampleRate: Hertz;
  readonly length: number;
}

/** Create a zero-filled audio block. */
export function createAudioBlock(channelCount: number, length: number, sampleRate: Hertz): AudioBlock {
  if (channelCount < 1) throw new Error("channelCount must be >= 1");
  if (length < 0) throw new Error("length must be >= 0");
  if (sampleRate <= 0) throw new Error("sampleRate must be > 0");
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < channelCount; channel++) {
    channels.push(new Float32Array(length));
  }
  return { channels, sampleRate, length };
}

/** True when two blocks share sample rate and length (mixing precondition). */
export function isCompatible(a: AudioBlock, b: AudioBlock): boolean {
  return a.sampleRate === b.sampleRate && a.length === b.length;
}
