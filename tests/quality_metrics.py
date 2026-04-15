"""Compute quality metrics for CI pipeline output."""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def laplacian_sharpness(path: str) -> float:
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return 0.0
    return float(cv2.Laplacian(img, cv2.CV_64F).var())


def mean_intensity(path: str) -> float:
    img = cv2.imread(path)
    if img is None:
        return 0.0
    return float(np.mean(img))


def file_size_kb(path: str) -> float:
    return Path(path).stat().st_size / 1024


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input",  required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--time",   default="n/a")
    ap.add_argument("--summary-file", default=None)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    inp = Image.open(args.input)
    out_path = Path(args.output)
    if not out_path.exists():
        print(f"ERROR: output file not found: {out_path}", file=sys.stderr)
        sys.exit(1)
    out = Image.open(str(out_path))

    upscale_w = out.size[0] / inp.size[0]
    upscale_h = out.size[1] / inp.size[1]
    sharpness = laplacian_sharpness(str(out_path))
    intensity  = mean_intensity(str(out_path))
    size_kb    = file_size_kb(str(out_path))

    # Quality gates
    gates = {
        "upscale_ratio >= 1.5x": min(upscale_w, upscale_h) >= 1.5,
        "not all-black (intensity > 5)": intensity > 5,
        "not all-white (intensity < 250)": intensity < 250,
        "sharpness > 10": sharpness > 10,
    }
    passed = all(gates.values())

    metrics = {
        "input_size":  f"{inp.size[0]}x{inp.size[1]}",
        "output_size": f"{out.size[0]}x{out.size[1]}",
        "upscale_w":   round(upscale_w, 2),
        "upscale_h":   round(upscale_h, 2),
        "sharpness":   round(sharpness, 1),
        "intensity":   round(intensity, 1),
        "size_kb":     round(size_kb, 1),
        "time_s":      args.time,
        "gates":       gates,
        "passed":      passed,
    }

    if args.json:
        print(json.dumps(metrics, indent=2))

    md = [
        "## Real-ESRGAN Pipeline — Quality Metrics",
        "",
        f"| Metric | Value |",
        f"|--------|-------|" ,
        f"| Input size  | {metrics['input_size']} |",
        f"| Output size | {metrics['output_size']} |",
        f"| Upscale W   | {metrics['upscale_w']}x |",
        f"| Upscale H   | {metrics['upscale_h']}x |",
        f"| Sharpness   | {metrics['sharpness']} |",
        f"| Intensity   | {metrics['intensity']} |",
        f"| File size   | {metrics['size_kb']} KB |",
        f"| Time        | {metrics['time_s']}s |",
        "",
        "### Quality Gates",
        "",
    ]
    for gate, ok in gates.items():
        md.append(f"- {'✅' if ok else '❌'} {gate}")
    md += ["", f"**Overall: {'✅ PASSED' if passed else '❌ FAILED'}**"]

    summary = "\n".join(md)
    if args.summary_file:
        Path(args.summary_file).write_text(summary)
    print(summary)

    if not passed:
        sys.exit(1)


if __name__ == "__main__":
    main()
