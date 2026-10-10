import { describe, expect, it } from 'vitest';
import {
  buildPageViewMetadata,
  readUtmTags,
  referrerHostFrom,
  shouldSkip,
} from './page-view-metadata';

describe('shouldSkip', () => {
  it('skips the admin and api sections, not siblings that share their prefix', () => {
    expect(shouldSkip('/admin')).toBe(true);
    expect(shouldSkip('/admin/')).toBe(true);
    expect(shouldSkip('/admin/users')).toBe(true);
    expect(shouldSkip('/admin/users/user-1')).toBe(true);
    expect(shouldSkip('/administrator')).toBe(false);
    expect(shouldSkip('/settings/characters')).toBe(false);
    expect(shouldSkip('/api')).toBe(true);
    expect(shouldSkip('/api/sites')).toBe(true);
    expect(shouldSkip('/apidocs')).toBe(false);
    expect(shouldSkip('/sites')).toBe(false);
  });
});

describe('readUtmTags', () => {
  it('collects only the present utm params', () => {
    expect(readUtmTags(new URLSearchParams('utm_source=x&utm_medium=y'))).toEqual({
      source: 'x',
      medium: 'y',
    });
  });

  it('returns undefined when no utm params are present', () => {
    expect(readUtmTags(new URLSearchParams('foo=bar'))).toBeUndefined();
  });
});

describe('referrerHostFrom', () => {
  it('does not count the EVE sign-in callback as acquisition', () => {
    expect(referrerHostFrom('https://login.eveonline.com/oauth/authorize', 'lgi.tools')).toBeNull();
  });
  it('returns the host for a cross-origin referrer', () => {
    expect(referrerHostFrom('https://google.com/search', 'lgi.tools')).toBe('google.com');
  });

  it('drops a same-origin referrer and an empty one', () => {
    expect(referrerHostFrom('https://lgi.tools/x', 'lgi.tools')).toBeNull();
    expect(referrerHostFrom('', 'lgi.tools')).toBeNull();
  });
});

describe('buildPageViewMetadata', () => {
  it('always includes path/search/is_entry and only the present optionals', () => {
    expect(
      buildPageViewMetadata({
        path: '/sites',
        search: 'a=1',
        referrer: 'google.com',
        utm: { source: 'x' },
        visitorId: 'v1',
        isEntry: true,
      }),
    ).toEqual({
      path: '/sites',
      search: 'a=1',
      referrer: 'google.com',
      utm: { source: 'x' },
      visitor_id: 'v1',
      is_entry: true,
    });
  });

  it('omits the optionals that are null/undefined', () => {
    expect(
      buildPageViewMetadata({
        path: '/sites',
        search: '',
        referrer: null,
        utm: undefined,
        visitorId: null,
        isEntry: false,
      }),
    ).toEqual({ path: '/sites', search: '', is_entry: false });
  });
});
