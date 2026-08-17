/** ENTRO ATMOS creator backend (Phase 4) — dependency-free node:http.
 *
 * Serves the engine core to the creator UI:
 *   GET  /api/status               → version + available scene names
 *   GET  /api/document?name=…      → raw Audio-USD scene JSON
 *   POST /api/render               → {document, solver, order, rays, lateDuration} → binaural WAV path + metrics
 *   POST /api/audiogs              → {document, grid, bands} → splat field + LOD table
 *   POST /api/export               → {document} → WAV export summary
 *   GET  /api/file?path=…          → serve rendered WAVs (restricted to /tmp/entro-*)
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { parseAudioUsd, toAudioScene } from "../../src/formats/audio_usd/index";
import { decodeWav, encodeWav } from "../../src/formats/wav/index";
import { validateScene, type AudioScene } from "../../src/core/audio_scene/index";
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

/** Parse a scene from either an inline document or a named example file. */
function sceneFromBody(body: Record<string, unknown>): AudioScene {
  let text: string;
  if (body.document !== undefined) {
    text = typeof body.document === "string" ? body.document : JSON.stringify(body.document);
  } else if (typeof body.scene === "string") {
    text = readFileSync(scenePath(body.scene), "utf8");
  } else {
    throw new Error("request needs 'document' or 'scene'");
  }
  const scene = toAudioScene(parseAudioUsd(text));
  const issues = validateScene(scene);
  if (issues.length > 0) throw new Error(issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  return scene;
}

/** Meshes for the ray-tracing solver: examples/shoebox.obj as assetId "box". */
function meshes(): Map<string, { positions: Float32Array; triangles: Uint32Array }> {
  const map = new Map<string, { positions: Float32Array; triangles: Uint32Array }>();
  const objPath = join(EXAMPLES, "shoebox.obj");
  if (existsSync(objPath)) map.set("box", parseObj(readFileSync(objPath, "utf8")));
  return map;
}

function engine() {
  return new DefaultAcousticEngine({
    reverb: new FdnReverbSystem(),
    solvers: [new ImageSourceSolver(), new RayTracingSolver(meshes()), new SplatFieldSolver()],
  });
}

interface RenderBody {
  document?: unknown;
  scene?: string;
  solver: string;
  order: number;
  rays?: number;
  lateDuration: number;
  impulse?: boolean;
}

async function handleRender(body: RenderBody): Promise<{ message: string; wavPath: string }> {
  const scene = sceneFromBody(body as unknown as Record<string, unknown>);
  const hrtf = new SphericalHeadHrtf(SAMPLE_RATE);
  const renderer = new OfflineAcousticRenderer({
    engine: engine(),
    binaural: new SimpleBinauralRenderer(),
    simulation: {
      solver: body.solver,
      maxReflectionOrder: body.order,
      rayBudget: body.rays,
      sampleRate: SAMPLE_RATE,
      lateFieldDurationSeconds: body.solver === "splat-field" ? 0 : body.lateDuration,
    },
  });
  const baked = await renderer.bake(scene, hrtf);
  // Per-emitter source: imported audio when the signal references an asset,
  // otherwise the impulse demo.
  const sources = new Map<string, { channels: Float32Array[]; sampleRate: number; length: number }>();
  for (const emitter of scene.emitters) {
    const ref = emitter.signal?.ref;
    if (typeof ref === "string" && ref.startsWith("assets/") && !ref.includes("..")) {
      const assetPath = join(EXAMPLES, ref);
      if (existsSync(assetPath)) {
        const buf = readFileSync(assetPath);
        const wav = decodeWav(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
        if (wav.sampleRate !== SAMPLE_RATE) throw new Error(`asset '${ref}' is ${wav.sampleRate} Hz; re-import at 48 kHz`);
        sources.set(emitter.id, { channels: wav.channels, sampleRate: wav.sampleRate, length: wav.channels[0].length });
        continue;
      }
    }
    const source = createAudioBlock(1, Math.round(SAMPLE_RATE * 0.5), SAMPLE_RATE);
    source.channels[0][0] = 1;
    sources.set(emitter.id, source);
  }
  const out = await renderer.render(
    { baked, listenerId: scene.listeners[0].id, sources },
    hrtf,
    SAMPLE_RATE
  );
  const wavPath = `/tmp/entro-${Date.now()}.wav`;
  writeFileSync(wavPath, new Uint8Array(encodeWav(out.channels, SAMPLE_RATE, "float32")));
  const dir = baked.dirs.get(`${scene.emitters[0].id}:${scene.listeners[0].id}`);
  return {
    wavPath,
    message:
      `rendered ${out.length} samples @ ${SAMPLE_RATE} Hz\n` +
      `${dir?.early.length ?? 0} early paths, late T60 ≈ ${(dir?.late.bands[0]?.t60Seconds ?? 0).toFixed(2)} s, solver ${body.solver}`,
  };
}

async function handleAudiogs(body: { document?: unknown; scene?: string; grid: number; bands: number }): Promise<string> {
  const scene = sceneFromBody(body as unknown as Record<string, unknown>);
  if (!scene.room) throw new Error("audiogs needs scene.room (rectangular room)");
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

function sendJson(res: ServerResponse, code: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length > 0 ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>) : {};
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      const scenes = readdirSync(EXAMPLES)
        .filter((f) => f.endsWith(".audio_usd.json"))
        .map((f) => f.replace(/\.audio_usd\.json$/, ""));
      sendJson(res, 200, { ok: true, version: "0.5.0", phase: "Phase 4 — spatial audio workstation", scenes });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/document") {
      const name = url.searchParams.get("name") ?? "shoebox";
      const text = readFileSync(scenePath(name), "utf8");
      sendJson(res, 200, JSON.parse(text));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/file") {
      const path = url.searchParams.get("path") ?? "";
      if (!path.startsWith("/tmp/entro-") || path.includes("..")) {
        sendJson(res, 403, { ok: false, error: "path not allowed" });
        return;
      }
      if (!existsSync(path)) {
        sendJson(res, 404, { ok: false, error: "file not found" });
        return;
      }
      const data = readFileSync(path);
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": data.length });
      res.end(data);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/files") {
      // riko-compatible asset listing over the examples directory.
      const files = readdirSync(EXAMPLES)
        .filter((f) => f.endsWith(".audio_usd.json"))
        .map((f) => ({ name: f.replace(/\.audio_usd\.json$/, ""), path: `examples/${f}`, imports: [], format: "ascii" }));
      sendJson(res, 200, { files });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/files/content") {
      const path = url.searchParams.get("path") ?? "";
      if (!path.startsWith("examples/") || path.includes("..")) throw new Error("path not allowed");
      const text = readFileSync(resolve(import.meta.dirname, "../../", path), "utf8");
      sendJson(res, 200, { status: "success", doc: JSON.parse(text) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/audio/upload") {
      const body = await readBody(req);
      const rawName = String(body.name ?? "audio").replace(/\.(wav|mp3|aac|ogg|flac|m4a)$/i, "");
      if (!/^[a-zA-Z0-9._-]+$/.test(rawName)) throw new Error(`invalid audio name '${rawName}'`);
      const samples = body.samples as number[] | undefined;
      if (!Array.isArray(samples) || samples.length === 0) throw new Error("missing 'samples' array");
      const assetsDir = join(EXAMPLES, "assets");
      mkdirSync(assetsDir, { recursive: true });
      const path = join(assetsDir, `${rawName}.wav`);
      const channel = Float32Array.from(samples);
      writeFileSync(path, new Uint8Array(encodeWav([channel], SAMPLE_RATE, "float32")));
      sendJson(res, 200, { ok: true, ref: `assets/${rawName}.wav`, path, samples: channel.length });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/files/save") {
      const body = await readBody(req);
      const name = String(body.name ?? "scene");
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error(`invalid scene name '${name}'`);
      const doc = (body.doc ?? {}) as Record<string, unknown>;
      toAudioScene(parseAudioUsd(JSON.stringify(doc)));
      const path = join(EXAMPLES, `${name}.audio_usd.json`);
      writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
      sendJson(res, 200, { status: "success", path, format: "ascii" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/files/delete") {
      const body = await readBody(req);
      const name = String(body.name ?? "");
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error(`invalid scene name '${name}'`);
      const path = join(EXAMPLES, `${name}.audio_usd.json`);
      if (existsSync(path)) {
        const { rmSync } = await import("node:fs");
        rmSync(path);
      }
      sendJson(res, 200, { status: "success" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/save") {
      const body = await readBody(req);
      const name = String(body.name ?? "scene");
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error(`invalid scene name '${name}'`);
      const document = body.document ?? {};
      // Validate by round-tripping through the format module.
      toAudioScene(parseAudioUsd(typeof document === "string" ? document : JSON.stringify(document)));
      const path = join(EXAMPLES, `${name}.audio_usd.json`);
      writeFileSync(path, JSON.stringify(document, null, 2) + "\n");
      sendJson(res, 200, { ok: true, path, message: `saved ${name}.audio_usd.json` });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/render") {
      const body = (await readBody(req)) as unknown as RenderBody;
      const result = await handleRender(body);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/audiogs") {
      const body = (await readBody(req)) as { document?: unknown; scene?: string; grid: number; bands: number };
      const message = await handleAudiogs(body);
      sendJson(res, 200, { ok: true, message });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/export") {
      const body = (await readBody(req)) as unknown as RenderBody;
      const result = await handleRender({ ...body, solver: body.solver ?? "image-source", order: 3, lateDuration: 0.5 });
      sendJson(res, 200, { ok: true, message: `exported ${result.wavPath}\n${result.message}` });
      return;
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
  void basename;
});
