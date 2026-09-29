'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { SectionPanel } from '@/components/ui/readout';
import type { BoardSection, BoardSkillsData } from '@/composition/board/api-contract';
import { SkillQueueRows } from '@/features/skill-queue/components/SkillQueueRows';
import { formatUtcDate, formatUtcTime } from '@/lib/format/time';
import { queueHealth, queueTimeline, queueWindow, remainingQueue, type TimelineSegment } from '../board-view-model';
import { HealthLine } from '../board-bits';
import { SectionBody } from '../SectionBody';

/**
 * The next few skills to train, with the whole queue a click away in a
 * drawer that slides over the page, so a long queue never stretches the
 * sheet. Entries that finished since the last sync are never shown.
 */
export function QueueSection({
  section,
  names,
  now,
  pilotName,
  className,
}: {
  section: BoardSection<BoardSkillsData>;
  names: Readonly<Record<string, string>>;
  now: number;
  pilotName: string;
  className?: string;
}) {
  return (
    <SectionPanel
      title="Skill queue"
      meta={section.state === 'ready' ? <HealthLine health={queueHealth(section, now)} /> : undefined}
      className={className}
    >
      <SectionBody section={section}>
        {(skills) => <QueueBody queue={skills.queue} names={names} now={now} pilotName={pilotName} />}
      </SectionBody>
    </SectionPanel>
  );
}

function QueueBody({
  queue,
  names,
  now,
  pilotName,
}: {
  queue: BoardSkillsData['queue'];
  names: Readonly<Record<string, string>>;
  now: number;
  pilotName: string;
}) {
  const window = queueWindow(queue, now);
  if (window.total === 0) {
    return <p className="px-3.5 py-3 text-ui text-dps-high">Nothing is training. Queue a skill in game.</p>;
  }
  return (
    <>
      <Timeline queue={queue} now={now} />
      <SkillQueueRows rows={window.visible} names={names} now={now} />
      {window.total > window.visible.length && (
        <Drawer
          title={`${pilotName} · Skill queue`}
          trigger={`Show all ${window.total} skills`}
          triggerClassName="w-full border-t border-border-soft px-3.5 py-2 text-left font-data text-ui text-muted transition-colors hover:bg-row-hover hover:text-isk focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-isk-sub"
          className="mx-auto max-w-3xl"
        >
          <div className="overflow-hidden rounded-card border border-border-soft">
            <Timeline queue={queue} now={now} />
            <SkillQueueRows rows={remainingQueue(queue, now)} names={names} now={now} />
          </div>
        </Drawer>
      )}
    </>
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
