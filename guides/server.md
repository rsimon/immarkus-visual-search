# IMMARKUS Visual Search Server

A stateless FastAPI server that segments images with SAM2 and embeds each segment with CLIP. Returns bounding boxes and embedding vectors to be stored locally in IMMARKUS.

## Setup

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
cd server
uv sync
```

Download the SAM2.1 Large checkpoint:

```bash
curl -L -o models/sam2.1_hiera_large.pt \
  https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt
```

All available checkpoints: https://github.com/facebookresearch/sam2#download-checkpoints

## Running

```bash
uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

Check it's up:

```bash
curl http://localhost:7771/health
# {"status":"ok","clip_model":"ViT-B-32"}
```

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

| Variable          | Default                              | Description                    |
|-------------------|--------------------------------------|--------------------------------|
| `HOST`            | `0.0.0.0`                            | Bind host                      |
| `PORT`            | `7771`                               | Bind port                      |
| `SAM2_CHECKPOINT` | `models/sam2.1_hiera_large.pt`       | Path to SAM2 checkpoint        |
| `SAM2_CONFIG`     | `configs/sam2.1/sam2.1_hiera_l.yaml` | Path to SAM2 config            |
| `SEGMENTER`       | `sam2`                               | `sam2` or `yolo` (see below)   |
| `API_KEY`         | _(unset)_                            | Bearer token; unset = no auth  |
| `ALLOWED_ORIGINS` | `*`                                  | CORS origins (comma-separated) |

## Choosing a Model

### SAM2 (default)

Best segmentation quality. Requires a GPU for practical use.

Swap to a lighter checkpoint via environment variables if VRAM is limited:

| Model  | Checkpoint file             | Config                        | VRAM    |
|--------|-----------------------------|-------------------------------|---------|
| Large  | `sam2.1_hiera_large.pt`     | `sam2.1/sam2.1_hiera_l.yaml`  | ~6 GB   |
| Base+  | `sam2.1_hiera_base_plus.pt` | `sam2.1/sam2.1_hiera_b+.yaml` | ~3.5 GB |
| Small  | `sam2.1_hiera_small.pt`     | `sam2.1/sam2.1_hiera_s.yaml`  | ~2.5 GB |
| Tiny   | `sam2.1_hiera_tiny.pt`      | `sam2.1/sam2.1_hiera_t.yaml`  | ~2 GB   |

Example:

```bash
SAM2_CHECKPOINT=models/sam2.1_hiera_small.pt \
uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

### YOLO Fallback

A fast and CPU-friendly fallback. Good for development or machines without a GPU. Only detects objects YOLO was trained to recognise (people, vehicles, animals, etc.) rather than performing general segmentation.

```bash
SEGMENTER=yolo uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

## Production Notes

- SAM2 and CLIP are loaded once at startup and kept in memory. Expect ~8–10 GB VRAM total with Large + CLIP on GPU.
- For CPU-only inference, startup is slower (~30s) but works. Consider Small or Tiny if running without a GPU.
- Set `ALLOWED_ORIGINS` to your app's domain. Leave as `*` for local development only.
- Set `API_KEY` to a long random string. Pass it from the browser as `Authorization: Bearer <key>`.