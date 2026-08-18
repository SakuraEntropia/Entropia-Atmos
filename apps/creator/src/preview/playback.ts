/** Shared playback engine (WAV audition) used by the Transport and the
 * Blender-style timeline: one AudioContext, one looping source, seekable
 * start offsets. */
import { useEffect, useState } from "react";
import { useCreatorStore } from "../state/sceneStore";

let context: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let source: AudioBufferSourceNode | null = null;
let gain: GainNode | null = null;
let volume = 0.8;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function setPlaybackBuffer(next: AudioBuffer): void {
  buffer = next;
  notify();
}

export function setPlaybackVolume(value: number): void {
  volume = value;
  if (gain) gain.gain.value = value;
}

export function isPlaying(): boolean {
  return source !== null;
}

export async function startPlayback(fromSeconds: number): Promise<void> {
  if (!buffer) return;
  context ??= new AudioContext();
  await context.resume();
  stopPlayback(false);
  source = context.createBufferSource();
  source.buffer = buffer;
  gain = context.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(context.destination);
  const offset = Math.max(0, Math.min(fromSeconds, buffer.duration - 0.01));
  source.start(0, offset);
  source.onended = () => {
    source = null;
    useCreatorStore.getState().setPlayhead(0);
    notify();
  };
  notify();
}

export function stopPlayback(resetPlayhead = true): void {
  source?.stop();
  source = null;
  if (resetPlayhead) useCreatorStore.getState().setPlayhead(0);
  notify();
}

/** React hook: re-render on playback state changes. */
export function useIsPlaying(): boolean {
  const [playing, setPlaying] = useState(isPlaying());
  useEffect(() => {
    const update = () => setPlaying(isPlaying());
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return playing;
}
