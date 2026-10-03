import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { HeldServerStatus, ServerStatus, ServerStatusFallback } from './ServerStatus';

const ONLINE = { state: 'online', players: 27_240, build: '3569502', startedAt: null } as const;

test('HeldServerStatus server snapshot matches the Suspense fallback shell', () => {
  const held = renderToStaticMarkup(
    createElement(
      HeldServerStatus,
      null,
      createElement(ServerStatus, { status: ONLINE }, createElement('p', null, 'details')),
    ),
  );
  const fallback = renderToStaticMarkup(createElement(ServerStatusFallback));

  expect(held).toBe(fallback);
  expect(held).toContain('Loading server status');
  expect(held).not.toContain('27,240');
});

test('ServerStatus reads as flat header text that names the server and its count', () => {
  const html = renderToStaticMarkup(
    createElement(ServerStatus, { status: ONLINE }, createElement('p', null, 'details')),
  );
  expect(html).toContain('aria-label="Tranquility online — 27,240 players"');
  expect(html).toContain('TQ');
  expect(html).toContain('27,240');
  expect(html).not.toContain('data-tone');
});

test('an unknown status reads as unknown, not offline', () => {
  const html = renderToStaticMarkup(createElement(ServerStatus, { status: { state: 'unknown' } }));
  expect(html).toContain('aria-label="Tranquility status unknown"');
  expect(html).toContain('unknown');
  expect(html).not.toContain('offline<');
});
