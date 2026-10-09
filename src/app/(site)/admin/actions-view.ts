import type { PillTone } from '@/components/ui/pill';
import { formatQuantity } from '@/lib/format/number';
import type { QueueSummary } from './signals';

export interface AdminActionRow {
  id: 'statics' | 'queue' | 'users';
  title: string;
  status: string;
  href: string;
  cta: string;
  badge: { label: string; tone: PillTone } | null;
}

export interface StaticsVersions {
  pendingVersion: string | null;
  servingVersion: string;
}

export function deriveActionRows(input: {
  statics: StaticsVersions | null;
  queue: Pick<QueueSummary, 'due' | 'deadLettered'> | null;
}): AdminActionRow[] {
  const { statics, queue } = input;
  return [
    staticsRow(statics),
    {
      id: 'queue',
      title: 'Refresh queue',
      status:
        queue === null
          ? 'queue unavailable'
          : `${formatQuantity(queue.deadLettered)} dead-lettered · ${formatQuantity(queue.due)} active`,
      href: '/admin/queue',
      cta: queue !== null && queue.deadLettered > 0 ? 'Retry jobs' : 'Open',
      badge:
        queue !== null && queue.deadLettered > 0
          ? { label: formatQuantity(queue.deadLettered), tone: 'red' }
          : null,
    },
    {
      id: 'users',
      title: 'Users & roles',
      status: '',
      href: '/admin/users',
      cta: 'Open',
      badge: null,
    },
  ];
}

function staticsRow(statics: StaticsVersions | null): AdminActionRow {
  const row = { id: 'statics', title: 'Wormhole statics', href: '/admin/statics' } as const;
  if (statics === null) return { ...row, status: 'statics unavailable', cta: 'Open', badge: null };
  const serving = statics.servingVersion === '' ? 'nothing promoted yet' : `serving v${statics.servingVersion}`;
  if (statics.pendingVersion === null) {
    return { ...row, status: `${serving} · no review waiting`, cta: 'Check feed', badge: null };
  }
  return {
    ...row,
    status: `v${statics.pendingVersion} waiting · ${serving}`,
    cta: 'Review',
    badge: { label: 'review', tone: 'orange' },
  };
}
