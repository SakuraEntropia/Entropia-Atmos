/** Real-time binaural renderer (Phase 3).
 *
 * One stereo "scene IR" per listener pose (paths ⊛ HRTF + late field),
 * convolved in blocks through two streaming convolvers. Listener moves are
 * served by crossfading to a freshly baked scene IR — the MVP of DIR
 * interpolation. Fixed block size; allocations are confined to block
 * buffers. TODO(Phase 3): native/GPU backends behind this contract.
 */
import type { DirectionalImpulseResponse } from "../../acoustic_engine";
import type { HrtfDataset } from "../../renderer/hrtf";
import { fftConvolve } from "../fft";
import { StreamingConvolver } from "./streamingConvolver";

export interface StereoBlockOut {
  left: Float32Array;
  right: Float32Array;
}

function addInto(target: Float32Array, source: Float32Array): void {
  const n = Math.min(target.length, source.length);
  for (let i = 0; i < n; i++) target[i] += source[i];
}

/** Bake a DIR + HRTF into a stereo scene IR (offline, per listener pose). */
export function buildSceneIr(dir: DirectionalImpulseResponse, hrtf: HrtfDataset): { left: Float32Array; right: Float32Array } {
  let maxLength = 0;
  const kernels: { left: Float32Array; right: Float32Array }[] = [];
  for (const path of dir.early) {
    const pair = hrtf.query(path.azimuthRadians, path.elevationRadians) ?? hrtf.query(0, 0);
    if (!pair) throw new Error("buildSceneIr: empty HRTF dataset");
    const left = fftConvolve(pair.left, path.samples);
    const right = fftConvolve(pair.right, path.samples);
    kernels.push({ left, right });
    maxLength = Math.max(maxLength, left.length, right.length);
  }
  const lateLeft = dir.late.stereo?.left ?? dir.late.samples;
  const lateRight = dir.late.stereo?.right ?? dir.late.samples;
  if (lateLeft.length > 0) {
    kernels.push({ left: lateLeft, right: lateRight });
    maxLength = Math.max(maxLength, lateLeft.length, lateRight.length);
  }
  const left = new Float32Array(maxLength);
  const right = new Float32Array(maxLength);
  for (const kernel of kernels) {
    addInto(left, kernel.left);
    addInto(right, kernel.right);
  }
  return { left, right };
}

export class RealtimeBinauralRenderer {
  readonly blockSize: number;
  private currentLeft: StreamingConvolver;
  private currentRight: StreamingConvolver;
  private nextLeft: StreamingConvolver | null = null;
  private nextRight: StreamingConvolver | null = null;
  private rampBlocks = 0;
  private rampPosition = 0;

  constructor(blockSize: number, leftIr: Float32Array, rightIr: Float32Array) {
    this.blockSize = blockSize;
    this.currentLeft = new StreamingConvolver(leftIr, blockSize);
    this.currentRight = new StreamingConvolver(rightIr, blockSize);
  }

  /** Schedule a crossfade to a new scene IR over `rampBlocks` blocks. */
  transitionTo(leftIr: Float32Array, rightIr: Float32Array, rampBlocks: number): void {
    this.nextLeft = new StreamingConvolver(leftIr, this.blockSize);
    this.nextRight = new StreamingConvolver(rightIr, this.blockSize);
    this.rampBlocks = Math.max(1, Math.round(rampBlocks));
    this.rampPosition = 0;
  }

  processBlock(input: Float32Array): StereoBlockOut {
    if (input.length !== this.blockSize) throw new Error(`input block must be ${this.blockSize} samples`);
    const currentLeft = this.currentLeft.processBlock(input);
    const currentRight = this.currentRight.processBlock(input);
    if (!this.nextLeft || !this.nextRight) {
      return { left: currentLeft, right: currentRight };
    }
    const nextLeft = this.nextLeft.processBlock(input);
    const nextRight = this.nextRight.processBlock(input);
    const t = (this.rampPosition + 1) / (this.rampBlocks + 1);
    const left = new Float32Array(this.blockSize);
    const right = new Float32Array(this.blockSize);
    for (let i = 0; i < this.blockSize; i++) {
      left[i] = (1 - t) * currentLeft[i] + t * nextLeft[i];
      right[i] = (1 - t) * currentRight[i] + t * nextRight[i];
    }
    this.rampPosition++;
    if (this.rampPosition >= this.rampBlocks) {
      this.currentLeft = this.nextLeft;
      this.currentRight = this.nextRight;
      this.nextLeft = null;
      this.nextRight = null;
      this.rampBlocks = 0;
      this.rampPosition = 0;
    }
    return { left, right };
  }
}
