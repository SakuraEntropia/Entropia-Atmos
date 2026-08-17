#!/usr/bin/env node
/** Phase 3 latency benchmark: real-time block processing vs. its budget.
 *
 *   npm run bench-rt -- examples/shoebox.audio_usd.json --blocks 2000 --block-size 512 --out bench-rt.json
 *
 * Builds the shoebox scene IR (image-source order 3 + spherical-head HRTF),
 * then drives the RealtimeBinauralRenderer block by block (with a
 * crossfade every 200 blocks) and measures per-block CPU time against the
 * block duration budget.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAudioUsd, toAudioScene } from "../../formats/audio_usd/index";
import { DefaultAcousticEngine, FdnReverbSystem, ImageSourceSolver } from "../../core/acoustic_engine/index";
import { SphericalHeadHrtf } from "../../core/renderer/index";
import { buildSceneIr, RealtimeBinauralRenderer } from "../../core/dsp/realtime/index";

interface Args {
  scene: string;
  blocks: number;
  blockSize: number;
  out: string;
}

function fail(message: string): never {
  console.error("error:", message);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { scene: "", blocks: 2000, blockSize: 512, out: "bench-rt.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--blocks") args.blocks = Number(next());
    else if (a === "--block-size") args.blockSize = Number(next());
    else if (a === "--out") args.out = next() ?? args.out;
    else if (!a.startsWith("--")) args.scene = a;
    else fail(`unknown flag '${a}'`);
  }
  if (!args.scene) fail("missing scene file");
  if (!Number.isInteger(args.blocks) || args.blocks < 1) fail("--blocks must be a positive integer");
  if (!Number.isInteger(args.blockSize) || args.blockSize < 1 || (args.blockSize & (args.blockSize - 1)) !== 0) {
    fail("--block-size must be a power of two");
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const SAMPLE_RATE = 48000;
  const scene = toAudioScene(parseAudioUsd(readFileSync(resolve(args.scene), "utf8")));
  const engine = new DefaultAcousticEngine({ reverb: new FdnReverbSystem(), solvers: [new ImageSourceSolver()] });
  const hrtf = new SphericalHeadHrtf(SAMPLE_RATE);

  const dir = await engine.simulate({
    scene,
    emitterId: scene.emitters[0].id,
    listenerId: scene.listeners[0].id,
    options: { solver: "image-source", maxReflectionOrder: 3, sampleRate: SAMPLE_RATE, lateFieldDurationSeconds: 0.5 },
  });
  const { left, right } = buildSceneIr(dir, hrtf);
  const renderer = new RealtimeBinauralRenderer(args.blockSize, left, right);

  const input = new Float32Array(args.blockSize);
  input[0] = 0.5;
  const timesMs: number[] = [];
  const budgetMs = (args.blockSize / SAMPLE_RATE) * 1000;

  for (let block = 0; block < args.blocks; block++) {
    if (block === 200) renderer.transitionTo(left, right, 16); // listener-move crossfade
    const start = process.hrtime.bigint();
    renderer.processBlock(input);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    timesMs.push(elapsedMs);
  }
  timesMs.sort((a, b) => a - b);
  const sum = timesMs.reduce((acc, t) => acc + t, 0);
  const report = {
    scene: scene.name,
    blockSize: args.blockSize,
    sampleRate: SAMPLE_RATE,
    blocks: args.blocks,
    budgetMs: Number(budgetMs.toFixed(3)),
    avgMs: Number((sum / timesMs.length).toFixed(3)),
    maxMs: Number(timesMs[timesMs.length - 1].toFixed(3)),
    p99Ms: Number(timesMs[Math.floor(timesMs.length * 0.99)].toFixed(3)),
    headroomX: Number((budgetMs / (sum / timesMs.length)).toFixed(1)),
  };

  console.log(`realtime benchmark: ${args.blockSize} samples @ ${SAMPLE_RATE} Hz (budget ${report.budgetMs} ms/block)`);
  console.log(
    `  avg ${report.avgMs} ms | max ${report.maxMs} ms | p99 ${report.p99Ms} ms | headroom ${report.headroomX}×`
  );
  console.log(`  ${report.headroomX >= 1 ? "PASS" : "FAIL"}: real-time budget ${report.headroomX >= 1 ? "met" : "exceeded"}`);
  writeFileSync(resolve(args.out), JSON.stringify(report, null, 2) + "\n");
  console.log(`wrote ${args.out}`);
}

main().catch((error) => {
  console.error("bench-rt failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
