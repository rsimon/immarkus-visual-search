import type { BoundingBox } from '@/types';

/**
 * Round a number to a specified number of decimal places.
 * Default: 4 decimals for bbox URLs (0.0001 precision).
 */
export const precisionRound = (value: number, decimals = 4): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

/**
 * Encode a bounding box to a URL-safe string: "x,y,w,h"
 * Each value rounded to 4 decimals.
 */
export const encodeBbox = (box: BoundingBox): string => {
  return [box.x, box.y, box.w, box.h]
    .map((v) => precisionRound(v, 4).toString())
    .join(',');
};

/**
 * Decode a bounding box string "x,y,w,h" back to a BoundingBox object.
 * Returns null if the string is malformed.
 */
export const decodeBbox = (encoded: string): BoundingBox | null => {
  const parts = encoded.split(',').map((p) => parseFloat(p));
  if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }
  return null;
};
