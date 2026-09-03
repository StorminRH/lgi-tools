import { describe, expect, it } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { originLeadOptions } from './origin-leads';

const STUB = {
  connectionId: 'stub-1' as Id<'mapConnections'>,
  fromSystemId: 31_000_001,
  toSystemId: null as number | null,
};

describe('originLeadOptions', () => {
  it('labels inbound systems, including occupied mouths, and stays empty once the stub is resolved', () => {
    const inbound = {
      connectionId: 'inbound' as Id<'mapConnections'>,
      fromSystemId: 31_000_002,
      toSystemId: 31_000_001,
      from: { signatureId: null },
      to: { signatureId: null },
      tombstone: { kind: 'live' as const },
    };
    expect(
      originLeadOptions(STUB, [inbound], (id) =>
        id === 31_000_002
          ? { id, name: 'J160650', security: -1, whClassId: 3 }
          : null,
      ),
    ).toEqual([{
      connectionId: 'inbound',
      systemId: 31_000_002,
      label: 'J160650 - C3',
    }]);
    expect(
      originLeadOptions({ ...STUB, toSystemId: 31_000_002 }, [inbound], null),
    ).toEqual([]);

    const occupied = {
      connectionId: 'inbound' as Id<'mapConnections'>,
      fromSystemId: 31_000_002,
      toSystemId: 31_000_001,
      from: { signatureId: null },
      to: { signatureId: 'ABC-123' },
      tombstone: { kind: 'live' as const },
    };
    expect(originLeadOptions(STUB, [occupied], null)).toEqual([{
      connectionId: 'inbound',
      systemId: 31_000_002,
      label: '31000002',
    }]);
  });
});
