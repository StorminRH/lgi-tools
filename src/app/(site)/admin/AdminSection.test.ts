import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prerender } from 'react-dom/static';
import { expect, onTestFinished, test, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { AdminSection } from './AdminSection';

vi.mock('next/navigation', () => ({ unstable_rethrow: () => undefined }));

async function render(element: ReactElement): Promise<string> {
  const { prelude } = await prerender(element, { onError: () => undefined });
  return new Response(prelude).text();
}

function section(load: () => Promise<number>) {
  return AdminSection<number>({
    title: 'Registered users',
    name: 'accounts',
    reveal: 2,
    load,
    hint: (count) => `${count} total`,
    children: (count) => createElement('p', null, `count ${count}`),
  });
}

test('AdminSection names the card the same while loading, when loaded, and when its read fails', async () => {
  const loading = renderToStaticMarkup(section(() => new Promise<number>(() => undefined)));
  expect(loading).toContain('>Registered users<');
  expect(loading).toContain('role="status" aria-label="Loading Registered users"');
  expect(loading.match(/role="status"/g)).toHaveLength(1);
  expect(loading).not.toContain('>count ');

  const loaded = await render(section(async () => 7));
  expect(loaded).toContain('Registered users</h3>');
  expect(loaded).toContain('data-admin-card="accounts"');
  expect(loaded).toContain('7 total');
  expect(loaded).toContain('count 7');
  expect(loaded).not.toContain('role="status"');

  const error = silenceConsolePrefixes('error', ['[admin] accounts section unavailable']);
  onTestFinished(() => {
    error.mockRestore();
  });
  const failed = await render(section(async () => {
    throw new Error('offline');
  }));
  expect(failed).toContain('Registered users</h3>');
  expect(failed).toContain('Unable to load this section.');
  expect(failed).not.toContain('>count ');
  expect(failed).not.toContain(' total');
});
