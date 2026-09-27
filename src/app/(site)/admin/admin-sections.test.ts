import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAV_GROUPS,
  adminSectionHref,
  deriveActiveAdminSection,
  deriveNavBadges,
  rangeHref,
} from './admin-sections';

const sectionById = (id: string) =>
  ADMIN_NAV_GROUPS.flatMap((group) => group.sections).find((section) => section.id === id)!;

describe('deriveActiveAdminSection', () => {
  it('matches the overview only on /admin itself', () => {
    expect(deriveActiveAdminSection('/admin')?.id).toBe('overview');
    expect(deriveActiveAdminSection('/admin/')?.id).toBe('overview');
    expect(deriveActiveAdminSection('/admin/esi')?.id).toBe('esi');
  });

  it('matches nested paths by section prefix', () => {
    expect(deriveActiveAdminSection('/admin/statics/anything')?.id).toBe('statics');
    expect(deriveActiveAdminSection('/admin/queue')?.id).toBe('queue');
  });

  it('returns null outside the console', () => {
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
  it('carries the chosen range onto ranged pages', () => {
    expect(adminSectionHref(sectionById('traffic'), '90d')).toBe('/admin/traffic?range=90d');
    expect(adminSectionHref(sectionById('traffic'), null)).toBe('/admin/traffic');
  });

  it('normalises an unknown range to the default', () => {
    expect(adminSectionHref(sectionById('search'), 'bogus')).toBe('/admin/search');
  });

  it('leaves unranged destinations alone', () => {
    expect(adminSectionHref(sectionById('statics'), '7d')).toBe('/admin/statics');
    expect(adminSectionHref(sectionById('access'), '7d')).toBe('/settings/access');
  });
});

describe('deriveNavBadges', () => {
  it('is empty when nothing is waiting', () => {
    expect(deriveNavBadges({ deadLettered: 0, staticsPending: false })).toEqual({});
  });

  it('badges dead letters and a pending statics review', () => {
    expect(deriveNavBadges({ deadLettered: 1200, staticsPending: true })).toEqual({
      queue: { label: '1,200', tone: 'red' },
      statics: { label: '1', tone: 'orange' },
    });
  });
});

describe('ADMIN_NAV_GROUPS', () => {
  it('marks pages outside the console', () => {
    const leaving = ADMIN_NAV_GROUPS.flatMap((group) => group.sections)
      .filter((section) => section.leavesConsole)
      .map((section) => section.id);
    expect(leaving).toEqual(['access', 'primitives', 'cards', 'widgets']);
  });
});
