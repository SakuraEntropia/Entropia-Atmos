/** Image-source solver for rectangular ("shoebox") rooms.
 *
 * Classic geometric acoustics (Allen & Berkley): the source is mirrored
 * across the room's six walls, and each mirror image enumerates one
 * specular reflection path. Direction of arrival, path distance, wall
 * absorption, and ISO 9613-1 air absorption are computed per path.
 *
 * MVP scope (documented simplifications):
 * - rectangular rooms only (`scene.room`); general geometry belongs to the
 *   ray tracer (TODO Phase 1/3);
 * - a single wall material, broadband (1 kHz band) coefficients;
 * - emitter directivity is ignored (TODO Phase 2).
 */
import type { AcousticMaterial, AudioScene, Vec3 } from "../../audio_scene";
import { ANALYSIS_BANDS, pathFirFromBandGains } from "../../dsp/bands";
import type { DirectionalImpulseResponse, DirectionalPath } from "../impulseResponse";
import type { SimulationRequest, Solver } from "../acousticEngine";
import { airAbsorptionFactor } from "../airAbsorption";
import { absorptionAt, reflectionAmplitude } from "../materialUtil";

const SPEED_OF_SOUND_DEFAULT = 343; // m/s at 20 °C

interface EnvironmentView {
  temperatureCelsius: number;
  humidityPercent: number;
  speedOfSound: number;
}

function environmentOf(scene: AudioScene): EnvironmentView {
  const environment = scene.environments[0];
  return {
    temperatureCelsius: environment?.temperatureCelsius ?? 20,
    humidityPercent: environment?.humidityPercent ?? 50,
    speedOfSound: environment?.speedOfSound ?? SPEED_OF_SOUND_DEFAULT,
  };
}

/** Mirror-image coordinate along one axis: n reflections inside [0, size]. */
function imageCoordinate(reflections: number, size: number, source: number): number {
  return reflections * size + (reflections % 2 === 0 ? source : size - source);
}

export class ImageSourceSolver implements Solver {
  readonly id = "image-source";
  readonly description =
    "Allen & Berkley image-source method for rectangular rooms " +
    "(per-band wall absorption, ISO 9613-1 air absorption, no directivity).";

  async simulate(request: SimulationRequest): Promise<DirectionalImpulseResponse> {
    const { scene, emitterId, listenerId, options } = request;
    const emitter = scene.emitters.find((e) => e.id === emitterId);
    const listener = scene.listeners.find((l) => l.id === listenerId);
    if (!emitter) throw new Error(`unknown emitter '${emitterId}'`);
    if (!listener) throw new Error(`unknown listener '${listenerId}'`);
    if (!scene.room) {
      throw new Error(
        "ImageSourceSolver requires scene.room (rectangular room); " +
        "general geometry needs the ray tracer (TODO Phase 1/3)"
      );
    }

    const environment = environmentOf(scene);
    const sampleRate = options.sampleRate;
    const maxOrder = options.maxReflectionOrder;
    const room = scene.room;
    const size: Vec3 = {
      x: room.max.x - room.min.x,
      y: room.max.y - room.min.y,
      z: room.max.z - room.min.z,
    };
    const source = emitter.transform.position;
    const ear = listener.transform.position;

    const wallMaterial: AcousticMaterial | undefined = scene.materials.find((m) => m.id === room.wallMaterialId);
    // Per-analysis-band wall reflection and air absorption coefficients.
    const bandAbsorption = ANALYSIS_BANDS.map((band) => absorptionAt(wallMaterial, band.centerHz));
    const bandReflection = bandAbsorption.map(reflectionAmplitude);

    const paths: DirectionalPath[] = [];
    for (let nx = -maxOrder; nx <= maxOrder; nx++) {
      for (let ny = -maxOrder; ny <= maxOrder; ny++) {
        for (let nz = -maxOrder; nz <= maxOrder; nz++) {
          const reflections = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
          if (reflections > maxOrder) continue;
          const image: Vec3 = {
            x: imageCoordinate(nx, size.x, source.x - room.min.x) + room.min.x,
            y: imageCoordinate(ny, size.y, source.y - room.min.y) + room.min.y,
            z: imageCoordinate(nz, size.z, source.z - room.min.z) + room.min.z,
          };
          const dx = image.x - ear.x;
          const dy = image.y - ear.y;
          const dz = image.z - ear.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (distance < 1e-6) continue; // emitter on the listener: undefined DOA

          const bandGains = ANALYSIS_BANDS.map((band, b) => {
            let gain = 1 / distance;
            if (reflections > 0) gain *= Math.pow(bandReflection[b], reflections);
            gain *= airAbsorptionFactor(
              distance,
              band.centerHz,
              environment.temperatureCelsius,
              environment.humidityPercent
            );
            return gain;
          });

          const delaySamples = Math.round((distance / environment.speedOfSound) * sampleRate);
          const samples = pathFirFromBandGains(bandGains, delaySamples, sampleRate);

          paths.push({
            azimuthRadians: Math.atan2(dx, dz),
            elevationRadians: Math.asin(Math.max(-1, Math.min(1, dy / distance))),
            distanceMeters: distance,
            materialHits: Array(reflections).fill(wallMaterial?.id ?? "default-wall"),
            samples,
            gain: bandGains[1],
            bandGains,
          });
        }
      }
    }
    paths.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return {
      sampleRate,
      durationSeconds: 0, // early-only; the engine attaches the late field
      early: paths,
      late: { bands: [], samples: new Float32Array(0) },
    };
  }
}
