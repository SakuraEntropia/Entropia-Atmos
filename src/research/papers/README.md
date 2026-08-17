# Research Papers — Reading List

Curated literature for ENTRO ATMOS. Phase 0 pins the canonical list; entries
marked `done` carry a short note in the linked experiment.

Status legend: `todo` (not started) · `reading` (in progress) · `done` (note written).

## AudioGS & Neural Acoustic Fields

| Paper | Why it matters | Status |
|---|---|---|
| Bi, Zhong et al. — [AudioGS: Spectrogram-Based Audio Gaussian Splatting for Sound Field Reconstruction](https://arxiv.org/abs/2604.08967) | The canonical AudioGS reference; the splat-field representation we adopt. | `reading` |
| Huang et al. — [AV-GS: Learning Material and Geometry Aware Priors for Novel View Acoustic Synthesis](https://arxiv.org/abs/2406.08920) | Material/geometry-aware acoustic synthesis; informs hybrid geometric+neural scenes. | `todo` |
| Luo et al. — [Learning Neural Acoustic Fields](https://arxiv.org/abs/2204.00628) (NeurIPS 2022) | Coordinate-network sound fields; baseline for AudioGS comparisons. | `todo` |

## Graphics Foundations (the metaphor's origin)

| Paper | Why it matters | Status |
|---|---|---|
| Kajiya — *The Rendering Equation*, SIGGRAPH 1986 | Source of the BRDF/path-tracing metaphor our Acoustic-BRDF borrows. | `todo` |
| Kerbl et al. — [3D Gaussian Splatting for Real-Time Radiance Field Rendering](https://arxiv.org/abs/2308.04079) (SIGGRAPH 2023) | The representation AudioGS ports to sound fields. | `reading` |
| Niedermayr et al. — [Compact 3D Gaussian Representation for Radiance Field](https://arxiv.org/abs/2311.13681) (CVPR 2024) | Basis for our SH compression and LOD design. | `todo` |

## Room Acoustics & Simulation

| Paper | Why it matters | Status |
|---|---|---|
| Savioja & Svensson — *Overview of Geometrical Room Acoustic Modeling Techniques*, JASA 138(2), 2015 | Survey for the Phase 1 geometric solver selection. | `todo` |
| Jot et al. — *Analysis and Synthesis of Room Reverberation Based on a Statistical Time-Frequency Model*, AES 1997 | Basis of the late-field estimation/synthesis stage. | `todo` |
| Mehra et al. — *Wave-based Sound Propagation in Large Open Scenes using an Equivalent Source Formulation*, ACM TOG 32(4), 2013 | Reference for wave-solver plugin ambitions. | `todo` |
| Bilbao — *Modeling of Complex Geometries and Boundary Conditions in Finite Difference/Finite Volume Time Domain Room Acoustics Simulation*, IEEE TASLP 21(7), 2013 | FDTD reference for wave-solver plugin ambitions. | `todo` |
| Scheibler, Bezzam, Dokmanić — *Pyroomacoustics: A Python Package for Audio Room Simulation and Array Processing Algorithms*, ICASSP 2018 | Reference implementation for benchmark IR generation. | `todo` |

## Binaural Rendering & HRTF

| Paper | Why it matters | Status |
|---|---|---|
| Xie — *Head-Related Transfer Function and Virtual Auditory Display* (book, 2nd ed.) | Standard HRTF theory for the renderer contract. | `todo` |
| Begault — *3-D Sound for Virtual Reality and Multimedia* (book) | Applied binaural practice; informs the creator UX. | `todo` |

## Books

| Book | Why it matters | Status |
|---|---|---|
| Kuttruff — *Room Acoustics* | Canonical room-acoustic theory behind the reverb model. | `todo` |
| Vorländer — *Auralization: Fundamentals of Acoustics, Modelling, Simulation, Algorithms and Acoustic Virtual Reality* | The auralization pipeline we implement end to end. | `todo` |

## Adding a paper

1. Add a row under the matching section (create one if needed).
2. One line on *why it matters to ENTRO ATMOS* — not a generic abstract.
3. When finished, flip status to `done` and link the experiment that uses it
   (see `../experiments/`).
