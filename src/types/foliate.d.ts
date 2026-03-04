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
        [key: string]: unknown;
    }

    export function makeBook(file: File | Blob): Promise<Book>;

    export class View extends HTMLElement {
        open(book: Book): Promise<void>;
        next(): void;
        prev(): void;
        goTo(href: string): void;
    }
}

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'foliate-view': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
        }
    }
}

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'foliate-view': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
        }
    }
}
