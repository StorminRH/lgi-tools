import { describe, it, expect } from 'vitest';
import {
  buildCreateStructurePayload,
  canReadFit,
  deriveBuilderView,
  deriveSavedRowView,
  readyBuildInput,
  resolveFitName,
  slotsFromParsedFit,
} from './custom-structure-view';
import type { StructureRigOption, StructureTypeOption } from '@/data/eve-data/structures';
import type { SystemSearchEntry } from '@/data/eve-data/systems-search';
import type { CustomStructureRow } from './types';

const AZBEL: StructureTypeOption = { typeId: 35827, name: 'Azbel', groupId: 1404, rigSize: 3 };
const RAITARU: StructureTypeOption = { typeId: 35825, name: 'Raitaru', groupId: 1404, rigSize: 2 };
// A large manufacturing rig — fits the Azbel (group 1404, size 3), not the Raitaru (size 2).
const LARGE_RIG: StructureRigOption = { typeId: 1, name: 'L Rig', canFitGroups: [1404, 1406, 1657], rigSize: 3 };
const MED_RIG: StructureRigOption = { typeId: 2, name: 'M Rig', canFitGroups: [1404], rigSize: 2 };

describe('deriveBuilderView', () => {
  it('selects the structure and keeps only rigs that fit it', () => {
    const view = deriveBuilderView({
      structureTypeId: 35827,
      structureTypes: [AZBEL, RAITARU],
      structureRigs: [LARGE_RIG, MED_RIG],
      name: 'My Azbel',
      busy: false,
    });
    expect(view.structure).toBe(AZBEL);
    expect(view.validRigs).toEqual([LARGE_RIG]); // only the L rig fits the Azbel
    expect(view.canSave).toBe(true);
  });

  it('no structure chosen → null structure, empty rigs, cannot save', () => {
    const view = deriveBuilderView({
      structureTypeId: null,
      structureTypes: [AZBEL],
      structureRigs: [LARGE_RIG],
      name: 'x',
      busy: false,
    });
    expect(view.structure).toBeNull();
    expect(view.validRigs).toEqual([]);
    expect(view.canSave).toBe(false);
  });
});

describe('readyBuildInput', () => {
  it('returns the trimmed name + id when ready', () => {
    expect(readyBuildInput(5, '  Name  ', false)).toEqual({ structureTypeId: 5, name: 'Name' });
  });
  it('returns null when no type, blank name, or busy', () => {
    expect(readyBuildInput(null, 'Name', false)).toBeNull();
    expect(readyBuildInput(5, '   ', false)).toBeNull();
    expect(readyBuildInput(5, 'Name', true)).toBeNull();
  });
});

describe('buildCreateStructurePayload', () => {
  it('drops empty rig slots, resolves the pin id, and carries the tax', () => {
    expect(
      buildCreateStructurePayload({
        structureTypeId: 35827,
        name: 'My Azbel',
        rigSlots: [1, null, 2],
        pin: { id: 30000142 },
        taxValue: 1.5,
      }),
    ).toEqual({
      name: 'My Azbel',
      structureTypeId: 35827,
      rigTypeIds: [1, 2],
      systemId: 30000142,
      taxPct: 1.5,
    });
  });

  it('portable (no pin) → null systemId; null tax stays null', () => {
    const p = buildCreateStructurePayload({
      structureTypeId: 1,
      name: 'x',
      rigSlots: [],
      pin: null,
      taxValue: null,
    });
    expect(p.systemId).toBeNull();
    expect(p.taxPct).toBeNull();
  });
});

describe('canReadFit', () => {
  it('true only for non-blank text while not busy', () => {
    expect(canReadFit('[Azbel]', false)).toBe(true);
    expect(canReadFit('   ', false)).toBe(false);
    expect(canReadFit('', false)).toBe(false);
    expect(canReadFit('[Azbel]', true)).toBe(false);
  });
});

describe('slotsFromParsedFit', () => {
  it('fills fixed slots from a parsed fit, missing rigs → empty slot', () => {
    expect(slotsFromParsedFit([10, 20], [0, 1, 2])).toEqual([10, 20, null]);
  });
});

describe('resolveFitName', () => {
  const names = new Map([[35827, 'Azbel']]);
  it('keeps the user name when they typed one', () => {
    expect(resolveFitName('Mine', 35827, names)).toBe('Mine');
  });
  it('falls back to the type name (or empty) when the name is blank', () => {
    expect(resolveFitName('   ', 35827, names)).toBe('Azbel');
    expect(resolveFitName('', 999, names)).toBe('');
  });
});

describe('deriveSavedRowView', () => {
  const typeName = new Map([[35827, 'Azbel']]);
  const rigName = new Map([[1, 'L Rig']]);
  const systems: SystemSearchEntry[] = [{ id: 30000142, name: 'Jita', security: 0.9 }];

  function row(overrides: Partial<CustomStructureRow>): CustomStructureRow {
    return { id: 'a', name: 'Build', structureTypeId: 35827, rigTypeIds: [1], systemId: null, taxPct: null, ...overrides };
  }

  it('labels type + rigs and reports no-rigs / pin / tax states', () => {
    const view = deriveSavedRowView(row({ systemId: 30000142, taxPct: 2 }), { typeName, rigName, systems });
    expect(view.typeLabel).toBe('Azbel');
    expect(view.rigLabels).toEqual([{ key: 1, label: 'L Rig' }]);
    expect(view.hasNoRigs).toBe(false);
    expect(view.isPinned).toBe(true);
    expect(view.pinLabel).toContain('Jita');
    expect(view.taxLabel).toBe('tax 2%');
  });

  it('portable, rig-less, tax-less row → falls back to ids and null labels', () => {
    const view = deriveSavedRowView(row({ rigTypeIds: [], structureTypeId: 999 }), { typeName, rigName, systems });
    expect(view.typeLabel).toBe('Type 999');
    expect(view.hasNoRigs).toBe(true);
    expect(view.isPinned).toBe(false);
    expect(view.pinLabel).toBeNull();
    expect(view.taxLabel).toBeNull();
  });
});
