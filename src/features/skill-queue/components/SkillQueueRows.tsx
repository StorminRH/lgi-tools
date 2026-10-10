import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EntityRow } from '@/components/ui/row';
import { unresolvedName } from '@/lib/format/names';
import { formatRemaining } from '@/lib/format/time';
import type { SkillQueueEntry } from '../esi-projection';
import { romanLevel } from '../progress';
import { entryRowModel } from '../queue-view';

/** Queue rows numbered by the caller, so hidden entries leave no gap in the count. */
export function SkillQueueRows({
  rows,
  names,
  now,
}: {
  rows: readonly { number: number; entry: SkillQueueEntry }[];
  names: Readonly<Record<string, string>>;
  now: number;
}) {
  return rows.map(({ number, entry }) => (
    <QueueEntryRow
      key={entry.queue_position}
      number={number}
      entry={entry}
      name={names[String(entry.skill_id)]}
      now={now}
    />
  ));
}

function QueueEntryRow({
  number,
  entry,
  name,
  now,
}: {
  number: number;
  entry: SkillQueueEntry;
  name: string | undefined;
  now: number;
}) {
  const model = entryRowModel(entry, now);
  return (
    <div>
      <EntityRow
        colsClass="grid-cols-[26px_minmax(0,1fr)_auto_auto]"
        leading={number}
        name={
          <span className="font-data">
            {name ?? unresolvedName('skill', entry.skill_id)}{' '}
            <span className="text-muted">{romanLevel(entry.finished_level)}</span>
          </span>
        }
        chips={<Pill tone={model.meta.tone}>{model.meta.label}</Pill>}
        trailing={
          model.remainingMs !== null ? (
            <span className="font-data">{formatRemaining(model.remainingMs)}</span>
          ) : (
            ''
          )
        }
      />
      {model.showBar && (
        <div className="px-3.5 pb-1.5">
          <ProgressBar pct={model.pct} tone="evb" />
        </div>
      )}
    </div>
  );
}
