import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { sessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';
import { EVE_SCOPES } from '@/platform/auth/eve-sso-constants';
import type { LinkedCharacter } from '@/platform/auth/linked-characters';

const m = vi.hoisted(() => ({
  getFullSession: vi.fn<() => Promise<BetterAuthSession | null>>(),
  listLinkedCharacters: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock('@/composition/session', () => ({ getFullSession: m.getFullSession }));
vi.mock('@/platform/auth/linked-characters', () => ({ listLinkedCharacters: m.listLinkedCharacters }));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => createElement('a', { href }, children),
}));

import CharactersSettingsPage from './page';

const linked = (characterId: number, name: string, overrides: Partial<LinkedCharacter> = {}): LinkedCharacter => ({
  characterId,
  name,
  portraitUrl: `https://images.example.test/${characterId}.jpg`,
  scope: EVE_SCOPES.join(' '),
  hasRefreshToken: true,
  linkedAt: new Date('2026-01-01T00:00:00Z'),
  corporationId: null,
  allianceId: null,
  affiliationRefreshedAt: null,
  ...overrides,
});

async function renderContent(error?: string): Promise<string> {
  const page = CharactersSettingsPage({ searchParams: Promise.resolve({ error }) }) as ReactElement<{
    children: [ReactNode, ReactElement<{ children: ReactElement<object, (props: object) => Promise<ReactNode>> }>];
  }>;
  const content = page.props.children[1].props.children;
  return renderToStaticMarkup(await content.type(content.props));
}

test('lists each linked character with its health, access, and the actions it allows', async () => {
  m.getFullSession.mockResolvedValue(sessionFixture({ user: { id: 'user-1' }, characterId: 90_000_001 }));
  m.listLinkedCharacters.mockResolvedValue([
    linked(90_000_001, 'Aurel Vantesse', { authorizationDelayed: true }),
    linked(90_000_002, 'Bram Oskarsen', { scope: null, hasRefreshToken: false }),
  ]);

  const html = await renderContent();
  expect(m.listLinkedCharacters).toHaveBeenCalledWith('user-1');
  const active = html.slice(html.indexOf('Aurel Vantesse'), html.indexOf('Bram Oskarsen'));
  const other = html.slice(html.indexOf('Bram Oskarsen'));

  expect(active).toContain('ID 90000001');
  expect(active).toContain('Active');
  expect(active).toContain('Verification delayed');
  expect(active).toContain('Access resumes when verification succeeds.');
  expect(active).toContain('Granted access');
  expect(active).not.toContain('Make active');
  expect(active).not.toContain('>Reconnect<');

  expect(other).toContain('Disconnected');
  expect(other).toContain('>Reconnect<');
  expect(other).toContain('Make active');
  expect(other).not.toContain('Granted access');
  expect(other).not.toContain('Access resumes');
  expect(html).not.toContain('disabled=""');
  expect(html).not.toContain('Heads up');
});

test('keeps the only character linked and explains a failed link', async () => {
  m.getFullSession.mockResolvedValue(sessionFixture({ user: { id: 'user-2' }, characterId: 90_000_003 }));
  m.listLinkedCharacters.mockResolvedValue([linked(90_000_003, 'Kessa Draymoor', { scope: 'publicData' })]);

  const html = await renderContent('last_character');
  expect(html).toContain('Heads up');
  expect(html).toContain('You can&#x27;t unlink your only character.');
  expect(html).toContain('Missing scopes');
  expect(html).toContain('disabled=""');
  expect(await renderContent('something_else')).toContain('Linking was cancelled or failed.');

  m.getFullSession.mockResolvedValue(null);
  await expect(renderContent()).rejects.toThrow('NEXT_REDIRECT /?auth_error=login_required');
});
