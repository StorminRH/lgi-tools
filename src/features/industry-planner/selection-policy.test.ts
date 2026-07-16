import {
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
} from '@/data/eve-data/constants';
import { describe, expect, it } from 'vitest';
import {
  buildSelectionVacatesReaction,
  isReactionNetAvailable,
  selectReactionLocation,
  type ReactionLocationSnapshot,
} from './selection-policy';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from './structure-bonus';
import type { AvailableStructure } from './types';

function structure(id: string, groupId = SDE_REFINERY_GROUP_ID): AvailableStructure {
  return { id, groupId } as AvailableStructure;
}

const FETCHED: ReactionLocationSnapshot = {
  systemId: 30_000_142,
  blueprintTypeId: 46157,
  costIndex: 0.04,
  adjustedPrices: new Map([[34, 5.2]]),
};

describe('buildSelectionVacatesReaction', () => {
  it('vacates the reaction slot when the same structure is selected for building', () => {
    expect(buildSelectionVacatesReaction(structure('same'), structure('same'))).toBe(true);
  });

  it('keeps an unrelated reaction structure selected', () => {
    expect(buildSelectionVacatesReaction(structure('build'), structure('reaction'))).toBe(false);
  });

  it('does nothing when either slot is empty', () => {
    expect(buildSelectionVacatesReaction(null, structure('reaction'))).toBe(false);
    expect(buildSelectionVacatesReaction(structure('build'), null)).toBe(false);
  });
});

describe('selectReactionLocation', () => {
  it('returns the fetched location when every query key matches', () => {
    expect(
      selectReactionLocation({
        activityId: REACTION_ACTIVITY,
        blueprintTypeId: FETCHED.blueprintTypeId,
        reactionSystemId: FETCHED.systemId,
        fetched: FETCHED,
      }),
    ).toBe(FETCHED);
  });

  it.each([
    ['manufacturing activity', MANUFACTURING_ACTIVITY, FETCHED.blueprintTypeId, FETCHED.systemId],
    ['blueprint mismatch', REACTION_ACTIVITY, 999, FETCHED.systemId],
    ['system mismatch', REACTION_ACTIVITY, FETCHED.blueprintTypeId, 30_002_187],
    ['cleared system', REACTION_ACTIVITY, FETCHED.blueprintTypeId, null],
  ])('returns null for a %s', (_label, activityId, blueprintTypeId, reactionSystemId) => {
    expect(
      selectReactionLocation({
        activityId,
        blueprintTypeId,
        reactionSystemId,
        fetched: FETCHED,
      }),
    ).toBeNull();
  });

  it('returns null before a location has been fetched', () => {
    expect(
      selectReactionLocation({
        activityId: REACTION_ACTIVITY,
        blueprintTypeId: FETCHED.blueprintTypeId,
        reactionSystemId: FETCHED.systemId,
        fetched: null,
      }),
    ).toBeNull();
  });
});

describe('isReactionNetAvailable', () => {
  it('accepts a matching dedicated reaction location', () => {
    expect(
      isReactionNetAvailable({
        activityId: REACTION_ACTIVITY,
        reactionLocation: FETCHED,
        buildStructure: null,
        hasBuildLocation: false,
      }),
    ).toBe(true);
  });

  it('accepts a build-slot refinery only when its build location exists', () => {
    const refinery = structure('refinery');
    expect(
      isReactionNetAvailable({
        activityId: REACTION_ACTIVITY,
        reactionLocation: null,
        buildStructure: refinery,
        hasBuildLocation: true,
      }),
    ).toBe(true);
    expect(
      isReactionNetAvailable({
        activityId: REACTION_ACTIVITY,
        reactionLocation: null,
        buildStructure: refinery,
        hasBuildLocation: false,
      }),
    ).toBe(false);
  });

  it('rejects a non-refinery build structure', () => {
    expect(
      isReactionNetAvailable({
        activityId: REACTION_ACTIVITY,
        reactionLocation: null,
        buildStructure: structure('engineering-complex', SDE_ENGINEERING_COMPLEX_GROUP_ID),
        hasBuildLocation: true,
      }),
    ).toBe(false);
  });

  it('is always false for a manufacturing blueprint', () => {
    expect(
      isReactionNetAvailable({
        activityId: MANUFACTURING_ACTIVITY,
        reactionLocation: FETCHED,
        buildStructure: structure('refinery'),
        hasBuildLocation: true,
      }),
    ).toBe(false);
  });
});
