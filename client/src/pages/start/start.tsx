import { Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const Start = () => {

  const onOpenFolder = () => {

  }

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
  )

}