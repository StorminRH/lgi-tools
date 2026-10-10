import type { BoardIndustryData, BoardSection } from '@/composition/board/api-contract';
import { Pill } from '@/components/ui/pill';
import { SectionPanel } from '@/components/ui/section-panel';
import { StatFigure } from '@/components/ui/stat-figure';
import { CardLink } from '@/components/ui/text-link';
import { SectionBody } from '../SectionBody';

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
      meta={<CardLink href="/industry/jobs">Open jobs</CardLink>}
    >
      <SectionBody section={section}>
        {(industry) => (
          <div className="flex flex-col gap-3 px-3.5 py-3">
            <dl className="grid grid-cols-3 gap-3">
              <StatFigure label="Active">{industry.active}</StatFigure>
              <StatFigure label="Ready" tone={industry.ready > 0 ? 'text-isk' : 'text-name'}>
                {industry.ready}
              </StatFigure>
              <StatFigure label="Slots">{`${industry.slots.used}/${industry.slots.max}`}</StatFigure>
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
