"""
Segmentation backend — SAM2 (default) or YOLO (CPU-friendly fallback).

Set SEGMENTER env var to choose:
  SEGMENTER=sam2   best quality, needs GPU/MPS (default)
  SEGMENTER=yolo   fast, CPU-friendly, good for development

SAM2 env vars:
  SAM2_CHECKPOINT   path to .pt file  (default: models/sam2.1_hiera_large.pt)
  SAM2_DEVICE       cpu | mps | cuda  (default: auto-detect)

YOLO env vars:
  YOLO_MODEL        model name or path (default: yolo11n.pt — nano, fastest)
                    other options: yolo11s.pt, yolo11m.pt, yolo11l.pt, yolo11x.pt
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

import torch
from PIL import Image

logger = logging.getLogger(__name__)

BACKEND = os.getenv("SEGMENTER", "sam2").lower()


# ── Shared types ──────────────────────────────────────────────────────────────

@dataclass
class Segment:
    """
    bbox: normalised (x, y, w, h) in [0, 1] — origin top-left
    area: normalised area in [0, 1]
    """
    bbox: tuple[float, float, float, float]
    area: float


# ── Device selection ──────────────────────────────────────────────────────────

def _select_device() -> str:
    override = os.getenv("SAM2_DEVICE", "").lower()
    if override in ("cpu", "cuda", "mps"):
        logger.info(f"Device override: {override}")
        return override
    if torch.cuda.is_available():
        return "cuda"
    elif torch.backends.mps.is_available():
        return "mps"
    return "cpu"


# ── SAM2 backend ──────────────────────────────────────────────────────────────

_sam2_generator = None


def _load_sam2() -> None:
    global _sam2_generator
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    from sam2.build_sam import build_sam2

    checkpoint = os.getenv("SAM2_CHECKPOINT", "models/sam2.1_hiera_large.pt")

    # Hydra resolves config names relative to pkg://sam2 — derive the correct
    # config from the checkpoint filename so they always stay in sync.
    _config_map = {
        "large":     "configs/sam2.1/sam2.1_hiera_l.yaml",
        "base_plus": "configs/sam2.1/sam2.1_hiera_b+.yaml",
        "small":     "configs/sam2.1/sam2.1_hiera_s.yaml",
        "tiny":      "configs/sam2.1/sam2.1_hiera_t.yaml",
    }
    ckpt_name = os.path.basename(checkpoint)
    config = next(
        (cfg for key, cfg in _config_map.items() if key in ckpt_name),
        _config_map["large"],  # fallback
    )

    device = _select_device()
    logger.info(f"SAM2 | device: {device} | checkpoint: {ckpt_name} | config: {config}")

    sam = build_sam2(config, checkpoint, device=device)
    _sam2_generator = SAM2AutomaticMaskGenerator(
        model=sam,
        points_per_side=64,              # was 32 — finer grid, catches small icons
        points_per_batch=16,             # keep memory under control
        pred_iou_thresh=0.80,            # was 0.88 — more permissive, keeps uncertain small masks
        stability_score_thresh=0.85,     # was 0.95 — same reason
        min_mask_region_area=64,         # was 256 — allow ~8×8px minimum regions
        # crop_n_layers=2,                 # was 1 — adds 4×4 crop pass for fine detail
        # crop_overlap_ratio=0.4,          # slightly more overlap for boundary symbols
        # crop_n_points_downscale_factor=2,
    )
    logger.info("SAM2 ready")


def _segment_sam2(img: Image.Image) -> list[Segment]:
    import numpy as np
    assert _sam2_generator is not None

    W, H = img.size
    logger.info(f"SAM2: generating masks for {W}x{H} image...")
    masks = _sam2_generator.generate(np.array(img.convert("RGB")))
    logger.info(f"SAM2: produced {len(masks)} masks")

    total = W * H
    segments = [
        Segment(
            bbox=(m["bbox"][0] / W, m["bbox"][1] / H,
                  m["bbox"][2] / W, m["bbox"][3] / H),
            area=m["area"] / total,
        )
        for m in masks
    ]
    return sorted(segments, key=lambda s: s.area, reverse=True)


# ── YOLO backend ──────────────────────────────────────────────────────────────

_yolo_model = None


def _load_yolo() -> None:
    global _yolo_model
    from ultralytics import YOLO, settings

    model_name = os.getenv("YOLO_MODEL", "yolo11n.pt")
    models_dir = os.path.abspath("models")
    os.makedirs(models_dir, exist_ok=True)
    settings.update({"weights_dir": models_dir})

    logger.info(f"Loading YOLO ({model_name})...")
    _yolo_model = YOLO(os.path.join(models_dir, model_name))
    logger.info("YOLO ready")


def _segment_yolo(img: Image.Image) -> list[Segment]:
    assert _yolo_model is not None

    W, H = img.size
    logger.info(f"YOLO: detecting objects in {W}x{H} image...")
    results = _yolo_model(img, verbose=False)
    boxes = results[0].boxes

    if boxes is None or len(boxes) == 0:
        logger.info("YOLO: no objects detected")
        return []

    segments = []
    for box in boxes.xyxy.tolist():
        x1, y1, x2, y2 = box
        w, h = x2 - x1, y2 - y1
        segments.append(Segment(
            bbox=(x1 / W, y1 / H, w / W, h / H),
            area=(w * h) / (W * H),
        ))

    logger.info(f"YOLO: detected {len(segments)} objects")
    return sorted(segments, key=lambda s: s.area, reverse=True)


# ── Public interface ──────────────────────────────────────────────────────────

def load() -> None:
    if BACKEND == "yolo":
        _load_yolo()
    else:
        _load_sam2()


def segment(img: Image.Image) -> list[Segment]:
    if BACKEND == "yolo":
        return _segment_yolo(img)
    else:
        return _segment_sam2(img)