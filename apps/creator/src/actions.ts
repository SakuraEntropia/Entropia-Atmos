/** Shared creator actions — used by the menu bar, the scene panel, and the
 * transport so every entry point drives the same logic. */
import { parseObj } from "../../../src/formats/obj/index";
import { useCreatorStore, type PrimType } from "./state/sceneStore";

function doc() {
  return useCreatorStore.getState().document;
}

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Blender-style model import: parse an OBJ in-browser and add it as a
 * geometry prim with an inline mesh. */
export async function importModelFile(file: File): Promise<void> {
  const state = useCreatorStore.getState();
  const document = doc();
  if (!document) return;
  try {
    const mesh = parseObj(await file.text());
    const id = `g${Date.now().toString(36)}`;
    const name = file.name.replace(/\.obj$/i, "");
    const materials = document.layers.flatMap((l) => l.prims).filter((p) => p.type === "material");
    document.layers[0].prims.push({
      type: "geometry",
      id,
      name,
      payload: {
        transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        materialId: (document.room?.wallMaterialId as string | undefined) ?? materials[0]?.id,
        mesh: { positions: Array.from(mesh.positions), triangles: Array.from(mesh.triangles) },
      },
    });
    useCreatorStore.setState({ document: { ...document } });
    state.select({ type: "geometry", id });
    state.logLine(`imported model '${file.name}' (${mesh.triangles.length / 3} triangles)`);
  } catch (error) {
    state.logLine(`import failed: ${error instanceof Error ? error.message : error}`);
  }
}

/** Import an Audio-USD scene document (.json). */
export async function importSceneFile(file: File): Promise<void> {
  const state = useCreatorStore.getState();
  try {
    const document = JSON.parse(await file.text());
    state.loadDocument(document);
    state.logLine(`imported scene '${document.name ?? file.name}'`);
  } catch (error) {
    state.logLine(`scene import failed: ${error instanceof Error ? error.message : error}`);
  }
}

function addEmitterPayload(): Record<string, unknown> {
  return {
    transform: { position: [2, 1.5, 1.5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    kind: "point",
    signal: { ref: "source:auto", level: 0 },
  };
}

function addListenerPayload(): Record<string, unknown> {
  return { transform: { position: [3, 1.5, 1.5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } };
}

function addMaterialPayload(): Record<string, unknown> {
  return {
    bands: [
      { centerHz: 500, lowHz: 354, highHz: 707, absorption: 0.1, scattering: 0.1, transmission: 0 },
      { centerHz: 1000, lowHz: 707, highHz: 1414, absorption: 0.08, scattering: 0.1, transmission: 0 },
      { centerHz: 2000, lowHz: 1414, highHz: 2828, absorption: 0.07, scattering: 0.1, transmission: 0 },
      { centerHz: 4000, lowHz: 2828, highHz: 5657, absorption: 0.06, scattering: 0.1, transmission: 0 },
    ],
  };
}

function addEnvironmentPayload(): Record<string, unknown> {
  return { temperatureCelsius: 20, humidityPercent: 50, airAbsorptionModel: "iso-9613-1" };
}

export function addPrim(type: PrimType): void {
  const state = useCreatorStore.getState();
  const document = doc();
  if (!document) return;
  if (type === "geometry") {
    state.logLine("geometry comes from File → Import Model (.obj)");
    return;
  }
  const payload =
    type === "emitter" ? addEmitterPayload()
    : type === "listener" ? addListenerPayload()
    : type === "material" ? addMaterialPayload()
    : addEnvironmentPayload();
  const id = `${type.slice(0, 1)}${Date.now().toString(36)}`;
  document.layers[0].prims.push({ type, id, name: `${type}-${id}`, payload });
  useCreatorStore.setState({ document: { ...document } });
  state.select({ type, id });
  state.logLine(`added ${type} '${id}'`);
}

export function deleteSelected(): void {
  useCreatorStore.getState().deleteSelection();
}

/** Save the current document as an Audio-USD JSON file. */
export function saveScene(): void {
  const state = useCreatorStore.getState();
  const document = doc();
  if (!document) return;
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
  download(`${document.name ?? "scene"}.audio_usd.json`, blob);
  state.logLine(`saved '${document.name ?? "scene"}.audio_usd.json'`);
}

/** Render the current document to a binaural WAV; returns the server path. */
export async function renderScene(): Promise<string | null> {
  const state = useCreatorStore.getState();
  const document = doc();
  if (!document) return null;
  state.setRenderStatus("rendering");
  state.logLine(`rendering (${state.solver}, order ${state.maxOrder})…`);
  try {
    const resp = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document,
        solver: state.solver,
        order: state.maxOrder,
        rays: state.rayBudget,
        lateDuration: state.lateDuration,
        impulse: true,
      }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = (await resp.json()) as { message: string; wavPath: string };
    state.setRenderStatus("ready", data.wavPath);
    state.logLine(data.message);
    return data.wavPath;
  } catch (error) {
    state.setRenderStatus("error");
    state.logLine(`render failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/** Render (if needed) and download the binaural WAV. */
export async function exportWav(): Promise<void> {
  const state = useCreatorStore.getState();
  let wavPath = state.renderedWavPath;
  if (!wavPath || state.renderStatus !== "ready") wavPath = await renderScene();
  if (!wavPath) return;
  try {
    const resp = await fetch(`/api/file?path=${encodeURIComponent(wavPath)}`);
    if (!resp.ok) throw new Error(await resp.text());
    const blob = await resp.blob();
    download(`entro-${doc()?.name ?? "scene"}-binaural.wav`, blob);
    state.logLine("exported binaural WAV");
  } catch (error) {
    state.logLine(`export failed: ${error instanceof Error ? error.message : error}`);
  }
}

/** Build an AudioGS splat field for the current document. */
export async function bakeField(): Promise<void> {
  const state = useCreatorStore.getState();
  const document = doc();
  if (!document) return;
  state.logLine("baking AudioGS field…");
  try {
    const resp = await fetch("/api/audiogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document, grid: 4, bands: 4 }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = (await resp.json()) as { message: string };
    state.logLine(data.message);
  } catch (error) {
    state.logLine(`bake failed: ${error instanceof Error ? error.message : error}`);
  }
}
