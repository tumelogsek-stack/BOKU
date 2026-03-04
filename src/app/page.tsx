
"use client";

import { useState } from 'react';
import Library from '@/components/Library';
import Reader from '@/components/Reader';

export default function Home() {
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);

  if (currentBookId) {
    return (
      <Reader 
        bookId={currentBookId} 
        onBack={() => setCurrentBookId(null)} 
      />
    );
  }

  return (
    <main>
      <Library onOpenBook={setCurrentBookId} />
    </main>
  );
}
