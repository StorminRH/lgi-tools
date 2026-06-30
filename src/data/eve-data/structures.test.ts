import { describe, expect, it } from 'vitest';
import {
  RIG_MFG_MATERIAL_ATTR,
  RIG_REACTION_TIME_ATTR,
  STRUCTURE_RIG_SIZE_ATTR,
} from './constants';
import { rigFitsStructure, structureRigRole } from './structures';
import type { AttrMap } from './types';

// Real SDE dogma shapes (verified against the local SDE this session).
const equipmentMfgEff: AttrMap = {
  [STRUCTURE_RIG_SIZE_ATTR]: 3, // L
  [RIG_MFG_MATERIAL_ATTR]: -2, // material reduction → a manufacturing rig
  2593: -20, // time
};
const reactorEff: AttrMap = {
  [STRUCTURE_RIG_SIZE_ATTR]: 3,
  [RIG_REACTION_TIME_ATTR]: -20, // reactor time → a reaction rig
  2714: -2, // reaction material (deliberately unread by the bonus math)
};
const copyOptimization: AttrMap = {
  [STRUCTURE_RIG_SIZE_ATTR]: 3,
  [RIG_MFG_MATERIAL_ATTR]: 0, // shares the time/cost attrs but NO material reduction
  2593: -20,
  2595: -10,
};

describe('structureRigRole', () => {
  it('classifies a manufacturing-efficiency rig (nonzero material reduction)', () => {
    expect(structureRigRole(equipmentMfgEff)).toBe('manufacturing');
  });

  it('classifies a reactor-efficiency rig (reactor-time attr present)', () => {
    expect(structureRigRole(reactorEff)).toBe('reaction');
  });

  it('excludes optimization rigs that carry time/cost but no material reduction', () => {
    expect(structureRigRole(copyOptimization)).toBeNull();
  });

  it('excludes a non-industry rig (no relevant attrs)', () => {
    expect(structureRigRole({ [STRUCTURE_RIG_SIZE_ATTR]: 2, 999: 5 })).toBeNull();
  });

  it('treats reaction precedence over manufacturing when both attrs somehow appear', () => {
    expect(
      structureRigRole({ [RIG_REACTION_TIME_ATTR]: -20, [RIG_MFG_MATERIAL_ATTR]: -2 }),
    ).toBe('reaction');
  });
});

describe('rigFitsStructure', () => {
  const azbel = { role: 'manufacturing', rigSize: 3 } as const; // L
  const sotiyo = { role: 'manufacturing', rigSize: 4 } as const; // XL
  const tatara = { role: 'reaction', rigSize: 3 } as const; // L refinery

  it('fits when role + size both match', () => {
    expect(rigFitsStructure({ role: 'manufacturing', rigSize: 3 }, azbel)).toBe(true);
  });

  it('rejects a size mismatch (XL rig on an L structure)', () => {
    expect(rigFitsStructure({ role: 'manufacturing', rigSize: 4 }, azbel)).toBe(false);
  });

  it('rejects a role mismatch (reaction rig on a manufacturing structure)', () => {
    expect(rigFitsStructure({ role: 'reaction', rigSize: 3 }, azbel)).toBe(false);
    expect(rigFitsStructure({ role: 'manufacturing', rigSize: 3 }, tatara)).toBe(false);
  });

  it('matches an XL manufacturing rig to a Sotiyo', () => {
    expect(rigFitsStructure({ role: 'manufacturing', rigSize: 4 }, sotiyo)).toBe(true);
  });
});
