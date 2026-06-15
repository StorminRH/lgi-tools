import { Pill } from '@/components/ui/pill';
import type { PillTone } from '@/components/ui/tones';
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

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function EntryCard({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="changelog-entry">
      <div className="changelog-rail">
        <div className="changelog-ver">v{entry.version}</div>
        <div className="changelog-date">{formatDate(entry.date)}</div>
      </div>
      <div className="changelog-changes">
        {entry.groups.map((group) => (
          <div key={group.type} className="changelog-group">
            <Pill tone={TYPE_TONE[group.type]} className="changelog-tag">
              {group.type}
            </Pill>
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
