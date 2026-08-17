#!/usr/bin/env python3
"""Differentiable AudioGS trainer (experiment 0002).

A PyTorch trainer that reproduces the ENTRO ATMOS splat-field render model in
gradient form and refines the per-splat opacity (optionally the SH
coefficients) so the reconstructed broadband (1 kHz) energy matches the
sampled probe energies.

This is the PyTorch counterpart of the TypeScript solver path:

  * `src/core/acoustic_engine/solvers/splatField.ts` (render)
  * `src/tools/dataset/calibration.ts` (the 0003 analytic least-squares fit)
  * `src/core/sh/sh.ts` (the real spherical-harmonics basis)

The render model (broadband, 1 kHz band) for probe p and splat s is:

    dir_sp  = (splat.pos - probe.pos) / d          (d = |splat.pos - probe.pos|)
    theta   = acos(dir.z),  phi = atan2(dir.y, dir.x)
    q_sp    = max(0, 4*pi * sum_i c_si * Y_i(theta, phi))
    w_sp    = exp(-d^2 / (2*sigma_s^2)),  sigma_s = max(scale_s)
    y_p     = sum_s alpha_s * w_sp * q_sp / sum_j w_jp

matching `calibration.ts`/`splatField.ts` exactly, including the degenerate
d == 0 convention (the TS code uses `distance || 1`, which maps to
theta = 0, phi = 0).

Input field note: `examples/shoebox.splats.field.json` is a 4-analysis-band
field (bandShCoefficients 4x16 + bandEnergies 4). The trainer operates on the
broadband (1 kHz) channel, which is what the 0003 baseline and the
`calibrationErrorDb` metric (bandIndex 1) measure:

    broadband opacity alpha_s = opacity_s * bandEnergies_s[1]
    broadband pattern c_si    = shCoefficients_s  (= bandShCoefficients_s[1])

The emitted field is therefore a *broadband* splat field in the same
`SerializedSplatField` JSON schema (the optional per-band fields are omitted
because the trained model is broadband). It round-trips through the TS
`parseSplatField` loader unchanged in contract.

Usage:

    python3 src/tools/dataset/training/train_audiogs.py \
        --field examples/shoebox.splats.field.json \
        --samples examples/shoebox.splats.samples.json \
        --out /tmp/audioGS_optimized.field.json \
        --steps 400 --seed 42
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import torch

FOUR_PI = 4.0 * math.pi
EPS = 1e-9
LOG_ALPHA_FLOOR = 1e-12  # floor for exp(theta) when alpha_init == 0


# --------------------------------------------------------------------------- #
# Spherical harmonics (orthonormal real basis, NO Condon-Shortley phase).
# Mirrors `src/core/sh/sh.ts` `shEvaluateBasis` exactly.
# --------------------------------------------------------------------------- #

def sh_basis(theta: torch.Tensor, phi: torch.Tensor, band_count: int) -> torch.Tensor:
    """Evaluate all real SH basis functions at (theta, phi).

    Conventions (identical to the TS core):
      * orthonormal real basis, associated Legendre WITHOUT the CS phase;
      * band index i = l(l+1) + m for m in [-l, l];
      * theta = polar angle (0 = +z), phi = azimuth.

    Args:
        theta: tensor of any shape, polar angle in [0, pi].
        phi: tensor of the same shape, azimuth.
        band_count: number of SH bands (l = 0 .. band_count-1).

    Returns:
        Tensor of shape (*theta.shape, band_count**2).
    """
    cos_t = torch.cos(theta)
    sin_t = torch.sin(theta)
    size = band_count * band_count
    out = torch.zeros(theta.shape + (size,), dtype=theta.dtype, device=theta.device)

    max_fact = 2 * max(1, band_count - 1)
    fact = torch.ones(max_fact + 1, dtype=torch.float64, device=theta.device)
    for i in range(1, max_fact + 1):
        fact[i] = fact[i - 1] * i

    # Associated Legendre polynomials WITHOUT the Condon-Shortley phase:
    #   P_l^l = (2l-1) sin(theta) P_{l-1}^{l-1}
    #   P_l^m = ((2l-1) cos(theta) P_{l-1}^m - (l+m-1) P_{l-2}^m) / (l-m)
    # with P_{l-2}^m = 0 when m > l-2.
    p: list[list[torch.Tensor]] = [[torch.ones_like(theta)]]
    for l in range(1, band_count):
        row: list[torch.Tensor | None] = [None] * (l + 1)
        row[l] = (2 * l - 1) * sin_t * p[l - 1][l - 1]
        for m in range(l):
            lower = p[l - 2][m] if m <= l - 2 else 0.0
            row[m] = (
                (2 * l - 1) * cos_t * p[l - 1][m] - (l + m - 1) * lower
            ) / (l - m)
        p.append(row)  # type: ignore[arg-type]

    for l in range(band_count):
        base = l * (l + 1)
        norm = math.sqrt((2 * l + 1) / FOUR_PI)
        out[..., base] = norm * p[l][0]
        for m in range(1, l + 1):
            n = norm * math.sqrt(2.0 * float(fact[l - m]) / float(fact[l + m]))
            radial = p[l][m]
            out[..., base + m] = n * radial * torch.cos(m * phi)
            out[..., base - m] = n * radial * torch.sin(m * phi)
    return out


# --------------------------------------------------------------------------- #
# Render model (broadband, matches the TS solver).
# --------------------------------------------------------------------------- #

def directions_to_spherical(
    displacement: torch.Tensor, dist: torch.Tensor
) -> tuple[torch.Tensor, torch.Tensor]:
    """Map splat->probe displacements to (theta, phi) using the TS convention.

    The TS core goes azimuth = atan2(dx, dz), elevation = asin(dy / d) and
    then doaToSpherical(...), which is equivalent to theta = acos(dz / d),
    phi = atan2(dy / d, dx / d) for d > 0 and to (theta, phi) = (0, 0) for
    d == 0 (`distance || 1`). We reproduce the elevation/azimuth path to get
    that degenerate convention exactly.
    """
    dist_safe = torch.clamp(dist, min=1.0)
    az = torch.atan2(displacement[..., 0], displacement[..., 2])
    el = torch.asin(torch.clamp(displacement[..., 1] / dist_safe, -1.0, 1.0))
    x = torch.sin(az) * torch.cos(el)
    y = torch.sin(el)
    z = torch.cos(az) * torch.cos(el)
    theta = torch.acos(torch.clamp(z, -1.0, 1.0))
    phi = torch.atan2(y, x)
    return theta, phi


def render_energy(
    alpha: torch.Tensor,
    shc: torch.Tensor,
    splat_positions: torch.Tensor,
    splat_scales: torch.Tensor,
    probe_positions: torch.Tensor,
    band_count: int,
) -> torch.Tensor:
    """Broadband predicted energy y_p at every probe.

    alpha: (N,) effective broadband opacity (>= 0).
    shc: (N, band_count**2) broadband SH coefficients.
    splat_positions: (N, 3). splat_scales: (N, 3). probe_positions: (M, 3).
    Returns y of shape (M,).
    """
    displacement = splat_positions[None, :, :] - probe_positions[:, None, :]  # (M,N,3)
    dist = torch.sqrt((displacement**2).sum(dim=-1))  # (M,N)
    theta, phi = directions_to_spherical(displacement, dist)
    y_basis = sh_basis(theta, phi, band_count)  # (M,N,S)

    # q_sp = max(0, 4*pi * sum_i c_si Y_i(dir))   (M,N)
    q = torch.clamp(FOUR_PI * torch.einsum("ni,mni->mn", shc, y_basis), min=0.0)

    sigma = splat_scales.max(dim=1).values  # (N,)
    w = torch.exp(-(dist**2) / (2.0 * sigma[None, :] ** 2))  # (M,N)
    denom = w.sum(dim=1)  # (M,)
    y = (alpha[None, :] * q * w).sum(dim=1) / denom
    return y


# --------------------------------------------------------------------------- #
# Metrics.
# --------------------------------------------------------------------------- #

def db_errors(y: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    """Per-probe |10 log10(y / target)| for targets > 0 (the TS metric)."""
    mask = target > 0
    return torch.abs(10.0 * torch.log10(y[mask] / target[mask]))


def db_mse(y: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    """Mean squared error in the dB domain (the training loss)."""
    pred_db = 10.0 * torch.log10(y + EPS)
    tgt_db = 10.0 * torch.log10(target + EPS)
    return ((pred_db - tgt_db) ** 2).mean()


# --------------------------------------------------------------------------- #
# IO.
# --------------------------------------------------------------------------- #

def load_field(path: str) -> dict:
    with open(path) as f:
        data = json.load(f)
    splats = data["splats"]
    n = len(splats)
    band_count = int(data["bandCount"])
    positions = np.asarray([s["position"] for s in splats], dtype=np.float32)
    scales = np.asarray([s["scale"] for s in splats], dtype=np.float32)
    rotations = np.asarray([s["rotation"] for s in splats], dtype=np.float32)
    opacity = np.asarray([s["opacity"] for s in splats], dtype=np.float32)
    shc = np.asarray([s["shCoefficients"] for s in splats], dtype=np.float32)
    if shc.shape != (n, band_count * band_count):
        raise ValueError(
            f"field '{path}': {n} splats, bandCount {band_count} but "
            f"shCoefficients shape {shc.shape}"
        )
    band_energies = None
    if n and "bandEnergies" in splats[0]:
        band_energies = np.asarray([s["bandEnergies"] for s in splats], dtype=np.float32)
    return {
        "schema_version": data["schemaVersion"],
        "band_count": band_count,
        "positions": positions,
        "scales": scales,
        "rotations": rotations,
        "opacity": opacity,
        "shc": shc,
        "band_energies": band_energies,
    }


def load_samples(path: str) -> tuple[np.ndarray, np.ndarray]:
    with open(path) as f:
        data = json.load(f)
    probes = data["probes"]
    positions = np.asarray(
        [[p["position"]["x"], p["position"]["y"], p["position"]["z"]] for p in probes],
        dtype=np.float32,
    )
    energy = np.asarray([p["energy"] for p in probes], dtype=np.float32)
    return positions, energy


def write_field(path: str, field: dict, alpha: np.ndarray, shc: np.ndarray) -> None:
    """Write a broadband splat field in the SerializedSplatField JSON schema."""
    n = alpha.shape[0]
    splats = []
    for s in range(n):
        splats.append(
            {
                "position": field["positions"][s].tolist(),
                "scale": field["scales"][s].tolist(),
                "rotation": field["rotations"][s].tolist(),
                "opacity": float(alpha[s]),
                "shCoefficients": [float(v) for v in shc[s]],
            }
        )
    out = {
        "schemaVersion": field["schema_version"],
        "bandCount": field["band_count"],
        "splats": splats,
    }
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")


# --------------------------------------------------------------------------- #
# Main.
# --------------------------------------------------------------------------- #

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Differentiable AudioGS trainer (0002)")
    p.add_argument("--field", required=True, help="input splat field JSON")
    p.add_argument("--samples", required=True, help="probe samples JSON (ground truth)")
    p.add_argument("--out", required=True, help="optimized field JSON output path")
    p.add_argument("--steps", type=int, default=400, help="Adam steps")
    p.add_argument("--seed", type=int, default=42, help="RNG seed")
    p.add_argument("--lr", type=float, default=1e-2, help="Adam LR for log-opacity")
    p.add_argument("--sh-lr", type=float, default=1e-3, help="Adam LR for SH coeffs")
    p.add_argument(
        "--train-sh",
        action="store_true",
        help="also optimize the SH coefficients (opacity-only by default)",
    )
    p.add_argument(
        "--device",
        default="cpu",
        help="torch device (cpu is fine for 60 splats)",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    device = torch.device(args.device)

    field = load_field(args.field)
    probe_positions_np, target_np = load_samples(args.samples)

    n = field["positions"].shape[0]
    band_count = field["band_count"]

    # Broadband (1 kHz) channel: per-band fields carry bandEnergies; the
    # broadband opacity of splat s is opacity_s * bandEnergies_s[1].
    if field["band_energies"] is not None:
        alpha_init_np = field["opacity"] * field["band_energies"][:, 1]
        init_note = "alpha0 = opacity * bandEnergies[1]  (broadband 1 kHz channel of the 4-band field)"
    else:
        alpha_init_np = field["opacity"]
        init_note = "alpha0 = opacity  (broadband field)"

    # Tensors.
    splat_positions = torch.from_numpy(field["positions"]).to(device)
    splat_scales = torch.from_numpy(field["scales"]).to(device)
    probe_positions = torch.from_numpy(probe_positions_np).to(device)
    target = torch.from_numpy(target_np).to(device)
    shc_init = torch.from_numpy(field["shc"]).to(device)
    alpha_init = torch.from_numpy(np.clip(alpha_init_np, LOG_ALPHA_FLOOR, None)).to(device)

    # Trainable parameters.
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    theta = torch.nn.Parameter(torch.log(alpha_init).clone())
    param_groups: list[dict] = [{"params": [theta], "lr": args.lr}]
    shc_param: torch.nn.Parameter | None = None
    if args.train_sh:
        shc_param = torch.nn.Parameter(shc_init.clone())
        param_groups.append({"params": [shc_param], "lr": args.sh_lr})
    optimizer = torch.optim.Adam(param_groups)

    def alpha() -> torch.Tensor:
        return torch.exp(theta)

    def coefficients() -> torch.Tensor:
        return shc_param if shc_param is not None else shc_init

    def evaluate() -> tuple[torch.Tensor, torch.Tensor]:
        y = render_energy(
            alpha(), coefficients(), splat_positions, splat_scales, probe_positions, band_count
        )
        return y, db_errors(y, target)

    with torch.no_grad():
        y_before, err_before = evaluate()
        print(f"field:  {n} splats, SH bandCount {band_count}, {probe_positions.shape[0]} probes")
        print(f"target: probe 'energy' (broadband 1 kHz); {init_note}")
        print(
            "BEFORE  mean |dB error| = %.4f   max |dB error| = %.4f"
            % (err_before.mean().item(), err_before.max().item())
        )
        print(
            "        alpha0 stats: min %.4f  max %.4f  mean %.4f  (zero: %d)"
            % (
                alpha_init_np.min(),
                alpha_init_np.max(),
                alpha_init_np.mean(),
                int((alpha_init_np <= LOG_ALPHA_FLOOR).sum()),
            )
        )

    # Train.
    loss0 = None
    for step in range(1, args.steps + 1):
        optimizer.zero_grad()
        y = render_energy(
            alpha(), coefficients(), splat_positions, splat_scales, probe_positions, band_count
        )
        loss = db_mse(y, target)
        if loss0 is None:
            loss0 = loss.item()
        loss.backward()
        optimizer.step()
        if step == 1 or step % 50 == 0 or step == args.steps:
            with torch.no_grad():
                _, err = evaluate()
                print(
                    f"step {step:4d}/{args.steps}: loss(dB^2) = {loss.item():.6f}  "
                    f"mean |dB| = {err.mean().item():.4f}  max |dB| = {err.max().item():.4f}"
                )

    # Report.
    with torch.no_grad():
        alpha_final = alpha().detach().cpu().numpy()
        shc_final = coefficients().detach().cpu().numpy()
        y_after, err_after = evaluate()
        mean_before = err_before.mean().item()
        max_before = err_before.max().item()
        mean_after = err_after.mean().item()
        max_after = err_after.max().item()
        print(
            "AFTER   mean |dB error| = %.4f   max |dB error| = %.4f"
            % (mean_after, max_after)
        )
        print(
            "        alpha stats: min %.4f  max %.4f  mean %.4f  (zero: %d)"
            % (
                alpha_final.min(),
                alpha_final.max(),
                alpha_final.mean(),
                int((alpha_final <= LOG_ALPHA_FLOOR).sum()),
            )
        )
        print(
            "SUMMARY before %.4f dB -> after %.4f dB (max %.4f -> %.4f), "
            "loss %.6f -> %.6f dB^2"
            % (mean_before, mean_after, max_before, max_after, loss0, loss.item())
        )

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    write_field(args.out, field, alpha_final, shc_final)
    print(f"wrote optimized field -> {args.out}")


if __name__ == "__main__":
    main()
