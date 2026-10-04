import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PILOT = { user: { id: 'u1' }, session: {}, characterId: 9001, isAdmin: false };
const BASE = '11111111-1111-4111-8111-111111111111';
const PROPOSAL = '33333333-3333-4333-8333-333333333333';

const getSessionMock = vi.fn();
const sameOriginMock = vi.fn();
const submitMock = vi.fn();
const decideMock = vi.fn();
const dataBlockProblemsMock = vi.fn();

vi.mock('@/composition/auth', () => ({ auth: { api: { getSession: () => getSessionMock() } } }));
vi.mock('@/platform/auth/same-origin', () => ({ requireSameOrigin: () => sameOriginMock() }));
vi.mock('@/features/codex/proposals', () => ({
  submitCodexProposal: (input: unknown, seed: unknown) => submitMock(input, seed),
  decideCodexProposal: (...args: unknown[]) => decideMock(...args),
}));
vi.mock('@/composition/codex-sources', () => ({
  codexDataBlockProblems: (blocks: unknown) => dataBlockProblemsMock(blocks),
}));
vi.mock('@/composition/codex-templates', () => ({ codexTemplate: async () => null }));
vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const suggestion = {
  action: 'submit',
  proposalId: PROPOSAL,
  kind: 'guides',
  key: 'rolling-a-c3',
  baseRevisionId: BASE,
  sectionId: 'strategy',
  blocks: '[{"type":"paragraph","attrs":{"id":"s1"}}]',
  summary: ' Fix range ',
  license: 'accepted',
};

async function send(form: Record<string, string>) {
  const { POST } = await import('./route');
  const response = await POST(
    new NextRequest('http://localhost:3000/api/codex/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    }),
  );
  return { status: response.status, location: response.headers.get('location') };
}

const page = (notice: string) => `http://localhost:3000/codex/guides/rolling-a-c3?edit=strategy&notice=${notice}`;

describe('POST /api/codex/proposals', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset().mockResolvedValue(PILOT);
    sameOriginMock.mockReset().mockReturnValue({ ok: true });
    submitMock.mockReset().mockResolvedValue({ status: 'submitted', id: PROPOSAL });
    decideMock.mockReset().mockResolvedValue('withdrawn');
    dataBlockProblemsMock.mockReset().mockResolvedValue([]);
  });

  it('needs a signed-in pilot with a character', async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await send(suggestion)).status).toBe(401);
    getSessionMock.mockResolvedValue({ ...PILOT, characterId: null });
    expect((await send(suggestion)).status).toBe(403);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('sends the editor back with a notice when the license or summary is missing', async () => {
    expect(await send({ ...suggestion, license: '' })).toEqual({ status: 303, location: page('license') });
    expect(await send({ ...suggestion, summary: '   ' })).toEqual({ status: 303, location: page('summary') });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('files a valid suggestion under the signed-in character', async () => {
    expect(await send(suggestion)).toEqual({
      status: 303,
      location: 'http://localhost:3000/codex/mine?notice=submitted',
    });
    expect(submitMock).toHaveBeenCalledWith(
      {
        proposalId: PROPOSAL,
        subject: { kind: 'guides', key: 'rolling-a-c3' },
        sectionId: 'strategy',
        blocks: [{ type: 'paragraph', attrs: { id: 's1' } }],
        summary: 'Fix range',
        baseRevisionId: BASE,
        submitter: { userId: 'u1', characterId: 9001 },
      },
      { ok: true, template: null },
    );

    submitMock.mockResolvedValue({ status: 'daily-limit' });
    expect(await send(suggestion)).toEqual({ status: 303, location: page('daily-limit') });
  });

  it('refuses invalid data blocks before filing', async () => {
    dataBlockProblemsMock.mockResolvedValue(['bad source']);
    expect(await send(suggestion)).toEqual({ status: 303, location: page('invalid') });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('withdraws only the caller’s own suggestion', async () => {
    expect(await send({ action: 'withdraw', proposalId: PROPOSAL })).toEqual({
      status: 303,
      location: 'http://localhost:3000/codex/mine?notice=withdrawn',
    });
    expect(decideMock).toHaveBeenCalledWith(PROPOSAL, 'withdraw', { userId: 'u1' });
  });
});
