"""
CLIP embedding using open-clip-torch.
Model: ViT-B/32 (openai weights) — matches the ONNX model used browser-side.

IMPORTANT: MODEL_NAME and PRETRAINED must stay in sync with the ONNX export
used in the browser (clip-vit-b-32-visual.onnx). Do not change these without
re-exporting and redeploying the browser model.

EMBED_BATCH_SIZE controls how many crops are embedded in a single forward pass.
Larger batches are faster but use more memory. Default 32 is safe for CPU/MPS;
raise to 64-128 on GPU.
"""

from __future__ import annotations

import os

import open_clip
import torch
from PIL import Image

MODEL_NAME = "ViT-B-32"
PRETRAINED = "openai"
BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "32"))

_model: open_clip.CLIP | None = None
_preprocess = None
_device: str = "cpu"


def load() -> None:
    """Load CLIP into memory. Call once at server startup."""
    global _model, _preprocess, _device

    if torch.cuda.is_available():
        _device = "cuda"
    elif torch.backends.mps.is_available():
        _device = "mps"
    else:
        _device = "cpu"

    _model, _, _preprocess = open_clip.create_model_and_transforms(
        MODEL_NAME, pretrained=PRETRAINED, device=_device
    )
    _model.eval()
    print(f"[embedder] CLIP {MODEL_NAME}/{PRETRAINED} loaded on {_device} "
          f"(batch_size={BATCH_SIZE})")


def embed_crops(
    source: Image.Image,
    bboxes: list[tuple[float, float, float, float]],
) -> list[list[float]]:
    """
    Embed multiple crops from `source` in batches.
    Each bbox is normalised (x, y, w, h) in [0, 1].
    Returns a list of 512-dim unit-normalised float lists, one per bbox.
    """
    assert _model is not None, "Call embedder.load() before embed_crops()"

    if not bboxes:
        return []

    W, H = source.size

    # Pre-crop and preprocess all images
    tensors = []
    for (x, y, w, h) in bboxes:
        box = (int(x * W), int(y * H), int((x + w) * W), int((y + h) * H))
        crop = source.crop(box)
        tensors.append(_preprocess(crop))

    results: list[list[float]] = []

    # Run inference in batches
    with torch.no_grad():
        for i in range(0, len(tensors), BATCH_SIZE):
            batch = torch.stack(tensors[i : i + BATCH_SIZE]).to(_device)
            features = _model.encode_image(batch)
            features = features / features.norm(dim=-1, keepdim=True)
            results.extend(features.cpu().float().tolist())

    return results


def embed_crop(
    source: Image.Image,
    bbox: tuple[float, float, float, float],
) -> list[float]:
    """Single-crop convenience wrapper around embed_crops()."""
    return embed_crops(source, [bbox])[0]