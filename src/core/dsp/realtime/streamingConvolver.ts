/** Uniformly-partitioned streaming convolution (overlap-save).
 *
 * The real-time workhorse (Phase 3): convolves a streaming input with a
 * fixed kernel at a latency of exactly one block. The kernel is partitioned
 * into block-sized pieces whose spectra are precomputed; per input block we
 * FFT once, multiply-accumulate over the partitions (frequency-domain delay
 * line), and overlap-save the valid half.
 */
import { fftInPlace } from "../fft";

export class StreamingConvolver {
  /** Number of valid output samples per block (= blockSize). */
  readonly blockSize: number;
  /** Internal FFT size (2× blockSize, power of two). */
  readonly fftSize: number;
  private readonly kernelSpectra: { re: Float64Array; im: Float64Array }[];
  private readonly delayLine: { re: Float64Array; im: Float64Array }[];
  private prevBlock: Float32Array;

  constructor(kernel: Float32Array, blockSize: number) {
    if (blockSize < 1 || (blockSize & (blockSize - 1)) !== 0) {
      throw new Error("blockSize must be a power of two");
    }
    this.blockSize = blockSize;
    this.fftSize = blockSize * 2;
    const partitions = Math.max(1, Math.ceil(kernel.length / blockSize));
    this.kernelSpectra = [];
    for (let p = 0; p < partitions; p++) {
      const re = new Float64Array(this.fftSize);
      const im = new Float64Array(this.fftSize);
      for (let i = 0; i < blockSize; i++) {
        const k = p * blockSize + i;
        if (k < kernel.length) re[i] = kernel[k];
      }
      fftInPlace(re, im);
      this.kernelSpectra.push({ re, im });
    }
    this.delayLine = partitions > 1 ? Array.from({ length: partitions - 1 }, () => ({ re: new Float64Array(this.fftSize), im: new Float64Array(this.fftSize) })) : [];
    this.prevBlock = new Float32Array(blockSize);
  }

  /** Process one input block; returns exactly blockSize valid samples. */
  processBlock(input: Float32Array): Float32Array {
    if (input.length !== this.blockSize) throw new Error(`input block must be ${this.blockSize} samples`);

    // Overlap-save window: [previous block | current block] → FFT.
    const re = new Float64Array(this.fftSize);
    const im = new Float64Array(this.fftSize);
    for (let i = 0; i < this.blockSize; i++) {
      re[i] = this.prevBlock[i];
      re[i + this.blockSize] = input[i];
    }
    fftInPlace(re, im);

    // Frequency-domain delay line: Y_n = Σ_p X_{n−p} · K_p.
    const accRe = new Float64Array(this.fftSize);
    const accIm = new Float64Array(this.fftSize);
    const k0 = this.kernelSpectra[0];
    for (let i = 0; i < this.fftSize; i++) {
      accRe[i] = re[i] * k0.re[i] - im[i] * k0.im[i];
      accIm[i] = re[i] * k0.im[i] + im[i] * k0.re[i];
    }
    for (let p = 1; p < this.kernelSpectra.length; p++) {
      const delayed = this.delayLine[p - 1];
      const kp = this.kernelSpectra[p];
      for (let i = 0; i < this.fftSize; i++) {
        accRe[i] += delayed.re[i] * kp.re[i] - delayed.im[i] * kp.im[i];
        accIm[i] += delayed.re[i] * kp.im[i] + delayed.im[i] * kp.re[i];
      }
    }

    // Shift the delay line (drop oldest, push current window spectrum).
    for (let p = this.delayLine.length - 1; p >= 1; p--) {
      this.delayLine[p].re.set(this.delayLine[p - 1].re);
      this.delayLine[p].im.set(this.delayLine[p - 1].im);
    }
    if (this.delayLine.length > 0) {
      this.delayLine[0].re.set(re);
      this.delayLine[0].im.set(im);
    }

    // Inverse FFT via conjugation; keep the valid second half.
    for (let i = 1; i < this.fftSize; i++) accIm[i] = -accIm[i];
    fftInPlace(accRe, accIm);
    const out = new Float32Array(this.blockSize);
    for (let i = 0; i < this.blockSize; i++) {
      out[i] = accRe[i + this.blockSize] / this.fftSize;
    }
    this.prevBlock.set(input);
    return out;
  }
}
