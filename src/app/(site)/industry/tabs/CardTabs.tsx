import Link from 'next/link';
import { cn } from '@/components/ui/cn';
import { INDUSTRY_SECTIONS } from '../industry-sections';
import type { TabStripProps } from '../IndustryTabs';
import { IndustryCrumb, SummaryText } from './summary-text';

/**
 * Cards: a glass dock of pill tabs. The active pill lights up, and the live
 * line of every section sits under its label once the page knows it.
 */
export function CardTabs({ active, summaries }: TabStripProps) {
  return (
    <div className="flex flex-col gap-3 pt-[26px] pb-7">
      <IndustryCrumb active={active} />
      <nav aria-label="Industry sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="inline-flex min-w-max list-none gap-1 rounded-card border border-border bg-bg-deep/60 p-1 shadow-card-edge">
          {INDUSTRY_SECTIONS.map((section) => {
            const isActive = section.id === active;
            const line = summaries?.[section.id][0];
            return (
              <li key={section.id}>
                <Link
                  href={section.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex min-w-[9.5rem] flex-col gap-0.5 rounded-ctl border px-4 py-2 no-underline transition-colors motion-reduce:transition-none',
                    isActive
                      ? 'border-hairline-accent bg-isk-dim/40 text-name shadow-cta-glow'
                      : 'border-transparent text-muted hover:bg-surface-raised hover:text-text',
                  )}
                >
                  <span className="flex items-center gap-2 font-ui text-nav font-semibold">
                    <span aria-hidden className={cn('size-1.5 rounded-full', isActive ? 'bg-isk' : 'bg-border-active')} />
                    {section.title}
                  </span>
                  <span className="min-h-[1.1em] pl-3.5 font-data text-micro">
                    <SummaryText line={line} className="block max-w-[12rem]" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
