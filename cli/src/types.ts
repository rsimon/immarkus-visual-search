// ── Server types ──────────────────────────────────────────────────────────────

export type BBox = [number, number, number, number]; // [x, y, w, h] normalised

export interface ServerSegment {
  bbox: BBox;
  area: number;
  embedding: number[];  // 512-dim, unit-normalised
}

export interface IndexImageResponse {
  segments: ServerSegment[];
  image_width: number;
  image_height: number;
  processing_ms: number;
}

// ── Index file types ──────────────────────────────────────────────────────────

export interface PersistedSegment {
  bbox: BBox;
  area: number;
  embeddingRow: number;
}

export interface PersistedImage {
  imageId: string;    // relative path used as stable ID in the CLI
  imagePath: string;  // same as imageId for CLI purposes
  indexedAt: string;
  segments: PersistedSegment[];
}

export interface PersistedIndex {
  version: 1;
  model: string;
  updated: string;
  images: PersistedImage[];
}

// ── Runtime types ─────────────────────────────────────────────────────────────

export interface IndexState {
  meta: PersistedIndex;
  embeddings: Float32Array;
}