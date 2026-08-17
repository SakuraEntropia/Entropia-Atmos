/** Top-level acoustic engine: orchestrates geometry, tracing, and reverb
 * into a directional impulse response.
 *
 * TODO:
 *   Implement GPU-accelerated acoustic simulation (Phase 3): solver
 *   dispatch, DIR caching keys, and wave-based solver plugins (FDTD/BEM)
 *   registered through SolverRegistry.
 */
import type { AudioScene } from "../audio_scene";
import type { DirectionalImpulseResponse } from "./impulseResponse";
import type { GeometryProcessor } from "./geometryProcessor";
import type { RayTracer } from "./rayTracer";
import type { ReverbSystem } from "./reverbSystem";

/** Solver selection for one simulation run. */
export interface SimulationOptions {
  /** Solver id; "image-source" | "ray-tracing" in Phase 1, wave solvers later. */
  solver: string;
  maxReflectionOrder: number;
  /** Target sample rate for DIR synthesis (path delays, late field). */
  sampleRate: number;
  rayBudget?: number;
  lateFieldDurationSeconds?: number;
}

export interface SimulationRequest {
  scene: AudioScene;
  emitterId: string;
  listenerId: string;
  options: SimulationOptions;
}

/** A pluggable acoustic solver (extension point, ARCHITECTURE.md §8). */
export interface Solver {
  readonly id: string;
  readonly description: string;
  simulate(request: SimulationRequest): Promise<DirectionalImpulseResponse>;
}

export interface SolverRegistry {
  register(solver: Solver): void;
  resolve(id: string): Solver | undefined;
  list(): readonly Solver[];
}

export interface AcousticEngine {
  /** Optional; the MVP image-source solver does not need geometry processing. */
  readonly geometry?: GeometryProcessor;
  /** Optional; ray tracing arrives with general geometry (TODO Phase 1/3). */
  readonly rayTracer?: RayTracer;
  readonly reverb: ReverbSystem;
  readonly solvers: SolverRegistry;

  /** Simulate the directional impulse response for one emitter/listener pair. */
  simulate(request: SimulationRequest): Promise<DirectionalImpulseResponse>;
}
