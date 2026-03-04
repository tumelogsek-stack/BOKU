
import { openDB, DBSchema } from 'idb';

export interface Book {
  id: string; // unique ID based on book title + author or hash
  file: File;
  metadata: {
    title?: string;
    author?: string;
    cover?: Blob | null;
    genre?: string[];
  };
  addedAt: number;
  lastReadAt: number;
  progressCfi?: string;
  progressPercentage: number;
}

interface BookstoreDB extends DBSchema {
  books: {
    key: string;
    value: Book;
    indexes: { 'by-last-read': number };
  };
}

const DB_NAME = 'lumina-reader-db';
const DB_VERSION = 2; // Incrementing version to ensure schema updates if needed

export async function initDB() {
  return openDB<BookstoreDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (oldVersion < 1) {
        const store = db.createObjectStore('books', {
          keyPath: 'id',
        });
        store.createIndex('by-last-read', 'lastReadAt');
      }
      // If we need new indexes in the future, add them here
    },
  });
}

export async function saveBook(file: File, metadata: { title?: string; author?: string; cover?: Blob | null; genre?: string[] }) {
  const db = await initDB();
  // Create a unique ID. Simple approach: title-author-size
  // In a real app, might want to hash the file content or use a UUID.
  const id = `${metadata.title || 'Unknown'}-${metadata.author || 'Unknown'}-${file.size}`.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  
  const existing = await db.get('books', id);
  
  const book: Book = {
    id,
    file,
    metadata,
    addedAt: existing?.addedAt || Date.now(),
    lastReadAt: Date.now(),
    progressCfi: existing?.progressCfi,
    progressPercentage: existing?.progressPercentage || 0,
  };
  
  await db.put('books', book);
  return id;
}

export async function getBook(id: string) {
  const db = await initDB();
  return db.get('books', id);
}

export async function getAllBooks() {
  const db = await initDB();
  return db.getAllFromIndex('books', 'by-last-read');
}

export async function updateProgress(id: string, cfi: string, percentage?: number) {
  const db = await initDB();
  const book = await db.get('books', id);
  if (book) {
    book.progressCfi = cfi;
    if (percentage !== undefined) {
      book.progressPercentage = percentage;
    }
    book.lastReadAt = Date.now();
    await db.put('books', book);
  }
}

export async function deleteBook(id: string) {
  const db = await initDB();
  await db.delete('books', id);
}
