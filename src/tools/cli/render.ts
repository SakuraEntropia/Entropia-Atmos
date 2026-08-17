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
 *   --impulse-length <s>      impulse source length (default: 1.0)
 *   --hrtf <json>             measured HRIR bank (JSON); default: spherical
 *                             head parametric model
 *   --sr <hz>                 render sample rate (default: 48000)
 *   --duration <s>            late-field length (default: 1.5; 0 for
 *                             splat-field scenes, whose field already
 *                             encodes propagation)
 *   --max-order <n>           image-source reflection order (default: 4)
 *   --solver <id>             "image-source" (default) | "splat-field"
 *   --splats <json>           load a splat field JSON into the scene
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAudioUsd, toAudioScene } from "../../formats/audio_usd/index";
import { decodeWav, encodeWav } from "../../formats/wav/index";
import { validateScene } from "../../core/audio_scene/index";
import { createAudioBlock, type AudioBlock } from "../../core/dsp/index";
import { DefaultAcousticEngine, FdnReverbSystem, ImageSourceSolver, SplatFieldSolver } from "../../core/acoustic_engine/index";
import {
  createJsonHrtf,
  OfflineAcousticRenderer,
  SimpleBinauralRenderer,
  SphericalHeadHrtf,
  type HrtfDataset,
} from "../../core/renderer/index";
import { parseSplatField } from "../dataset/index";

interface CliArgs {
  scene: string;
  out: string;
  listener?: string;
  sources: Map<string, string>;
  hrtfPath?: string;
  splatsPath?: string;
  sampleRate: number;
  duration: number;
  durationExplicit: boolean;
  maxOrder: number;
  impulse: boolean;
  impulseLength: number;
  solver: string;
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
    durationExplicit: false,
    maxOrder: 4,
    impulse: false,
    impulseLength: 1.0,
    solver: "image-source",
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
    else if (a === "--splats") args.splatsPath = next();
    else if (a === "--sr") args.sampleRate = Number(next());
    else if (a === "--duration") {
      args.duration = Number(next());
      args.durationExplicit = true;
    } else if (a === "--max-order") args.maxOrder = Number(next());
    else if (a === "--solver") args.solver = next() ?? "";
    else if (a === "--impulse") args.impulse = true;
    else if (a === "--impulse-length") args.impulseLength = Number(next());
    else if (!a.startsWith("--")) args.scene = a;
    else fail(`unknown flag '${a}'`);
  }
  if (!args.scene) fail("missing scene file (usage: render <scene.audio_usd.json> [flags])");
  if (!Number.isFinite(args.sampleRate) || args.sampleRate <= 0) fail("--sr must be a positive number");
  if (!Number.isFinite(args.duration) || args.duration < 0) fail("--duration must be a non-negative number");
  if (!Number.isInteger(args.maxOrder) || args.maxOrder < 0) fail("--max-order must be a non-negative integer");
  if (!Number.isFinite(args.impulseLength) || args.impulseLength < 0) fail("--impulse-length must be a non-negative number");
  if (args.solver !== "image-source" && args.solver !== "splat-field") {
    fail(`unknown solver '${args.solver}' (available: image-source, splat-field)`);
  }
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
  if (args.splatsPath) {
    const field = parseSplatField(JSON.parse(readFileSync(resolve(args.splatsPath), "utf8")));
    scene.splatFields = [...(scene.splatFields ?? []), field];
  }
  const issues = validateScene(scene);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`scene validation: ${issue.path}: ${issue.message}`);
    fail("scene failed validation");
  }
  if (args.solver === "splat-field" && (scene.splatFields?.length ?? 0) === 0) {
    fail("--solver splat-field needs splat fields: build one with `npm run audiogs` or pass --splats");
  }
  // The splat field already encodes propagation; default to no FDN on top.
  const lateDuration = args.solver === "splat-field" && !args.durationExplicit ? 0 : args.duration;

  const listener = args.listener
    ? scene.listeners.find((l) => l.id === args.listener)
    : scene.listeners[0];
  if (!listener) fail(`listener '${args.listener ?? "(first)"}' not found in scene`);

  const hrtf: HrtfDataset = args.hrtfPath
    ? createJsonHrtf("cli", JSON.parse(readFileSync(resolve(args.hrtfPath), "utf8")))
    : new SphericalHeadHrtf(args.sampleRate);

  const engine = new DefaultAcousticEngine({
    reverb: new FdnReverbSystem(),
    solvers: [new ImageSourceSolver(), new SplatFieldSolver()],
  });
  const renderer = new OfflineAcousticRenderer({
    engine,
    binaural: new SimpleBinauralRenderer(),
    simulation: {
      solver: args.solver,
      sampleRate: args.sampleRate,
      lateFieldDurationSeconds: lateDuration,
      maxReflectionOrder: args.maxOrder,
    },
  });

  console.log(`baking scene '${scene.name}' (${scene.emitters.length} emitter(s) × ${scene.listeners.length} listener(s), solver ${args.solver})…`);
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
      sources.set(emitter.id, impulseBlock(args.sampleRate, args.impulseLength));
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
