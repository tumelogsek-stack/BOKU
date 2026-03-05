
import { openDB, DBSchema } from 'idb';

export interface DBBook {
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
  progressFraction: number;
}

export interface Highlight {
  id: string;          // auto-generated UUID
  bookId: string;      // FK to Book.id
  text: string;        // selected text content
  cfi: string;         // EPUB CFI for location
  color: string;       // highlight color hex
  note?: string;       // optional user note
  chapter?: string;    // chapter label at time of highlight
  bookTitle?: string;  // denormalized for easy display
  bookAuthor?: string; // denormalized for easy display
  createdAt: number;   // timestamp
}

interface BookstoreDB extends DBSchema {
  books: {
    key: string;
    value: DBBook;
    indexes: { 'by-last-read': number };
  };
  highlights: {
    key: string;
    value: Highlight;
    indexes: {
      'by-book': string;
      'by-created': number;
    };
  };
}

const DB_NAME = 'lumina-reader-db';
const DB_VERSION = 3;

export async function initDB() {
  return openDB<BookstoreDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore('books', {
          keyPath: 'id',
        });
        store.createIndex('by-last-read', 'lastReadAt');
      }
      if (oldVersion < 3) {
        const highlightStore = db.createObjectStore('highlights', {
          keyPath: 'id',
        });
        highlightStore.createIndex('by-book', 'bookId');
        highlightStore.createIndex('by-created', 'createdAt');
      }
    },
  });
}

export async function saveBook(file: File, metadata: { title?: string; author?: string; cover?: Blob | null; genre?: string[] }) {
  const db = await initDB();
  const id = `${metadata.title || 'Unknown'}-${metadata.author || 'Unknown'}-${file.size}`.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  
  const existing = await db.get('books', id);
  
  const book: DBBook = {
    id,
    file,
    metadata,
    addedAt: existing?.addedAt || Date.now(),
    lastReadAt: Date.now(),
    progressCfi: existing?.progressCfi,
    progressFraction: existing?.progressFraction || 0,
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

export async function updateProgress(id: string, cfi: string, fraction?: number) {
  const db = await initDB();
  const book = await db.get('books', id);
  if (book) {
    book.progressCfi = cfi;
    if (fraction !== undefined) {
      book.progressFraction = fraction;
    }
    book.lastReadAt = Date.now();
    await db.put('books', book);
  }
}

export async function deleteBook(id: string) {
  const db = await initDB();
  await db.delete('books', id);
}

// --- Highlight CRUD ---

export async function saveHighlight(highlight: Omit<Highlight, 'id' | 'createdAt'>): Promise<string> {
  const db = await initDB();
  const id = crypto.randomUUID();
  const full: Highlight = {
    ...highlight,
    id,
    createdAt: Date.now(),
  };
  await db.put('highlights', full);
  return id;
}

export async function getHighlightsByBook(bookId: string): Promise<Highlight[]> {
  const db = await initDB();
  return db.getAllFromIndex('highlights', 'by-book', bookId);
}

export async function getAllHighlights(): Promise<Highlight[]> {
  const db = await initDB();
  const all = await db.getAllFromIndex('highlights', 'by-created');
  return all.reverse(); // newest first
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('highlights', id);
}
