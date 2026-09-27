import type { PillTone } from '@/components/ui/pill';
import type { QueueSummary } from './signals';

export interface AdminActionRow {
  id: 'statics' | 'queue' | 'access';
  title: string;
  status: string;
  href: string;
  cta: string;
  badge: { label: string; tone: PillTone } | null;
}

export function deriveActionRows(input: {
  statics: { pendingVersion: string | null; servingVersion: string };
  queue: Pick<QueueSummary, 'due' | 'deadLettered'> | null;
}): AdminActionRow[] {
  const { statics, queue } = input;
  const serving = statics.servingVersion === '' ? 'nothing promoted yet' : `serving v${statics.servingVersion}`;
  return [
    {
      id: 'statics',
      title: 'Wormhole statics',
      status:
        statics.pendingVersion === null
          ? `${serving} · no review waiting`
          : `v${statics.pendingVersion} waiting · ${serving}`,
      href: '/admin/statics',
      cta: statics.pendingVersion === null ? 'Check feed' : 'Review',
      badge: statics.pendingVersion === null ? null : { label: 'review', tone: 'orange' },
    },
    {
      id: 'queue',
      title: 'Refresh queue',
      status:
        queue === null
          ? 'queue unavailable'
          : `${queue.deadLettered.toLocaleString()} dead-lettered · ${queue.due.toLocaleString()} due`,
      href: '/admin/queue',
      cta: queue !== null && queue.deadLettered > 0 ? 'Retry jobs' : 'Open',
      badge:
        queue !== null && queue.deadLettered > 0
          ? { label: queue.deadLettered.toLocaleString(), tone: 'red' }
          : null,
    },
    {
      id: 'access',
      title: 'Users & roles',
      status: 'Admins, sessions, character links, role audit',
      href: '/settings/access',
      cta: 'Open',
      badge: null,
    },
  ];
}
