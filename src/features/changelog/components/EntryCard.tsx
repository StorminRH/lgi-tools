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
    <div className="changelog-entry">
      <div className="changelog-rail">
        <div className="changelog-ver">v{entry.version}</div>
        <div className="changelog-date">{formatUtcDate(entry.date)}</div>
      </div>
      <div className="changelog-changes">
        {entry.groups.map((group) => (
          <div key={group.type} className="changelog-group">
            <Pill tone={TYPE_TONE[group.type]}>{group.type}</Pill>
            <ul className="changelog-list">
              {group.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
