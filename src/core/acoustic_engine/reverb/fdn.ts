/** Statistical late reverberation via a feedback delay network (FDN).
 *
 * Classic FDN (Jot & Chaigne 1991): N delay lines fed through a unitary
 * Householder feedback matrix with per-line one-pole damping, tuned so the
 * broadband decay envelope matches the Sabine T60 estimate at 1 kHz.
 *
 * MVP scope (documented simplifications):
 * - broadband FDN matched to the 1 kHz band; per-band FDNs, velvet noise,
 *   and modal synthesis are Phase 2 TODOs;
 * - two FDN instances with permuted delay sets decorrelate the ears.
 */
import type { AudioScene, Hertz, Seconds } from "../../audio_scene";
import type { LateField } from "../impulseResponse";
import type { ReverbRequest, ReverbSystem, StereoImpulseResponse } from "../reverbSystem";
import { absorptionAt } from "../materialUtil";

const ANALYSIS_FREQUENCY_HZ = 1000;
const LINE_COUNT = 8;
/** Base delay-line lengths in seconds (coprime-ish, 29–61 ms). */
const BASE_DELAYS = [0.029, 0.037, 0.041, 0.043, 0.047, 0.053, 0.059, 0.061];
/** Permuted set for the right-ear instance (decorrelation). */
const RIGHT_DELAYS = [0.031, 0.039, 0.043, 0.047, 0.053, 0.057, 0.061, 0.067];
/** One-pole damping coefficient; frequency-dependent damping is Phase 2. */
const DAMPING = 0.35;

export class FdnReverbSystem implements ReverbSystem {
  async estimateLateField(request: ReverbRequest): Promise<LateField> {
    const t60Seconds = estimateT60(request.scene);
    return {
      bands: [{ centerHz: ANALYSIS_FREQUENCY_HZ, t60Seconds, gainDb: 0 }],
      samples: new Float32Array(0),
    };
  }

  async synthesize(request: ReverbRequest, estimate: LateField): Promise<StereoImpulseResponse> {
    const t60Seconds = estimate.bands[0]?.t60Seconds ?? 0.5;
    const length = Math.max(1, Math.round(request.durationSeconds * request.sampleRate));
    return {
      left: synthesizeFdn(length, request.sampleRate, t60Seconds, BASE_DELAYS),
      right: synthesizeFdn(length, request.sampleRate, t60Seconds, RIGHT_DELAYS),
    };
  }
}

/** Sabine T60 estimate from a rectangular room and its wall material. */
export function estimateT60(scene: AudioScene): Seconds {
  const room = scene.room;
  if (room) {
    const sx = room.max.x - room.min.x;
    const sy = room.max.y - room.min.y;
    const sz = room.max.z - room.min.z;
    const volume = sx * sy * sz;
    const surface = 2 * (sx * sy + sx * sz + sy * sz);
    const material = scene.materials.find((m) => m.id === room.wallMaterialId);
    const absorption = absorptionAt(material, ANALYSIS_FREQUENCY_HZ);
    if (absorption > 0 && surface > 0 && volume > 0) {
      const t60 = (0.161 * volume) / (surface * absorption);
      return Math.min(10, Math.max(0.05, t60));
    }
  }
  const fallback = scene.environments[0]?.reverbDefaults?.t60ByBand
    ?.find((band) => Math.abs(band.centerHz - ANALYSIS_FREQUENCY_HZ) < 250)?.t60Seconds;
  return fallback ?? 0.5;
}

/** Run one FDN instance and return its late-tail impulse response. */
function synthesizeFdn(
  length: number,
  sampleRate: Hertz,
  t60Seconds: Seconds,
  delaySeconds: number[]
): Float32Array {
  const delays = delaySeconds.map((d) => Math.max(1, Math.round(d * sampleRate)));
  const lines = delays.map((d) => new Float32Array(d));
  const read = new Float32Array(LINE_COUNT);
  const write = new Float32Array(LINE_COUNT);
  const damped = new Float32Array(LINE_COUNT);

  const meanDelay = delaySeconds.reduce((a, b) => a + b, 0) / delaySeconds.length;
  // Per-loop broadband gain so the decay envelope reaches −60 dB at t = T60.
  const loopGain = Math.pow(10, (-3 * meanDelay) / t60Seconds);
  const out = new Float32Array(length);
  let position = 0;

  for (let n = 0; n < length; n++) {
    for (let i = 0; i < LINE_COUNT; i++) read[i] = lines[i][position % delays[i]];

    let sum = 0;
    for (let i = 0; i < LINE_COUNT; i++) {
      const y = (1 - DAMPING) * read[i] + DAMPING * damped[i];
      damped[i] = y;
      sum += y;
    }
    out[n] = sum / LINE_COUNT;

    // Householder feedback: (2/N)·1 − I, scaled by the loop gain.
    const mix = (2 / LINE_COUNT) * sum;
    for (let i = 0; i < LINE_COUNT; i++) {
      write[i] = loopGain * (mix - damped[i]);
    }
    if (n === 0) {
      for (let i = 0; i < LINE_COUNT; i++) write[i] += 1; // impulse seed
    }
    for (let i = 0; i < LINE_COUNT; i++) lines[i][position % delays[i]] = write[i];
    position++;
  }
  return out;
}
