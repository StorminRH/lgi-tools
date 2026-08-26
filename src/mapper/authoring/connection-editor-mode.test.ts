import { describe, expect, it } from 'vitest';
import { blankDoor } from '@/data/maps/connection-hallway';
import { connectionEditorFixture } from '../chain/__tests__/connection-editor-fixture';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import { connectionEditorMode } from './connection-editor-mode';

const NOW = 10_000;
const UNDO_MS = 24 * 60 * 60 * 1000;

function detail(
  partial: Partial<ConnectionEditorDetail> = {},
): ConnectionEditorDetail {
  return connectionEditorFixture({
    fromSystemId: 1,
    toSystemId: 2,
    ...partial,
  });
}

describe('connectionEditorMode', () => {
  it('returns edit or restore for live and dying rows, and nothing for missing or skeleton rows', () => {
    expect(connectionEditorMode(detail(), NOW)).toEqual({
      connection: detail(),
      mode: 'edit',
    });
    const dying = detail({
      tombstone: { kind: 'removed', deletedAt: NOW - 1, purgeAfter: NOW + UNDO_MS },
    });
    expect(connectionEditorMode(dying, NOW)).toEqual({
      connection: dying,
      mode: 'restore',
    });

    expect(connectionEditorMode(null, NOW)).toBeNull();
    expect(connectionEditorMode(undefined, NOW)).toBeNull();
    const skeleton = detail({
      tombstone: { kind: 'removed', deletedAt: NOW - 1, purgeAfter: null },
    });
    expect(connectionEditorMode(skeleton, NOW)).toBeNull();
  });

  it('opens for an unresolved scanned hole, which has no destination yet', () => {
    const stub = detail({
      toSystemId: null,
      from: { ...blankDoor(), signatureId: 'ABC-123' },
    });
    expect(connectionEditorMode(stub, NOW)?.mode).toBe('edit');
  });
});
