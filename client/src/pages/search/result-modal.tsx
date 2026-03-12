import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/store';
import type { SearchResult } from '@/types';
import { encodeBbox } from '@/utils/url';
import { Button } from '@/components/ui/button';
import { Portal } from '@/components/portal';

export const ResultModal: React.FC<{
  result: SearchResult;
  onClose: () => void;
}> = ({ result, onClose }) => {
  const getImageByName = useStore((s) => s.getImageByName);
  const entry = getImageByName(result.sourceImageId);

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load the source image
  useEffect(() => {
    if (!entry) return;

    let cancelled = false;
    (async () => {
      const file = await entry.handle.getFile();
      const url = URL.createObjectURL(file);
      if (!cancelled) setObjectUrl(url);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry]);

  if (!entry || !objectUrl) {
    return null;
  }

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
        <div className="relative bg-white rounded-lg shadow-xl max-w-[90vw] max-h-[90vh] overflow-auto flex flex-col">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors z-10"
          >
            ✕
          </button>

          {/* Image container with darkening + highlight */}
          <div className="relative flex-1 flex items-center justify-center bg-gray-900 p-4">
            <HighlightedImageCanvas
              objectUrl={objectUrl}
              region={result.region}
              canvasRef={canvasRef}
            />
          </div>

          {/* Footer with buttons */}
          <div className="bg-gray-100 p-4 flex justify-between items-center border-t">
            <div className="flex flex-col text-sm">
              <span className="font-semibold">Source: {result.sourceImageId}</span>
              <span className="text-gray-600">
                Similarity: {Math.round(result.similarity * 100)}%
              </span>
            </div>
            <div className="flex gap-2">
              <a
                href={`/image/${encodeURIComponent(result.sourceImageId)}?bbox=${encodeBbox(result.region)}`}
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium"
              >
                View fullscreen
              </a>
              <Button size="sm" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
};

/**
 * Renders the image with a darkened overlay and highlighted region.
 */
const HighlightedImageCanvas: React.FC<{
  objectUrl: string;
  region: { x: number; y: number; w: number; h: number };
  canvasRef: React.RefObject<HTMLCanvasElement>;
}> = ({ objectUrl, region, canvasRef }) => {
  const [canvasUrl, setCanvasUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const width = image.naturalWidth;
      const height = image.naturalHeight;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw original image
      ctx.drawImage(image, 0, 0);

      // Create darkened overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, width, height);

      // Brighten the matched region
      const x = Math.round(region.x * width);
      const y = Math.round(region.y * height);
      const w = Math.round(region.w * width);
      const h = Math.round(region.h * height);

      // Clear the region to show the original image
      ctx.clearRect(x, y, w, h);
      ctx.drawImage(image, x, y, w, h, x, y, w, h);

      // Draw a colored border around the region
      ctx.strokeStyle = 'rgba(255, 59, 48, 0.9)'; // Red
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCanvasUrl(dataUrl);
      setDimensions({ w: width, h: height });
    };
    image.src = objectUrl;
  }, [objectUrl, region, canvasRef]);

  return (
    <>
      {canvasUrl && (
        <img
          src={canvasUrl}
          alt="highlighted result"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      )}
      <canvas ref={canvasRef} className="hidden" />
    </>
  );
};
