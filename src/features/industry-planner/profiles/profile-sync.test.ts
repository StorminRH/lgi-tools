import { expect, test } from 'vitest';
import type { IndustryProfileRow } from './api-contract';
import { emptyProfileDocument } from './profile-document';
import { createProfileSync, type ProfileSyncState, type ProfilesResult } from './profile-sync';
import { copyName, suggestProfileName } from './profile-view';

const row = (revision: number, name = 'Capitals'): IndustryProfileRow => ({
  id: 'p1',
  name,
  revision,
  document: emptyProfileDocument(),
  updatedAt: '2026-09-29T00:00:00.000Z',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test('quick edits save in order against the revision each save returns', async () => {
  const states: ProfileSyncState[] = [];
  const sent: { expectedRevision: number; name: string }[] = [];
  const replies = [deferred<ProfilesResult>(), deferred<ProfilesResult>()];
  const sync = createProfileSync({
    list: async () => ({ ok: true, profiles: [row(1)] }),
    update: (body) => {
      sent.push({ expectedRevision: body.expectedRevision, name: body.name });
      return replies[sent.length - 1]!.promise;
    },
    publish: (state) => states.push(state),
    notify: () => undefined,
  });
  await sync.refresh();

  const doc = emptyProfileDocument();
  sync.save('p1', { name: 'Caps', document: doc });
  sync.save('p1', { name: 'Capital line', document: doc });
  // The second edit waits for the first; the screen already shows it.
  expect(sent).toEqual([{ expectedRevision: 1, name: 'Caps' }]);
  expect(states.at(-1)?.profiles?.[0]?.name).toBe('Capital line');

  replies[0]!.resolve({ ok: true, profiles: [row(2, 'Caps')] });
  await Promise.resolve();
  await Promise.resolve();
  expect(sent).toEqual([
    { expectedRevision: 1, name: 'Caps' },
    { expectedRevision: 2, name: 'Capital line' },
  ]);
  // The older echo does not flash the older name over the queued one.
  expect(states.at(-1)?.profiles?.[0]?.name).toBe('Capital line');

  replies[1]!.resolve({ ok: true, profiles: [row(3, 'Capital line')] });
  await Promise.resolve();
  await Promise.resolve();
  expect(states.at(-1)?.profiles).toEqual([row(3, 'Capital line')]);
});

test('a refused save drops the edit, says why and reloads the server copy', async () => {
  const notices: string[] = [];
  let listed = 0;
  const states: ProfileSyncState[] = [];
  const sync = createProfileSync({
    list: async () => {
      listed += 1;
      return { ok: true, profiles: [row(listed === 1 ? 1 : 5, 'Renamed elsewhere')] };
    },
    update: async () => ({ ok: false, status: 409 }),
    publish: (state) => states.push(state),
    notify: (message) => notices.push(message),
  });
  await sync.refresh();
  sync.save('p1', { name: 'Mine', document: emptyProfileDocument() });
  expect(states.at(-1)?.profiles?.[0]?.name).toBe('Mine');
  await new Promise((r) => setTimeout(r, 0));
  expect(notices).toHaveLength(1);
  expect(listed).toBe(2);
  expect(states.at(-1)?.profiles).toEqual([row(5, 'Renamed elsewhere')]);
});

test('suggested and copied names skip names already in use', () => {
  expect(suggestProfileName([])).toBe('Production');
  expect(suggestProfileName([{ name: 'production' }, { name: 'Production 2' }])).toBe('Production 3');
  expect(copyName('Caps', [{ name: 'Caps' }])).toBe('Caps copy');
  expect(copyName('Caps', [{ name: 'Caps copy' }, { name: 'caps copy 2' }])).toBe('Caps copy 3');
});
