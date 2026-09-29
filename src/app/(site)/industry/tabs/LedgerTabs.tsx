import Link from 'next/link';
import { cn } from '@/components/ui/cn';
import { INDUSTRY_SECTIONS } from '../industry-sections';
import type { TabStripProps } from '../IndustryTabs';
import { IndustryCrumb, SummaryText } from './summary-text';

/**
 * Ledger: a terminal underline strip. Each tab is numbered in build order
 * and carries its live line as a quiet mono tag.
 */
export function LedgerTabs({ active, summaries }: TabStripProps) {
  return (
    <div className="flex flex-col gap-3 pt-[26px] pb-6">
      <IndustryCrumb active={active} />
      <nav aria-label="Industry sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max list-none gap-1 border-b border-border">
          {INDUSTRY_SECTIONS.map((section, index) => {
            const isActive = section.id === active;
            const line = summaries?.[section.id][0];
            return (
              <li key={section.id}>
                <Link
                  href={section.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-baseline gap-2 px-3.5 py-2.5 no-underline transition-colors motion-reduce:transition-none',
                    isActive ? 'text-name' : 'text-muted hover:text-text',
                  )}
                >
                  <span className={cn('font-data text-micro', isActive ? 'text-isk' : 'text-faint')}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="font-ui text-nav">{section.title}</span>
                  {line !== undefined && (
                    <span
                      className={cn(
                        'hidden max-w-[11rem] rounded-full border px-2 py-px font-data text-micro md:inline-flex',
                        isActive ? 'border-hairline-accent bg-isk-dim/40' : 'border-border-soft',
                      )}
                    >
                      <SummaryText line={line} />
                    </span>
                  )}
                  {isActive && <span aria-hidden className="absolute inset-x-3.5 -bottom-px h-0.5 rounded-full bg-isk" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
