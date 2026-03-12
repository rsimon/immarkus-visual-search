import { useStore } from '@/store/store';
import type { ImageEntry } from '@/types';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LazyImage } from './lazy-image';

export const Gallery = () => {
  const images = useStore((s) => s.images);
  const loadEmbeddings = useStore((s) => s.loadEmbeddings);
  const navigate = useNavigate();

  if (images.length === 0) {
    return (
      <main className="size-full flex flex-col items-center justify-center">
        <p className="mb-4">No images loaded.</p>
        <Button onClick={() => navigate('/')}>Go back</Button>
      </main>
    );
  }

  return (
    <main className="size-full p-4">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Gallery ({images.length})</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={async () => {
            const e = await loadEmbeddings();
            console.log('embeddings', e);
          }}>
            Load embeddings
          </Button>
          <Button size="sm" onClick={() => navigate('/')}>Change folder</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {images.map((img) => (
          <Link key={img.name} to={`/image/${encodeURIComponent(img.name)}`}>
            <div className="aspect-square cursor-pointer hover:opacity-75 transition-opacity">
              <LazyImage entry={img} />
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
};
