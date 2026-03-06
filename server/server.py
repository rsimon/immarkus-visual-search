"""
Visual Search Server
====================
Stateless. One endpoint. No storage.

POST /index-image
  in:  multipart image file
  out: JSON array of segments, each with bbox + CLIP embedding

Environment variables:
  HOST              bind host          (default: 0.0.0.0)
  PORT              bind port          (default: 7771)
  SAM2_CHECKPOINT   path to .pt file   (default: models/sam2.1_hiera_large.pt)
  SAM2_CONFIG       path to yaml       (default: configs/sam2.1/sam2.1_hiera_l.yaml)
  API_KEY           shared secret      (default: unset = no auth)
  ALLOWED_ORIGINS   comma-separated    (default: * for local use)

Run:
  uv run uvicorn server:app --host 0.0.0.0 --port 7771
"""

from __future__ import annotations

import io
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from visual_search import embedder, segmenter


# ── Lifespan: load models once at startup ────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[server] Loading models…")
    segmenter.load()
    embedder.load()
    print("[server] Ready.")
    yield
    # nothing to clean up — torch releases on process exit


app = FastAPI(
    title="Visual Search Server",
    description="Stateless image segmentation + CLIP embedding",
    version="0.1.0",
    lifespan=lifespan,
)


# ── CORS ─────────────────────────────────────────────────────────────────────

_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
_origins = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ── Auth (optional) ───────────────────────────────────────────────────────────

_API_KEY = os.getenv("API_KEY", "")


def _check_auth(authorization: str | None) -> None:
    if not _API_KEY:
        return  # auth disabled
    if authorization != f"Bearer {_API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# ── Response schema ───────────────────────────────────────────────────────────

class SegmentResult(BaseModel):
    """
    bbox: normalised [x, y, w, h], origin top-left, values in [0, 1]
    area: normalised segment area in [0, 1]
    embedding: 512-dim unit-normalised CLIP ViT-B/32 vector
    """
    bbox: list[float]       # [x, y, w, h]
    area: float
    embedding: list[float]  # 512 floats


class IndexImageResponse(BaseModel):
    segments: list[SegmentResult]
    image_width: int
    image_height: int
    processing_ms: float


# ── Endpoint ──────────────────────────────────────────────────────────────────

@app.post("/index-image", response_model=IndexImageResponse)
async def index_image(
    file: UploadFile = File(..., description="Image to segment and embed"),
    authorization: str | None = Header(default=None),
) -> IndexImageResponse:
    """
    Process an image:
    1. Segment with SAM2 or SAM3
    2. Embed each segment crop with CLIP ViT-B/32
    3. Return segments with normalised bboxes and embeddings

    Images are never written to disk or stored.
    """
    _check_auth(authorization)

    t0 = time.perf_counter()

    # Read + decode image
    raw = await file.read()
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Cannot decode image: {exc}")

    W, H = img.size

    # Segment
    try:
        segs = segmenter.segment(img)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Segmentation failed: {exc}")

    # Embed each segment crop
    results: list[SegmentResult] = []
    for seg in segs:
        try:
            vec = embedder.embed_crop(img, seg.bbox)
        except Exception:
            continue  # skip malformed crops rather than failing the whole request

        results.append(SegmentResult(
            bbox=list(seg.bbox),
            area=seg.area,
            embedding=vec,
        ))

    elapsed = (time.perf_counter() - t0) * 1000

    return IndexImageResponse(
        segments=results,
        image_width=W,
        image_height=H,
        processing_ms=round(elapsed, 1),
    )


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "clip_model": embedder.MODEL_NAME,
    }


# ── Dev entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "7771")),
        reload=False,
    )