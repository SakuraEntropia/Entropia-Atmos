#!/usr/bin/env node
/** ENTRO ATMOS AudioGS field builder (Phase 2).
 *
 * Builds a splat sound field from a scene by simulating a directional field
 * with the image-source solver on a voxel grid, fitting SH coefficients per
 * voxel, projecting to Gaussian splats, and compressing into LODs:
 *
 *   npm run audiogs -- examples/shoebox.audio_usd.json --grid 4 --bands 4 --out examples/shoebox.splats
 *
 * Writes <out>.field.json (full splat field), <out>.manifest.json (LOD
 * manifest with measured error), and <out>.audio_usd.json (Audio-USD
 * document with the splatField prim — render it with:
 * `npm run render -- <out>.audio_usd.json --solver splat-field --impulse`).
 *
 * Flags:
 *   --grid <n>       voxel grid resolution (default: 4)
 *   --bands <n>      SH band count (default: 4)
 *   --order <n>      image-source reflection order for sampling (default: 3)
 *   --out <prefix>   output file prefix (default: splat-field)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAudioUsd, toAudioScene } from "../../formats/audio_usd/index";
import { serializeAudioUsd } from "../../formats/audio_usd/index";
import { validateScene, type AudioScene } from "../../core/audio_scene/index";
import {
  buildSplatManifest,
  compressSplatField,
  projectFieldToSplats,
  sampleFieldWithImageSource,
  serializeSplatField,
  splatFieldBandCount,
  voxelizeDirectionalField,
} from "../dataset/index";
import { SplatFieldConverter } from "../converter/index";

interface AudiogsArgs {
  scene: string;
  out: string;
  grid: number;
  bands: number;
  order: number;
}

function fail(message: string): never {
  console.error("error:", message);
  process.exit(1);
}

function parseArgs(argv: string[]): AudiogsArgs {
  const args: AudiogsArgs = { scene: "", out: "splat-field", grid: 4, bands: 4, order: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--out") args.out = next() ?? fail("--out expects a path");
    else if (a === "--grid") args.grid = Number(next());
    else if (a === "--bands") args.bands = Number(next());
    else if (a === "--order") args.order = Number(next());
    else if (!a.startsWith("--")) args.scene = a;
    else fail(`unknown flag '${a}'`);
  }
  if (!args.scene) fail("missing scene file (usage: audiogs <scene.audio_usd.json> [flags])");
  if (!Number.isInteger(args.grid) || args.grid < 1) fail("--grid must be a positive integer");
  if (!Number.isInteger(args.bands) || args.bands < 1 || args.bands > 8) fail("--bands must be an integer in [1, 8]");
  if (!Number.isInteger(args.order) || args.order < 0) fail("--order must be a non-negative integer");
  return args;
}

function gridOverRoom(scene: AudioScene, grid: number) {
  if (!scene.room) fail("scene has no room descriptor — grid sampling needs scene.room");
  const size = {
    x: scene.room.max.x - scene.room.min.x,
    y: scene.room.max.y - scene.room.min.y,
    z: scene.room.max.z - scene.room.min.z,
  };
  const voxelSizeMeters = Math.max(size.x, size.y, size.z) / grid;
  const resolution: [number, number, number] = [
    Math.max(1, Math.ceil(size.x / voxelSizeMeters)),
    Math.max(1, Math.ceil(size.y / voxelSizeMeters)),
    Math.max(1, Math.ceil(size.z / voxelSizeMeters)),
  ];
  return { resolution, voxelSizeMeters, origin: { ...scene.room.min } };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const scene = toAudioScene(parseAudioUsd(readFileSync(resolve(args.scene), "utf8")));
  const issues = validateScene(scene);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`scene validation: ${issue.path}: ${issue.message}`);
    fail("scene failed validation");
  }
  const emitter = scene.emitters[0];
  if (!emitter) fail("scene has no emitters");

  const grid = gridOverRoom(scene, args.grid);
  const probePositions: { x: number; y: number; z: number }[] = [];
  for (let x = 0; x < grid.resolution[0]; x++) {
    for (let y = 0; y < grid.resolution[1]; y++) {
      for (let z = 0; z < grid.resolution[2]; z++) {
        probePositions.push({
          x: grid.origin.x + (x + 0.5) * grid.voxelSizeMeters,
          y: grid.origin.y + (y + 0.5) * grid.voxelSizeMeters,
          z: grid.origin.z + (z + 0.5) * grid.voxelSizeMeters,
        });
      }
    }
  }

  console.log(
    `sampling field: ${probePositions.length} probes (${grid.resolution.join("×")} grid, ` +
    `${grid.voxelSizeMeters.toFixed(2)} m voxels), image-source order ${args.order}…`
  );
  const samples = await sampleFieldWithImageSource(scene, emitter.id, probePositions, args.order);

  const field = voxelizeDirectionalField(samples, grid, args.bands);
  const splats = projectFieldToSplats(field);
  const levels = compressSplatField(splats, Array.from({ length: args.bands }, (_, i) => i + 1));
  const manifest = buildSplatManifest(splats, levels);

  const prefix = resolve(args.out);
  writeFileSync(`${prefix}.field.json`, JSON.stringify(serializeSplatField(splats, splatFieldBandCount(splats)), null, 2) + "\n");
  writeFileSync(`${prefix}.manifest.json`, JSON.stringify({ ...manifest, schemaVersion: "0.1.0" }, null, 2) + "\n");
  // Full renderable scene = original document + splat-field override layer.
  const sceneDocument = parseAudioUsd(readFileSync(resolve(args.scene), "utf8"));
  const fieldDocument = await new SplatFieldConverter().convert(splats);
  sceneDocument.layers.push({ name: "splat-field", prims: fieldDocument.layers[0].prims });
  writeFileSync(`${prefix}.audio_usd.json`, serializeAudioUsd(sceneDocument));

  console.log(`splats: ${splats.primitives.length} (SH band count ${splatFieldBandCount(splats)})`);
  console.log("LOD table (directional-energy error vs. full field):");
  for (const level of manifest.levels) {
    console.log(
      `  LOD ${level.level}: ${level.shBands} band(s), ${level.splatCount} splats, ` +
      `~${(level.bytesApprox / 1024).toFixed(1)} KiB, error ${level.errorDb.toFixed(2)} dB`
    );
  }
  console.log(`wrote ${prefix}.field.json / .manifest.json / .audio_usd.json`);
}

main().catch((error) => {
  console.error("audiogs failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
