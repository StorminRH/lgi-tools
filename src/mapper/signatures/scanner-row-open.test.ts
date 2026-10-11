import { expect, test } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { blankDoor } from '@/data/maps/connection-hallway';
import { siteSearchEntry } from '@/features/wormhole-sites/__tests__/site-fixtures';
import { createSiteNameLookups } from '@/features/wormhole-sites/site-name-lookup';
import { connectionEditorFixture } from '../chain/__tests__/connection-editor-fixture';
import { scannerRowOpenTarget } from './scanner-row-open';
import type { SignatureWindowRow } from './signature-model';

function row(
  over: Partial<SignatureWindowRow> &
    Pick<SignatureWindowRow, 'signatureId' | 'group' | 'name'>,
): SignatureWindowRow {
  return {
    key: over.signatureId,
    systemId: 1,
    kind: 'signature',
    signalPct: 100,
    firstSeenAt: 0,
    connection: null,
    className: null,
    ...over,
  };
}

const WH: SignatureWindowRow = row({
  signatureId: 'WHL-001',
  group: 'Wormhole',
  name: 'B274',
  connection: connectionEditorFixture({
    connectionId: 'connection-1' as Id<'mapConnections'>,
    _creationTime: 2_000,
    fromSystemId: 1,
    toSystemId: null,
    from: { ...blankDoor(), typeCode: 'B274', signatureId: 'WHL-001', signalPct: 100 },
    to: { ...blankDoor(), typeCode: 'K162' },
    identity: { kind: 'typed', provenance: 'human' },
    shipSize: 'M',
    firstSeenAt: 0,
  }),
});

test('scanner row open targets gate catalogue sites and wormhole edits', () => {
  const { siteIdForName } = createSiteNameLookups([
    siteSearchEntry({ id: 49, name: 'Barren Perimeter Reservoir' }),
    siteSearchEntry({ id: 17, name: 'Forgotten Frontier Quarantine Outpost' }),
  ]);

  const gas = row({
    signatureId: 'GAS-001',
    group: 'Gas Site',
    name: 'Barren Perimeter Reservoir',
  });
  const anomaly = row({
    signatureId: 'ANO-001',
    kind: 'anomaly',
    group: 'Combat Site',
    name: 'Forgotten Frontier Quarantine Outpost',
  });
  const unknownName = row({
    signatureId: 'CBT-001',
    group: 'Combat Site',
    name: 'Sansha Hideout',
  });
  const unnamed = row({
    signatureId: 'ABC-123',
    group: null,
    name: null,
  });
  const partial = row({
    signatureId: 'ANO-456',
    kind: 'anomaly',
    group: 'Combat Site',
    name: 'Forgotten Frontier',
  });

  expect(scannerRowOpenTarget(WH, true, siteIdForName)).toEqual({
    kind: 'connection',
    connectionId: 'connection-1',
    signatureId: 'WHL-001',
  });
  expect(scannerRowOpenTarget(unnamed, true, siteIdForName)).toBeNull();
  expect(scannerRowOpenTarget(gas, false, siteIdForName)).toEqual({
    kind: 'site',
    siteId: 49,
    signatureId: 'GAS-001',
  });
  expect(scannerRowOpenTarget(anomaly, false, siteIdForName)).toEqual({
    kind: 'site',
    siteId: 17,
    signatureId: 'ANO-001',
  });
  expect(scannerRowOpenTarget(unknownName, true, siteIdForName)).toBeNull();
  expect(scannerRowOpenTarget(partial, true, siteIdForName)).toBeNull();
  expect(scannerRowOpenTarget(WH, false, siteIdForName)).toBeNull();
  expect(scannerRowOpenTarget(unnamed, false, siteIdForName)).toBeNull();

  const far: SignatureWindowRow = {
    ...WH,
    signatureId: 'YXX-744',
    systemId: 2,
    name: 'K162',
    connection: WH.connection === null
      ? null
      : {
          ...WH.connection,
          toSystemId: 2,
          to: { ...WH.connection.to, signatureId: 'YXX-744' },
        },
  };
  expect(scannerRowOpenTarget(far, true, siteIdForName)).toEqual({
    kind: 'connection',
    connectionId: 'connection-1',
    signatureId: 'YXX-744',
  });
});
