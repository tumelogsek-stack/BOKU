
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TOCItem } from "foliate-js/view.js";

export interface FoliateRenderer extends HTMLElement {
    setAttribute(name: string, value: string): void;
    setStyles(styles: string): void;
}

export interface FoliateView extends HTMLElement {
    renderer: FoliateRenderer;
    open(book: unknown): Promise<void>;
    next(): void;
    prev(): void;
    goTo(href: string): void;
    close?(): void;
    addAnnotation(annotation: { value: string, color?: string }, remove?: boolean): Promise<unknown>;
    deleteAnnotation(annotation: unknown): Promise<unknown>;
    getCFI(index: number, range: Range): string;
}
import { getBook, updateProgress, saveHighlight, getHighlightsByBook, type Highlight } from "../lib/db";

interface ReaderProps {
  bookId: string;
  highlightCfi?: string;
  onBack: () => void;
  onBackToHighlights?: () => void;
}

const getFontFaces = (origin: string) => `
  @font-face {
    font-family: 'Nunito';
    src: url('${origin}/fonts/Nunito-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
  }
  @font-face {
    font-family: 'Nunito';
    src: url('${origin}/fonts/Nunito-Bold.ttf') format('truetype');
    font-weight: 700;
    font-style: normal;
  }
  @font-face {
    font-family: 'Literata';
    src: url('${origin}/fonts/Literata-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
  }
  @font-face {
    font-family: 'Literata';
    src: url('${origin}/fonts/Literata-Italic.ttf') format('truetype');
    font-weight: 400;
    font-style: italic;
  }
  @font-face {
    font-family: 'Roboto';
    src: url('${origin}/fonts/Roboto-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
  }
  @font-face {
    font-family: 'Roboto';
    src: url('${origin}/fonts/Roboto-Bold.ttf') format('truetype');
    font-weight: 700;
    font-style: normal;
  }
`;

const KEY_MAPPINGS = {
  next: ['ArrowRight', ' ', 'Space'],
  prev: ['ArrowLeft'], // Shift+Space is handled manually in check
  toggle: ['Enter', 'Escape']
};

export default function Reader({ bookId, highlightCfi, onBack, onBackToHighlights }: ReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | "sepia" | "sage" | "ink">("light");
  const [fontFamily, setFontFamily] = useState<string>("Georgia");
  const [fontSize, setFontSize] = useState<string>("100%");
  const [layout, setLayout] = useState<"default" | "wide">("default");
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isTextMenuOpen, setIsTextMenuOpen] = useState(false);
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
  const highlightsRef = useRef<Highlight[]>([]);
  const activeDocRef = useRef<Document | null>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const textMenuRef = useRef<HTMLDivElement>(null);
  const fontFamilyRef = useRef(fontFamily);
  const fontSizeRef = useRef(fontSize);
  const layoutRef = useRef<"default" | "wide">("default");
  
  const [originalCfi, setOriginalCfi] = useState<string | null>(null);
  const originalCfiRef = useRef<string | null>(null);
  const originalFractionRef = useRef<number>(0);
  const lastUIToggleRef = useRef<number>(0);
  const currentFractionRef = useRef<number>(0);
  const abortControllersRef = useRef<Map<Document, AbortController>>(new Map());
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const highlightToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronous ref sync helper
  const updateOriginalCfi = useCallback((val: string | null) => {
    setOriginalCfi(val);
    originalCfiRef.current = val;
  }, []);

  
  // Keep refs in sync with state
  useEffect(() => {
    fontFamilyRef.current = fontFamily;
  }, [fontFamily]);
  
  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);



  // Highlight toolbar state
  const [highlightToolbar, setHighlightToolbar] = useState<{
    text: string;
    x: number;
    y: number;
    cfi: string;
  } | null>(null);
  const [highlightToast, setHighlightToast] = useState(false);
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers and listeners on unmount
  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      if (animatingTimerRef.current) clearTimeout(animatingTimerRef.current);
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
      if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current);
      if (highlightToastTimerRef.current) clearTimeout(highlightToastTimerRef.current);
      
      // Cleanup all abort controllers
      controllers.forEach(ac => ac.abort());
      controllers.clear();

      if (syncChannelRef.current) {
        syncChannelRef.current.close();
        syncChannelRef.current = null;
      }
    };
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Avoid double-handling if event was already processed (e.g. by iframe handler bubbling to window)
    if (e.defaultPrevented) return;

    // Ignore if input is focused
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;

    const { key, shiftKey } = e;
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (KEY_MAPPINGS.next.includes(key) && !shiftKey) {
      e.preventDefault();
      actionRef.current?.('next', width * 0.8, height / 2);
    } else if (KEY_MAPPINGS.prev.includes(key) || (key === ' ' && shiftKey)) {
      e.preventDefault();
      actionRef.current?.('prev', width * 0.2, height / 2);
    } else if (KEY_MAPPINGS.toggle.includes(key) && key !== 'Escape') {
      // Don't prevent default for Escape key to allow browser back navigation
      e.preventDefault();
      actionRef.current?.('toggle', width / 2, height / 2);
    }
  }, []);

  const handleKeyDownRef = useRef(handleKeyDown);
  useEffect(() => {
    handleKeyDownRef.current = handleKeyDown;
  }, [handleKeyDown]);

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

    // Load saved text settings
    const savedFont = localStorage.getItem("reader-font");
    if (savedFont) setFontFamily(savedFont);
    
    const savedSize = localStorage.getItem("reader-size");
    if (savedSize) setFontSize(savedSize);

    const savedLayout = localStorage.getItem('reader-layout') as 'default' | 'wide' | null;
    if (savedLayout && (savedLayout === 'default' || savedLayout === 'wide')) {
      setLayout(savedLayout);
    } else {
      localStorage.removeItem('reader-layout');
    }
  }, []);

  // Load book from DB
  useEffect(() => {
    if (bookId) {
      getBook(bookId).then(book => {
        if (book) {
          setFile(book.file);
          if (highlightCfi) {
            if (book.progressCfi) {
              updateOriginalCfi(book.progressCfi);
              originalFractionRef.current = book.progressFraction ?? 0;
            }
            initialCfiRef.current = highlightCfi;
          } else if (book.progressCfi) {
            initialCfiRef.current = book.progressCfi;
          }
        }
      });
    }
  }, [bookId, highlightCfi, updateOriginalCfi]);

  // Load highlights from DB and listen for sync
  useEffect(() => {
    if (bookId) {
      const load = () => getHighlightsByBook(bookId).then(h => {
        highlightsRef.current = h;
      });
      load();

      const channel = new BroadcastChannel('foliate-highlights-sync');
      syncChannelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data.type === 'REFRESH_HIGHLIGHTS' && event.data.bookId === bookId) {
          load();
        }
      };
      return () => {
        channel.close();
        syncChannelRef.current = null;
      };
    }
  }, [bookId]);

  const applyTheme = (t: typeof theme) => {
    setTheme(t);
    localStorage.setItem("reader-theme", t);
    document.documentElement.setAttribute("data-theme", t);
    setIsThemeOpen(false);
  };

  const applyFont = (font: string) => {
    setFontFamily(font);
    localStorage.setItem("reader-font", font);
  };

  const applyFontSize = (size: string) => {
    setFontSize(size);
    localStorage.setItem("reader-size", size);
  };

  const applyLayout = (l: "default" | "wide") => {
    setLayout(l);
    localStorage.setItem("reader-layout", l);
    const viewer = viewerRef.current?.querySelector("foliate-view") as FoliateView | null;
    const renderer = viewer?.renderer;
    if (renderer?.setAttribute) {
      if (l === "wide") {
        renderer.setAttribute("spread", "none");
        renderer.setAttribute("max-column-count", "1");
        renderer.setAttribute("max-inline-size", "9999px");
      } else {
        renderer.setAttribute("spread", "none");
        renderer.setAttribute("max-column-count", "2");
        renderer.setAttribute("max-inline-size", "720px");
      }
    }
  };


  const toggleUI = useCallback(() => {
    // We use a timestamp to prevent immediate re-triggering by hover events
    const now = Date.now();
    if (lastUIToggleRef.current && now - lastUIToggleRef.current < 500) return;
    lastUIToggleRef.current = now;

    setShowHeader(prev => !prev);
    setShowControls(prev => {
      const next = !prev;
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
      if (next) {
        uiTimeoutRef.current = setTimeout(() => {
          setShowHeader(false);
          setShowControls(false);
        }, 3000);
      }
      return next;
    });
  }, []);

  const handleHoverUI = (visible: boolean) => {
    // Separate guard for hover to avoid blocking legitimate hover events
    // but still protect against rapid flickers if needed.
    // We don't use the toggle guard here to avoid blocking hover after a click.
    
    // On mobile/touch devices, we might want to disable hover triggers entirely
    // simple check for hover capability
    if (window.matchMedia('(hover: hover)').matches) {
        if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
        if (!visible) {
          // Small delay so moving between sentinel → controls doesn't cause flicker
          uiTimeoutRef.current = setTimeout(() => {
            setShowHeader(false);
            setShowControls(false);
          }, 150);
        } else {
          setShowHeader(true);
          setShowControls(true);
        }
    }
  };

  const triggerAction = useCallback((type: 'prev' | 'next' | 'toggle', x?: number, y?: number) => {
    if (!file) return;
    const viewer = viewerRef.current?.querySelector("foliate-view") as FoliateView | null;
    // Use center of screen if no coordinates provided
    const feedbackX = x ?? window.innerWidth / 2;
    const feedbackY = y ?? window.innerHeight / 2;

    switch (type) {
      case 'prev':
        setTouchFeedback({ x: feedbackX, y: feedbackY, type });
        viewer?.prev();
        break;
      case 'next':
        setTouchFeedback({ x: feedbackX, y: feedbackY, type });
        viewer?.next();
        break;
      case 'toggle':
        // Only show feedback for toggle if it's a confirmed center tap
        if (x !== undefined) setTouchFeedback({ x: feedbackX, y: feedbackY, type });
        toggleUI();
        break;
    }
  }, [toggleUI, file]);

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
    const viewer = viewerRef.current.querySelector("foliate-view") as FoliateView | null;
    const renderer = viewer?.renderer;
    if (renderer && renderer.setStyles) {
      if (renderer.setAttribute) {
        renderer.setAttribute("max-inline-size", "100%");
        renderer.setAttribute("max-block-size", '100%');
        renderer.setAttribute("margin", "25px");
        renderer.setAttribute("gap", "0");
        renderer.setAttribute('flow', 'paginated');
        renderer.setAttribute('spread', 'none');
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
      const origin = window.location.origin;
      
      renderer.setStyles(`
        ${getFontFaces(origin)}
        
        html, body { 
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          padding: 60px ${layout === "wide" ? "30px" : "10%"} !important;
          box-sizing: border-box !important;
          color: ${text} !important; 
          background-color: ${bg} !important; 
          font-family: "${fontFamily}", serif !important;
          font-size: ${fontSize} !important;
        }
        p, span, div, h1, h2, h3, h4, h5, h6 { 
          color: inherit !important; 
          background-color: transparent !important;
          font-family: inherit !important;
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
  }, [theme, file, fontFamily, fontSize, layout]);

  useEffect(() => {
    if (!file || !viewerRef.current) return;

    const container = viewerRef.current;
    let cancelled = false;

    async function initReader() {
      try {
        // foliate-js is an ES module and needs specific file imports
        const { makeBook } = await import("foliate-js/view.js");
        const { Overlayer } = await import("foliate-js/overlayer.js");
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
        const viewer = document.createElement("foliate-view") as unknown as FoliateView;

        viewer.addEventListener("relocate", ((e: Event) => {
          const detail = (e as CustomEvent).detail;
          currentFractionRef.current = detail.fraction;
          if (bookId && originalCfiRef.current === null) {
            // Save progress only when not previewing a highlight
            updateProgress(bookId, detail.cfi, detail.fraction);
          }
          if (detail.tocItem) {
            setCurrentChapter(detail.tocItem.label);
          } else {
            setCurrentChapter("");
          }
        }) as EventListener);

        viewer.addEventListener('draw-annotation', ((e: Event) => {
            const { draw, annotation } = (e as CustomEvent).detail;
            const { color } = annotation;
            // Use hoisted Overlayer
            draw(Overlayer.highlight, { color });
        }) as EventListener);

        viewer.addEventListener('create-overlay', ((e: Event) => {
            const { index } = (e as CustomEvent).detail;
            
            // Robust CFI check: verify if highlight CFI belongs to this section
            const section = bookData.sections[index] as { cfi?: string };
            const baseCFI = section.cfi ?? `epubcfi(/6/${(index + 1) * 2})`;
            const prefix = baseCFI.replace(/\)$/, '');
            
            highlightsRef.current.forEach(h => {
                if (h.cfi && (h.cfi.startsWith(prefix + '!') || h.cfi === baseCFI)) {
                    viewer.addAnnotation({ value: h.cfi, color: h.color });
                }
            });
        }) as EventListener);

        // Attach listeners to the internal document when loaded
        viewer.addEventListener("load", ((e: Event) => {
          const { doc, index } = (e as CustomEvent).detail;
          
          // Store active document for later use (e.g. clearing selection)
          activeDocRef.current = doc;

          // Abort previous listeners for this document if any
          const oldAC = abortControllersRef.current.get(doc);
          if (oldAC) oldAC.abort();
          
          const ac = new AbortController();
          abortControllersRef.current.set(doc, ac);
          const { signal } = ac;

          // Attach shared keydown handler to iframe document to ensure keys work when focused
          doc.addEventListener('keydown', (ev: KeyboardEvent) => handleKeyDownRef.current(ev), { signal });

          // Selection change handling
          doc.addEventListener('selectionchange', () => {
            // Debounce: wait for selection to stabilize
            if (selectionTimeoutRef.current) clearTimeout(selectionTimeoutRef.current);
            selectionTimeoutRef.current = setTimeout(() => {
              const sel = doc.getSelection();
              if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
                 setShowHeader(false);
                 setShowControls(false);
              }

              if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                setHighlightToolbar(null);
                return;
              }
              const text = sel.toString().trim();
              if (text.length < 3) return; // ignore tiny selections

              const range = sel.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              const iframeEl = doc.defaultView?.frameElement;
              const iframeRect = iframeEl?.getBoundingClientRect();
              
              const iframeTop = iframeRect?.top ?? 0;
              const iframeLeft = iframeRect?.left ?? 0;
              const toolX = iframeLeft + rect.left + rect.width / 2;
              
              const TOOLBAR_HEIGHT = 50; // Approx height including padding
              const absoluteTop = iframeTop + rect.top;
              const absoluteBottom = iframeTop + rect.bottom;
              
              let toolY = absoluteTop - 10;
              
              // If not enough space above, position below
              if (absoluteTop < TOOLBAR_HEIGHT + 10) {
                  toolY = absoluteBottom + 10 + TOOLBAR_HEIGHT;
              }
              
              // Get CFI for selection
              const cfi = viewer.getCFI(index, range);

              setHighlightToolbar({ text, x: toolX, y: toolY, cfi });
            }, 300);
          }, { signal });

          // Pointer tracking for click vs drag distinction
          doc.addEventListener("pointerdown", (ev: PointerEvent) => {
             pointerStartRef.current = {
               x: ev.clientX,
               y: ev.clientY
             };
          }, { signal });

          // Navigation handling inside iframe
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
          }, { signal });

          // Cleanup listeners when viewer emits a "unload" or "load" again
          // Foliate-js doesn't have a reliable "unload" event for specific documents,
          // but removing the viewer (on unmount) or the document being garbage collected 
          // usually cleans up listeners. However, for selectionchange on 'doc', 
          // we should be careful if the same doc is reused.
        }) as EventListener);

        if (cancelled) return;
        
        // Clean up any existing viewer before adding the new one
        const oldViewer = container.querySelector("foliate-view") as FoliateView | null;
        if (oldViewer) {
          try {
            if (oldViewer.close) oldViewer.close();
          } catch { /* ignore */ }
          oldViewer.remove();
        }
        container.appendChild(viewer);

        await viewer.open(bookData);
        if (cancelled) return;

        // Apply all existing highlights after book is opened
        highlightsRef.current.forEach(h => {
            viewer.addAnnotation({ value: h.cfi, color: h.color });
        });

        // Restore progress
        if (initialCfiRef.current) {
           viewer.goTo(initialCfiRef.current);
           // Clear it so it's not reused if the effect re-runs for some reason
           initialCfiRef.current = null;
        }

        const renderer = viewer.renderer;
        if (renderer) {
          renderer.setAttribute("max-column-count", layoutRef.current === "wide" ? "1" : "2");
          renderer.setAttribute("max-inline-size", layoutRef.current === "wide" ? "9999px" : "720px");
          renderer.setAttribute("max-block-size", "100%");
          renderer.setAttribute("margin", "25px");
          renderer.setAttribute("gap", "0");
          renderer.setAttribute('flow', 'paginated');
          renderer.setAttribute('spread', 'none');
          
          // Initial style injection - use current state
          // Note: The separate effect will also run, but we set initial styles here to avoid FOUC
          const t = document.documentElement.getAttribute("data-theme") as typeof theme || "light";
           const { text, bg } = {
            light: { text: "#333333", bg: "#FFFFFF" },
            dark: { text: "#FFFFFF", bg: "#000000" },
            sepia: { text: "#5C4033", bg: "#F4F1E8" },
            sage: { text: "#FFFFFF", bg: "#798165" },
            ink: { text: "#E6D2B5", bg: "#2C2725" },
          }[t] || { text: "#333333", bg: "#FFFFFF" };
           const isDark = t === "dark" || t === "ink";
           const origin = window.location.origin;
           
           // We use the current state values for initial render
           // Since this effect only runs on file/bookId change, these values are snapshot at that time
           // The dedicated style effect will handle updates.

           if (renderer.setStyles) {
              renderer.setStyles(`
                 ${getFontFaces(origin)}
                 
                 html, body { 
                   width: 100% !important;
                   height: 100% !important;
                   max-width: 100% !important;
                   margin: 0 auto !important;
                   padding: 60px ${layoutRef.current === "wide" ? "30px" : "10%"} !important;
                   box-sizing: border-box !important;
                   color: ${text} !important; 
                   background-color: ${bg} !important; 
                   font-family: "${fontFamilyRef.current}", serif !important;
                   font-size: ${fontSizeRef.current} !important;
                 }
                 p, span, div, h1, h2, h3, h4, h5, h6 { 
                   color: inherit !important; 
                   background-color: transparent !important;
                   font-family: inherit !important;
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
      const viewer = container.querySelector("foliate-view") as FoliateView | null;
      if (viewer) {
        try {
          if (viewer.close) viewer.close();
        } catch { /* ignore close errors */ }
        viewer.remove();
      }
    };
  // handleKeyDownRef is used to avoid re-initializing the reader when handlers change.
  }, [file, bookId]); 

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeOpen(false);
      }
      if (textMenuRef.current && !textMenuRef.current.contains(event.target as Node)) {
        setIsTextMenuOpen(false);
      }
    }

    if (isThemeOpen || isTextMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isThemeOpen, isTextMenuOpen]);

  const goToChapter = (href: string) => {
    const viewer = viewerRef.current?.querySelector("foliate-view");
    if (viewer) {
      if (animatingTimerRef.current) clearTimeout(animatingTimerRef.current);
      setIsAnimating(true);
      try {
        // foliate-js goTo is fire-and-forget. 
        // Note: TOC may use relative hrefs which mostly work, 
        // but anchor fragments in some EPUBs can be problematic.
        (viewer as FoliateView).goTo(href);
        // Start animation clear timeout as a best-effort approximation
        animatingTimerRef.current = setTimeout(() => {
          setIsAnimating(false);
          animatingTimerRef.current = null;
        }, 500); 
      } catch (err) {
        console.error("Navigation error:", err);
        setIsAnimating(false);
        if (animatingTimerRef.current) {
          clearTimeout(animatingTimerRef.current);
          animatingTimerRef.current = null;
        }
      }
    }
    setIsMenuOpen(false);
  };

  const handleReturnToPosition = () => {
    const viewer = viewerRef.current?.querySelector("foliate-view") as FoliateView | null;
    if (viewer && originalCfi !== null) {
      if (originalCfi !== "") {
        // 1. Clear guard first so relocate can save
        const cfiToRestore = originalCfi;
        const fractionToRestore = originalFractionRef.current;
        updateOriginalCfi(null);
        
        // 2. Resave the position to DB explicitly
        updateProgress(bookId, cfiToRestore, fractionToRestore); 
        
        // 3. Navigate
        viewer.goTo(cfiToRestore);
      } else {
        updateOriginalCfi(null);
      }
    }
  };

  return (
    <div className="readerContainer">
      {file && originalCfi !== null && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--panel-bg)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          borderRadius: '100px',
          padding: '8px 16px',
          display: 'flex',
          gap: '12px',
          zIndex: 1000,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          alignItems: 'center'
        }}>
          {onBackToHighlights && (
            <button className="btn" onClick={onBackToHighlights} style={{ fontSize: '0.9rem', padding: '6px 16px', whiteSpace: 'nowrap' }}>
              Back to Highlights
            </button>
          )}
          <button className="btn" onClick={handleReturnToPosition} style={{ fontSize: '0.9rem', padding: '6px 16px', whiteSpace: 'nowrap', background: 'var(--accent-color)', color: 'white' }}>
            Resume Reading
          </button>
        </div>
      )}
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
        onMouseEnter={() => handleHoverUI(true)}
        onMouseLeave={() => handleHoverUI(false)}
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
                <span className="bookTitle">{metadata.title}</span>
                <span className="bookAuthor">{metadata.author}</span>
              </div>
          )}
          </div>
          <div className="headerActions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
            <button
              className="btn"
              onClick={() => applyLayout(layout === "default" ? "wide" : "default")}
              title="Toggle layout"
            >
              {layout === "default" ? "Wide" : "Default"}
            </button>
            <div ref={textMenuRef} style={{ position: 'relative' }}>
              <button
                className="btn"
                onClick={() => setIsTextMenuOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={isTextMenuOpen}
                aria-label="Text settings"
              >
                <span style={{ fontSize: '1.2rem', fontFamily: 'serif' }}>Aa</span>
              </button>
              {isTextMenuOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: '2.5rem',
                    right: 0,
                    minWidth: '220px',
                    background: 'var(--panel-bg)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: 'var(--shadow)',
                    borderRadius: '12px',
                    padding: '1rem',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                  }}
                >
                  {/* Font Family Section */}
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>FONT</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {[
                        { name: 'Georgia', label: 'Georgia' },
                        { name: 'Palatino Linotype', label: 'Palatino' },
                        { name: 'Helvetica', label: 'Helvetica' },
                        { name: 'Nunito', label: 'Nunito' },
                        { name: 'Literata', label: 'Literata' },
                        { name: 'Roboto', label: 'Roboto' }
                      ].map((f) => (
                        <button
                          key={f.name}
                          className="btn"
                          onClick={() => applyFont(f.name)}
                          role="menuitemradio"
                          aria-checked={fontFamily === f.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            fontFamily: f.name,
                            background: fontFamily === f.name ? 'rgba(108, 92, 231, 0.1)' : 'transparent',
                            color: fontFamily === f.name ? 'var(--accent-color)' : 'inherit'
                          }}
                        >
                          {f.label}
                          {fontFamily === f.name && (
                            <span style={{ fontSize: '0.8rem' }}>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size Section */}
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>SIZE</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', padding: '0.25rem' }}>
                      <button 
                        className="btn"
                        onClick={() => {
                          const current = parseInt(fontSize);
                          if (current > 70) applyFontSize(`${current - 10}%`);
                        }}
                        style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <span style={{ fontSize: '0.8rem' }}>A</span>
                      </button>
                      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{fontSize}</span>
                      <button 
                        className="btn"
                        onClick={() => {
                          const current = parseInt(fontSize);
                          if (current < 200) applyFontSize(`${current + 10}%`);
                        }}
                        style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <span style={{ fontSize: '1.2rem' }}>A</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div ref={themeMenuRef} style={{ position: 'relative' }}>
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
              <button className="btn btnTOC" onClick={() => setIsMenuOpen(!isMenuOpen)}>
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
                    className={`tocLink ${currentChapter === item.label ? "active" : ""}`} 
                    onClick={() => item.href && goToChapter(item.href)}
                  >
                    {item.label}
                  </button>
                  {item.subitems && item.subitems.length > 0 && (
                    <div className="tocSublist">
                      {item.subitems.map((sub: TOCItem, subIndex: number) => (
                        <button 
                          key={subIndex} 
                          className={`tocLink tocSublink ${currentChapter === sub.label ? "active" : ""}`} 
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

      <div ref={viewerRef} className={`viewer ${isAnimating ? "slide-in-right" : ""}`} />

      {/* Highlight Toolbar */}
      {highlightToolbar && (
        <div
          className="highlight-toolbar"
          style={{
            left: highlightToolbar.x,
            top: highlightToolbar.y,
          }}
        >
          {[
            { color: '#FFD700', label: 'Gold' },
            { color: '#FF6B6B', label: 'Coral' },
            { color: '#6BCB77', label: 'Green' },
            { color: '#4D96FF', label: 'Blue' },
          ].map(c => (
            <button
              key={c.color}
              className="highlight-toolbar-color"
              style={{ background: c.color }}
              title={c.label}
              onClick={async (e) => {
                e.stopPropagation();
                const cfi = highlightToolbar.cfi;
                const highlightData = {
                  bookId,
                  text: highlightToolbar.text,
                  cfi: cfi,
                  color: c.color,
                  chapter: currentChapter || undefined,
                  bookTitle: metadata?.title,
                  bookAuthor: metadata?.author,
                };

                const newId = await saveHighlight(highlightData);
                
                // Sync across instances using persistent channel
                if (syncChannelRef.current) {
                    syncChannelRef.current.postMessage({ type: 'REFRESH_HIGHLIGHTS', bookId });
                }
                
                // Update local ref so it persists during navigation
                highlightsRef.current.push({
                  ...highlightData,
                  id: newId,
                  createdAt: Date.now()
                });
                
                // Immediately render the highlight in the viewer
                const v = viewerRef.current?.querySelector("foliate-view") as FoliateView | null;
                if (v) {
                    v.addAnnotation({ value: cfi, color: c.color });
                }

                setHighlightToolbar(null);
                
                // Clear selection in the active document
                try {
                  activeDocRef.current?.getSelection()?.removeAllRanges();
                } catch { /* ignore */ }
                
                // Show toast
                setHighlightToast(true);
                if (highlightToastTimerRef.current) clearTimeout(highlightToastTimerRef.current);
                highlightToastTimerRef.current = setTimeout(() => {
                    setHighlightToast(false);
                    highlightToastTimerRef.current = null;
                }, 2000);
              }}
            />
          ))}
        </div>
      )}

      {/* Highlight Toast */}
      {highlightToast && (
        <div className="highlight-toast">
          ✨ Highlight saved
        </div>
      )}

      {file && (
        <div 
          className="controls-trigger"
          style={{ 
            position: 'fixed', 
            bottom: 0, 
            width: '100%', 
            zIndex: 100,
            pointerEvents: 'none' // Wrapper shouldn't block clicks
          }}
        >
          {/* Thin 20px sentinel strip to catch hover without blocking text above it */}
          <div 
            style={{ height: '20px', width: '100%', position: 'absolute', bottom: 0, pointerEvents: 'auto' }}
            onMouseEnter={() => handleHoverUI(true)}
            onMouseLeave={() => handleHoverUI(false)}
          />
          
          <div 
            className={`controls ${!showControls ? "controls-hidden" : ""}`} 
            style={{ pointerEvents: showControls ? 'auto' : 'none' }}
            onMouseEnter={() => handleHoverUI(true)}
            onMouseLeave={() => handleHoverUI(false)}
          >
            <button className="btn" onClick={(e) => { 
              e.stopPropagation(); 
              const rect = e.currentTarget.getBoundingClientRect();
              actionRef.current?.('prev', rect.left + rect.width / 2, rect.top + rect.height / 2);
            }}>
              Previous
            </button>
            <button className="btn" onClick={(e) => { 
              e.stopPropagation(); 
              const rect = e.currentTarget.getBoundingClientRect();
              actionRef.current?.('next', rect.left + rect.width / 2, rect.top + rect.height / 2);
            }}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
