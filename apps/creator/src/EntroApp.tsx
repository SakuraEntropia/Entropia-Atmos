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
  registerPanelContent,
  setPanelTypeVisibility,
  StatusPanel,
  setLeafType,
  splitLeaf,
  mergeLeaf,
  closeLeaf,
  resizeSplit,
  countLeaves,
  siblingNodeId,
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
import { APP_VERSION } from "./version";
import { TimelinePanel } from "./components/Timeline";
import { NodeEditor } from "./components/NodeEditor";
import { AssetLibrary } from "./components/AssetLibrary";
import { Splash } from "./components/Splash";
import { ENTRO_PRESETS } from "./workspaces";

/** Register the audio functionality into the template's panel registry.
 * (This is the supported extension point — the template shell is untouched.) */
registerPanelContent("canvas", () => <Viewport3D />);
registerPanelContent("inspector", () => <Inspector />);
registerPanelContent("nodes", () => <LeftWorkspacePanel />);
registerPanelContent("status", () => <StatusBar />);
registerPanelContent("shader", () => <NodeEditor />);
registerPanelContent("timeline", () => <TimelinePanel />);
registerPanelContent("files", () => <AssetLibrary />);
// Delete every legacy template panel from the UI: only the audio panels
// remain in the panel-type dropdown.
setPanelTypeVisibility(["nodes", "files", "canvas", "inspector", "status", "shader", "timeline"]);

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
  const [preview, setPreview] = useState<DragPreview>(null);
  const [previewLeafId, setPreviewLeafId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

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
    <div className="app" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Titlebar title={document?.name ? `${document.name}.audio_usd` : undefined} appName="Entropia-Atmos" version={APP_VERSION} />
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
          root={root}
          updateRoot={updateActiveRoot}
          preview={preview}
          previewLeafId={previewLeafId}
          mergeTargetId={mergeTargetId}
          onPreview={(leafId, p) => {
            setPreview(p);
            setPreviewLeafId(p ? leafId : null);
            setMergeTargetId(p?.mode === "merge" ? siblingNodeId(root, leafId) : null);
          }}
        />
      </div>
      <ToastStack />
      {splashOpen && <Splash />}
    </div>
  );
}

type DragPreview = { mode: "split-row" | "split-column" | "merge"; x: number; y: number } | null;

function LayoutTree({
  node,
  root,
  updateRoot,
  preview,
  previewLeafId,
  mergeTargetId,
  onPreview,
}: {
  node: AreaNode;
  root: AreaNode;
  updateRoot: (fn: (r: AreaNode) => AreaNode) => void;
  preview: DragPreview;
  previewLeafId: string | null;
  mergeTargetId: string | null;
  onPreview: (leafId: string, p: DragPreview) => void;
}) {
  const canMerge = countLeaves(root) > 1;

  if (node.kind === "leaf") {
    return (
      <PanelSlot
        key={node.id}
        id={node.id}
        type={node.type}
        onType={(type) => updateRoot((r) => setLeafType(r, node.id, type))}
        onSplitRow={() => updateRoot((r) => splitLeaf(r, node.id, "row"))}
        onSplitColumn={() => updateRoot((r) => splitLeaf(r, node.id, "column"))}
        onMerge={() => updateRoot((r) => mergeLeaf(r, node.id))}
        onClose={() => updateRoot((r) => closeLeaf(r, node.id))}
        canMerge={canMerge}
        mergeTarget={mergeTargetId === node.id}
        preview={previewLeafId === node.id ? preview : null}
        onPreview={(p) => onPreview(node.id, p)}
      />
    );
  }
  return node.direction === "row" ? (
    <div
      key={node.id}
      style={{ display: "flex", flexDirection: "row", flex: "1 1 0", minWidth: 0, minHeight: 0 }}
    >
      <div style={{ flex: node.ratio, minWidth: 0, minHeight: 0, display: "flex" }}>
        <LayoutTree node={node.first} root={root} updateRoot={updateRoot} preview={preview} previewLeafId={previewLeafId} mergeTargetId={mergeTargetId} onPreview={onPreview} />
      </div>
      <VSplitter onDrag={(dx, total) => updateRoot((r) => resizeSplit(r, node.id, dx / total))} />
      <div style={{ flex: 1 - node.ratio, minWidth: 0, minHeight: 0, display: "flex" }}>
        <LayoutTree node={node.second} root={root} updateRoot={updateRoot} preview={preview} previewLeafId={previewLeafId} mergeTargetId={mergeTargetId} onPreview={onPreview} />
      </div>
    </div>
  ) : (
    <div
      key={node.id}
      style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minWidth: 0, minHeight: 0 }}
    >
      <div style={{ flex: node.ratio, minWidth: 0, minHeight: 0, display: "flex" }}>
        <LayoutTree node={node.first} root={root} updateRoot={updateRoot} preview={preview} previewLeafId={previewLeafId} mergeTargetId={mergeTargetId} onPreview={onPreview} />
      </div>
      <HSplitter onDrag={(dy, total) => updateRoot((r) => resizeSplit(r, node.id, dy / total))} />
      <div style={{ flex: 1 - node.ratio, minWidth: 0, minHeight: 0, display: "flex" }}>
        <LayoutTree node={node.second} root={root} updateRoot={updateRoot} preview={preview} previewLeafId={previewLeafId} mergeTargetId={mergeTargetId} onPreview={onPreview} />
      </div>
    </div>
  );
}

let wsUid = 0;
const newWsId = () => `entro_ws_${++wsUid}`;
