# Audio Unit (AU) native shell — build spec (Phase 5)

Mirrors the VST3 shell (`../vst/native/README.md`): the `AuBridge` contract
and the `ScenePlugin` core are host-independent; the AU shell only maps
AudioUnit callbacks (`Render`, `AllocateRenderResources`, parameter tree) to
the bridge.

`TODO(Phase 5 native)`: requires macOS CoreAudio/AudioToolbox; expose
`kAudioUnitProperty_Latency`, automation via `AUParameterTree`.

The DAW host simulator (`src/plugins/vst/hostSimulator.ts`) exercises the
same `ScenePlugin` core the AU shell will embed.
