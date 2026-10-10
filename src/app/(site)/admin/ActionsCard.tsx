import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { CardLink } from '@/components/ui/text-link';
import { getSystemStatics } from '@/data/wh-statics/queries';
import { deriveActionRows, type AdminActionRow, type StaticsVersions } from './actions-view';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { getEsiRefreshQueueStatsShared, getStaticsSummaryShared } from './shared-reads';
import { summarizeQueue } from './signals';

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
      {row.status ? <span className="font-data text-micro text-muted">{row.status}</span> : null}
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
      <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 font-ui text-label">
        {REFERENCE_LINKS.map((link) => (
          <CardLink key={link.href} href={link.href} arrow="↗">{link.label}</CardLink>
        ))}
      </span>
    </li>
  );
}

async function loadStaticsVersions(): Promise<StaticsVersions> {
  const [pending, promoted] = await Promise.all([getStaticsSummaryShared(), getSystemStatics()]);
  return { pendingVersion: pending?.feedVersion ?? null, servingVersion: promoted.version };
}

/**
 * The tiles never fail as a whole: each source loads on its own, and a tile
 * whose source failed says so and still links to its page.
 */
export async function loadActionRows(): Promise<AdminActionRow[]> {
  const [statics, queue] = await Promise.all([
    loadSection('admin-actions.statics', loadStaticsVersions),
    loadSection('admin-actions.queue', async () => summarizeQueue(await getEsiRefreshQueueStatsShared(), new Date())),
  ]);
  return deriveActionRows({
    statics: statics === SECTION_LOAD_FAILED ? null : statics,
    queue: queue === SECTION_LOAD_FAILED ? null : queue,
  });
}

export function ActionTiles({ rows }: { rows: AdminActionRow[] }) {
  return (
    <ul className="grid grid-cols-1 gap-px bg-border-soft sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((row) => (
        <ActionTile key={row.id} row={row} />
      ))}
      <ReferenceTile />
    </ul>
  );
}
