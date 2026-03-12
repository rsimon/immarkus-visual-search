import { similarity } from 'compute-cosine-similarity';
import type { BoundingBox, SearchResult } from '@/types';
import type { PersistedIndex } from '../../../cli/src/types';

const EMBEDDING_DIM = 512;

/**
 * Parsed index data ready for search.
 */
export interface IndexData {
  meta: PersistedIndex;
  embeddings: Float32Array;
}

/**
 * Load and parse index.json and embeddings.bin from the FileSystem API.
 * Returns an IndexData object ready for searching.
 */
export async function loadIndexData(
  jsonHandle: FileSystemFileHandle,
  binHandle: FileSystemFileHandle
): Promise<IndexData> {
  // Load JSON
  const jsonFile = await jsonHandle.getFile();
  const jsonText = await jsonFile.text();
  const meta: PersistedIndex = JSON.parse(jsonText);

  // Load embeddings binary
  const binFile = await binHandle.getFile();
  const buffer = await binFile.arrayBuffer();
  const embeddings = new Float32Array(buffer);

  return { meta, embeddings };
}

/**
 * Generate a mock query embedding for a region.
 * TODO: Replace with actual CLIP/ONNX embedding once integrated.
 */
function generateMockQueryEmbedding(): Float32Array {
  const vec = new Float32Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    vec[i] = Math.random() - 0.5;
  }
  // Normalize to unit length
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      vec[i] /= norm;
    }
  }
  return vec;
}

/**
 * Search for similar regions in the indexed data.
 * Returns the top `limit` results sorted by similarity (highest first).
 */
export function searchSimilar(
  indexData: IndexData,
  queryEmbedding: Float32Array,
  limit: number = 10
): SearchResult[] {
  const results: Array<{
    sourceImageId: string;
    region: BoundingBox;
    similarity: number;
  }> = [];

  // Iterate over all segments
  for (const image of indexData.meta.images) {
    for (const segment of image.segments) {
      // Extract the segment's embedding from the embeddings array
      const embeddingStart = segment.embeddingRow * EMBEDDING_DIM;
      const segmentEmbedding = indexData.embeddings.subarray(
        embeddingStart,
        embeddingStart + EMBEDDING_DIM
      );

      // Compute cosine similarity
      const sim = similarity(queryEmbedding, Array.from(segmentEmbedding));

      if (sim !== null && sim !== undefined) {
        results.push({
          sourceImageId: image.imageId,
          region: {
            x: segment.bbox[0],
            y: segment.bbox[1],
            w: segment.bbox[2],
            h: segment.bbox[3],
          },
          similarity: sim,
        });
      }
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  // Return top results
  return results.slice(0, limit).map((r) => {
    // Convert similarity from [-1, 1] to [0, 1] range for display
    // (cosine similarity ranges from -1 to 1; we want 0-1)
    const displaySimilarity = (r.similarity + 1) / 2;
    return {
      ...r,
      similarity: Math.max(0, Math.min(1, displaySimilarity)),
    };
  });
}

/**
 * High-level search function: given a query region on an image,
 * find similar regions in the entire index.
 * For now, mocks the query embedding.
 */
export function findSimilarRegions(
  indexData: IndexData,
  sourceImageId: string,
  queryRegion: BoundingBox,
  limit: number = 10
): SearchResult[] {
  // TODO: Embed the actual crop using CLIP/ONNX
  // For now, use a mock embedding
  const queryEmbedding = generateMockQueryEmbedding();

  return searchSimilar(indexData, queryEmbedding, limit);
}
