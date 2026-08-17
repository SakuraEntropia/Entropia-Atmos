/** AudioGS field synthesis — the implemented half of the Phase 2 pipeline.
 *
 * Real reconstruction path (no training required):
 *
 *   1. `sampleFieldWithImageSource` — simulate a directional sound field by
 *      running the Phase 1 image-source solver at a grid of probe positions.
 *   2. `ShFieldVoxelizer` — fit SH coefficients per voxel from nearby
 *      directional samples (ridge least squares, energy = gain²).
 *   3. `projectFieldToSplats` — emit one Gaussian splat per non-empty voxel:
 *      opacity = isotropic energy, SH coefficients = normalized directional
 *      pattern.
 *   4. `compressSplatField` + `splatFieldErrorDb` — SH band-truncation LODs
 *      with measured directional-energy error per level.
 *
 * The differentiable AudioGS trainer (densification/pruning in PyTorch)
 * replaces step 2-3 with gradient descent in later research — see
 * training/README.md.
 */
import type { AudioScene, SplatField, SplatPrimitive, Vec3 } from "../../core/audio_scene";
import { ImageSourceSolver } from "../../core/acoustic_engine";
import type { SimulationRequest } from "../../core/acoustic_engine";
import {
  doaToSpherical,
  fibonacciDirections,
  shEvaluate,
  shTruncate,
  shWeightedLeastSquaresFit,
} from "../../core/sh";
import type { SplatLevel, VoxelField } from "./pipeline";

/** One directional observation of the field at a probe position. */
export interface DirectionalSample {
  position: Vec3;
  directions: { azimuthRadians: number; elevationRadians: number; gain: number }[];
}

/** Sample the sound field of `emitterId` at each probe position using the
 * image-source solver. Returns one DirectionalSample per probe. */
export async function sampleFieldWithImageSource(
  scene: AudioScene,
  emitterId: string,
  probePositions: Vec3[],
  maxReflectionOrder: number
): Promise<DirectionalSample[]> {
  const solver = new ImageSourceSolver();
  const samples: DirectionalSample[] = [];
  for (const position of probePositions) {
    // Directional gains are sample-rate independent; a low rate keeps the
    // path IRs (delayed impulses) tiny.
    const request: SimulationRequest = {
      scene: { ...scene, listeners: [{ id: "__probe__", name: "probe", transform: { position, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } } }] },
      emitterId,
      listenerId: "__probe__",
      options: { solver: "image-source", maxReflectionOrder, sampleRate: 1000 },
    };
    const dir = await solver.simulate(request);
    samples.push({
      position,
      directions: dir.early.map((path) => ({
        azimuthRadians: path.azimuthRadians,
        elevationRadians: path.elevationRadians,
        // Path IR is a delayed impulse: the impulse value is the gain.
        gain: path.samples[path.samples.length - 1],
      })),
    });
  }
  return samples;
}

export interface FieldGrid {
  resolution: [number, number, number];
  voxelSizeMeters: number;
  origin: Vec3;
}

/** Voxelize directional samples by inverse-distance-weighted ridge LS SH
 * fit per voxel. Voxels with no samples within range stay empty (zeros). */
export function voxelizeDirectionalField(
  samples: DirectionalSample[],
  grid: FieldGrid,
  bandCount: number
): VoxelField {
  const [nx, ny, nz] = grid.resolution;
  const voxelCount = nx * ny * nz;
  const size = bandCount * bandCount;
  const coefficients = new Float32Array(voxelCount * size);
  // Sample influence cutoff: one and a half voxels (covers diagonals).
  const cutoff = grid.voxelSizeMeters * 1.5;
  const epsilon = 1e-6;

  const voxelCenter = (index: number, axis: number): number => {
    const along = axis === 0 ? index % nx : axis === 1 ? Math.floor(index / nx) % ny : Math.floor(index / (nx * ny));
    return grid.origin[axis === 0 ? "x" : axis === 1 ? "y" : "z"] + (along + 0.5) * grid.voxelSizeMeters;
  };

  for (let v = 0; v < voxelCount; v++) {
    const center: Vec3 = { x: voxelCenter(v, 0), y: voxelCenter(v, 1), z: voxelCenter(v, 2) };
    // Gather weighted samples (scattered across all probes and paths).
    const weighted: { theta: number; phi: number; value: number; weight: number }[] = [];
    let totalWeight = 0;
    for (const sample of samples) {
      const dx = sample.position.x - center.x;
      const dy = sample.position.y - center.y;
      const dz = sample.position.z - center.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance > cutoff) continue;
      const weight = 1 / (distance * distance + epsilon);
      for (const direction of sample.directions) {
        const spherical = doaToSpherical(direction.azimuthRadians, direction.elevationRadians);
        // Fit the directional ENERGY distribution (gain²), not amplitude:
        // splat opacity then carries mean local energy, which is what the
        // splat-field solver's √energy amplitudes reproduce.
        weighted.push({ theta: spherical.theta, phi: spherical.phi, value: direction.gain * direction.gain, weight });
        totalWeight += weight;
      }
    }
    if (totalWeight === 0) continue;
    const fit = shWeightedLeastSquaresFit(
      weighted.map((s) => ({ theta: s.theta, phi: s.phi, value: s.value, weight: s.weight })),
      bandCount
    );
    for (let i = 0; i < size; i++) coefficients[v * size + i] = fit[i];
  }
  return { resolution: grid.resolution, voxelSizeMeters: grid.voxelSizeMeters, origin: grid.origin, bandCount, coefficients };
}

/** Convert a voxel SH field into AudioGS splats (one per non-empty voxel).
 * Opacity = isotropic energy (c0·√(4π)); coefficients are normalized to a
 * unit-integral directional pattern. Voxels below `energyFloor` × max are
 * pruned. */
export function projectFieldToSplats(field: VoxelField, energyFloor = 0.05): SplatField {
  const size = field.bandCount * field.bandCount;
  const y00 = 1 / Math.sqrt(4 * Math.PI);
  const [nx, ny, nz] = field.resolution;
  const voxelCount = nx * ny * nz;

  // First pass: energies for the pruning floor.
  const energies = new Float32Array(voxelCount);
  let maxEnergy = 0;
  for (let v = 0; v < voxelCount; v++) {
    const c0 = field.coefficients[v * size];
    const energy = Math.max(0, c0 * y00 * 4 * Math.PI); // c0·√(4π)... see below
    energies[v] = energy;
    maxEnergy = Math.max(maxEnergy, energy);
  }
  // NOTE: c0·Y00 = c0/√(4π) is the isotropic density; total energy proxy is
  // c0/√(4π)·4π = c0·√(4π). Kept explicit for readability.

  const primitives: SplatPrimitive[] = [];
  const sigma = field.voxelSizeMeters * 0.5;
  for (let v = 0; v < voxelCount; v++) {
    if (energies[v] < energyFloor * maxEnergy || energies[v] <= 0) continue;
    const c0 = field.coefficients[v * size];
    const energy = c0 * Math.sqrt(4 * Math.PI);
    const coefficients = new Float32Array(size);
    for (let i = 0; i < size; i++) coefficients[i] = field.coefficients[v * size + i] / energy;
    const x = v % nx;
    const y = Math.floor(v / nx) % ny;
    const z = Math.floor(v / (nx * ny));
    primitives.push({
      position: {
        x: field.origin.x + (x + 0.5) * field.voxelSizeMeters,
        y: field.origin.y + (y + 0.5) * field.voxelSizeMeters,
        z: field.origin.z + (z + 0.5) * field.voxelSizeMeters,
      },
      scale: { x: sigma, y: sigma, z: sigma },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      shCoefficients: coefficients,
      opacity: energy,
    });
  }
  return { primitives };
}

/** SH band-truncation LODs of a splat field. */
export function compressSplatField(field: SplatField, bandLevels: number[]): SplatLevel[] {
  const maxBands = Math.round(Math.sqrt(field.primitives[0]?.shCoefficients.length ?? 1));
  return bandLevels
    .filter((bands) => bands >= 1 && bands <= maxBands)
    .sort((a, b) => a - b)
    .map((shBands, level) => ({
      level,
      shBands,
      primitives: field.primitives.map((splat) => ({
        ...splat,
        shCoefficients: shTruncate(splat.shCoefficients, shBands),
      })),
    }));
}

/** Directional-energy reconstruction error of one splat's truncated pattern
 * relative to its full pattern (per-splat, band-limited). */
export function splatFieldErrorDb(full: SplatField, level: SplatLevel, probeCount = 512): number {
  const probes = fibonacciDirections(probeCount);
  let fullEnergy = 0;
  let diffEnergy = 0;
  const byPosition = new Map<string, SplatPrimitive>();
  for (const splat of level.primitives) byPosition.set(keyOf(splat), splat);
  for (const splat of full.primitives) {
    const truncated = byPosition.get(keyOf(splat));
    if (!truncated) continue; // pruned entirely: skip from the metric
    for (const probe of probes) {
      const f = splat.opacity * Math.max(0, shEvaluate(splat.shCoefficients, probe.theta, probe.phi));
      const t = truncated.opacity * Math.max(0, shEvaluate(truncated.shCoefficients, probe.theta, probe.phi));
      fullEnergy += f * f;
      diffEnergy += (f - t) * (f - t);
    }
  }
  if (fullEnergy === 0) return 0;
  if (diffEnergy === 0) return -120; // numerically perfect reconstruction (serializable)
  return 10 * Math.log10(diffEnergy / fullEnergy);
}

function keyOf(splat: SplatPrimitive): string {
  return `${splat.position.x.toFixed(4)},${splat.position.y.toFixed(4)},${splat.position.z.toFixed(4)}`;
}

export interface SplatManifestLevel {
  level: number;
  shBands: number;
  splatCount: number;
  /** Approximate serialized size of this level, bytes. */
  bytesApprox: number;
  /** Directional-energy reconstruction error vs. the full field, dB. */
  errorDb: number;
}

export interface SplatManifest {
  splatCount: number;
  fullBandCount: number;
  levels: SplatManifestLevel[];
}

/** Build a streaming manifest with measured per-level error (Phase 3 stream
 * selection consumes this). */
export function buildSplatManifest(field: SplatField, levels: SplatLevel[]): SplatManifest {
  const fullBands = Math.round(Math.sqrt(field.primitives[0]?.shCoefficients.length ?? 1));
  return {
    splatCount: field.primitives.length,
    fullBandCount: fullBands,
    levels: levels.map((level) => ({
      level: level.level,
      shBands: level.shBands,
      splatCount: level.primitives.length,
      bytesApprox: level.primitives.length * (16 + level.shBands * level.shBands * 4),
      errorDb: splatFieldErrorDb(field, level),
    })),
  };
}

// --- JSON serialization ------------------------------------------------------

export const SPLAT_FIELD_SCHEMA_VERSION = "0.1.0";

export interface SerializedSplatField {
  schemaVersion: string;
  bandCount: number;
  splats: {
    position: [number, number, number];
    scale: [number, number, number];
    rotation: [number, number, number, number];
    opacity: number;
    shCoefficients: number[];
  }[];
}

export function serializeSplatField(field: SplatField, bandCount: number): SerializedSplatField {
  return {
    schemaVersion: SPLAT_FIELD_SCHEMA_VERSION,
    bandCount,
    splats: field.primitives.map((splat) => ({
      position: [splat.position.x, splat.position.y, splat.position.z],
      scale: [splat.scale.x, splat.scale.y, splat.scale.z],
      rotation: [splat.rotation.x, splat.rotation.y, splat.rotation.z, splat.rotation.w],
      opacity: splat.opacity,
      shCoefficients: Array.from(splat.shCoefficients),
    })),
  };
}

export function parseSplatField(data: SerializedSplatField): SplatField {
  if (data.schemaVersion !== SPLAT_FIELD_SCHEMA_VERSION) {
    throw new Error(`unsupported splat-field schema '${data.schemaVersion}' (current: ${SPLAT_FIELD_SCHEMA_VERSION})`);
  }
  return {
    primitives: data.splats.map((splat) => ({
      position: { x: splat.position[0], y: splat.position[1], z: splat.position[2] },
      scale: { x: splat.scale[0], y: splat.scale[1], z: splat.scale[2] },
      rotation: { x: splat.rotation[0], y: splat.rotation[1], z: splat.rotation[2], w: splat.rotation[3] },
      opacity: splat.opacity,
      shCoefficients: Float32Array.from(splat.shCoefficients),
    })),
  };
}

/** The SH band count of a splat field (splats share one band count). */
export function splatFieldBandCount(field: SplatField): number {
  return Math.round(Math.sqrt(field.primitives[0]?.shCoefficients.length ?? 1));
}
