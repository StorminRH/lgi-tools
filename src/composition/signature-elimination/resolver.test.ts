import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyPgDb } from '@/lib/db-types';
import { eliminateSignatures } from '@/data/maps/signature-eliminator';
import type { SignatureEliminationDependencies } from './resolver';
import { resolveSignatureElimination } from './resolver';

const database = {} as AnyPgDb;
const request = { mapId: 'map-1', systemId: 31_000_001 };
const codex = {
  version: 'test',
  types: [{
    code: 'B274',
    typeId: 1,
    farSide: false as const,
    totalMass: 2_000_000_000,
    maxJumpMass: 300_000_000,
    massRegen: 0,
    lifetimeMinutes: 1_440,
    sizeClass: 'L' as const,
    targetClass: 7,
  }],
};

const h = {
  readEliminationEvidence: vi.fn(),
  applyEliminationDeductions: vi.fn(),
  readSystemStaticsForSystem: vi.fn(),
  getWormholeCodex: vi.fn(),
  eliminateSignatures,
};

const dependencies = h as unknown as SignatureEliminationDependencies;

beforeEach(() => {
  h.readEliminationEvidence.mockReset().mockResolvedValue({
    canEdit: true,
    signatures: [{
      signatureId: 'AAA-111',
      wormholeTypeCode: null,
      typeProvenance: null,
    }],
    connections: [],
  });
  h.applyEliminationDeductions.mockReset().mockResolvedValue([
    { signatureId: 'AAA-111', outcome: 'applied' },
  ]);
  h.readSystemStaticsForSystem.mockReset().mockResolvedValue(['B274']);
  h.getWormholeCodex.mockReset().mockResolvedValue(codex);
});

describe('signature elimination composition', () => {
  it('applies the pure answer-key deduction through one batch door', async () => {
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ status: 'applied', deduced: 1 });
    expect(h.applyEliminationDeductions).toHaveBeenCalledWith({
      userId: 'user-1',
      ...request,
      deductions: [{
        signatureId: 'AAA-111',
        typeCode: 'B274',
        provenance: 'assumed',
      }],
    });
  });

  it('degrades unavailable or absent statics with zero Convex writes', async () => {
    h.readSystemStaticsForSystem.mockRejectedValueOnce(new Error('offline'));
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ status: 'statics-unavailable' });
    expect(h.applyEliminationDeductions).not.toHaveBeenCalled();

    h.readSystemStaticsForSystem.mockResolvedValueOnce([]);
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ status: 'statics-unavailable' });
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
    ).resolves.toEqual({ status: 'quiet' });
    expect(h.readSystemStaticsForSystem).not.toHaveBeenCalled();

    h.applyEliminationDeductions.mockResolvedValueOnce([
      { signatureId: 'AAA-111', outcome: 'unchanged' },
    ]);
    await expect(
      resolveSignatureElimination(database, 'user-1', request, dependencies),
    ).resolves.toEqual({ status: 'quiet' });
  });
});
