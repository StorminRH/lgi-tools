import { expect, test } from 'vitest';
import { longestSectionMatch, sectionMatches } from './section-path';

test('a section matches itself and its children, not a sibling that shares its prefix', () => {
  expect(sectionMatches('/sites', '/sites')).toBe(true);
  expect(sectionMatches('/sites/30002', '/sites')).toBe(true);
  expect(sectionMatches('/sites/', '/sites')).toBe(true);
  expect(sectionMatches('/sites//', '/sites')).toBe(true);
  expect(sectionMatches('/sitesx', '/sites')).toBe(false);
  expect(sectionMatches('/site', '/sites')).toBe(false);

  expect(sectionMatches('/admin', '/admin', true)).toBe(true);
  expect(sectionMatches('/admin/', '/admin', true)).toBe(true);
  expect(sectionMatches('/admin/users', '/admin', true)).toBe(false);

  expect(sectionMatches('', '/')).toBe(true);
});

test('the longest matching href wins whatever the order, ties keep the first, and no match is null', () => {
  const routes = [
    { id: 'industry', href: '/industry' },
    { id: 'build', href: '/industry/build' },
    { id: 'sites', href: '/sites' },
  ];
  const hrefOf = (route: { href: string }) => route.href;

  expect(longestSectionMatch('/industry/build/x', routes, hrefOf)?.id).toBe('build');
  expect(longestSectionMatch('/industry/build/x', [...routes].reverse(), hrefOf)?.id).toBe('build');
  expect(longestSectionMatch('/industry/123', routes, hrefOf)?.id).toBe('industry');
  expect(longestSectionMatch('/industry/build/', routes, hrefOf)?.id).toBe('build');
  expect(longestSectionMatch('/industrybuild', routes, hrefOf)).toBeNull();
  expect(longestSectionMatch('/atlas', routes, hrefOf)).toBeNull();
  expect(longestSectionMatch('/sites', [], hrefOf)).toBeNull();

  const twins = [
    { id: 'first', href: '/sites' },
    { id: 'second', href: '/sites' },
  ];
  expect(longestSectionMatch('/sites/1', twins, hrefOf)?.id).toBe('first');
});

test('an exact item matches only its own path, so a child falls through to the next match', () => {
  const sections = [
    { id: 'overview', href: '/admin', exact: true },
    { id: 'users', href: '/admin/users', exact: false },
  ];
  const hrefOf = (section: { href: string }) => section.href;
  const exactOf = (section: { exact: boolean }) => section.exact;

  expect(longestSectionMatch('/admin', sections, hrefOf, exactOf)?.id).toBe('overview');
  expect(longestSectionMatch('/admin/users/42', sections, hrefOf, exactOf)?.id).toBe('users');
  expect(longestSectionMatch('/admin/unknown', sections, hrefOf, exactOf)).toBeNull();
  expect(longestSectionMatch('/admin/unknown', sections, hrefOf)?.id).toBe('overview');
});
