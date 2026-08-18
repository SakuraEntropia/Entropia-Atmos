/** Transport: render the current scene through the backend, then play the
 * binaural result with the Web Audio API. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useCreatorStore } from "../state/sceneStore";
import { startLivePreview, stopLivePreview, isLivePreviewOn } from "../preview/livePreview";
import { setPlaybackBuffer, setPlaybackVolume } from "../preview/playback";

export function Transport() {
  const document = useCreatorStore((s) => s.document);
  const renderStatus = useCreatorStore((s) => s.renderStatus);
  const renderedWavPath = useCreatorStore((s) => s.renderedWavPath);
  const solver = useCreatorStore((s) => s.solver);
  const maxOrder = useCreatorStore((s) => s.maxOrder);
  const rayBudget = useCreatorStore((s) => s.rayBudget);
  const lateDuration = useCreatorStore((s) => s.lateDuration);
  const setRenderStatus = useCreatorStore((s) => s.setRenderStatus);
  const logLine = useCreatorStore((s) => s.logLine);

  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState(false);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const render = useCallback(async () => {
    if (!document) return;
    setRenderStatus("rendering");
    logLine(`rendering (${solver}, order ${maxOrder})…`);
    try {
      const resp = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document,
          solver,
          order: maxOrder,
          rays: rayBudget,
          lateDuration,
          impulse: true,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as { message: string; wavPath: string };
      setRenderStatus("ready", data.wavPath);
      logLine(data.message);
    } catch (error) {
      setRenderStatus("error");
      logLine(`render failed: ${error instanceof Error ? error.message : error}`);
    }
  }, [document, solver, maxOrder, rayBudget, lateDuration, logLine, setRenderStatus]);

  // Decode the rendered WAV and hand it to the shared playback engine
  // (the timeline owns play/stop/seek).
  const loadBuffer = useCallback(async () => {
    if (!renderedWavPath) return;
    try {
      const resp = await fetch(`/api/file?path=${encodeURIComponent(renderedWavPath)}`);
      if (!resp.ok) throw new Error(await resp.text());
      const arrayBuffer = await resp.arrayBuffer();
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(arrayBuffer);
      void context.close();
      setPlaybackBuffer(decoded);
    } catch (error) {
      logLine(`playback load failed: ${error instanceof Error ? error.message : error}`);
    }
  }, [renderedWavPath, logLine]);

  useEffect(() => {
    setPlaybackVolume(volume);
  }, [volume]);

  useEffect(() => {
    void loadBuffer();
  }, [loadBuffer]);

  return (
    <div className="transport">
      <button className="primary" disabled={!document || renderStatus === "rendering"} onClick={render}>
        {renderStatus === "rendering" ? "Rendering…" : "▶ Render binaural"}
      </button>
      <button
        className={live ? "primary" : ""}
        title="Run the engine in the browser: move objects and hear the result live"
        onClick={() => {
          if (live) {
            stopLivePreview();
            setLive(false);
          } else {
            void startLivePreview().then((ok) => setLive(ok));
          }
        }}
      >
        {live ? "⏸ Live preview: on" : "🔊 Live preview"}
      </button>
      <label className="transport-field">
        Vol
        <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
      </label>
      <span className="transport-time">{renderStatus === "ready" ? "stereo (binaural) ready" : "render to enable playback"}</span>
    </div>
  );
}
