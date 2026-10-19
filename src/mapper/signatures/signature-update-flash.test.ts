import { expect, test } from 'vitest';
import {
  blankDoor,
  type ConnectionDoorSide,
  type ConnectionIdentity,
  type ConnectionResolution,
} from '@/data/maps/connection-hallway';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import { signatureIdentityKey, type SignatureWindowRow } from './signature-model';
import { diffSignatureUpdates } from './signature-update-flash';

const SYSTEM = 31_000_001;

function wormholeRow(input: {
  readonly typeCode?: string | null;
  readonly farTypeCode?: string | null;
  readonly identity?: ConnectionIdentity;
  readonly toSystemId?: number | null;
  readonly resolution?: ConnectionResolution;
  readonly endpoint?: ConnectionDoorSide;
}): SignatureWindowRow {
  const connection = {
    fromSystemId: SYSTEM,
    toSystemId: input.toSystemId ?? null,
    from: { ...blankDoor(), signatureId: 'ABC-123', typeCode: input.typeCode ?? null },
    to: { ...blankDoor(), typeCode: input.farTypeCode === undefined ? (input.typeCode ?? null) : input.farTypeCode },
    identity: input.identity ?? { kind: 'unknown' },
    resolution: input.resolution ?? { kind: 'open' },
  } as unknown as ConnectionEditorDetail;
  return {
    key: 'connection:c1',
    systemId: SYSTEM,
    signatureId: 'ABC-123',
    kind: 'signature',
    group: 'Wormhole',
    name: input.typeCode ?? null,
    signalPct: 100,
    firstSeenAt: 1,
    connection,
    endpoint: input.endpoint,
    className: null,
  };
}

function updatedAfter(before: SignatureWindowRow, after: SignatureWindowRow): boolean {
  const { snapshot } = diffSignatureUpdates(new Map(), [before]);
  return diffSignatureUpdates(snapshot, [after]).updated.has(signatureIdentityKey(after));
}

test('flags only the type and destination automation filled in', () => {
  const blank = wormholeRow({});
  expect(updatedAfter(blank, wormholeRow({ typeCode: 'H296', identity: { kind: 'typed', provenance: 'assumed' } })))
    .toBe(true);
  expect(updatedAfter(blank, wormholeRow({
    toSystemId: 30_000_142,
    resolution: { kind: 'destination', provenance: 'jump-verified' },
  }))).toBe(true);
  expect(updatedAfter(blank, wormholeRow({ typeCode: 'H296', identity: { kind: 'typed', provenance: 'human' } })))
    .toBe(false);
  expect(updatedAfter(blank, wormholeRow({
    toSystemId: 30_000_142,
    resolution: { kind: 'destination', provenance: 'confirmed' },
  }))).toBe(false);
  const typed = wormholeRow({ typeCode: 'H296', identity: { kind: 'typed', provenance: 'assumed' } });
  expect(updatedAfter(typed, typed)).toBe(false);
});

test('never flags rows seen for the first time or rows without a connection', () => {
  const typed = wormholeRow({ typeCode: 'H296', identity: { kind: 'typed', provenance: 'assumed' } });
  expect(diffSignatureUpdates(new Map(), [typed]).updated.size).toBe(0);
  const site = { ...typed, connection: null, group: 'Combat Site' as const };
  const { snapshot } = diffSignatureUpdates(new Map(), [site]);
  expect(snapshot.size).toBe(0);
});

test('reads the far door for a to-side row', () => {
  const before = wormholeRow({ endpoint: 'to', toSystemId: 30_000_142 });
  const assumed = { kind: 'typed', provenance: 'assumed' } as const;
  expect(updatedAfter(before, wormholeRow({
    endpoint: 'to',
    toSystemId: 30_000_142,
    farTypeCode: 'K162',
    identity: assumed,
  }))).toBe(true);
  expect(updatedAfter(before, wormholeRow({
    endpoint: 'to',
    toSystemId: 30_000_142,
    typeCode: 'H296',
    farTypeCode: null,
    identity: assumed,
  }))).toBe(false);
});
