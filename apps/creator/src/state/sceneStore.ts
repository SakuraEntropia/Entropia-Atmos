/** Creator state (zustand): the Audio-USD document under edit, selection,
 * workspace mode, and the render/transport session. */
import { create } from "zustand";
import { useGraphStore } from "entropia-template-ui";
import type { Node, Edge } from "@xyflow/react";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface TransformPayload {
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
}

export type PrimType = "emitter" | "listener" | "material" | "environment" | "geometry";

export type Selection = { type: PrimType; id: string } | null;

export type WorkspaceId = "layout" | "shading" | "simulation" | "bake" | "delivery";

export interface AudioUsdDocumentLike {
  schemaVersion: string;
  name?: string;
  upAxis: "y" | "z";
  unitsPerMeter: number;
  layers: { name: string; prims: { type: string; id: string; name: string; payload: Record<string, unknown> }[] }[];
  room?: { min: [number, number, number]; max: [number, number, number]; wallMaterialId?: string };
}

export interface LogEntry {
  time: string;
  text: string;
}

export interface AcousticNodeData extends Record<string, unknown> {
  id?: string;
  nodeType: string;
  label: string;
  params: Record<string, number>;
}

interface CreatorState {
  document: AudioUsdDocumentLike | null;
  selection: Selection;
  workspace: WorkspaceId;
  log: LogEntry[];
  renderStatus: "idle" | "rendering" | "ready" | "error";
  renderedWavPath: string | null;
  solver: string;
  maxOrder: number;
  rayBudget: number;
  lateDuration: number;
  loadDocument(document: AudioUsdDocumentLike): void;
  select(selection: Selection): void;
  setWorkspace(workspace: WorkspaceId): void;
  setSolver(solver: string): void;
  setMaxOrder(order: number): void;
  setRayBudget(budget: number): void;
  setLateDuration(seconds: number): void;
  logLine(text: string): void;
  setRenderStatus(status: CreatorState["renderStatus"], wavPath?: string): void;
  /** Immutably update one prim's payload. */
  updatePayload(type: PrimType, id: string, updater: (payload: Record<string, unknown>) => void): void;
  /** Remove the selected prim. */
  deleteSelection(): void;
  /** Ask the 3D viewport to reset its camera. */
  viewportReset: number;
  resetViewport(): void;
  /** Unsaved-changes flag (mirrored into the template titlebar). */
  dirty: boolean;
  markDirty(): void;
  markSaved(name: string): void;
  /** Per-material acoustic node graphs (Blender-style node editor). */
  graphs: Record<string, { nodes: Node<AcousticNodeData>[]; edges: Edge[] }>;
  setGraph(materialId: string, graph: { nodes: Node<AcousticNodeData>[]; edges: Edge[] }): void;
  /** Splash screen visibility. */
  splashOpen: boolean;
  closeSplash(): void;
  /** Outliner visibility toggles (prim ids hidden in the 3D view). */
  hiddenIds: string[];
  toggleHidden(id: string): void;
  /** Blender-style active tool (left toolbar). */
  tool: "select" | "move" | "rotate" | "scale";
  setTool(tool: "select" | "move" | "rotate" | "scale"): void;
  /** Frame the selected object in the 3D view. */
  frameSignal: number;
  frameViewport(): void;
  /** Blender top-bar options: snapping + coordinate system. */
  snapEnabled: boolean;
  setSnapEnabled(enabled: boolean): void;
  snapStep: number;
  setSnapStep(step: number): void;
  coordSpace: "global" | "local";
  setCoordSpace(space: "global" | "local"): void;
  openSplash(): void;
  /** About dialog visibility. */
  aboutOpen: boolean;
  openAbout(): void;
  closeAbout(): void;
  /** Timeline playhead position (seconds). */
  playheadSeconds: number;
  setPlayhead(seconds: number): void;
}

function stamp(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

/** Immutable payload edit on the first layer (the working layer). */
function editDocument(
  document: AudioUsdDocumentLike | null,
  type: PrimType,
  id: string,
  updater: (payload: Record<string, unknown>) => void
): AudioUsdDocumentLike | null {
  if (!document) return document;
  const layers = document.layers.map((layer) => {
    let touched = false;
    const prims = layer.prims.map((prim) => {
      if (prim.type !== type || prim.id !== id) return prim;
      touched = true;
      const payload = JSON.parse(JSON.stringify(prim.payload)) as Record<string, unknown>;
      updater(payload);
      return { ...prim, payload };
    });
    return touched ? { ...layer, prims } : layer;
  });
  return { ...document, layers };
}

export const useCreatorStore = create<CreatorState>((set, get) => ({
  document: null,
  selection: null,
  workspace: "layout",
  log: [],
  renderStatus: "idle",
  renderedWavPath: null,
  solver: "image-source",
  maxOrder: 3,
  rayBudget: 6000,
  lateDuration: 0.5,
  loadDocument: (document) => set({ document, selection: null }),
  select: (selection) => set({ selection }),
  setWorkspace: (workspace) => set({ workspace }),
  setSolver: (solver) => set({ solver }),
  setMaxOrder: (maxOrder) => set({ maxOrder }),
  setRayBudget: (rayBudget) => set({ rayBudget }),
  setLateDuration: (lateDuration) => set({ lateDuration }),
  logLine: (text) => {
    useGraphStore.setState({ logs: [...useGraphStore.getState().logs.slice(-199), text] });
    set((s) => ({ log: [...s.log.slice(-199), { time: stamp(), text }] }));
  },
  setRenderStatus: (renderStatus, renderedWavPath) => {
    const templateStatus = renderStatus === "rendering" ? "running" : renderStatus === "ready" ? "success" : renderStatus;
    useGraphStore.setState({ status: templateStatus });
    set((s) => ({ renderStatus, renderedWavPath: renderedWavPath ?? s.renderedWavPath }));
  },
  updatePayload: (type, id, updater) => {
    useGraphStore.setState({ dirty: true });
    set((s) => ({ document: editDocument(s.document, type, id, updater), dirty: true }));
  },
  deleteSelection: () =>
    set((s) => {
      if (!s.document || !s.selection) return {};
      const layers = s.document.layers.map((layer) => ({
        ...layer,
        prims: layer.prims.filter(
          (prim) => !(prim.type === s.selection!.type && prim.id === s.selection!.id)
        ),
      }));
      useGraphStore.setState({ dirty: true });
      return { document: { ...s.document, layers }, selection: null, dirty: true };
    }),
  viewportReset: 0,
  resetViewport: () => set((s) => ({ viewportReset: s.viewportReset + 1 })),
  dirty: false,
  markDirty: () => {
    useGraphStore.setState({ dirty: true });
    set({ dirty: true });
  },
  markSaved: (name) => {
    useGraphStore.setState({ dirty: false, activeFileName: `${name}.audio_usd` });
    set({ dirty: false });
  },
  graphs: {},
  setGraph: (materialId, graph) => set((s) => ({ graphs: { ...s.graphs, [materialId]: graph } })),
  splashOpen: true,
  closeSplash: () => set({ splashOpen: false }),
  hiddenIds: [],
  tool: "move",
  setTool: (tool) => set({ tool }),
  frameSignal: 0,
  frameViewport: () => set((s) => ({ frameSignal: s.frameSignal + 1 })),
  snapEnabled: false,
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  snapStep: 0.25,
  setSnapStep: (snapStep) => set({ snapStep }),
  coordSpace: "global",
  setCoordSpace: (coordSpace) => set({ coordSpace }),
  openSplash: () => set({ splashOpen: true }),
  aboutOpen: false,
  openAbout: () => set({ aboutOpen: true }),
  closeAbout: () => set({ aboutOpen: false }),
  playheadSeconds: 0,
  setPlayhead: (playheadSeconds) => set({ playheadSeconds }),
  toggleHidden: (id) =>
    set((s) => ({
      hiddenIds: s.hiddenIds.includes(id) ? s.hiddenIds.filter((h) => h !== id) : [...s.hiddenIds, id],
    })),
}));

/** Selection helpers for components. */
export function selectedPrim(document: AudioUsdDocumentLike | null, selection: Selection) {
  if (!document || !selection) return null;
  for (const layer of document.layers) {
    const prim = layer.prims.find((p) => p.type === selection.type && p.id === selection.id);
    if (prim) return prim;
  }
  return null;
}

export function transformOf(payload: Record<string, unknown>): TransformPayload {
  const t = (payload.transform ?? {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  }) as Record<string, unknown>;
  return {
    position: (t.position as [number, number, number]) ?? [0, 0, 0],
    rotation: (t.rotation as [number, number, number, number]) ?? [0, 0, 0, 1],
    scale: (t.scale as [number, number, number]) ?? [1, 1, 1],
  };
}

export function setTransformPosition(payload: Record<string, unknown>, position: [number, number, number]): void {
  const t = transformOf(payload);
  payload.transform = { ...t, position };
}

export function setTransformRotation(payload: Record<string, unknown>, rotation: [number, number, number, number]): void {
  const t = transformOf(payload);
  payload.transform = { ...t, rotation };
}
