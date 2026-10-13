import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import {
  blueprintImage,
  itemImage,
  jobImage,
  nodeImage,
  type EveImageDescriptor,
} from '@/data/eve-data/type-images';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

// Keep the icon's failed state between renders so its onError drives the next one.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: rt.react.useState,
}));

import { TypeIcon } from './type-icon';

type IconProps = Parameters<typeof TypeIcon>[0];

function renderTypeIcon(image: EveImageDescriptor): string {
  return renderToStaticMarkup(
    createElement(TypeIcon, {
      ...image,
      size: 26,
      alt: 'Test item',
      mono: 'TI',
    }),
  );
}

/** Mounts the icon, fails its image, and renders the placeholder that takes its place. */
function renderFailedIcon(props: IconProps): string {
  rt.unmount();
  const image = rt.render(TypeIcon, props) as ReactElement<{ onError?: () => void }>;
  image.props.onError?.();
  return renderToStaticMarkup(rt.render(TypeIcon, props) as ReactElement);
}

test.each([
  ['item', itemImage(34), '/types/34/icon?size=32'],
  ['blueprint', blueprintImage(691), '/types/691/bp?size=32'],
  ['node', nodeImage(691, 587), '/types/691/bp?size=32'],
  ['job fallback', jobImage(3, undefined, 691), '/types/691/bp?size=32'],
])('renders a resolved %s descriptor through the matching EVE image family', (_, image, path) => {
  expect(renderTypeIcon(image)).toContain(path);
});

test('a failed icon shows the initials of the item name in a box the size of the icon', () => {
  const icon = { ...itemImage(34), size: 30 } as const;

  expect(renderFailedIcon({ ...icon, mono: 'Heavy Water' })).toBe(
    '<span class="type-icon type-icon-fallback size-[30px]" aria-hidden="true">HW</span>',
  );
  expect(renderFailedIcon({ ...icon, mono: 'Tritanium' })).toContain('>TR</span>');
  expect(renderFailedIcon({ ...icon, mono: "'Moreau' Fortizar" })).toContain('>MF</span>');
  expect(renderFailedIcon({ ...icon, mono: 'BP' })).toContain('>BP</span>');
  expect(renderFailedIcon({ ...icon, mono: '→' })).toContain('>→</span>');

  expect(renderFailedIcon({ ...icon, size: 64, alt: 'Heavy Water' })).toBe(
    '<span class="type-icon type-icon-fallback size-16" aria-label="Heavy Water" role="img">HW</span>',
  );
  expect(renderFailedIcon({ ...icon })).toContain('>?</span>');
  expect(renderFailedIcon({ ...icon, mono: '   ' })).toContain('>?</span>');
});
