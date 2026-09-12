'use client';

import type { SystemPresence } from '../tracking/presence-model';

function FriendlySilhouette() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className="size-icon-sm shrink-0"
    >
      <circle cx="8" cy="5" r="3" />
      <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5v1H3v-1Z" />
    </svg>
  );
}

export function PresenceBadgeView({ presence }: { readonly presence: SystemPresence }) {
  return (
    <span
      data-pilot-presence="live"
      className="flex items-center gap-0.5 text-isk"
    >
      <FriendlySilhouette />
      {presence.pilots.length > 1 && (
        <span data-pilot-presence-count className="font-data text-micro text-muted">
          {presence.pilots.length}
        </span>
      )}
    </span>
  );
}
