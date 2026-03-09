"""
CLIP embedding using open-clip-torch.
Model: ViT-B/32 (openai weights) — matches the ONNX model used browser-side.

IMPORTANT: MODEL_NAME and PRETRAINED must stay in sync with the ONNX export
used in the browser (clip-vit-b-32-visual.onnx). Do not change these without
re-exporting and redeploying the browser model.
"""

from __future__ import annotations

import open_clip
import torch
from PIL import Image

MODEL_NAME = "ViT-B-32"
PRETRAINED = "openai"

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

    print(f"[embedder] CLIP {MODEL_NAME}/{PRETRAINED} loaded on {_device}")


def embed_crop(
    source: Image.Image,
    bbox: tuple[float, float, float, float],
) -> list[float]:
    """
    Crop `source` to a normalised bbox (x, y, w, h) in [0, 1] and embed.
    Returns a 512-dim unit-normalised float list (JSON-serialisable).
    """
    assert _model is not None, "Call embedder.load() before embed_crop()"

    W, H = source.size
    x, y, w, h = bbox
    box = (int(x * W), int(y * H), int((x + w) * W), int((y + h) * H))
    crop = source.crop(box)

    tensor = _preprocess(crop).unsqueeze(0).to(_device)

    with torch.no_grad():
        features = _model.encode_image(tensor)
        features = features / features.norm(dim=-1, keepdim=True)

    return features.squeeze(0).cpu().float().tolist()