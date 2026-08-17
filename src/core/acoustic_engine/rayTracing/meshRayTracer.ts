/** Triangle-mesh ray tracing: Möller–Trumbore intersection plus
 * shooting-and-bouncing-rays (SBR) specular path tracing for general
 * geometry.
 *
 * MVP scope (documented): brute-force triangle traversal (BVH is a Phase 3
 * TODO), stochastic ray sampling with a listener capture sphere, and
 * per-path clustering by direction of arrival (one path per ~2° cell, the
 * shortest captured) to avoid multi-counting the same physical path. Edge
 * diffraction remains a TODO.
 */
import type { Vec3 } from "../../audio_scene";
import { ANALYSIS_BANDS, pathFirFromBandGains } from "../../dsp/bands";
import { airAbsorptionFactor } from "../airAbsorption";
import { absorptionAt, reflectionAmplitude } from "../materialUtil";
import type { AcousticMaterial } from "../../audio_scene";
import type { DirectionalPath } from "../impulseResponse";

export interface MeshInstance {
  mesh: { positions: Float32Array; triangles: Uint32Array };
  materialId?: string;
}

export interface RayHit {
  distance: number;
  triangleIndex: number;
  normal: Vec3;
  materialId?: string;
}

const EPSILON = 1e-6;

/** Nearest Möller–Trumbore intersection across all mesh instances. */
export function intersectMeshes(meshes: MeshInstance[], origin: Vec3, direction: Vec3): RayHit | null {
  let best: RayHit | null = null;
  for (const instance of meshes) {
    const { positions, triangles } = instance.mesh;
    for (let t = 0; t < triangles.length; t += 3) {
      const i0 = triangles[t] * 3;
      const i1 = triangles[t + 1] * 3;
      const i2 = triangles[t + 2] * 3;
      const v0: Vec3 = { x: positions[i0], y: positions[i0 + 1], z: positions[i0 + 2] };
      const v1: Vec3 = { x: positions[i1], y: positions[i1 + 1], z: positions[i1 + 2] };
      const v2: Vec3 = { x: positions[i2], y: positions[i2 + 1], z: positions[i2 + 2] };
      const e1 = sub(v1, v0);
      const e2 = sub(v2, v0);
      const p = cross(direction, e2);
      const det = dot(e1, p);
      if (Math.abs(det) < 1e-12) continue;
      const invDet = 1 / det;
      const tv = sub(origin, v0);
      const u = dot(tv, p) * invDet;
      if (u < 0 || u > 1) continue;
      const q = cross(tv, e1);
      const v = dot(direction, q) * invDet;
      if (v < 0 || u + v > 1) continue;
      const distance = dot(e2, q) * invDet;
      if (distance <= EPSILON) continue;
      // Geometric normal, flipped to face the incoming ray (robust to winding).
      let normal = normalize(cross(e1, e2));
      if (dot(normal, direction) > 0) {
        normal = { x: -normal.x, y: -normal.y, z: -normal.z };
      }
      if (best === null || distance < best.distance) {
        best = { distance, triangleIndex: t / 3, normal, materialId: instance.materialId };
      }
    }
  }
  return best;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(a: Vec3): Vec3 {
  const length = Math.sqrt(dot(a, a)) || 1;
  return { x: a.x / length, y: a.y / length, z: a.z / length };
}

function reflect(direction: Vec3, normal: Vec3): Vec3 {
  const d = 2 * dot(direction, normal);
  return { x: direction.x - d * normal.x, y: direction.y - d * normal.y, z: direction.z - d * normal.z };
}

/** Approximately uniform directions on the sphere (Fibonacci lattice). */
export function fibonacciRays(count: number): Vec3[] {
  const rays: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count > 1 ? 1 - (2 * i) / (count - 1) : 0;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    rays.push({ x: r * Math.cos(golden * i), y, z: r * Math.sin(golden * i) });
  }
  return rays;
}

export interface SbrOptions {
  maxReflectionOrder: number;
  rayCount: number;
  /** Listener capture sphere radius, meters. */
  listenerRadius: number;
  /** DOA clustering cell size, radians (≈2°). */
  doaCellRadians: number;
}

export interface SbrContext {
  sampleRate: number;
  speedOfSound: number;
  temperatureCelsius: number;
  humidityPercent: number;
  materials: (AcousticMaterial | undefined)[];
}

/** Shooting-and-bouncing rays from the emitter, with a dedicated direct ray. */
export function traceSpecularPaths(
  meshes: MeshInstance[],
  emitter: Vec3,
  listener: Vec3,
  options: SbrOptions,
  context: SbrContext
): DirectionalPath[] {
  const paths: DirectionalPath[] = [];
  const seenCells = new Set<string>();
  const doaCell = (azimuth: number, elevation: number): string =>
    `${Math.round(azimuth / options.doaCellRadians)},${Math.round(elevation / options.doaCellRadians)}`;

  const materialOf = (materialId?: string): AcousticMaterial | undefined =>
    context.materials.find((m) => m?.id === materialId) ?? undefined;

  const pushPath = (distance: number, hitMaterials: (string | undefined)[], travelDirection: Vec3): void => {
    // DOA uses the ray's TRAVEL direction (not the capture-point offset):
    // all near-miss rays of one physical path share (nearly) the same
    // direction, so DOA-cell clustering merges them instead of smearing
    // across the whole capture sphere.
    const azimuthRadians = Math.atan2(-travelDirection.x, -travelDirection.z);
    const elevationRadians = Math.asin(Math.max(-1, Math.min(1, -travelDirection.y)));
    const cell = doaCell(azimuthRadians, elevationRadians);
    if (seenCells.has(cell)) return; // one path per DOA cell (first capture wins)
    seenCells.add(cell);

    const bandGains = ANALYSIS_BANDS.map((band, b) => {
      let gain = 1 / distance;
      for (const materialId of hitMaterials) {
        const absorption = absorptionAt(materialOf(materialId), band.centerHz);
        gain *= reflectionAmplitude(absorption);
      }
      gain *= airAbsorptionFactor(distance, band.centerHz, context.temperatureCelsius, context.humidityPercent);
      return gain;
    });
    const delaySamples = Math.round((distance / context.speedOfSound) * context.sampleRate);
    paths.push({
      azimuthRadians,
      elevationRadians,
      distanceMeters: distance,
      materialHits: hitMaterials.filter((m): m is string => m !== undefined),
      samples: pathFirFromBandGains(bandGains, delaySamples, context.sampleRate),
      gain: bandGains[1],
      bandGains,
    });
  };

  // Direct path: emitter → listener with an occlusion test.
  const toListener = sub(listener, emitter);
  const directDistance = Math.sqrt(dot(toListener, toListener));
  const directDir = { x: toListener.x / directDistance, y: toListener.y / directDistance, z: toListener.z / directDistance };
  const occlusion = intersectMeshes(meshes, emitter, directDir);
  if (!occlusion || occlusion.distance > directDistance - EPSILON) {
    pushPath(directDistance, [], directDir);
  }

  // SBR: sample directions, bounce specularly, capture near the listener.
  for (const ray of fibonacciRays(options.rayCount)) {
    let origin = emitter;
    let direction = ray;
    let travelled = 0;
    const hits: (string | undefined)[] = [];
    for (let bounce = 0; bounce <= options.maxReflectionOrder; bounce++) {
      const hit = intersectMeshes(meshes, origin, direction);
      if (!hit) break; // escaped the scene
      const segmentEnd = hit.distance;
      // Capture near the listener only AFTER at least one bounce: the direct
      // path is traced exactly above, so 0-bounce captures are duplicates.
      if (bounce >= 1) {
        const seg = { x: direction.x * segmentEnd, y: direction.y * segmentEnd, z: direction.z * segmentEnd };
        const toListenerFromOrigin = sub(listener, origin);
        const tClosest = Math.max(0, Math.min(segmentEnd, dot(toListenerFromOrigin, direction)));
        const closestPoint = {
          x: origin.x + direction.x * tClosest,
          y: origin.y + direction.y * tClosest,
          z: origin.z + direction.z * tClosest,
        };
        const miss = Math.sqrt(dot(sub(closestPoint, listener), sub(closestPoint, listener)));
        if (miss <= options.listenerRadius) {
          pushPath(travelled + tClosest, hits, direction);
          break;
        }
      }
      // Advance and reflect.
      travelled += segmentEnd;
      origin = {
        x: origin.x + direction.x * segmentEnd + hit.normal.x * EPSILON,
        y: origin.y + direction.y * segmentEnd + hit.normal.y * EPSILON,
        z: origin.z + direction.z * segmentEnd + hit.normal.z * EPSILON,
      };
      direction = reflect(direction, hit.normal);
      hits.push(hit.materialId);
    }
  }

  paths.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return paths;
}
