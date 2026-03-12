import { useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import type { ImageEntry, BoundingBox } from '@/types';

/**
 * Displays a cropped region of an image as a thumbnail.
 * The region is specified by a normalized bounding box [0, 1].
 * Lazily loads the image when it enters the viewport.
 */
export const CroppedImage: React.FC<{ entry: ImageEntry; box: BoundingBox }> = ({
  entry,
  box,
}) => {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ref, inView } = useInView({ rootMargin: '200px' });

  useEffect(() => {
    let cancelled = false;

    if (inView && !src) {
      setLoading(true);
      (async () => {
        try {
          const file = await entry.handle.getFile();
          const image = new Image();
          image.onload = () => {
            if (cancelled) return;

            // Compute cropped region in pixels
            const x = Math.round(box.x * image.naturalWidth);
            const y = Math.round(box.y * image.naturalHeight);
            const w = Math.round(box.w * image.naturalWidth);
            const h = Math.round(box.h * image.naturalHeight);

            // Draw cropped region to canvas
            const canvas = canvasRef.current;
            if (canvas) {
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                setSrc(dataUrl);
              }
            }
          };
          image.src = URL.createObjectURL(file);
        } catch (err) {
          console.error('Error loading cropped image:', err);
        } finally {
          setLoading(false);
        }
      })();
    }

    return () => {
      cancelled = true;
      if (src && src.startsWith('data:')) {
        // Data URLs don't need revoking, but regular object URLs do
      }
    };
  }, [entry.handle, box, inView, src]);

  return (
    <div
      ref={ref}
      className="w-full h-full bg-gray-100 flex items-center justify-center overflow-hidden"
    >
      {src ? (
        <img src={src} alt={`${entry.name} - cropped region`} className="w-full h-full object-contain" />
      ) : (
        <span className="text-xs text-gray-500">{loading ? 'loading...' : 'pending'}</span>
      )}
      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
