import Link from 'next/link';
import type { BoardIndustryData, BoardSection } from '@/composition/board/api-contract';
import { Pill } from '@/components/ui/pill';
import { StatFigure } from '../board-bits';
import { SectionBody, SectionPanel } from '../SectionBody';

export function IndustrySection({
  section,
  className,
}: {
  section: BoardSection<BoardIndustryData>;
  className?: string;
}) {
  return (
    <SectionPanel
      title="Industry"
      className={className}
      meta={
        <Link href="/industry/jobs" className="whitespace-nowrap text-isk no-underline transition-colors hover:text-name">
          Open jobs →
        </Link>
      }
    >
      <SectionBody section={section}>
        {(industry) => (
          <div className="flex flex-col gap-3 px-3.5 py-3">
            <dl className="grid grid-cols-3 gap-3">
              <StatFigure label="Active" value={industry.active} />
              <StatFigure label="Ready" value={industry.ready} tone={industry.ready > 0 ? 'text-isk' : 'text-name'} />
              <StatFigure label="Slots" value={`${industry.slots.used}/${industry.slots.max}`} />
            </dl>
            {industry.ready > 0 ? (
              <div>
                <Pill tone="green">{industry.ready} ready</Pill>
              </div>
            ) : null}
          </div>
        )}
      </SectionBody>
    </SectionPanel>
  );
}
