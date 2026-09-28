'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { NavRailFrame, NavRailTree, navRailLink } from '@/components/ui/nav-rail';
import { cn } from '@/components/ui/cn';
import { pillToneClasses } from '@/components/ui/pill';
import {
  adminSectionHref,
  deriveActiveAdminSection,
  type AdminNavBadges,
  type AdminNavGroup,
  type AdminSection,
} from './admin-sections';

function AdminNavLink({
  section,
  active,
  href,
  badge,
}: {
  section: AdminSection;
  active: boolean;
  href: string;
  badge: AdminNavBadges[keyof AdminNavBadges];
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      data-admin-nav-item={section.id}
      className={cn(navRailLink, 'flex items-center gap-2')}
    >
      <span className="min-w-0 flex-1 truncate">{section.title}</span>
      {badge ? (
        <span
          className={cn(
            'shrink-0 rounded-full border px-1.5 font-data text-micro leading-4 tabular-nums',
            pillToneClasses[badge.tone],
          )}
        >
          {badge.label}
        </span>
      ) : null}
      {section.leavesConsole ? (
        <span aria-hidden className="text-micro text-faint">
          ↗
        </span>
      ) : null}
    </Link>
  );
}

function AdminNavTree({
  groups,
  active,
  badges,
  range,
}: {
  groups: readonly AdminNavGroup[];
  active: AdminSection | null;
  badges: AdminNavBadges;
  range: string | null;
}) {
  return (
    <NavRailTree
      label="Admin sections"
      groups={groups}
      renderSection={(section) => (
        <AdminNavLink
          section={section}
          active={active?.id === section.id}
          href={adminSectionHref(section, range)}
          badge={badges[section.id]}
        />
      )}
    />
  );
}

function AdminNavFrame({
  groups,
  active,
  badges,
  range,
  reveal,
}: {
  groups: readonly AdminNavGroup[];
  active: AdminSection | null;
  badges: AdminNavBadges;
  range: string | null;
  reveal: boolean;
}) {
  const tree = <AdminNavTree groups={groups} active={active} badges={badges} range={range} />;
  return (
    <NavRailFrame
      title="Admin"
      current={active?.title ?? 'Choose a section'}
      reveal={reveal}
      mobileProps={{ 'data-admin-nav-mobile': true }}
      panelProps={{ 'data-admin-nav-rail': true }}
    >
      {tree}
    </NavRailFrame>
  );
}

// The rail reads ?range= and streams its badges, so it always resolves at
// request time and replaces this fallback. Every admin route is a static
// segment, so the fallback can prerender the active section, and the
// resolved rail skips its entrance to take the fallback's place without a
// blink.
export function AdminNavFallback({ groups }: { groups: readonly AdminNavGroup[] }) {
  return (
    <AdminNavFrame
      groups={groups}
      active={deriveActiveAdminSection(usePathname(), groups)}
      badges={{}}
      range={null}
      reveal
    />
  );
}

export function AdminNav({
  groups,
  badges,
}: {
  groups: readonly AdminNavGroup[];
  badges: AdminNavBadges;
}) {
  return (
    <AdminNavFrame
      groups={groups}
      active={deriveActiveAdminSection(usePathname(), groups)}
      badges={badges}
      range={useSearchParams().get('range')}
      reveal={false}
    />
  );
}
