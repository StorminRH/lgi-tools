import { describe, expect, it } from 'vitest';
import { blankDoor, blankHallway } from '@/data/maps/connection-hallway';
import { hiddenUnidentifiedSignatures } from '@/data/maps/stub-accounting';
import type { Doc, Id } from '@/data/convex/data-model';
import { unresolvedHolesFromRows } from './connection-detail';
import { planStubNodes } from './nodes';
import {
  accountedStubLayoutRows,
  stubLayoutRows,
} from './stub-layout';

const JITA = 30_000_142;
const C2 = 31_000_001;

function connectionDoc(
  partial: Omit<Partial<Doc<'mapConnections'>>, '_id'> & { readonly _id: string },
): Doc<'mapConnections'> {
  const hallway = blankHallway({
    mapId: partial.mapId ?? 'map-a',
    fromSystemId: partial.fromSystemId ?? C2,
    toSystemId: partial.toSystemId === undefined ? null : partial.toSystemId,
  });
  return {
    ...hallway,
    ...partial,
    _id: partial._id as Id<'mapConnections'>,
    _creationTime: partial._creationTime ?? 1,
  };
}

function classOf(code: string) {
  return code === 'C247'
    ? { className: 'C3', whClassId: 3 }
    : null;
}

describe('stub layout from unresolved rows', () => {
  it('projects a static placeholder row to a C247 ghost', () => {
    const summaries = unresolvedHolesFromRows([
      connectionDoc({
        _id: 'ph-C247',
        fromSystemId: C2,
        from: { ...blankDoor(), typeCode: 'C247' },
        staticCode: 'C247',
        identity: { kind: 'typed', provenance: 'assumed' },
      }),
    ]);
    const scanned = stubLayoutRows(summaries, [{ systemId: C2 }], []);
    expect(scanned).toEqual([
      expect.objectContaining({
        connectionId: 'ph-C247',
        staticCode: 'C247',
        layoutSystemId: -1,
      }),
    ]);
    const planned = planStubNodes({
      systemIds: [C2],
      rows: scanned,
      connections: [],
      rootSystemId: C2,
      classOf,
    });
    expect(planned).toEqual([
      {
        staticId: 'ph-C247',
        fromSystemId: C2,
        code: 'C247',
        className: 'C3',
        whClassId: 3,
      },
    ]);
    const layout = accountedStubLayoutRows(planned, scanned);
    expect(layout).toEqual([
      expect.objectContaining({
        staticId: 'ph-C247',
        layoutSystemId: -1,
      }),
    ]);
    expect(planned.map((stub) =>
      'staticId' in stub ? `static-stub:${stub.staticId}` : stub.connectionId,
    )).toEqual(['static-stub:ph-C247']);
  });

  it('projects a signature row to a scanned stub', () => {
    const summaries = unresolvedHolesFromRows([
      connectionDoc({
        _id: 'scan-1',
        fromSystemId: C2,
        from: { ...blankDoor(), signatureId: 'ABC-123' },
      }),
    ]);
    const scanned = stubLayoutRows(summaries, [{ systemId: C2 }], []);
    const planned = planStubNodes({
      systemIds: [C2],
      rows: scanned,
      connections: [],
      rootSystemId: C2,
      classOf,
    });
    expect(planned).toEqual([
      {
        connectionId: 'scan-1',
        fromSystemId: C2,
        signatureId: 'ABC-123',
        wormholeTypeCode: null,
        destinationHint: null,
        whClassId: null,
      },
    ]);
    expect(accountedStubLayoutRows(planned, scanned)).toEqual([
      expect.objectContaining({
        connectionId: 'scan-1',
        layoutSystemId: -1,
      }),
    ]);
  });

  it('draws no ghost on a k-space system with no placeholder rows', () => {
    const summaries = unresolvedHolesFromRows([
      connectionDoc({
        _id: 'unscanned',
        fromSystemId: JITA,
      }),
    ]);
    const scanned = stubLayoutRows(summaries, [{ systemId: JITA }], []);
    expect(scanned).toEqual([]);
    expect(planStubNodes({
      systemIds: [JITA],
      rows: scanned,
      connections: [],
      rootSystemId: JITA,
      classOf,
    })).toEqual([]);
  });

  it('hides unidentified signatures the same way as stub accounting', () => {
    const sigIds = ['SIG-1', 'SIG-2', 'SIG-3', 'SIG-4'] as const;
    const summaries = unresolvedHolesFromRows([
      connectionDoc({
        _id: 'ph-C247',
        fromSystemId: C2,
        from: { ...blankDoor(), typeCode: 'C247' },
        staticCode: 'C247',
      }),
      ...sigIds.map((id, index) => connectionDoc({
        _id: id,
        fromSystemId: C2,
        from: { ...blankDoor(), signatureId: `AAA-${index + 1}` },
      })),
    ]);
    const scanned = stubLayoutRows(summaries, [{ systemId: C2 }], []);
    const planned = planStubNodes({
      systemIds: [C2],
      rows: scanned,
      connections: [],
      rootSystemId: C2,
      classOf,
    });
    const hidden = hiddenUnidentifiedSignatures({
      unclaimedStatics: 1,
      signatures: sigIds.map((id) => ({ id, wormholeTypeCode: null })),
      connections: [],
      isRoot: true,
    });
    expect(planned.filter((stub) => 'connectionId' in stub).map((stub) =>
      'connectionId' in stub ? stub.connectionId : '')).toEqual(
      sigIds.filter((id) => !hidden.has(id)),
    );
    expect(planned.filter((stub) => 'staticId' in stub)).toHaveLength(1);
  });
});
