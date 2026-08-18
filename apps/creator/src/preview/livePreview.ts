/** Real-time preview (live audition).
 *
 * Runs the ACTUAL engine in the browser: the scene document is simulated
 * (image-source) and baked into a stereo scene IR, which feeds Web Audio's
 * native ConvolverNode. Moving objects re-bakes the IR (throttled) and
 * crossfades between two convolvers — genuinely real-time binaural preview
 * without a round-trip to the backend.
 */
import { parseAudioUsd, toAudioScene } from "../../../../src/formats/audio_usd/index";
import {
  DefaultAcousticEngine,
  FdnReverbSystem,
  ImageSourceSolver,
} from "../../../../src/core/acoustic_engine/index";
import { SphericalHeadHrtf } from "../../../../src/core/renderer/index";
import { buildSceneIr } from "../../../../src/core/dsp/index";
import { useCreatorStore } from "../state/sceneStore";
import { getImportedAudio } from "../actions";

const SAMPLE_RATE = 48000;

interface PreviewState {
  context: AudioContext;
  loop: AudioBufferSourceNode;
  convolvers: [ConvolverNode, ConvolverNode];
  gains: [GainNode, GainNode];
  active: 0 | 1;
  timer: number;
  hash: string;
}

let preview: PreviewState | null = null;

function sceneHash(): string {
  const state = useCreatorStore.getState();
  const document = state.document;
  if (!document) return "empty";
  const transforms = document.layers
    .flatMap((l) => l.prims)
    .filter((p) => p.type === "emitter" || p.type === "listener")
    .map((p) => JSON.stringify(p.payload.transform ?? null))
    .join("|");
  return transforms;
}

/** Bake the current scene into a stereo IR with the in-browser engine. */
async function bakeSceneIr(): Promise<{ left: Float32Array; right: Float32Array } | null> {
  const document = useCreatorStore.getState().document;
  if (!document) return null;
  try {
    const scene = toAudioScene(parseAudioUsd(JSON.stringify(document)));
    const engine = new DefaultAcousticEngine({
      reverb: new FdnReverbSystem(),
      solvers: [new ImageSourceSolver()],
    });
    const dir = await engine.simulate({
      scene,
      emitterId: scene.emitters[0].id,
      listenerId: scene.listeners[0].id,
      options: {
        solver: "image-source",
        maxReflectionOrder: 2,
        sampleRate: SAMPLE_RATE,
        lateFieldDurationSeconds: 0.4,
      },
    });
    return buildSceneIr(dir, new SphericalHeadHrtf(SAMPLE_RATE));
  } catch (error) {
    useCreatorStore.getState().logLine(`preview bake failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/** Loop buffer: the first emitter's imported audio, or a click loop. */
function buildLoop(context: AudioContext): AudioBuffer {
  const audio = getImportedAudio();
  const length = audio ? audio.length : SAMPLE_RATE;
  const buffer = context.createBuffer(1, length, SAMPLE_RATE);
  const channel = buffer.getChannelData(0);
  if (audio) {
    channel.set(audio.subarray(0, Math.min(audio.length, length)));
    return buffer;
  }
  // Click train: 4 clicks per second so movement changes are audible.
  for (let i = 0; i < 4; i++) {
    const at = Math.floor((i * SAMPLE_RATE) / 4);
    for (let k = 0; k < 240 && at + k < length; k++) {
      channel[at + k] = Math.exp(-k / 40);
    }
  }
  return buffer;
}

async function setIr(ir: { left: Float32Array; right: Float32Array }): Promise<void> {
  if (!preview) return;
  const context = preview.context;
  const buffer = context.createBuffer(2, Math.max(1, ir.left.length), SAMPLE_RATE);
  buffer.copyToChannel(Float32Array.from(ir.left), 0);
  buffer.copyToChannel(Float32Array.from(ir.right), 1);
  const idle = preview.active === 0 ? 1 : 0;
  preview.convolvers[idle].buffer = buffer;
  const now = context.currentTime;
  preview.gains[preview.active].gain.setTargetAtTime(0, now, 0.03);
  preview.gains[idle].gain.setTargetAtTime(1, now, 0.03);
  preview.active = idle as 0 | 1;
}

export async function startLivePreview(): Promise<boolean> {
  if (preview) return true;
  const document = useCreatorStore.getState().document;
  if (!document) return false;
  const ir = await bakeSceneIr();
  if (!ir) return false;
  const context = new AudioContext();
  await context.resume();

  const convolverA = context.createConvolver();
  const convolverB = context.createConvolver();
  const buffer = context.createBuffer(2, Math.max(1, ir.left.length), SAMPLE_RATE);
  buffer.copyToChannel(Float32Array.from(ir.left), 0);
  buffer.copyToChannel(Float32Array.from(ir.right), 1);
  convolverA.buffer = buffer;
  convolverB.buffer = buffer;

  const gainA = context.createGain();
  const gainB = context.createGain();
  gainA.gain.value = 1;
  gainB.gain.value = 0;
  const master = context.createGain();
  master.gain.value = 0.8;
  convolverA.connect(gainA).connect(master);
  convolverB.connect(gainB).connect(master);
  master.connect(context.destination);

  const loop = context.createBufferSource();
  loop.buffer = buildLoop(context);
  const loopDuration = loop.buffer.duration;
  const startedAt = context.currentTime;
  loop.loop = true;
  loop.connect(convolverA);
  loop.connect(convolverB);
  loop.start();

  preview = { context, loop, convolvers: [convolverA, convolverB], gains: [gainA, gainB], active: 0, timer: 0, hash: sceneHash() };
  preview.timer = window.setInterval(async () => {
    const hash = sceneHash();
    useCreatorStore.getState().setPlayhead((context.currentTime - startedAt) % loopDuration);
    if (hash !== preview?.hash) {
      preview!.hash = hash;
      const next = await bakeSceneIr();
      if (next) void setIr(next);
    }
  }, 250);
  useCreatorStore.getState().logLine("live preview on — move objects to hear it in real time");
  return true;
}

export function stopLivePreview(): void {
  if (!preview) return;
  window.clearInterval(preview.timer);
  preview.loop.stop();
  void preview.context.close();
  preview = null;
  useCreatorStore.getState().logLine("live preview off");
}

export function isLivePreviewOn(): boolean {
  return preview !== null;
}
