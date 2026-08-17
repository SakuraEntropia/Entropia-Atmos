/** Energy-conserving splat calibration (experiment 0003).
 *
 * The partition-of-unity splat render is LINEAR in the per-splat opacity
 * (kernel weights do not depend on it), so opacities can be fit by ridge
 * least squares to reproduce the sampled DIR energy at every probe
 * position:
 *
 *     y_p = Σ_s α_s · w_sp · q_sp(dir_sp) / Σ_j w_jp   (band b)
 *
 * The fit runs per analysis band and recombines: opacity = Σ_b α_b,
 * bandEnergies[b] = α_b / opacity. Clamped to ≥ 0 (energy is non-negative).
 */
import type { SplatField, SplatPrimitive, Vec3 } from "../../core/audio_scene";
import { ANALYSIS_BAND_COUNT } from "../../core/dsp/bands";
import { doaToSpherical, shEvaluate, solveDenseLinearSystem } from "../../core/sh";

export interface ProbeEnergy {
  position: Vec3;
  /** Total sampled DIR energy at the probe (Σ gain², 1 kHz band). */
  energy: number;
  /** Optional per-analysis-band energies (0004 fields). */
  bandEnergies?: number[];
}

function kernelWeight(splat: SplatPrimitive, position: Vec3): number {
  const dx = splat.position.x - position.x;
  const dy = splat.position.y - position.y;
  const dz = splat.position.z - position.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const sigma = Math.max(splat.scale.x, splat.scale.y, splat.scale.z);
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

function patternFraction(splat: SplatPrimitive, position: Vec3, bandIndex: number): number {
  const coefficients = splat.bandShCoefficients?.[bandIndex] ?? splat.shCoefficients;
  const dx = splat.position.x - position.x;
  const dy = splat.position.y - position.y;
  const dz = splat.position.z - position.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const azimuthRadians = Math.atan2(dx, dz);
  const elevationRadians = Math.asin(Math.max(-1, Math.min(1, dy / distance)));
  const spherical = doaToSpherical(azimuthRadians, elevationRadians);
  return Math.max(0, 4 * Math.PI * shEvaluate(coefficients, spherical.theta, spherical.phi));
}

/** Fit one band's opacities: returns a vector over splats (≥ 0). */
function fitBandOpacities(
  field: SplatField,
  probes: ProbeEnergy[],
  bandIndex: number,
  ridge = 1e-3
): Float32Array {
  const splatCount = field.primitives.length;
  const ata = new Float64Array(splatCount * splatCount);
  const atb = new Float64Array(splatCount);

  for (const probe of probes) {
    const target = probe.bandEnergies?.[bandIndex] ?? probe.energy;
    if (!Number.isFinite(target)) continue;
    // Kernel row: m_s = w_sp·q_sp; denominator = Σ w (opacity-independent).
    const rows = new Float64Array(splatCount);
    let totalWeight = 0;
    for (let s = 0; s < splatCount; s++) {
      const weight = kernelWeight(field.primitives[s], probe.position);
      totalWeight += weight;
      rows[s] = weight;
    }
    if (totalWeight === 0) continue;
    for (let s = 0; s < splatCount; s++) {
      rows[s] = (rows[s] * patternFraction(field.primitives[s], probe.position, bandIndex)) / totalWeight;
    }
    for (let i = 0; i < splatCount; i++) {
      atb[i] += rows[i] * target;
      for (let j = 0; j < splatCount; j++) ata[i * splatCount + j] += rows[i] * rows[j];
    }
  }
  for (let i = 0; i < splatCount; i++) ata[i * splatCount + i] += ridge;
  const solution = solveDenseLinearSystem(ata, atb);
  return Float32Array.from(solution.map((v) => Math.max(0, v)));
}

/** Re-fit every splat's opacity (and per-band fractions when the field is
 * per-band) so the splat mixture reproduces the sampled probe energies. */
export function calibrateSplatOpacities(field: SplatField, probes: ProbeEnergy[]): SplatField {
  if (field.primitives.length === 0 || probes.length === 0) return field;
  const perBand = field.primitives[0].bandShCoefficients !== undefined;
  const bandCount = perBand ? ANALYSIS_BAND_COUNT : 1;
  const bandFits = Array.from({ length: bandCount }, (_, b) => fitBandOpacities(field, probes, perBand ? b : 0));

  return {
    primitives: field.primitives.map((splat, s) => {
      if (!perBand) {
        return { ...splat, opacity: bandFits[0][s] };
      }
      const total = bandFits.reduce((sum, fit) => sum + fit[s], 0);
      if (total <= 0) return { ...splat, opacity: 0, bandEnergies: Array(bandCount).fill(0) };
      return {
        ...splat,
        opacity: total,
        bandEnergies: bandFits.map((fit) => fit[s] / total),
      };
    }),
  };
}

/** Predicted mixture energy at a probe (for verification/reporting). */
export function predictProbeEnergy(field: SplatField, probe: ProbeEnergy, bandIndex = 1): number {
  let totalWeight = 0;
  for (const splat of field.primitives) totalWeight += kernelWeight(splat, probe.position);
  if (totalWeight === 0) return 0;
  let energy = 0;
  for (const splat of field.primitives) {
    const weight = kernelWeight(splat, probe.position);
    if (splat.bandShCoefficients && splat.bandEnergies) {
      energy += (splat.opacity * splat.bandEnergies[bandIndex] * patternFraction(splat, probe.position, bandIndex) * weight) / totalWeight;
    } else {
      energy += (splat.opacity * patternFraction(splat, probe.position, 0) * weight) / totalWeight;
    }
  }
  return energy;
}

/** Mean absolute energy error over probes (dB), calibration report metric. */
export function calibrationErrorDb(field: SplatField, probes: ProbeEnergy[], bandIndex = 1): number {
  let error = 0;
  let count = 0;
  for (const probe of probes) {
    const target = probe.bandEnergies?.[bandIndex] ?? probe.energy;
    if (!Number.isFinite(target) || target <= 0) continue;
    const predicted = predictProbeEnergy(field, probe, bandIndex);
    error += Math.abs(10 * Math.log10(predicted / target));
    count++;
  }
  return count > 0 ? error / count : 0;
}
