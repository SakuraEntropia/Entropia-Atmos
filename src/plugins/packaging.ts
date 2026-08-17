/** Content-pack packaging and validation (Phase 5 delivery). */
import { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";

export interface ContentPackManifest {
  name: string;
  version: string;
  description?: string;
  /** Audio-USD scene files included in the pack. */
  scenes: string[];
  /** Delivery targets this pack was validated for. */
  targets: ("standalone" | "vst3" | "au")[];
}

export interface ContentPackIssue {
  path: string;
  message: string;
}

/** Validate a manifest against its directory contents. */
export function validateContentPack(directory: string, manifest: ContentPackManifest): ContentPackIssue[] {
  const issues: ContentPackIssue[] = [];
  if (!/^[a-z0-9._-]+$/i.test(manifest.name)) issues.push({ path: "name", message: "name must be filename-safe" });
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) issues.push({ path: "version", message: "version must be semver-shaped" });
  if (manifest.scenes.length === 0) issues.push({ path: "scenes", message: "pack needs at least one scene" });
  if (manifest.targets.length === 0) issues.push({ path: "targets", message: "pack needs at least one target" });
  for (const scene of manifest.scenes) {
    const path = resolve(directory, scene);
    if (!existsSync(path)) {
      issues.push({ path: scene, message: "scene file missing from the pack" });
      continue;
    }
    const text = readFileSync(path, "utf8");
    if (!text.includes('"schemaVersion"')) issues.push({ path: scene, message: "not an Audio-USD JSON document" });
  }
  return issues;
}

/** Copy scene files into a pack directory and write the manifest. */
export function createContentPack(
  outputDirectory: string,
  manifest: ContentPackManifest,
  sceneFiles: { sourcePath: string; packName: string }[]
): ContentPackManifest {
  mkdirSync(outputDirectory, { recursive: true });
  const copied: string[] = [];
  for (const { sourcePath, packName } of sceneFiles) {
    const target = join(outputDirectory, packName);
    copyFileSync(resolve(sourcePath), target);
    copied.push(packName);
  }
  const finalManifest = { ...manifest, scenes: copied };
  writeFileSync(join(outputDirectory, "manifest.json"), JSON.stringify(finalManifest, null, 2) + "\n");
  void basename;
  return finalManifest;
}
