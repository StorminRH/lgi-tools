'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/components/ui/cn';
import type { BoardSection, BoardSkillsData } from '@/composition/board/api-contract';
import { SkillQueueRows } from '@/features/skill-queue/components/SkillQueueRows';
import { formatUtcDate, formatUtcTime } from '@/lib/format/time';
import { queueHealth, queueTimeline, type TimelineSegment } from '../board-view-model';
import { HealthLine } from '../board-bits';
import { SectionBody, SectionPanel } from '../SectionBody';

export function QueueSection({
  section,
  names,
  now,
  className,
}: {
  section: BoardSection<BoardSkillsData>;
  names: Readonly<Record<string, string>>;
  now: number;
  className?: string;
}) {
  return (
    <SectionPanel
      title="Skill queue"
      meta={section.state === 'ready' ? <HealthLine health={queueHealth(section, now)} /> : undefined}
      className={className}
    >
      <SectionBody section={section}>
        {(skills) =>
          skills.queue.length === 0 ? (
            <p className="px-3.5 py-3 text-ui text-dps-high">Nothing is training. Queue a skill in game.</p>
          ) : (
            <>
              <Timeline queue={skills.queue} now={now} />
              <SkillQueueRows entries={skills.queue} names={names} now={now} />
            </>
          )
        }
      </SectionBody>
    </SectionPanel>
  );
}

function Timeline({ queue, now }: { queue: BoardSkillsData['queue']; now: number }) {
  const timeline = queueTimeline(queue, now);
  if (timeline === null) return null;
  return (
    <div className="px-3.5 pt-3 pb-2.5">
      <div className="flex h-2 gap-px overflow-hidden rounded-ctl border border-evb-border bg-evb-track" aria-hidden>
        {timeline.segments.map((segment) => (
          <Segment key={segment.key} segment={segment} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-data text-micro text-muted">
        <span>now</span>
        <span>
          ends {formatUtcDate(new Date(timeline.endsAt))} {formatUtcTime(timeline.endsAt)}
        </span>
      </div>
    </div>
  );
}

function Segment({ segment }: { segment: TimelineSegment }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('flex-grow', String(segment.weight));
  }, [segment.weight]);
  return (
    <div
      ref={ref}
      className={cn('min-w-[2px] basis-0', segment.training ? 'bg-evb-bright' : 'bg-evb/55')}
    />
  );
}
