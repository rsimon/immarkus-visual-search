import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { IndexState, PersistedIndex } from './types.ts';

const INDEX_DIR       = '.visual-search';
const INDEX_FILE      = 'index.json';
const EMBEDDINGS_FILE = 'embeddings.bin';

export const EMBEDDING_DIM = 512;
export const MODEL_NAME    = 'clip-vit-b-32';

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Load an existing index from disk.
 * Returns null if no index exists yet.
 */
export async function loadIndex(rootDir: string): Promise<IndexState | null> {
  const indexDir = join(rootDir, INDEX_DIR);

  let meta: PersistedIndex;
  let embeddings: Float32Array;

  try {
    const jsonText = await readFile(join(indexDir, INDEX_FILE), 'utf-8');
    meta = JSON.parse(jsonText) as PersistedIndex;
  } catch {
    return null;
  }

  try {
    const buf = await readFile(join(indexDir, EMBEDDINGS_FILE));
    // Node's Buffer is a subclass of Uint8Array — copy into Float32Array properly
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    embeddings = new Float32Array(ab);
  } catch {
    embeddings = new Float32Array(0);
  }

  return { meta, embeddings };
}

/**
 * Create an empty index state.
 */
export function emptyIndex(): IndexState {
  return {
    meta: {
      version: 1,
      model: MODEL_NAME,
      updated: new Date().toISOString(),
      images: [],
    },
    embeddings: new Float32Array(0),
  };
}

// ── Persist ───────────────────────────────────────────────────────────────────

/**
 * Write both files atomically (best-effort — writes json then bin).
 */
export async function persistIndex(rootDir: string, state: IndexState): Promise<void> {
  const indexDir = join(rootDir, INDEX_DIR);
  await mkdir(indexDir, { recursive: true });

  state.meta.updated = new Date().toISOString();

  await writeFile(
    join(indexDir, INDEX_FILE),
    JSON.stringify(state.meta, null, 2),
    'utf-8',
  );

  await writeFile(
    join(indexDir, EMBEDDINGS_FILE),
    Buffer.from(state.embeddings.buffer),
  );
}