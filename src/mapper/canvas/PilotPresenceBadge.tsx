'use client';

import { cn } from '@/components/ui/cn';
import type { SystemPresence } from '../tracking/presence-model';
import { useSystemPresence } from '../tracking/presence-context';

function FriendlySilhouette({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={cn('size-icon-sm shrink-0', className)}
    >
      <circle cx="8" cy="5" r="3" />
      <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5v1H3v-1Z" />
    </svg>
  );
}

export function PilotPresenceBadge({ systemId }: { readonly systemId: number }) {
  const presence = useSystemPresence(systemId);
  if (presence === null || presence.pilots.length === 0) return null;
  return <PresenceBadgeView presence={presence} />;
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
