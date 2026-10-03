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
        syncError: null,
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

test('shows synced rows with their timestamp, and a refresh failure over stale data', () => {
  const fresh = render();
  expect(fresh).toContain('Aurel Vantesse');
  expect(fresh).toContain('as of 14:05');
  expect(fresh).toContain('data-rows');
  expect(fresh).not.toContain('Couldn');

  const stale = render({ syncError: 'budget_exhausted' });
  expect(stale).toContain('ESI budget exhausted');
  expect(stale).toContain('Couldn&#x27;t refresh — showing data as of 14:05.');
  expect(stale).toContain('data-rows');

  const emptyRows = render({ isEmpty: true });
  expect(emptyRows).toContain('No journal entries.');
  expect(emptyRows).not.toContain('data-rows');
});

test('explains a character with no data yet by sync state and reconnect need', () => {
  const failed = render({ hasData: false, lastSyncedAt: null, syncError: 'weird' });
  expect(failed).toContain('Sync failed (weird)');
  expect(failed).toContain('Couldn&#x27;t fetch this character&#x27;s wallet yet.');
  expect(failed).toContain('Awaiting first sync.');
  expect(failed).not.toContain('as of');
  expect(failed).not.toContain('data-rows');

  // While the read is in flight, placeholder rows stand in for the jobs.
  const loading = render({ hasData: false, lastSyncedAt: null, loading: true });
  expect(loading).toContain('aria-label="Loading wallet"');
  expect(loading).not.toContain('Awaiting first sync.');
  expect(render({ hasData: false, loading: true, needsReconnect: true })).toContain('Nothing synced for this character.');

  // A character that needs a reconnect is told so once, not also as a sync error.
  const reconnect = render({ hasData: false, syncError: 'reauth_required', needsReconnect: true });
  expect(reconnect).not.toContain('Reconnect needed');
  expect(reconnect).toContain('This character is missing wallet access');
  expect(reconnect).toContain('href="/settings/characters"');
  expect(reconnect).toContain('Nothing synced for this character.');

  // With a reconnect action the gate replaces the body until the character reconnects.
  const action = createElement('button', { type: 'button' }, 'Reconnect now');
  const gated = render({ needsReconnect: true, reconnectAction: action, reconnectReason: 'Needs wallet scope.' });
  expect(gated).toContain('Reconnect now');
  expect(gated).toContain('Needs wallet scope.');
  expect(gated).not.toContain('data-rows');
  expect(gated).not.toContain('This character is missing');
  const granted = render({ reconnectAction: action });
  expect(granted).toContain('data-rows');
  expect(granted).not.toContain('Reconnect now');
});
