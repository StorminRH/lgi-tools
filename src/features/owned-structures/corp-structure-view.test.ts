import { describe, it, expect } from 'vitest';
import { deriveCorpCardView, deriveCorpStructureItemView, managedCorps } from './corp-structure-view';
import type { StructureRigOption, StructureTypeOption } from '@/data/eve-data/structures';
import type { CorpStructurePageStructure, CorpStructurePageView } from './types';

const AZBEL: StructureTypeOption = { typeId: 35827, name: 'Azbel', groupId: 1404, rigSize: 3 };
const L_RIG: StructureRigOption = { typeId: 1, name: 'L Rig', canFitGroups: [1404], rigSize: 3 };
const M_RIG: StructureRigOption = { typeId: 2, name: 'M Rig', canFitGroups: [1404], rigSize: 2 };

function structure(overrides: Partial<CorpStructurePageStructure>): CorpStructurePageStructure {
  return {
    structureId: 100,
    typeId: 35827,
    systemId: 30000142,
    securityClass: 'highsec' as CorpStructurePageStructure['securityClass'],
    name: 'Corp Azbel',
    rigTypeIds: [1],
    taxPct: null,
    ...overrides,
  };
}

describe('deriveCorpStructureItemView', () => {
  it('resolves the name and type and keeps only the rigs that fit', () => {
    const view = deriveCorpStructureItemView(structure({ rigTypeIds: [1], taxPct: 2 }), {
      structureTypes: [AZBEL],
      structureRigs: [L_RIG, M_RIG],
    });
    expect(view).toEqual({ typeName: 'Azbel', displayName: 'Corp Azbel', validRigs: [L_RIG] });
  });

  it('falls back to the type id when the type and name are unknown', () => {
    const view = deriveCorpStructureItemView(
      structure({ typeId: 999, name: null, rigTypeIds: [], taxPct: null }),
      { structureTypes: [AZBEL], structureRigs: [L_RIG] },
    );
    expect(view).toEqual({ typeName: 'Type 999', displayName: 'Type 999', validRigs: [] });
  });
});

describe('deriveCorpCardView', () => {
  function corp(overrides: Partial<CorpStructurePageView>): CorpStructurePageView {
    return {
      corporationId: 1,
      corporationName: 'Corp',
      structureAccess: 'manage',
      canManageSharing: false,
      sharing: 'off',
      structures: [],
      lastRefreshedAt: null,
      ...overrides,
    };
  }

  it('says members can pick the structures when sharing is on', () => {
    expect(deriveCorpCardView(corp({ sharing: 'on', structures: [structure({})] }))).toEqual({
      hint: 'sharing on',
      sharingBlurb: 'Members can pick these structures as build locations in the planner.',
      isEmpty: false,
    });
  });

  it('says only managers can pick the structures when sharing is off', () => {
    expect(deriveCorpCardView(corp({ sharing: 'off' }))).toEqual({
      hint: 'sharing off',
      sharingBlurb: 'Sharing is off, so only Station Managers and Directors can pick these structures in the planner.',
      isEmpty: true,
    });
  });

  it('lists only the corps the viewer manages', () => {
    const corps = [
      corp({ corporationId: 1, structureAccess: 'manage' }),
      corp({ corporationId: 2, structureAccess: 'use' }),
      corp({ corporationId: 3, structureAccess: 'none' }),
    ];
    expect(managedCorps(corps).map((c) => c.corporationId)).toEqual([1]);
  });
});
