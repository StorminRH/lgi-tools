import { expect, test } from 'vitest';
import type { Doc, Id } from '@/data/convex/data-model';
import { blankDoor, blankHallway } from '@/data/maps/connection-hallway';
import { connectionEditorFixture } from './__tests__/connection-editor-fixture';
import {
  chainSignature,
  filterLivePages,
  layoutConfigKey,
  layoutPostKey,
} from './chain-signature';
import {
  awaitingJumpsFromRows,
  connectionDetailsFromRows,
  slotHolderRows,
  unresolvedHolesFromRows,
} from './connection-detail';
import {
  accountedStubLayoutRows,
  placedStubs,
  seatOrderedLayout,
  stubLayoutRows,
  stubLayoutSignature,
  stubPositionsFromLayout,
  stubPostKey,
} from './stub-layout';
import { normalizeMapAccess } from './use-map-chain-pages';
import { DEFAULT_LAYOUT_CONFIG } from '../layout/layout-contract';

const JITA = 30_000_142;
const AMARR = 30_002_187;

function systems(ids: readonly number[], complete = true) {
  return { rows: ids.map((systemId) => ({ systemId })), complete };
}

function connections(
  rows: readonly {
    _id: string;
    fromSystemId: number;
    toSystemId: number;
    deletedAt?: number | null;
  }[],
  complete = true,
) {
  return { rows, complete };
}

function connectionDoc(
  partial: Omit<Partial<Doc<'mapConnections'>>, '_id'> & { readonly _id: string },
): Doc<'mapConnections'> {
  const hallway = blankHallway({
    mapId: partial.mapId ?? 'map-a',
    fromSystemId: partial.fromSystemId ?? JITA,
    toSystemId: partial.toSystemId === undefined ? null : partial.toSystemId,
  });
  return {
    ...hallway,
    ...partial,
    _id: partial._id as Id<'mapConnections'>,
    _creationTime: partial._creationTime ?? 1,
  };
}

function unresolvedConnection(
  partial: Omit<Partial<Doc<'mapConnections'>>, '_id'> & { readonly _id: string },
): Doc<'mapConnections'> {
  return connectionDoc({
    toSystemId: null,
    ...partial,
  });
}

test('projects an awaiting jump only as a prompt, leaving graph and scanner rows untouched', () => {
  const candidate = unresolvedConnection({ _id: 'candidate', from: { ...blankDoor(), signatureId: 'AAA-123' } });
  const awaiting = unresolvedConnection({
    _id: 'awaiting',
    resolution: {
      kind: 'awaiting-signature', destinationSystemId: AMARR, characterId: 101,
      candidates: [{ connectionId: candidate._id, signatureId: 'AAA-123' }],
    },
  });
  const rows = [candidate, awaiting];
  expect([...connectionDetailsFromRows(rows)]).toEqual([]);
  expect(unresolvedHolesFromRows(rows).map((row) => row.connectionId)).toEqual([candidate._id]);
  expect(awaitingJumpsFromRows(rows).map((row) => row.connectionId)).toEqual([awaiting._id]);
  const removed = { ...awaiting, tombstone: { kind: 'removed' as const, deletedAt: 1, purgeAfter: 2 } };
  expect(awaitingJumpsFromRows([removed])).toEqual([]);
  expect(slotHolderRows([removed])).toEqual([]);
});
test('is stable for identical content and changes on every graph-relevant edit', () => {
  const base = chainSignature(systems([JITA]), connections([]));
  expect(chainSignature(systems([JITA]), connections([]))).toBe(base);

  for (const [nextSystems, nextConnections] of [
    [systems([JITA, AMARR]), connections([])],
    [systems([]), connections([])],
    [systems([JITA]), connections([{ _id: 'c1', fromSystemId: JITA, toSystemId: AMARR }])],
    [systems([JITA], false), connections([])],
    [systems([JITA]), connections([], false)],
  ] as const) {
    expect(chainSignature(nextSystems, nextConnections)).not.toBe(base);
  }

  // A moved endpoint, a swapped document id and a tombstone on the same
  // endpoints all count.
  const linked = chainSignature(
    systems([JITA, AMARR]),
    connections([{ _id: 'c1', fromSystemId: JITA, toSystemId: AMARR, deletedAt: null }]),
  );
  expect(chainSignature(
    systems([JITA, AMARR]),
    connections([{ _id: 'c1', fromSystemId: JITA, toSystemId: AMARR + 1, deletedAt: null }]),
  )).not.toBe(linked);
  expect(chainSignature(
    systems([JITA, AMARR]),
    connections([{ _id: 'c2', fromSystemId: JITA, toSystemId: AMARR, deletedAt: null }]),
  )).not.toBe(linked);
  expect(chainSignature(
    systems([JITA, AMARR]),
    connections([{ _id: 'c1', fromSystemId: JITA, toSystemId: AMARR, deletedAt: 42 }]),
  )).not.toBe(linked);
});

test('places only scanned rows with live anchors and excludes a resolved-feed overlap', () => {
  const summaries = unresolvedHolesFromRows([
    unresolvedConnection({
      _id: 'c1',
      from: { ...blankDoor(), signatureId: 'ABC-123' },
    }),
    unresolvedConnection({ _id: 'unscanned' }),
    unresolvedConnection({
      _id: 'off-map',
      fromSystemId: AMARR,
      from: { ...blankDoor(), signatureId: 'DEF-456' },
    }),
    unresolvedConnection({
      _id: 'resolved-overlap',
      from: { ...blankDoor(), signatureId: 'GHI-789' },
    }),
  ]);
  const scannedRows = stubLayoutRows(
    summaries,
    [{ systemId: JITA }],
    [{ _id: 'resolved-overlap' }],
  );

  expect(scannedRows).toHaveLength(1);
  expect(scannedRows[0]).toMatchObject({
    connectionId: 'c1',
    fromSystemId: JITA,
    from: expect.objectContaining({ signatureId: 'ABC-123' }),
    layoutSystemId: -1,
  });
  const layoutRows = accountedStubLayoutRows([
    {
      connectionId: 'c1',
      fromSystemId: JITA,
      signatureId: 'ABC-123',
      wormholeTypeCode: null,
      whClassId: null,
    },
  ], scannedRows);
  expect(stubLayoutSignature(layoutRows)).toBe(`c1:${JITA}>-1`);

  const facts = seatOrderedLayout({
    systems: [{ systemId: JITA }],
    connections: [],
    stubRows: layoutRows,
    slotHolders: [],
  }).facts;
  expect(facts).toEqual({
    systems: [{ systemId: JITA }, { systemId: -1 }],
    connections: [{ fromSystemId: JITA, toSystemId: -1 }],
  });

  const positions = stubPositionsFromLayout(
    layoutRows,
    new Map([
      [-1, { x: 300, y: 0 }],
      [-4, { x: 600, y: 0 }],
    ]),
  );
  expect(placedStubs(layoutRows, positions)).toEqual([
    {
      connectionId: 'c1',
      fromSystemId: JITA,
      signatureId: 'ABC-123',
      wormholeTypeCode: null,
      whClassId: null,
      position: { x: 300, y: 0 },
    },
  ]);
  expect(
    placedStubs(layoutRows, new Map([
      ['resolved-overlap', { x: 600, y: 0 }],
    ])),
  ).toEqual([]);
});

test('allocates scanned layout ids over kept stubs so a skipped row cannot collide with a static', () => {
  const scannedRows = stubLayoutRows(
    unresolvedHolesFromRows([
      unresolvedConnection({ _id: 'unscanned' }),
      unresolvedConnection({
        _id: 'kept',
        from: { ...blankDoor(), signatureId: 'ABC-123' },
      }),
    ]),
    [{ systemId: JITA }],
    [],
  );
  expect(scannedRows).toEqual([
    expect.objectContaining({ connectionId: 'kept', layoutSystemId: -1 }),
  ]);
  const layoutRows = accountedStubLayoutRows(
    [
      {
        connectionId: 'kept',
        fromSystemId: JITA,
        signatureId: 'ABC-123',
        wormholeTypeCode: null,
        whClassId: null,
      },
      {
        staticId: `${JITA}:C247:1`,
        fromSystemId: JITA,
        code: 'C247',
        className: 'C3',
        whClassId: 3,
      },
    ],
    scannedRows,
  );
  expect(stubLayoutSignature(layoutRows)).toBe(
    `kept:${JITA}>-1,static:${JITA}:C247:1:${JITA}>-2`,
  );
});

test('fingerprints and places static ghosts beside selected scanned rows', () => {
  const scannedRows = stubLayoutRows(
    unresolvedHolesFromRows([
      unresolvedConnection({
        _id: 'scan-1',
        from: { ...blankDoor(), signatureId: 'ABC-123' },
      }),
    ]),
    [{ systemId: JITA }],
    [],
  );
  const layoutRows = accountedStubLayoutRows([
    {
      connectionId: 'scan-1',
      fromSystemId: JITA,
      signatureId: 'ABC-123',
      wormholeTypeCode: null,
      whClassId: null,
    },
    {
      staticId: `${JITA}:C247:1`,
      fromSystemId: JITA,
      code: 'C247',
      className: 'C3',
      whClassId: 3,
    },
  ], scannedRows);

  expect(stubLayoutSignature(layoutRows)).toBe(
    `scan-1:${JITA}>-1,static:${JITA}:C247:1:${JITA}>-2`,
  );
  const facts = seatOrderedLayout({
    systems: [{ systemId: JITA }],
    connections: [],
    stubRows: layoutRows,
    slotHolders: [],
  }).facts;
  expect(facts.systems).toEqual([
    { systemId: JITA },
    { systemId: -2 },
    { systemId: -1 },
  ]);
  expect(
    placedStubs(
      layoutRows,
      stubPositionsFromLayout(layoutRows, new Map([
        [-1, { x: 300, y: 0 }],
        [-2, { x: 480, y: 0 }],
      ])),
    ),
  ).toEqual([
    {
      connectionId: 'scan-1',
      fromSystemId: JITA,
      signatureId: 'ABC-123',
      wormholeTypeCode: null,
      whClassId: null,
      position: { x: 300, y: 0 },
    },
    {
      staticId: `${JITA}:C247:1`,
      fromSystemId: JITA,
      code: 'C247',
      className: 'C3',
      whClassId: 3,
      position: { x: 480, y: 0 },
    },
  ]);
});

test('re-posts layout when the dials, halo membership, stubs or slot holders change', () => {
  const signature = chainSignature(systems([JITA]), connections([]));
  const configKey = layoutConfigKey(DEFAULT_LAYOUT_CONFIG);
  expect(
    layoutPostKey(
      signature,
      layoutConfigKey({ ...DEFAULT_LAYOUT_CONFIG, ringSpacing: DEFAULT_LAYOUT_CONFIG.ringSpacing + 60 }),
    ),
  ).not.toBe(layoutPostKey(signature, configKey));
  expect(layoutPostKey(signature, configKey, '#')).not.toBe(
    layoutPostKey(signature, configKey, `${JITA + 1}:1:0#`),
  );
  expect(layoutPostKey(signature, configKey, '', `c1:${JITA}>-1`)).not.toBe(
    layoutPostKey(signature, configKey, '', ''),
  );
  const withoutHolder = stubPostKey([]);
  const withHolder = stubPostKey([], [{
    connectionId: 'dead-1',
    fromSystemId: JITA,
    _creationTime: 10,
  }]);
  expect(layoutPostKey(signature, configKey, '', withHolder)).not.toBe(
    layoutPostKey(signature, configKey, '', withoutHolder),
  );
});

test('drops tombstoned rows and changes the signature', () => {
  const subscribed = {
    rows: [
      { systemId: JITA, deletedAt: null as number | null },
      { systemId: AMARR, deletedAt: 1_700_000_000_000 },
    ],
    complete: true,
  };
  const live = filterLivePages(subscribed);
  expect(live.rows.map((row) => row.systemId)).toEqual([JITA]);
  expect(chainSignature(systems([JITA, AMARR]), connections([]))).not.toBe(
    chainSignature(
      { rows: live.rows.map((row) => ({ systemId: row.systemId })), complete: true },
      connections([]),
    ),
  );
});

test('treats undefined deletedAt as live (optional-field normalization)', () => {
  const pages = {
    rows: [{ systemId: JITA }, { systemId: AMARR, deletedAt: undefined }],
    complete: true,
  };
  expect(filterLivePages(pages)).toBe(pages);
});

test('keeps unanswered access distinct from a live denial', () => {
  expect(normalizeMapAccess(undefined)).toEqual({
    access: undefined,
    canEdit: undefined,
  });
  expect(normalizeMapAccess({ granted: false, canEdit: false })).toEqual({
    access: false,
    canEdit: false,
  });
});

test('normalizes optional connection detail fields without dropping tombstones', () => {
  const row = connectionDoc({
    _id: 'c1',
    _creationTime: 10,
    fromSystemId: JITA,
    toSystemId: AMARR,
    tombstone: { kind: 'removed', deletedAt: 20, purgeAfter: 30 },
  });
  const unresolved = connectionDoc({
    _id: 'stub-1',
    _creationTime: 10,
    fromSystemId: JITA,
    toSystemId: null,
    from: { ...blankDoor(), signatureId: 'ABC-123' },
    tombstone: { kind: 'removed', deletedAt: 20, purgeAfter: 30 },
  });
  const details = connectionDetailsFromRows([row, unresolved]);
  expect(details.get(row._id)).toEqual(
    connectionEditorFixture({
      connectionId: row._id,
      _creationTime: 10,
      fromSystemId: JITA,
      toSystemId: AMARR,
      tombstone: { kind: 'removed', deletedAt: 20, purgeAfter: 30 },
    }),
  );
  expect(details.has(unresolved._id)).toBe(false);
});

test('projects merged identity fields for the card and prompt consumers', () => {
  const row = connectionDoc({
    _id: 'c1',
    _creationTime: 10,
    fromSystemId: JITA,
    toSystemId: AMARR,
    from: {
      typeCode: 'K162',
      signatureId: 'ABC-123',
      signalPct: null,
      leadsTo: { kind: 'hint', hint: 'deadly' },
    },
    identity: { kind: 'typed', provenance: 'human' },
    resolution: { kind: 'destination', provenance: 'assumed' },
    observedMassKg: 300_000_000,
    observedMassAtStateKg: 100_000_000,
  });
  expect(connectionDetailsFromRows([row]).get(row._id)).toEqual(
    connectionEditorFixture({
      connectionId: row._id,
      _creationTime: 10,
      fromSystemId: JITA,
      toSystemId: AMARR,
      from: {
        typeCode: 'K162',
        signatureId: 'ABC-123',
        signalPct: null,
        leadsTo: { kind: 'hint', hint: 'deadly' },
      },
      identity: { kind: 'typed', provenance: 'human' },
      resolution: { kind: 'destination', provenance: 'assumed' },
      observedMassKg: 300_000_000,
      observedMassAtStateKg: 100_000_000,
    }),
  );
});

test('summarizes only live unresolved slots for the prompt feed', () => {
  const rows = [
    connectionDoc({
      _id: 'stub-1',
      _creationTime: 10,
      fromSystemId: JITA,
      toSystemId: null,
      from: { ...blankDoor(), signatureId: 'ABC-123' },
    }),
    connectionDoc({
      _id: 'resolved',
      _creationTime: 10,
      fromSystemId: JITA,
      toSystemId: AMARR,
      from: { ...blankDoor(), typeCode: 'B274' },
      to: { ...blankDoor(), typeCode: 'K162' },
      identity: { kind: 'typed', provenance: 'human' },
    }),
    connectionDoc({
      _id: 'stub-dead',
      _creationTime: 10,
      fromSystemId: JITA,
      toSystemId: null,
      tombstone: { kind: 'removed', deletedAt: 20, purgeAfter: 30 },
    }),
  ];
  expect(unresolvedHolesFromRows(rows)).toEqual([
    {
      ...connectionEditorFixture({
        connectionId: 'stub-1' as Id<'mapConnections'>,
        _creationTime: 10,
        fromSystemId: JITA,
        toSystemId: null,
        from: { ...blankDoor(), signatureId: 'ABC-123' },
      }),
      toSystemId: null,
    },
  ]);
  expect(slotHolderRows(rows)).toEqual([
    {
      ...connectionEditorFixture({
        connectionId: 'stub-dead' as Id<'mapConnections'>,
        _creationTime: 10,
        fromSystemId: JITA,
        toSystemId: null,
        tombstone: { kind: 'removed', deletedAt: 20, purgeAfter: 30 },
      }),
      toSystemId: null,
    },
  ]);
});
