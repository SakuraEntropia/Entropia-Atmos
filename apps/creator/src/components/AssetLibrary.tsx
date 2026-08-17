/** Asset Library — the entropia-riko style file manager for ENTRO scenes:
 * search, grouped folders, open, delete, save current, import, export. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importSceneFile, saveScene, exportWav } from "../actions";
import { useCreatorStore } from "../state/sceneStore";

interface SceneFile {
  name: string;
  path: string;
  imports: { spec: string; path: string | null; resolved: boolean }[];
  format: "ascii" | "binary";
}

export function AssetLibrary() {
  const loadDocument = useCreatorStore((s) => s.loadDocument);
  const logLine = useCreatorStore((s) => s.logLine);
  const [files, setFiles] = useState<SceneFile[]>([]);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const resp = await fetch("/api/files");
      const data = await resp.json();
      if (Array.isArray(data.files)) setFiles(data.files as SceneFile[]);
    } catch {
      /* backend unreachable */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map: Record<string, SceneFile[]> = {};
    const order: string[] = [];
    for (const f of files) {
      if (q && !f.name.toLowerCase().includes(q) && !f.path.toLowerCase().includes(q)) continue;
      const top = f.path.includes("/") ? f.path.slice(0, f.path.indexOf("/")) : "(root)";
      if (!(top in map)) {
        map[top] = [];
        order.push(top);
      }
      map[top].push(f);
    }
    order.sort();
    return { map, order };
  }, [files, query]);

  const open = async (path: string) => {
    try {
      const resp = await fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
      const data = await resp.json();
      if (data.status === "success") {
        loadDocument(data.doc);
        logLine(`opened ${path}`);
      } else {
        logLine(`open failed: ${data.error ?? "unknown error"}`);
      }
    } catch (error) {
      logLine(`open failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  const remove = async (name: string) => {
    try {
      const resp = await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (resp.ok) {
        logLine(`deleted ${name}`);
        void refresh();
      }
    } catch (error) {
      logLine(`delete failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  const save = async () => {
    await saveScene();
    void refresh();
  };

  return (
    <div className="asset-library">
      <input
        ref={fileRef}
        type="file"
        accept=".json,.audio_usd"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importSceneFile(file).then(refresh);
        }}
      />
      <div className="asset-toolbar">
        <input
          className="asset-search"
          placeholder="Search scenes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="asset-actions">
        <button className="mini-btn wide" onClick={save} title="Save the current scene to the server">💾 Save current</button>
        <button className="mini-btn wide" onClick={() => fileRef.current?.click()} title="Import an Audio-USD scene">⬇ Import</button>
        <button className="mini-btn wide" onClick={() => void exportWav()} title="Render and download the binaural WAV">⬆ Export WAV</button>
      </div>
      <div className="asset-groups">
        {grouped.order.length === 0 && <div className="scene-item muted">no scenes</div>}
        {grouped.order.map((top) => (
          <div key={top} className="asset-group">
            <div className="asset-group-head">{top}</div>
            {grouped.map[top].map((file) => (
              <div key={file.path} className="asset-row" title={file.path}>
                <span className="asset-name" onClick={() => void open(file.path)}>{file.name}</span>
                <span className="asset-format">{file.format === "binary" ? "bin" : "json"}</span>
                <button className="outliner-x asset-del" title="delete" onClick={() => void remove(file.name)}>✕</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
