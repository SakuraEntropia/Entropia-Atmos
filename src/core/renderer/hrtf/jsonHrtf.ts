/** JSON HRTF dataset: nearest-neighbor lookup over a measured HRIR bank.
 *
 * Direction conventions match the engine's DIR output: azimuth 0 = front
 * (+z), +90° = right (+x); elevation 0 = horizon, +90° = up (+y).
 */
import type { Hertz } from "../../audio_scene";
import type { HrirPair, HrtfDataset } from "../hrtf";

export interface JsonHrirEntry {
  azimuthDegrees: number;
  elevationDegrees: number;
  left: number[];
  right: number[];
}

export interface JsonHrtfData {
  sampleRate: Hertz;
  entries: JsonHrirEntry[];
}

interface UnitVector {
  x: number;
  y: number;
  z: number;
}

function directionVector(azimuthDegrees: number, elevationDegrees: number): UnitVector {
  const az = (azimuthDegrees * Math.PI) / 180;
  const el = (elevationDegrees * Math.PI) / 180;
  return {
    x: Math.sin(az) * Math.cos(el),
    y: Math.sin(el),
    z: Math.cos(az) * Math.cos(el),
  };
}

/** Build an HrtfDataset from JSON data. Lookup picks the entry whose
 * direction has the smallest angle to the query (nearest neighbor). */
export function createJsonHrtf(id: string, data: JsonHrtfData): HrtfDataset {
  const vectors = data.entries.map((entry) => directionVector(entry.azimuthDegrees, entry.elevationDegrees));

  function query(azimuthRadians: number, elevationRadians: number): HrirPair | undefined {
    if (data.entries.length === 0) return undefined;
    const target = directionVector(
      (azimuthRadians * 180) / Math.PI,
      (elevationRadians * 180) / Math.PI
    );
    let best = 0;
    let bestDot = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < vectors.length; i++) {
      const dot = vectors[i].x * target.x + vectors[i].y * target.y + vectors[i].z * target.z;
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    }
    const entry = data.entries[best];
    return { left: Float32Array.from(entry.left), right: Float32Array.from(entry.right) };
  }

  return { id, sampleRate: data.sampleRate, query };
}
