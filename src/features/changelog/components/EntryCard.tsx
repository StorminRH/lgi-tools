import { Pill } from '@/components/ui/pill';
import type { PillTone } from '@/components/ui/tones';
import { formatUtcDate } from '@/lib/format/time';
import type { ChangeType, ChangelogEntry } from '../parse';

// One node in the changelog timeline (handoff §6): the version + date in the
// left rail, an ISK-green node dot on the connecting line, and the release's
// changes grouped by type, each tagged with an existing pill tone.
const TYPE_TONE: Record<ChangeType, PillTone> = {
  Added: 'green',
  Changed: 'blue',
  Fixed: 'orange-soft',
  Removed: 'red',
};

/** Renders one changelog entry's date, type, title, and structured detail content. */
export function EntryCard({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="grid grid-cols-1 gap-0 sm:grid-cols-[116px_1fr]">
      <div className="pb-3 text-left sm:pr-[26px] sm:pt-0.5 sm:text-right">
        <div className="font-data text-lead font-extrabold tracking-optical text-name">v{entry.version}</div>
        <div className="mt-1.5 font-data text-label uppercase tracking-[0.08em] text-muted">{formatUtcDate(entry.date)}</div>
      </div>
      <div className="relative pb-[34px] sm:border-l sm:border-border sm:pl-7 sm:before:absolute sm:before:-left-[5px] sm:before:top-1 sm:before:size-[9px] sm:before:rounded-full sm:before:bg-isk sm:before:shadow-[0_0_0_3px_var(--color-bg-deep),0_0_10px_var(--color-card-glow-shadow)] sm:before:content-['']">
        {entry.summary.length > 0 && (
          <div className="mb-4 flex max-w-[72ch] flex-col gap-[0.7em]">
            {entry.summary.map((para, i) => (
              <p key={i} className="m-0 text-pretty text-body leading-[1.65] tracking-optical text-text">{para}</p>
            ))}
          </div>
        )}
        {entry.groups.map((group) => (
          <div key={group.type} className="mb-4 last:mb-0">
            <Pill tone={TYPE_TONE[group.type]}>{group.type}</Pill>
            <ul className="mt-2 flex list-none flex-col gap-2 p-0">
              {group.items.map((item, i) => (
                <li key={i} className="relative pl-4 text-body leading-[1.6] tracking-optical text-text before:absolute before:left-px before:text-isk before:content-['-']">{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
