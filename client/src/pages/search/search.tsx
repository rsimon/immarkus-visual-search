import { useState } from 'react';
import { useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { useStore } from '@/store/store';
import { decodeBbox } from '@/utils/url';
import type { SearchResult } from '@/types';
import { CroppedImage } from '@/components/cropped-image';
import { Button } from '@/components/ui/button';
import { ResultModal } from './result-modal';

export const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const getImageByName = useStore((s) => s.getImageByName);
  const getSearchResults = useStore((s) => s.getSearchResults);

  // Parse query params
  const imageId = searchParams.get('imageId');
  const bboxParam = searchParams.get('box');

  const decodedImageId = imageId ? decodeURIComponent(imageId) : null;
  const box = bboxParam ? decodeBbox(bboxParam) : null;

  // Guard: invalid params
  const entry = decodedImageId ? getImageByName(decodedImageId) : null;
  if (!entry || !box) {
    return <Navigate to="/" replace />;
  }

  // Get cached results
  const results = getSearchResults(decodedImageId, box);

  const [selectedResultIndex, setSelectedResultIndex] = useState<number | null>(null);

  // Show placeholder if no results cached yet
  if (!results) {
    return (
      <main className="size-full flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-semibold mb-4">Search Results</h2>
        <p className="text-gray-600 mb-4">No results cached. Search not yet implemented.</p>
        <Button onClick={() => navigate(-1)}>Go back</Button>
      </main>
    );
  }

  // Show modal if a result is selected
  if (selectedResultIndex !== null && results[selectedResultIndex]) {
    return (
      <ResultModal
        result={results[selectedResultIndex]}
        onClose={() => setSelectedResultIndex(null)}
      />
    );
  }

  return (
    <main className="size-full flex flex-col bg-white p-4">
      {/* Header */}
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Search Results ({results.length})</h2>
        <Button size="sm" variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      {/* Query region and results layout */}
      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* Left: Query region */}
        <div className="flex flex-col items-center w-40 flex-shrink-0">
          <h3 className="text-sm font-semibold mb-2">Query</h3>
          <div className="w-full aspect-square border border-gray-300 rounded overflow-hidden bg-gray-50">
            <CroppedImage entry={entry} box={box} />
          </div>
        </div>

        {/* Right: Results grid */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <h3 className="text-sm font-semibold mb-2">Matches</h3>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2">
              {results.map((result, idx) => (
                <ResultThumbnail
                  key={idx}
                  result={result}
                  onClick={() => setSelectedResultIndex(idx)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

/**
 * Small thumbnail card for a single search result.
 */
const ResultThumbnail: React.FC<{
  result: SearchResult;
  onClick: () => void;
}> = ({ result, onClick }) => {
  const getImageByName = useStore((s) => s.getImageByName);
  const entry = getImageByName(result.sourceImageId);

  if (!entry) return null;

  const similarity = Math.round(result.similarity * 100);

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 p-2 border border-gray-300 rounded hover:bg-blue-50 transition-colors cursor-pointer"
    >
      <div className="w-full aspect-square border border-gray-200 rounded bg-gray-50 overflow-hidden">
        <CroppedImage entry={entry} box={result.region} />
      </div>
      <div className="text-xs font-semibold text-blue-600">{similarity}%</div>
      <div className="text-xs text-gray-600 truncate max-w-full">{result.sourceImageId}</div>
    </button>
  );
};
