import { expect, test, vi } from 'vitest';
import type { IndustryProfileRow } from './api-contract';
import { emptyProfileDocument } from './profile-document';
import { createProfileSync, type ProfileSyncState, type ProfilesResult } from './profile-sync';
import { copyName, createFailureMessage, saveFailureMessage, suggestProfileName } from './profile-view';

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
    list: async () => ({ ok: true, data: { profiles: [row(1)] } }),
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
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  sync.save('p1', { name: 'Capital line', document: doc });
  // The second edit waits for the first; the screen already shows it.
  expect(sent).toEqual([{ expectedRevision: 1, name: 'Caps' }]);
  expect(states.at(-1)?.profiles?.[0]?.name).toBe('Capital line');

  replies[0]!.resolve({ ok: true, data: { profiles: [row(2, 'Caps')] } });
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  expect(sent).toEqual([
    { expectedRevision: 1, name: 'Caps' },
    { expectedRevision: 2, name: 'Capital line' },
  ]);
  // The older echo does not flash the older name over the queued one.
  expect(states.at(-1)?.profiles?.[0]?.name).toBe('Capital line');

  replies[1]!.resolve({ ok: true, data: { profiles: [row(3, 'Capital line')] } });
  await vi.waitFor(() => expect(states.at(-1)?.profiles).toEqual([row(3, 'Capital line')]));
});

test('a refused save drops the edit, says why and reloads the server copy', async () => {
  const notices: string[] = [];
  let listed = 0;
  const states: ProfileSyncState[] = [];
  const sync = createProfileSync({
    list: async () => {
      listed += 1;
      return { ok: true, data: { profiles: [row(listed === 1 ? 1 : 5, 'Renamed elsewhere')] } };
    },
    update: async () => ({ ok: false, error: { code: 'stale_revision' } }),
    publish: (state) => states.push(state),
    notify: (message) => notices.push(message),
  });
  await sync.refresh();
  sync.save('p1', { name: 'Mine', document: emptyProfileDocument() });
  expect(states.at(-1)?.profiles?.[0]?.name).toBe('Mine');
  await vi.waitFor(() => expect(notices).toHaveLength(1));
  expect(notices[0]).toBe('This profile changed somewhere else. Showing the latest version.');
  expect(listed).toBe(2);
  expect(states.at(-1)?.profiles).toEqual([row(5, 'Renamed elsewhere')]);
});

test.each([
  ['profile_missing', 'This profile was deleted somewhere else.'],
  ['not_linked', 'A character on this profile is no longer linked to your account.'],
  // A body the server would not take, such as one over a limit, does not blame a character.
  ['invalid_body', "Couldn't save the profile. Showing the last saved version."],
  [undefined, "Couldn't save the profile. Showing the last saved version."],
])('a save refused for %s says so', (reason, message) => {
  expect(saveFailureMessage(reason)).toBe(message);
});

test.each([
  ['profile_limit', 'You have reached the profile limit. Delete one to make room.'],
  ['not_linked', 'A character on this profile is no longer linked to your account.'],
  ['invalid_body', "Couldn't create the profile."],
  [undefined, "Couldn't create the profile."],
])('a create refused for %s says so', (reason, message) => {
  expect(createFailureMessage(reason)).toBe(message);
});

test('suggested and copied names skip names already in use', () => {
  expect(suggestProfileName([])).toBe('Production');
  expect(suggestProfileName([{ name: 'production' }, { name: 'Production 2' }])).toBe('Production 3');
  expect(copyName('Caps', [{ name: 'Caps' }])).toBe('Caps copy');
  expect(copyName('Caps', [{ name: 'Caps copy' }, { name: 'caps copy 2' }])).toBe('Caps copy 3');
});

test('copied maximum-length names retain a unique suffix within the name limit', () => {
  const name = 'x'.repeat(60);
  const first = `${'x'.repeat(55)} copy`;
  const second = `${'x'.repeat(53)} copy 2`;
  expect(copyName(name, [{ name }])).toBe(first);
  expect(copyName(name, [{ name }, { name: first.toUpperCase() }])).toBe(second);
  expect(copyName(name, [{ name }, { name: first }, { name: second }])).toBe(`${'x'.repeat(53)} copy 3`);
  const existing = [name, first, ...Array.from({ length: 8 }, (_, i) => `${'x'.repeat(53)} copy ${i + 2}`)];
  expect(copyName(name, existing.map((name) => ({ name })))).toBe(`${'x'.repeat(52)} copy 10`);
});

test('different profiles share request order and keep the latest revision for the next edit', async () => {
  const a = { ...row(1, 'A'), id: 'a' };
  const b = { ...row(1, 'B'), id: 'b' };
  const replies = [deferred<ProfilesResult>(), deferred<ProfilesResult>(), deferred<ProfilesResult>()];
  const sent: { id: string; expectedRevision: number; name: string }[] = [];
  const states: ProfileSyncState[] = [];
  const sync = createProfileSync({
    list: async () => ({ ok: true, data: { profiles: [a, b] } }),
    update: (body) => {
      sent.push(body);
      return replies[sent.length - 1]!.promise;
    },
    publish: (state) => states.push(state),
    notify: () => undefined,
  });
  await sync.refresh();
  sync.save('a', { name: 'A saved', document: a.document });
  sync.save('b', { name: 'B saved', document: b.document });
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toMatchObject({ id: 'a', expectedRevision: 1 });
  expect(states.at(-1)?.profiles?.map((r) => r.name)).toEqual(['A saved', 'B saved']);

  const savedA = { ...a, name: 'A saved', revision: 2 };
  replies[0]!.resolve({ ok: true, data: { profiles: [savedA, b] } });
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  expect(sent[1]).toMatchObject({ id: 'b', expectedRevision: 1 });
  const savedB = { ...b, name: 'B saved', revision: 2 };
  replies[1]!.resolve({ ok: true, data: { profiles: [savedA, savedB] } });
  await vi.waitFor(() => expect(states.at(-1)?.profiles).toEqual([savedA, savedB]));

  sync.save('b', { name: 'B next', document: b.document });
  await vi.waitFor(() => expect(sent).toHaveLength(3));
  expect(sent[2]).toMatchObject({ id: 'b', expectedRevision: 2, name: 'B next' });
  replies[2]!.resolve({ ok: true, data: { profiles: [savedA, { ...savedB, name: 'B next', revision: 3 }] } });
  await vi.waitFor(() => expect(states.at(-1)?.profiles?.[1]?.revision).toBe(3));
});

test('refresh requested during a save reads after that save completes', async () => {
  let serverRow = row(1);
  const reply = deferred<ProfilesResult>();
  const list = vi.fn(async (): Promise<ProfilesResult> => ({ ok: true, data: { profiles: [serverRow] } }));
  const update = vi.fn(() => reply.promise);
  const states: ProfileSyncState[] = [];
  const sync = createProfileSync({ list, update, publish: (s) => states.push(s), notify: () => undefined });
  await sync.refresh();
  sync.save('p1', { name: 'Saved', document: serverRow.document });
  await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
  const refresh = sync.refresh();
  expect(list).toHaveBeenCalledOnce();
  serverRow = row(2, 'Saved');
  reply.resolve({ ok: true, data: { profiles: [serverRow] } });
  await refresh;
  expect(list).toHaveBeenCalledTimes(2);
  expect(states.at(-1)?.profiles).toEqual([row(2, 'Saved')]);
});

test('a queued edit keeps its original revision when another profile response reveals an external change', async () => {
  const a = { ...row(1, 'A'), id: 'a' };
  const b = { ...row(1, 'B'), id: 'b' };
  const externalA = { ...a, name: 'A changed in another tab', revision: 2 };
  const savedB = { ...b, name: 'B saved', revision: 2 };
  const reply = deferred<ProfilesResult>();
  const sent: { id: string; expectedRevision: number }[] = [];
  const notices: string[] = [];
  const states: ProfileSyncState[] = [];
  let serverRows = [a, b];
  const sync = createProfileSync({
    list: async () => ({ ok: true, data: { profiles: serverRows } }),
    update: (body) => {
      sent.push(body);
      if (body.id === 'b') return reply.promise;
      return Promise.resolve({ ok: false, error: { code: 'stale_revision' } });
    },
    publish: (s) => states.push(s),
    notify: (message) => notices.push(message),
  });
  await sync.refresh();
  sync.save('b', { name: 'B saved', document: b.document });
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  sync.save('a', { name: 'A stale edit', document: a.document });
  serverRows = [externalA, savedB];
  reply.resolve({ ok: true, data: { profiles: serverRows } });
  await vi.waitFor(() => expect(notices).toHaveLength(1));
  expect(sent).toMatchObject([{ id: 'b', expectedRevision: 1 }, { id: 'a', expectedRevision: 1 }]);
  expect(states.at(-1)?.profiles).toEqual([externalA, savedB]);
});

test('a refresh cannot advance the revision underlying an optimistic edit', async () => {
  const reply = deferred<ProfilesResult>();
  const notices: string[] = [];
  const sent: number[] = [];
  let listed = 0;
  const states: ProfileSyncState[] = [];
  const sync = createProfileSync({
    list: () => {
      listed += 1;
      return listed === 1
        ? Promise.resolve({ ok: true, data: { profiles: [row(1)] } })
        : reply.promise;
    },
    update: async (body) => {
      sent.push(body.expectedRevision);
      return { ok: false, error: { code: 'stale_revision' } };
    },
    publish: (s) => states.push(s),
    notify: (message) => notices.push(message),
  });
  await sync.refresh();
  const refresh = sync.refresh();
  sync.save('p1', { name: 'Stale edit', document: emptyProfileDocument() });
  reply.resolve({ ok: true, data: { profiles: [row(2, 'Changed elsewhere')] } });
  await refresh;
  await vi.waitFor(() => expect(notices).toHaveLength(1));
  expect(sent).toEqual([1]);
  expect(states.at(-1)?.profiles).toEqual([row(2, 'Changed elsewhere')]);
});

test('duplication follows an edit queued during an active save and preserves its created id', async () => {
  let serverRow = row(1);
  const first = deferred<ProfilesResult>();
  const events: string[] = [];
  const states: ProfileSyncState[] = [];
  const sync = createProfileSync({
    list: async () => ({ ok: true, data: { profiles: [serverRow] } }),
    update: async (body) => {
      events.push(body.name);
      if (events.length === 1) return first.promise;
      serverRow = row(body.expectedRevision + 1, body.name);
      return { ok: true, data: { profiles: [serverRow] } };
    },
    publish: (s) => states.push(s),
    notify: () => undefined,
  });
  await sync.refresh();
  sync.save('p1', { name: 'Edit 1', document: serverRow.document });
  await vi.waitFor(() => expect(events).toEqual(['Edit 1']));
  sync.save('p1', { name: 'Edit 2', document: serverRow.document });
  const duplicated = sync.request(async () => {
    events.push('duplicate');
    const copy = { ...serverRow, id: 'copy', name: `${serverRow.name} copy` };
    return { ok: true as const, data: { profiles: [serverRow, copy], id: copy.id } };
  });
  serverRow = row(2, 'Edit 1');
  first.resolve({ ok: true, data: { profiles: [serverRow] } });
  const res = await duplicated;
  expect(events).toEqual(['Edit 1', 'Edit 2', 'duplicate']);
  expect(res.data.id).toBe('copy');
  expect(states.at(-1)?.profiles?.map((r) => r.name)).toEqual(['Edit 2', 'Edit 2 copy']);
});

test('deletion waits for an active save and discards edits queued behind the delete', async () => {
  let serverRows = [row(1)];
  const reply = deferred<ProfilesResult>();
  const update = vi.fn(() => reply.promise);
  const remove = vi.fn(async (): Promise<ProfilesResult> => {
    serverRows = [];
    return { ok: true, data: { profiles: serverRows } };
  });
  const states: ProfileSyncState[] = [];
  const sync = createProfileSync({
    list: async () => ({ ok: true, data: { profiles: serverRows } }),
    update,
    publish: (s) => states.push(s),
    notify: () => undefined,
  });
  await sync.refresh();
  sync.save('p1', { name: 'Saved', document: emptyProfileDocument() });
  await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
  const deleted = sync.request(remove);
  sync.save('p1', { name: 'Queued after delete', document: emptyProfileDocument() });
  expect(remove).not.toHaveBeenCalled();
  reply.resolve({ ok: true, data: { profiles: [row(2, 'Saved')] } });
  await deleted;
  expect(states.at(-1)?.profiles).toEqual([]);
  await sync.refresh();
  expect(states.at(-1)?.profiles).toEqual([]);
  expect(update).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
});

test('a failed delete leaves a queued edit intact and the queue continues after a rejection', async () => {
  let serverRow = row(1);
  const states: ProfileSyncState[] = [];
  const sent: number[] = [];
  const sync = createProfileSync({
    list: async () => ({ ok: true, data: { profiles: [serverRow] } }),
    update: async (body) => {
      sent.push(body.expectedRevision);
      serverRow = row(2, body.name);
      return { ok: true, data: { profiles: [serverRow] } };
    },
    publish: (s) => states.push(s),
    notify: () => undefined,
  });
  await sync.refresh();
  const failedDelete = sync.request(async (): Promise<ProfilesResult> => ({ ok: false }));
  sync.save('p1', { name: 'Still editable', document: emptyProfileDocument() });
  expect(await failedDelete).toEqual({ ok: false });
  await vi.waitFor(() => expect(states.at(-1)?.profiles).toEqual([row(2, 'Still editable')]));
  expect(sent).toEqual([1]);
  await expect(sync.request(async (): Promise<ProfilesResult> => { throw new Error('Connection lost'); })).rejects.toThrow('Connection lost');
  await sync.refresh();
  expect(states.at(-1)?.listFailed).toBe(false);
});

test('an own save advances queued edits by one revision even when its list includes a later external write', async () => {
  const reply = deferred<ProfilesResult>();
  const sent: number[] = [];
  const notices: string[] = [];
  const states: ProfileSyncState[] = [];
  let serverRow = row(1);
  const sync = createProfileSync({
    list: async () => ({ ok: true, data: { profiles: [serverRow] } }),
    update: (body) => {
      sent.push(body.expectedRevision);
      return sent.length === 1 ? reply.promise : Promise.resolve({ ok: false, error: { code: 'stale_revision' } });
    },
    publish: (s) => states.push(s),
    notify: (message) => notices.push(message),
  });
  await sync.refresh();
  sync.save('p1', { name: 'My first edit', document: serverRow.document });
  await vi.waitFor(() => expect(sent).toEqual([1]));
  sync.save('p1', { name: 'My next edit', document: serverRow.document });
  serverRow = row(3, 'Changed externally after my save');
  reply.resolve({ ok: true, data: { profiles: [serverRow] } });
  await vi.waitFor(() => expect(notices).toHaveLength(1));
  expect(sent).toEqual([1, 2]);
  expect(states.at(-1)?.profiles).toEqual([serverRow]);
});

test('retrying a failed list loads again rather than showing the old failure', async () => {
  const states: ProfileSyncState[] = [];
  const reply = deferred<ProfilesResult>();
  let calls = 0;
  const sync = createProfileSync({
    list: () => (++calls === 1 ? Promise.resolve({ ok: false }) : reply.promise),
    update: async () => ({ ok: false }),
    publish: (s) => states.push(s),
    notify: () => undefined,
  });
  await sync.refresh();
  expect(states.at(-1)).toEqual({ profiles: null, listFailed: true });
  const retry = sync.refresh();
  await vi.waitFor(() => expect(states.at(-1)).toEqual({ profiles: null, listFailed: false }));
  reply.resolve({ ok: true, data: { profiles: [row(1)] } });
  await retry;
  expect(states.at(-1)).toEqual({ profiles: [row(1)], listFailed: false });
});
