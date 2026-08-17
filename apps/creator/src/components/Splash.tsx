/** ENTRO ATMOS splash screen — modeled on the entropia-riko welcome
 * screen: logo + version badge over two columns (Open example | Import). */
import { useEffect, useRef, useState } from "react";
import { importSceneFile } from "../actions";
import { useCreatorStore } from "../state/sceneStore";

const APP_VERSION = "0.5.0";

export function Splash() {
  const closeSplash = useCreatorStore((s) => s.closeSplash);
  const loadDocument = useCreatorStore((s) => s.loadDocument);
  const logLine = useCreatorStore((s) => s.logLine);
  const [scenes, setScenes] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.scenes)) {
          setScenes(
            (d.scenes as string[])
              .filter((s) => !s.includes("splats"))
              .sort((a, b) => a.localeCompare(b))
          );
        }
      })
      .catch(() => undefined);
  }, []);

  const openExample = async (name: string) => {
    try {
      const resp = await fetch(`/api/document?name=${encodeURIComponent(name)}`);
      if (!resp.ok) throw new Error(String(resp.status));
      loadDocument(await resp.json());
      logLine(`opened scene '${name}'`);
      closeSplash();
    } catch (error) {
      logLine(`open failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  return (
    <div className="splash-overlay">
      <div className="splash">
        <div className="splash-hero">
          <img src="/brand/logo.png" alt="ENTRO ATMOS logo" className="splash-logo" />
          <div className="splash-title">
            <h1>ENTRO ATMOS</h1>
            <span className="splash-badge">v{APP_VERSION}</span>
          </div>
        </div>
        <div className="splash-columns">
          <div className="splash-column">
            <div className="splash-column-head">Open example</div>
            {scenes.length === 0 && <div className="splash-item muted">backend not reachable</div>}
            {scenes.map((name) => (
              <div key={name} className="splash-item" onClick={() => void openExample(name)}>
                {name}
              </div>
            ))}
          </div>
          <div className="splash-column">
            <div className="splash-column-head">Import scene</div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.audio_usd"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importSceneFile(file).then(closeSplash);
              }}
            />
            <div className="splash-item" onClick={() => fileRef.current?.click()}>
              Import .audio_usd.json…
            </div>
          </div>
        </div>
        <div className="splash-foot">AI + Graphics inspired spatial audio engine — “Blender for spatial audio”</div>
      </div>
    </div>
  );
}
