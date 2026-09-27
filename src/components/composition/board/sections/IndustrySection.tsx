import Link from 'next/link';
import type { BoardIndustryData, BoardSection } from '@/composition/board/api-contract';
import { Pill } from '@/components/ui/pill';
import { StatFigure } from '../board-bits';
import { SectionBody, SectionPanel, updatedLabel } from '../SectionBody';

export function IndustrySection({
  section,
  now,
  className,
}: {
  section: BoardSection<BoardIndustryData>;
  now: number;
  className?: string;
}) {
  return (
    <SectionPanel title="Industry" meta={updatedLabel(section, now)} className={className}>
      <SectionBody section={section}>
        {(industry) => (
          <div className="flex flex-col gap-3 px-3.5 py-3">
            <dl className="grid grid-cols-3 gap-3">
              <StatFigure label="Active" value={industry.active} />
              <StatFigure label="Ready" value={industry.ready} tone={industry.ready > 0 ? 'text-isk' : 'text-name'} />
              <StatFigure label="Slots" value={`${industry.slots.used}/${industry.slots.max}`} />
            </dl>
            <div className="flex items-center justify-between gap-2">
              {industry.ready > 0 ? (
                <Pill tone="green">{industry.ready} ready</Pill>
              ) : (
                <span className="text-micro text-faint">Nothing to deliver</span>
              )}
              <Link href="/jobs" className="shrink-0 whitespace-nowrap text-ui text-muted underline-offset-2 hover:text-isk hover:underline">
                Open jobs →
              </Link>
            </div>
          </div>
        )}
      </SectionBody>
    </SectionPanel>
  );
}
