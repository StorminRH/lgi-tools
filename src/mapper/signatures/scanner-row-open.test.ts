import { afterEach, expect, test, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { blankDoor } from '@/data/maps/connection-hallway';
import { setSiteNameIndex } from '@/features/wormhole-sites/site-name-lookup';
import { connectionEditorFixture } from '../chain/connection-editor-fixture';
import {
  applyScannerRowOpenAction,
  scannerRowOpenAction,
  scannerRowShowsOpenAffordance,
} from './scanner-row-open';
import type { SignatureWindowRow } from './signature-model';

afterEach(() => {
  setSiteNameIndex([]);
});

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

test('scanner row open gates catalogue sites, edit, and host dispatch', () => {
  setSiteNameIndex([
    { id: 49, name: 'Barren Perimeter Reservoir' },
    { id: 17, name: 'Forgotten Frontier Quarantine Outpost' },
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

  expect(scannerRowOpenAction(WH, true)).toEqual({
    kind: 'connection',
    connectionId: 'connection-1',
    signatureId: 'WHL-001',
  });
  expect(scannerRowOpenAction(unnamed, true)).toBeNull();
  expect(scannerRowOpenAction(gas, false)).toEqual({
    kind: 'site',
    siteId: 49,
    signatureId: 'GAS-001',
  });
  expect(scannerRowOpenAction(anomaly, false)).toEqual({
    kind: 'site',
    siteId: 17,
    signatureId: 'ANO-001',
  });
  expect(scannerRowOpenAction(unknownName, true)).toBeNull();
  expect(scannerRowOpenAction(partial, true)).toBeNull();
  expect(scannerRowOpenAction(WH, false)).toBeNull();
  expect(scannerRowOpenAction(unnamed, false)).toBeNull();

  expect(scannerRowShowsOpenAffordance(gas, false)).toBe(true);
  expect(scannerRowShowsOpenAffordance(unknownName, true)).toBe(false);
  expect(scannerRowShowsOpenAffordance(WH, true)).toBe(true);
  expect(scannerRowShowsOpenAffordance(WH, false)).toBe(false);

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
  expect(scannerRowOpenAction(far, true)).toEqual({
    kind: 'connection',
    connectionId: 'connection-1',
    signatureId: 'YXX-744',
  });

  const openEditor = vi.fn();
  const openSite = vi.fn();
  const handlers = { openEditor, openSite };
  const trigger = {} as HTMLElement;

  applyScannerRowOpenAction(null, handlers, {
    row: gas,
    trigger,
    clientX: 1,
    clientY: 2,
  });
  expect(openEditor).not.toHaveBeenCalled();
  expect(openSite).not.toHaveBeenCalled();

  applyScannerRowOpenAction(
    {
      kind: 'connection',
      connectionId: 'connection-1' as Id<'mapConnections'>,
      signatureId: 'WHL-001',
    },
    handlers,
    { row: WH, trigger, clientX: 1, clientY: 2 },
  );
  expect(openEditor).toHaveBeenCalledWith('connection-1', 'WHL-001');

  applyScannerRowOpenAction(
    { kind: 'site', siteId: 49, signatureId: 'GAS-001' },
    handlers,
    { row: gas, trigger, clientX: 3, clientY: 4 },
  );
  expect(openSite).toHaveBeenCalledWith(49, 'GAS-001');

});
