import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

// Keep the logo's failed state between renders so its onError drives the next one.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: rt.react.useState,
}));

import { EntityLogo } from './entity-logo';

type LogoElement = ReactElement<{
  family?: string;
  src?: string;
  alt?: string;
  width?: number;
  onError?: () => void;
}>;

const renderLogo = (props: Parameters<typeof EntityLogo>[0]) => rt.render(EntityLogo, props) as LogoElement;

test('a corporation logo comes from the image server unlabelled, and a failed one keeps its bordered box', () => {
  rt.unmount();
  const props = { kind: 'corporation', id: 98000001, size: 36, className: 'border border-border-soft' } as const;

  const logo = renderLogo(props);
  expect(logo.props).toMatchObject({
    family: 'corporation-logo',
    src: 'https://images.evetech.net/corporations/98000001/logo?size=64',
    alt: '',
    width: 36,
  });
  const html = renderToStaticMarkup(logo);
  expect(html).toContain('src="https://images.evetech.net/corporations/98000001/logo?size=');
  expect(html).toContain('alt=""');
  expect(html).toContain('class="object-cover shrink-0 rounded-ctl size-9 border border-border-soft"');

  logo.props.onError?.();
  expect(renderToStaticMarkup(renderLogo(props))).toBe(
    '<span aria-hidden="true" class="inline-block shrink-0 rounded-ctl size-9 border border-border-soft"></span>',
  );
});

test('an alliance logo reads its own image family and carries a label when the caller gives one', () => {
  rt.unmount();
  const logo = renderLogo({ kind: 'alliance', id: 99000001, size: 20, alt: 'Halcyon Drift' });
  expect(logo.props).toMatchObject({
    family: 'alliance-logo',
    src: 'https://images.evetech.net/alliances/99000001/logo?size=64',
    width: 20,
  });
  const html = renderToStaticMarkup(logo);
  expect(html).toContain('src="https://images.evetech.net/alliances/99000001/logo?size=');
  expect(html).toContain('alt="Halcyon Drift"');
  expect(html).toContain('class="object-cover shrink-0 rounded-ctl size-5"');
});
