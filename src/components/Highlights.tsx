
"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { Highlight, getAllHighlights, deleteHighlight, getAllBooks, Book } from '../lib/db';

interface HighlightsProps {
  onBack: () => void;
  onOpenBook: (bookId: string, cfi?: string) => void;
}

const HIGHLIGHT_COLORS = [
  { value: '#FFD700', label: 'Gold' },
  { value: '#FF6B6B', label: 'Coral' },
  { value: '#6BCB77', label: 'Green' },
  { value: '#4D96FF', label: 'Blue' },
];

export default function Highlights({ onBack, onOpenBook }: HighlightsProps) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBook, setFilterBook] = useState<string>('all');
  const [filterColor, setFilterColor] = useState<string>('all');

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [allHighlights, allBooks] = await Promise.all([
        getAllHighlights(),
        getAllBooks(),
      ]);
      setHighlights(allHighlights);
      setBooks(allBooks);
    } catch (err) {
      console.error("Failed to load highlights:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
    loadData();
  }, [loadData]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteHighlight(id);
    setHighlights(prev => prev.filter(h => h.id !== id));
  };

  const filteredHighlights = useMemo(() => {
    let result = [...highlights];

    if (filterBook !== 'all') {
      result = result.filter(h => h.bookId === filterBook);
    }

    if (filterColor !== 'all') {
      result = result.filter(h => h.color === filterColor);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(h =>
        h.text.toLowerCase().includes(q) ||
        h.bookTitle?.toLowerCase().includes(q) ||
        h.chapter?.toLowerCase().includes(q) ||
        h.note?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [highlights, filterBook, filterColor, searchQuery]);

  // Get unique books that have highlights
  const booksWithHighlights = useMemo(() => {
    const bookIds = new Set(highlights.map(h => h.bookId));
    return books.filter(b => bookIds.has(b.id));
  }, [highlights, books]);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

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
      return (
        <div className="relative rounded-xl overflow-hidden shrink-0" style={{ width: 100, height: 150 }}>
           <Image 
             src={url} 
             alt={book.metadata.title || 'Book Cover'} 
             fill
             className="object-cover rounded-xl"
             unoptimized
           />
           <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-[#070b13] pointer-events-none z-20"></div>
        </div>
      );
    }

    return (
      <div className="book-cover-placeholder rounded-xl relative overflow-hidden shrink-0">
        <span>📚</span>
        <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-[#070b13] pointer-events-none z-20"></div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="highlights-page">
        <div className="highlights-loading">
          <div className="highlights-spinner" />
          <p>Loading highlights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="highlights-page">
      {/* Header */}
      <header className="highlights-header">
        <div className="highlights-header-left">
          <button onClick={onBack} className="highlights-back-btn" title="Back to Library">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="highlights-title">My Highlights</h1>
            <p className="highlights-count">
              {highlights.length} {highlights.length === 1 ? 'highlight' : 'highlights'} saved
            </p>
          </div>
        </div>
      </header>

      {/* Book Scroller */}
      <div className="highlights-books-scroller">
        <button
          className={`book-cover-item ${filterBook === 'all' ? 'active' : ''}`}
          onClick={() => setFilterBook('all')}
          title="All Books"
        >
          <div className="book-cover-placeholder all-books">
            <span>📚</span>
          </div>
          <span className="book-cover-title">All Books</span>
        </button>
        {booksWithHighlights.map(book => (
          <button
            key={book.id}
            className={`book-cover-item ${filterBook === book.id ? 'active' : ''}`}
            onClick={() => setFilterBook(book.id)}
            title={book.metadata.title}
          >
            <CoverImage book={book} />
            <span className="book-cover-title">{book.metadata.title || 'Untitled'}</span>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="highlights-filters">
        <input
          type="text"
          placeholder="Search highlights..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="highlights-search"
        />

        <div className="highlights-color-filters">
          <button
            className={`highlights-color-btn ${filterColor === 'all' ? 'active' : ''}`}
            onClick={() => setFilterColor('all')}
            title="All colors"
          >
            <span className="highlights-color-dot" style={{
              background: 'conic-gradient(#FFD700, #FF6B6B, #6BCB77, #4D96FF, #FFD700)'
            }} />
          </button>
          {HIGHLIGHT_COLORS.map(c => (
            <button
              key={c.value}
              className={`highlights-color-btn ${filterColor === c.value ? 'active' : ''}`}
              onClick={() => setFilterColor(filterColor === c.value ? 'all' : c.value)}
              title={c.label}
            >
              <span className="highlights-color-dot" style={{ background: c.value }} />
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {highlights.length === 0 ? (
        <div className="highlights-empty">
          <div className="highlights-empty-icon">✨</div>
          <h2>No highlights yet</h2>
          <p>Select text while reading to create your first highlight</p>
          <button onClick={onBack} className="highlights-empty-btn">
            Go to Library
          </button>
        </div>
      ) : filteredHighlights.length === 0 ? (
        <div className="highlights-empty">
          <div className="highlights-empty-icon">🔍</div>
          <h2>No matches</h2>
          <p>Try a different search term or filter</p>
        </div>
      ) : (
        <div className="highlights-masonry">
          {filteredHighlights.map((h) => (
            <div
              key={h.id}
              className="highlight-card"
              style={{ borderLeftColor: h.color, cursor: 'pointer' }}
              onClick={() => onOpenBook(h.bookId, h.cfi)}
            >
              <button
                className="highlight-delete"
                onClick={(e) => handleDelete(e, h.id)}
                title="Delete highlight"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>

              <blockquote className="highlight-text">
                &ldquo;{h.text}&rdquo;
              </blockquote>

              {h.note && (
                <p className="highlight-note">{h.note}</p>
              )}

              <div className="highlight-meta">
                <button
                  className="highlight-book-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenBook(h.bookId);
                  }}
                  title="Open this book"
                >
                  📖 {h.bookTitle || 'Unknown Book'}
                </button>
                {h.chapter && (
                  <span className="highlight-chapter">{h.chapter}</span>
                )}
                <span className="highlight-date">{formatDate(h.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
