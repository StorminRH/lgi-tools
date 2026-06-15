import type { ReactNode } from 'react';
import { cn } from './cn';

// Standalone "// Label" section heading — recreates the prototype's
// `.OG-seclabel`. Distinct from the bordered, in-card `SectionHeader`: this one
// sits free above a grid or list (homepage tools, /industry sections, the
// static-page sections), with the leading `//` slashes in ISK-green. An
// optional `meta` node renders right-aligned (e.g. `// Active jobs` paired with
// a `1 complete · 4 in progress` count). The label text stays IBM Plex Mono;
// `meta` is rendered as-is so the caller owns its styling.
export function SectionLabel({
  children,
  meta,
  className,
}: {
  children: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-baseline gap-2', meta != null && 'justify-between', className)}
    >
      <span className="inline-flex items-baseline gap-2 font-mono text-caption font-semibold tracking-[0.16em] uppercase text-muted">
        <span className="text-isk tracking-normal">{'//'}</span>
        {children}
      </span>
      {meta}
    </div>
  );
}
