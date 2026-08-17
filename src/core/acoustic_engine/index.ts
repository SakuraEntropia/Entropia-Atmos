/** Acoustic engine — geometry processing, ray tracing, simulation, reverb.
 *
 * Reads AudioScene data and produces DirectionalImpulseResponse values. It
 * never renders audio: that is the renderer's job.
 */
export type {
  DirectionalPath,
  LateBand,
  LateField,
  DirectionalImpulseResponse,
} from "./impulseResponse";
export type { AccelerationStructure, GeometryLevel, GeometryProcessor } from "./geometryProcessor";
export type { AcousticRay, TraceRequest, RayTracer } from "./rayTracer";
export type { ReverbRequest, ReverbSystem, StereoImpulseResponse } from "./reverbSystem";
export type {
  SimulationOptions,
  SimulationRequest,
  Solver,
  SolverRegistry,
  AcousticEngine,
} from "./acousticEngine";
export { airAbsorptionDbPerMeter, airAbsorptionFactor } from "./airAbsorption";
export { absorptionAt, reflectionAmplitude, DEFAULT_ABSORPTION } from "./materialUtil";
export { ImageSourceSolver } from "./solvers/imageSource";
export { FdnReverbSystem, estimateT60 } from "./reverb/fdn";
export { DefaultAcousticEngine, MapSolverRegistry } from "./engine";
export type { DefaultAcousticEngineOptions } from "./engine";
