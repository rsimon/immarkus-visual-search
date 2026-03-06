# IMMARKUS Visual Search

An IMMARKUS extension for visual search across your image collection.

## Visual Search Server

A stateless FastAPI server that segments images with SAM2 and embeds each
segment with CLIP. Returns bounding boxes and embedding vectors, to be stored
locally in IMMARKUS for search later.

### Setup

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
cd server
uv sync
```

Download SAM2.1 Large checkpoint

```bash
curl -L -o models/sam2.1_hiera_large.pt \
  https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt
```

All available checkpoints: https://github.com/facebookresearch/sam2#download-checkpoints

### Run

```bash
uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

Check it's up:
```bash
curl http://localhost:7771/health
# {"status":"ok","clip_model":"ViT-B-32"}
```

### API

#### `POST /index-image`

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

#### `GET /health`

Returns `200 OK` with model info. Use for uptime checks.

### Environment Variables

| Variable          | Default                              | Description                     |
|-------------------|--------------------------------------|---------------------------------|
| `HOST`            | `0.0.0.0`                            | Bind host                       |
| `PORT`            | `7771`                               | Bind port                       |
| `SAM2_CHECKPOINT` | `models/sam2.1_hiera_large.pt`       | Path to SAM2 checkpoint         |
| `SAM2_CONFIG`     | `configs/sam2.1/sam2.1_hiera_l.yaml` | Path to SAM2 config             |
| `API_KEY`         | _(unset)_                            | Bearer token; unset = no auth   |
| `ALLOWED_ORIGINS` | `*`                                  | CORS origins (comma-separated)  |

### Using a smaller model

If VRAM is limited, swap to a lighter checkpoint via env vars:

| Model  | Checkpoint file             | Config                        | VRAM   |
|--------|-----------------------------|-------------------------------|--------|
| Large  | `sam2.1_hiera_large.pt`     | `sam2.1/sam2.1_hiera_l.yaml`  | ~6GB   |
| Base+  | `sam2.1_hiera_base_plus.pt` | `sam2.1/sam2.1_hiera_b+.yaml` | ~3.5GB |
| Small  | `sam2.1_hiera_small.pt`     | `sam2.1/sam2.1_hiera_s.yaml`  | ~2.5GB |
| Tiny   | `sam2.1_hiera_tiny.pt`      | `sam2.1/sam2.1_hiera_t.yaml`  | ~2GB   |


## Production Notes

- Both SAM2 and CLIP are loaded once at startup and kept in memory.
  Expect ~8–10GB VRAM total with Large + CLIP on GPU.
- For CPU-only inference, startup is slower (~30s) but works.
  Consider Small or Tiny if running without a GPU.
- Set `ALLOWED_ORIGINS` to your app's domain in production.
  Leave as `*` for local development only.
- Set `API_KEY` to a long random string in production.
  Pass it from the browser as `Authorization: Bearer <key>`.