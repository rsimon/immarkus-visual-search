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
  API_KEY           shared secret      (default: unset = no auth)
  ALLOWED_ORIGINS   comma-separated    (default: * for local use)

Run:
  uv run uvicorn server:app --host 0.0.0.0 --port 7771
"""

from __future__ import annotations

import io
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

from visual_search import embedder, segmenter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("server")


# ── Lifespan: load models once at startup ────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Loading models (segmenter={segmenter.BACKEND})...")
    segmenter.load()
    embedder.load()
    logger.info("Server ready.")
    yield


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
    logger.info(f"Processing '{file.filename}' ({W}x{H})...")

    # Segment
    t_seg = time.perf_counter()
    try:
        segs = segmenter.segment(img)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Segmentation failed: {exc}")
    logger.info(f"Segmentation: {len(segs)} segments in {time.perf_counter() - t_seg:.1f}s")

    # Embed all segment crops in batches
    t_emb = time.perf_counter()
    try:
        embeddings = embedder.embed_crops(img, [s.bbox for s in segs])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Embedding failed: {exc}")

    results: list[SegmentResult] = [
        SegmentResult(bbox=list(seg.bbox), area=seg.area, embedding=vec)
        for seg, vec in zip(segs, embeddings)
    ]
    logger.info(f"Embedding: {len(results)} crops in {time.perf_counter() - t_emb:.1f}s")

    elapsed = time.perf_counter() - t0
    logger.info(f"Done '{file.filename}': {len(results)} segments, total {elapsed:.1f}s")

    return IndexImageResponse(
        segments=results,
        image_width=W,
        image_height=H,
        processing_ms=round(elapsed * 1000, 1),
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