"""
Segmentation backend.

Set SEGMENTER env var to choose:
  SEGMENTER=sam2      best quality, needs GPU (default)
  SEGMENTER=fastsam   class-agnostic, CPU-viable, balanced fallback
  SEGMENTER=yoloe     fastest, CPU-friendly, open-vocabulary dev fallback

SAM2 env vars:
  SAM2_CHECKPOINT   path to .pt file  (default: models/sam2.1_hiera_large.pt)
  SAM2_DEVICE       cpu | mps | cuda  (default: auto-detect)

FastSAM env vars:
  FASTSAM_MODEL     model filename    (default: FastSAM-s.pt)
                    alt: FastSAM-x.pt — better quality but higher memory use
  FASTSAM_DEVICE    cpu | mps | cuda  (default: auto-detect)
  FASTSAM_CONF      confidence thresh (default: 0.1  — lower = more segments)
  FASTSAM_IOU       NMS IOU thresh    (default: 0.9  — higher = less merging)
  FASTSAM_IMGSZ     inference size px (default: 1024 — must be multiple of 32;
                    higher catches smaller objects but uses more memory;
                    FastSAM-x OOMs at 1536+ on machines with limited RAM)

YOLOE env vars:
  YOLOE_MODEL       model filename    (default: yoloe-11l-seg-pf.pt — prompt-free large)
                    options: yoloe-11s-seg-pf.pt, yoloe-11m-seg-pf.pt, yoloe-11l-seg-pf.pt
  YOLOE_DEVICE      cpu | mps | cuda  (default: auto-detect)
  YOLOE_CONF        confidence thresh (default: 0.005 — very low; catches small/unusual objects)
  YOLOE_IOU         NMS IOU thresh    (default: 0.3  — keep distinct nearby objects separate)
  YOLOE_IMGSZ       inference size px (default: 1280 — must be multiple of 32;
                    higher catches smaller objects; 1920 needs plenty of RAM)
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


# ── Device helpers ────────────────────────────────────────────────────────────

def _select_device(env_var: str) -> str:
    override = os.getenv(env_var, "").lower()
    if override in ("cpu", "cuda", "mps"):
        logger.info(f"Device override ({env_var}): {override}")
        return override
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


# ── SAM2 backend ──────────────────────────────────────────────────────────────

_sam2_generator = None

def _load_sam2() -> None:
    global _sam2_generator
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    from sam2.build_sam import build_sam2

    checkpoint = os.getenv("SAM2_CHECKPOINT", "models/sam2.1_hiera_large.pt")

    _config_map = {
        "large":     "configs/sam2.1/sam2.1_hiera_l.yaml",
        "base_plus": "configs/sam2.1/sam2.1_hiera_b+.yaml",
        "small":     "configs/sam2.1/sam2.1_hiera_s.yaml",
        "tiny":      "configs/sam2.1/sam2.1_hiera_t.yaml",
    }
    ckpt_name = os.path.basename(checkpoint)
    config = next(
        (cfg for key, cfg in _config_map.items() if key in ckpt_name),
        _config_map["large"],
    )

    device = _select_device("SAM2_DEVICE")
    logger.info(f"SAM2 | device: {device} | checkpoint: {ckpt_name} | config: {config}")

    sam = build_sam2(config, checkpoint, device=device)
    _sam2_generator = SAM2AutomaticMaskGenerator(
        model=sam,
        points_per_side=32,
        points_per_batch=16,
        pred_iou_thresh=0.88,
        stability_score_thresh=0.95,
        min_mask_region_area=256,
        crop_n_layers=1,
        crop_n_points_downscale_factor=2,
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


# ── FastSAM backend ───────────────────────────────────────────────────────────
#
# FastSAM is class-agnostic — finds arbitrary regions without a category
# vocabulary. Tuning for more segments:
#   FASTSAM_CONF  ↓ lower  → keeps lower-confidence regions
#   FASTSAM_IOU   ↑ higher → less aggressive NMS merging
#   FASTSAM_IMGSZ ↑ higher → more detail, catches smaller regions (more memory)
#
# FastSAM-s is the default — FastSAM-x OOMs at imgsz=1024+ on Mac.

_fastsam_model = None

def _load_fastsam() -> None:
    global _fastsam_model
    from ultralytics import FastSAM

    model_name = os.getenv("FASTSAM_MODEL", "FastSAM-s.pt")
    models_dir = os.path.abspath("models")
    os.makedirs(models_dir, exist_ok=True)

    device = _select_device("FASTSAM_DEVICE")
    logger.info(f"FastSAM | device: {device} | model: {model_name}")

    _fastsam_model = FastSAM(os.path.join(models_dir, model_name))
    logger.info("FastSAM ready")


def _segment_fastsam(img: Image.Image) -> list[Segment]:
    assert _fastsam_model is not None

    W, H = img.size
    conf   = float(os.getenv("FASTSAM_CONF",  "0.01"))
    iou    = float(os.getenv("FASTSAM_IOU",   "0.5"))
    imgsz  = int(os.getenv("FASTSAM_IMGSZ", "1280"))
    max_det = int(os.getenv("FASTSAM_MAX_DET", "800"))
    device = _select_device("FASTSAM_DEVICE")

    logger.info(f"FastSAM: segmenting {W}x{H} image (conf={conf}, iou={iou}, imgsz={imgsz})...")

    results = _fastsam_model.predict(
        img,
        device=device,
        retina_masks=False,
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        max_det=max_det,
        verbose=False,
    )

    segments = []
    total = W * H

    for result in results:
        if result.masks is None:
            continue
        import numpy as np
        for mask_tensor, box in zip(result.masks.data, result.boxes.xyxy.tolist()):
            x1, y1, x2, y2 = box
            w, h = x2 - x1, y2 - y1
            area = float(mask_tensor.cpu().numpy().sum())
            segments.append(Segment(
                bbox=(x1 / W, y1 / H, w / W, h / H),
                area=area / total,
            ))

    logger.info(f"FastSAM: produced {len(segments)} segments")
    return sorted(segments, key=lambda s: s.area, reverse=True)


# ── YOLOE backend ─────────────────────────────────────────────────────────────

_yoloe_model = None

def _load_yoloe() -> None:
    global _yoloe_model
    from ultralytics import YOLOE

    model_name = os.getenv("YOLOE_MODEL", "yoloe-11l-seg-pf.pt")
    models_dir = os.path.abspath("models")
    os.makedirs(models_dir, exist_ok=True)

    device = _select_device("YOLOE_DEVICE")
    logger.info(f"YOLOE | device: {device} | model: {model_name}")

    _yoloe_model = YOLOE(os.path.join(models_dir, model_name))
    logger.info("YOLOE ready")


def _segment_yoloe(img: Image.Image) -> list[Segment]:
    assert _yoloe_model is not None

    W, H = img.size
    conf   = float(os.getenv("YOLOE_CONF",  "0.005"))
    iou    = float(os.getenv("YOLOE_IOU",   "0.3"))
    imgsz  = int(os.getenv("YOLOE_IMGSZ", "1280"))  # 1920 if you have lots of memory!
    max_det = int(os.getenv("YOLOE_MAX_DET", "1000"))
    device = _select_device("YOLOE_DEVICE")

    logger.info(f"YOLOE: segmenting {W}x{H} image (conf={conf}, iou={iou}, imgsz={imgsz})...")

    results = _yoloe_model.predict(
        img,
        device=device,
        conf=conf,
        iou=iou,
        imgsz=imgsz,
        max_det=max_det,
        verbose=False,
    )

    segments = []
    total = W * H

    for result in results:
        if result.masks is None:
            # Fall back to bboxes if masks not available
            if result.boxes is not None:
                for box in result.boxes.xyxy.tolist():
                    x1, y1, x2, y2 = box
                    w, h = x2 - x1, y2 - y1
                    segments.append(Segment(
                        bbox=(x1 / W, y1 / H, w / W, h / H),
                        area=(w * h) / total,
                    ))
            continue

        for mask_tensor, box in zip(result.masks.data, result.boxes.xyxy.tolist()):
            x1, y1, x2, y2 = box
            w, h = x2 - x1, y2 - y1
            area = float(mask_tensor.cpu().numpy().sum())
            segments.append(Segment(
                bbox=(x1 / W, y1 / H, w / W, h / H),
                area=area / total,
            ))

    logger.info(f"YOLOE: produced {len(segments)} segments")
    return sorted(segments, key=lambda s: s.area, reverse=True)


# ── Public interface ──────────────────────────────────────────────────────────

def load() -> None:
    if BACKEND == "fastsam":
        _load_fastsam()
    elif BACKEND == "yoloe":
        _load_yoloe()
    else:
        _load_sam2()


def segment(img: Image.Image) -> list[Segment]:
    if BACKEND == "fastsam":
        return _segment_fastsam(img)
    elif BACKEND == "yoloe":
        return _segment_yoloe(img)
    else:
        return _segment_sam2(img)