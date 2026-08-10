import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyPgDb } from '@/lib/db-types';
import type { JumpResolverDependencies } from './resolver';
import { resolveJumpRequest } from './resolver';

const database = {} as AnyPgDb;
const USER = 'user-1';
const MAP = 'map-1';
const CHARACTER = 90_000_001;
const ORIGIN = 31_000_001;
const DESTINATION = 31_000_002;
const KSPACE_A = 30_000_001;
const KSPACE_B = 30_000_002;
const TRANSITION_AT = 1_800_000_000_000;

const C247 = {
  code: 'C247',
  typeId: 30_758,
  farSide: false as const,
  totalMass: 2_000_000_000,
  maxJumpMass: 300_000_000,
  massRegen: 0,
  lifetimeMinutes: 960,
  sizeClass: 'L' as const,
  targetClass: 1,
};

const systems = {
  version: 'test',
  systems: [
    { id: ORIGIN, name: 'J100001', whClassId: 1, security: -1 },
    { id: DESTINATION, name: 'J100002', whClassId: 1, security: -1 },
    { id: KSPACE_A, name: 'Known A', whClassId: 7, security: 0.9 },
    { id: KSPACE_B, name: 'Known B', whClassId: 7, security: 0.8 },
  ],
};

const emission = {
  connectionId: 'connection-1',
  fromSystemId: ORIGIN,
  toSystemId: DESTINATION,
  wormholeTypeCode: 'C247',
  typedSide: 'from' as const,
  destinationProvenance: 'jump-verified' as const,
  observationKey: 'observation-key',
};

const h = {
  readTransitionEvidence: vi.fn(),
  readConnectionEvidence: vi.fn(),
  authorJump: vi.fn(),
  answerJump: vi.fn(),
  getSystemDirectory: vi.fn(),
  getAdjacencyGraph: vi.fn(),
  getWormholeCodex: vi.fn(),
  readSystemStaticsForSystem: vi.fn(),
  readShipMassByType: vi.fn(),
  insertWhObservation: vi.fn(),
  deleteWhObservation: vi.fn(),
  newObservationKey: vi.fn(),
  now: vi.fn(),
  reportEmissionFailure: vi.fn(),
  resolveSignatureElimination: vi.fn(),
  reportEliminationFailure: vi.fn(),
};

const dependencies = h as unknown as JumpResolverDependencies;

function transitionEvidence(
  input: {
    from?: number;
    to?: number;
    shipTypeId?: number | null;
    prevFresh?: boolean;
    candidates?: Array<{
      id: string;
      wormholeTypeCode: string | null;
      destinationHint?: 'unknown';
      sizeClass: 'L' | null;
    }>;
  } = {},
) {
  return {
    canEdit: true,
    tracked: true,
    transition: {
      fromSolarSystemId: input.from ?? ORIGIN,
      toSolarSystemId: input.to ?? DESTINATION,
      shipTypeId: input.shipTypeId === undefined ? 587 : input.shipTypeId,
      prevFresh: input.prevFresh ?? true,
      transitionObservedAt: TRANSITION_AT,
    },
    lastProcessedTransitionAt: null,
    originLive: true,
    // Mirrors the live packet: unresolved candidates are scanned rows, so
    // their typed codes join the census pool unless a case overrides it.
    scannedTypeCodes: (input.candidates ?? [])
      .map((candidate) => candidate.wormholeTypeCode)
      .filter((code): code is string => code !== null),
    candidates: input.candidates ?? [],
  };
}

beforeEach(() => {
  for (const mock of Object.values(h)) mock.mockReset();
  h.readTransitionEvidence.mockResolvedValue(transitionEvidence());
  h.readConnectionEvidence.mockResolvedValue({ canEdit: true, connection: emission });
  h.authorJump.mockResolvedValue({ status: 'authored', emission });
  h.answerJump.mockResolvedValue(emission);
  h.getSystemDirectory.mockResolvedValue(systems);
  h.getAdjacencyGraph.mockResolvedValue({ version: 'test', adjacency: [] });
  h.getWormholeCodex.mockResolvedValue({ version: 'test', types: [C247] });
  h.readSystemStaticsForSystem.mockResolvedValue([]);
  h.readShipMassByType.mockResolvedValue(12_000_000);
  h.insertWhObservation.mockResolvedValue({});
  h.newObservationKey.mockReturnValue('observation-key');
  h.now.mockReturnValue(TRANSITION_AT);
  h.resolveSignatureElimination.mockResolvedValue({ status: 'quiet' });
});

describe('jump resolver composition', () => {
  it('honestly re-anchors missing, discontinuous, and capsule-loss transitions', async () => {
    h.readTransitionEvidence.mockResolvedValueOnce({
      ...transitionEvidence(),
      transition: null,
    });
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 're-anchor' });

    h.readTransitionEvidence.mockResolvedValueOnce(
      transitionEvidence({ prevFresh: false }),
    );
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 're-anchor' });

    h.readTransitionEvidence.mockResolvedValueOnce(
      transitionEvidence({ to: KSPACE_A, shipTypeId: 670 }),
    );
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 're-anchor' });
    expect(h.authorJump).not.toHaveBeenCalled();
  });

  it('skips stargate travel and non-adjacent known-space travel without authoring', async () => {
    h.readTransitionEvidence.mockResolvedValueOnce(
      transitionEvidence({ from: KSPACE_A, to: KSPACE_B }),
    );
    h.getAdjacencyGraph.mockResolvedValueOnce({
      version: 'test',
      adjacency: [[KSPACE_A, [KSPACE_B]]],
    });
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 'gate-placement' });

    h.readTransitionEvidence.mockResolvedValueOnce(
      transitionEvidence({ from: KSPACE_A, to: KSPACE_B }),
    );
    h.getAdjacencyGraph.mockResolvedValueOnce({ version: 'test', adjacency: [] });
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 'known-space-crossing' });
    expect(h.authorJump).not.toHaveBeenCalled();
  });

  it('authors a J-space crossing with the seeded ship mass', async () => {
    // Faithful fresh-insert facts: an inserted row has no typed identity yet.
    h.authorJump.mockResolvedValueOnce({
      status: 'authored',
      emission: {
        ...emission,
        wormholeTypeCode: null,
        typedSide: null,
        destinationProvenance: null,
      },
    });
    const result = await resolveJumpRequest(
      database,
      USER,
      { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
      dependencies,
    );

    expect(result).toEqual({
      status: 'processed',
      outcome: 'authored',
      emitted: false,
    });
    expect(h.authorJump).toHaveBeenCalledWith(
      expect.objectContaining({
        fromSolarSystemId: ORIGIN,
        toSolarSystemId: DESTINATION,
        transitionObservedAt: TRANSITION_AT,
        observedShipMassKg: 12_000_000,
      }),
    );
    expect(h.resolveSignatureElimination).toHaveBeenNthCalledWith(
      1,
      database,
      USER,
      { mapId: MAP, systemId: ORIGIN },
    );
    expect(h.resolveSignatureElimination).toHaveBeenNthCalledWith(
      2,
      database,
      USER,
      { mapId: MAP, systemId: DESTINATION },
    );
  });

  it('emits a lone typed survivor as jump-verified and an inferred match as assumed', async () => {
    h.readTransitionEvidence.mockResolvedValueOnce(
      transitionEvidence({
        candidates: [{
          id: 'connection-1',
          wormholeTypeCode: 'C247',
          sizeClass: 'L',
        }],
      }),
    );
    h.readSystemStaticsForSystem.mockResolvedValueOnce(['C247']);
    const verified = await resolveJumpRequest(
      database,
      USER,
      { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
      dependencies,
    );
    expect(verified).toEqual({
      status: 'processed',
      outcome: 'authored',
      emitted: true,
    });
    expect(h.insertWhObservation).toHaveBeenCalledWith(
      database,
      expect.objectContaining({
        solarSystemId: ORIGIN,
        whTypeCode: 'C247',
        provenance: 'jump-verified',
        dedupeKey: 'observation-key',
      }),
    );

    h.insertWhObservation.mockClear();
    h.readTransitionEvidence.mockResolvedValueOnce(
      transitionEvidence({
        candidates: [
          { id: 'connection-1', wormholeTypeCode: 'C247', sizeClass: 'L' },
          { id: 'connection-2', wormholeTypeCode: null, sizeClass: null },
        ],
      }),
    );
    h.readSystemStaticsForSystem.mockResolvedValueOnce([]);
    // Faithful mutation echo: an assumed decision stamps assumed provenance.
    h.authorJump.mockResolvedValueOnce({
      status: 'authored',
      emission: { ...emission, destinationProvenance: 'assumed' },
    });
    await resolveJumpRequest(
      database,
      USER,
      { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
      dependencies,
    );
    // Ruling D-B: the weaker evidence is kept, tagged for what it is, rather
    // than discarded — exactly one row, at the tier the mutation stamped.
    expect(h.insertWhObservation).toHaveBeenCalledTimes(1);
    expect(h.insertWhObservation).toHaveBeenCalledWith(
      database,
      expect.objectContaining({
        solarSystemId: ORIGIN,
        whTypeCode: 'C247',
        provenance: 'assumed',
        dedupeKey: 'observation-key',
      }),
    );
    expect(h.authorJump).toHaveBeenLastCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({ provenance: 'assumed' }),
      }),
    );
  });

  it('returns retry before any Convex write when a required Neon read fails', async () => {
    h.getSystemDirectory.mockRejectedValueOnce(new Error('neon down'));
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'retry', reason: 'neon-geography' });
    expect(h.authorJump).not.toHaveBeenCalled();
    expect(h.insertWhObservation).not.toHaveBeenCalled();
  });

  it('confirms an assumed identity through the resolve door and emits at confirmed tier', async () => {
    const result = await resolveJumpRequest(
      database,
      USER,
      {
        kind: 'confirm',
        mapId: MAP,
        connectionId: 'connection-1',
        targetConnectionId: null,
      },
      dependencies,
    );
    expect(result).toEqual({
      status: 'processed',
      outcome: 'confirmed',
      emitted: true,
    });
    expect(h.answerJump).toHaveBeenCalledWith({
      operation: 'confirm',
      userId: USER,
      mapId: MAP,
      connectionId: 'connection-1',
    });
    expect(h.insertWhObservation).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ provenance: 'confirmed' }),
    );
  });

  it('emits a manually typed attributable hole from authoritative connection evidence', async () => {
    const result = await resolveJumpRequest(
      database,
      USER,
      { kind: 'typed-hole', mapId: MAP, connectionId: 'connection-1' },
      dependencies,
    );
    expect(result).toEqual({
      status: 'processed',
      outcome: 'typed-hole',
      emitted: true,
    });
    expect(h.readConnectionEvidence).toHaveBeenCalledWith(
      USER,
      MAP,
      'connection-1',
    );
    expect(h.insertWhObservation).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ provenance: 'human' }),
    );
  });

  it('does not emit a manually typed hole whose codex class contradicts the destination', async () => {
    h.getSystemDirectory.mockResolvedValueOnce({
      version: 'test',
      systems: [
        systems.systems[0],
        { id: DESTINATION, name: 'J400001', whClassId: 4, security: -1 },
      ],
    });
    const result = await resolveJumpRequest(
      database,
      USER,
      { kind: 'typed-hole', mapId: MAP, connectionId: 'connection-1' },
      dependencies,
    );
    expect(result).toEqual({
      status: 'processed',
      outcome: 'typed-hole',
      emitted: false,
    });
    expect(h.insertWhObservation).not.toHaveBeenCalled();
    // The contradicted retype makes any previously emitted row stale — the
    // typed-hole channel removes it just like the answer path.
    expect(h.deleteWhObservation).toHaveBeenCalledWith(database, 'observation-key');
  });

  it('emission follows the stored provenance of a converged pair, never the matcher verdict', async () => {
    // Matcher sees a lone typed consistent survivor (jump-verified verdict),
    // but the mutation converged onto an existing pair whose association is
    // still assumed — the row is logged at THAT tier, never inflated.
    h.readTransitionEvidence.mockResolvedValueOnce(
      transitionEvidence({
        candidates: [{ id: 'connection-9', wormholeTypeCode: 'C247', sizeClass: 'L' }],
      }),
    );
    h.readSystemStaticsForSystem.mockResolvedValueOnce(['C247']);
    h.authorJump.mockResolvedValueOnce({
      status: 'converged',
      emission: { ...emission, destinationProvenance: 'assumed' },
    });
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'processed', outcome: 'converged', emitted: true });
    expect(h.insertWhObservation).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ provenance: 'assumed' }),
    );

    // A converged pair whose identity was human-typed refreshes at ITS tier —
    // the return-jump upsert must not inflate it to jump-verified.
    h.readTransitionEvidence.mockResolvedValueOnce(
      transitionEvidence({
        candidates: [{ id: 'connection-9', wormholeTypeCode: 'C247', sizeClass: 'L' }],
      }),
    );
    h.readSystemStaticsForSystem.mockResolvedValueOnce(['C247']);
    h.authorJump.mockResolvedValueOnce({
      status: 'converged',
      emission: { ...emission, destinationProvenance: 'human' },
    });
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'processed', outcome: 'converged', emitted: true });
    expect(h.insertWhObservation).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ provenance: 'human' }),
    );
  });

  it('returns retry for re-derivable candidate races and stale for superseded transitions', async () => {
    h.authorJump.mockResolvedValueOnce({ status: 'stale', reason: 'candidates' });
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'retry', reason: 'candidates' });

    h.authorJump.mockResolvedValueOnce({ status: 'stale', reason: 'transition' });
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'stale', reason: 'transition' });
  });

  it('lapses a transition older than the capture window without authoring', async () => {
    h.now.mockReturnValue(TRANSITION_AT + 10 * 60_000 + 1);
    await expect(
      resolveJumpRequest(
        database,
        USER,
        { kind: 'doorbell', mapId: MAP, characterId: CHARACTER },
        dependencies,
      ),
    ).resolves.toEqual({ status: 'skipped', reason: 'capture-window' });
    expect(h.authorJump).not.toHaveBeenCalled();
  });

  it('deletes the vacated observation when a correction lands on ineligible facts', async () => {
    h.answerJump.mockResolvedValueOnce({ ...emission, wormholeTypeCode: null });
    await expect(
      resolveJumpRequest(
        database,
        USER,
        {
          kind: 'confirm',
          mapId: MAP,
          connectionId: 'connection-1',
          targetConnectionId: 'connection-2',
        },
        dependencies,
      ),
    ).resolves.toEqual({
      status: 'processed',
      outcome: 'reassociated',
      emitted: false,
    });
    expect(h.insertWhObservation).not.toHaveBeenCalled();
    expect(h.deleteWhObservation).toHaveBeenCalledWith(database, 'observation-key');
  });
});
