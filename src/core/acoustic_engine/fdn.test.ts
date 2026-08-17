import { describe, expect, it } from "vitest";
import { buildShoeboxScene } from "../../testing/shoeboxFixture";
import { FdnReverbSystem, estimateT60 } from "./reverb/fdn";

const SAMPLE_RATE = 16000; // keep the test fast

function measureT60(ir: Float32Array, sampleRate: number): number {
  let energy = 0;
  for (let i = 0; i < ir.length; i++) energy += ir[i] * ir[i];
  if (energy === 0) return 0;
  let tail = energy;
  for (let t = 0; t < ir.length; t++) {
    tail -= ir[t] * ir[t];
    if (tail <= energy * 1e-6) return t / sampleRate; // −60 dB
  }
  return ir.length / sampleRate; // did not reach −60 dB within the buffer
}

function chunkEnergy(ir: Float32Array, from: number, to: number): number {
  let energy = 0;
  for (let i = from; i < to; i++) energy += ir[i] * ir[i];
  return energy;
}

describe("FdnReverbSystem", () => {
  it("estimates the Sabine T60 of the shoebox scene", () => {
    const scene = buildShoeboxScene();
    // V = 60 m³, S = 94 m², α = 0.08 → T60 = 0.161·60 / (94·0.08) ≈ 1.285 s
    expect(estimateT60(scene)).toBeCloseTo(1.2846, 3);
  });

  it("synthesizes decorrelated stereo tails with the target decay", async () => {
    const scene = buildShoeboxScene();
    const reverb = new FdnReverbSystem();
    const request = { scene, emitterId: "e1", listenerId: "l1", durationSeconds: 1.5, sampleRate: SAMPLE_RATE };
    const estimate = await reverb.estimateLateField(request);
    const { left, right } = await reverb.synthesize(request, estimate);

    expect(left.length).toBe(Math.round(1.5 * SAMPLE_RATE));
    expect(right.length).toBe(left.length);
    for (let i = 0; i < left.length; i++) {
      expect(Number.isFinite(left[i])).toBe(true);
      expect(Number.isFinite(right[i])).toBe(true);
    }

    // Ears decorrelated (independent FDN instances).
    let correlation = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let i = 0; i < left.length; i++) {
      correlation += left[i] * right[i];
      leftEnergy += left[i] * left[i];
      rightEnergy += right[i] * right[i];
    }
    const normalized = correlation / Math.sqrt(leftEnergy * rightEnergy);
    expect(Math.abs(normalized)).toBeLessThan(0.9);

    // Broadband decay matches the target T60 within loose bounds.
    const measured = measureT60(left, SAMPLE_RATE);
    expect(measured).toBeGreaterThan(0.4);
    expect(measured).toBeLessThan(2.5);

    // Energy concentrates in the early part, not the tail.
    const head = chunkEnergy(left, 0, Math.floor(left.length * 0.1));
    const tail = chunkEnergy(left, Math.floor(left.length * 0.9), left.length);
    expect(tail).toBeLessThan(head);
  });
});
