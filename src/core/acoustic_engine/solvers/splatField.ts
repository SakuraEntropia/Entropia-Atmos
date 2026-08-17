/** Splat-field solver: renders an AudioGS splat field directly.
 *
 * Each splat contributes an energy lobe at the listener, normalized by a
 * partition of unity over the Gaussian kernels (Shepard-style kernel
 * regression), so the splat mixture conserves the sampled field energy:
 *
 *     weight_s = exp(−d_s²/(2σ_s²))
 *     energy_s = opacity_s · q_s(dir_s) · weight_s / Σ_j weight_j
 *     path amplitude = √energy_s
 *
 * q(dir) = 4π·SH(dir) is the directional ENERGY FRACTION: it integrates to
 * 4π and equals 1 for an isotropic pattern, so at a splat's own position
 * the rendered energy equals its opacity (calibrated against the sampled
 * field energy). The field is a LOCAL reconstruction: it already encodes
 * reflections, absorption, and air attenuation, and it vanishes outside the
 * sampled volume (documented research limitation). Do NOT layer FDN reverb
 * on top — pass lateFieldDurationSeconds: 0.
 */
import type { AudioScene, SplatPrimitive } from "../../audio_scene";
import { ANALYSIS_BAND_COUNT, pathFirFromBandGains } from "../../dsp/bands";
import { doaToSpherical, shEvaluate } from "../../sh";
import type { DirectionalImpulseResponse, DirectionalPath } from "../impulseResponse";
import type { SimulationRequest, Solver } from "../acousticEngine";

const SPEED_OF_SOUND = 343;

export class SplatFieldSolver implements Solver {
  readonly id = "splat-field";
  readonly description =
    "Renders an AudioGS splat field as directional energy lobes " +
    "(field already encodes propagation; no FDN late field).";

  async simulate(request: SimulationRequest): Promise<DirectionalImpulseResponse> {
    const { scene, emitterId, listenerId, options } = request;
    const emitter = scene.emitters.find((e) => e.id === emitterId);
    const listener = scene.listeners.find((l) => l.id === listenerId);
    if (!emitter) throw new Error(`unknown emitter '${emitterId}'`);
    if (!listener) throw new Error(`unknown listener '${listenerId}'`);

    const fields = scene.splatFields ?? [];
    if (fields.length === 0) {
      throw new Error("SplatFieldSolver requires scene.splatFields (build one with `npm run audiogs`)");
    }

    const environment = scene.environments[0];
    const speedOfSound = environment?.speedOfSound ?? SPEED_OF_SOUND;
    const ear = listener.transform.position;
    const sampleRate = options.sampleRate;

    // Pass 1: lobe energies + partition-of-unity kernel weights.
    const lobes: {
      splat: SplatPrimitive;
      azimuthRadians: number;
      elevationRadians: number;
      distanceMeters: number;
      theta: number;
      phi: number;
      weight: number;
    }[] = [];
    let totalWeight = 0;
    for (const field of fields) {
      for (const splat of field.primitives) {
        const dx = splat.position.x - ear.x;
        const dy = splat.position.y - ear.y;
        const dz = splat.position.z - ear.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance < 1e-6) continue;

        const azimuthRadians = Math.atan2(dx, dz);
        const elevationRadians = Math.asin(Math.max(-1, Math.min(1, dy / distance)));
        const spherical = doaToSpherical(azimuthRadians, elevationRadians);

        const sigma = Math.max(splat.scale.x, splat.scale.y, splat.scale.z);
        const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
        lobes.push({
          splat,
          azimuthRadians,
          elevationRadians,
          distanceMeters: distance,
          theta: spherical.theta,
          phi: spherical.phi,
          weight,
        });
        totalWeight += weight;
      }
    }

    // Pass 2: emit paths (partition-of-unity normalized amplitudes).
    const paths: DirectionalPath[] = lobes.map((lobe) => {
      const delaySamples = Math.round((lobe.distanceMeters / speedOfSound) * sampleRate);
      const { splat } = lobe;
      let samples: Float32Array;
      let gain: number | undefined;
      let bandGains: number[] | undefined;

      if (splat.bandShCoefficients && splat.bandEnergies) {
        // Per-band model (0004): energy fraction q_b per band → band FIR.
        const fractions = ANALYSIS_BAND_COUNT;
        const computed = new Array<number>(fractions);
        for (let b = 0; b < fractions; b++) {
          const q = Math.max(0, 4 * Math.PI * shEvaluate(splat.bandShCoefficients[b] ?? splat.shCoefficients, lobe.theta, lobe.phi));
          const energy = splat.opacity * (splat.bandEnergies[b] ?? 0) * q * lobe.weight;
          computed[b] = totalWeight > 0 ? Math.sqrt(Math.max(0, energy / totalWeight)) : 0;
        }
        bandGains = computed;
        gain = computed[1];
        samples = pathFirFromBandGains(computed, delaySamples, sampleRate);
      } else {
        // Broadband model: energy = opacity · q · w / Σw.
        const q = Math.max(0, 4 * Math.PI * shEvaluate(splat.shCoefficients, lobe.theta, lobe.phi));
        const energy = splat.opacity * q * lobe.weight;
        gain = totalWeight > 0 ? Math.sqrt(Math.max(0, energy / totalWeight)) : 0;
        samples = new Float32Array(delaySamples + 1);
        samples[delaySamples] = gain;
      }

      return {
        azimuthRadians: lobe.azimuthRadians,
        elevationRadians: lobe.elevationRadians,
        distanceMeters: lobe.distanceMeters,
        materialHits: [],
        samples,
        gain,
        bandGains,
      };
    });
    paths.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return {
      sampleRate,
      durationSeconds: 0,
      early: paths,
      late: { bands: [], samples: new Float32Array(0) },
    };
  }
}

/** Convenience: scene must carry splat fields for this solver. */
export function hasSplatFields(scene: AudioScene): boolean {
  return (scene.splatFields?.length ?? 0) > 0;
}
