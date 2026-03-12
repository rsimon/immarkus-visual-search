import { Routes, Route, Navigate } from 'react-router-dom';
import { Start } from './pages/start';
import { Gallery } from './pages/gallery';
import { ImageView } from './pages/image/image';
import { SearchPage } from './pages/search/search';
import { useStore } from '@/store/store';

export const App = () => {
  const folderHandle = useStore((s) => s.folderHandle);

  return (
    <Routes>
      <Route path="/" element={<Start />} />
      <Route
        path="/gallery"
        element={folderHandle ? <Gallery /> : <Navigate to="/" replace />}
      />
      <Route
        path="/image/:id"
        element={folderHandle ? <ImageView /> : <Navigate to="/" replace />}
      />
      <Route
        path="/search"
        element={folderHandle ? <SearchPage /> : <Navigate to="/" replace />}
      />
      {/* catch-all redirects back to start */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};