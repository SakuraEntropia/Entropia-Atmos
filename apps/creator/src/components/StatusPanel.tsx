/** Status/log panel + Bake (AudioGS) and Delivery workspace actions. */
import { useState } from "react";
import { useCreatorStore } from "../state/sceneStore";

export function StatusPanel() {
  const log = useCreatorStore((s) => s.log);
  return (
    <div className="status-panel">
      <div className="status-head">Log</div>
      <div className="status-body">
        {log.length === 0 && <div className="muted">ready.</div>}
        {log.map((entry, i) => (
          <div key={i} className="status-line">
            <span className="status-time">{entry.time}</span> {entry.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BakePanel() {
  const document = useCreatorStore((s) => s.document);
  const logLine = useCreatorStore((s) => s.logLine);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const bake = async () => {
    if (!document) return;
    setBusy(true);
    setResult("building AudioGS field…");
    try {
      const resp = await fetch("/api/audiogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, grid: 4, bands: 4 }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as { message: string };
      setResult(data.message);
      logLine(data.message);
    } catch (error) {
      setResult(`failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bake-panel">
      <h4>Bake — AudioGS</h4>
      <p className="muted">Samples the sound field on a voxel grid, fits SH coefficients,
      projects Gaussian splats, and calibrates opacity (0003).</p>
      <button className="primary" disabled={busy} onClick={bake}>
        {busy ? "Baking…" : "Bake splat field (grid 4, SH 4)"}
      </button>
      <pre className="bake-result">{result}</pre>
    </div>
  );
}

export function DeliveryPanel() {
  const document = useCreatorStore((s) => s.document);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const deliver = async () => {
    if (!document) return;
    setBusy(true);
    try {
      const resp = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as { message: string };
      setResult(data.message);
    } catch (error) {
      setResult(`failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bake-panel">
      <h4>Delivery</h4>
      <p className="muted">Standalone binaural WAV export. VST3 / AU shells wrap the same
      engine (host simulator + packaging live in the core repo).</p>
      <button className="primary" disabled={busy} onClick={deliver}>
        {busy ? "Exporting…" : "Export WAV"}
      </button>
      <pre className="bake-result">{result}</pre>
    </div>
  );
}
