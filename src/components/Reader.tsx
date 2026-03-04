
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TOCItem } from "foliate-js/view.js";
import { getBook, updateProgress } from "../lib/db";

interface ReaderProps {
  bookId: string;
  onBack: () => void;
}

export default function Reader({ bookId, onBack }: ReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | "sepia" | "sage" | "ink">("light");
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [metadata, setMetadata] = useState<{ title?: string; author?: string } | null>(null);
  const [toc, setToc] = useState<TOCItem[] | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showHeader, setShowHeader] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentChapter, setCurrentChapter] = useState<string>("");
  const initialCfiRef = useRef<string | null>(null);
  const [touchFeedback, setTouchFeedback] = useState<{ x: number, y: number, type: 'prev' | 'next' | 'toggle' } | null>(null);
  const actionRef = useRef<((type: 'prev' | 'next' | 'toggle', x?: number, y?: number) => void) | null>(null);

  const [keyMappings] = useState({
    next: ['ArrowRight', ' ', 'Space'],
    prev: ['ArrowLeft'], // Shift+Space is handled manually in check
    toggle: ['Enter', 'Escape']
  });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Avoid double-handling if event was already processed (e.g. by iframe handler bubbling to window)
    if (e.defaultPrevented) return;

    // Ignore if input is focused
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;

    const { key, shiftKey } = e;
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (keyMappings.next.includes(key) && !shiftKey) {
      e.preventDefault();
      actionRef.current?.('next', width * 0.8, height / 2);
    } else if (keyMappings.prev.includes(key) || (key === ' ' && shiftKey)) {
      e.preventDefault();
      actionRef.current?.('prev', width * 0.2, height / 2);
    } else if (keyMappings.toggle.includes(key) && key !== 'Escape') {
      // Don't prevent default for Escape key to allow browser back navigation
      e.preventDefault();
      actionRef.current?.('toggle', width / 2, height / 2);
    }
  }, [keyMappings]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const pointerStartRef = useRef<{x: number, y: number} | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("reader-theme") as typeof theme | null;
    const nextTheme = saved && ["light","dark","sepia","sage","ink"].includes(saved) ? saved : "light";
    setTheme(nextTheme as typeof theme);
    document.documentElement.setAttribute("data-theme", nextTheme as string);
  }, []);

  // Load book from DB
  useEffect(() => {
    if (bookId) {
      getBook(bookId).then(book => {
        if (book) {
          setFile(book.file);
          if (book.progressCfi) {
            initialCfiRef.current = book.progressCfi;
          }
        }
      });
    }
  }, [bookId]);

  const applyTheme = (t: typeof theme) => {
    setTheme(t);
    localStorage.setItem("reader-theme", t);
    document.documentElement.setAttribute("data-theme", t);
    setIsThemeOpen(false);
  };

  const toggleUI = useCallback(() => {
    setShowHeader(prev => !prev);
    setShowControls(prev => !prev);
  }, []);

  const triggerAction = useCallback((type: 'prev' | 'next' | 'toggle', x?: number, y?: number) => {
    const viewer = viewerRef.current?.querySelector("foliate-view");
    // Only allow toggle if viewer is not ready, otherwise require viewer
    if (!viewer && type !== 'toggle') return;

    // Use center of screen if no coordinates provided
    const feedbackX = x ?? window.innerWidth / 2;
    const feedbackY = y ?? window.innerHeight / 2;

    setTouchFeedback({ x: feedbackX, y: feedbackY, type });

    switch (type) {
      case 'prev':
        // @ts-expect-error - Custom element method
        viewer?.prev();
        break;
      case 'next':
        // @ts-expect-error - Custom element method
        viewer?.next();
        break;
      case 'toggle':
        toggleUI();
        break;
    }
  }, [toggleUI]);

  // Keep actionRef up to date
  useEffect(() => {
    actionRef.current = triggerAction;
  }, [triggerAction]);


  useEffect(() => {
    if (touchFeedback) {
      const timer = setTimeout(() => setTouchFeedback(null), 300);
      return () => clearTimeout(timer);
    }
  }, [touchFeedback]);

  useEffect(() => {
    if (!file || !viewerRef.current) return;
    const viewer = viewerRef.current.querySelector("foliate-view");
    // @ts-expect-error - Custom element property
    const renderer = viewer?.renderer;
    if (renderer && renderer.setStyles) {
      if (renderer.setAttribute) {
        renderer.setAttribute("max-inline-size", "100%");
        renderer.setAttribute("max-block-size", "100%");
        renderer.setAttribute("margin", "0");
        renderer.setAttribute("gap", "0");
      }

      const themeColors = {
        light: { text: "#333333", bg: "#FFFFFF" },
        dark: { text: "#FFFFFF", bg: "#000000" },
        sepia: { text: "#5C4033", bg: "#F4F1E8" },
        sage: { text: "#FFFFFF", bg: "#798165" },
        ink: { text: "#E6D2B5", bg: "#2C2725" },
      };
      const { text, bg } = themeColors[theme];
      const isDark = theme === "dark" || theme === "ink";
      
      renderer.setStyles(`
        html, body { 
          width: 100% !important;
          height: 100% !important;
          max-width: 100vw !important;
          margin: 0 !important;
          padding: 30px 30px !important;
          box-sizing: border-box !important;
          color: ${text} !important; 
          background-color: ${bg} !important; 
        }
        p, span, div, h1, h2, h3, h4, h5, h6 { 
          color: inherit !important; 
          background-color: transparent !important;
        }
        a { 
          color: inherit !important; 
          text-decoration: underline;
        }
        img {
          max-width: 100%;
          ${isDark ? 'filter: brightness(0.8) contrast(1.2);' : 'mix-blend-mode: multiply;'}
        }
      `);
    }
  }, [theme, file]);

  useEffect(() => {
    if (!file || !viewerRef.current) return;

    const container = viewerRef.current;
    let cancelled = false;

    async function initReader() {
      try {
        // foliate-js is an ES module and needs specific file imports
        const { makeBook } = await import("foliate-js/view.js");
        if (cancelled) return;

        const bookData = await makeBook(file!);
        if (cancelled) return;
        
        // Extract TOC
        if (bookData.toc) {
          setToc(bookData.toc);
        }

        // Extract metadata
        const metadataObj = bookData.metadata;

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

        setMetadata({ 
          title: toStr(metadataObj?.title), 
          author: toStr(metadataObj?.author) 
        });

        // Create the viewer element
        const viewer = document.createElement("foliate-view");

        // @ts-expect-error - Custom element event
        viewer.addEventListener("relocate", (e: CustomEvent) => {
          if (bookId) {
            updateProgress(bookId, e.detail.cfi, e.detail.fraction);
          }
          if (e.detail.tocItem) {
            setCurrentChapter(e.detail.tocItem.label);
          } else {
            setCurrentChapter("");
          }
        });

        // Attach listeners to the internal document when loaded
        // @ts-expect-error - Custom element event
        viewer.addEventListener("load", (e: CustomEvent) => {
          const doc = e.detail.doc as Document;
          
          // Attach shared keydown handler to iframe document to ensure keys work when focused
          doc.addEventListener('keydown', handleKeyDown);

          // Pointer tracking for click vs drag distinction
          doc.addEventListener("pointerdown", (ev: PointerEvent) => {
             pointerStartRef.current = {
               x: ev.clientX,
               y: ev.clientY
             };
          });

          // Navigation handling inside iframe
          // Use pointerup instead of click to distinguish touch from mouse.
          doc.addEventListener("pointerup", (ev: PointerEvent) => {
            const start = pointerStartRef.current;
            pointerStartRef.current = null; // reset

            // If no start point (because pointerdown happened outside iframe), ignore
            if (!start) return;
            
            // Calculate distance
            const dx = ev.clientX - start.x;
            const dy = ev.clientY - start.y;
            const distance = Math.sqrt(dx*dx + dy*dy);
            
            // Threshold: 5px movement to distinguish click from drag/selection
            if (distance > 5) return;

            const target = ev.target as HTMLElement;
            // Ignore if clicked on a link
            if (target.closest('a')) return;

            // Translate iframe-local X to outer window X for accurate zone detection
            // and correct visual feedback positioning
            const iframeEl = doc.defaultView?.frameElement;
            const iframeRect = iframeEl?.getBoundingClientRect();
            const outerX = (iframeRect?.left ?? 0) + ev.clientX;
            const outerY = (iframeRect?.top ?? 0) + ev.clientY;
            const width = window.innerWidth;

            // Unified handling for Mouse and Touch
            // Left Zone (Prev) - 30%
            if (outerX < width * 0.3) {
              ev.preventDefault(); // Prevent ghost clicks
              actionRef.current?.('prev', outerX, outerY);
            } 
            // Right Zone (Next) - 30%
            else if (outerX > width * 0.7) {
              ev.preventDefault(); // Prevent ghost clicks
              actionRef.current?.('next', outerX, outerY);
            } 
            // Center Zone (Toggle UI) - 40%
            else {
              ev.preventDefault(); // Prevent ghost clicks
              actionRef.current?.('toggle', outerX, outerY);
            }
          });
        });

        if (cancelled) return;
        
        // Clean up any existing viewer before adding the new one
        const oldViewer = container.querySelector("foliate-view");
        if (oldViewer) {
          try {
            // @ts-expect-error - Custom element method
            if (oldViewer.close) oldViewer.close();
          } catch { /* ignore */ }
          oldViewer.remove();
        }
        container.appendChild(viewer);

        // @ts-expect-error - Custom element method
        await viewer.open(bookData);
        if (cancelled) return;

        // Restore progress
        if (initialCfiRef.current) {
           // @ts-expect-error - Custom element method
           viewer.goTo(initialCfiRef.current);
           // Clear it so it's not reused if the effect re-runs for some reason
           initialCfiRef.current = null;
        }

        // @ts-expect-error - Accessing internal renderer to set layout
        const renderer = viewer.renderer;
        if (renderer) {
          renderer.setAttribute("max-inline-size", "100%");
          renderer.setAttribute("max-block-size", "100%");
          renderer.setAttribute("margin", "0");
          renderer.setAttribute("gap", "0");
          
          // Initial style injection
          const themeColors = {
            light: { text: "#333333", bg: "#FFFFFF" },
            dark: { text: "#FFFFFF", bg: "#000000" },
            sepia: { text: "#5C4033", bg: "#F4F1E8" },
            sage: { text: "#FFFFFF", bg: "#798165" },
            ink: { text: "#E6D2B5", bg: "#2C2725" },
          };
          const t = document.documentElement.getAttribute("data-theme") as typeof theme || "light";
           const { text, bg } = themeColors[t] || themeColors.light;
           const isDark = t === "dark" || t === "ink";

           if (renderer.setStyles) {
              renderer.setStyles(`
                 html, body { 
                   width: 100% !important;
                   height: 100% !important;
                   max-width: 100vw !important;
                   margin: 0 !important;
                   padding: 30px 30px !important;
                   box-sizing: border-box !important;
                   color: ${text} !important; 
                   background-color: ${bg} !important; 
                 }
                 p, span, div, h1, h2, h3, h4, h5, h6 { 
                   color: inherit !important; 
                   background-color: transparent !important;
                 }
                 a { 
                   color: inherit !important; 
                   text-decoration: underline;
                 }
                 img {
                   max-width: 100%;
                   ${isDark ? 'filter: brightness(0.8) contrast(1.2);' : 'mix-blend-mode: multiply;'}
                 }
              `);
           }
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error loading book:", error);
        }
      }
    }

    initReader();

    // Cleanup: properly close the viewer to disconnect its internal observers
    return () => {
      cancelled = true;
      const viewer = container.querySelector("foliate-view");
      if (viewer) {
        try {
          // @ts-expect-error - Custom element method
          if (viewer.close) viewer.close();
        } catch { /* ignore close errors */ }
        viewer.remove();
      }
    };
  }, [file, bookId, handleKeyDown]); // Re-init when file, bookId or handleKeyDown changes. triggerAction is accessed via actionRef inside event handlers.

  const nextPager = () => {
    const viewer = viewerRef.current?.querySelector("foliate-view");
    // @ts-expect-error - Custom element method
    if (viewer) viewer.next();
  };

  const prevPager = () => {
    const viewer = viewerRef.current?.querySelector("foliate-view");
    // @ts-expect-error - Custom element method
    if (viewer) viewer.prev();
  };

  const goToChapter = (href: string) => {
    const viewer = viewerRef.current?.querySelector("foliate-view");
    if (viewer) {
      setIsAnimating(true);
      // @ts-expect-error - Custom element method
      viewer.goTo(href);
      setTimeout(() => setIsAnimating(false), 500); // Reset after animation
    }
    setIsMenuOpen(false);
  };

  return (
    <div className={`readerContainer ${isAnimating ? "slide-in-right" : ""}`}>
      <style>{`
        /* TOC Menu Styles */
        .btnTOC {
          margin-right: 1rem;
        }

        .tocOverlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(4px);
          z-index: 100;
          display: flex;
          justify-content: flex-end; /* Align to right */
          animation: fadeIn 0.3s ease;
        }

        .tocMenu {
          width: 320px;
          max-width: 85%;
          height: 100%;
          background: var(--panel-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-left: 1px solid var(--glass-border); /* Border on left */
          box-shadow: -10px 0 30px rgba(0, 0, 0, 0.1); /* Shadow to left */
          display: flex;
          flex-direction: column;
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .tocHeader {
          padding: 2rem 1.5rem;
          border-bottom: 1px solid var(--glass-border);
        }

        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      {/* Header Trigger Zone */}
      <div 
        className="header-trigger"
        onMouseEnter={() => setShowHeader(true)}
        onMouseLeave={() => setShowHeader(false)}
        style={{ position: 'fixed', top: 0, width: '100%', zIndex: 100 }}
      >
        {/* Invisible area to catch mouse at top edge */}
        <div style={{ height: '40px', width: '100%', position: 'absolute', top: 0 }} />
        
        <header className={`header ${!showHeader ? "header-hidden" : ""}`}>
          <div className="titleGroup">
            <button 
                onClick={onBack}
                className="btn mr-4"
                title="Back to Library"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            {!metadata && <h1>Lumina Reader</h1>}
            {metadata && (
            <div className="bookMeta">
                <button 
                  className="bookChapterMobile btnTOC" 
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                >
                  {currentChapter || "Chapters"}
                </button>
                <span className="bookTitle">{metadata.title}</span>
                <span className="bookAuthor">{metadata.author}</span>
              </div>
          )}
          </div>
          <div className="headerActions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
            <div>
              <button 
                className="btn" 
                onClick={() => setIsThemeOpen(v => !v)} 
                aria-haspopup="menu" 
                aria-expanded={isThemeOpen}
                aria-label="Theme menu"
              >
                Theme: {theme[0].toUpperCase() + theme.slice(1)}
              </button>
              {isThemeOpen && (
                <div 
                  role="menu" 
                  style={{
                    position: 'absolute',
                    top: '2.5rem',
                    right: 0,
                    minWidth: '180px',
                    background: 'var(--panel-bg)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: 'var(--shadow)',
                    borderRadius: '8px',
                    padding: '0.25rem',
                    zIndex: 1000
                  }}
                >
                  {(["light","dark","sepia","sage","ink"] as const).map((t) => (
                    <button
                      key={t}
                      role="menuitemradio"
                      className="btn"
                      onClick={() => applyTheme(t)}
                      aria-checked={theme === t}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '0.5rem 0.75rem'
                      }}
                    >
                      <span>{t[0].toUpperCase() + t.slice(1)}</span>
                      <span 
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border: '1px solid var(--glass-border)',
                          background: t === "light" ? "#FFFFFF"
                            : t === "dark" ? "#000000"
                            : t === "sepia" ? "#F4F1E8"
                            : t === "sage" ? "#798165"
                            : "#2C2725"
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {file && toc && (
              <button className="btn btnTOC desktop-only" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                {isMenuOpen ? "Close Menu" : currentChapter || "Chapters"}
              </button>
            )}
          </div>
        </header>
      </div>

      {isMenuOpen && toc && (
        <div className="tocOverlay" onClick={() => setIsMenuOpen(false)}>
          <div className="tocMenu" onClick={(e) => e.stopPropagation()}>
            <div className="tocHeader">
              <h3>Table of Contents</h3>
            </div>
            <div className="tocList">
              {toc.map((item, index) => (
                <div key={index} className="tocItem">
                  <button 
                    className="tocLink" 
                    onClick={() => item.href && goToChapter(item.href)}
                  >
                    {item.label}
                  </button>
                  {item.subitems && item.subitems.length > 0 && (
                    <div className="tocSublist">
                      {item.subitems.map((sub: TOCItem, subIndex: number) => (
                        <button 
                          key={subIndex} 
                          className="tocLink tocSublink" 
                          onClick={() => sub.href && goToChapter(sub.href)}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Touch Feedback Animation */}
      {touchFeedback && (
        <div
          className="touch-feedback"
          style={{
            left: touchFeedback.x,
            top: touchFeedback.y,
          }}
        />
      )}

      {!file && (
        <div style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          color: 'var(--reader-text)'
        }}>
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-current opacity-50"></div>
          <p>Loading book...</p>
        </div>
      )}

      <div ref={viewerRef} className="viewer" />

      {file && (
        <div 
          className="controls-trigger"
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => setShowControls(false)}
          style={{ position: 'fixed', bottom: 0, width: '100%', zIndex: 100 }}
        >
          {/* Invisible area to catch mouse at bottom edge */}
          <div style={{ height: '80px', width: '100%', position: 'absolute', bottom: 0 }} />
          
          <div className={`controls ${!showControls ? "controls-hidden" : ""}`}>
            <button className="btn" onClick={(e) => { e.stopPropagation(); prevPager(); }}>
              Previous
            </button>
            <button className="btn" onClick={(e) => { e.stopPropagation(); nextPager(); }}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
