import type { ReactNode } from 'react';

export function CodexEmptySection({ action }: { action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-dashed border-border-active bg-bg-deep/40 px-5 py-5">
      <div>
        <p className="font-ui text-nav text-text">No guide yet.</p>
        <p className="mt-0.5 font-ui text-ui text-muted">Pilots who have flown it can write the first one.</p>
      </div>
      {action}
    </div>
  );
}
