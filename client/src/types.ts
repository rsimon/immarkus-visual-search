export interface ImageEntry {
  name: string;
  handle: FileSystemFileHandle;
  url?: string; // object URL generated on demand
}

export interface EmbeddingsHandles {
  jsonHandle?: FileSystemFileHandle;
  binHandle?: FileSystemFileHandle;
}

export interface AppState {
  folderHandle: FileSystemDirectoryHandle | null;
  images: ImageEntry[];
  embeddings: EmbeddingsHandles;

  // actions
  loadFolder: (handle: FileSystemDirectoryHandle) => Promise<void>;
  clear: () => void;
  loadEmbeddings: () => Promise<{ json: any; bin: ArrayBuffer } | null>;
}
