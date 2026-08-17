/** Minimal radix-2 FFT and FFT-based overlap-add convolution (no deps).
 *
 * The partitioned overlap-add convolver is the workhorse of the offline
 * binaural renderer. A direct time-domain convolver is exported as the
 * reference implementation for tests and for tiny kernels.
 */

function nextPow2(value: number): number {
  let power = 1;
  while (power < value) power <<= 1;
  return power;
}

/** In-place iterative radix-2 Cooley–Tukey FFT (forward transform). */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (im.length !== n) throw new Error("real/imag length mismatch");
  if ((n & (n - 1)) !== 0 || n === 0) throw new Error("FFT length must be a power of two");

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  // Butterfly stages.
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let cr = 1;
      let ci = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const ur = re[start + k];
        const ui = im[start + k];
        const vr = re[start + k + half] * cr - im[start + k + half] * ci;
        const vi = re[start + k + half] * ci + im[start + k + half] * cr;
        re[start + k] = ur + vr;
        im[start + k] = ui + vi;
        re[start + k + half] = ur - vr;
        im[start + k + half] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Inverse FFT via conjugation: ifft(x) = conj(fft(conj(x))) / n. */
function ifftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1; i < n; i++) im[i] = -im[i];
  fftInPlace(re, im);
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

/** Partitioned overlap-add convolution of two mono signals. */
export function fftConvolve(signal: Float32Array, kernel: Float32Array): Float32Array {
  if (signal.length === 0) return new Float32Array(0);
  if (kernel.length === 0) return new Float32Array(signal.length);

  const outLength = signal.length + kernel.length - 1;
  // Block size: power of two ≥ 2·kernel (keeps segments reasonably large),
  // at least 256 samples.
  const blockSize = nextPow2(Math.max(kernel.length * 2, 256));
  const segmentSize = blockSize - kernel.length + 1;

  const kernelRe = new Float64Array(blockSize);
  const kernelIm = new Float64Array(blockSize);
  for (let i = 0; i < kernel.length; i++) kernelRe[i] = kernel[i];
  fftInPlace(kernelRe, kernelIm);

  const segRe = new Float64Array(blockSize);
  const segIm = new Float64Array(blockSize);
  const out = new Float64Array(outLength);

  for (let start = 0; start < signal.length; start += segmentSize) {
    segRe.fill(0);
    segIm.fill(0);
    const take = Math.min(segmentSize, signal.length - start);
    for (let i = 0; i < take; i++) segRe[i] = signal[start + i];
    fftInPlace(segRe, segIm);
    for (let i = 0; i < blockSize; i++) {
      const a = segRe[i] * kernelRe[i] - segIm[i] * kernelIm[i];
      const b = segRe[i] * kernelIm[i] + segIm[i] * kernelRe[i];
      segRe[i] = a;
      segIm[i] = b;
    }
    ifftInPlace(segRe, segIm);
    const limit = Math.min(blockSize, outLength - start);
    for (let i = 0; i < limit; i++) out[start + i] += segRe[i];
  }
  return Float32Array.from(out);
}

/** Direct time-domain convolution — reference implementation (tests only). */
export function directConvolve(signal: Float32Array, kernel: Float32Array): Float32Array {
  const out = new Float32Array(signal.length + kernel.length - 1);
  for (let i = 0; i < signal.length; i++) {
    const s = signal[i];
    if (s === 0) continue;
    for (let j = 0; j < kernel.length; j++) out[i + j] += s * kernel[j];
  }
  return out;
}
