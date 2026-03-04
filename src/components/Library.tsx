
"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Book, getAllBooks, saveBook, deleteBook } from '../lib/db';
import { processBook } from '../lib/book-utils';

interface LibraryProps {
  onOpenBook: (bookId: string) => void;
}

type SortOption = 'lastRead' | 'title' | 'author' | 'progress';

export default function Library({ onOpenBook }: LibraryProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('lastRead');
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    try {
      setIsLoading(true);
      const allBooks = await getAllBooks();
      // getAllFromIndex returns in ascending order, so we reverse to get most recent first
      setBooks(allBooks.reverse());
    } catch (err) {
      console.error("Failed to load books:", err);
      setError("Failed to load library. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Reset theme to default when entering library
    document.documentElement.removeAttribute("data-theme");
    loadBooks();
  }, [loadBooks]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setIsImporting(true);
    setError(null);
    const files = Array.from(e.target.files);

    try {
      for (const file of files) {
        try {
          const metadata = await processBook(file);
          await saveBook(file, {
            title: metadata.title,
            author: metadata.author,
            cover: metadata.cover
          });
        } catch (err) {
          console.error(`Failed to process ${file.name}:`, err);
          setError(`Failed to import ${file.name}. It might be corrupted or invalid.`);
        }
      }
      await loadBooks();
    } catch (err) {
      setError("An unexpected error occurred during import.");
      console.error(err);
    } finally {
      setIsImporting(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this book?")) {
      await deleteBook(id);
      await loadBooks();
    }
  };

  const filteredAndSortedBooks = useMemo(() => {
    let result = [...books];

    // Filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(b => 
        (b.metadata.title?.toLowerCase().includes(query)) ||
        (b.metadata.author?.toLowerCase().includes(query))
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return (a.metadata.title || '').localeCompare(b.metadata.title || '');
        case 'author':
          return (a.metadata.author || '').localeCompare(b.metadata.author || '');
        case 'progress':
          return (b.progressPercentage || 0) - (a.progressPercentage || 0);
        case 'lastRead':
        default:
          return b.lastReadAt - a.lastReadAt;
      }
    });

    return result;
  }, [books, searchQuery, sortBy]);

  const CoverImage = ({ book }: { book: Book }) => {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
      if (book.metadata.cover) {
        const objectUrl = URL.createObjectURL(book.metadata.cover);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
      }
    }, [book.metadata.cover]);

    if (url) {
      return <img src={url} alt={book.metadata.title} className="w-full h-full object-cover" />;
    }

    return (
      <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-500">
        <span className="text-4xl">📚</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">My Library</h1>
          <p className="text-gray-500 dark:text-gray-400">
            {books.length} {books.length === 1 ? 'book' : 'books'} loaded
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
            <input 
              type="text" 
              placeholder="Search library..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="lastRead">Recent</option>
              <option value="title">Title</option>
              <option value="author">Author</option>
              <option value="progress">Progress</option>
            </select>

            <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 shadow' : 'text-gray-500 dark:text-gray-400'}`}
                aria-label="Grid View"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 shadow' : 'text-gray-500 dark:text-gray-400'}`}
                aria-label="List View"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
            </div>

            <label className="flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors">
              <span className="mr-2">Import Book</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              <input 
                type="file" 
                accept=".epub,.mobi,.azw3" 
                multiple 
                className="hidden" 
                onChange={handleFileUpload}
                disabled={isImporting}
              />
            </label>
        </div>
      </header>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <span className="block sm:inline">{error}</span>
          <span className="absolute top-0 right-0 px-4 py-3" onClick={() => setError(null)}>
            <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
          </span>
        </div>
      )}

      {isImporting && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl text-center">
               <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
               <p className="text-lg font-semibold">Importing books...</p>
               <p className="text-sm text-gray-500">Please wait while we process your files.</p>
            </div>
         </div>
      )}

      {books.length === 0 && !isLoading ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
          <p className="text-xl text-gray-500 dark:text-gray-400 mb-4">Your library is empty</p>
          <p className="text-gray-400 mb-6">Import your first book to get started</p>
          <label className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors">
            Import Book
            <input 
              type="file" 
              accept=".epub" 
              className="hidden" 
              onChange={handleFileUpload}
            />
          </label>
        </div>
      ) : (
        <div className={viewMode === 'grid' 
          ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6" 
          : "flex flex-col gap-4"
        }>
          {filteredAndSortedBooks.map((book) => (
            <div 
              key={book.id}
              onClick={() => onOpenBook(book.id)}
              className={`group bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-100 dark:border-gray-700 overflow-hidden relative
                ${viewMode === 'list' ? 'flex flex-row h-32' : 'flex flex-col h-full'}
              `}
            >
              <button 
                onClick={(e) => handleDelete(e, book.id)}
                className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Delete book"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>

              <div className={viewMode === 'grid' ? "aspect-[2/3] w-full relative" : "aspect-[2/3] h-full relative"}>
                 <CoverImage book={book} />
                 <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
                   <div 
                     className="h-full bg-green-500" 
                     style={{ width: `${(book.progressPercentage || 0) * 100}%` }}
                   />
                 </div>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 mb-1" title={book.metadata.title}>
                    {book.metadata.title || "Untitled"}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                    {book.metadata.author || "Unknown Author"}
                  </p>
                </div>
                
                <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                  <span>{Math.round((book.progressPercentage || 0) * 100)}% read</span>
                  {viewMode === 'list' && (
                    <span>Last opened: {new Date(book.lastReadAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
