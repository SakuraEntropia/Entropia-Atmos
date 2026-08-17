/** Transport: render the current scene through the backend, then play the
 * binaural result with the Web Audio API. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useCreatorStore } from "../state/sceneStore";

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

  const loadBuffer = useCallback(async () => {
    if (!renderedWavPath) return null;
    const resp = await fetch(`/api/file?path=${encodeURIComponent(renderedWavPath)}`);
    if (!resp.ok) throw new Error(await resp.text());
    const arrayBuffer = await resp.arrayBuffer();
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    return context.decodeAudioData(arrayBuffer);
  }, [renderedWavPath]);

  const play = useCallback(async () => {
    try {
      if (!bufferRef.current) bufferRef.current = await loadBuffer();
      const buffer = bufferRef.current;
      if (!buffer) return;
      const context = contextRef.current!;
      await context.resume();
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(context.destination);
      source.start();
      sourceRef.current = source;
      setPlaying(true);
      const startedAt = context.currentTime;
      const tick = () => {
        if (!sourceRef.current) return;
        setPosition(Math.min(buffer.duration, context.currentTime - startedAt));
        requestAnimationFrame(tick);
      };
      tick();
      source.onended = () => {
        setPlaying(false);
        setPosition(0);
        sourceRef.current = null;
      };
    } catch (error) {
      logLine(`playback failed: ${error instanceof Error ? error.message : error}`);
    }
  }, [loadBuffer, volume, logLine]);

  const stop = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlaying(false);
    setPosition(0);
  }, []);

  useEffect(() => {
    if (bufferRef.current) bufferRef.current = null; // re-decode after re-render
  }, [renderedWavPath]);

  return (
    <div className="transport">
      <button className="primary" disabled={!document || renderStatus === "rendering"} onClick={render}>
        {renderStatus === "rendering" ? "Rendering…" : "▶ Render binaural"}
      </button>
      <button disabled={renderStatus !== "ready" || playing} onClick={play}>▶ Play</button>
      <button disabled={!playing} onClick={stop}>■ Stop</button>
      <label className="transport-field">
        Vol
        <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
      </label>
      <span className="transport-time">
        {position.toFixed(1)} s {renderStatus === "ready" ? "· stereo (binaural)" : ""}
      </span>
    </div>
  );
}
