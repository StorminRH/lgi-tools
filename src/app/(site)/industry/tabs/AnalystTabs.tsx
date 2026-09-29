import Link from 'next/link';
import { cn } from '@/components/ui/cn';
import { INDUSTRY_SECTIONS } from '../industry-sections';
import type { TabStripProps } from '../IndustryTabs';
import { IndustryCrumb, SECTION_STEP, SummaryText } from './summary-text';

/**
 * Analyst: the old overview rail laid flat as wide tabs. Each carries its
 * step in the build loop, its title, and up to two live lines; the active
 * tab is raised with an accent along its top edge.
 */
export function AnalystTabs({ active, summaries }: TabStripProps) {
  return (
    <div className="flex flex-col gap-3 pt-[26px] pb-7">
      <IndustryCrumb active={active} />
      <nav aria-label="Industry sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="grid min-w-[40rem] list-none grid-cols-4 gap-px overflow-hidden rounded-card border border-border bg-border">
          {INDUSTRY_SECTIONS.map((section, index) => {
            const isActive = section.id === active;
            const lines = summaries?.[section.id] ?? [];
            return (
              <li key={section.id} className="min-w-0">
                <Link
                  href={section.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex h-full min-w-0 flex-col gap-1 px-4 pb-3 pt-3.5 no-underline transition-colors motion-reduce:transition-none',
                    isActive ? 'bg-surface-raised' : 'bg-section hover:bg-row-active',
                  )}
                >
                  {isActive && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-isk" />}
                  <span className={cn('font-data text-micro uppercase tracking-label', isActive ? 'text-isk' : 'text-faint')}>
                    {String(index + 1).padStart(2, '0')} · {SECTION_STEP[section.id]}
                  </span>
                  <span className={cn('font-display text-h3 font-bold leading-tight', isActive ? 'text-name' : 'text-text')}>
                    {section.title}
                  </span>
                  <span className="flex min-h-[2.4em] min-w-0 flex-col font-data text-micro">
                    {lines.slice(0, 2).map((line, i) => (
                      <SummaryText key={i} line={line} />
                    ))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
