import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { LiveCharacterCard, type PanelCharacter } from './live-character-card';

const SYNCED_AT = Date.UTC(2026, 8, 27, 14, 5);

function render(
  overrides: Partial<Parameters<typeof LiveCharacterCard>[0]> & { needsReconnect?: boolean } = {},
): string {
  const { needsReconnect = false, ...props } = overrides;
  const character: PanelCharacter = {
    characterId: 90_000_001,
    name: 'Aurel Vantesse',
    portraitUrl: 'https://images.example.test/portrait.jpg',
    needsReconnect,
  };
  return renderToStaticMarkup(
    createElement(
      LiveCharacterCard,
      {
        character,
        lastSyncedAt: SYNCED_AT,
        hasData: true,
        isEmpty: false,
        loading: false,
        sectionLabel: 'Wallet journal',
        scopePhrase: 'wallet access',
        noun: 'wallet',
        emptyRowsText: 'No journal entries.',
        ...props,
      },
      createElement('ul', { 'data-rows': '' }),
    ),
  );
}

test('shows synced rows with their timestamp, or the empty line when there are none', () => {
  const fresh = render();
  expect(fresh).toContain('Aurel Vantesse');
  expect(fresh).toContain('as of 14:05');
  expect(fresh).toContain('data-rows');

  const emptyRows = render({ isEmpty: true });
  expect(emptyRows).toContain('No journal entries.');
  expect(emptyRows).not.toContain('data-rows');
});

test('explains a character with no data yet by load state and reconnect need', () => {
  const waiting = render({ hasData: false, lastSyncedAt: null });
  expect(waiting).toContain('Awaiting first sync.');
  expect(waiting).not.toContain('as of');
  expect(waiting).not.toContain('data-rows');

  // While the read is in flight, placeholder rows stand in for the jobs.
  const loading = render({ hasData: false, lastSyncedAt: null, loading: true });
  expect(loading).toContain('aria-label="Loading wallet"');
  expect(loading).not.toContain('Awaiting first sync.');
  expect(render({ hasData: false, loading: true, needsReconnect: true })).toContain('Nothing synced for this character.');

  const reconnect = render({ hasData: false, needsReconnect: true });
  expect(reconnect).toContain('This character is missing wallet access');
  expect(reconnect).toContain('href="/settings/characters"');
  expect(reconnect).toContain('Nothing synced for this character.');
});
