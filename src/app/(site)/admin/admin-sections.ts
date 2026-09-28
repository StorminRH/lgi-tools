import { parseRange, type RangeKey } from '@/composition/admin-period';

export type AdminSectionId =
  | 'overview'
  | 'health'
  | 'esi'
  | 'traffic'
  | 'search'
  | 'queue'
  | 'statics'
  | 'access'
  | 'primitives'
  | 'cards'
  | 'widgets';

export type AdminSection = {
  id: AdminSectionId;
  href: `/${string}`;
  title: string;
  // Pages that read ?range= keep the viewer's range when navigated to.
  ranged: boolean;
  // Destinations outside the admin console open without the rail.
  leavesConsole: boolean;
};

export type AdminNavGroup = {
  id: 'console' | 'monitor' | 'actions' | 'reference';
  label: string | null;
  sections: readonly AdminSection[];
};

export type AdminBadgeTone = 'red' | 'orange';

export type AdminNavBadges = Partial<Record<AdminSectionId, { label: string; tone: AdminBadgeTone }>>;

function section(
  id: AdminSectionId,
  href: `/${string}`,
  title: string,
  options: { ranged?: boolean; leavesConsole?: boolean } = {},
): AdminSection {
  return {
    id,
    href,
    title,
    ranged: options.ranged ?? false,
    leavesConsole: options.leavesConsole ?? false,
  };
}

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    id: 'console',
    label: null,
    sections: [section('overview', '/admin', 'Overview', { ranged: true })],
  },
  {
    id: 'monitor',
    label: 'Monitor',
    sections: [
      section('health', '/admin/health', 'Health', { ranged: true }),
      section('esi', '/admin/esi', 'ESI & rate limits', { ranged: true }),
      section('traffic', '/admin/traffic', 'Traffic', { ranged: true }),
      section('search', '/admin/search', 'Search', { ranged: true }),
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    sections: [
      section('queue', '/admin/queue', 'Refresh queue'),
      section('statics', '/admin/statics', 'Wormhole statics'),
      section('access', '/settings/access', 'Users & roles', { leavesConsole: true }),
    ],
  },
  {
    id: 'reference',
    label: 'UI reference',
    sections: [
      section('primitives', '/preview/primitives', 'Primitives', { leavesConsole: true }),
      section('cards', '/preview/cards', 'Site cards', { leavesConsole: true }),
      section('widgets', '/preview/widgets', 'Widgets', { leavesConsole: true }),
    ],
  },
];

function sectionMatches(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function deriveActiveAdminSection(
  pathname: string,
  groups: readonly AdminNavGroup[] = ADMIN_NAV_GROUPS,
): AdminSection | null {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  for (const group of groups) {
    const match = group.sections.find((candidate) => sectionMatches(trimmed, candidate.href));
    if (match) return match;
  }
  return null;
}

export function rangeHref(basePath: `/${string}`, range: RangeKey): string {
  return range === parseRange(undefined) ? basePath : `${basePath}?range=${range}`;
}

// Carries the viewer's chosen range onto ranged pages; the default range
// stays off the URL so nav links match the canonical page address.
export function adminSectionHref(target: AdminSection, rawRange: string | null): string {
  if (!target.ranged || rawRange === null) return target.href;
  return rangeHref(target.href, parseRange(rawRange));
}

export function deriveNavBadges(input: {
  deadLettered: number;
  staticsPending: boolean;
}): AdminNavBadges {
  const badges: AdminNavBadges = {};
  if (input.deadLettered > 0) {
    badges.queue = { label: input.deadLettered.toLocaleString(), tone: 'red' };
  }
  if (input.staticsPending) {
    badges.statics = { label: '1', tone: 'orange' };
  }
  return badges;
}
