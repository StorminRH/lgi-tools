import type { ReactNode } from 'react';
import { Pill } from '@/components/ui/pill';

// The board's one entrance. It has no visible header: the pilots and cards
// speak for themselves, and the landmark keeps its name for assistive tech.
export function BoardFrame({ demo = false, children }: { demo?: boolean; children: ReactNode }) {
  return (
    <section aria-label="Your characters" className="reveal mx-auto w-full min-w-0">
      {demo && (
        <div className="mb-4">
          <Pill tone="yellow" className="whitespace-nowrap">
            Sample data
          </Pill>
        </div>
      )}
      {children}
    </section>
  );
}
