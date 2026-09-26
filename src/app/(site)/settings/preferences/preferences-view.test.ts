import { expect, test } from 'vitest';
import { PAGE_SETTINGS_SPECS } from '@/composition/page-settings/specs';
import { atlasCameraFollow, sitesView } from '@/lib/preferences';
import type { PageSettingsSpec } from '@/platform/page-settings/types';
import { derivePreferenceGroups } from './preferences-view';

test('the preferences section gathers every registered page preference, titled per page, and skips pages without any', () => {
  const groups = derivePreferenceGroups(PAGE_SETTINGS_SPECS);

  const byRoute = new Map(groups.map((group) => [group.route, group]));
  expect(byRoute.get('/sites')?.title).toBe('Sites');
  expect(byRoute.get('/sites')?.models.map((model) => model.key)).toEqual([
    'sites.view',
    'sites.detailMode',
  ]);
  expect(byRoute.get('/atlas')?.title).toBe('Map');
  expect(byRoute.get('/atlas')?.models.map((model) => model.key)).toEqual([
    'atlas.cameraFollow',
    'atlas.clickFocus',
  ]);

  for (const route of ['/settings', '/skills', '/jobs']) {
    expect(byRoute.has(route)).toBe(false);
  }
  for (const group of groups) {
    expect(group.models.length).toBeGreaterThan(0);
    expect(group.id).toBe(group.route);
  }
});

test('inline and section placements merge without duplicates and unknown keys are dropped', () => {
  const spec: PageSettingsSpec = {
    route: '/demo',
    title: 'Demo settings',
    controls: [
      { key: sitesView.key, placement: 'section' },
      { key: sitesView.key, placement: 'inline' },
      { key: atlasCameraFollow.key, placement: 'inline' },
      { key: 'nope.missing', placement: 'section' },
      { kind: 'feature', id: 'corp-structure-sharing', placement: 'inline' },
    ],
  };

  const [group] = derivePreferenceGroups([spec, { route: '/empty' }]);
  expect(group?.title).toBe('Demo');
  expect(group?.models.map((model) => `${model.kind}:${model.key}`)).toEqual([
    'preference-enum:sites.view',
    'preference-boolean:atlas.cameraFollow',
  ]);
  expect(derivePreferenceGroups([spec, { route: '/empty' }])).toHaveLength(1);
});
