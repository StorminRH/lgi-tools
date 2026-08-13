import { afterEach, expect, test, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { setSiteNameIndex } from '@/features/wormhole-sites/site-name-lookup';
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
  connection: {
    connectionId: 'connection-1' as Id<'mapConnections'>,
    _creationTime: 2_000,
    fromSystemId: 1,
    toSystemId: null,
    fromSignatureId: 'WHL-001',
    toSignatureId: null,
    fromSignalPct: 100,
    firstSeenAt: 0,
    wormholeTypeCode: 'B274',
    typedSide: null,
    massState: null,
    shipSize: 'M',
    lifeStage: null,
    lifeStageObservedAt: null,
    deathEarliestAt: null,
    deathLatestAt: null,
    deletedAt: null,
    purgeAfter: null,
    fromDestinationHint: null,
    toDestinationHint: null,
    destinationProvenance: null,
    pendingCandidates: null,
    observedMassKg: null,
    observedMassAtStateKg: null,
  },
});

test('scanner row open gates catalogue sites, edit, identify, and host dispatch', () => {
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
  expect(scannerRowOpenAction(unnamed, true)).toEqual({ kind: 'identify' });
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
          toSignatureId: 'YXX-744',
        },
  };
  expect(scannerRowOpenAction(far, true)).toEqual({
    kind: 'connection',
    connectionId: 'connection-1',
    signatureId: 'YXX-744',
  });

  const openEditor = vi.fn();
  const openSite = vi.fn();
  const openIdentify = vi.fn();
  const handlers = { openEditor, openSite, openIdentify };
  const trigger = {} as HTMLElement;

  applyScannerRowOpenAction(null, handlers, {
    row: gas,
    trigger,
    clientX: 1,
    clientY: 2,
  });
  expect(openEditor).not.toHaveBeenCalled();
  expect(openSite).not.toHaveBeenCalled();
  expect(openIdentify).not.toHaveBeenCalled();

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

  applyScannerRowOpenAction(
    { kind: 'identify' },
    handlers,
    { row: gas, trigger, clientX: 5, clientY: 6 },
  );
  expect(openIdentify).toHaveBeenCalledWith(gas, trigger, 5, 6);
});
