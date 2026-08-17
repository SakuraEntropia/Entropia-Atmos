from pathlib import Path


ROOT = Path(__file__).resolve().parent


DOCS = {
    "SPEC.md": """
# ENTRO ATMOS Specification

## Project Overview

ENTRO ATMOS is an AI + Computer Graphics inspired spatial audio engine.

The project aims to create an open spatial audio production system based on:

- Audio Gaussian Splatting (AudioGS)
- Audio-USD scene representation
- Acoustic simulation
- Binaural rendering


## Core Problem

Traditional spatial audio workflows suffer from:

- High production complexity
- Expensive rendering pipelines
- Closed ecosystem
- Lack of physically-based acoustic workflows


## Goals

ENTRO ATMOS provides:

1. Acoustic scene representation
2. Physics-based sound simulation
3. Neural acoustic reconstruction
4. Real-time spatial rendering


## Core Modules


### Audio Scene

Responsible for:

- Emitter
- Listener
- Environment
- Acoustic material


### AudioGS Pipeline

Input:

Audio spatial dataset


Pipeline:

Dataset
Voxelization
AudioGS Training
Compression
Streaming


Output:

Neural acoustic scene


### Acoustic Simulation

Support:

- Reflection
- Occlusion
- Diffraction
- Reverberation


### Rendering

Output:

Binaural audio


Technology:

- HRTF
- Acoustic-BRDF
- DSP Graph


## Product Vision

Create:

"Blender for Spatial Audio"

"""
,

    "README.md": """
# ENTRO ATMOS

AI + Graphics Inspired Spatial Audio Engine


## Introduction

ENTRO ATMOS is an open spatial audio framework.

Inspired by computer graphics pipelines,
it applies scene representation and physical simulation
to acoustic computing.


## Architecture

Input

Audio Dataset

↓

AudioGS Processing

↓

Audio-USD Scene

↓

Acoustic Simulation

↓

Binaural Renderer

↓

Audio Output


## Workspace


### Bake

AudioGS training and preprocessing.


### Layout

Audio-USD scene construction.


### Shading

Acoustic material definition.


### Simulation

Physical acoustic solving.


### Delivery

Plugin ecosystem.


## Target Platforms

- Standalone Application
- VST3 Plugin
- AU Plugin


"""
,

    "ARCHITECTURE.md": """
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


"""
,

    "ROADMAP.md": """
# ENTRO ATMOS Roadmap


# Phase 0 Research

Goal:

Build theoretical foundation.


Tasks:

- Study AudioGS
- Define Audio-USD
- Research acoustic rendering


# Phase 1 MVP

Goal:

Offline spatial audio renderer.


Features:

- Scene format
- Basic simulation
- HRTF output


# Phase 2 AudioGS Integration

Tasks:

- Dataset pipeline
- Gaussian acoustic field
- Compression


# Phase 3 Real Time Engine

Tasks:

- GPU acceleration
- BVH optimization
- Streaming


# Phase 4 Creator Application

Features:

- GUI
- Scene editor
- Acoustic nodes


# Phase 5 Ecosystem

Features:

- VST3
- AU
- DAW integration


"""
}


def generate():
    for filename, content in DOCS.items():
        path = ROOT / filename
        path.write_text(content.strip() + "\n", encoding="utf-8")
        print("[Generated]", filename)


if __name__ == "__main__":
    generate()
    print("ENTRO ATMOS documentation generated.")
