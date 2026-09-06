import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { HeldServerStatus, ServerStatus, ServerStatusFallback } from './ServerStatus';

test('HeldServerStatus server snapshot matches the Suspense fallback shell', () => {
  const held = renderToStaticMarkup(
    createElement(
      HeldServerStatus,
      null,
      createElement(ServerStatus, { status: { state: 'online', players: 27_240 } }),
    ),
  );
  const fallback = renderToStaticMarkup(createElement(ServerStatusFallback));

  expect(held).toBe(fallback);
  expect(held).toContain('Loading server status');
  expect(held).not.toContain('27,240');
});
