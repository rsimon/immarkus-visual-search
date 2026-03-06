"""
Segmentation using SAM2 automatic mask generation.

Model: SAM2.1 Large (default) — best quality, recommended for server-side
batch indexing where throughput matters less than segment quality.

Checkpoint download:
  https://github.com/facebookresearch/sam2#model-checkpoints

Environment variables:
  SAM2_CHECKPOINT   path to .pt file  (default: models/sam2.1_hiera_large.pt)
  SAM2_CONFIG       path to yaml      (default: configs/sam2.1/sam2.1_hiera_l.yaml)
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np
import torch
from PIL import Image
from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
from sam2.build_sam import build_sam2

_generator: SAM2AutomaticMaskGenerator | None = None


@dataclass
class Segment:
    """
    A single detected segment.
    bbox: normalised (x, y, w, h) in [0, 1] — origin top-left
    area: normalised area (mask pixels / total pixels)
    """
    bbox: tuple[float, float, float, float]
    area: float


def load() -> None:
    """Load SAM2 into memory. Call once at server startup."""
    global _generator

    checkpoint = os.getenv("SAM2_CHECKPOINT", "models/sam2.1_hiera_large.pt")
    config = os.getenv("SAM2_CONFIG", "configs/sam2.1/sam2.1_hiera_l.yaml")
    device = "cuda" if torch.cuda.is_available() else "cpu"

    sam = build_sam2(config, checkpoint, device=device)

    _generator = SAM2AutomaticMaskGenerator(
        model=sam,
        points_per_side=32,         # 32 = SAM2 default; increase for denser coverage
        pred_iou_thresh=0.88,
        stability_score_thresh=0.95,
        min_mask_region_area=256,   # skip sub-pixel noise
    )

    print(f"[segmenter] SAM2.1 Large loaded ({checkpoint}) on {device}")


def segment(img: Image.Image) -> list[Segment]:
    """
    Auto-generate segments for a PIL image.
    Returns segments sorted by area descending (largest regions first).
    """
    assert _generator is not None, "Call segmenter.load() before segment()"

    arr = np.array(img.convert("RGB"))
    W, H = img.size
    total = W * H

    masks = _generator.generate(arr)

    segments = [
        Segment(
            bbox=(
                m["bbox"][0] / W,   # x
                m["bbox"][1] / H,   # y
                m["bbox"][2] / W,   # w
                m["bbox"][3] / H,   # h
            ),
            area=m["area"] / total,
        )
        for m in masks
    ]

    return sorted(segments, key=lambda s: s.area, reverse=True)