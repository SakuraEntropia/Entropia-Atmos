import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContentPack, validateContentPack, type ContentPackManifest } from "./packaging";

describe("content pack packaging (Phase 5)", () => {
  it("creates and validates a starter pack", () => {
    const dir = mkdtempSync(join(tmpdir(), "entro-pack-"));
    try {
      writeFileSync(join(dir, "scene.audio_usd.json"), '{"schemaVersion":"0.2.0","upAxis":"y","unitsPerMeter":1,"layers":[]}');
      const manifest: ContentPackManifest = {
        name: "entropia-starter",
        version: "0.1.0",
        description: "Starter content pack",
        scenes: ["scene.audio_usd.json"],
        targets: ["standalone", "vst3", "au"],
      };
      createContentPack(dir, { ...manifest, scenes: [] }, [
        { sourcePath: join(dir, "scene.audio_usd.json"), packName: "shoebox.audio_usd.json" },
      ]);
      const written = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as ContentPackManifest;
      expect(written.scenes).toEqual(["shoebox.audio_usd.json"]);
      const issues = validateContentPack(dir, written);
      expect(issues).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports missing scene files and unsafe names", () => {
    const dir = mkdtempSync(join(tmpdir(), "entro-pack-"));
    try {
      const manifest: ContentPackManifest = {
        name: "Bad Name!",
        version: "1",
        scenes: ["missing.audio_usd.json"],
        targets: [],
      };
      const issues = validateContentPack(dir, manifest);
      expect(issues.length).toBeGreaterThanOrEqual(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
