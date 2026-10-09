import { createElement, type ReactElement } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('AdminSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the card once for its heading, hook and body', async () => {
    const html = await render(section(async () => 7));

    expect(html).toContain('<h3');
    expect(html).toContain('Registered users</h3>');
    expect(html).toContain('data-admin-card="accounts"');
    expect(html).toContain('7 total');
    expect(html).toContain('count 7');
    expect(html).toContain('reveal-2');
  });

  it('keeps the same title when its read fails, and says so', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const html = await render(section(async () => {
      throw new Error('offline');
    }));

    expect(html).toContain('Registered users</h3>');
    expect(html).toContain('Unable to load this section.');
    expect(html).not.toContain('count 7');
    expect(html).not.toContain(' total');
    expect(error).toHaveBeenCalled();
  });
});
