import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/store';
import type { BoundingBox } from '@/types';
import { encodeBbox, decodeBbox } from '@/utils/url';
import { Button } from '@/components/ui/button';

export const ImageView = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const getImageByName = useStore((s) => s.getImageByName);

  const decodedId = id ? decodeURIComponent(id) : null;
  const entry = decodedId ? getImageByName(decodedId) : null;

  const bboxParam = searchParams.get('bbox');
  const highlightBox = bboxParam ? decodeBbox(bboxParam) : null;

  // State for drawing a new box (only when not in highlight mode)
  const [dragState, setDragState] = useState<{
    isDrawing: boolean;
    start: { x: number; y: number } | null;
    current: { x: number; y: number } | null;
    box: BoundingBox | null;
  }>({ isDrawing: false, start: null, current: null, box: null });

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load the image and create object URL
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

  // Capture image natural dimensions on load
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
  };

  // Convert screen coordinates to normalized image coordinates
  const screenToNormalized = (screenX: number, screenY: number): { x: number; y: number } | null => {
    if (!imgRef.current || !imageDims) return null;

    const rect = imgRef.current.getBoundingClientRect();
    const relX = screenX - rect.left;
    const relY = screenY - rect.top;

    // Normalize to [0, 1] based on image natural dimensions
    // Note: the image may be scaled by CSS, so we need to account for that
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    const normX = (relX / displayWidth) * (imageDims.w / rect.width) * (rect.width / imageDims.w);
    const normY = (relY / displayHeight) * (imageDims.h / rect.height) * (rect.height / imageDims.h);

    // Simplified: just normalize to display size, then scale by aspect
    const normXSimple = Math.max(0, Math.min(1, relX / displayWidth));
    const normYSimple = Math.max(0, Math.min(1, relY / displayHeight));

    return { x: normXSimple, y: normYSimple };
  };

  // Mouse down: start drawing
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (highlightBox) return; // Don't draw in highlight mode
    if (!imageDims) return;

    const start = screenToNormalized(e.clientX, e.clientY);
    if (start) {
      setDragState({
        isDrawing: true,
        start,
        current: start,
        box: null,
      });
    }
  };

  // Mouse move: update current box
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.isDrawing || !dragState.start || !imageDims) return;

    const current = screenToNormalized(e.clientX, e.clientY);
    if (!current) return;

    const x = Math.min(dragState.start.x, current.x);
    const y = Math.min(dragState.start.y, current.y);
    const w = Math.abs(current.x - dragState.start.x);
    const h = Math.abs(current.y - dragState.start.y);

    setDragState({
      ...dragState,
      current,
      box: { x, y, w, h },
    });

    e.preventDefault();
  };

  // Mouse up: finalize box
  const handleMouseUp = () => {
    setDragState((state) => ({
      ...state,
      isDrawing: false,
    }));
  };

  // Guard: image not found
  if (!entry || !objectUrl) {
    return (
      <main className="size-full flex flex-col items-center justify-center">
        <p className="mb-4">Image not found.</p>
        <Button onClick={() => navigate('/')}>Go back</Button>
      </main>
    );
  }

  return (
    <main className="size-full flex flex-col bg-black">
      {/* Header */}
      <div className="bg-gray-900 text-white p-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold truncate">{decodedId}</h2>
        <Button size="sm" variant="outline" onClick={() => navigate('/gallery')}>
          Back to gallery
        </Button>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-auto relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="relative">
          <img
            ref={imgRef}
            src={objectUrl}
            alt={decodedId || 'image'}
            className="max-w-full max-h-full"
            onLoad={handleImageLoad}
            draggable={false}
          />

          {/* Overlay for box visualization */}
          {imageDims && dragState.box && (
            <div
              className="absolute border-2 border-yellow-400 bg-yellow-400/10"
              style={{
                left: `${dragState.box.x * 100}%`,
                top: `${dragState.box.y * 100}%`,
                width: `${dragState.box.w * 100}%`,
                height: `${dragState.box.h * 100}%`,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Highlight mode: colored stroke around region */}
          {highlightBox && (
            <div
              className="absolute border-3 border-red-500"
              style={{
                left: `${highlightBox.x * 100}%`,
                top: `${highlightBox.y * 100}%`,
                width: `${highlightBox.w * 100}%`,
                height: `${highlightBox.h * 100}%`,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* Footer: search button (only in draw mode) */}
      {!highlightBox && dragState.box && (
        <div className="bg-gray-900 text-white p-4 flex justify-center gap-2">
          <Button
            onClick={() => {
              navigate(
                `/search?imageId=${encodeURIComponent(decodedId!)}&box=${encodeBbox(dragState.box!)}`
              );
            }}
          >
            Search
          </Button>
          <Button variant="outline" onClick={() => setDragState({ isDrawing: false, start: null, current: null, box: null })}>
            Clear
          </Button>
        </div>
      )}
    </main>
  );
};
