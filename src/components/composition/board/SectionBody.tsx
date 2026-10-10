import type { ReactNode } from 'react';
import type { BoardSection } from '@/composition/board/api-contract';

export function SectionBody<T>({
  section,
  children,
}: {
  section: BoardSection<T>;
  children: (data: T) => ReactNode;
}) {
  if (section.state === 'ready') return children(section.data);
  return (
    <p className="px-3.5 py-3 text-ui text-faint">
      {section.state === 'pending' ? 'Syncing from EVE…' : 'Needs a reconnect to sync.'}
    </p>
  );
}
