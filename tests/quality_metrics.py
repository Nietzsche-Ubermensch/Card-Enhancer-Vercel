#!/usr/bin/env python3
"""
Quality metrics for CI pipeline validation.

Computes:
  - Resolution (input vs output)
  - File size
  - Upscale ratio achieved
  - BRISQUE-style sharpness proxy (Laplacian variance)
  - Mean pixel intensity (detect black/white failures)
  - Color channel statistics
  - Processing time (passed in via CLI)

Outputs a Markdown summary suitable for GitHub Actions $GITHUB_STEP_SUMMARY.

Usage:
    python tests/quality_metrics.py \
        --input  tests/fixtures/test_card.png \
        --output tests/fixtures/output_card.png \
        --time   12.34 \
        [--summary-file /path/to/summary.md]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


# --------------------------------------------------------------------------- #
#  Metrics
# --------------------------------------------------------------------------- #

def compute_metrics(input_path: str, output_path: str, elapsed_sec: float) -> dict:
    """Compute all quality metrics and return as a dict."""
    inp = Path(input_path)
    out = Path(output_path)

    if not inp.exists():
        raise FileNotFoundError(f"Input not found: {inp}")
    if not out.exists():
        raise FileNotFoundError(f"Output not found: {out}")

    img_in = Image.open(str(inp))
    img_out = Image.open(str(out))

    in_w, in_h = img_in.size
    out_w, out_h = img_out.size

    in_size = inp.stat().st_size
    out_size = out.stat().st_size

    # Laplacian variance — higher = sharper image (proxy for BRISQUE)
    cv_out = cv2.cvtColor(np.array(img_out), cv2.COLOR_RGB2GRAY)
    laplacian_var = float(cv2.Laplacian(cv_out, cv2.CV_64F).var())

    # Mean pixel values per channel
    arr_out = np.array(img_out).astype(np.float64)
    mean_r = float(arr_out[:, :, 0].mean())
    mean_g = float(arr_out[:, :, 1].mean())
    mean_b = float(arr_out[:, :, 2].mean())
    mean_overall = float(arr_out.mean())

    # Upscale ratio
    area_ratio = (out_w * out_h) / max(in_w * in_h, 1)
    linear_ratio = (area_ratio ** 0.5)

    return {
        "input_resolution": f"{in_w}x{in_h}",
        "output_resolution": f"{out_w}x{out_h}",
        "input_file_size_kb": round(in_size / 1024, 1),
        "output_file_size_kb": round(out_size / 1024, 1),
        "upscale_ratio_linear": round(linear_ratio, 2),
        "upscale_ratio_area": round(area_ratio, 2),
        "sharpness_laplacian_var": round(laplacian_var, 2),
        "mean_pixel_intensity": round(mean_overall, 1),
        "mean_r": round(mean_r, 1),
        "mean_g": round(mean_g, 1),
        "mean_b": round(mean_b, 1),
        "processing_time_sec": round(elapsed_sec, 2),
    }


# --------------------------------------------------------------------------- #
#  Validation gates
# --------------------------------------------------------------------------- #

def validate(metrics: dict) -> list[str]:
    """Run basic sanity checks; return list of failure messages (empty = pass)."""
    failures = []

    # Output must be larger than input
    if metrics["upscale_ratio_linear"] < 1.5:
        failures.append(
            f"Upscale ratio too low: {metrics['upscale_ratio_linear']}x "
            f"(expected >= 1.5x)"
        )

    # Output shouldn't be all-black or all-white
    mean = metrics["mean_pixel_intensity"]
    if mean < 5:
        failures.append(f"Output appears all-black (mean intensity {mean})")
    if mean > 250:
        failures.append(f"Output appears all-white (mean intensity {mean})")

    # Sharpness sanity (extremely blurry output = likely broken)
    if metrics["sharpness_laplacian_var"] < 1.0:
        failures.append(
            f"Output extremely blurry (Laplacian var {metrics['sharpness_laplacian_var']})"
        )

    # File size sanity — output should exist and be non-trivial
    if metrics["output_file_size_kb"] < 1:
        failures.append(f"Output file too small: {metrics['output_file_size_kb']} KB")

    # Processing time sanity — warn if > 5 minutes
    if metrics["processing_time_sec"] > 300:
        failures.append(
            f"Processing took {metrics['processing_time_sec']:.0f}s (> 5 min)"
        )

    return failures


# --------------------------------------------------------------------------- #
#  Markdown summary
# --------------------------------------------------------------------------- #

def format_summary(metrics: dict, failures: list[str]) -> str:
    """Render metrics + validation as GitHub-flavoured Markdown."""
    status = "PASS ✅" if not failures else "FAIL ❌"

    lines = [
        "## Real-ESRGAN Pipeline — CI Results",
        "",
        f"**Status: {status}**",
        "",
        "### Metrics",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Input resolution | `{metrics['input_resolution']}` |",
        f"| Output resolution | `{metrics['output_resolution']}` |",
        f"| Input file size | `{metrics['input_file_size_kb']} KB` |",
        f"| Output file size | `{metrics['output_file_size_kb']} KB` |",
        f"| Upscale ratio (linear) | `{metrics['upscale_ratio_linear']}x` |",
        f"| Upscale ratio (area) | `{metrics['upscale_ratio_area']}x` |",
        f"| Sharpness (Laplacian var) | `{metrics['sharpness_laplacian_var']}` |",
        f"| Mean pixel intensity | `{metrics['mean_pixel_intensity']}` |",
        f"| Mean R / G / B | `{metrics['mean_r']}` / `{metrics['mean_g']}` / `{metrics['mean_b']}` |",
        f"| Processing time | `{metrics['processing_time_sec']}s` |",
        "",
    ]

    if failures:
        lines.append("### Validation Failures")
        lines.append("")
        for f in failures:
            lines.append(f"- ❌ {f}")
        lines.append("")
    else:
        lines.append("All quality gates passed.")
        lines.append("")

    return "\n".join(lines)


# --------------------------------------------------------------------------- #
#  CLI
# --------------------------------------------------------------------------- #

def main() -> None:
    parser = argparse.ArgumentParser(description="Compute image quality metrics")
    parser.add_argument("--input", "-i", required=True, help="Input image path")
    parser.add_argument("--output", "-o", required=True, help="Output image path")
    parser.add_argument("--time", "-t", type=float, default=0.0,
                        help="Processing time in seconds")
    parser.add_argument("--summary-file", "-s", default=None,
                        help="Write Markdown summary to this file")
    parser.add_argument("--json", action="store_true",
                        help="Also print metrics as JSON to stdout")
    args = parser.parse_args()

    metrics = compute_metrics(args.input, args.output, args.time)
    failures = validate(metrics)
    summary = format_summary(metrics, failures)

    print(summary)

    if args.json:
        print("\n--- JSON ---")
        print(json.dumps(metrics, indent=2))

    if args.summary_file:
        Path(args.summary_file).parent.mkdir(parents=True, exist_ok=True)
        Path(args.summary_file).write_text(summary)
        print(f"\nSummary written to {args.summary_file}")

    if failures:
        print(f"\n⚠️  {len(failures)} validation failure(s) — exiting with code 1")
        sys.exit(1)


if __name__ == "__main__":
    main()
