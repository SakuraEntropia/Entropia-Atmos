/** ENTRO ATMOS creator — the audio workstation, built INSIDE the Entropia
 * template shell.
 *
 * The template is the UI foundation and is not modified: we keep its
 * Titlebar, WorkspaceTabs, PanelSlot area tree, and splitters, and swap the
 * FUNCTIONALITY of four panel types through the template's own
 * `registerPanelContent` hook:
 *
 *   "nodes"     → audio scene graph (emitters/listeners/materials/envs)
 *   "canvas"    → the 3D Blender-style panner viewport
 *   "inspector" → contextual audio editors (transforms, materials, env)
 *   "status"    → transport (render + Web Audio playback) + log
 *
 * The five ENTRO workspaces (Bake/Layout/Shading/Simulation/Delivery)
 * re-focus the scene-graph panel on workspace-specific tools.
 */
import { useEffect, useState } from "react";
import {
  Titlebar,
  PanelSlot,
  VSplitter,
  HSplitter,
  ToastStack,
  leaf,
  split,
  registerPanelContent,
  setPanelTypeVisibility,
  StatusPanel,
  type AreaNode,
  type WorkspaceInstance,
} from "entropia-template-ui";
import { useCreatorStore } from "./state/sceneStore";
import { Viewport3D } from "./components/Viewport3D";
import { Inspector } from "./components/Inspector";
import { ScenePanel } from "./components/ScenePanel";
import { BakePanel, DeliveryPanel } from "./components/StatusPanel";
import { Transport } from "./components/Transport";
import { MenuBar } from "./components/MenuBar";
import { NodeEditor } from "./components/NodeEditor";
import { Splash } from "./components/Splash";
import { ENTRO_PRESETS } from "./workspaces";

/** Register the audio functionality into the template's panel registry.
 * (This is the supported extension point — the template shell is untouched.) */
registerPanelContent("canvas", () => <Viewport3D />);
registerPanelContent("inspector", () => <Inspector />);
registerPanelContent("nodes", () => <LeftWorkspacePanel />);
registerPanelContent("status", () => <StatusBar />);
registerPanelContent("shader", () => <NodeEditor />);
// Delete every legacy template panel from the UI: only the audio panels
// remain in the panel-type dropdown.
setPanelTypeVisibility(["nodes", "canvas", "inspector", "status", "shader"]);

function LeftWorkspacePanel() {
  const workspace = useCreatorStore((s) => s.workspace);
  if (workspace === "bake") return <BakePanel />;
  if (workspace === "delivery") return <DeliveryPanel />;
  return <ScenePanel />;
}

function StatusBar() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ borderBottom: "1px solid #262c34", padding: "6px 10px" }}>
        <Transport />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <StatusPanel />
      </div>
    </div>
  );
}

export function EntroApp() {
  const document = useCreatorStore((s) => s.document);
  const splashOpen = useCreatorStore((s) => s.splashOpen);
  const logLine = useCreatorStore((s) => s.logLine);
  const loadDocument = useCreatorStore((s) => s.loadDocument);
  const [workspaces, setWorkspaces] = useState<WorkspaceInstance[]>(() =>
    ENTRO_PRESETS.map((preset) => ({ id: newWsId(), name: preset.label, root: preset.build() }))
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const effectiveId = activeId ?? workspaces[0]?.id ?? "";
  const active = workspaces.find((w) => w.id === effectiveId) ?? workspaces[0];
  const root = active.root;

  const updateActiveRoot = (fn: (r: AreaNode) => AreaNode) => {
    setWorkspaces((ws) => ws.map((w) => (w.id === effectiveId ? { ...w, root: fn(w.root) } : w)));
  };
  const addWorkspace = (presetId: string) => {
    const preset = ENTRO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const ws: WorkspaceInstance = { id: newWsId(), name: preset.label, root: preset.build() };
    setWorkspaces((w) => [...w, ws]);
    setActiveId(ws.id);
  };
  const removeWorkspace = (id: string) => {
    setWorkspaces((ws) => {
      if (ws.length <= 1) return ws;
      const next = ws.filter((w) => w.id !== id);
      if (id === effectiveId) setActiveId(next[0].id);
      return next;
    });
  };
  const renameWorkspace = (id: string, name: string) => {
    setWorkspaces((ws) => ws.map((w) => (w.id === id ? { ...w, name } : w)));
  };
  const duplicateWorkspace = (id: string) => {
    const source = workspaces.find((w) => w.id === id);
    if (!source) return;
    const copy: WorkspaceInstance = { id: newWsId(), name: `${source.name} copy`, root: JSON.parse(JSON.stringify(source.root)) };
    const index = workspaces.findIndex((w) => w.id === id);
    const next = [...workspaces];
    next.splice(index + 1, 0, copy);
    setWorkspaces(next);
    setActiveId(copy.id);
  };
  const moveWorkspace = (id: string, delta: number) => {
    setWorkspaces((ws) => {
      const index = ws.findIndex((w) => w.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= ws.length) return ws;
      const next = [...ws];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };
  const reorderWorkspace = (id: string, targetId: string) => {
    setWorkspaces((ws) => {
      const from = ws.findIndex((w) => w.id === id);
      const to = ws.findIndex((w) => w.id === targetId);
      if (from < 0 || to < 0 || from === to) return ws;
      const next = [...ws];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  useEffect(() => {
    fetch("/api/document?name=shoebox")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((doc) => {
        loadDocument(doc);
        logLine("loaded scene 'shoebox'");
      })
      .catch(() => logLine("scene load failed — is the backend running? (npm run server)"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#14161a", color: "#d6dde4" }}>
      <Titlebar title={document?.name ? `${document.name}.audio_usd` : undefined} appName="ENTRO ATMOS" />
      <MenuBar
        workspaces={workspaces}
        activeId={effectiveId}
        presets={ENTRO_PRESETS}
        onSwitch={setActiveId}
        onAdd={addWorkspace}
        onRemove={removeWorkspace}
        onRename={renameWorkspace}
        onDuplicate={duplicateWorkspace}
        onMove={moveWorkspace}
        onReorder={reorderWorkspace}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <LayoutTree
          node={root}
          onSplitRow={(id) => updateActiveRoot((r) => splitAt(r, id, "row"))}
          onSplitColumn={(id) => updateActiveRoot((r) => splitAt(r, id, "column"))}
          onMerge={(id) => updateActiveRoot((r) => mergeAt(r, id))}
          onClose={(id) => updateActiveRoot((r) => closeAt(r, id))}
        />
      </div>
      <ToastStack />
      {splashOpen && <Splash />}
    </div>
  );
}

function LayoutTree({
  node,
  onSplitRow,
  onSplitColumn,
  onMerge,
  onClose,
}: {
  node: AreaNode;
  onSplitRow: (id: string) => void;
  onSplitColumn: (id: string) => void;
  onMerge: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const render = (n: AreaNode): React.ReactNode => {
    if (n.kind === "leaf") {
      return (
        <PanelSlot
          id={n.id}
          type={n.type}
          onType={() => undefined}
          onSplitRow={() => onSplitRow(n.id)}
          onSplitColumn={() => onSplitColumn(n.id)}
          onMerge={() => onMerge(n.id)}
          onClose={() => onClose(n.id)}
          canMerge
          mergeTarget={false}
          preview={null}
          onPreview={() => undefined}
        />
      );
    }
    const ratio = ratios[n.id] ?? n.ratio;
    const setRatio = (value: number) => setRatios((r) => ({ ...r, [n.id]: Math.min(0.92, Math.max(0.08, value)) }));
    const first = <div style={{ flex: ratio, minWidth: 0, minHeight: 0, overflow: "hidden" }}>{render(n.first)}</div>;
    const second = <div style={{ flex: 1 - ratio, minWidth: 0, minHeight: 0, overflow: "hidden" }}>{render(n.second)}</div>;
    return n.direction === "row" ? (
      <div style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%" }}>
        {first}
        <VSplitter onDrag={(dx, total) => setRatio(ratio + dx / total)} />
        {second}
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        {first}
        <HSplitter onDrag={(dy, total) => setRatio(ratio + dy / total)} />
        {second}
      </div>
    );
  };
  return <div style={{ width: "100%", height: "100%" }}>{render(node)}</div>;
}

let wsUid = 0;
const newWsId = () => `entro_ws_${++wsUid}`;

// --- area-tree helpers (mirror the template's areas semantics) ----------------

function splitAt(node: AreaNode, id: string, direction: "row" | "column"): AreaNode {
  if (node.kind === "leaf") {
    return node.id === id ? split(direction, leaf(node.type), leaf(node.type), 0.5) : node;
  }
  return { ...node, first: splitAt(node.first, id, direction), second: splitAt(node.second, id, direction) };
}

function mergeAt(node: AreaNode, id: string): AreaNode {
  if (node.kind === "split") {
    if (node.first.id === id) return node.second;
    if (node.second.id === id) return node.first;
    return { ...node, first: mergeAt(node.first, id), second: mergeAt(node.second, id) };
  }
  return node;
}

function closeAt(node: AreaNode, id: string): AreaNode {
  return mergeAt(node, id);
}
