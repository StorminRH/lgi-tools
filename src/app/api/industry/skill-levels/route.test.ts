import { expect, test, vi } from 'vitest';
import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';

const getCurrentUserIdMock = vi.fn();
const getSkillLevelsForCharacterOnViewMock = vi.fn();
const measureOwnedDataReadMock = vi.fn();

vi.mock('@/composition/session', () => ({
  getCurrentUserId: () => getCurrentUserIdMock(),
}));

vi.mock('@/composition/sync/skills-sync', () => ({
  getSkillLevelsForCharacterOnView: (userId: string, characterId: number) =>
    getSkillLevelsForCharacterOnViewMock(userId, characterId),
}));

vi.mock('@/app/api/owned-data-telemetry', () => ({
  measureOwnedDataRead: (input: { read: () => Promise<unknown> }) =>
    measureOwnedDataReadMock(input),
}));

import { POST } from './route';

const ROUTE = '/api/industry/skill-levels';

function resetMocks(): void {
  getCurrentUserIdMock.mockReset();
  getSkillLevelsForCharacterOnViewMock.mockReset();
  measureOwnedDataReadMock
    .mockReset()
    .mockImplementation((input: { read: () => Promise<unknown> }) => input.read());
}

test('rejects a non-JSON body and a malformed character id before reading', async () => {
  resetMocks();
  for (const [body, code] of [
    ['not json', 'invalid_json'],
    [{ characterId: -1 }, 'invalid_body'],
  ] as const) {
    const res = await POST(postJson(ROUTE, body));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({ code });
  }
  expect(getSkillLevelsForCharacterOnViewMock).not.toHaveBeenCalled();
});

test('fails open to levels:null for an anonymous caller or a foreign character, and returns an owned character\'s levels', async () => {
  resetMocks();
  getCurrentUserIdMock.mockResolvedValue(null);
  const anonymous = await POST(postJson(ROUTE, { characterId: 100 }));
  expect(anonymous.status).toBe(200);
  expect(await anonymous.json()).toEqual({ levels: null });
  expect(getSkillLevelsForCharacterOnViewMock).not.toHaveBeenCalled();

  resetMocks();
  getCurrentUserIdMock.mockResolvedValue('u1');
  getSkillLevelsForCharacterOnViewMock.mockResolvedValue(null);
  const foreign = await POST(postJson(ROUTE, { characterId: 999 }));
  expect(foreign.status).toBe(200);
  expect(await foreign.json()).toEqual({ levels: null });
  expect(getSkillLevelsForCharacterOnViewMock).toHaveBeenCalledWith('u1', 999);

  resetMocks();
  getCurrentUserIdMock.mockResolvedValue('u1');
  getSkillLevelsForCharacterOnViewMock.mockResolvedValue({ '3380': 5, '3388': 4 });
  const owned = await POST(postJson(ROUTE, { characterId: 100 }));
  expect(owned.status).toBe(200);
  expect(await owned.json()).toEqual({ levels: { '3380': 5, '3388': 4 } });
  expect(getSkillLevelsForCharacterOnViewMock).toHaveBeenCalledWith('u1', 100);
});
