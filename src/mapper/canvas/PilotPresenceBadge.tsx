'use client';

// The frame-slot presence indicator: a green dot while a tracked pilot in
// this system has a live feed, dimmed to neutral once every feed is stale
// (visibly provisional, contract DC-3). At-a-glance only — pilot names and
// statuses live in the system intelligence body behind a click.
//
// Deliberately a tiny context-reading leaf: the provider's 30s staleness tick
// re-renders these leaves, not the memoized frames around them, and the
// declared frame dimensions keep the wrapper box (and ResizeObserver) still
// when the badge appears or disappears.
import {
  presenceBadgeTone,
  type SystemPresence,
} from '../tracking/presence-model';
import { useSystemPresence } from '../tracking/presence-context';
import { Dot } from '@/components/ui/dot';

/** Renders one system's tracked-pilot indicator inside the frame widget rail. */
export function PilotPresenceBadge({ systemId }: { readonly systemId: number }) {
  const presence = useSystemPresence(systemId);
  if (presence === null || presence.pilots.length === 0) return null;
  return <PresenceBadgeView presence={presence} />;
}

/** The pure badge markup; exported so unit tests render it without a provider. */
export function PresenceBadgeView({ presence }: { readonly presence: SystemPresence }) {
  const tone = presenceBadgeTone(presence);
  return (
    <span
      data-pilot-presence={tone === 'green' ? 'live' : 'stale'}
      className="flex items-center gap-1"
    >
      <Dot tone={tone} size="lg" />
      {presence.pilots.length > 1 && (
        <span data-pilot-presence-count className="font-data text-micro text-muted">
          {presence.pilots.length}
        </span>
      )}
    </span>
  );
}
