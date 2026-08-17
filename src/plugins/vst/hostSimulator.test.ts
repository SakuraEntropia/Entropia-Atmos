import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ScenePlugin } from "./scenePlugin";
import { runHostSession } from "./hostSimulator";
import { parseAudioUsd } from "../../formats/audio_usd";
import { createAudioBlock } from "../../core/dsp";

const SHOEBOX_DOC = () =>
  parseAudioUsd(readFileSync(resolve(__dirname, "../../../examples/shoebox.audio_usd.json"), "utf8"));

describe("ScenePlugin (VstBridge reference implementation)", () => {
  it("loads a scene and processes blocks like a DAW host would", async () => {
    const plugin = new ScenePlugin();
    await plugin.loadScene(SHOEBOX_DOC());
    const input = createAudioBlock(1, 512, 48000);
    input.channels[0][0] = 1; // impulse at block start

    // Warm up JIT before measuring the real-time contract.
    for (let i = 0; i < 5; i++) plugin.processBlock(input);

    const result = await runHostSession(plugin, input, {
      blocks: 64,
      automation: [
        { block: 16, parameterId: "master_gain", normalizedValue: 0.5 }, // linear gain 1.0
        { block: 32, parameterId: "master_gain", normalizedValue: 0.25 }, // linear gain 0.5
      ],
    });

    expect(result.output.channels).toHaveLength(2);
    expect(result.output.length).toBe(512 * 64);
    for (const channel of result.output.channels) {
      for (const v of channel) expect(Number.isFinite(v)).toBe(true);
    }
    // Real-time contract: average block time inside the budget; worst case
    // within 4× (test-suite worker contention can spike a single block).
    expect(result.avgBlockMs).toBeLessThan(result.budgetMs);
    expect(result.maxBlockMs).toBeLessThan(result.budgetMs * 4);
    expect(result.withinBudget).toBe(true);
  });

  it("applies parameter automation to the output", async () => {
    const plugin = new ScenePlugin();
    await plugin.loadScene(SHOEBOX_DOC());
    const input = createAudioBlock(1, 512, 48000);
    input.channels[0].fill(0.01); // steady signal

    const quiet = await runHostSession(plugin, input, {
      blocks: 8,
      automation: [{ block: 0, parameterId: "master_gain", normalizedValue: 0.1 }], // gain 0.2
    });
    const loud = await runHostSession(plugin, input, {
      blocks: 8,
      automation: [{ block: 0, parameterId: "master_gain", normalizedValue: 0.6 }], // gain 1.2
    });
    let quietEnergy = 0;
    let loudEnergy = 0;
    for (const channel of quiet.output.channels) for (const v of channel) quietEnergy += v * v;
    for (const channel of loud.output.channels) for (const v of channel) loudEnergy += v * v;
    expect(loudEnergy / quietEnergy).toBeGreaterThan(20); // (1.2/0.2)² = 36×
  });

  it("silences output while suspended", async () => {
    const plugin = new ScenePlugin();
    await plugin.loadScene(SHOEBOX_DOC());
    const input = createAudioBlock(1, 512, 48000);
    input.channels[0].fill(0.1);
    plugin.suspend();
    const out = plugin.processBlock(input);
    let energy = 0;
    for (const channel of out.channels) for (const v of channel) energy += v * v;
    expect(energy).toBe(0);
    plugin.resume();
    const resumed = plugin.processBlock(input);
    let resumedEnergy = 0;
    for (const channel of resumed.channels) for (const v of channel) resumedEnergy += v * v;
    expect(resumedEnergy).toBeGreaterThan(0);
  });
});
