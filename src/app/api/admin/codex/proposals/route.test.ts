import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN = { user: { id: 'user-admin' }, session: {}, characterId: 90_000_001, isAdmin: true };
const PROPOSAL = '33333333-3333-4333-8333-333333333333';
const HEAD = '44444444-4444-4444-8444-444444444444';

const getSessionMock = vi.fn();
const sameOriginMock = vi.fn();
const approveMock = vi.fn();
const decideMock = vi.fn();
const dataBlockProblemsMock = vi.fn();

vi.mock('@/composition/auth', () => ({ auth: { api: { getSession: () => getSessionMock() } } }));
vi.mock('@/platform/auth/same-origin', () => ({ requireSameOrigin: () => sameOriginMock() }));
vi.mock('@/features/codex/proposals', () => ({
  approveCodexProposal: (...args: unknown[]) => approveMock(...args),
  decideCodexProposal: (...args: unknown[]) => decideMock(...args),
}));
vi.mock('@/composition/codex-sources', () => ({
  codexDataBlockProblems: (...args: unknown[]) => dataBlockProblemsMock(...args),
}));
vi.mock('@/composition/codex-templates', () => ({ codexTemplate: async () => null }));
vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

async function send(form: Record<string, string>) {
  const { POST } = await import('./route');
  const response = await POST(
    new NextRequest('http://localhost:3000/api/admin/codex/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    }),
  );
  return { status: response.status, location: response.headers.get('location') };
}

const queue = (outcome: string) => `http://localhost:3000/admin/codex?outcome=${outcome}`;
const review = (notice: string) => `http://localhost:3000/admin/codex/${PROPOSAL}?notice=${notice}`;
const approve = { proposalId: PROPOSAL, action: 'approve', headRevisionId: HEAD };

describe('POST /api/admin/codex/proposals', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset().mockResolvedValue(ADMIN);
    sameOriginMock.mockReset().mockReturnValue({ ok: true });
    approveMock.mockReset().mockResolvedValue('approved');
    dataBlockProblemsMock.mockReset().mockResolvedValue([]);
    decideMock.mockReset().mockImplementation(async (_id: string, _action: string, { note }: { note?: string }) =>
      note?.trim() ? 'denied' : 'note-required',
    );
  });

  it('refuses a caller without admin authority', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN, isAdmin: false });
    expect((await send(approve)).status).toBe(403);
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('approves with the head it reviewed and the per-block choices, then lands on the queue', async () => {
    const edited = '[{"type":"paragraph","attrs":{"id":"s2"},"content":[]}]';
    expect(await send({ ...approve, 'choice.s1': 'proposal', 'choice.s2': 'edit', 'edit.s2': edited })).toEqual({
      status: 303,
      location: queue('approved'),
    });
    expect(approveMock).toHaveBeenCalledWith(PROPOSAL, expect.any(Function), {
      headRevisionId: HEAD,
      choices: { s1: 'proposal', s2: [{ type: 'paragraph', attrs: { id: 's2' }, content: [] }] },
    });
    expect(dataBlockProblemsMock).toHaveBeenCalledWith([{ type: 'paragraph', attrs: { id: 's2' }, content: [] }]);

    await send({ ...approve, headRevisionId: '' });
    expect(approveMock).toHaveBeenLastCalledWith(PROPOSAL, expect.any(Function), { headRevisionId: null, choices: {} });
  });

  it('sends a conflict or a moved page back to the review view', async () => {
    approveMock.mockResolvedValue('conflict');
    expect(await send(approve)).toEqual({ status: 303, location: review('conflict') });
    approveMock.mockResolvedValue('moved');
    expect(await send(approve)).toEqual({ status: 303, location: review('moved') });
  });

  it('refuses a hand edit that is not a block list or fails the data checks', async () => {
    expect((await send({ ...approve, 'choice.s1': 'edit', 'edit.s1': 'nope' })).status).toBe(400);
    expect(approveMock).not.toHaveBeenCalled();

    dataBlockProblemsMock.mockResolvedValue(['content.0 (dataBlock): unknown source']);
    expect(await send({ ...approve, 'choice.s1': 'edit', 'edit.s1': '[{"type":"dataBlock"}]' })).toEqual({
      status: 303,
      location: review('invalid'),
    });
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('lands on the queue page the admin came from', async () => {
    expect(await send({ ...approve, page: '2' })).toEqual({ status: 303, location: `${queue('approved')}&page=2` });
    approveMock.mockResolvedValue('conflict');
    expect(await send({ ...approve, page: '2' })).toEqual({ status: 303, location: `${review('conflict')}&page=2` });
    expect(await send({ proposalId: PROPOSAL, action: 'deny', note: 'x', page: '2' })).toEqual({
      status: 303,
      location: `${queue('denied')}&page=2`,
    });
    expect((await send({ ...approve, page: 'two' })).status).toBe(400);
  });

  it('denies only with a note', async () => {
    expect(await send({ proposalId: PROPOSAL, action: 'deny', note: '' })).toEqual({
      status: 303,
      location: queue('note-required'),
    });
    expect(await send({ proposalId: PROPOSAL, action: 'deny', note: 'x' })).toEqual({ status: 303, location: queue('denied') });
    expect(decideMock).toHaveBeenLastCalledWith(PROPOSAL, 'deny', { note: 'x' });
  });
});
