import { describe, it, expect } from 'vitest';
import { deriveCorpCardView, deriveCorpStructureItemView } from './corp-structure-view';
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
  it('resolves name/type/rig labels, keeps fitting rigs, and reports hasDetails', () => {
    const view = deriveCorpStructureItemView(structure({ rigTypeIds: [1], taxPct: 2 }), {
      structureTypes: [AZBEL],
      structureRigs: [L_RIG, M_RIG],
    });
    expect(view.typeName).toBe('Azbel');
    expect(view.displayName).toBe('Corp Azbel');
    expect(view.validRigs).toEqual([L_RIG]); // only the L rig fits
    expect(view.rigLabels).toEqual([{ key: 1, label: 'L Rig' }]);
    expect(view.taxLabel).toBe('tax 2%');
    expect(view.hasDetails).toBe(true);
  });

  it('falls back to type id / structure display and reports no details when empty', () => {
    const view = deriveCorpStructureItemView(
      structure({ typeId: 999, name: null, rigTypeIds: [], taxPct: null }),
      { structureTypes: [AZBEL], structureRigs: [L_RIG] },
    );
    expect(view.typeName).toBe('Type 999');
    expect(view.displayName).toBe('Type 999'); // name null → type name
    expect(view.validRigs).toEqual([]); // unknown type → no fitting rigs
    expect(view.taxLabel).toBeNull();
    expect(view.hasDetails).toBe(false);
  });
});

describe('deriveCorpCardView', () => {
  function corp(overrides: Partial<CorpStructurePageView>): CorpStructurePageView {
    return {
      corporationId: 1,
      corporationName: 'Corp',
      isStationManager: false,
      sharingEnabled: false,
      structures: [],
      lastRefreshedAt: null,
      ...overrides,
    };
  }

  it('manager with sharing on: hint on, note shown with a period, structures visible', () => {
    const view = deriveCorpCardView(corp({ isStationManager: true, sharingEnabled: true, structures: [structure({})] }));
    expect(view.hint).toBe('sharing on');
    expect(view.showManagerNote).toBe(true);
    expect(view.managerBlurb).toBe('.');
    expect(view.showStructures).toBe(true);
    expect(view.isEmpty).toBe(false);
  });

  it('manager with sharing off: enable prompt, structures hidden', () => {
    const view = deriveCorpCardView(corp({ isStationManager: true, sharingEnabled: false }));
    expect(view.hint).toBe('sharing off');
    expect(view.managerBlurb).toContain('turn it on');
    expect(view.showStructures).toBe(false);
  });

  it('non-manager member of a shared corp: "shared" hint, no manager note', () => {
    const view = deriveCorpCardView(corp({ isStationManager: false, sharingEnabled: true }));
    expect(view.hint).toBe('shared');
    expect(view.showManagerNote).toBe(false);
    expect(view.showStructures).toBe(true);
  });
});
