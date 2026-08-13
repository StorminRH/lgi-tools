import { describe, expect, it } from 'vitest';
import type { Doc, Id } from '@/data/convex/data-model';
import { isScannerPasteCandidate } from '@/data/maps/scan-parse';
import type { TrackedSystemTarget } from '../tracking/tracked-system';
import {
  buildSignatureRows,
  filterSignatureRows,
  formatSignatureAge,
  groupSignatureSections,
  isEditablePasteTarget,
  scannerPasteDecision,
  scannerPasteRefusalToast,
  scannerSectionForGroup,
  scannerWormholeLifetime,
  scannerWormholeSize,
  signatureCounts,
  type ConnectionSignatureInput,
  type SignatureWindowRow,
} from './signature-model';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';

const SYSTEM = 31_000_001;
const READY: TrackedSystemTarget = { kind: 'ready', systemId: SYSTEM };
const NONE: TrackedSystemTarget = { kind: 'none' };
const AMBIGUOUS: TrackedSystemTarget = { kind: 'ambiguous' };

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
  return {
    connectionId: 'connection-1' as Id<'mapConnections'>,
    _creationTime: 2_000,
    fromSystemId: SYSTEM,
    toSystemId: null,
    fromSignatureId: 'WHL-001',
    toSignatureId: null,
    fromSignalPct: 75,
    firstSeenAt: 1_500,
    wormholeTypeCode: null,
    typedSide: null,
    massState: null,
    shipSize: null,
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
    ...partial,
  };
}

describe('signature window tabs, filters, confirmation and refusal models', () => {
  it('merges list rows with migrated wormholes and groups legacy kinds correctly', () => {
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
      [connection({ wormholeTypeCode: 'B274' })],
      (code) => (code === 'B274' ? 'HS' : null),
    );

    expect(rows).toHaveLength(3);
    expect(filterSignatureRows(rows, SYSTEM, 'signature').map((row) => row.signatureId))
      .toEqual(['ABC-123', 'WHL-001']);
    expect(filterSignatureRows(rows, SYSTEM, 'anomaly').map((row) => row.signatureId))
      .toEqual(['ANO-456']);
    expect(signatureCounts(rows, SYSTEM)).toEqual({ signatures: 2, anomalies: 1 });
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

  it('lists the linked hole on both scanners after a far-side link', () => {
    const fromSystemId = SYSTEM;
    const toSystemId = SYSTEM + 1;
    const rows = buildSignatureRows(
      [],
      [
        connection({
          fromSystemId,
          toSystemId,
          fromSignatureId: 'JNW-622',
          toSignatureId: 'YXX-744',
          wormholeTypeCode: 'P060',
          typedSide: 'from',
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
      connection: expect.objectContaining({
        connectionId: 'connection-1',
        toSignatureId: 'YXX-744',
      }),
    });
    expect(
      rows.find((row) => row.systemId === toSystemId && row.signatureId === 'YXX-744'),
    ).toMatchObject({
      key: 'connection:connection-1:to',
      systemId: toSystemId,
      signatureId: 'YXX-744',
      group: 'Wormhole',
      name: 'K162',
      className: null,
      connection: expect.objectContaining({ toSignatureId: 'YXX-744' }),
    });
    expect(
      filterSignatureRows(rows, toSystemId, 'signature').map((row) => row.signatureId),
    ).toEqual(['YXX-744']);
  });

  it('buckets Cosmic Signatures into ordered non-empty presentation sections', () => {
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
          lifeStage: 'under_4_hours',
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

    expect(scannerSectionForGroup(null)).toBe('unknown');
    expect(scannerSectionForGroup('Ore Site')).toBe('harvestables');
    expect(scannerSectionForGroup('Relic Site')).toBe('hacking');
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
    ).toEqual(['wormholes']);
  });

  it('reads wormhole size and remaining lifetime from codex like the row editor', () => {
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
      shipSize: 'M',
      lifeStage: null,
      deathEarliestAt: null,
      deathLatestAt: null,
    });

    expect(scannerWormholeSize(base, typed)).toBe('L');
    expect(scannerWormholeSize(base, null)).toBe('M');
    expect(scannerWormholeSize(null, null)).toBe('—');
    expect(scannerWormholeSize(base, {
      code: 'K162',
      typeId: 2,
      farSide: true,
    })).toBe('M');
    expect(scannerWormholeLifetime(base, typed, now)).toBe('≤ 14h');
    expect(scannerWormholeLifetime(base, null, now)).toBe('—');
    expect(
      scannerWormholeLifetime(
        {
          ...base,
          deathEarliestAt: now + 60 * 60_000,
          deathLatestAt: now + 4 * 60 * 60_000,
        },
        typed,
        now,
      ),
    ).toBe('~1h–4h');
    expect(
      scannerWormholeLifetime(
        {
          ...base,
          deathEarliestAt: now - 1_000,
          deathLatestAt: now - 1_000,
        },
        typed,
        now,
      ),
    ).toBe('Expired');
  });

  it('formats the shared client clock without one timer per row', () => {
    expect(formatSignatureAge(1_000, 1_000)).toBe('<1m');
    expect(formatSignatureAge(1_000, 6 * 60_000 + 1_000)).toBe('6m');
    expect(formatSignatureAge(1_000, 3 * 60 * 60_000 + 1_000)).toBe('3h');
    expect(formatSignatureAge(1_000, 2 * 24 * 60 * 60_000 + 1_000)).toBe('2d');
  });

  it('claims scanner-shaped text while leaving ordinary clipboard text alone', () => {
    expect(
      isScannerPasteCandidate(
        'ABC-123\tCosmic Signature\tWormhole\tUnstable Wormhole\t100%\t1 AU',
      ),
    ).toBe(true);
    expect(isScannerPasteCandidate('ABC-123\tUnexpected Kind\t\t\t\t1 AU')).toBe(true);
    expect(isScannerPasteCandidate('ordinary clipboard text')).toBe(false);
    expect(isEditablePasteTarget(null)).toBe(false);
  });

  it('classifies apply, confirmation refusal, and malformed scanner pastes before side effects', () => {
    const valid =
      'ABC-123\tCosmic Signature\tWormhole\tUnstable Wormhole\t100%\t1 AU';

    expect(scannerPasteDecision('ordinary clipboard text', true, READY)).toBeNull();
    expect(scannerPasteDecision(valid, false, READY)).toEqual({ kind: 'read-only' });
    expect(scannerPasteDecision(valid, true, NONE)).toEqual({ kind: 'untracked' });
    // Warm-up honesty: an undelivered tracking feed must never read as
    // "untracked" — the pilot may well be tracked and online.
    expect(scannerPasteDecision(valid, true, { kind: 'loading' })).toEqual({
      kind: 'loading',
    });
    expect(scannerPasteDecision(valid, true, AMBIGUOUS)).toEqual({ kind: 'ambiguous' });
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
  });

  it('maps non-apply paste decisions to refusal toast copy', () => {
    expect(scannerPasteRefusalToast({ kind: 'reject', rejectCount: 1 })).toEqual({
      message: 'Scanner paste rejected — 1 row need attention.',
      options: { id: 'scanner-paste:rejected', duration: 5_000 },
    });
    expect(scannerPasteRefusalToast({ kind: 'reject', rejectCount: 2 }).message).toContain(
      '2 rows',
    );
    expect(scannerPasteRefusalToast({ kind: 'read-only' }).options.id).toBe(
      'scanner-paste:read-only',
    );
    expect(scannerPasteRefusalToast({ kind: 'ambiguous' }).options.id).toBe(
      'scanner-paste:ambiguous',
    );
    expect(scannerPasteRefusalToast({ kind: 'untracked' }).options.id).toBe(
      'scanner-paste:untracked',
    );
    expect(scannerPasteRefusalToast({ kind: 'loading' }).options.id).toBe(
      'scanner-paste:loading',
    );
  });

  it('sections schema-legal legacy group strings as unidentified instead of crashing', () => {
    const legacy: SignatureWindowRow = {
      key: 'legacy',
      systemId: SYSTEM,
      signatureId: 'LEG-001',
      kind: 'signature',
      // Stored rows may carry pre-vocabulary strings (legacy lowercase); the
      // cast mirrors the schema's v.union(v.string(), v.null()) reality.
      group: 'wormhole' as SignatureWindowRow['group'],
      name: null,
      signalPct: null,
      firstSeenAt: 1,
      connection: null,
      className: null,
    };
    expect(scannerSectionForGroup(legacy.group)).toBe('unknown');
    const sections = groupSignatureSections([legacy], SYSTEM);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe('unknown');
    expect(sections[0]?.rows.map((row) => row.signatureId)).toEqual(['LEG-001']);
  });
});
