import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import type { ImageEntry } from '@/types';

export const LazyImage: React.FC<{ entry: ImageEntry }> = ({ entry }) => {
  const [src, setSrc] = useState<string | null>(null);
  const { ref, inView } = useInView({ rootMargin: '200px' });

  useEffect(() => {
    let cancelled = false;
    if (inView && !src) {
      (async () => {
        const file = await entry.handle.getFile();
        if (cancelled) return;
        const url = URL.createObjectURL(file);
        setSrc(url);
      })();
    }
    return () => {
      cancelled = true;
      if (src) URL.revokeObjectURL(src);
    };
  }, [entry.handle, inView, src]);

  return (
    <div ref={ref} className="w-full h-full bg-gray-100 flex items-center justify-center">
      {src ? <img src={src} alt={entry.name} className="object-contain" /> : <span className="text-xs text-gray-500">loading...</span>}
    </div>
  );
};
