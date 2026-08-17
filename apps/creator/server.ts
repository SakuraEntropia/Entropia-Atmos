/** ENTRO ATMOS creator backend (Phase 4).
 *
 * A dependency-free node:http service exposing the engine core to the
 * creator UI through /api/* (the template's proxy target). Run with
 * `npm run server` (port 8100).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseAudioUsd, toAudioScene } from "../../src/formats/audio_usd/index";
import { encodeWav } from "../../src/formats/wav/index";
import { validateScene } from "../../src/core/audio_scene/index";
import {
  DefaultAcousticEngine,
  FdnReverbSystem,
  ImageSourceSolver,
  RayTracingSolver,
  SplatFieldSolver,
} from "../../src/core/acoustic_engine/index";
import { OfflineAcousticRenderer, SimpleBinauralRenderer, SphericalHeadHrtf } from "../../src/core/renderer/index";
import { createAudioBlock } from "../../src/core/dsp/index";
import { parseObj } from "../../src/formats/obj/index";
import {
  buildSplatManifest,
  calibrateSplatOpacities,
  compressSplatField,
  parseSplatField,
  projectFieldToSplats,
  sampleFieldWithImageSource,
  splatFieldBandCount,
  voxelizeDirectionalField,
  type ProbeEnergy,
} from "../../src/tools/dataset/index";

const PORT = 8100;
const EXAMPLES = resolve(import.meta.dirname, "../../examples");
const SAMPLE_RATE = 48000;

function scenePath(name: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error(`invalid scene name '${name}'`);
  return join(EXAMPLES, `${name}.audio_usd.json`);
}

function loadScene(name: string) {
  const text = readFileSync(scenePath(name), "utf8");
  const scene = toAudioScene(parseAudioUsd(text));
  const issues = validateScene(scene);
  if (issues.length > 0) throw new Error(issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  return scene;
}

function engine() {
  return new DefaultAcousticEngine({
    reverb: new FdnReverbSystem(),
    solvers: [new ImageSourceSolver(), new RayTracingSolver(new Map()), new SplatFieldSolver()],
  });
}

interface RenderBody {
  scene: string;
  solver: string;
  order: number;
  impulse: boolean;
  duration: number;
}

async function handleRender(body: RenderBody): Promise<string> {
  const scene = loadScene(body.scene);
  const hrtf = new SphericalHeadHrtf(SAMPLE_RATE);
  const renderer = new OfflineAcousticRenderer({
    engine: engine(),
    binaural: new SimpleBinauralRenderer(),
    simulation: {
      solver: body.solver,
      maxReflectionOrder: body.order,
      sampleRate: SAMPLE_RATE,
      lateFieldDurationSeconds: body.duration,
    },
  });
  const baked = await renderer.bake(scene, hrtf);
  const source = createAudioBlock(1, Math.round(SAMPLE_RATE * 0.5), SAMPLE_RATE);
  source.channels[0][0] = 1;
  const out = await renderer.render(
    { baked, listenerId: scene.listeners[0].id, sources: new Map([[scene.emitters[0].id, source]]) },
    hrtf,
    SAMPLE_RATE
  );
  const wavPath = `/tmp/entro-${body.scene}-${body.solver}.wav`;
  writeFileSync(wavPath, new Uint8Array(encodeWav(out.channels, SAMPLE_RATE, "float32")));
  const dir = baked.dirs.get(`${scene.emitters[0].id}:${scene.listeners[0].id}`);
  return (
    `rendered ${out.length} samples @ ${SAMPLE_RATE} Hz → ${wavPath}\n` +
    `${dir?.early.length ?? 0} early paths, late T60 ≈ ${dir?.late.bands[0]?.t60Seconds.toFixed(2) ?? 0} s, solver ${body.solver}`
  );
}

async function handleAudiogs(body: { scene: string; grid: number; bands: number }): Promise<string> {
  const scene = loadScene(body.scene);
  if (!scene.room) throw new Error("audiogs needs scene.room");
  const size = {
    x: scene.room.max.x - scene.room.min.x,
    y: scene.room.max.y - scene.room.min.y,
    z: scene.room.max.z - scene.room.min.z,
  };
  const voxelSize = Math.max(size.x, size.y, size.z) / body.grid;
  const resolution: [number, number, number] = [
    Math.max(1, Math.ceil(size.x / voxelSize)),
    Math.max(1, Math.ceil(size.y / voxelSize)),
    Math.max(1, Math.ceil(size.z / voxelSize)),
  ];
  const probes: { x: number; y: number; z: number }[] = [];
  for (let x = 0; x < resolution[0]; x++) {
    for (let y = 0; y < resolution[1]; y++) {
      for (let z = 0; z < resolution[2]; z++) {
        probes.push({
          x: scene.room.min.x + (x + 0.5) * voxelSize,
          y: scene.room.min.y + (y + 0.5) * voxelSize,
          z: scene.room.min.z + (z + 0.5) * voxelSize,
        });
      }
    }
  }
  const samples = await sampleFieldWithImageSource(scene, scene.emitters[0].id, probes, 3);
  const energies: ProbeEnergy[] = samples.map((sample) => ({
    position: sample.position,
    energy: sample.directions.reduce((sum, d) => sum + d.gain * d.gain, 0),
    bandEnergies: Array.from({ length: 4 }, (_, b) =>
      sample.directions.reduce((sum, d) => sum + (d.bandGains?.[b] ?? 0) ** 2, 0)
    ),
  }));
  const field = voxelizeDirectionalField(samples, { resolution, voxelSizeMeters: voxelSize, origin: { ...scene.room.min } }, body.bands, 4);
  const splats = calibrateSplatOpacities(projectFieldToSplats(field), energies);
  const levels = compressSplatField(splats, Array.from({ length: body.bands }, (_, i) => i + 1));
  const manifest = buildSplatManifest(splats, levels);
  const lines = manifest.levels.map(
    (l) => `  LOD ${l.level}: ${l.shBands} band(s), ${l.splatCount} splats, error ${l.errorDb.toFixed(2)} dB`
  );
  return `splats: ${splats.primitives.length} (SH bands ${splatFieldBandCount(splats)})\n` + lines.join("\n");
}

function handleExport(body: { scene: string; solver: string }): Promise<string> {
  return handleRender({ ...body, order: 3, impulse: true, duration: 0.5 });
}

const NODES = [
  {
    type: "audio_source",
    label: "Audio Source",
    category: "Sources",
    inputs: [],
    outputs: [{ name: "signal", data_kind: "audio", required: true }],
    parameters: [{ name: "level_db", kind: "float", default: 0, required: false, dtype: "float" }],
  },
  {
    type: "convolver",
    label: "Convolver (DIR)",
    category: "Rendering",
    inputs: [
      { name: "signal", data_kind: "audio", required: true },
      { name: "impulse_response", data_kind: "dir", required: true },
    ],
    outputs: [{ name: "wet", data_kind: "audio", required: true }],
    parameters: [],
  },
  {
    type: "binaural_mix",
    label: "Binaural Mix",
    category: "Rendering",
    inputs: [{ name: "signal", data_kind: "audio", required: true }],
    outputs: [{ name: "left", data_kind: "audio", required: true }, { name: "right", data_kind: "audio", required: true }],
    parameters: [],
  },
  {
    type: "acoustic_material",
    label: "Acoustic Material",
    category: "Shading",
    inputs: [],
    outputs: [{ name: "material", data_kind: "material", required: true }],
    parameters: [
      { name: "absorption_500", kind: "float", default: 0.1, required: false, dtype: "float" },
      { name: "absorption_1000", kind: "float", default: 0.08, required: false, dtype: "float" },
    ],
  },
  {
    type: "fdn_reverb",
    label: "FDN Reverb",
    category: "Rendering",
    inputs: [{ name: "signal", data_kind: "audio", required: true }],
    outputs: [{ name: "wet", data_kind: "audio", required: true }],
    parameters: [{ name: "t60_seconds", kind: "float", default: 1.2, required: false, dtype: "float" }],
  },
];

function sendJson(res: ServerResponse, code: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      const scenes = readdirSync(EXAMPLES)
        .filter((f) => f.endsWith(".audio_usd.json"))
        .map((f) => f.replace(/\.audio_usd\.json$/, ""));
      sendJson(res, 200, { ok: true, version: "0.4.0", phase: "Phase 4 — creator application", scenes });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/nodes") {
      sendJson(res, 200, NODES);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/material/concrete") {
      sendJson(res, 200, {
        name: "Concrete",
        bands: [
          { centerHz: 500, absorption: 0.1 },
          { centerHz: 1000, absorption: 0.08 },
          { centerHz: 2000, absorption: 0.07 },
          { centerHz: 4000, absorption: 0.06 },
        ],
      });
      return;
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      let body: Record<string, unknown> = {};
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
      }
      if (url.pathname === "/api/scene/load") {
        const scene = loadScene(String(body.name));
        sendJson(res, 200, {
          name: scene.name,
          emitters: scene.emitters.length,
          listeners: scene.listeners.length,
          materials: scene.materials.length,
          environments: scene.environments.length,
          splatFields: scene.splatFields?.length ?? 0,
          room: scene.room
            ? `${(scene.room.max.x - scene.room.min.x).toFixed(1)}×${(scene.room.max.y - scene.room.min.y).toFixed(1)}×${(scene.room.max.z - scene.room.min.z).toFixed(1)} m`
            : undefined,
        });
        return;
      }
      if (url.pathname === "/api/render") {
        const message = await handleRender(body as unknown as RenderBody);
        sendJson(res, 200, { ok: true, message });
        return;
      }
      if (url.pathname === "/api/export") {
        const message = await handleExport(body as { scene: string; solver: string });
        sendJson(res, 200, { ok: true, message });
        return;
      }
      if (url.pathname === "/api/audiogs") {
        const message = await handleAudiogs(body as { scene: string; grid: number; bands: number });
        sendJson(res, 200, { ok: true, message });
        return;
      }
      if (url.pathname === "/api/bake") {
        const scene = loadScene(String(body.scene));
        const dir = await engine().simulate({
          scene,
          emitterId: scene.emitters[0].id,
          listenerId: scene.listeners[0].id,
          options: {
            solver: "image-source",
            maxReflectionOrder: Number(body.order ?? 3),
            sampleRate: SAMPLE_RATE,
            lateFieldDurationSeconds: Number(body.duration ?? 0.5),
          },
        });
        sendJson(res, 200, { ok: true, paths: dir.early.length, t60: dir.late.bands[0]?.t60Seconds ?? 0 });
        return;
      }
    }
    sendJson(res, 404, { ok: false, error: `no route: ${req.method} ${url.pathname}` });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => sendJson(res, 500, { ok: false, error: String(error) }));
});

server.listen(PORT, () => {
  console.log(`ENTRO ATMOS creator backend on http://localhost:${PORT} (examples: ${EXAMPLES})`);
  void parseSplatField; // keep the import honest for future use
});
