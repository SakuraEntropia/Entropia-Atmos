#!/usr/bin/env node
/** ENTRO ATMOS headless renderer (Phase 1 MVP).
 *
 * Renders an Audio-USD scene to a binaural WAV file:
 *
 *   npm run render -- examples/shoebox.audio_usd.json --impulse --out out.wav
 *   npm run render -- scene.audio_usd.json --sources e1=voice.wav --hrtf hrtf.json --out out.wav
 *
 * Flags:
 *   --out <path>              output WAV (default: out.wav)
 *   --listener <id>           listener prim id (default: first listener)
 *   --sources <id>=<wav>      source audio per emitter (repeatable)
 *   --impulse                 synthesize an impulse source for emitters
 *                             without a --sources entry (demo mode)
 *   --hrtf <json>             measured HRIR bank (JSON); default: spherical
 *                             head parametric model
 *   --sr <hz>                 render sample rate (default: 48000)
 *   --duration <s>            late-field length (default: 1.5)
 *   --max-order <n>           image-source reflection order (default: 4)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAudioUsd, toAudioScene } from "../../formats/audio_usd/index";
import { decodeWav, encodeWav } from "../../formats/wav/index";
import { validateScene } from "../../core/audio_scene/index";
import { createAudioBlock, type AudioBlock } from "../../core/dsp/index";
import { DefaultAcousticEngine, FdnReverbSystem, ImageSourceSolver } from "../../core/acoustic_engine/index";
import {
  createJsonHrtf,
  OfflineAcousticRenderer,
  SimpleBinauralRenderer,
  SphericalHeadHrtf,
  type HrtfDataset,
} from "../../core/renderer/index";

interface CliArgs {
  scene: string;
  out: string;
  listener?: string;
  sources: Map<string, string>;
  hrtfPath?: string;
  sampleRate: number;
  duration: number;
  maxOrder: number;
  impulse: boolean;
}

function fail(message: string): never {
  console.error("error:", message);
  process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    scene: "",
    out: "out.wav",
    sources: new Map(),
    sampleRate: 48000,
    duration: 1.5,
    maxOrder: 4,
    impulse: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--out") args.out = next();
    else if (a === "--listener") args.listener = next();
    else if (a === "--sources") {
      const pairValue = next();
      if (pairValue === undefined) fail("--sources expects <emitterId>=<file.wav>");
      const pair = pairValue.split("=");
      if (pair.length !== 2 || !pair[0] || !pair[1]) fail(`--sources expects <emitterId>=<file.wav>, got '${pairValue}'`);
      args.sources.set(pair[0], pair[1]);
    } else if (a === "--hrtf") args.hrtfPath = next();
    else if (a === "--sr") args.sampleRate = Number(next());
    else if (a === "--duration") args.duration = Number(next());
    else if (a === "--max-order") args.maxOrder = Number(next());
    else if (a === "--impulse") args.impulse = true;
    else if (!a.startsWith("--")) args.scene = a;
    else fail(`unknown flag '${a}'`);
  }
  if (!args.scene) fail("missing scene file (usage: render <scene.audio_usd.json> [flags])");
  if (!Number.isFinite(args.sampleRate) || args.sampleRate <= 0) fail("--sr must be a positive number");
  if (!Number.isFinite(args.duration) || args.duration <= 0) fail("--duration must be a positive number");
  if (!Number.isInteger(args.maxOrder) || args.maxOrder < 0) fail("--max-order must be a non-negative integer");
  return args;
}

function readArrayBuffer(path: string): ArrayBuffer {
  const buffer = readFileSync(resolve(path));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function impulseBlock(sampleRate: number, durationSeconds: number): AudioBlock {
  const length = Math.max(1, Math.round(sampleRate * durationSeconds));
  const block = createAudioBlock(1, length, sampleRate);
  block.channels[0][0] = 1;
  return block;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const scene = toAudioScene(parseAudioUsd(readFileSync(resolve(args.scene), "utf8")));
  const issues = validateScene(scene);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`scene validation: ${issue.path}: ${issue.message}`);
    fail("scene failed validation");
  }

  const listener = args.listener
    ? scene.listeners.find((l) => l.id === args.listener)
    : scene.listeners[0];
  if (!listener) fail(`listener '${args.listener ?? "(first)"}' not found in scene`);

  const hrtf: HrtfDataset = args.hrtfPath
    ? createJsonHrtf("cli", JSON.parse(readFileSync(resolve(args.hrtfPath), "utf8")))
    : new SphericalHeadHrtf(args.sampleRate);

  const engine = new DefaultAcousticEngine({
    reverb: new FdnReverbSystem(),
    solvers: [new ImageSourceSolver()],
  });
  const renderer = new OfflineAcousticRenderer({
    engine,
    binaural: new SimpleBinauralRenderer(),
    simulation: {
      sampleRate: args.sampleRate,
      lateFieldDurationSeconds: args.duration,
      maxReflectionOrder: args.maxOrder,
    },
  });

  console.log(`baking scene '${scene.name}' (${scene.emitters.length} emitter(s) × ${scene.listeners.length} listener(s), order ${args.maxOrder})…`);
  const baked = await renderer.bake(scene, hrtf);

  const sources = new Map<string, AudioBlock>();
  for (const emitter of scene.emitters) {
    const wavPath = args.sources.get(emitter.id);
    if (wavPath) {
      const wav = decodeWav(readArrayBuffer(wavPath));
      if (wav.sampleRate !== args.sampleRate) {
        fail(`source '${emitter.id}' sample rate ${wav.sampleRate} != render rate ${args.sampleRate} (resampling TODO)`);
      }
      sources.set(emitter.id, { channels: wav.channels, sampleRate: wav.sampleRate, length: wav.channels[0].length });
    } else if (args.impulse) {
      sources.set(emitter.id, impulseBlock(args.sampleRate, args.duration));
    }
  }
  if (sources.size === 0) fail("no sources: pass --sources <emitter>=<file.wav> or --impulse");

  const output = await renderer.render({ baked, listenerId: listener.id, sources }, hrtf, args.sampleRate);
  writeFileSync(resolve(args.out), new Uint8Array(encodeWav(output.channels, output.sampleRate, "float32")));

  const firstDir = baked.dirs.get(`${scene.emitters[0].id}:${listener.id}`);
  const earlyCount = firstDir?.early.length ?? 0;
  const t60 = firstDir?.late.bands[0]?.t60Seconds ?? 0;
  console.log(
    `rendered ${output.length} samples @ ${output.sampleRate} Hz ` +
    `(${(output.length / output.sampleRate).toFixed(2)} s) → ${args.out}`
  );
  console.log(
    `first emitter: ${earlyCount} early paths, ` +
    `late field T60 ≈ ${t60.toFixed(2)} s, HRTF '${hrtf.id}'`
  );
}

main().catch((error) => {
  console.error("render failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
