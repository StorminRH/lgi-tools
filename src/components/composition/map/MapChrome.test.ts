import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleNavTools } from '@/data/tools/registry';
import type { Session } from '@/platform/auth/types';

vi.mock('@/components/composition/account/AccountMenu', () => ({
  AccountMenu: () => createElement('div', { 'data-account-menu': 'true' }),
}));
vi.mock('@/components/composition/FeedbackButton', () => ({
  FeedbackButton: ({ compact }: { compact?: boolean }) =>
    createElement('button', {
      type: 'button',
      'data-feedback': compact ? 'compact' : 'default',
    }, 'Feedback'),
}));

const session: Session = {
  characterId: 1,
  name: 'Tester',
  portraitUrl: 'https://example.test/p.png',
  role: 'ADMIN',
};

describe('MapChrome', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders the home/wordmark row and every visible tool link in a new tab', async () => {
    const { MapChrome } = await import('./MapChrome');
    const html = renderToStaticMarkup(createElement(MapChrome, { session }));

    expect(html).toContain('LGI');
    expect(html).toContain('.tools');
    for (const tool of visibleNavTools()) {
      if (tool.href == null || tool.navDisabled) continue;
      expect(html).toContain(tool.label);
      expect(html).toContain(`href="${tool.href}"`);
    }
    expect(html.match(/target="_blank"/g)?.length).toBeGreaterThanOrEqual(
      1 + visibleNavTools().filter((t) => t.href != null && !t.navDisabled).length,
    );
    expect(html).toContain('rel="noreferrer"');
  });

  it('keeps the reserved centre slot empty of interactive elements', async () => {
    const { MapChrome } = await import('./MapChrome');
    const html = renderToStaticMarkup(createElement(MapChrome, { session }));
    const slotMatch = html.match(
      /<div[^>]*data-map-search-slot[^>]*>([\s\S]*?)<\/div>/,
    );
    expect(slotMatch).not.toBeNull();
    const slotBody = slotMatch?.[1] ?? 'missing';
    expect(slotBody.trim()).toBe('');
    expect(slotBody).not.toMatch(/<(button|a|input)\b/);
  });

  it('composes the account control and compact feedback affordance', async () => {
    const { MapChrome } = await import('./MapChrome');
    const html = renderToStaticMarkup(createElement(MapChrome, { session }));
    expect(html).toContain('data-account-menu');
    expect(html).toContain('data-feedback="compact"');
  });
});
