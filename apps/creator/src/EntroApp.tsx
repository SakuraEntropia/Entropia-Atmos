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
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Titlebar,
  WorkspaceTabs,
  PanelSlot,
  VSplitter,
  HSplitter,
  ToastStack,
  leaf,
  split,
  registerPanelContent,
  type AreaNode,
  type WorkspaceInstance,
} from "entropia-template-ui";
import { useCreatorStore, type WorkspaceId } from "./state/sceneStore";
import { Viewport3D } from "./components/Viewport3D";
import { Inspector } from "./components/Inspector";
import { ScenePanel } from "./components/ScenePanel";
import { StatusPanel, BakePanel, DeliveryPanel } from "./components/StatusPanel";
import { Transport } from "./components/Transport";

const WORKSPACES: { id: WorkspaceId; label: string }[] = [
  { id: "layout", label: "Layout" },
  { id: "shading", label: "Shading" },
  { id: "simulation", label: "Simulation" },
  { id: "bake", label: "Bake" },
  { id: "delivery", label: "Delivery" },
];

/** Register the audio functionality into the template's panel registry.
 * (This is the supported extension point — the template shell is untouched.) */
registerPanelContent("canvas", () => <Viewport3D />);
registerPanelContent("inspector", () => <Inspector />);
registerPanelContent("nodes", () => <LeftWorkspacePanel />);
registerPanelContent("status", () => <StatusBar />);
// Legacy template panels not used by ENTRO ATMOS: replaced with a clean
// placeholder instead of broken ML-editor content.
for (const type of ["files", "project", "loss", "plugins", "code", "pad", "docs"]) {
  registerPanelContent(type, () => (
    <div className="scene-panel">
      <div className="scene-item muted">This panel is not used in ENTRO ATMOS.</div>
    </div>
  ));
}

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

function entroLayout(): AreaNode {
  const left = split("column", leaf("nodes"), leaf("inspector"), 0.62);
  const main = split("row", left, leaf("canvas"), 0.26);
  return split("column", main, leaf("status"), 0.82);
}

let wsUid = 0;
const newWsId = () => `entro_ws_${++wsUid}`;

export function EntroApp() {
  const logLine = useCreatorStore((s) => s.logLine);
  const loadDocument = useCreatorStore((s) => s.loadDocument);
  const setWorkspace = useCreatorStore((s) => s.setWorkspace);

  const [workspaces, setWorkspaces] = useState<WorkspaceInstance[]>(() =>
    WORKSPACES.map((preset) => ({ id: newWsId(), name: preset.label, root: entroLayout() }))
  );
  const [activeId, setActiveId] = useState<string | null>(null);

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

  useEffect(() => {
    const active = workspaces.find((w) => w.id === (activeId ?? workspaces[0]?.id));
    if (active) setWorkspace(active.name.toLowerCase() as WorkspaceId);
  }, [activeId, workspaces, setWorkspace]);

  const effectiveId = activeId ?? workspaces[0]?.id ?? "";
  const active = workspaces.find((w) => w.id === effectiveId) ?? workspaces[0];
  const root = useMemo(() => active.root, [active]);

  const updateActiveRoot = (fn: (r: AreaNode) => AreaNode) => {
    setWorkspaces((ws) => ws.map((w) => (w.id === effectiveId ? { ...w, root: fn(w.root) } : w)));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#14161a", color: "#d6dde4" }}>
      <Titlebar />
      <WorkspaceTabs
        workspaces={workspaces}
        activeId={effectiveId}
        onSwitch={setActiveId}
        onAdd={() => undefined}
        onRemove={() => undefined}
        onRename={() => undefined}
        onDuplicate={() => undefined}
        onMove={() => undefined}
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
