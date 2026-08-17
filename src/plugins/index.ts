/** Plugin ecosystem (Phase 5): host bridges, host simulator, packaging. */
export type { VstBridge } from "./vst/vstBridge";
export { ScenePlugin } from "./vst/scenePlugin";
export { runHostSession } from "./vst/hostSimulator";
export type { AutomationEvent, HostSessionResult } from "./vst/hostSimulator";
export type { AuBridge } from "./au/auBridge";
export type { ContentPackManifest, ContentPackIssue } from "./packaging";
export { createContentPack, validateContentPack } from "./packaging";
