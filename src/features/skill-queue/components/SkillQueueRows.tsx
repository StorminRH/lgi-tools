import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EntityRow } from '@/components/ui/row';
import { formatRemaining } from '@/lib/format/time';
import type { SkillQueueEntry } from '../esi-projection';
import { romanLevel } from '../progress';
import { entryRowModel } from '../queue-view';

export function SkillQueueRows({
  entries,
  names,
  now,
}: {
  entries: readonly SkillQueueEntry[];
  names: Readonly<Record<string, string>>;
  now: number;
}) {
  return entries.map((entry) => (
    <QueueEntryRow
      key={entry.queue_position}
      entry={entry}
      name={names[String(entry.skill_id)]}
      now={now}
    />
  ));
}

function QueueEntryRow({
  entry,
  name,
  now,
}: {
  entry: SkillQueueEntry;
  name: string | undefined;
  now: number;
}) {
  const model = entryRowModel(entry, now);
  return (
    <div>
      <EntityRow
        colsClass="grid-cols-[26px_minmax(0,1fr)_auto_auto]"
        leading={entry.queue_position + 1}
        name={
          <span className="font-data">
            {name ?? `Skill #${entry.skill_id}`}{' '}
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
