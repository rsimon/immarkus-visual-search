import type {
  IndexImageResponse,
  IndexState,
  PersistedImage,
} from './types.ts';
import { EMBEDDING_DIM } from './store.ts';

// ── Add ───────────────────────────────────────────────────────────────────────

/**
 * Add (or replace) an image in the index.
 * Returns a new IndexState — does not mutate the input.
 */
export function addImage(
  state: IndexState,
  imageId: string,
  imagePath: string,
  response: IndexImageResponse,
): IndexState {
  // Remove any existing entry for this image
  const images = state.meta.images.filter(img => img.imageId !== imageId);

  // New vectors from the server response
  const newVectors = response.segments.map(seg => new Float32Array(seg.embedding));

  // Append new vectors to the embedding matrix
  const oldRowCount = state.embeddings.length / EMBEDDING_DIM;
  const newRowCount = oldRowCount + newVectors.length;
  const nextEmbeddings = new Float32Array(newRowCount * EMBEDDING_DIM);
  nextEmbeddings.set(state.embeddings);
  newVectors.forEach((vec, i) => nextEmbeddings.set(vec, (oldRowCount + i) * EMBEDDING_DIM));

  // Build the image record with assigned embeddingRow values
  const image: PersistedImage = {
    imageId,
    imagePath,
    indexedAt: new Date().toISOString(),
    segments: response.segments.map((seg, i) => ({
      bbox: seg.bbox as [number, number, number, number],
      area: seg.area,
      embeddingRow: oldRowCount + i,
    })),
  };

  return {
    meta: { ...state.meta, images: [...images, image] },
    embeddings: nextEmbeddings,
  };
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Remove an image and repack the embedding matrix.
 * Returns a new IndexState — does not mutate the input.
 */
export function deleteImage(state: IndexState, imageId: string): IndexState {
  const images = state.meta.images.filter(img => img.imageId !== imageId);

  if (images.length === state.meta.images.length) {
    console.warn(`[store] deleteImage: "${imageId}" not found`);
    return state;
  }

  return repackAll({ ...state, meta: { ...state.meta, images } });
}

// ── Repack ────────────────────────────────────────────────────────────────────

/**
 * Rebuild the embedding matrix from the current meta, reassigning all
 * embeddingRow values sequentially. Used after delete.
 */
function repackAll(state: IndexState): IndexState {
  const totalSegments = state.meta.images.reduce((n, img) => n + img.segments.length, 0);
  const nextEmbeddings = new Float32Array(totalSegments * EMBEDDING_DIM);

  let row = 0;
  const nextImages = state.meta.images.map(image => ({
    ...image,
    segments: image.segments.map(seg => {
      const oldRow = seg.embeddingRow;
      nextEmbeddings.set(
        state.embeddings.subarray(oldRow * EMBEDDING_DIM, (oldRow + 1) * EMBEDDING_DIM),
        row * EMBEDDING_DIM,
      );
      return { ...seg, embeddingRow: row++ };
    }),
  }));

  return {
    meta: { ...state.meta, images: nextImages },
    embeddings: nextEmbeddings,
  };
}

// ── Query ─────────────────────────────────────────────────────────────────────

/** Return all segments for an image, or [] if not indexed. */
export function getImageSegments(state: IndexState, imageId: string) {
  return state.meta.images.find(img => img.imageId === imageId)?.segments ?? [];
}

/** Return true if this image has been indexed. */
export function hasImage(state: IndexState, imageId: string): boolean {
  return state.meta.images.some(img => img.imageId === imageId);
}