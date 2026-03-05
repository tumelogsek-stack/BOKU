
"use client";

import { useState } from 'react';
import Library from '@/components/Library';
import Reader from '@/components/Reader';
import Highlights from '@/components/Highlights';

type View = 'library' | 'highlights' | 'reader';

export default function Home() {
  const [view, setView] = useState<View>('library');
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [highlightCfi, setHighlightCfi] = useState<string | null>(null);

  const openBook = (bookId: string, cfi?: string) => {
    setCurrentBookId(bookId);
    setHighlightCfi(cfi || null);
    setView('reader');
  };

  if (view === 'reader' && currentBookId) {
    return (
      <Reader 
        bookId={currentBookId} 
        highlightCfi={highlightCfi || undefined}
        onBack={() => { 
          setCurrentBookId(null); 
          setHighlightCfi(null);
          setView('library'); 
        }} 
        onBackToHighlights={() => {
          setCurrentBookId(null);
          setHighlightCfi(null);
          setView('highlights');
        }}
      />
    );
  }

  if (view === 'highlights') {
    return (
      <Highlights
        onBack={() => setView('library')}
        onOpenBook={openBook}
      />
    );
  }

  return (
    <main>
      <Library onOpenBook={openBook} onOpenHighlights={() => setView('highlights')} />
    </main>
  );
}
