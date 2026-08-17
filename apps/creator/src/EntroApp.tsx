/** ENTRO ATMOS creator — audio workstation shell (custom, purpose-built).
 *
 * Layout: titlebar / workspace tabs · scene panel · 3D panner · inspector ·
 * transport · status. The five ENTRO workspaces focus the panels:
 * Layout (scene + 3D), Shading (materials), Simulation (solver + log),
 * Bake (AudioGS), Delivery (export).
 */
import { useEffect } from "react";
import { useCreatorStore, type WorkspaceId } from "./state/sceneStore";
import { Viewport3D } from "./components/Viewport3D";
import { ScenePanel } from "./components/ScenePanel";
import { Inspector } from "./components/Inspector";
import { Transport } from "./components/Transport";
import { StatusPanel, BakePanel, DeliveryPanel } from "./components/StatusPanel";

const WORKSPACES: { id: WorkspaceId; label: string; hint: string }[] = [
  { id: "layout", label: "Layout", hint: "Audio-USD scene construction" },
  { id: "shading", label: "Shading", hint: "Acoustic material definition" },
  { id: "simulation", label: "Simulation", hint: "Physical acoustic solving" },
  { id: "bake", label: "Bake", hint: "AudioGS training and preprocessing" },
  { id: "delivery", label: "Delivery", hint: "Binaural export / plugins" },
];

export function EntroApp() {
  const document = useCreatorStore((s) => s.document);
  const workspace = useCreatorStore((s) => s.workspace);
  const setWorkspace = useCreatorStore((s) => s.setWorkspace);
  const logLine = useCreatorStore((s) => s.logLine);
  const loadDocument = useCreatorStore((s) => s.loadDocument);

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

  const leftContent =
    workspace === "bake" ? <BakePanel /> : workspace === "delivery" ? <DeliveryPanel /> : <ScenePanel />;

  return (
    <div className="app">
      <header className="titlebar">
        <span className="brand">ENTRO ATMOS</span>
        <span className="titlebar-sub">spatial audio workstation</span>
        <span className="titlebar-scene">{document?.name ?? "no scene"}</span>
      </header>
      <div className="workspace-tabs">
        {WORKSPACES.map((ws) => (
          <button
            key={ws.id}
            className={workspace === ws.id ? "active" : ""}
            title={ws.hint}
            onClick={() => setWorkspace(ws.id)}
          >
            {ws.label}
          </button>
        ))}
      </div>
      <div className="main-row">
        <aside className="left-panel">{leftContent}</aside>
        <main className="center-panel">
          <Viewport3D />
        </main>
        <aside className="right-panel">
          <Inspector />
        </aside>
      </div>
      <div className="bottom-row">
        <div className="transport-wrap">
          <Transport />
        </div>
        <div className="status-wrap">
          <StatusPanel />
        </div>
      </div>
    </div>
  );
}
