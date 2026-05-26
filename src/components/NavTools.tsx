'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TOOLS } from '@/data/tools/registry';
import { cn } from '@/components/ui/cn';

// The cross-tool navigation strip. Lives between the global search input
// and the right-side login cluster in `AppHeader`. SOON tools render as
// inert spans. When `shrunk` is true (the parent's global search is
// focused), every label collapses to its 2-letter abbreviation so the
// expanded search bar can claim the room.

export function NavTools({ shrunk = false }: { shrunk?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        'nav-tools flex items-stretch min-w-0 overflow-hidden',
        shrunk && 'shrunk',
      )}
    >
      {TOOLS.map((tool) => {
        if (tool.href === null) {
          return (
            <span
              key={tool.label}
              title={`${tool.label} — coming soon`}
              className="nav-tool flex items-center px-3.5 text-[11px] font-medium text-muted opacity-55 cursor-default whitespace-nowrap tracking-[0.03em]"
            >
              <span className="full">{tool.label}</span>
              <span className="abbr">{tool.abbr}</span>
            </span>
          );
        }

        const isActive =
          !!tool.matchPrefix && pathname.startsWith(tool.matchPrefix);

        return (
          <Link
            key={tool.label}
            href={tool.href}
            title={tool.label}
            className={cn(
              'nav-tool flex items-center px-3.5 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap border-b-2 transition-colors',
              isActive
                ? 'text-name border-isk'
                : 'text-muted border-transparent',
            )}
          >
            <span className="full">{tool.label}</span>
            <span className="abbr">{tool.abbr}</span>
          </Link>
        );
      })}
    </nav>
  );
}
