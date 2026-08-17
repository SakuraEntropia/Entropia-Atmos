/** Ray-tracing solver for general triangle-mesh geometry (Phase 1).
 *
 * Shooting-and-bouncing specular rays (see rayTracing/meshRayTracer.ts).
 * The statistical late field is attached by the engine as usual (for
 * non-rectangular scenes, T60 falls back to environment reverbDefaults).
 * MVP scope: brute-force triangle traversal (BVH is a Phase 3 TODO), no
 * edge diffraction yet.
 */
import type { AudioScene } from "../../audio_scene";
import { DEFAULT_ABSORPTION } from "../materialUtil";
import type { DirectionalImpulseResponse } from "../impulseResponse";
import type { SimulationRequest, Solver } from "../acousticEngine";
import { traceSpecularPaths, type MeshInstance, type SbrOptions } from "../rayTracing/meshRayTracer";

export type RayTracingMesh = { positions: Float32Array; triangles: Uint32Array };

const SPEED_OF_SOUND_DEFAULT = 343;

export class RayTracingSolver implements Solver {
  readonly id = "ray-tracing";
  readonly description =
    "SBR specular ray tracing on triangle meshes (BVH TODO Phase 3, diffraction TODO).";

  constructor(
    private readonly meshes: Map<string, RayTracingMesh>,
    private readonly sbrDefaults?: Partial<SbrOptions>
  ) {}

  async simulate(request: SimulationRequest): Promise<DirectionalImpulseResponse> {
    const { scene, emitterId, listenerId, options } = request;
    const emitter = scene.emitters.find((e) => e.id === emitterId);
    const listener = scene.listeners.find((l) => l.id === listenerId);
    if (!emitter) throw new Error(`unknown emitter '${emitterId}'`);
    if (!listener) throw new Error(`unknown listener '${listenerId}'`);
    if (scene.geometry.length === 0) {
      throw new Error("RayTracingSolver requires scene geometry (assetId references)");
    }

    const instances: MeshInstance[] = scene.geometry.map((ref) => {
      const mesh = this.meshes.get(ref.assetId);
      if (!mesh) throw new Error(`no mesh loaded for assetId '${ref.assetId}' (--mesh assetId=file.obj)`);
      return { mesh, materialId: ref.materialId };
    });

    const environment = scene.environments[0];
    const sbr: SbrOptions = {
      maxReflectionOrder: options.maxReflectionOrder,
      rayCount: options.rayBudget ?? 4000,
      // Capture radius × DOA-cell pairing tuned to avoid multi-counting the
      // same physical path (see meshRayTracer docstring).
      listenerRadius: 0.3,
      doaCellRadians: Math.PI / 12,
      ...this.sbrDefaults,
    };
    const paths = traceSpecularPaths(
      instances,
      emitter.transform.position,
      listener.transform.position,
      sbr,
      {
        sampleRate: options.sampleRate,
        speedOfSound: environment?.speedOfSound ?? SPEED_OF_SOUND_DEFAULT,
        temperatureCelsius: environment?.temperatureCelsius ?? 20,
        humidityPercent: environment?.humidityPercent ?? 50,
        materials: scene.materials,
      }
    );

    return {
      sampleRate: options.sampleRate,
      durationSeconds: 0,
      early: paths,
      late: { bands: [], samples: new Float32Array(0) },
    };
  }
}

/** Wall-material fallback helper shared with the FDN estimate for arbitrary
 * geometry (mean absorption across the first material, or the default). */
export function sceneMeanAbsorption(scene: AudioScene): number {
  const material = scene.materials[0];
  return material ? material.bands[0]?.absorption ?? DEFAULT_ABSORPTION : DEFAULT_ABSORPTION;
}
