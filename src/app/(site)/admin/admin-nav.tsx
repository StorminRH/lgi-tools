'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { NavRailDrawer, NavRailPanel } from '@/components/ui/nav-rail';
import { cn } from '@/components/ui/cn';
import { pillToneClasses } from '@/components/ui/pill';
import { eyebrow } from '@/components/ui/type-roles';
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
      className="relative flex items-center gap-2 rounded-r-ctl py-1.5 pl-3 pr-2 font-ui text-ui tracking-optical text-muted no-underline transition-colors before:absolute before:-left-px before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-transparent before:content-[''] hover:bg-row-hover hover:text-text aria-[current=page]:bg-row-hover aria-[current=page]:text-isk aria-[current=page]:before:bg-isk motion-reduce:transition-none"
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
    <nav className="font-ui" aria-label="Admin sections">
      {groups.map((group) => (
        <div key={group.id} className="mb-4 last:mb-0">
          {group.label ? (
            <div
              className={eyebrow({
                size: 'micro',
                tone: 'faint',
                weight: 'semibold',
                emphasis: 'strong',
                className: 'mb-1.5 pl-3',
              })}
            >
              {group.label}
            </div>
          ) : null}
          <ul className="list-none border-l border-nav-guide">
            {group.sections.map((section) => (
              <li key={section.id}>
                <AdminNavLink
                  section={section}
                  active={active?.id === section.id}
                  href={adminSectionHref(section, range)}
                  badge={badges[section.id]}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminNavFrame({
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
  const tree = <AdminNavTree groups={groups} active={active} badges={badges} range={range} />;
  return (
    <>
      <NavRailDrawer
        data-admin-nav-mobile
        title="Admin"
        label="Section"
        current={active?.title ?? 'Choose a section'}
      >
        {tree}
      </NavRailDrawer>
      <NavRailPanel data-admin-nav-rail>{tree}</NavRailPanel>
    </>
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
    />
  );
}
