import { Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/store';

export const Start = () => {
  const navigate = useNavigate();
  const loadFolder = useStore((s) => s.loadFolder);

  const onOpenFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      await loadFolder(handle);
      navigate('/gallery');
    } catch (err) {
      console.error('folder picker cancelled or failed', err);
    }
  };

  return (
    <main className="size-full flex items-center justify-center">
      <div>
        <h1 className="mb-4 text-lg">IMMARKUS Visual Search Demo</h1>
        <div className="flex justify-center gap-2">
          <Button 
            size="lg"
            onClick={onOpenFolder}>
            <Folder size={18} /> Open Index Folder
          </Button>
        </div>
      </div>
    </main>
  );
};