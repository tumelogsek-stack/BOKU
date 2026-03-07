
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
import { getBook, updateProgress, saveHighlight, getHighlightsByBook, deleteHighlight, updateHighlightNote, type Highlight } from "../lib/db";

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
  const [highlights, setHighlights] = useState<Highlight[]>([]);
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
  const lastCfiRef = useRef<string | null>(null);
  const abortControllersRef = useRef<Map<Document, AbortController>>(new Map());
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const [tocTab, setTocTab] = useState<'contents' | 'highlights'>('contents');
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
  const penTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Note modal state: shown after picking a color
  const [noteModal, setNoteModal] = useState<{
    id?: string; // If set, we are editing existing. Otherwise creating.
    text: string;
    cfi: string;
    color: string;
  } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  // Pending note state: shows a pen emoji after highlighting
  const [pendingNoteHighlight, setPendingNoteHighlight] = useState<{
    id: string;
    x: number;
    y: number;
    text: string;
    cfi: string;
    color: string;
  } | null>(null);
  
  const highlightToolbarRef = useRef(highlightToolbar);
  const pendingNoteHighlightRef = useRef(pendingNoteHighlight);
  
  useEffect(() => {
    highlightToolbarRef.current = highlightToolbar;
  }, [highlightToolbar]);
  
  useEffect(() => {
    pendingNoteHighlightRef.current = pendingNoteHighlight;
  }, [pendingNoteHighlight]);
  // Editing a note on an existing highlight
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
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
              originalFractionRef.current = book.progressPercentage ?? 0;
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
        setHighlights(h);
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
          lastCfiRef.current = detail.cfi;
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
            
            // 5px movement to distinguish click from drag/selection
            if (distance > 5) return;

            const target = ev.target as HTMLElement;
            // Ignore if clicked on a link
            if (target.closest('a')) return;
            
            // NAVIGATION SUPPRESSION
            // If toolbar, pen icon, or active selection exists, consume this click to clear them
            const selection = doc.getSelection();
            const hasSelection = selection && !selection.isCollapsed && selection.toString().trim().length > 0;
            if (highlightToolbarRef.current || pendingNoteHighlightRef.current || hasSelection) {
              if (highlightToolbarRef.current) setHighlightToolbar(null);
              if (pendingNoteHighlightRef.current) setPendingNoteHighlight(null);
              if (hasSelection) {
                try {
                  doc.getSelection()?.removeAllRanges();
                } catch { /* ignore */ }
              }
              // Prevent navigation zones from triggering
              return;
            }

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

          doc.addEventListener("mousedown", () => {
             if (pendingNoteHighlightRef.current) setPendingNoteHighlight(null);
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
    
    const handleGlobalClick = () => {
        if (pendingNoteHighlight) setPendingNoteHighlight(null);
    };
    document.addEventListener("mousedown", handleGlobalClick);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("mousedown", handleGlobalClick);
    };
  }, [isThemeOpen, isTextMenuOpen, pendingNoteHighlight]);

  // Auto-dismiss pen emoji after 3 seconds
  useEffect(() => {
    if (penTimeoutRef.current) clearTimeout(penTimeoutRef.current);
    if (pendingNoteHighlight) {
      penTimeoutRef.current = setTimeout(() => {
        setPendingNoteHighlight(null);
        penTimeoutRef.current = null;
      }, 3000);
    }
    return () => {
      if (penTimeoutRef.current) clearTimeout(penTimeoutRef.current);
    };
  }, [pendingNoteHighlight]);

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
          display: flex;
          flex-direction: column;
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .tocTabs {
          display: flex;
          gap: 1rem;
          padding: 0 1.5rem;
          margin-bottom: 0.5rem;
        }

        .tocTabBtn {
          background: none;
          border: none;
          color: inherit;
          padding: 0.5rem 0.25rem;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          opacity: 0.6;
          transition: all 0.2s ease;
          position: relative;
        }

        .tocTabBtn.active {
          opacity: 1;
          color: var(--accent-color);
        }

        .tocTabBtn.active::after {
          content: "";
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 2px;
          background: var(--accent-color);
          border-radius: 2px;
        }

        .tocHeader {
          padding: 1.5rem 1.5rem 1rem;
        }

        .highlightsList {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
        }

        .highlightItem {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 12px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid transparent;
          position: relative;
        }

        .highlightItem:hover {
          background: rgba(0, 0, 0, 0.08);
          border-color: var(--glass-border);
        }

        .highlightItem-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .highlightItem-chapter {
          font-size: 0.75rem;
          font-weight: 600;
          opacity: 0.7;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .highlightItem-text {
          font-size: 0.9rem;
          line-height: 1.5;
          font-style: italic;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .highlightItem-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.25rem;
        }

        .highlightItem-date {
          font-size: 0.75rem;
          opacity: 0.5;
        }

        .btnDeleteHighlight {
          padding: 4px;
          opacity: 0.3;
          transition: opacity 0.2s;
          background: none;
          border: none;
          cursor: pointer;
          color: inherit;
        }

        .highlightItem:hover .btnDeleteHighlight {
          opacity: 0.8;
        }

        .btnDeleteHighlight:hover {
          color: #ff4757;
          opacity: 1 !important;
        }

        .btnPen {
          position: fixed;
          background: var(--panel-bg);
          border: 1px solid var(--glass-border);
          border-radius: 50%;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1001;
          animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          transition: transform 0.2s;
        }

        .btnPen:hover {
          transform: scale(1.1);
        }

        @keyframes popIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .noteModal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--panel-bg);
          border: 1px solid var(--glass-border);
          border-radius: 16px;
          padding: 1.5rem;
          z-index: 2000;
          width: 340px;
          max-width: 90vw;
          box-shadow: 0 16px 48px rgba(0,0,0,0.2);
          display: flex;
          flex-direction: column;
          gap: 1rem;
          animation: fadeIn 0.2s ease;
        }

        .noteModal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.3);
          z-index: 1999;
          animation: fadeIn 0.2s ease;
        }

        .noteModal-preview {
          font-style: italic;
          font-size: 0.85rem;
          opacity: 0.7;
          max-height: 60px;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
        }

        .noteModal textarea {
          width: 100%;
          min-height: 80px;
          padding: 0.75rem;
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          background: rgba(0,0,0,0.03);
          color: inherit;
          font-family: inherit;
          font-size: 0.9rem;
          resize: vertical;
          outline: none;
        }

        .noteModal textarea:focus {
          border-color: var(--accent-color);
        }

        .noteModal-actions {
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
        }

        .highlightItem-note {
          font-size: 0.8rem;
          opacity: 0.7;
          padding: 0.5rem 0.75rem;
          background: rgba(0,0,0,0.03);
          border-radius: 8px;
          line-height: 1.4;
          white-space: pre-wrap;
        }

        .highlightItem-noteActions {
          display: flex;
          gap: 0.25rem;
          align-items: center;
        }

        .btnEditNote {
          padding: 4px;
          opacity: 0.3;
          transition: opacity 0.2s;
          background: none;
          border: none;
          cursor: pointer;
          color: inherit;
          font-size: 0.75rem;
        }

        .highlightItem:hover .btnEditNote {
          opacity: 0.7;
        }

        .btnEditNote:hover {
          opacity: 1 !important;
          color: var(--accent-color);
        }

        .editNoteInline {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .editNoteInline textarea {
          width: 100%;
          min-height: 60px;
          padding: 0.5rem;
          border: 1px solid var(--glass-border);
          border-radius: 6px;
          background: rgba(0,0,0,0.03);
          color: inherit;
          font-family: inherit;
          font-size: 0.8rem;
          resize: vertical;
          outline: none;
        }

        .editNoteInline textarea:focus {
          border-color: var(--accent-color);
        }

        .editNoteInline-actions {
          display: flex;
          gap: 0.25rem;
          justify-content: flex-end;
        }

        .emptyState {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          opacity: 0.5;
          text-align: center;
          padding: 2rem;
          gap: 0.5rem;
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
              <h3>Navigation</h3>
            </div>
            <div className="tocTabs">
              <button 
                className={`tocTabBtn ${tocTab === 'contents' ? 'active' : ''}`}
                onClick={() => setTocTab('contents')}
              >
                Contents
              </button>
              <button 
                className={`tocTabBtn ${tocTab === 'highlights' ? 'active' : ''}`}
                onClick={() => setTocTab('highlights')}
              >
                Highlights
              </button>
            </div>

            {tocTab === 'contents' ? (
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
            ) : (
              <div className="highlightsList">
                {highlights.length === 0 ? (
                  <div className="emptyState">
                    <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    <p>No highlights yet</p>
                  </div>
                ) : (
                  highlights
                    .slice()
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((h) => (
                    <div key={h.id} className="highlightItem" onClick={() => {
                      const v = viewerRef.current?.querySelector("foliate-view") as FoliateView | null;
                      if (v && h.cfi) {
                        // Capture current position if not already in preview mode
                        if (originalCfiRef.current === null && lastCfiRef.current) {
                          updateOriginalCfi(lastCfiRef.current);
                          originalFractionRef.current = currentFractionRef.current;
                        }
                        v.goTo(h.cfi);
                        setIsMenuOpen(false);
                      }
                    }}>
                      <div className="highlightItem-header">
                        <span className="highlightItem-chapter" style={{ color: h.color }}>
                          {h.chapter || "Untitled Chapter"}
                        </span>
                        <button 
                          className="btnDeleteHighlight"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm("Delete this highlight?")) {
                              await deleteHighlight(h.id);
                              // Sync
                              if (syncChannelRef.current) {
                                syncChannelRef.current.postMessage({ type: 'REFRESH_HIGHLIGHTS', bookId });
                              }
                              // Update state and ref
                              setHighlights(prev => prev.filter(item => item.id !== h.id));
                              highlightsRef.current = highlightsRef.current.filter(item => item.id !== h.id);
                            }
                          }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                      <p className="highlightItem-text" style={{ borderLeft: `3px solid ${h.color}`, paddingLeft: '8px' }}>
                        {h.text}
                      </p>
                      {editingNoteId === h.id ? (
                        <div className="editNoteInline" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                            placeholder="Add a note..."
                            autoFocus
                          />
                          <div className="editNoteInline-actions">
                            <button className="btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setEditingNoteId(null)}>Cancel</button>
                            <button className="btn" style={{ fontSize: '0.75rem', padding: '4px 10px', background: 'var(--accent-color)', color: 'white' }} onClick={async () => {
                              await updateHighlightNote(h.id, editingNoteText);
                              setHighlights(prev => prev.map(item => item.id === h.id ? { ...item, note: editingNoteText } : item));
                              highlightsRef.current = highlightsRef.current.map(item => item.id === h.id ? { ...item, note: editingNoteText } : item);
                              if (syncChannelRef.current) {
                                syncChannelRef.current.postMessage({ type: 'REFRESH_HIGHLIGHTS', bookId });
                              }
                              setEditingNoteId(null);
                            }}>Save</button>
                          </div>
                        </div>
                      ) : (
                        h.note ? (
                          <div className="highlightItem-note" onClick={(e) => e.stopPropagation()}>
                            📝 {h.note}
                          </div>
                        ) : null
                      )}
                      <div className="highlightItem-footer">
                        <span className="highlightItem-date">
                          {new Date(h.createdAt).toLocaleDateString()}
                        </span>
                        <div className="highlightItem-noteActions">
                          <button className="btnEditNote" onClick={(e) => {
                            e.stopPropagation();
                            setEditingNoteId(h.id);
                            setEditingNoteText(h.note || '');
                          }} title={h.note ? 'Edit note' : 'Add note'}>
                            {h.note ? '✏️ Edit' : '📝 Add note'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
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
                
                const highlightData = {
                    bookId,
                    text: highlightToolbar.text,
                    cfi: highlightToolbar.cfi,
                    color: c.color,
                    chapter: currentChapter || undefined,
                    bookTitle: metadata?.title,
                    bookAuthor: metadata?.author,
                };

                const newId = await saveHighlight(highlightData);
                
                if (syncChannelRef.current) {
                    syncChannelRef.current.postMessage({ type: 'REFRESH_HIGHLIGHTS', bookId });
                }
                
                const newHighlight = {
                    ...highlightData,
                    id: newId,
                    createdAt: Date.now()
                };

                setHighlights(prev => [...prev, newHighlight]);
                highlightsRef.current = [...highlightsRef.current, newHighlight];
                
                const v = viewerRef.current?.querySelector("foliate-view") as FoliateView | null;
                if (v) {
                    v.addAnnotation({ value: highlightToolbar.cfi, color: c.color });
                }

                // Show pen emoji at the same spot
                setPendingNoteHighlight({
                    id: newId,
                    x: highlightToolbar.x,
                    y: highlightToolbar.y,
                    text: highlightToolbar.text,
                    cfi: highlightToolbar.cfi,
                    color: c.color
                });

                setHighlightToolbar(null);
                
                try {
                  activeDocRef.current?.getSelection()?.removeAllRanges();
                } catch { /* ignore */ }
                
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

      {/* Note Modal */}
      {noteModal && (
        <>
          <div className="noteModal-backdrop" onClick={() => setNoteModal(null)} />
          <div className="noteModal">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: noteModal.color, flexShrink: 0 }} />
              <strong style={{ fontSize: '0.95rem' }}>{noteModal.id ? 'Edit Note' : 'Add a Note'}</strong>
            </div>
            <p className="noteModal-preview">&ldquo;{noteModal.text}&rdquo;</p>
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Write a note (optional)..."
              autoFocus
            />
            <div className="noteModal-actions">
              <button className="btn" style={{ fontSize: '0.85rem', padding: '6px 14px' }} onClick={() => setNoteModal(null)}>Cancel</button>
              <button className="btn" style={{ fontSize: '0.85rem', padding: '6px 14px', background: 'var(--accent-color)', color: 'white' }} onClick={async () => {
                const targetId = noteModal.id || (pendingNoteHighlight?.id);
                if (!targetId) return;

                await updateHighlightNote(targetId, noteInput.trim());
                
                if (syncChannelRef.current) {
                    syncChannelRef.current.postMessage({ type: 'REFRESH_HIGHLIGHTS', bookId });
                }
                
                setHighlights(prev => prev.map(h => h.id === targetId ? { ...h, note: noteInput.trim() || undefined } : h));
                highlightsRef.current = highlightsRef.current.map(h => h.id === targetId ? { ...h, note: noteInput.trim() || undefined } : h);

                setNoteModal(null);
                setPendingNoteHighlight(null);
                
                setHighlightToast(true);
                if (highlightToastTimerRef.current) clearTimeout(highlightToastTimerRef.current);
                highlightToastTimerRef.current = setTimeout(() => {
                    setHighlightToast(false);
                    highlightToastTimerRef.current = null;
                }, 2000);
              }}>Save</button>
            </div>
          </div>
        </>
      )}

      {/* Pending Note Pen Button */}
      {pendingNoteHighlight && (
        <button
          className="btnPen"
          style={{
            left: pendingNoteHighlight.x - 22,
            top: pendingNoteHighlight.y - 44,
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setNoteModal({
              id: pendingNoteHighlight.id,
              text: pendingNoteHighlight.text,
              cfi: pendingNoteHighlight.cfi,
              color: pendingNoteHighlight.color
            });
            setNoteInput('');
            setPendingNoteHighlight(null);
          }}
        >
          ✏️
        </button>
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
