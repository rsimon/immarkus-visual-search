import { readdir } from 'fs/promises';
import { join, relative, extname } from 'path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);

/**
 * Recursively walk a directory and return all image file paths,
 * sorted alphabetically, as paths relative to the root.
 */
export async function findImages(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  await walk(rootDir, rootDir, results);
  return results.sort();
}

async function walk(rootDir: string, dir: string, results: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  await Promise.all(entries.map(async entry => {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip the index directory itself
      await walk(rootDir, fullPath, results);
    } else if (entry.isFile()) {
      if (IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        results.push(relative(rootDir, fullPath));
      }
    }
  }));
}