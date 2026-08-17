/** Minimal RIFF/WAVE reader & writer (PCM 8/16/24/32-bit int, 32-bit float).
 *
 * Sufficient for the offline MVP pipeline. Not supported: WAVE_FORMAT_
 * EXTENSIBLE and non-PCM encodings (thrown as errors, not guessed at).
 */

export interface WavData {
  sampleRate: number;
  channels: Float32Array[];
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function writeTag(view: DataView, offset: number, tag: string): void {
  for (let i = 0; i < 4; i++) view.setUint8(offset + i, tag.charCodeAt(i));
}

/** Decode a RIFF/WAVE buffer into normalized float channels ([-1, 1]). */
export function decodeWav(bytes: ArrayBuffer): WavData {
  const view = new DataView(bytes);
  if (bytes.byteLength < 44 || readTag(view, 0) !== "RIFF") throw new Error("not a RIFF file");
  if (readTag(view, 8) !== "WAVE") throw new Error("not a WAVE file");

  let offset = 12;
  let format: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= bytes.byteLength) {
    const tag = readTag(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (tag === "fmt ") {
      format = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (tag === "data") {
      dataOffset = body;
      dataLength = size;
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }

  if (!format || dataOffset < 0) throw new Error("missing 'fmt ' or 'data' chunk");
  const { audioFormat, channels, sampleRate, bitsPerSample } = format;
  if (audioFormat !== 1 && audioFormat !== 3) throw new Error(`unsupported WAV format ${audioFormat}`);
  if (audioFormat === 3 && bitsPerSample !== 32) throw new Error("float WAV must be 32-bit");
  if (channels < 1 || sampleRate <= 0) throw new Error("invalid WAV header (channels/sampleRate)");

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataLength / (bytesPerSample * channels));
  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c++) out.push(new Float32Array(frameCount));

  for (let frame = 0; frame < frameCount; frame++) {
    for (let c = 0; c < channels; c++) {
      const p = dataOffset + (frame * channels + c) * bytesPerSample;
      let value: number;
      if (audioFormat === 3) {
        value = view.getFloat32(p, true);
      } else {
        switch (bitsPerSample) {
          case 8:
            value = (view.getUint8(p) - 128) / 128;
            break;
          case 16:
            value = view.getInt16(p, true) / 32768;
            break;
          case 24: {
            const lo = view.getUint8(p);
            const mid = view.getUint8(p + 1);
            const hi = view.getInt8(p + 2);
            value = (hi * 65536 + mid * 256 + lo) / 8388608;
            break;
          }
          case 32:
            value = view.getInt32(p, true) / 2147483648;
            break;
          default:
            throw new Error(`unsupported PCM bit depth ${bitsPerSample}`);
        }
      }
      out[c][frame] = value;
    }
  }
  return { sampleRate, channels: out };
}

/** Encode float channels into a RIFF/WAVE buffer (32-bit float or 16-bit PCM). */
export function encodeWav(channels: Float32Array[], sampleRate: number, format: "pcm16" | "float32" = "float32"): ArrayBuffer {
  const channelCount = channels.length;
  if (channelCount < 1) throw new Error("encodeWav needs at least one channel");
  const frameCount = channels[0].length;
  const bytesPerSample = format === "float32" ? 4 : 2;
  const dataLength = frameCount * channelCount * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  writeTag(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeTag(view, 8, "WAVE");
  writeTag(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format === "float32" ? 3 : 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeTag(view, 36, "data");
  view.setUint32(40, dataLength, true);

  for (let frame = 0; frame < frameCount; frame++) {
    for (let c = 0; c < channelCount; c++) {
      const sample = channels[c][frame];
      const p = 44 + (frame * channelCount + c) * bytesPerSample;
      if (format === "float32") {
        view.setFloat32(p, sample, true);
      } else {
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(p, Math.round(clamped * 32767), true);
      }
    }
  }
  return buffer;
}
