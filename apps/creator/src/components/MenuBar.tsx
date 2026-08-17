/** ENTRO ATMOS menu bar — File / Edit / Render / Window / Help.
 *
 * All file operations (model import, scene import, save, binaural export)
 * live under File, Blender-style. The bar replaces the template Titlebar in
 * the creator chrome; the template shell panels are untouched.
 */
import { useRef, useState } from "react";
import {
  addPrim,
  bakeField,
  deleteSelected,
  exportWav,
  importModelFile,
  importSceneFile,
  renderScene,
  saveScene,
} from "../actions";
import { useCreatorStore, type WorkspaceId } from "../state/sceneStore";

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

const WORKSPACES: { id: WorkspaceId; label: string }[] = [
  { id: "layout", label: "Layout" },
  { id: "shading", label: "Shading" },
  { id: "simulation", label: "Simulation" },
  { id: "bake", label: "Bake" },
  { id: "delivery", label: "Delivery" },
];

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  const sceneInput = useRef<HTMLInputElement>(null);
  const setWorkspace = useCreatorStore((s) => s.setWorkspace);
  const resetViewport = useCreatorStore((s) => s.resetViewport);

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: "File",
      items: [
        { label: "Import Model (.obj)…", shortcut: "⌘I", action: () => modelInput.current?.click() },
        { label: "Import Scene (.json)…", action: () => sceneInput.current?.click() },
        { separator: true, label: "" },
        { label: "Save Scene (.audio_usd.json)", shortcut: "⌘S", action: () => saveScene() },
        { label: "Export Binaural WAV…", shortcut: "⇧⌘E", action: () => void exportWav() },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Add Emitter", action: () => addPrim("emitter") },
        { label: "Add Listener", action: () => addPrim("listener") },
        { label: "Add Material", action: () => addPrim("material") },
        { label: "Add Environment", action: () => addPrim("environment") },
        { separator: true, label: "" },
        { label: "Delete Selection", shortcut: "⌫", action: () => deleteSelected() },
      ],
    },
    {
      label: "Render",
      items: [
        { label: "Render Binaural", shortcut: "⌘R", action: () => void renderScene() },
        { label: "Bake Splat Field (AudioGS)…", action: () => void bakeField() },
      ],
    },
    {
      label: "Window",
      items: [
        ...WORKSPACES.map((ws) => ({ label: `Workspace: ${ws.label}`, action: () => setWorkspace(ws.id) })),
        { separator: true, label: "" },
        { label: "Reset 3D View", action: () => resetViewport() },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "GitHub Repository", action: () => window.open("https://github.com/SakuraEntropia/Entropia-Atmos", "_blank") },
        { label: "About ENTRO ATMOS", action: () => window.alert("ENTRO ATMOS — AI + Graphics inspired spatial audio engine\nBlender for spatial audio.") },
      ],
    },
  ];

  return (
    <header className="menu-bar">
      <input
        ref={modelInput}
        type="file"
        accept=".obj"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importModelFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={sceneInput}
        type="file"
        accept=".json,.audio_usd"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importSceneFile(file);
          e.target.value = "";
        }}
      />
      <span className="menu-brand">ENTRO ATMOS</span>
      {menus.map((menu) => (
        <div key={menu.label} className="menu-root">
          <button
            className={`menu-title ${open === menu.label ? "open" : ""}`}
            onClick={() => setOpen(open === menu.label ? null : menu.label)}
          >
            {menu.label}
          </button>
          {open === menu.label && (
            <>
              <div className="menu-overlay" onClick={() => setOpen(null)} />
              <div className="menu-dropdown">
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div key={i} className="menu-sep" />
                  ) : (
                    <button
                      key={i}
                      className="menu-item"
                      onClick={() => {
                        setOpen(null);
                        item.action?.();
                      }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>
      ))}
      <span className="menu-scene">scene: {useCreatorStore((s) => s.document?.name) ?? "—"}</span>
    </header>
  );
}
