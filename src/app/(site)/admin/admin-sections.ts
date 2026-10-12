import { longestSectionMatch } from '@/lib/section-path';
import { formatQuantity } from '@/lib/format/number';
import { parseRange, type RangeKey } from './period';

export type AdminSectionId =
  | 'overview'
  | 'health'
  | 'esi'
  | 'traffic'
  | 'search'
  | 'queue'
  | 'statics'
  | 'users'
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
  // Lit only on its own path, not for the pages under it.
  exact: boolean;
};

export type AdminNavGroup = {
  id: 'console' | 'monitor' | 'accounts' | 'actions' | 'reference';
  label: string | null;
  sections: readonly AdminSection[];
};

export type AdminBadgeTone = 'red' | 'orange';

export type AdminNavBadges = Partial<Record<AdminSectionId, { label: string; tone: AdminBadgeTone }>>;

function section<Id extends AdminSectionId>(
  id: Id,
  href: `/${string}`,
  title: string,
  options: { ranged?: boolean; leavesConsole?: boolean; exact?: boolean } = {},
): AdminSection & { id: Id } {
  return {
    id,
    href,
    title,
    ranged: options.ranged ?? false,
    leavesConsole: options.leavesConsole ?? false,
    exact: options.exact ?? false,
  };
}

// The one table of admin pages: every link, page title and range control reads it.
const SECTIONS = {
  overview: section('overview', '/admin', 'Overview', { ranged: true, exact: true }),
  health: section('health', '/admin/health', 'Health', { ranged: true }),
  esi: section('esi', '/admin/esi', 'ESI & rate limits', { ranged: true }),
  traffic: section('traffic', '/admin/traffic', 'Traffic', { ranged: true }),
  search: section('search', '/admin/search', 'Search', { ranged: true }),
  users: section('users', '/admin/users', 'Users & roles'),
  queue: section('queue', '/admin/queue', 'Refresh queue'),
  statics: section('statics', '/admin/statics', 'Wormhole statics'),
  primitives: section('primitives', '/preview/primitives', 'Primitives', { leavesConsole: true }),
  cards: section('cards', '/preview/cards', 'Site cards', { leavesConsole: true }),
  widgets: section('widgets', '/preview/widgets', 'Widgets', { leavesConsole: true }),
} satisfies { [Id in AdminSectionId]: AdminSection & { id: Id } };

/** The health page's scheduled-tasks card, which the overview's jobs links open at. */
export const SCHEDULED_TASKS_ANCHOR = 'scheduled';

export function adminSection(id: AdminSectionId): AdminSection {
  return SECTIONS[id];
}

/**
 * A link to an admin page. A range is carried only onto ranged pages, and the
 * default range stays off the URL, as in the rail.
 */
export function adminHref(id: AdminSectionId, options: { range?: RangeKey; hash?: string } = {}): string {
  const target = SECTIONS[id];
  const path = target.ranged && options.range !== undefined ? rangeHref(target.href, options.range) : target.href;
  return options.hash === undefined ? path : `${path}#${options.hash}`;
}

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  { id: 'console', label: null, sections: [SECTIONS.overview] },
  {
    id: 'monitor',
    label: 'Monitor',
    sections: [SECTIONS.health, SECTIONS.esi, SECTIONS.traffic, SECTIONS.search],
  },
  { id: 'accounts', label: 'Accounts', sections: [SECTIONS.users] },
  { id: 'actions', label: 'Actions', sections: [SECTIONS.queue, SECTIONS.statics] },
  {
    id: 'reference',
    label: 'UI reference',
    sections: [SECTIONS.primitives, SECTIONS.cards, SECTIONS.widgets],
  },
];

export function deriveActiveAdminSection(
  pathname: string,
  groups: readonly AdminNavGroup[] = ADMIN_NAV_GROUPS,
): AdminSection | null {
  return longestSectionMatch(
    pathname,
    groups.flatMap((group) => group.sections),
    (candidate) => candidate.href,
    (candidate) => candidate.exact,
  );
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
    badges.queue = { label: formatQuantity(input.deadLettered), tone: 'red' };
  }
  if (input.staticsPending) {
    badges.statics = { label: '1', tone: 'orange' };
  }
  return badges;
}
