/** Ray tracing stage: computes the early part of the directional IR. */
import type { AudioScene, Vec3 } from "../audio_scene";
import type { DirectionalPath } from "./impulseResponse";

export interface TraceRequest {
  scene: AudioScene;
  emitterId: string;
  listenerId: string;
  /** Maximum specular reflection order (0 = direct sound only). */
  maxReflectionOrder: number;
  /** Ray budget for stochastic tracing. */
  rayBudget: number;
}

export interface AcousticRay {
  origin: Vec3;
  direction: Vec3;
  /** Accumulated path length in meters. */
  distanceMeters: number;
  /** Material ids hit so far, in order. */
  materialHits: string[];
}

export interface RayTracer {
  /** Trace direct sound plus specular reflection paths from emitter to
   * listener.
   * TODO: image-source method; stochastic ray casting; BVH traversal (GPU). */
  traceEarlyReflections(request: TraceRequest): Promise<DirectionalPath[]>;

  /** Sample diffracted paths around occluder edges.
   * TODO: UTD edge diffraction; single/double-edge paths;
   * TODO: frequency-dependent diffraction coefficients. */
  traceDiffraction(request: TraceRequest, maxEdgeOrder: number): Promise<DirectionalPath[]>;
}
