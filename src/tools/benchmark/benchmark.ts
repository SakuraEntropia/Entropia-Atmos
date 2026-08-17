/** Benchmark harness: DIR/render metrics and pipeline comparisons.
 *
 * The quantitative backbone of the roadmap's exit criteria (SPEC M-05):
 * every solver pair can be compared headlessly and reproducibly.
 */
import type { DirectionalImpulseResponse } from "../../core/acoustic_engine";
import type { AudioBlock } from "../../core/dsp";

export interface DirMetrics {
  pathCount: number;
  /** Broadband gain (1 kHz band) of the direct (0-hit) path, 0 if absent. */
  directGain: number;
  earlyEnergy: number;
  lateEnergy: number;
  totalEnergy: number;
}

export function measureDir(dir: DirectionalImpulseResponse): DirMetrics {
  let earlyEnergy = 0;
  let lateEnergy = 0;
  let directGain = 0;
  for (const path of dir.early) {
    for (const v of path.samples) earlyEnergy += v * v;
    if (path.materialHits.length === 0) directGain = Math.max(directGain, path.gain ?? 0);
  }
  for (const v of dir.late.samples) lateEnergy += v * v;
  return {
    pathCount: dir.early.length,
    directGain,
    earlyEnergy,
    lateEnergy,
    totalEnergy: earlyEnergy + lateEnergy,
  };
}

export interface RenderMetrics {
  length: number;
  energy: number;
  peak: number;
}

export function measureRender(block: AudioBlock): RenderMetrics {
  let energy = 0;
  let peak = 0;
  for (const channel of block.channels) {
    for (const v of channel) {
      energy += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
  }
  return { length: block.length, energy, peak };
}

export interface BenchReport {
  name: string;
  dir: DirMetrics;
  render?: RenderMetrics;
  energyDb: number;
}

export function energyDb(energy: number): number {
  return energy > 0 ? 10 * Math.log10(energy) : Number.NEGATIVE_INFINITY;
}

export interface BenchComparison {
  a: BenchReport;
  b: BenchReport;
  dirEnergyDeltaDb: number;
  renderEnergyDeltaDb: number | null;
  directGainDeltaDb: number;
}

/** Compare pipeline B against reference A; positive delta = B louder. */
export function compareBenchmarks(a: BenchReport, b: BenchReport): BenchComparison {
  return {
    a,
    b,
    dirEnergyDeltaDb: energyDb(b.dir.totalEnergy) - energyDb(a.dir.totalEnergy),
    renderEnergyDeltaDb:
      a.render && b.render ? energyDb(b.render.energy) - energyDb(a.render.energy) : null,
    directGainDeltaDb: energyDb(b.dir.directGain * b.dir.directGain) - energyDb(a.dir.directGain * a.dir.directGain),
  };
}
