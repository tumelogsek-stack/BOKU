
import type { Book as FoliateBook } from 'foliate-js/view.js';

export interface ProcessedBookMetadata {
  title: string;
  author: string;
  cover: Blob | null;
}

// Helper: unwrap localized objects like {en-US: "...", ru: "..."} to a plain string
const toStr = (val: unknown): string | undefined => {
  if (val == null) return undefined;
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(toStr).filter(Boolean).join(', ');
  if (typeof val === 'object') {
    // If it has a 'name' key (common for author objects), use that
    if ('name' in val) return toStr((val as Record<string, unknown>).name);
    // Otherwise grab the first value (locale key like en-US)
    const keys = Object.keys(val);
    if (keys.length > 0) return toStr((val as Record<string, unknown>)[keys[0]]);
  }
  return String(val);
};

export async function processBook(file: File): Promise<ProcessedBookMetadata> {
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPDF) {
    const { makePDF } = await import('./pdf-adapter');
    const bookData = await makePDF(file);
    return {
      title: bookData.metadata.title || file.name.replace(/\.[^/.]+$/, ""),
      author: bookData.metadata.author || "Unknown Author",
      cover: bookData.getCover ? await bookData.getCover() : null
    };
  }

  // foliate-js is an ES module and needs specific file imports
  const { makeBook } = await import("foliate-js/view.js");
  const bookData: FoliateBook = await makeBook(file);
  const metadataObj = bookData.metadata;

  let cover: Blob | null = null;
  if (bookData.getCover) {
    // @ts-expect-error - getCover is not typed in the d.ts but exists
    const coverBlob = await bookData.getCover();
    if (coverBlob) {
        cover = coverBlob;
    }
  }

  return {
    title: toStr(metadataObj?.title) || file.name.replace(/\.[^/.]+$/, ""),
    author: toStr(metadataObj?.author) || "Unknown Author",
    cover
  };
}
