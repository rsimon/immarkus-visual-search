import { create } from 'zustand';
import type { ImageEntry, EmbeddingsHandles, AppState, BoundingBox, SearchResult, SearchCache } from '@/types';
import { encodeBbox } from '@/utils/url';

export const useStore = create<AppState>((set, get) => ({
  folderHandle: null,
  images: [],
  embeddings: {},
  searchCache: {},

  clear: () => {
    // revoke any object URLs we created
    get().images.forEach((img) => {
      if (img.url) URL.revokeObjectURL(img.url);
    });
    set({ folderHandle: null, images: [], embeddings: {}, searchCache: {} });
  },

  loadFolder: async (handle: FileSystemDirectoryHandle) => {
    const images: ImageEntry[] = [];
    const embeds: EmbeddingsHandles = {};

    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === 'file') {
        if (/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(name)) {
          images.push({ name, handle: entry });
        }
      } else if (entry.kind === 'directory' && name === '.visual-search') {
        for await (const [subname, subentry] of entry.entries()) {
          if (subentry.kind === 'file') {
            if (subname.endsWith('.json')) embeds.jsonHandle = subentry;
            else if (subname.endsWith('.bin')) embeds.binHandle = subentry;
          }
        }
      }
    }

    // keep gallery ordered by file name
    images.sort((a, b) => a.name.localeCompare(b.name));

    set({ folderHandle: handle, images, embeddings: embeds });
  },

  loadEmbeddings: async () => {
    const { embeddings } = get();
    if (!embeddings.jsonHandle || !embeddings.binHandle) return null;

    const jsonFile = await embeddings.jsonHandle.getFile();
    const binFile = await embeddings.binHandle.getFile();
    const json = await jsonFile.text().then((t) => JSON.parse(t));
    const bin = await binFile.arrayBuffer();
    return { json, bin };
  },

  getImageByName: (name: string) => {
    return get().images.find((img) => img.name === name);
  },

  cacheSearchResults: (imageId: string, box: BoundingBox, results: SearchResult[]) => {
    const key = `${imageId}__${encodeBbox(box)}`;
    set((state) => ({
      searchCache: { ...state.searchCache, [key]: results },
    }));
  },

  getSearchResults: (imageId: string, box: BoundingBox) => {
    const key = `${imageId}__${encodeBbox(box)}`;
    return get().searchCache[key];
  },
}));
