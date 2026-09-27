import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { getSystemStatics } from '@/data/wh-statics/queries';
import { deriveActionRows, type AdminActionRow } from './actions-view';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { getEsiRefreshQueueStatsShared } from './queue-stats-shared';
import { summarizeQueue } from './signals';
import { getStaticsReviewShared } from './statics-review-shared';

const REFERENCE_LINKS = [
  { href: '/preview/primitives', label: 'Primitives' },
  { href: '/preview/cards', label: 'Site cards' },
  { href: '/preview/widgets', label: 'Widgets' },
] as const;

const TILE = 'flex flex-col gap-2 bg-bg px-3.5 py-3';

function ActionTile({ row }: { row: AdminActionRow }) {
  return (
    <li className={TILE} data-admin-action={row.id}>
      <span className="flex items-center gap-2 font-ui text-ui text-text">
        {row.title}
        {row.badge ? <Pill tone={row.badge.tone}>{row.badge.label}</Pill> : null}
      </span>
      <span className="font-data text-micro text-muted">{row.status}</span>
      <Link
        href={row.href}
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'mt-auto self-start')}
      >
        {row.cta}
      </Link>
    </li>
  );
}

function ReferenceTile() {
  return (
    <li className={TILE}>
      <span className="font-ui text-ui text-text">UI reference</span>
      <span className="font-data text-micro text-muted">Preview pages for the design system</span>
      <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 font-ui text-label">
        {REFERENCE_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-isk no-underline transition-colors hover:text-name">
            {link.label} ↗
          </Link>
        ))}
      </span>
    </li>
  );
}

async function loadActionRows(): Promise<AdminActionRow[]> {
  const fetched = await loadSection('admin-actions', () =>
    Promise.all([getStaticsReviewShared(), getSystemStatics(), getEsiRefreshQueueStatsShared()]),
  );
  if (fetched === SECTION_LOAD_FAILED) {
    return deriveActionRows({ statics: null, queue: null });
  }
  const [review, promoted, queueStats] = fetched;
  return deriveActionRows({
    statics: { pendingVersion: review?.feedVersion ?? null, servingVersion: promoted.version },
    queue: summarizeQueue(queueStats, new Date()),
  });
}

export async function ActionsCard() {
  const rows = await loadActionRows();
  return (
    <Card data-admin-actions className="overflow-hidden">
      <SectionHeader size="md" label="Actions" hint="admin tools" />
      <ul className="grid grid-cols-1 gap-px bg-border-soft sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <ActionTile key={row.id} row={row} />
        ))}
        <ReferenceTile />
      </ul>
    </Card>
  );
}
