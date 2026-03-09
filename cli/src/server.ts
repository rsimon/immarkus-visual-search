import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { basename } from 'path';
import type { IndexImageResponse } from './types.ts';

export interface ServerConfig {
  serverUrl: string;
  apiKey?: string;
}

/**
 * POST an image file to the server's /index-image endpoint.
 * Returns the parsed response.
 */
export async function fetchSegments(
  imagePath: string,       // absolute path on disk
  config: ServerConfig,
): Promise<IndexImageResponse> {
  // Node 18+ has native fetch + FormData, but FormData doesn't support
  // streams natively in all versions — use a multipart body manually.
  const fileBuffer = await readFileAsBuffer(imagePath);
  const filename = basename(imagePath);
  const boundary = `----VisualSearchBoundary${Date.now()}`;

  const body = buildMultipartBody(fileBuffer, filename, boundary);

  const headers: Record<string, string> = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': String(body.byteLength),
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const res = await fetch(`${config.serverUrl}/index-image`, {
    method: 'POST',
    headers,
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Server ${res.status}: ${detail}`);
  }

  return res.json() as Promise<IndexImageResponse>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readFileAsBuffer(path: string): Promise<Buffer> {
  const { readFile } = await import('fs/promises');
  return readFile(path);
}

function buildMultipartBody(
  fileBuffer: Buffer,
  filename: string,
  boundary: string,
): Buffer {
  const mimeType = guessMime(filename);

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );

  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

  return Buffer.concat([header, fileBuffer, footer]);
}

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
    tif: 'image/tiff', tiff: 'image/tiff',
  };
  return map[ext] ?? 'application/octet-stream';
}