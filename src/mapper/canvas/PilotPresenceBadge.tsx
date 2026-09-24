'use client';

import { IntelIcon } from '../windows/IntelIcon';

export function PresenceBadgeView({ count }: { readonly count: number }) {
  return (
    <span
      data-pilot-presence="live"
      className="flex items-center gap-0.5"
    >
      <IntelIcon kind="pilot" />
      {count > 1 && (
        <span data-pilot-presence-count className="font-data text-micro text-muted">
          {count}
        </span>
      )}
    </span>
  );
}
