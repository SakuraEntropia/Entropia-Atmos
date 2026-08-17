/** Geometry processing: prepares scene geometry for simulation and training. */
import type { GeometryRef } from "../audio_scene";

/** An opaque acceleration structure over scene geometry. */
export interface AccelerationStructure {
  readonly buildTimeMs: number;
  readonly triangleCount: number;
  readonly bounds: { min: [number, number, number]; max: [number, number, number] };
  /** Opaque native handle; layout is implementation-defined. */
  readonly handle: unknown;
}

/** A simplified geometry level for acoustic LOD. */
export interface GeometryLevel {
  level: number;
  triangleCount: number;
  ref: GeometryRef;
}

export interface GeometryProcessor {
  /** Load, normalize, and index scene geometry for ray queries.
   * TODO: BVH / uniform-grid construction (native, GPU-friendly). */
  buildAccelerationStructure(geometry: GeometryRef[]): Promise<AccelerationStructure>;

  /** Simplify meshes into acoustic LOD levels under a triangle budget.
   * TODO: quadric edge-collapse or voxel simplification. */
  simplify(geometry: GeometryRef[], triangleBudget: number): Promise<GeometryLevel[]>;

  /** Extract diffraction-relevant edges (UTD) between occluder pairs.
   * TODO: silhouette edge extraction + visibility caching. */
  extractDiffractionEdges(structure: AccelerationStructure): Promise<unknown[]>;

  /** Voxelize geometry for the AudioGS training pipeline.
   * TODO: conservative voxelization, occupancy + normal grids. */
  voxelize(geometry: GeometryRef[], voxelSizeMeters: number): Promise<unknown>;
}
