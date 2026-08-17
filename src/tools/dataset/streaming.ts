/** LOD selection and streaming for AudioGS fields (Phase 3).
 *
 * Selection is manifest-driven: pick the cheapest level whose measured
 * directional-energy error fits the budget. TODO(Phase 3): distance-based
 * selection and background prefetch.
 */
import type { Vec3 } from "../../core/audio_scene";
import type { SplatLevel } from "./pipeline";
import type { SplatManifest } from "./fieldSynthesis";

/** Pick the lowest-band level whose errorDb ≤ budget; fallback: best level. */
export function selectLod(manifest: SplatManifest, maxErrorDb: number): number {
  if (manifest.levels.length === 0) throw new Error("manifest has no levels");
  for (const level of manifest.levels) {
    if (level.errorDb <= maxErrorDb) return level.shBands;
  }
  return manifest.levels[manifest.levels.length - 1].shBands;
}

export interface LodStreamerOptions {
  /** Directional-energy error budget in dB. */
  errorBudgetDb: number;
  /** Optional per-listener-position budget scaling (distance-aware TODO). */
  budgetByDistance?: (distanceMeters: number) => number;
}

export class LodStreamer {
  constructor(
    private readonly manifest: SplatManifest,
    private readonly levels: SplatLevel[],
    private readonly options: LodStreamerOptions
  ) {
    if (levels.length === 0) throw new Error("LodStreamer needs at least one level");
  }

  /** Select the LOD for a listener position. */
  selectFor(listenerPosition: Vec3): SplatLevel {
    const budget = this.options.budgetByDistance?.(0) ?? this.options.errorBudgetDb;
    const shBands = selectLod(this.manifest, budget);
    return this.levels.find((level) => level.shBands === shBands) ?? this.levels[this.levels.length - 1];
  }
}

/** Async generator wrapper: yields the selected LOD for each request. */
export async function* streamLods(
  manifest: SplatManifest,
  levels: SplatLevel[],
  listenerPosition: Vec3,
  errorBudgetDb: number
): AsyncGenerator<SplatLevel> {
  const streamer = new LodStreamer(manifest, levels, { errorBudgetDb });
  while (true) {
    yield streamer.selectFor(listenerPosition);
  }
}
