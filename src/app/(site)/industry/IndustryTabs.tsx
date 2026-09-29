'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import { cn } from '@/components/ui/cn';
import { INDUSTRY_SECTIONS, type IndustrySectionId, industrySectionFor } from './industry-sections';

/**
 * The workspace tabs above every section but the overview, where the rail
 * beside the cards does the same job with live summaries.
 */
export function IndustryTabs() {
  const active = industrySectionFor(useSelectedLayoutSegment());
  if (active === 'overview') return null;
  return <IndustryTabStrip active={active} />;
}

export function IndustryTabStrip({ active }: { active: IndustrySectionId | null }) {
  const current = INDUSTRY_SECTIONS.find((section) => section.id === active);
  return (
    <div className="reveal flex flex-col gap-3 pt-[26px] pb-7">
      <div className="font-data text-label tracking-label text-muted">
        <span className="text-isk">lgi://</span>
        <Link href="/industry" className="text-muted no-underline hover:text-isk">
          industry
        </Link>
        {current?.segment ? `/${current.segment}` : null}
      </div>
      <nav
        aria-label="Industry sections"
        className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex min-w-max list-none gap-1 border-b border-border">
          {INDUSTRY_SECTIONS.map((section) => {
            const isActive = section.id === active;
            return (
              <li key={section.id}>
                <Link
                  href={section.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative block px-3.5 py-2.5 font-ui text-nav no-underline transition-colors motion-reduce:transition-none',
                    isActive ? 'text-name' : 'text-muted hover:text-text',
                  )}
                >
                  {section.title}
                  {isActive && (
                    <span aria-hidden className="absolute inset-x-3.5 -bottom-px h-0.5 rounded-full bg-isk" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
