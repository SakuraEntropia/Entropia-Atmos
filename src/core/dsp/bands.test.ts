import { describe, expect, it } from "vitest";
import { ANALYSIS_BAND_COUNT, pathFirFromBandGains, splitIntoBands } from "./bands";

function energy(signal: Float32Array): number {
  let sum = 0;
  for (const v of signal) sum += v * v;
  return sum;
}

describe("analysis band filter bank", () => {
  const SAMPLE_RATE = 48000;

  it("synthesizes path FIRs of delay + filter-tail length", () => {
    const fir = pathFirFromBandGains([1, 0.5, 0.25, 0.125], 100, SAMPLE_RATE);
    expect(fir.length).toBe(100 + 512);
    expect(energy(fir)).toBeGreaterThan(0);
  });

  it("band gains shape band energies proportionally", () => {
    // Gains per band: 1, 0.5, 0.25, 0.125 → energy ratios 1, 1/4, 1/16, 1/64.
    const fir = pathFirFromBandGains([1, 0.5, 0.25, 0.125], 0, SAMPLE_RATE);
    const bands = splitIntoBands(fir, SAMPLE_RATE);
    expect(bands).toHaveLength(ANALYSIS_BAND_COUNT);
    const energies = bands.map(energy);
    // Skirt leakage + cross-band analysis tolerances (monotonicity is the
    // hard guarantee; ratios are loose ranges around the applied gains).
    expect(energies[1] / energies[0]).toBeGreaterThan(0.1);
    expect(energies[1] / energies[0]).toBeLessThan(0.8);
    expect(energies[2] / energies[0]).toBeGreaterThan(0.05);
    expect(energies[2] / energies[0]).toBeLessThan(0.4);
    expect(energies[3] / energies[0]).toBeGreaterThan(0.005);
    expect(energies[3] / energies[0]).toBeLessThan(0.2);
    // Monotonic decrease with gain.
    expect(energies[0]).toBeGreaterThan(energies[1]);
    expect(energies[1]).toBeGreaterThan(energies[2]);
    expect(energies[2]).toBeGreaterThan(energies[3]);
  });

  it("splits white noise into comparable per-band energies", () => {
    const noise = new Float32Array(48000);
    let seed = 7;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      noise[i] = (seed / 2147483648) * 2 - 1;
    }
    const bands = splitIntoBands(noise, SAMPLE_RATE);
    const energies = bands.map(energy);
    const max = Math.max(...energies);
    const min = Math.min(...energies);
    expect(max / min).toBeLessThan(12); // equal octave bands: same order of magnitude
  });
});
