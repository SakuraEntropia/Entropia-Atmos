/** Blender-style timeline: time ruler, draggable/clickable playhead,
 * playback controls, loop range and current-time readout. */
import { useRef, useState } from "react";
import { useCreatorStore } from "../state/sceneStore";
import { startPlayback, stopPlayback, useIsPlaying } from "../preview/playback";

const DURATION = 10; // seconds shown on the ruler

export function Timeline({
  onPlay,
  onStop,
  playing,
}: {
  onPlay: (fromSeconds: number) => void;
  onStop: () => void;
  playing: boolean;
}) {
  const playhead = useCreatorStore((s) => s.playheadSeconds);
  const setPlayhead = useCreatorStore((s) => s.setPlayhead);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(DURATION);
  const rulerRef = useRef<HTMLDivElement>(null);

  const seekFromEvent = (clientX: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const t = Math.max(0, Math.min(DURATION, ((clientX - rect.left) / rect.width) * DURATION));
    setPlayhead(t);
  };

  const ticks = Array.from({ length: DURATION * 2 + 1 }, (_, i) => i * 0.5);

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button className="tl-btn" title="Jump to start" onClick={() => setPlayhead(rangeStart)}>⏮</button>
        <button className="tl-btn" title={playing ? "Pause" : "Play"} onClick={() => (playing ? onStop() : onPlay(playhead))}>
          {playing ? "⏸" : "⏵"}
        </button>
        <button className="tl-btn" title="Stop" onClick={onStop}>⏹</button>
        <button className="tl-btn" title="Jump to end" onClick={() => setPlayhead(rangeEnd)}>⏭</button>
      </div>
      <div
        ref={rulerRef}
        className="timeline-ruler"
        onPointerDown={(e) => seekFromEvent(e.clientX)}
      >
        {ticks.map((t) => (
          <div
            key={t}
            className={`timeline-tick ${t % 1 === 0 ? "major" : ""}`}
            style={{ left: `${(t / DURATION) * 100}%` }}
          >
            {t % 1 === 0 && <span className="timeline-label">{t.toFixed(0)}s</span>}
          </div>
        ))}
        <div className="timeline-playhead" style={{ left: `${(playhead / DURATION) * 100}%` }} />
      </div>
      <div className="timeline-readout">
        <span className="tl-time">{playhead.toFixed(2)} s</span>
        <label className="tl-range">
          <input type="number" step={0.5} value={rangeStart} onChange={(e) => setRangeStart(Number(e.target.value))} />
          −
          <input type="number" step={0.5} value={rangeEnd} onChange={(e) => setRangeEnd(Number(e.target.value))} />
        </label>
      </div>
    </div>
  );
}

/** Timeline as a workspace PANEL (self-contained playback wiring). */
export function TimelinePanel() {
  const playing = useIsPlaying();
  return <Timeline onPlay={(from) => void startPlayback(from)} onStop={() => stopPlayback()} playing={playing} />;
}
