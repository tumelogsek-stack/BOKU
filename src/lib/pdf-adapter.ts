
import * as pdfjs from 'pdfjs-dist';

// Set worker source
// In a Next.js environment, it's often easiest to use a CDN for the worker if not locally hosted
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface RenderResult {
    src: string;
    onZoom: (args: { doc: Document, scale: number }) => Promise<void>;
}

export interface PDFBook {
    metadata: {
        title?: string;
        author?: string;
        language?: string;
    };
    toc: TOCItem[];
    sections: {
        id: string;
        index: number;
        load: () => Promise<RenderResult>;
    }[];
    rendition: {
        layout: 'pre-paginated';
    };
    getCover?: () => Promise<Blob | null>;
    resolveNavigation?: (target: string | number) => { index: number };
}

interface TOCItem {
    label: string;
    href: string;
}

interface PDFPage {
    getViewport: (args: { scale: number }) => { width: number, height: number };
    render: (args: { canvasContext: CanvasRenderingContext2D, viewport: unknown }) => { promise: Promise<void> };
}

const makeTOCItem = (item: { title: string, dest: unknown }): TOCItem => ({
    label: item.title,
    href: JSON.stringify(item.dest)
});

const getTOC = async (pdf: { getOutline: () => Promise<unknown[] | null> }): Promise<TOCItem[]> => {
    const outline = await pdf.getOutline();
    if (!outline) return [];
    return (outline as { title: string, dest: unknown }[]).map(makeTOCItem);
};

export async function makePDF(file: File): Promise<PDFBook> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ 
        data: arrayBuffer,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`
    });
    const pdf = await loadingTask.promise;

    const metadata = await pdf.getMetadata();
    const info = (metadata.info as Record<string, unknown>) || {};

    const toc = await getTOC(pdf as unknown as { getOutline: () => Promise<unknown[] | null> });

    const sections = Array.from({ length: pdf.numPages }, (_, i) => ({
        id: `page-${i + 1}`,
        index: i,
        load: async () => {
             const page = await pdf.getPage(i + 1);
             return renderPage(page as unknown as PDFPage) as Promise<RenderResult>;
        }
    }));

    return {
        metadata: {
            title: (info.Title as string) || file.name.replace(/\.[^/.]+$/, ""),
            author: (info.Author as string) || "Unknown Author",
            language: (info.Language as string) || "en"
        },
        toc,
        sections,
        rendition: {
            layout: 'pre-paginated'
        },
        getCover: async () => {
            const page = await pdf.getPage(1);
            return renderPage(page as unknown as PDFPage, true) as Promise<Blob | null>;
        },
        resolveNavigation: (target: string | number) => {
            if (typeof target === 'number') return { index: target };
            if (typeof target === 'string') {
                try {
                    const dest = JSON.parse(target);
                    return { index: (dest[0] as number) - 1 };
                } catch {
                    return { index: 0 };
                }
            }
            return { index: 0 };
        }
    };
}

async function renderPage(page: PDFPage, getImageBlob: true): Promise<Blob | null>;
async function renderPage(page: PDFPage, getImageBlob?: false): Promise<RenderResult>;
async function renderPage(page: PDFPage, getImageBlob = false): Promise<Blob | null | RenderResult> {
    const viewport = page.getViewport({ scale: 1 });
    
    if (getImageBlob) {
        const canvas = document.createElement('canvas');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const canvasContext = canvas.getContext('2d');
        if (canvasContext) {
            await page.render({ canvasContext, viewport }).promise;
            return new Promise(resolve => canvas.toBlob(resolve));
        }
        return null;
    }

    const src = URL.createObjectURL(new Blob([`
        <!DOCTYPE html>
        <html lang="en">
        <meta charset="utf-8">
        <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}">
        <style>
            html, body { margin: 0; padding: 0; overflow: hidden; }
            #canvas-container { position: relative; width: 100%; height: 100%; }
            canvas { width: 100%; height: auto; display: block; }
        </style>
        <div id="canvas-container"></div>
    `], { type: 'text/html' }));

    const onZoom = async ({ doc, scale }: { doc: Document, scale: number }) => {
        const container = doc.getElementById('canvas-container');
        if (!container) return;

        const zoomedViewport = page.getViewport({ scale: scale * devicePixelRatio });
        const canvas = doc.createElement('canvas');
        canvas.width = zoomedViewport.width;
        canvas.height = zoomedViewport.height;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        
        const canvasContext = canvas.getContext('2d');
        if (canvasContext) {
            await page.render({ canvasContext, viewport: zoomedViewport }).promise;
            container.replaceChildren(canvas);
        }
    };

    return { src, onZoom };
}
