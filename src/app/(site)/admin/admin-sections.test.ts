import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAV_GROUPS,
  adminHref,
  adminSection,
  adminSectionHref,
  deriveActiveAdminSection,
  deriveNavBadges,
  rangeHref,
} from './admin-sections';

const sectionById = (id: string) =>
  ADMIN_NAV_GROUPS.flatMap((group) => group.sections).find((section) => section.id === id)!;

describe('ADMIN_NAV_GROUPS', () => {
  it('lists every section exactly once, as the table names it', () => {
    const sections = ADMIN_NAV_GROUPS.flatMap((group) => group.sections);

    expect(sections.map((section) => section.id)).toEqual([
      'overview',
      'health',
      'esi',
      'traffic',
      'search',
      'users',
      'statics',
      'primitives',
      'cards',
      'widgets',
    ]);
    for (const section of sections) expect(adminSection(section.id)).toBe(section);
  });
});

describe('deriveActiveAdminSection', () => {
  it('matches the overview exactly, other sections by prefix, and nothing outside the console', () => {
    expect(deriveActiveAdminSection('/admin')?.id).toBe('overview');
    expect(deriveActiveAdminSection('/admin/')?.id).toBe('overview');
    expect(deriveActiveAdminSection('/admin/esi')?.id).toBe('esi');
    expect(deriveActiveAdminSection('/admin/statics/anything')?.id).toBe('statics');
    expect(deriveActiveAdminSection('/admin/unlisted')).toBeNull();
    expect(deriveActiveAdminSection('/admin-ish')).toBeNull();
    expect(deriveActiveAdminSection('/')).toBeNull();
  });
});

describe('rangeHref', () => {
  it('keeps the default range off the URL', () => {
    expect(rangeHref('/admin/esi', '30d')).toBe('/admin/esi');
    expect(rangeHref('/admin/esi', '7d')).toBe('/admin/esi?range=7d');
    expect(rangeHref('/admin', 'all')).toBe('/admin?range=all');
  });
});

describe('adminSectionHref', () => {
  it('carries a valid range onto ranged pages only', () => {
    expect(adminSectionHref(sectionById('traffic'), '90d')).toBe('/admin/traffic?range=90d');
    expect(adminSectionHref(sectionById('traffic'), null)).toBe('/admin/traffic');
    expect(adminSectionHref(sectionById('search'), 'bogus')).toBe('/admin/search');
    expect(adminSectionHref(sectionById('statics'), '7d')).toBe('/admin/statics');
    expect(adminSectionHref(sectionById('users'), '7d')).toBe('/admin/users');
  });
});

describe('adminHref', () => {
  it('carries a range onto ranged pages only, keeps the default off the URL, and appends an anchor', () => {
    expect(adminHref('users')).toBe('/admin/users');
    expect(adminHref('statics', { range: '7d' })).toBe('/admin/statics');
    expect(adminHref('traffic')).toBe('/admin/traffic');
    expect(adminHref('traffic', { range: '30d' })).toBe('/admin/traffic');
    expect(adminHref('search', { range: '90d' })).toBe('/admin/search?range=90d');
    expect(adminHref('overview', { range: 'all' })).toBe('/admin?range=all');
    expect(adminHref('health', { hash: 'scheduled' })).toBe('/admin/health#scheduled');
    expect(adminHref('health', { range: '7d', hash: 'scheduled' })).toBe('/admin/health?range=7d#scheduled');
  });
});

describe('deriveNavBadges', () => {
  it('is empty when nothing is waiting', () => {
    expect(deriveNavBadges({ staticsPending: false })).toEqual({});
  });

  it('badges a pending statics review', () => {
    expect(deriveNavBadges({ staticsPending: true })).toEqual({
      statics: { label: '1', tone: 'orange' },
    });
  });
});
