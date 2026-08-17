import { describe, expect, it } from "vitest";
import { decodeWav, encodeWav } from "./wav";

describe("WAV round-trip", () => {
  it("round-trips 32-bit float stereo", () => {
    const left = Float32Array.from([0, 0.5, -0.5, 0.25]);
    const right = Float32Array.from([1, -1, 0.1, 0]);
    const decoded = decodeWav(encodeWav([left, right], 48000, "float32"));
    expect(decoded.sampleRate).toBe(48000);
    expect(decoded.channels).toHaveLength(2);
    for (let i = 0; i < 4; i++) {
      expect(decoded.channels[0][i]).toBeCloseTo(left[i], 6);
      expect(decoded.channels[1][i]).toBeCloseTo(right[i], 6);
    }
  });

  it("round-trips 16-bit PCM within quantization error", () => {
    const signal = Float32Array.from([0.5, -0.5, 0.9999, -0.9999, 0]);
    const decoded = decodeWav(encodeWav([signal], 44100, "pcm16"));
    expect(decoded.sampleRate).toBe(44100);
    for (let i = 0; i < signal.length; i++) {
      expect(Math.abs(decoded.channels[0][i] - signal[i])).toBeLessThan(2e-4);
    }
  });

  it("rejects non-WAV bytes", () => {
    expect(() => decodeWav(new ArrayBuffer(64))).toThrow(/not a RIFF/);
  });
});
