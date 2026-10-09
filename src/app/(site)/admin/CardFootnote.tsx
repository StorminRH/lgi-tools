import type { ReactNode } from 'react';

/** A quiet closing line under a card's figures, such as what a count leaves out. */
export function CardFootnote({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-border-soft px-3.5 py-2 font-data text-micro text-muted wrap-break-word">
      {children}
    </p>
  );
}
