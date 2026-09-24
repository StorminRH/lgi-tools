'use client';

import { IntelIcon } from '../windows/IntelIcon';
import type { SystemPresence } from '../tracking/presence-model';

export function PresenceBadgeView({ presence }: { readonly presence: SystemPresence }) {
  return (
    <span
      data-pilot-presence="live"
      className="flex items-center gap-0.5"
    >
      <IntelIcon kind="pilot" />
      {presence.pilots.length > 1 && (
        <span data-pilot-presence-count className="font-data text-micro text-muted">
          {presence.pilots.length}
        </span>
      )}
    </span>
  );
}
