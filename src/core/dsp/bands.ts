/** Octave-band filter bank and per-band path-IR synthesis.
 *
 * Four analysis bands (500/1000/2000/4000 Hz) matching the material band
 * convention. Each band is a 4th-order Butterworth band-pass (two cascaded
 * RBJ biquads). Per-path FIRs are synthesized as Σ_band gain_b · h_b(t−delay),
 * so the renderer keeps doing plain convolution while materials shape the
 * spectrum per band.
 */

export interface AnalysisBand {
  id: number;
  centerHz: number;
  lowHz: number;
  highHz: number;
}

export const ANALYSIS_BANDS: readonly AnalysisBand[] = [
  { id: 0, centerHz: 500, lowHz: 354, highHz: 707 },
  { id: 1, centerHz: 1000, lowHz: 707, highHz: 1414 },
  { id: 2, centerHz: 2000, lowHz: 1414, highHz: 2828 },
  { id: 3, centerHz: 4000, lowHz: 2828, highHz: 5657 },
];

export const ANALYSIS_BAND_COUNT = ANALYSIS_BANDS.length;

/** One RBJ biquad band-pass section (constant skirt gain, peak gain Q). */
export function designBandpassSection(centerHz: number, q: number, sampleRate: number): { b0: number; b1: number; b2: number; a1: number; a2: number } {
  const w0 = (2 * Math.PI * centerHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  };
}

/** Impulse response of one band (two cascaded 2nd-order sections). */
export function bandImpulseResponse(band: AnalysisBand, sampleRate: number, length = 512): Float32Array {
  const q = band.centerHz / (band.highHz - band.lowHz);
  const s1 = designBandpassSection(band.centerHz, q, sampleRate);
  const s2 = designBandpassSection(band.centerHz, q, sampleRate);
  const out = new Float32Array(length);
  // Stage 1
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const stage = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    const x = n === 0 ? 1 : 0;
    const y = s1.b0 * x + s1.b1 * x1 + s1.b2 * x2 - s1.a1 * y1 - s1.a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    stage[n] = y;
  }
  // Stage 2
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  for (let n = 0; n < length; n++) {
    const x = stage[n];
    const y = s2.b0 * x + s2.b1 * x1 + s2.b2 * x2 - s2.a1 * y1 - s2.a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    out[n] = y;
  }
  return out;
}

/** Per-band impulse responses, cached per sample rate. */
const bandCache = new Map<number, Float32Array[]>();

export function analysisBandImpulses(sampleRate: number): Float32Array[] {
  let cached = bandCache.get(sampleRate);
  if (!cached) {
    cached = ANALYSIS_BANDS.map((band) => bandImpulseResponse(band, sampleRate));
    bandCache.set(sampleRate, cached);
  }
  return cached;
}

/** Synthesize a path FIR from per-band amplitude gains:
 * h(t) = Σ_band gains[b] · h_band(t − delaySamples). */
export function pathFirFromBandGains(bandGains: number[], delaySamples: number, sampleRate: number): Float32Array {
  const impulses = analysisBandImpulses(sampleRate);
  const length = delaySamples + impulses[0].length;
  const out = new Float32Array(length);
  for (let b = 0; b < ANALYSIS_BAND_COUNT; b++) {
    const gain = bandGains[b] ?? 0;
    if (gain === 0) continue;
    const h = impulses[b];
    for (let n = 0; n < h.length; n++) out[delaySamples + n] += gain * h[n];
  }
  return out;
}

/** Split a signal into analysis bands (energy measurement / tests). */
export function splitIntoBands(signal: Float32Array, sampleRate: number): Float32Array[] {
  const impulses = analysisBandImpulses(sampleRate);
  return impulses.map((h) => {
    const out = new Float32Array(signal.length);
    for (let n = 0; n < signal.length; n++) {
      let sum = 0;
      const limit = Math.min(h.length, signal.length - n);
      for (let k = 0; k < limit; k++) sum += signal[n + k] * h[k];
      out[n] = sum;
    }
    return out;
  });
}
