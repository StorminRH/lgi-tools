import { describe, expect, it } from 'vitest';
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
  readonly identity?: ConnectionIdentity;
  readonly toSystemId?: number | null;
  readonly resolution?: ConnectionResolution;
  readonly endpoint?: ConnectionDoorSide;
}): SignatureWindowRow {
  const connection = {
    fromSystemId: SYSTEM,
    toSystemId: input.toSystemId ?? null,
    from: { ...blankDoor(), signatureId: 'ABC-123', typeCode: input.typeCode ?? null },
    to: { ...blankDoor(), typeCode: input.typeCode ?? null },
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

describe('diffSignatureUpdates', () => {
  it('flags a type the eliminator deduced and a destination the resolver filled', () => {
    const blank = wormholeRow({});
    expect(updatedAfter(blank, wormholeRow({ typeCode: 'H296', identity: { kind: 'typed', provenance: 'assumed' } })))
      .toBe(true);
    expect(updatedAfter(blank, wormholeRow({
      toSystemId: 30_000_142,
      resolution: { kind: 'destination', provenance: 'jump-verified' },
    }))).toBe(true);
  });

  it('ignores human edits, confirmations and unchanged facts', () => {
    const blank = wormholeRow({});
    expect(updatedAfter(blank, wormholeRow({ typeCode: 'H296', identity: { kind: 'typed', provenance: 'human' } })))
      .toBe(false);
    expect(updatedAfter(blank, wormholeRow({
      toSystemId: 30_000_142,
      resolution: { kind: 'destination', provenance: 'confirmed' },
    }))).toBe(false);
    const typed = wormholeRow({ typeCode: 'H296', identity: { kind: 'typed', provenance: 'assumed' } });
    expect(updatedAfter(typed, typed)).toBe(false);
  });

  it('never flags rows seen for the first time or rows without a connection', () => {
    const typed = wormholeRow({ typeCode: 'H296', identity: { kind: 'typed', provenance: 'assumed' } });
    expect(diffSignatureUpdates(new Map(), [typed]).updated.size).toBe(0);
    const site = { ...typed, connection: null, group: 'Combat Site' as const };
    const { snapshot } = diffSignatureUpdates(new Map(), [site]);
    expect(snapshot.size).toBe(0);
  });

  it('reads the far door and its origin system for a to-side row', () => {
    const before = wormholeRow({ endpoint: 'to', toSystemId: 30_000_142 });
    const after = wormholeRow({
      endpoint: 'to',
      toSystemId: 30_000_142,
      typeCode: 'K162',
      identity: { kind: 'typed', provenance: 'assumed' },
    });
    expect(updatedAfter(before, after)).toBe(true);
  });
});
