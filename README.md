# IMMARKUS Visual Search

Visual search across your image collection, built as an IMMARKUS extension.

## How it works

1. **Indexing** — when you add an image, IMMARKUS sends it to a local Python server, which segments it into regions (using SAM2) and computes a CLIP embedding for each region. The resulting bounding boxes and embedding vectors are stored locally in IMMARKUS.
2. **Querying** — when you search, IMMARKUS runs CLIP directly in the browser (via ONNX) to embed your query image, then computes cosine similarity against all stored embeddings locally. No server round-trip at query time.

All processing stays on your machine. Images are never retained by the server after indexing.

## Setup

### 1. Visual Search Server

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
cd server
uv sync
```

Download the SAM2 model checkpoint:

```bash
curl -L -o models/sam2.1_hiera_large.pt \
  https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt
```

Start the server:

```bash
uv run uvicorn server:app --host 0.0.0.0 --port 7771
# SEGMENTER=yolo uv run uvicorn server:app --host 0.0.0.0 --port 7771
```

Verify it's running:

```bash
curl http://localhost:7771/health
# {"status":"ok","clip_model":"ViT-B-32"}
```

For configuration options, alternative models, and production deployment, see [guides/server.md](guides/server.md).

### 2. IMMARKUS Frontend

_TODO_