'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';

// The cross-tool navigation strip. Lives between the brand wordmark and the
// right-side login cluster in `AppHeader`. SOON tools render as inert spans
// with the wireframe's `.nav-tool.dim` treatment — `cursor: default`, 55%
// opacity, no underline, no hover-to-green.

type Tool = {
  label: string;
  href: string | null;
  matchPrefix?: string;
};

const TOOLS: Tool[] = [
  { label: 'Wormhole Sites',    href: '/sites', matchPrefix: '/sites' },
  { label: 'Industry Planner',  href: null },
  { label: 'Wormhole Roll Calc', href: null },
];

export function NavTools() {
  const pathname = usePathname();

  return (
    <nav className="flex items-stretch min-w-0">
      {TOOLS.map((tool) => {
        if (tool.href === null) {
          return (
            <span
              key={tool.label}
              title={`${tool.label} — coming soon`}
              className="flex items-center px-3.5 text-[11px] font-medium text-muted opacity-55 cursor-default whitespace-nowrap tracking-[0.03em]"
            >
              {tool.label}
            </span>
          );
        }

        const isActive =
          !!tool.matchPrefix && pathname.startsWith(tool.matchPrefix);

        return (
          <Link
            key={tool.label}
            href={tool.href}
            className={cn(
              'flex items-center px-3.5 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap border-b-2 transition-colors',
              isActive
                ? 'text-name border-isk'
                : 'text-muted border-transparent',
            )}
          >
            {tool.label}
          </Link>
        );
      })}
    </nav>
  );
}
