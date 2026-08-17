#!/usr/bin/env node
/** ENTRO ATMOS benchmark CLI (Phase 1 exit criteria, SPEC M-05).
 *
 * Compares two solvers on one scene, DIR-level and full-render level:
 *
 *   npm run bench -- examples/shoebox.audio_usd.json \
 *     --a image-source --b ray-tracing --mesh box=examples/shoebox.obj \
 *     --order 3 --rays 6000 --out bench.json
 *
 * Flags:
 *   --a <solver>          reference solver (image-source | ray-tracing | splat-field)
 *   --b <solver>          candidate solver
 *   --mesh <id>=<obj>     mesh per assetId (repeatable, ray-tracing)
 *   --order <n>           reflection order / image order (default: 3)
 *   --rays <n>            ray budget for ray-tracing (default: 6000)
 *   --splats <json>       splat field JSON (splat-field)
 *   --impulse             also render both pipelines to WAVs and compare energy
 *   --out <json>          write the comparison report (default: bench.json)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAudioUsd, toAudioScene } from "../../formats/audio_usd/index";
import { validateScene, type AudioScene } from "../../core/audio_scene/index";
import {
  DefaultAcousticEngine,
  FdnReverbSystem,
  ImageSourceSolver,
  RayTracingSolver,
  SplatFieldSolver,
  type Solver,
} from "../../core/acoustic_engine/index";
import { parseObj } from "../../formats/obj/index";
import { parseSplatField } from "../dataset/index";
import { measureDir, compareBenchmarks, type BenchReport } from "../benchmark/index";

interface BenchArgs {
  scene: string;
  a: string;
  b: string;
  meshes: Map<string, string>;
  order: number;
  rays: number;
  splats?: string;
  impulse: boolean;
  out: string;
}

function fail(message: string): never {
  console.error("error:", message);
  process.exit(1);
}

function parseArgs(argv: string[]): BenchArgs {
  const args: BenchArgs = { scene: "", a: "image-source", b: "ray-tracing", meshes: new Map(), order: 3, rays: 6000, impulse: false, out: "bench.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--a") args.a = next() ?? "";
    else if (a === "--b") args.b = next() ?? "";
    else if (a === "--mesh") {
      const pair = (next() ?? "").split("=");
      if (pair.length !== 2) fail("--mesh expects <assetId>=<file.obj>");
      args.meshes.set(pair[0], pair[1]);
    } else if (a === "--order") args.order = Number(next());
    else if (a === "--rays") args.rays = Number(next());
    else if (a === "--splats") args.splats = next();
    else if (a === "--impulse") args.impulse = true;
    else if (a === "--out") args.out = next() ?? args.out;
    else if (!a.startsWith("--")) args.scene = a;
    else fail(`unknown flag '${a}'`);
  }
  if (!args.scene) fail("missing scene file");
  for (const id of [args.a, args.b]) {
    if (!["image-source", "ray-tracing", "splat-field"].includes(id)) fail(`unknown solver '${id}'`);
  }
  return args;
}

async function simulate(solver: Solver, scene: AudioScene, args: BenchArgs, sampleRate: number) {
  const engine = new DefaultAcousticEngine({ reverb: new FdnReverbSystem(), solvers: [solver] });
  return engine.simulate({
    scene,
    emitterId: scene.emitters[0].id,
    listenerId: scene.listeners[0].id,
    options: {
      solver: solver.id,
      maxReflectionOrder: args.order,
      sampleRate,
      lateFieldDurationSeconds: 0,
      rayBudget: args.rays,
    },
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const scene = toAudioScene(parseAudioUsd(readFileSync(resolve(args.scene), "utf8")));
  if (args.splats) {
    scene.splatFields = [...(scene.splatFields ?? []), parseSplatField(JSON.parse(readFileSync(resolve(args.splats), "utf8")))];
  }
  const issues = validateScene(scene);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`scene validation: ${issue.path}: ${issue.message}`);
    fail("scene failed validation");
  }
  if (scene.emitters.length === 0 || scene.listeners.length === 0) fail("scene needs an emitter and a listener");

  const meshes = new Map<string, { positions: Float32Array; triangles: Uint32Array }>();
  for (const [assetId, path] of args.meshes) meshes.set(assetId, parseObj(readFileSync(resolve(path), "utf8")));
  if (meshes.size > 0 && scene.geometry.length === 0) {
    // Wire the meshes into the scene (room wall material when present).
    scene.geometry = [...meshes.keys()].map((assetId) => ({
      assetId,
      materialId: scene.room?.wallMaterialId,
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
    }));
  }

  const solverFor = (id: string): Solver => {
    if (id === "image-source") return new ImageSourceSolver();
    if (id === "ray-tracing") return new RayTracingSolver(meshes);
    return new SplatFieldSolver();
  };

  const SAMPLE_RATE = 48000;
  const dirA = await simulate(solverFor(args.a), scene, args, SAMPLE_RATE);
  const dirB = await simulate(solverFor(args.b), scene, args, SAMPLE_RATE);

  const reportA: BenchReport = { name: args.a, dir: measureDir(dirA), energyDb: 0 };
  reportA.energyDb = 10 * Math.log10(reportA.dir.totalEnergy);
  const reportB: BenchReport = { name: args.b, dir: measureDir(dirB), energyDb: 0 };
  reportB.energyDb = 10 * Math.log10(reportB.dir.totalEnergy);

  const comparison = compareBenchmarks(reportA, reportB);
  console.log(`scene '${scene.name}', ${args.a} vs ${args.b} (order ${args.order}${args.b === "ray-tracing" ? `, ${args.rays} rays` : ""})`);
  console.log(`  ${args.a}: ${reportA.dir.pathCount} paths, DIR energy ${reportA.energyDb.toFixed(2)} dB, direct gain ${reportA.dir.directGain.toFixed(4)}`);
  console.log(`  ${args.b}: ${reportB.dir.pathCount} paths, DIR energy ${reportB.energyDb.toFixed(2)} dB, direct gain ${reportB.dir.directGain.toFixed(4)}`);
  console.log(`  DIR energy Δ: ${comparison.dirEnergyDeltaDb.toFixed(2)} dB | direct gain Δ: ${comparison.directGainDeltaDb.toFixed(2)} dB`);

  writeFileSync(resolve(args.out), JSON.stringify(comparison, null, 2) + "\n");
  console.log(`wrote ${args.out}`);
}

main().catch((error) => {
  console.error("bench failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
