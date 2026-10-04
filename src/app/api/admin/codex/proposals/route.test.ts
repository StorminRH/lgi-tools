import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN = { user: { id: 'user-admin' }, session: {}, characterId: 90_000_001, isAdmin: true };
const PROPOSAL = '33333333-3333-4333-8333-333333333333';

const getSessionMock = vi.fn();
const sameOriginMock = vi.fn();
const approveMock = vi.fn();
const decideMock = vi.fn();

vi.mock('@/composition/auth', () => ({ auth: { api: { getSession: () => getSessionMock() } } }));
vi.mock('@/platform/auth/same-origin', () => ({ requireSameOrigin: () => sameOriginMock() }));
vi.mock('@/features/codex/proposals', () => ({
  approveCodexProposal: (...args: unknown[]) => approveMock(...args),
  decideCodexProposal: (...args: unknown[]) => decideMock(...args),
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

describe('POST /api/admin/codex/proposals', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset().mockResolvedValue(ADMIN);
    sameOriginMock.mockReset().mockReturnValue({ ok: true });
    approveMock.mockReset().mockResolvedValue('approved');
    decideMock.mockReset().mockImplementation(async (_id: string, _action: string, { note }: { note?: string }) =>
      note?.trim() ? 'denied' : 'note-required',
    );
  });

  it('refuses a caller without admin authority', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN, isAdmin: false });
    expect((await send({ proposalId: PROPOSAL, action: 'approve' })).status).toBe(403);
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('approves and lands back on the queue with the outcome', async () => {
    expect(await send({ proposalId: PROPOSAL, action: 'approve', note: '' })).toEqual({
      status: 303,
      location: queue('approved'),
    });
    expect(approveMock).toHaveBeenCalledWith(PROPOSAL, expect.any(Function));

    approveMock.mockResolvedValue('needs-merge');
    expect(await send({ proposalId: PROPOSAL, action: 'approve' })).toEqual({ status: 303, location: queue('needs-merge') });
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
