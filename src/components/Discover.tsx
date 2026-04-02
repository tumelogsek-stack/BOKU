"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Book, Highlight, getAllBooks, getAllHighlights, togglePinned, toggleFavourite, toggleRecommendedPinned, saveBook } from '../lib/db';
import { processBook } from '../lib/book-utils';

interface DiscoverProps {
  onOpenBook: (bookId: string, cfi?: string) => void;
  onViewAll: () => void;
  onViewHighlights: () => void;
}

export default function Discover({ onOpenBook, onViewAll, onViewHighlights }: DiscoverProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [isImporting, setIsImporting] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [allBooks, allHighlights] = await Promise.all([
        getAllBooks(),
        getAllHighlights(),
      ]);
      setBooks(allBooks);
      setHighlights(allHighlights);
    } catch (err) {
      console.error("Failed to load discover data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-scroll to categories when searching
  useEffect(() => {
    if (!searchQuery.trim() || !categoriesRef.current || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const section = categoriesRef.current;

    requestAnimationFrame(() => {
      const containerTop = container.getBoundingClientRect().top;
      const sectionTop = section.getBoundingClientRect().top;
      const offset = container.scrollTop + (sectionTop - containerTop) - 32;
      container.scrollTo({ top: offset, behavior: 'smooth' });
    });
  }, [searchQuery]);

  // Derived Data
  const recommendedBooks = useMemo(() => {
    return [...books].sort((a, b) => {
      if (a.isRecommendedPinned && !b.isRecommendedPinned) return -1;
      if (!a.isRecommendedPinned && b.isRecommendedPinned) return 1;
      return b.lastReadAt - a.lastReadAt;
    }).slice(0, 5);
  }, [books]);

  const categories = ['All', 'Pinned', 'Completed', 'Not Started', 'Favourites'];

  const filteredBooks = useMemo(() => {
    let result = books;
    
    if (activeCategory === 'Pinned') {
      result = result.filter(b => b.isPinned);
    } else if (activeCategory === 'Completed') {
      result = result.filter(b => (b.progressPercentage || 0) >= 0.99);
    } else if (activeCategory === 'Not Started') {
      result = result.filter(b => (b.progressPercentage || 0) === 0);
    } else if (activeCategory === 'Favourites') {
      result = result.filter(b => b.isFavourite);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => 
        b.metadata.title?.toLowerCase().includes(q) || 
        b.metadata.author?.toLowerCase().includes(q)
      );
    }

    return [...result]
      .sort((a, b) => b.lastReadAt - a.lastReadAt)
      .slice(0, 10);
  }, [books, activeCategory, searchQuery]);

  const randomHighlights = useMemo(() => {
    if (highlights.length === 0) return [];
    const shuffled = [...highlights].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }, [highlights]);

  const handleTogglePinned = async (e: React.MouseEvent, bookId: string) => {
    e.stopPropagation();
    await togglePinned(bookId);
    loadData();
  };

  const handleToggleFavourite = async (e: React.MouseEvent, bookId: string) => {
    e.stopPropagation();
    await toggleFavourite(bookId);
    loadData();
  };

  const handleToggleRecommendedPinned = async (e: React.MouseEvent, bookId: string) => {
    e.stopPropagation();
    await toggleRecommendedPinned(bookId);
    loadData();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsImporting(true);
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
        }
      }
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
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

    const renderOverlay = () => (
      <div className="absolute top-2 right-2 flex flex-col gap-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => handleTogglePinned(e, book.id)}
          className={`p-1.5 rounded-lg backdrop-blur-md border border-white/20 transition-all ${book.isPinned ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-black/40 text-gray-300 hover:bg-black/60'}`}
          title={book.isPinned ? "Unpin book" : "Pin book"}
        >
          <svg className="w-4 h-4" fill={book.isPinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v4m-4-6.5C8 11 10 9 12 9s4 2 4 4.5v2.5H8v-2.5zM7 16h10v1H7v-1z" />
          </svg>
        </button>
        <button 
          onClick={(e) => handleToggleFavourite(e, book.id)}
          className={`p-1.5 rounded-lg backdrop-blur-md border border-white/20 transition-all ${book.isFavourite ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'bg-black/40 text-gray-300 hover:bg-black/60'}`}
          title={book.isFavourite ? "Remove from favourites" : "Add to favourites"}
        >
          <svg className="w-4 h-4" fill={book.isFavourite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
        </button>
      </div>
    );

    if (url) {
      return (
        <div className="relative w-full h-full rounded-xl overflow-hidden shrink-0">
           {renderOverlay()}
           <Image 
             src={url} 
             alt={book.metadata.title || 'Book Cover'} 
             fill
             className="object-cover rounded-xl transition-transform duration-300 group-hover:scale-105"
             unoptimized
           />
           <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-[#070b13] pointer-events-none z-20"></div>
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-gray-800 rounded-xl relative overflow-hidden flex flex-col items-center justify-center text-gray-500 shrink-0">
        {renderOverlay()}
        <span className="text-4xl mb-2">📚</span>
        <span className="text-xs text-center px-2 line-clamp-2">{book.metadata.title || 'Unknown'}</span>
        <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-[#070b13] pointer-events-none z-20"></div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#070b13] text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-screen flex bg-[#070b13] overflow-hidden">
      
      {/* Main Center Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-12 flex flex-col">
        
        {/* Sticky Header Search */}
        <header className="sticky top-0 z-40 pt-4 sm:pt-8 pb-4 sm:pb-6 flex items-center gap-4 max-w-2xl transition-all">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input 
              type="text" 
              placeholder="Search your favourite books..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-12 py-3 rounded-2xl border border-gray-800 bg-[#111827] text-gray-200 focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-500 transition-all font-medium"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-blue-500 transition-colors cursor-pointer"
              title="Import local book"
              disabled={isImporting}
            >
              {isImporting ? (
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              )}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".epub" 
              multiple 
              onChange={handleFileUpload} 
            />
          </div>
        </header>

        <div className="flex flex-col gap-10 pt-4">
          {/* Recommended Horizontal Scroll */}
          {recommendedBooks.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white tracking-wide">Recommended</h2>
                <button 
                  className="text-sm font-medium text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors bg-blue-500/10 px-3 py-1.5 rounded-lg cursor-pointer"
                  onClick={onViewAll}
                >
                  See All
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
              
              <div className="relative group/scroll">
                <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-6 pt-2 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
                  {recommendedBooks.map(book => (
                    <div 
                      key={book.id} 
                      onClick={() => onOpenBook(book.id)}
                      className="group flex-none w-36 sm:w-48 snap-start cursor-pointer transition-all hover:-translate-y-1 relative"
                    >
                      <div className="aspect-[2/3] w-full mb-3 shadow-2xl rounded-xl ring-1 ring-gray-800">
                        <CoverImage book={book} />
                      </div>
                      <div className="flex items-start justify-between gap-1 pr-1">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gray-100 text-sm leading-tight line-clamp-1">{book.metadata.title || "Untitled"}</h3>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{book.metadata.author || "Unknown Author"}</p>
                        </div>
                        <button 
                          onClick={(e) => handleToggleRecommendedPinned(e, book.id)}
                          className={`shrink-0 p-1 rounded-md transition-colors ${book.isRecommendedPinned ? 'text-blue-500' : 'text-gray-600 hover:text-gray-400'}`}
                          title={book.isRecommendedPinned ? "Unpin from Recommended" : "Pin to Recommended"}
                        >
                          <svg className="w-4 h-4" fill={book.isRecommendedPinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v4m-4-6.5C8 11 10 9 12 9s4 2 4 4.5v2.5H8v-2.5zM7 16h10v1H7v-1z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex-none w-12" />
                </div>
                
                <div className="absolute top-0 right-0 h-full w-24 bg-gradient-to-l from-[#070b13] to-transparent pointer-events-none z-10" />
              </div>
            </section>
          )}

          {/* Categories Section */}
          <section ref={categoriesRef} className="flex-1 pb-10 scroll-mt-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white tracking-wide">Categories</h2>
            </div>

            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors cursor-pointer
                    ${activeCategory === cat 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                      : 'bg-[#111827] text-gray-400 hover:bg-gray-800 hover:text-gray-200 border border-gray-800'}
                  `}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
              {filteredBooks.map(book => (
                <div 
                  key={book.id} 
                  onClick={() => onOpenBook(book.id)}
                  className="group flex flex-col cursor-pointer transition-all hover:-translate-y-1"
                >
                  <div className="aspect-[2/3] w-full mb-3 shadow-2xl rounded-xl ring-1 ring-gray-800">
                    <CoverImage book={book} />
                  </div>
                  <h3 className="font-semibold text-gray-100 text-sm leading-tight line-clamp-1">{book.metadata.title || "Untitled"}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">{book.metadata.author || "Unknown Author"}</p>
                </div>
              ))}
              {filteredBooks.length === 0 && (
                <div className="col-span-full py-10 text-center text-gray-500 bg-[#111827] rounded-2xl border border-gray-800">
                  No books found in this category.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <aside className="w-80 bg-[#0A0F1A] border-l border-gray-800 flex flex-col pt-8 pb-6 px-6 overflow-y-auto hidden lg:flex">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-lg font-bold text-gray-200 tracking-wide">Daily Inspiration</h2>
          <button 
            onClick={onViewHighlights}
            className="bg-[#111827] p-2 rounded-full border border-gray-800 hover:bg-gray-800 transition-colors cursor-pointer group"
          >
            <svg className="w-4 h-4 text-blue-500 group-hover:text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
          </button>
        </div>

        {randomHighlights.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 text-gray-500">
            <span className="text-4xl">✨</span>
            <p className="text-sm">Highlight some text in your books and they will appear here as daily inspiration!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {randomHighlights.map((highlight) => (
              <div 
                key={highlight.id}
                onClick={() => onOpenBook(highlight.bookId, highlight.cfi)}
                className="bg-[#111827] p-5 rounded-2xl border border-gray-800 relative cursor-pointer hover:border-gray-700 transition-colors group"
              >
                <div 
                  className="absolute top-0 left-0 w-1.5 h-full rounded-l-2xl opacity-80" 
                  style={{ backgroundColor: highlight.color }} 
                />
                <p className="text-sm text-gray-300 italic leading-relaxed mb-4 line-clamp-6">
                  &quot;{highlight.text}&quot;
                </p>
                <div className="pt-4 border-t border-gray-800/50 mt-auto flex items-center justify-between">
                  <div className="flex flex-col overflow-hidden pr-2">
                    <span className="text-xs font-semibold text-gray-400 line-clamp-1">
                      {highlight.bookTitle || 'Unknown Book'}
                    </span>
                    <span className="text-[10px] text-gray-600 mt-0.5 line-clamp-1">
                      {highlight.bookAuthor}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
