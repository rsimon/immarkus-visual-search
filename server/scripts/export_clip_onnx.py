#!/usr/bin/env python3
"""
Export the CLIP ViT-B/32 visual encoder to ONNX format.
Run from the server/ directory:

    uv run python scripts/export_clip_onnx.py

Outputs (relative to project root, next to search.html):
    ../clip-vit-b-32-visual.onnx        — full precision (~350MB)
    ../clip-vit-b-32-visual-int8.onnx   — quantised (~90MB, optional)
"""

import argparse
import sys
from pathlib import Path

import open_clip
import torch

ROOT = Path(__file__).parent.parent.parent  # similarity-search/


def export(output: Path) -> None:
    print("Loading CLIP ViT-B/32 (openai weights)…")
    model, _, _ = open_clip.create_model_and_transforms("ViT-B-32-quickgelu", pretrained="openai")
    model.eval()

    dummy = torch.zeros(1, 3, 224, 224)

    print(f"Exporting to {output}…")
    torch.onnx.export(
        model.visual,
        dummy,
        str(output),
        input_names=["pixel_values"],
        output_names=["embeddings"],
        dynamic_axes={
            "pixel_values": {0: "batch"},
            "embeddings":   {0: "batch"},
        },
        opset_version=14,
        dynamo=False,
    )
    size_mb = output.stat().st_size / 1_048_576
    print(f"  Done — {size_mb:.0f} MB")


def quantise(source: Path, output: Path) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    print(f"Quantising to {output}…")
    quantize_dynamic(str(source), str(output), weight_type=QuantType.QUInt8)
    size_mb = output.stat().st_size / 1_048_576
    print(f"  Done — {size_mb:.0f} MB")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export CLIP ViT-B/32 visual encoder to ONNX")
    parser.add_argument(
        "--quantise", "-q",
        action="store_true",
        help="Also produce a quantised int8 version (~90MB)",
    )
    parser.add_argument(
        "--quantise-only",
        action="store_true",
        help="Skip full export, only quantise an existing .onnx file",
    )
    args = parser.parse_args()

    full_path = ROOT / "test/clip-vit-b-32-visual.onnx"
    int8_path = ROOT / "test/clip-vit-b-32-visual-int8.onnx"

    if not args.quantise_only:
        export(full_path)

    if args.quantise or args.quantise_only:
        if not full_path.exists():
            print(f"Error: {full_path} not found — run without --quantise-only first.", file=sys.stderr)
            sys.exit(1)
        quantise(full_path, int8_path)

    print("\nAll done. Place the .onnx file next to search.html.")


if __name__ == "__main__":
    main()