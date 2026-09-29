import Link from 'next/link';
import { cn } from '@/components/ui/cn';
import { INDUSTRY_SECTIONS, type IndustrySectionId } from '../industry-sections';
import type { SummaryLine, SummaryTone } from '../tab-summaries';

const TONE_CLASS: Record<SummaryTone, string> = {
  isk: 'text-isk',
  name: 'text-name',
  muted: 'text-muted',
  faint: 'text-faint',
  warn: 'text-dps-mid',
};

export function SummaryText({ line, className }: { line: SummaryLine | undefined; className?: string }) {
  if (line === undefined) return null;
  return (
    <span className={cn('truncate', className)}>
      {line.map((segment, i) => (
        <span key={i} className={TONE_CLASS[segment.tone]}>
          {segment.text}
        </span>
      ))}
    </span>
  );
}

/** Where you are, as the site's terminal path. */
export function IndustryCrumb({ active }: { active: IndustrySectionId | null }) {
  const current = INDUSTRY_SECTIONS.find((section) => section.id === active);
  return (
    <div className="font-data text-label tracking-label text-muted">
      <span className="text-isk">lgi://</span>
      <Link href="/industry" className="text-muted no-underline hover:text-isk">
        industry
      </Link>
      {current?.segment ? `/${current.segment}` : null}
    </div>
  );
}
