# VST3 native shell — build spec (Phase 5)

The platform-independent plugin core lives in `../scenePlugin.ts` (the
`VstBridge` reference implementation on the real-time renderer). This
directory is the **native VST3 wrapper** that embeds it.

## Status

`TODO(Phase 5 native)`: requires the VST3 SDK (Steinberg, GPLv3/commercial
dual license). The wrapper is thin by design:

```
AudioProcessor (SDK) ──► ScenePlugin (TS core) ──► RealtimeBinauralRenderer
```

- `initialize`: load the baked scene document (Audio-USD JSON) via the
  platform embedding (Node/QuickJS or a precompiled native core — see
  ARCHITECTURE.md §7).
- `process`: `ScenePlugin.processBlock` per block; report
  `kInitialDelay = blockSize` latency.
- Parameters: expose `master_gain` (and later listener pose) through
  `ParameterContainer`; automation maps 0..1 → the bridge contract.

## CMake skeleton (SDK not vendored)

```cmake
cmake_minimum_required(VERSION 3.22)
project(entropia_atmos_vst3 LANGUAGES CXX)
set(VST3_SDK_ROOT "" CACHE PATH "Path to the VST3 SDK")
add_subdirectory("${VST3_SDK_ROOT}" vst3sdk)
add_library(entropia-atmos SHARED
  entry.cpp
  processor.cpp
  controller.cpp)
target_link_libraries(entropia-atmos PRIVATE sdk)
# Embedding target: the TS core via QuickJS or the future Rust/C++ core.
```

## Validation

Once built: run the DAW host simulator (`npm test -- hostSimulator`) for the
DSP behavior and a real host check (Reaper/Live/Logic) for the shell.
