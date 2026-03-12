export interface ImageEntry {
  name: string;
  handle: FileSystemFileHandle;
  url?: string; // object URL generated on demand
}

export interface EmbeddingsHandles {
  jsonHandle?: FileSystemFileHandle;
  binHandle?: FileSystemFileHandle;
}

export interface BoundingBox {
  x: number; // 0-1 normalized
  y: number;
  w: number; // width
  h: number; // height
}

export interface SearchResult {
  sourceImageId: string; // filename of image containing the region
  region: BoundingBox; // normalized coordinates of match
  similarity: number; // 0-1 score
}

export type SearchCache = Record<string, SearchResult[]>; // key = serialized (imageId, box)

export interface AppState {
  folderHandle: FileSystemDirectoryHandle | null;
  images: ImageEntry[];
  embeddings: EmbeddingsHandles;
  searchCache: SearchCache;

  // actions
  loadFolder: (handle: FileSystemDirectoryHandle) => Promise<void>;
  clear: () => void;
  loadEmbeddings: () => Promise<{ json: any; bin: ArrayBuffer } | null>;
  getImageByName: (name: string) => ImageEntry | undefined;
  cacheSearchResults: (imageId: string, box: BoundingBox, results: SearchResult[]) => void;
  getSearchResults: (imageId: string, box: BoundingBox) => SearchResult[] | undefined;
  performSearch: (imageId: string, box: BoundingBox, limit?: number) => Promise<SearchResult[]>;
}
