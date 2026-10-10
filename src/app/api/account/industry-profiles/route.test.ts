import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  checkUserId: vi.fn(),
  listLinkedCharacters: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  getDocument: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  logUsageEvent: vi.fn(),
}));

vi.mock('@/composition/session', () => ({ getCurrentUserId: h.getCurrentUserId }));
vi.mock('@/composition/route-guards', () => ({ checkUserId: h.checkUserId }));
vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: h.listLinkedCharacters,
}));
vi.mock('@/features/industry-planner/profiles/queries', () => ({
  listIndustryProfiles: h.list,
  createIndustryProfile: h.create,
  getIndustryProfileDocument: h.getDocument,
  updateIndustryProfile: h.update,
  deleteIndustryProfile: h.remove,
}));
vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: h.logUsageEvent }));

import { emptyProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import { postJson } from '@/lib/__tests__/route-requests';
import { POST as DELETE_POST } from './delete/route';
import { POST as DUPLICATE_POST } from './duplicate/route';
import { GET, POST } from './route';
import { POST as UPDATE_POST } from './update/route';

const LINKED = { characterId: 111, name: 'Linked' };
const UNLINKED = { characterId: 999, name: 'Gone' };

const ROUTE = '/api/account/industry-profiles';
const SAME_ORIGIN = { origin: 'http://localhost:3000' };

async function problemCode(res: Response): Promise<string | undefined> {
  return ((await res.json()) as { code?: string }).code;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.checkUserId.mockResolvedValue({ ok: true, userId: 'user-1' });
  h.listLinkedCharacters.mockResolvedValue([{ characterId: LINKED.characterId }]);
  h.list.mockResolvedValue([]);
  h.create.mockResolvedValue(true);
  h.logUsageEvent.mockResolvedValue(undefined);
});

test('reading profiles is empty when signed out and the account list when signed in', async () => {
  h.getCurrentUserId.mockResolvedValueOnce(null);
  expect(await (await GET()).json()).toEqual({ profiles: [] });
  expect(h.list).not.toHaveBeenCalled();

  h.getCurrentUserId.mockResolvedValueOnce('user-1');
  await GET();
  expect(h.list).toHaveBeenCalledWith('user-1');
});

test('creating a profile only accepts linked members and respects the profile cap', async () => {
  const withStranger = { name: 'Caps', document: emptyProfileDocument([LINKED, UNLINKED]) };
  const refused = await POST(postJson(ROUTE, withStranger, SAME_ORIGIN));
  expect(refused.status).toBe(400);
  expect(await problemCode(refused)).toBe('not_linked');
  expect(h.create).not.toHaveBeenCalled();

  h.create.mockResolvedValueOnce(false);
  const full = await POST(
    postJson(ROUTE, { name: 'Caps', document: emptyProfileDocument([LINKED]) }, SAME_ORIGIN),
  );
  expect(full.status).toBe(409);
  expect(await problemCode(full)).toBe('profile_limit');

  const created = await POST(
    postJson(ROUTE, { name: '  Caps  ', document: emptyProfileDocument([LINKED]) }, SAME_ORIGIN),
  );
  expect(created.status).toBe(201);
  const body = (await created.json()) as { id: string };
  expect(h.create).toHaveBeenCalledWith('user-1', {
    id: body.id,
    name: 'Caps',
    document: emptyProfileDocument([LINKED]),
  });
});

test('duplicating copies the stored document under a new id, or says the source is gone', async () => {
  h.getDocument.mockResolvedValueOnce(null);
  const missing = await DUPLICATE_POST(
    postJson(`${ROUTE}/duplicate`, { id: 'p1', name: 'Caps copy' }, SAME_ORIGIN),
  );
  expect(missing.status).toBe(404);
  expect(await problemCode(missing)).toBe('profile_missing');

  // The copy keeps a member that has since been unlinked, so it stays explainable.
  const stored = emptyProfileDocument([LINKED, UNLINKED]);
  h.getDocument.mockResolvedValueOnce(stored);
  h.create.mockResolvedValueOnce(false);
  const full = await DUPLICATE_POST(
    postJson(`${ROUTE}/duplicate`, { id: 'p1', name: 'Caps copy' }, SAME_ORIGIN),
  );
  expect(full.status).toBe(409);
  expect(await problemCode(full)).toBe('profile_limit');

  h.getDocument.mockResolvedValueOnce(stored);
  const copied = await DUPLICATE_POST(
    postJson(`${ROUTE}/duplicate`, { id: 'p1', name: 'Caps copy' }, SAME_ORIGIN),
  );
  expect(copied.status).toBe(201);
  const { id } = (await copied.json()) as { id: string };
  expect(id).not.toBe('p1');
  expect(h.create).toHaveBeenCalledWith('user-1', { id, name: 'Caps copy', document: stored });
});

test('updates keep existing unlinked members, refuse new ones and refuse stale revisions', async () => {
  const stored = emptyProfileDocument([LINKED, UNLINKED]);
  const edit = (document = stored, expectedRevision = 3) =>
    postJson(
      `${ROUTE}/update`,
      { id: 'p1', expectedRevision, name: 'Caps', document },
      SAME_ORIGIN,
    );

  h.getDocument.mockResolvedValueOnce(null);
  expect((await UPDATE_POST(edit())).status).toBe(404);

  h.getDocument.mockResolvedValueOnce(stored);
  const addsStranger = emptyProfileDocument([LINKED, UNLINKED, { characterId: 555, name: 'Stranger' }]);
  const refused = await UPDATE_POST(edit(addsStranger));
  expect(await problemCode(refused)).toBe('not_linked');
  expect(h.update).not.toHaveBeenCalled();

  h.getDocument.mockResolvedValueOnce(stored);
  h.update.mockResolvedValueOnce(false);
  const stale = await UPDATE_POST(edit(stored, 2));
  expect(stale.status).toBe(409);
  expect(await problemCode(stale)).toBe('stale_revision');

  h.getDocument.mockResolvedValueOnce(stored);
  h.update.mockResolvedValueOnce(true);
  expect((await UPDATE_POST(edit())).status).toBe(200);
  expect(h.update).toHaveBeenLastCalledWith('user-1', {
    id: 'p1',
    expectedRevision: 3,
    name: 'Caps',
    document: stored,
  });

  const deleted = await DELETE_POST(postJson(`${ROUTE}/delete`, { id: 'p1' }, SAME_ORIGIN));
  expect(deleted.status).toBe(200);
  expect(h.remove).toHaveBeenCalledWith('user-1', 'p1');
});
