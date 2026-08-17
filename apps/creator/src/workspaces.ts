/** ENTRO workspace presets — each workspace gets its own panel layout,
 * like the original template's per-preset area trees. */
import { leaf, split, type AreaNode, type WorkspaceInstance, type WorkspacePreset } from "entropia-template-ui";

const status = (): AreaNode => leaf("status");

export const ENTRO_PRESETS: WorkspacePreset[] = [
  {
    id: "layout",
    label: "Layout",
    category: "ENTRO",
    description: "Scene construction: scene graph + 3D panner + inspector.",
    build: () => {
      const sceneCol = split("column", leaf("nodes"), leaf("files"), 0.62);
      const left = split("column", sceneCol, leaf("inspector"), 0.62);
      const main = split("row", left, leaf("canvas"), 0.28);
      return split("column", main, status(), 0.82);
    },
  },
  {
    id: "shading",
    label: "Shading",
    category: "ENTRO",
    description: "Acoustic materials: scene graph + node editor + canvas.",
    build: () => {
      const left = split("column", leaf("nodes"), leaf("shader"), 0.55);
      const main = split("row", left, leaf("canvas"), 0.28);
      return split("column", main, status(), 0.82);
    },
  },
  {
    id: "simulation",
    label: "Simulation",
    category: "ENTRO",
    description: "Solver runs: inspector up top, taller log below.",
    build: () => {
      const left = split("column", leaf("inspector"), leaf("nodes"), 0.45);
      const main = split("row", left, leaf("canvas"), 0.24);
      return split("column", main, status(), 0.7);
    },
  },
  {
    id: "bake",
    label: "Bake",
    category: "ENTRO",
    description: "AudioGS: bake panel + node editor + big log for LOD tables.",
    build: () => {
      const left = split("column", leaf("nodes"), leaf("shader"), 0.6);
      const main = split("row", left, leaf("canvas"), 0.26);
      return split("column", main, status(), 0.68);
    },
  },
  {
    id: "delivery",
    label: "Delivery",
    category: "ENTRO",
    description: "Export: scene + canvas + transport-heavy bottom bar.",
    build: () => {
      const left = split("column", leaf("nodes"), leaf("inspector"), 0.7);
      const main = split("row", left, leaf("canvas"), 0.24);
      return split("column", main, status(), 0.66);
    },
  },
];

// --- pure workspace management (unit-tested) ---------------------------------

export interface WorkspaceState {
  list: WorkspaceInstance[];
  activeId: string;
}

export function addWorkspace(state: WorkspaceState, presetId: string): WorkspaceState {
  const preset = ENTRO_PRESETS.find((p) => p.id === presetId);
  if (!preset) return state;
  const ws: WorkspaceInstance = { id: `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: preset.label, root: preset.build() };
  return { list: [...state.list, ws], activeId: ws.id };
}

export function removeWorkspace(state: WorkspaceState, id: string): WorkspaceState {
  if (state.list.length <= 1) return state;
  const list = state.list.filter((w) => w.id !== id);
  return { list, activeId: state.activeId === id ? list[0].id : state.activeId };
}

export function renameWorkspace(state: WorkspaceState, id: string, name: string): WorkspaceState {
  return { ...state, list: state.list.map((w) => (w.id === id ? { ...w, name } : w)) };
}

export function duplicateWorkspace(state: WorkspaceState, id: string): WorkspaceState {
  const index = state.list.findIndex((w) => w.id === id);
  if (index < 0) return state;
  const source = state.list[index];
  const copy: WorkspaceInstance = { id: `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: `${source.name} copy`, root: JSON.parse(JSON.stringify(source.root)) };
  const list = [...state.list];
  list.splice(index + 1, 0, copy);
  return { list, activeId: copy.id };
}

export function moveWorkspace(state: WorkspaceState, id: string, delta: number): WorkspaceState {
  const index = state.list.findIndex((w) => w.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= state.list.length) return state;
  const list = [...state.list];
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  return { list, activeId: state.activeId };
}

export function reorderWorkspace(state: WorkspaceState, id: string, targetId: string): WorkspaceState {
  const from = state.list.findIndex((w) => w.id === id);
  const to = state.list.findIndex((w) => w.id === targetId);
  if (from < 0 || to < 0 || from === to) return state;
  const list = [...state.list];
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return { list, activeId: state.activeId };
}
