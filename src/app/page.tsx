"use client";

import { useState } from 'react';
import Library from '@/components/Library';
import Reader from '@/components/Reader';
import Highlights from '@/components/Highlights';
import Discover from '@/components/Discover';
import Sidebar from '@/components/Sidebar';

type View = 'discover' | 'library' | 'highlights' | 'reader' | 'settings';

export default function Home() {
  const [view, setView] = useState<View>('discover');
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [highlightCfi, setHighlightCfi] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const openBook = (bookId: string, cfi?: string) => {
    setCurrentBookId(bookId);
    setHighlightCfi(cfi || null);
    setView('reader');
  };

  // Full screen Reader view (hides sidebar)
  if (view === 'reader' && currentBookId) {
    return (
      <Reader 
        bookId={currentBookId} 
        highlightCfi={highlightCfi || undefined}
        onBack={() => { 
          setCurrentBookId(null); 
          setHighlightCfi(null);
          setView('discover'); 
        }} 
        onBackToHighlights={() => {
          setCurrentBookId(null);
          setHighlightCfi(null);
          setView('highlights');
        }}
      />
    );
  }

  // Dashboard Layout with Sidebar
  return (
    <main className="flex h-screen w-full bg-[#070b13] overflow-hidden text-gray-200 font-sans">
      <Sidebar 
        currentView={view} 
        isCollapsed={isSidebarCollapsed}
        onNavigate={(v) => setView(v as View)} 
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      
      <div className="flex-1 flex flex-col h-full overflow-hidden relative pb-16 md:pb-0">
        {view === 'discover' && (
          <Discover 
            onOpenBook={openBook} 
            onViewAll={() => setView('library')} 
            onViewHighlights={() => setView('highlights')}
          />
        )}
        
        {view === 'library' && (
          <div className="flex-1 overflow-y-auto w-full h-full">
            <Library onOpenBook={openBook} onOpenHighlights={() => setView('highlights')} />
          </div>
        )}
        
        {view === 'highlights' && (
          <div className="flex-1 overflow-y-auto w-full h-full">
            <Highlights onBack={() => setView('library')} onOpenBook={openBook} />
          </div>
        )}

        {view === 'settings' && (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <h2 className="text-xl font-medium text-gray-300">Settings</h2>
              <p className="mt-2 text-sm max-w-sm">Global application settings will be available here soon.</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
