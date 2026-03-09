# Client Guide

This guide covers preparing the CLIP embedding model for browser use and running the visual search test page.

## Exporting the CLIP model

The browser embeds query images locally using the same CLIP ViT-B/32 weights as the server. You need to export those weights to ONNX format once, then place the file next to `search.html`.

Run from the `server/` directory:

```bash
# Full precision only (~335MB)
uv run python scripts/export_clip_onnx.py

# Full precision + quantised int8 (~335MB + ~85MB) — recommended
uv run python scripts/export_clip_onnx.py --quantise

# Quantise only (if the full .onnx already exists)
uv run python scripts/export_clip_onnx.py --quantise-only
```

The script outputs into the `test` folder, next to `search.html`:

```
similarity-search/
├── clip-vit-b-32-visual.onnx          ← full precision
├── clip-vit-b-32-visual-int8.onnx     ← quantised (optional)
└── search.html
```

### Full vs. quantised

The int8 quantised model is recommended for browser use — it loads significantly faster (85MB vs. 335MB) with negligible accuracy cost (cosine similarities shift by ~0.01). Either works.

If you use the quantised model, update the filename constant at the top of `search.html`:

```js
const MODEL_FILENAME = 'clip-vit-b-32-visual-int8.onnx';
```

### Notes on the export warnings

Two warnings appear during export and can be ignored:

- **`DeprecationWarning: legacy TorchScript-based ONNX export`** — the legacy exporter (`dynamo=False`) is intentional here for `onnxruntime-web` compatibility. Revisit when PyTorch 2.9 lands.
- **`Please consider to run pre-processing before quantization`** — refers to an optional calibration step. Not necessary for CLIP; dynamic quantisation works well without it.

---

## Using the search page

### Requirements

- The CLI indexer has already been run against your image folder (producing `.visual-search/index.json` and `.visual-search/embeddings.bin`)
- A CLIP ONNX model file sits in the same folder as `search.html`
- A local HTTP server — `search.html` uses ES modules and the FileSystem API, both of which require HTTP (not `file://`)

### Starting a local server

From the `test` folder:

```bash
npx serve .
```

Then open `http://localhost:3000/search.html` in your browser.

### Workflow

1. **Open image folder** — click the button and pick the folder you indexed with the CLI. The page reads `.visual-search/index.json` and `embeddings.bin` immediately and shows a summary of how many images and segments are loaded.

2. **Select a query image** — click the drop zone or drag an image onto it. This can be any image, including one from outside the indexed folder.

3. **Search** — click Search. The page embeds the query image locally via ONNX (no server call), runs a cosine similarity scan over all stored vectors, and displays the top 10 results.

### Reading the results

Each result card shows:

- the matched segment, cropped from the source image
- similarity score as a percentage
- filename of the source image
- bounding box coordinates (normalised `[x, y, w, h]`)

The score is cosine similarity expressed as a percentage. Scores above ~60% generally indicate a strong visual match; below ~40% the match is likely incidental.