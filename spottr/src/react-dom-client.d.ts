/// <reference types="react" />
declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }
  interface HydrationOptions {
    identifierPrefix?: string;
    onRecoverableError?: (error: unknown) => void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
  export function hydrateRoot(
    container: Element | Document,
    children: ReactNode,
    options?: HydrationOptions
  ): Root;
}
