import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyPgDb } from '@/lib/db-types';
import { eliminateSignatures } from '@/data/maps/signature-eliminator';
import type { SignatureEliminationDependencies } from './resolver';
import { resolveSignatureElimination } from './resolver';

const database = {} as AnyPgDb;
const SYSTEM = 31_000_001;
const request = { mapId: 'map-1', systemIds: [SYSTEM] };
const OBSERVED_AT = 1_800_000_000_000;
const codex = {
  version: 'test',
  types: [
    {
      code: 'B274',
      typeId: 1,
      farSide: false as const,
      totalMass: 2_000_000_000,
      maxJumpMass: 300_000_000,
      massRegen: 0,
      lifetimeMinutes: 1_440,
      sizeClass: 'L' as const,
      targetClass: 7,
    },
    {
      code: 'C247',
      typeId: 2,
      farSide: false as const,
      totalMass: 2_000_000_000,
      maxJumpMass: 300_000_000,
      massRegen: 0,
      lifetimeMinutes: 960,
      sizeClass: 'L' as const,
      targetClass: 3,
    },
  ],
};

const h = {
  readEliminationEvidence: vi.fn(),
  applyEliminationDeductions: vi.fn(),
  readSystemStaticsForSystem: vi.fn(),
  getWormholeCodex: vi.fn(),
  eliminateSignatures,
  reconcileWhObservations: vi.fn(),
  now: vi.fn(),
  reportEmissionFailure: vi.fn(),
};

const dependencies = h as unknown as SignatureEliminationDependencies;

function signature(
  overrides: {
    wormholeTypeCode?: string | null;
    typeProvenance?: string | null;
    observationKey?: string | null;
  } = {},
) {
  return {
    signatureId: 'AAA-111',
    wormholeTypeCode: overrides.wormholeTypeCode ?? null,
    typeProvenance: overrides.typeProvenance ?? null,
    observationKey: overrides.observationKey ?? null,
  };
}

function observationUpsert(overrides: {
  whTypeCode: string;
  provenance: string;
  dedupeKey: string;
}) {
  return {
    solarSystemId: SYSTEM,
    whTypeCode: overrides.whTypeCode,
    provenance: overrides.provenance,
    observedAt: new Date(OBSERVED_AT),
    dedupeKey: overrides.dedupeKey,
  };
}

beforeEach(() => {
  h.readEliminationEvidence.mockReset().mockResolvedValue({
    canEdit: true,
    signatures: [signature()],
    connections: [],
  });
  h.applyEliminationDeductions.mockReset().mockResolvedValue([
    { signatureId: 'AAA-111', outcome: 'applied', observationKey: 'hole-key' },
  ]);
  h.readSystemStaticsForSystem.mockReset().mockResolvedValue(['B274']);
  h.getWormholeCodex.mockReset().mockResolvedValue(codex);
  h.reconcileWhObservations.mockReset().mockResolvedValue(undefined);
  h.now.mockReset().mockReturnValue(OBSERVED_AT);
  h.reportEmissionFailure.mockReset();
});

describe('signature elimination composition', () => {
  it('applies the answer-key deduction and logs exactly one assumed observation', async () => {
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'applied', signatureIds: ['AAA-111'] }] });
    expect(h.applyEliminationDeductions).toHaveBeenCalledWith({
      userId: 'user-1',
      mapId: request.mapId,
      systemId: SYSTEM,
      deductions: [{
        signatureId: 'AAA-111',
        typeCode: 'B274',
        provenance: 'assumed',
      }],
    });
    expect(h.reconcileWhObservations).toHaveBeenCalledWith(database, {
      upserts: [observationUpsert({
        whTypeCode: 'B274',
        provenance: 'assumed',
        dedupeKey: 'hole-key',
      })],
      deleteKeys: [],
    });
  });

  it('corrects a human override in place and removes vacated or migrated keys', async () => {
    h.readEliminationEvidence.mockResolvedValueOnce({
      canEdit: true,
      signatures: [signature({
        wormholeTypeCode: 'B274',
        typeProvenance: 'human',
        observationKey: 'hole-key',
      })],
      connections: [],
    });
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'quiet' }] });
    expect(h.applyEliminationDeductions).not.toHaveBeenCalled();
    expect(h.reconcileWhObservations).toHaveBeenCalledWith(database, {
      upserts: [observationUpsert({
        whTypeCode: 'B274',
        provenance: 'human',
        dedupeKey: 'hole-key',
      })],
      deleteKeys: [],
    });

    h.readEliminationEvidence.mockResolvedValueOnce({
      canEdit: true,
      signatures: [signature({
        wormholeTypeCode: 'K162',
        typeProvenance: 'human',
        observationKey: 'hole-key',
      })],
      connections: [],
    });
    await resolveSignatureElimination(database, 'user-1', request, dependencies);
    expect(h.reconcileWhObservations).toHaveBeenCalledWith(database, {
      upserts: [],
      deleteKeys: ['hole-key'],
    });

    h.readEliminationEvidence.mockResolvedValueOnce({
      canEdit: true,
      signatures: [signature({
        wormholeTypeCode: 'C247',
        typeProvenance: 'human',
        observationKey: 'hole-key',
      })],
      connections: [{
        connectionId: 'connection-1',
        wormholeTypeCode: 'C247',
        linkedSignature: false,
      }],
    });
    h.applyEliminationDeductions.mockResolvedValueOnce([
      { signatureId: 'AAA-111', outcome: 'applied', observationKey: 'hole-key' },
    ]);
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'applied', signatureIds: ['AAA-111'] }] });
    expect(h.reconcileWhObservations).toHaveBeenCalledWith(database, {
      upserts: [],
      deleteKeys: ['hole-key'],
    });
  });

  it('keeps snapshot honesty across protected and stale races', async () => {
    h.applyEliminationDeductions.mockResolvedValueOnce([
      { signatureId: 'AAA-111', outcome: 'protected', observationKey: 'hole-key' },
    ]);
    await resolveSignatureElimination(database, 'user-1', request, dependencies);
    expect(h.reconcileWhObservations).toHaveBeenCalledWith(database, {
      upserts: [],
      deleteKeys: [],
    });

    h.readEliminationEvidence.mockResolvedValueOnce({
      canEdit: true,
      signatures: [signature({
        wormholeTypeCode: 'B274',
        typeProvenance: 'assumed',
        observationKey: 'hole-key',
      })],
      connections: [],
    });
    h.applyEliminationDeductions.mockResolvedValueOnce([
      { signatureId: 'AAA-111', outcome: 'stale', observationKey: null },
    ]);
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'quiet' }] });
    expect(h.reconcileWhObservations).toHaveBeenCalledWith(database, {
      upserts: [observationUpsert({
        whTypeCode: 'B274',
        provenance: 'assumed',
        dedupeKey: 'hole-key',
      })],
      deleteKeys: [],
    });
  });

  it('degrades unavailable statics, still logs human ids, and reports corpus failure without failing apply', async () => {
    h.readSystemStaticsForSystem.mockRejectedValueOnce(new Error('offline'));
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'statics-unavailable' }] });
    expect(h.applyEliminationDeductions).not.toHaveBeenCalled();

    h.readSystemStaticsForSystem.mockResolvedValueOnce([]);
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'statics-unavailable' }] });
    expect(h.applyEliminationDeductions).not.toHaveBeenCalled();

    h.readEliminationEvidence.mockResolvedValueOnce({
      canEdit: true,
      signatures: [signature({
        wormholeTypeCode: 'B274',
        typeProvenance: 'human',
        observationKey: 'hole-key',
      })],
      connections: [],
    });
    h.readSystemStaticsForSystem.mockResolvedValueOnce([]);
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'statics-unavailable' }] });
    expect(h.applyEliminationDeductions).not.toHaveBeenCalled();
    expect(h.reconcileWhObservations).toHaveBeenCalledWith(database, {
      upserts: [observationUpsert({
        whTypeCode: 'B274',
        provenance: 'human',
        dedupeKey: 'hole-key',
      })],
      deleteKeys: [],
    });

    h.reconcileWhObservations.mockRejectedValueOnce(new Error('neon down'));
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'observations-unavailable' }] });
    expect(h.reportEmissionFailure).toHaveBeenCalledTimes(1);
  });

  it('retries failed observation persistence when no Convex deduction is needed', async () => {
    h.readEliminationEvidence.mockResolvedValue({
      canEdit: true,
      signatures: [signature({
        wormholeTypeCode: 'B274',
        typeProvenance: 'human',
        observationKey: 'hole-key',
      })],
      connections: [],
    });
    h.reconcileWhObservations.mockRejectedValueOnce(new Error('neon down'));
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'observations-unavailable' }] });
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'quiet' }] });
    expect(h.reconcileWhObservations).toHaveBeenCalledTimes(2);
    expect(h.applyEliminationDeductions).not.toHaveBeenCalled();
  });

  it('stays quiet without edit access or when a concurrent write already converged', async () => {
    h.readEliminationEvidence.mockResolvedValueOnce({
      canEdit: false,
      signatures: [],
      connections: [],
    });
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'quiet' }] });
    expect(h.readSystemStaticsForSystem).not.toHaveBeenCalled();
    expect(h.getWormholeCodex).not.toHaveBeenCalled();

    h.applyEliminationDeductions.mockResolvedValueOnce([
      { signatureId: 'AAA-111', outcome: 'unchanged', observationKey: 'hole-key' },
    ]);
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ results: [{ systemId: SYSTEM, status: 'quiet' }] });
  });

  it('loads the wormhole codex once for a two-system request', async () => {
    const far = 31_000_002;
    h.readEliminationEvidence
      .mockResolvedValueOnce({
        canEdit: true,
        signatures: [signature()],
        connections: [],
      })
      .mockResolvedValueOnce({
        canEdit: true,
        signatures: [signature({
          wormholeTypeCode: 'B274',
          typeProvenance: 'human',
          observationKey: 'far-key',
        })],
        connections: [],
      });
    h.applyEliminationDeductions.mockResolvedValueOnce([
      { signatureId: 'AAA-111', outcome: 'applied', observationKey: 'hole-key' },
    ]);
    await expect(
      resolveSignatureElimination(
        database,
        'user-1',
        { mapId: 'map-1', systemIds: [SYSTEM, far] },
        dependencies,
      ),
    ).resolves.toEqual({
      results: [
        { systemId: SYSTEM, status: 'applied', signatureIds: ['AAA-111'] },
        { systemId: far, status: 'quiet' },
      ],
    });
    expect(h.getWormholeCodex).toHaveBeenCalledOnce();
    expect(h.readEliminationEvidence).toHaveBeenCalledTimes(2);
    expect(h.readSystemStaticsForSystem).toHaveBeenCalledTimes(2);
  });

  it('reuses the codex and processes the second system after the first write fails', async () => {
    const secondSystem = 31_000_002;
    const failure = new Error('deduction write failed');
    h.applyEliminationDeductions.mockRejectedValueOnce(failure);

    await expect(
      resolveSignatureElimination(
        database,
        'user-1',
        { mapId: 'map-1', systemIds: [SYSTEM, secondSystem] },
        dependencies,
      ),
    ).rejects.toBe(failure);

    expect(h.getWormholeCodex).toHaveBeenCalledOnce();
    expect(h.applyEliminationDeductions).toHaveBeenCalledTimes(2);
    expect(h.applyEliminationDeductions).toHaveBeenLastCalledWith(
      expect.objectContaining({ systemId: secondSystem }),
    );
    expect(h.reconcileWhObservations).toHaveBeenCalledOnce();
    expect(h.reconcileWhObservations).toHaveBeenCalledWith(database, {
      upserts: [expect.objectContaining({ solarSystemId: secondSystem })],
      deleteKeys: [],
    });
  });
});
