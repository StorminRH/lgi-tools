import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN = { user: { id: 'user-admin' }, session: {}, characterId: 90_000_001, isAdmin: true };
const BASE = '11111111-1111-4111-8111-111111111111';
const OLD = '22222222-2222-4222-8222-222222222222';

const getSessionMock = vi.fn();
const sameOriginMock = vi.fn();
const publishMock = vi.fn();
const dataBlockProblemsMock = vi.fn();
const codexTemplateMock = vi.fn();
const assetProblemsMock = vi.fn();

vi.mock('@/composition/auth', () => ({ auth: { api: { getSession: () => getSessionMock() } } }));
vi.mock('@/platform/auth/same-origin', () => ({ requireSameOrigin: () => sameOriginMock() }));
vi.mock('@/features/codex/publish', () => ({
  publishCodexRevision: (request: unknown) => publishMock(request),
}));
vi.mock('@/composition/codex-sources', () => ({
  codexDataBlockProblems: (blocks: unknown) => dataBlockProblemsMock(blocks),
}));
vi.mock('@/features/codex/assets', () => ({
  codexAssetProblems: (blocks: unknown, actor: unknown) => assetProblemsMock(blocks, actor),
}));
vi.mock('@/composition/codex-templates', () => ({
  codexTemplate: (subject: unknown) => codexTemplateMock(subject),
}));
vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

function post(form: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/admin/codex/revisions', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

const sectionEdit = {
  action: 'publish',
  kind: 'guides',
  key: 'rolling-a-c3',
  baseRevisionId: BASE,
  sectionId: 'ships',
  blocks: '[{"type":"paragraph","attrs":{"id":"p1"}}]',
  summary: '  Two Gilas ',
};

async function send(form: Record<string, string>) {
  const { POST } = await import('./route');
  const response = await POST(post(form));
  return { status: response.status, location: response.headers.get('location') };
}

describe('POST /api/admin/codex/revisions', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionMock.mockReset().mockResolvedValue(ADMIN);
    sameOriginMock.mockReset().mockReturnValue({ ok: true });
    publishMock.mockReset().mockResolvedValue({ status: 'published', revisionId: OLD });
    dataBlockProblemsMock.mockReset().mockResolvedValue([]);
    codexTemplateMock.mockReset().mockResolvedValue(null);
    assetProblemsMock.mockReset().mockResolvedValue([]);
  });

  it('sends a save with a removed screenshot back to its editor, checking assets as the admin', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const image = { type: 'image', attrs: { id: 'i1', assetId: BASE, alt: 'Gila', caption: '' } };
    assetProblemsMock.mockResolvedValue([`content.0 (image): asset "${BASE}" is removed`]);
    expect(await send({ ...sectionEdit, blocks: JSON.stringify([image]) })).toEqual({
      status: 303,
      location: 'http://localhost:3000/codex/guides/rolling-a-c3?edit=ships&notice=invalid',
    });
    expect(assetProblemsMock).toHaveBeenCalledWith([image], { userId: 'user-admin', isAdmin: true });
    expect(publishMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('refuses a caller without admin authority', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN, isAdmin: false });
    expect((await send(sectionEdit)).status).toBe(403);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('publishes a section edit and lands on that section', async () => {
    expect(await send(sectionEdit)).toEqual({
      status: 303,
      location: 'http://localhost:3000/codex/guides/rolling-a-c3#ships',
    });
    expect(publishMock).toHaveBeenCalledWith({
      subject: { kind: 'guides', key: 'rolling-a-c3' },
      title: null,
      baseRevisionId: BASE,
      edit: { kind: 'section', sectionId: 'ships', blocks: [{ type: 'paragraph', attrs: { id: 'p1' } }] },
      summary: 'Two Gilas',
      author: { userId: 'user-admin', characterId: 90_000_001 },
    });
  });

  it('sends a conflict or invalid edit back to its open editor', async () => {
    publishMock.mockResolvedValue({ status: 'conflict' });
    expect((await send(sectionEdit)).location).toBe(
      'http://localhost:3000/codex/guides/rolling-a-c3?edit=ships&notice=conflict',
    );

    publishMock.mockResolvedValue({ status: 'invalid', problems: ['bad'] });
    const created = { ...sectionEdit, sectionId: '', baseRevisionId: '', title: 'Rolling a C3' };
    expect((await send(created)).location).toBe(
      'http://localhost:3000/codex/guides/rolling-a-c3?edit=page&notice=invalid&title=Rolling+a+C3',
    );
    expect(publishMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseRevisionId: null, title: 'Rolling a C3', edit: expect.objectContaining({ kind: 'page' }) }),
    );
  });

  it('restores a revision and reports a stale restore on the history page', async () => {
    const restore = { action: 'restore', kind: 'guides', key: 'rolling-a-c3', baseRevisionId: BASE, revisionId: OLD };
    expect((await send(restore)).location).toBe('http://localhost:3000/codex/guides/rolling-a-c3');
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ edit: { kind: 'restore', revisionId: OLD }, summary: null, title: null }),
    );

    publishMock.mockResolvedValue({ status: 'conflict' });
    expect((await send(restore)).location).toBe(
      'http://localhost:3000/codex/guides/rolling-a-c3/history?notice=conflict',
    );
  });

  it('sends a save with an invalid data block back to its editor without publishing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const block = { type: 'dataBlock', attrs: { id: 'd', source: 'ships', key: '1', fields: [], layout: 'infobox' } };
    dataBlockProblemsMock.mockResolvedValue(['x']);
    expect(await send({ ...sectionEdit, blocks: JSON.stringify([block]) })).toEqual({
      status: 303,
      location: 'http://localhost:3000/codex/guides/rolling-a-c3?edit=ships&notice=invalid',
    });
    expect(dataBlockProblemsMock).toHaveBeenCalledWith([block]);
    expect(publishMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('publishes valid data block attributes verbatim and skips the check on restore', async () => {
    const block = {
      type: 'dataBlock',
      attrs: { id: 'd', source: 'wormholeType', key: 'C247', fields: ['totalMass'], layout: 'infobox' },
    };
    await send({ ...sectionEdit, blocks: JSON.stringify([block]) });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ edit: { kind: 'section', sectionId: 'ships', blocks: [block] } }),
    );

    dataBlockProblemsMock.mockClear();
    await send({ action: 'restore', kind: 'guides', key: 'rolling-a-c3', baseRevisionId: BASE, revisionId: OLD });
    expect(dataBlockProblemsMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed form before publishing', async () => {
    expect((await send({ ...sectionEdit, blocks: '{"not":"an array"}' })).status).toBe(400);
    expect((await send({ ...sectionEdit, key: 'Bad Slug' })).status).toBe(400);
    expect((await send({ ...sectionEdit, baseRevisionId: 'nope' })).status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('seeds the first publish on an entity page from its template, under the entity title', async () => {
    const doc = { type: 'doc', attrs: { schemaVersion: 1 }, content: [] };
    codexTemplateMock.mockResolvedValue({ title: 'C247', description: 'C247: …', doc });
    const first = { ...sectionEdit, kind: 'wormholes', key: 'c247', baseRevisionId: '', sectionId: 'overview', title: 'Spoofed' };

    expect(await send(first)).toEqual({ status: 303, location: 'http://localhost:3000/codex/wormholes/c247#overview' });
    expect(codexTemplateMock).toHaveBeenCalledWith({ kind: 'wormholes', key: 'c247' });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: { kind: 'wormholes', key: 'c247' }, title: 'C247', baseRevisionId: null, template: doc }),
    );
  });

  it('refuses a first publish on an entity page that has no template', async () => {
    const unpublished = { ...sectionEdit, kind: 'sites', key: '70', baseRevisionId: '', sectionId: 'overview' };
    expect(await send(unpublished)).toEqual({
      status: 303,
      location: 'http://localhost:3000/codex/sites/70?edit=overview&notice=invalid',
    });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('never looks up a template for a guide or a page that already has a head', async () => {
    await send({ ...sectionEdit, baseRevisionId: '', title: 'Rolling a C3' });
    await send({ ...sectionEdit, kind: 'wormholes', key: 'c247' });
    expect(codexTemplateMock).not.toHaveBeenCalled();
  });
});
