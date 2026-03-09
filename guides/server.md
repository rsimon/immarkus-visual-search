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

## Minimum working example (Mac / no GPU)

If you just want to verify the pipeline end-to-end without a GPU, use SAM2 Small forced onto CPU. Segmentation quality is still good; the tradeoff is speed — expect several minutes per large image.

Download the Small checkpoint:

```bash
curl -L -o models/sam2.1_hiera_small.pt \
  https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt
```

Then run with both overrides:

```bash
SAM2_CHECKPOINT=models/sam2.1_hiera_small.pt \
SAM2_DEVICE=cpu \
uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

`SAM2_DEVICE=cpu` is important on Apple Silicon — MPS support in SAM2 is incomplete and will produce errors or silently fall back to CPU anyway. Forcing CPU explicitly avoids this.

For quick iteration during development, YOLO is the practical alternative — it returns results in seconds on CPU, though it only detects objects it was trained on (not suitable for historical maps or general segmentation):

```bash
SEGMENTER=yolo uv run uvicorn server:app --host 0.0.0.0 --port 7771
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

| Variable          | Default                              | Description                                      |
|-------------------|--------------------------------------|--------------------------------------------------|
| `HOST`            | `0.0.0.0`                            | Bind host                                        |
| `PORT`            | `7771`                               | Bind port                                        |
| `SAM2_CHECKPOINT` | `models/sam2.1_hiera_large.pt`       | Path to SAM2 checkpoint                          |
| `SAM2_DEVICE`     | _(auto-detect)_                      | Force device: `cpu`, `cuda`, or `mps`            |
| `SEGMENTER`       | `sam2`                               | `sam2` or `yolo`                                 |
| `API_KEY`         | _(unset)_                            | Bearer token; unset = no auth                    |
| `ALLOWED_ORIGINS` | `*`                                  | CORS origins (comma-separated)                   |

## Choosing a Model

### SAM2 (default)

Best segmentation quality. Requires a GPU for practical use on large images.

| Model  | Checkpoint file             | VRAM    |
|--------|-----------------------------|---------|
| Large  | `sam2.1_hiera_large.pt`     | ~6 GB   |
| Base+  | `sam2.1_hiera_base_plus.pt` | ~3.5 GB |
| Small  | `sam2.1_hiera_small.pt`     | ~2.5 GB |
| Tiny   | `sam2.1_hiera_tiny.pt`      | ~2 GB   |

The checkpoint filename determines the config automatically — no need to set `SAM2_CONFIG` manually.

Example with Small checkpoint:

```bash
SAM2_CHECKPOINT=models/sam2.1_hiera_small.pt \
uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

### YOLO Fallback

Fast and CPU-friendly. Only detects objects YOLO was trained to recognise (people, vehicles, animals, etc.) — not suitable for general or historical image segmentation.

```bash
SEGMENTER=yolo uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

## Production Notes

- SAM2 and CLIP are loaded once at startup and kept in memory. Expect ~8–10 GB VRAM total with Large + CLIP on GPU.
- Set `ALLOWED_ORIGINS` to your app's domain. Leave as `*` for local development only.
- Set `API_KEY` to a long random string. Pass it from the browser as `Authorization: Bearer <key>`.