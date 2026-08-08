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
  trackedPasteSystem,
  type ConnectionSignatureInput,
} from './signature-model';

const SYSTEM = 31_000_001;

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
    fromSignatureId: 'WHL-001',
    fromSignalPct: 75,
    firstSeenAt: 1_500,
    wormholeTypeCode: null,
    deletedAt: null,
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
      [connection()],
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
    });
  });

  it('formats the shared client clock without one timer per row', () => {
    expect(formatSignatureAge(1_000, 1_000)).toBe('<1m');
    expect(formatSignatureAge(1_000, 6 * 60_000 + 1_000)).toBe('6m');
    expect(formatSignatureAge(1_000, 3 * 60 * 60_000 + 1_000)).toBe('3h');
    expect(formatSignatureAge(1_000, 2 * 24 * 60 * 60_000 + 1_000)).toBe('2d');
  });

  it('targets only the active character and refuses untracked or locationless state', () => {
    const tracked = [
      { characterId: 7, location: { solarSystemId: SYSTEM } },
      { characterId: 8, location: { solarSystemId: SYSTEM + 1 } },
    ];
    expect(
      trackedPasteSystem({
        characterId: 7,
        ownTrackedCharacterIds: [7, 8],
        tracked,
      }),
    ).toBe(SYSTEM);
    expect(
      trackedPasteSystem({
        characterId: 9,
        ownTrackedCharacterIds: [7, 8],
        tracked,
      }),
    ).toBeNull();
    expect(
      trackedPasteSystem({
        characterId: 7,
        ownTrackedCharacterIds: [7],
        tracked: [{ characterId: 7, location: null }],
      }),
    ).toBeNull();
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

    expect(scannerPasteDecision('ordinary clipboard text', true, SYSTEM)).toBeNull();
    expect(scannerPasteDecision(valid, false, SYSTEM)).toEqual({ kind: 'read-only' });
    expect(scannerPasteDecision(valid, true, null)).toEqual({ kind: 'untracked' });
    expect(scannerPasteDecision(valid, true, SYSTEM)).toMatchObject({
      kind: 'apply',
      systemId: SYSTEM,
      rows: [{ signatureId: 'ABC-123', group: 'Wormhole' }],
    });
    expect(
      scannerPasteDecision(
        'ABC-123\tUnexpected Kind\tUnknown\t\t100%\t1 AU',
        true,
        SYSTEM,
      ),
    ).toMatchObject({ kind: 'reject', rejectCount: 1 });
  });
});
