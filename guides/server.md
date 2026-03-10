# IMMARKUS Visual Search Server

A stateless FastAPI server that segments images with SAM2 and embeds each segment with CLIP. Returns bounding boxes and embedding vectors to be stored locally in IMMARKUS.

## Setup

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
cd server
uv sync
```

`uv sync` installs the core dependencies only (SAM2 + CLIP). Install extras depending on which segmentation backend you plan to use:

```bash
uv sync --extra fastsam   # adds FastSAM
uv sync --extra yoloe     # adds YOLOE
uv sync --extra export    # adds ONNX export tools (for the browser client)
```

Download the SAM2.1 Large checkpoint:

```bash
curl -L -o models/sam2.1_hiera_large.pt \
  https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt
```

FastSAM and YOLOE download their checkpoints automatically on first use — no manual download needed.

All available SAM2 checkpoints: https://github.com/facebookresearch/sam2#download-checkpoints

## Running

```bash
uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

Check it's up:

```bash
curl http://localhost:7771/health
# {"status":"ok","clip_model":"ViT-B-32"}
```

## Minimum working example (Mac / no GPU)

For quick local development without a GPU, use YOLOE — it runs in seconds on CPU and downloads its checkpoint automatically:

```bash
uv sync --extra yoloe
SEGMENTER=yoloe uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

Note that YOLOE is open-vocabulary but still detection-based — it works well for development but may miss domain-specific iconography (e.g. historical map symbols). For better coverage on unusual imagery, FastSAM is a class-agnostic alternative:

```bash
uv sync --extra fastsam
SEGMENTER=fastsam uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

If you want to test with SAM2 itself on CPU, use the Small checkpoint and force the device explicitly:

```bash
curl -L -o models/sam2.1_hiera_small.pt \
  https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt

SAM2_CHECKPOINT=models/sam2.1_hiera_small.pt \
SAM2_DEVICE=cpu \
uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

`SAM2_DEVICE=cpu` is important on Apple Silicon — MPS support in SAM2 is incomplete and can produce errors or silently fall back to CPU anyway. Forcing CPU explicitly avoids this. Be aware that SAM2 on CPU is very slow for large images (several minutes each).

## API

### `POST /index-image`

Segments an image and returns CLIP embeddings for each segment.

**Request:** `multipart/form-data` with a single `file` field (any common image format).

**Response:**

```json
{
  "segments": [
    {
      "bbox": [0.12, 0.08, 0.45, 0.60],
      "area": 0.23,
      "embedding": [0.021, -0.14, "..."]
    }
  ],
  "image_width": 1024,
  "image_height": 768,
  "processing_ms": 1240.5
}
```

- `bbox` — normalised `[x, y, w, h]`, origin top-left, values in `[0, 1]`
- `area` — normalised segment area in `[0, 1]`
- `embedding` — 512-dim unit-normalised CLIP ViT-B/32 vector

Images are never written to disk or retained after the response is sent.

### `GET /health`

Returns `200 OK` with model info. Use for uptime checks.

## Environment Variables

| Variable          | Default                          | Description                                   |
|-------------------|----------------------------------|-----------------------------------------------|
| `SEGMENTER`       | `sam2`                           | `sam2`, `fastsam`, or `yoloe`                 |
| `SAM2_CHECKPOINT` | `models/sam2.1_hiera_large.pt`   | Path to SAM2 checkpoint file                  |
| `SAM2_DEVICE`     | _(auto-detect)_                  | Force device: `cpu`, `cuda`, or `mps`         |
| `FASTSAM_MODEL`   | `FastSAM-x.pt`                   | FastSAM checkpoint (`FastSAM-s.pt` for speed) |
| `FASTSAM_DEVICE`  | _(auto-detect)_                  | Force device: `cpu`, `cuda`, or `mps`         |
| `FASTSAM_CONF`    | `0.4`                            | FastSAM confidence threshold                  |
| `FASTSAM_IOU`     | `0.9`                            | FastSAM NMS IOU threshold                     |
| `YOLOE_MODEL`     | `yoloe-11l-seg.pt`               | YOLOE checkpoint (see options below)          |
| `YOLOE_DEVICE`    | _(auto-detect)_                  | Force device: `cpu`, `cuda`, or `mps`         |
| `API_KEY`         | _(unset)_                        | Bearer token; unset = no auth                 |
| `ALLOWED_ORIGINS` | `*`                              | CORS origins (comma-separated)                |

## Choosing a Segmentation Backend

### SAM2 (default) — best quality

Class-agnostic segmentation. Finds anything in the image regardless of category. Requires a GPU for practical throughput.

| Model  | Checkpoint file             | VRAM    |
|--------|-----------------------------|---------|
| Large  | `sam2.1_hiera_large.pt`     | ~6 GB   |
| Base+  | `sam2.1_hiera_base_plus.pt` | ~3.5 GB |
| Small  | `sam2.1_hiera_small.pt`     | ~2.5 GB |
| Tiny   | `sam2.1_hiera_tiny.pt`      | ~2 GB   |

The checkpoint filename determines the config automatically.

### FastSAM — balanced fallback

Class-agnostic segmentation using a YOLO-based encoder. Significantly faster than SAM2, CPU-viable, and still finds arbitrary regions regardless of category. Recommended when a GPU isn't available but segmentation quality matters.

| Model       | Notes                        |
|-------------|------------------------------|
| FastSAM-x.pt | larger, better quality (default) |
| FastSAM-s.pt | smaller, faster              |

### YOLOE — fastest, dev fallback

Open-vocabulary detection with a built-in 1200+ category vocabulary. Fastest option and the most practical for local development on CPU. Returns segments only for recognisable objects — may miss domain-specific iconography like historical map symbols.

| Model              | Notes              |
|--------------------|--------------------|
| `yoloe-11l-seg.pt` | default            |
| `yoloe-11m-seg.pt` | smaller/faster     |
| `yoloe-11s-seg.pt` | smallest/fastest   |

## Production Notes

- SAM2 and CLIP are loaded once at startup and kept in memory. Expect ~8–10 GB VRAM total with Large + CLIP on GPU.
- Set `ALLOWED_ORIGINS` to your app's domain. Leave as `*` for local development only.
- Set `API_KEY` to a long random string. Pass it from the browser as `Authorization: Bearer <key>`.