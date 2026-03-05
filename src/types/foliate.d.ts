declare module 'foliate-js/view.js' {
    export interface BookMetadata {
        title?: string | Record<string, string>;
        author?: string | Array<string | { name: string }> | Record<string, unknown>;
        [key: string]: unknown;
    }

    export interface TOCItem {
        label?: string;
        href?: string;
        subitems?: TOCItem[];
    }

    export interface Book {
        metadata?: BookMetadata;
        toc?: TOCItem[];
        sections: unknown[];
        [key: string]: unknown;
    }

    export function makeBook(file: File | Blob): Promise<Book>;

    export interface FoliateRenderer extends HTMLElement {
        setAttribute(name: string, value: string): void;
        setStyles(styles: string): void;
    }

    export interface FoliateView extends HTMLElement {
        renderer: FoliateRenderer;
        open(book: Book): Promise<void>;
        next(): void;
        prev(): void;
        goTo(href: string): void;
        close?(): void;
        addAnnotation(annotation: { value: string, color?: string }, remove?: boolean): Promise<unknown>;
        deleteAnnotation(annotation: unknown): Promise<unknown>;
        getCFI(index: number, range: Range): string;
    }

    export class View extends HTMLElement {}
}

declare module 'foliate-js/overlayer.js' {
    export class Overlayer {
        static highlight(rects: DOMRect[], options?: { color?: string }): SVGElement;
        static underline(rects: DOMRect[], options?: { color?: string }): SVGElement;
        static outline(rects: DOMRect[], options?: { color?: string }): SVGElement;
    }
}

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'foliate-view': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
        }
    }
}
