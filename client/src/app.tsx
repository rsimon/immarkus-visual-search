import { Routes, Route, Navigate } from 'react-router-dom';
import { Start } from './pages/start';
import { Gallery } from './pages/gallery';
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
      {/* catch-all redirects back to start */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};