import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function buildRequest(body: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/industry/skill-levels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/industry/skill-levels', () => {
  beforeEach(() => {
    getCurrentUserIdMock.mockReset();
    getSkillLevelsForCharacterOnViewMock.mockReset();
    measureOwnedDataReadMock.mockReset();
    measureOwnedDataReadMock.mockImplementation((input: { read: () => Promise<unknown> }) => input.read());
  });

  it('returns 400 invalid_json for a non-JSON body', async () => {
    const res = await POST(buildRequest('not json'));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'invalid_json',
    });
  });

  it('returns 400 invalid_body for a malformed character id', async () => {
    const res = await POST(buildRequest(JSON.stringify({ characterId: -1 })));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'invalid_body',
    });
    expect(getSkillLevelsForCharacterOnViewMock).not.toHaveBeenCalled();
  });

  it('fails open to levels:null (200) for an anonymous caller', async () => {
    getCurrentUserIdMock.mockResolvedValue(null);
    const res = await POST(buildRequest(JSON.stringify({ characterId: 100 })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ levels: null });
    expect(getSkillLevelsForCharacterOnViewMock).not.toHaveBeenCalled();
  });

  it("fails open to levels:null when the character is not the caller's (the composition's ownership arm)", async () => {
    getCurrentUserIdMock.mockResolvedValue('u1');
    getSkillLevelsForCharacterOnViewMock.mockResolvedValue(null);
    const res = await POST(buildRequest(JSON.stringify({ characterId: 999 })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ levels: null });
    expect(getSkillLevelsForCharacterOnViewMock).toHaveBeenCalledWith('u1', 999);
  });

  it('returns the levels map for an owned, synced character', async () => {
    getCurrentUserIdMock.mockResolvedValue('u1');
    getSkillLevelsForCharacterOnViewMock.mockResolvedValue({ '3380': 5, '3388': 4 });
    const res = await POST(buildRequest(JSON.stringify({ characterId: 100 })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ levels: { '3380': 5, '3388': 4 } });
  });
});
