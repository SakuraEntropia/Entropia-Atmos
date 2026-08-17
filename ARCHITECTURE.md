# ENTRO ATMOS Architecture


## High Level


Application Layer

|

Engine Layer

|

Scene Layer

|

Data Layer



## Data Layer

Responsibilities:

- AudioGS storage
- SH compression
- Streaming


## Scene Layer

Audio-USD defines:

- Emitter
- Listener
- Material
- Environment


## Acoustic Engine


Components:

### Geometry Processing

Handles:

- Occlusion
- Diffraction


### Ray Tracing

Handles:

- Early reflection
- Sound propagation


### Reverb System

Handles:

- Late reverberation
- Room response


## Rendering Engine


Components:

- Acoustic-BRDF
- HRTF convolution
- DSP processing


## Plugin Layer

Targets:

- VST3
- AU
- DAW integration
