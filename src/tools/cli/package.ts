#!/usr/bin/env node
/** Content-pack packer (Phase 5): bundles Audio-USD scenes + manifest.
 *
 *   npm run pack -- --out examples/packs/entropia-starter \
 *     --scene examples/shoebox.audio_usd.json
 */
import { resolve } from "node:path";
import { createContentPack, validateContentPack } from "../../plugins/packaging";

interface Args {
  out: string;
  scenes: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: "pack", scenes: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--out") args.out = next() ?? args.out;
    else if (a === "--scene") args.scenes.push(next() ?? "");
    else {
      console.error(`error: unknown flag '${a}'`);
      process.exit(1);
    }
  }
  if (args.scenes.length === 0) {
    console.error("error: pass at least one --scene <file.audio_usd.json>");
    process.exit(1);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const manifest = createContentPack(
  resolve(args.out),
  {
    name: "entropia-starter",
    version: "0.1.0",
    description: "ENTRO ATMOS starter content pack",
    scenes: [],
    targets: ["standalone", "vst3", "au"],
  },
  args.scenes.map((sourcePath) => ({
    sourcePath,
    packName: sourcePath.split("/").pop() ?? "scene.audio_usd.json",
  }))
);
const issues = validateContentPack(resolve(args.out), manifest);
if (issues.length > 0) {
  for (const issue of issues) console.error(`pack issue: ${issue.path}: ${issue.message}`);
  process.exit(1);
}
console.log(`packed ${manifest.scenes.length} scene(s) → ${args.out}/manifest.json (${manifest.targets.join(", ")})`);
