import { expect, test } from 'vitest';
import type { Doc, Id } from '@/data/convex/data-model';
import { blankDoor } from '@/data/maps/connection-hallway';
import { connectionEditorFixture } from '../chain/__tests__/connection-editor-fixture';
import type { TrackedSystemTarget } from '../tracking/tracked-system';
import {
  buildSignatureRows,
  groupSignatureSections,
  scanFailureMessage,
  scannerPasteDecision,
  scannerPasteRefusalToast,
  scannerLifeUpperBound,
  type ConnectionSignatureInput,
  type SignatureWindowRow,
} from './signature-model';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';

const SYSTEM = 31_000_001;
const READY: TrackedSystemTarget = { kind: 'ready', systemId: SYSTEM, characterId: 7 };
const NONE: TrackedSystemTarget = { kind: 'none' };

function signature(
  partial: Partial<Doc<'mapSignatures'>> & { signatureId: string },
): Doc<'mapSignatures'> {
  return {
    _id: `sig-${partial.signatureId}` as Id<'mapSignatures'>,
    _creationTime: 1_000,
    mapId: 'map-a',
    systemId: SYSTEM,
    group: null,
    typeName: null,
    wormholeTypeCode: null,
    deletedAt: null,
    purgeAfter: null,
    ...partial,
  };
}

function connection(
  partial: Partial<ConnectionSignatureInput> = {},
): ConnectionSignatureInput {
  return connectionEditorFixture({
    connectionId: 'connection-1' as Id<'mapConnections'>,
    _creationTime: 2_000,
    fromSystemId: SYSTEM,
    toSystemId: null,
    from: { ...blankDoor(), signatureId: 'WHL-001', signalPct: 75 },
    firstSeenAt: 1_500,
    ...partial,
  });
}

test('merges list rows with migrated wormholes and groups legacy kinds correctly', () => {
  const rows = buildSignatureRows(
    [
      signature({ signatureId: 'ABC-123', signalPct: 20 }),
      signature({
        signatureId: 'ANO-456',
        kind: 'anomaly',
        group: 'Combat Site',
        typeName: 'Forgotten Frontier',
      }),
      signature({
        signatureId: 'WHL-001',
        group: 'Wormhole',
        signalPct: 10,
      }),
    ],
    [connection({
      from: { ...blankDoor(), typeCode: 'B274', signatureId: 'WHL-001', signalPct: 75 },
      to: { ...blankDoor(), typeCode: 'K162' },
      identity: { kind: 'typed', provenance: 'human' },
    })],
    (code) => (code === 'B274' ? 'HS' : null),
  );

  expect(rows).toHaveLength(3);
  expect(
    rows
      .filter((row) => row.systemId === SYSTEM && row.kind === 'signature')
      .map((row) => row.signatureId),
  ).toEqual(['ABC-123', 'WHL-001']);
  expect(
    rows
      .filter((row) => row.systemId === SYSTEM && row.kind === 'anomaly')
      .map((row) => row.signatureId),
  ).toEqual(['ANO-456']);
  expect(rows.find((row) => row.signatureId === 'WHL-001')).toMatchObject({
    key: 'connection:connection-1',
    group: 'Wormhole',
    signalPct: 75,
    firstSeenAt: 1_500,
    name: 'B274',
    className: 'HS',
    connection: expect.objectContaining({ connectionId: 'connection-1' }),
  });
});

test('lists the linked hole on both scanners after a far-side link', () => {
  const fromSystemId = SYSTEM;
  const toSystemId = SYSTEM + 1;
  const rows = buildSignatureRows(
    [],
    [
      connection({
        fromSystemId,
        toSystemId,
        from: { ...blankDoor(), typeCode: 'P060', signatureId: 'JNW-622' },
        to: { ...blankDoor(), typeCode: 'K162', signatureId: 'YXX-744' },
        identity: { kind: 'typed', provenance: 'human' },
      }),
    ],
    (code) => (code === 'P060' ? 'C1' : null),
  );

  expect(rows).toHaveLength(2);
  expect(
    rows.find((row) => row.systemId === fromSystemId && row.signatureId === 'JNW-622'),
  ).toMatchObject({
    key: 'connection:connection-1',
    group: 'Wormhole',
    name: 'P060',
    className: 'C1',
    endpoint: 'from',
    connection: expect.objectContaining({
      connectionId: 'connection-1',
      to: expect.objectContaining({ signatureId: 'YXX-744' }),
    }),
  });
  expect(
    rows.find((row) => row.systemId === toSystemId && row.signatureId === 'YXX-744'),
  ).toMatchObject({
    key: 'connection:connection-1:to',
    endpoint: 'to',
    systemId: toSystemId,
    signatureId: 'YXX-744',
    group: 'Wormhole',
    name: 'K162',
    className: null,
    connection: expect.objectContaining({
      to: expect.objectContaining({ signatureId: 'YXX-744' }),
    }),
  });
});

test('does not invent a K162 on the far side of a stored K162', () => {
  const fromSystemId = SYSTEM;
  const toSystemId = SYSTEM + 1;
  const rows = buildSignatureRows(
    [],
    [
      connection({
        fromSystemId,
        toSystemId,
        from: { ...blankDoor(), typeCode: 'K162', signatureId: 'JNW-622' },
        to: { ...blankDoor(), signatureId: 'YXX-744' },
        identity: { kind: 'typed', provenance: 'human' },
      }),
    ],
  );
  expect(
    rows.find((row) => row.signatureId === 'JNW-622'),
  ).toMatchObject({ name: 'K162', endpoint: 'from' });
  expect(
    rows.find((row) => row.signatureId === 'YXX-744'),
  ).toMatchObject({ name: null, endpoint: 'to' });
});

test('buckets Cosmic Signatures into ordered non-empty presentation sections', () => {
  const rows: SignatureWindowRow[] = [
    {
      key: 'a',
      systemId: SYSTEM,
      signatureId: 'UNK-001',
      kind: 'signature',
      group: null,
      name: null,
      signalPct: 10,
      firstSeenAt: 1,
      connection: null,
      className: null,
    },
    {
      key: 'b',
      systemId: SYSTEM,
      signatureId: 'GAS-001',
      kind: 'signature',
      group: 'Gas Site',
      name: 'Barren Perimeter Reservoir',
      signalPct: 100,
      firstSeenAt: 1,
      connection: null,
      className: null,
    },
    {
      key: 'c',
      systemId: SYSTEM,
      signatureId: 'ORE-001',
      kind: 'signature',
      group: 'Ore Site',
      name: 'Ordinary Perimeter Deposit',
      signalPct: 100,
      firstSeenAt: 1,
      connection: null,
      className: null,
    },
    {
      key: 'd',
      systemId: SYSTEM,
      signatureId: 'DAT-001',
      kind: 'signature',
      group: 'Data Site',
      name: 'Unsecured Frontier',
      signalPct: 100,
      firstSeenAt: 1,
      connection: null,
      className: null,
    },
    {
      key: 'e',
      systemId: SYSTEM,
      signatureId: 'REL-001',
      kind: 'signature',
      group: 'Relic Site',
      name: 'Forgotten Frontier',
      signalPct: 100,
      firstSeenAt: 1,
      connection: null,
      className: null,
    },
    {
      key: 'f',
      systemId: SYSTEM,
      signatureId: 'CBT-001',
      kind: 'signature',
      group: 'Combat Site',
      name: 'Sansha Hideout',
      signalPct: 100,
      firstSeenAt: 1,
      connection: null,
      className: null,
    },
    {
      key: 'g',
      systemId: SYSTEM,
      signatureId: 'WHL-001',
      kind: 'signature',
      group: 'Wormhole',
      name: 'B274',
      signalPct: 100,
      firstSeenAt: 1,
      connection: connection({
        shipSize: 'M',
        lifetime: { kind: 'stage', lifeStage: 'under_4_hours', observedAt: 1 },
      }),
      className: 'HS',
    },
    {
      key: 'h',
      systemId: SYSTEM,
      signatureId: 'ANO-001',
      kind: 'anomaly',
      group: 'Combat Site',
      name: 'Forsaken Rally Point',
      signalPct: 100,
      firstSeenAt: 1,
      connection: null,
      className: null,
    },
  ];

  expect(groupSignatureSections(rows, null)).toEqual([]);
  expect(groupSignatureSections(rows, SYSTEM).map((section) => section.id)).toEqual([
    'unknown',
    'wormholes',
    'combat',
    'harvestables',
    'hacking',
  ]);
  expect(
    groupSignatureSections(rows, SYSTEM).find((section) => section.id === 'harvestables')
      ?.rows.map((row) => row.signatureId),
  ).toEqual(['GAS-001', 'ORE-001']);
  expect(
    groupSignatureSections(rows, SYSTEM).find((section) => section.id === 'hacking')
      ?.rows.map((row) => row.signatureId),
  ).toEqual(['DAT-001', 'REL-001']);
  expect(
    groupSignatureSections(
      rows.filter((row) => row.group === 'Wormhole' || row.kind === 'anomaly'),
      SYSTEM,
    ).map((section) => section.id),
  ).toEqual(['wormholes', 'combat']);

  const legacy: SignatureWindowRow = {
    key: 'legacy',
    systemId: SYSTEM,
    signatureId: 'LEG-001',
    kind: 'signature',
    group: 'wormhole' as SignatureWindowRow['group'],
    name: null,
    signalPct: null,
    firstSeenAt: 1,
    connection: null,
    className: null,
  };
  const legacySections = groupSignatureSections([legacy], SYSTEM);
  expect(legacySections).toHaveLength(1);
  expect(legacySections[0]?.id).toBe('unknown');
  expect(legacySections[0]?.rows.map((row) => row.signatureId)).toEqual(['LEG-001']);
});

test('reads the scanner life ceiling like the row editor', () => {
  const typed: WormholeCodexEntry = {
    code: 'B274',
    typeId: 1,
    farSide: false,
    totalMass: 2_000_000_000,
    maxJumpMass: 375_000_000,
    massRegen: 0,
    lifetimeMinutes: 960,
    sizeClass: 'L',
    targetClass: 7,
  };
  const createdAt = 1_000;
  const now = createdAt + 2 * 60 * 60_000;
  const base = connection({
    _creationTime: createdAt,
    firstSeenAt: null,
    lifetime: { kind: 'unknown' },
  });

  expect(scannerLifeUpperBound(base, typed, now)).toBe('14h');
  expect(scannerLifeUpperBound(null, typed, now)).toBe('—');
});

test('classifies scanner pastes before side effects and maps refusals to toast copy', () => {
  const valid =
    'ABC-123\tCosmic Signature\tWormhole\tUnstable Wormhole\t100%\t1 AU';

  expect(scannerPasteDecision('ordinary clipboard text', true, READY)).toBeNull();
  expect(scannerPasteDecision(valid, false, READY)).toEqual({ kind: 'read-only' });
  expect(scannerPasteDecision(valid, true, NONE)).toEqual({ kind: 'untracked' });
  expect(scannerPasteDecision(valid, true, { kind: 'loading' })).toEqual({
    kind: 'loading',
  });
  const candidates = [
    { characterId: 7, systemId: SYSTEM, lastMovementAt: 1 },
    { characterId: 8, systemId: SYSTEM + 1, lastMovementAt: 2 },
  ];
  expect(scannerPasteDecision(valid, true, { kind: 'choose', candidates })).toMatchObject({
    kind: 'choose',
    candidates,
    rows: [{ signatureId: 'ABC-123' }],
  });
  expect(
    scannerPasteDecision(valid, false, { kind: 'choose', candidates }),
  ).toEqual({ kind: 'read-only' });
  expect(scannerPasteDecision(valid, true, READY)).toMatchObject({
    kind: 'apply',
    systemId: SYSTEM,
    rows: [{ signatureId: 'ABC-123', group: 'Wormhole' }],
  });
  expect(
    scannerPasteDecision(
      'ABC-123\tUnexpected Kind\tUnknown\t\t100%\t1 AU',
      true,
      READY,
    ),
  ).toMatchObject({ kind: 'reject', rejectCount: 1 });

  expect(scannerPasteRefusalToast({ kind: 'reject', rejectCount: 1 }).message).toBe("Couldn't read scan");
  expect(scannerPasteRefusalToast({ kind: 'read-only' }).message).toBe('Read-only access');
  expect(scannerPasteRefusalToast({ kind: 'loading' }).message).toBe('Still loading. Paste again.');
  expect(scannerPasteRefusalToast({ kind: 'untracked' }).message).toBe('No character online');
});

test('names the server refusal a scan failed with, from the error code alone', () => {
  const refused = (code: string) => ({
    data: { code, detail: 'Diagnostic text the scanner never shows.' },
  });
  expect(scanFailureMessage(refused('OFF_MAP_SCAN_SYSTEM'))).toBe('System not on map');
  expect(scanFailureMessage(refused('UNTRACKED_SCAN_SYSTEM'))).toBe('No character online');
  expect(scanFailureMessage(refused('TRACKING_CAP_EXCEEDED'))).toBe('Scan not applied');
  expect(scanFailureMessage(refused('constructor'))).toBe('Scan not applied');
  expect(scanFailureMessage(new Error('Network down'))).toBe('Scan not applied');
});
