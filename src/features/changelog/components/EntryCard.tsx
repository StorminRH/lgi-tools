import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import type { ChangelogEntry } from '../parse';

export function EntryCard({ entry }: { entry: ChangelogEntry }) {
  return (
    <Card>
      <SectionHeader label={entry.date} />
      <ul className="px-3.5 py-3 text-[12px] leading-[1.6] text-text font-mono space-y-2">
        {entry.items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-muted shrink-0">·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
