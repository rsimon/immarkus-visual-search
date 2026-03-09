#!/usr/bin/env tsx
/**
 * Visual Search CLI — index builder
 *
 * Usage:
 *   npm run index -- <image-folder> [options]
 *
 * Options:
 *   --server   Server URL          (default: http://localhost:7771)
 *   --key      API key             (default: none)
 *   --force    Re-index all images, even if already indexed
 *   --concurrency  Parallel requests  (default: 1)
 *
 * Examples:
 *   npm run index -- ./my-maps
 *   npm run index -- ./my-maps --server http://localhost:7771 --force
 *   npm run index -- ./my-maps --concurrency 3
 */

import { resolve, join } from 'path';
import { findImages } from './files.ts';
import { loadIndex, emptyIndex, persistIndex } from './store.ts';
import { addImage, hasImage } from './operations.ts';
import { fetchSegments } from './server.ts';
import type { IndexState } from './types.ts';

// ── Args ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);

  const imageDir = args.find(a => !a.startsWith('--'));
  if (!imageDir) {
    console.error('Usage: npm run index -- <image-folder> [--server URL] [--force] [--concurrency N]');
    process.exit(1);
  }

  const flag = (name: string) => args.includes(`--${name}`);
  const opt = (name: string, fallback: string) => {
    const i = args.indexOf(`--${name}`);
    return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
  };

  return {
    imageDir:    resolve(imageDir),
    serverUrl:   opt('server', 'http://localhost:7771'),
    apiKey:      opt('key', ''),
    force:       flag('force'),
    concurrency: parseInt(opt('concurrency', '1'), 10),
  };
}

// ── Progress ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(`${msg}\n`);
}

function progress(done: number, total: number, label: string) {
  const pct   = Math.round((done / total) * 100);
  const bar   = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r[${bar}] ${pct}% (${done}/${total}) ${label.padEnd(50)}`);
  if (done === total) process.stdout.write('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { imageDir, serverUrl, apiKey, force, concurrency } = parseArgs();

  log(`\nVisual Search — Index Builder`);
  log(`  Folder : ${imageDir}`);
  log(`  Server : ${serverUrl}`);
  log(`  Force  : ${force}`);
  log(`  Jobs   : ${concurrency}`);
  log('');

  // ── Check server ───────────────────────────────────────────────────────────
  try {
    const res = await fetch(`${serverUrl}/health`);
    const data = await res.json() as { status: string; clip_model: string };
    log(`  Server : ${data.status} — ${data.clip_model}`);
  } catch {
    log(`  ✗ Server unreachable at ${serverUrl}. Is it running?`);
    process.exit(1);
  }

  // ── Discover images ────────────────────────────────────────────────────────
  log('\nScanning for images…');
  const images = await findImages(imageDir);
  log(`  Found ${images.length} images\n`);

  if (images.length === 0) {
    log('Nothing to index.');
    return;
  }

  // ── Load or create index ───────────────────────────────────────────────────
  let state: IndexState = (await loadIndex(imageDir)) ?? emptyIndex();
  const alreadyIndexed = state.meta.images.length;

  if (alreadyIndexed > 0) {
    log(`  Existing index: ${alreadyIndexed} images, ${state.embeddings.length / 512} segments`);
    if (force) {
      log('  --force: re-indexing all images');
    } else {
      const pending = images.filter(p => !hasImage(state, p));
      log(`  Skipping ${images.length - pending.length} already-indexed images`);
      log(`  Indexing ${pending.length} new images\n`);
    }
  }

  const toIndex = force ? images : images.filter(p => !hasImage(state, p));

  if (toIndex.length === 0) {
    log('All images already indexed. Use --force to re-index.');
    return;
  }

  // ── Index in batches ───────────────────────────────────────────────────────
  const errors: Array<{ path: string; error: string }> = [];
  let done = 0;

  // Process images in chunks of `concurrency`
  for (let i = 0; i < toIndex.length; i += concurrency) {
    const chunk = toIndex.slice(i, i + concurrency);

    await Promise.all(chunk.map(async (relPath) => {
      const absPath = join(imageDir, relPath);

      try {
        progress(done, toIndex.length, relPath);

        const t0 = Date.now();
        const response = await fetchSegments(absPath, { serverUrl, apiKey: apiKey || undefined });
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

        state = addImage(state, relPath, relPath, response);

        done++;
        progress(done, toIndex.length,
          `${relPath} — ${response.segments.length} segments, ${elapsed}s`);
      } catch (err) {
        done++;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ path: relPath, error: message });
        progress(done, toIndex.length, `✗ ${relPath}`);
      }
    }));

    // Persist after every chunk so progress survives interruption
    await persistIndex(imageDir, state);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  log('\n');
  log(`Done.`);
  log(`  Indexed : ${done - errors.length} images`);
  log(`  Segments: ${state.embeddings.length / 512}`);
  log(`  Errors  : ${errors.length}`);

  if (errors.length > 0) {
    log('\nFailed images:');
    errors.forEach(({ path, error }) => log(`  ✗ ${path}: ${error}`));
  }

  log(`\nIndex written to ${imageDir}/.visual-search/`);
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});