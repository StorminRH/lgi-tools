import { describe, expect, it } from 'vitest';
import type { Doc, Id } from '@/data/convex/data-model';
import {
  buildSignatureRows,
  filterSignatureRows,
  formatSignatureAge,
  isEditablePasteTarget,
  isScannerPasteCandidate,
  scannerPasteDecision,
  signatureCounts,
  trackedPasteSystemId,
  trackedPasteTarget,
  type ConnectionSignatureInput,
  type TrackedPasteTarget,
} from './signature-model';

const SYSTEM = 31_000_001;
const OWNER = 'owner';
const READY: TrackedPasteTarget = { kind: 'ready', systemId: SYSTEM };
const NONE: TrackedPasteTarget = { kind: 'none' };
const AMBIGUOUS: TrackedPasteTarget = { kind: 'ambiguous' };

function freshness(
  entries: readonly { characterId: number; feedFreshAt: number | null }[],
): ReadonlyMap<string, ReadonlyMap<number, number | null>> {
  return new Map([
    [OWNER, new Map(entries.map((entry) => [entry.characterId, entry.feedFreshAt]))],
  ]);
}

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

  it('formats the shared client clock without one timer per row', () => {
    expect(formatSignatureAge(1_000, 1_000)).toBe('<1m');
    expect(formatSignatureAge(1_000, 6 * 60_000 + 1_000)).toBe('6m');
    expect(formatSignatureAge(1_000, 3 * 60 * 60_000 + 1_000)).toBe('3h');
    expect(formatSignatureAge(1_000, 2 * 24 * 60 * 60_000 + 1_000)).toBe('2d');
  });

  it('targets any online tracked pilot and refuses offline, empty, or multi-system state', () => {
    const tracked = [
      {
        userId: OWNER,
        characterId: 7,
        location: { solarSystemId: SYSTEM },
      },
      {
        userId: OWNER,
        characterId: 8,
        location: { solarSystemId: SYSTEM + 1 },
      },
    ];
    expect(
      trackedPasteTarget({
        ownTrackedCharacterIds: [7, 8],
        tracked,
        freshness: freshness([
          { characterId: 7, feedFreshAt: 1 },
          { characterId: 8, feedFreshAt: null },
        ]),
      }),
    ).toEqual({ kind: 'ready', systemId: SYSTEM });
    expect(
      trackedPasteTarget({
        ownTrackedCharacterIds: [7, 8],
        tracked,
        freshness: freshness([
          { characterId: 7, feedFreshAt: 1 },
          { characterId: 8, feedFreshAt: 1 },
        ]),
      }),
    ).toEqual({ kind: 'ambiguous' });
    expect(
      trackedPasteTarget({
        ownTrackedCharacterIds: [7, 8],
        tracked: [
          {
            userId: OWNER,
            characterId: 7,
            location: { solarSystemId: SYSTEM },
          },
          {
            userId: OWNER,
            characterId: 8,
            location: { solarSystemId: SYSTEM },
          },
        ],
        freshness: freshness([
          { characterId: 7, feedFreshAt: 1 },
          { characterId: 8, feedFreshAt: 1 },
        ]),
      }),
    ).toEqual({ kind: 'ready', systemId: SYSTEM });
    expect(
      trackedPasteTarget({
        ownTrackedCharacterIds: [7],
        tracked: [{ userId: OWNER, characterId: 7, location: null }],
        freshness: freshness([{ characterId: 7, feedFreshAt: 1 }]),
      }),
    ).toEqual({ kind: 'none' });
    expect(
      trackedPasteTarget({
        ownTrackedCharacterIds: [7],
        tracked: [
          {
            userId: OWNER,
            characterId: 7,
            location: { solarSystemId: SYSTEM },
          },
        ],
        freshness: freshness([{ characterId: 7, feedFreshAt: null }]),
      }),
    ).toEqual({ kind: 'none' });
    expect(trackedPasteSystemId(READY)).toBe(SYSTEM);
    expect(trackedPasteSystemId(NONE)).toBeNull();
    expect(trackedPasteSystemId(AMBIGUOUS)).toBeNull();
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
});
