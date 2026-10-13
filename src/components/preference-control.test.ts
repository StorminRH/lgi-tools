import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { atlasCameraFollow, atlasClickFocus, sitesView } from '@/lib/preferences';
import type { MenuControlModel } from '@/platform/page-settings/controls';
import { PreferenceControl } from './preference-control';

const render = (model: MenuControlModel) => renderToStaticMarkup(createElement(PreferenceControl, { model }));

test('an enum preference renders its options as a segmented group with the unset fallback pressed', () => {
  const html = render({
    kind: 'preference-enum',
    key: 'sites.view',
    label: 'View',
    options: ['cards', 'table'],
    def: sitesView,
  });
  expect(html).toMatch(/^<div [^>]*role="group" aria-label="View"/);
  expect(html).toMatch(/<button [^>]*aria-pressed="true"[^>]*>cards<\/button>/);
  expect(html).toMatch(/<button [^>]*aria-pressed="false"[^>]*>table<\/button>/);
  expect(html).not.toContain('role="switch"');
});

test('a boolean preference renders a switch named by its label and checked from the unset fallback', () => {
  const off = render({
    kind: 'preference-boolean',
    key: 'atlas.cameraFollow',
    label: 'Camera follow',
    def: atlasCameraFollow,
  });
  expect(off).toMatch(/role="switch"[^>]*aria-checked="false" aria-label="Camera follow"/);
  expect(off).not.toContain('aria-pressed');

  const on = render({
    kind: 'preference-boolean',
    key: 'atlas.clickFocus',
    label: 'Click focus',
    def: atlasClickFocus,
  });
  expect(on).toMatch(/role="switch"[^>]*aria-checked="true" aria-label="Click focus"/);
});
