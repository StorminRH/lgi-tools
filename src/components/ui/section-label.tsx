import type { ReactNode } from 'react';
import { cn } from './cn';
import { eyebrow } from './type-roles';

/**
 * Standalone "// Label" section heading — recreates the prototype's
 * `.OG-seclabel`. Distinct from the bordered, in-card `SectionHeader`: this one
 * sits free above a grid or list (homepage tools, /industry sections, the
 * static-page sections), with the leading `//` slashes in ISK-green. An
 * optional `meta` node renders right-aligned (e.g. `// Active jobs` paired with
 * a `1 complete · 4 in progress` count). The label text uses the eyebrow role;
 * `meta` is rendered as-is so the caller owns its styling.
 */
export function SectionLabel({
  children,
  meta,
  prefix = true,
  className,
}: {
  children: ReactNode;
  meta?: ReactNode;
  prefix?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-baseline gap-2', meta != null && 'justify-between', className)}
    >
      <span
        className={eyebrow({
          weight: 'semibold',
          emphasis: 'strong',
          className: 'inline-flex items-baseline gap-2',
        })}
      >
        {prefix && <span className="text-isk tracking-normal">{'//'}</span>}
        {children}
      </span>
      {meta}
    </div>
  );
}
