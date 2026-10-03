import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { IndustryProfileRow } from '../profiles/api-contract';
import { emptyProfileDocument } from '../profiles/profile-document';
import { profilePlan } from '../profiles/profile-plan';
import { MANUFACTURING_ACTIVITY } from '../structure-bonus';
import type { BlueprintStructure } from '../types';
import type { BuildSetupValue } from './planner-contexts';

const setup = vi.hoisted(() => ({ value: null as Partial<BuildSetupValue> | null }));
vi.mock('./planner-contexts', () => ({ useBuildSetup: () => setup.value }));

import { ProfilePanel } from './ProfilePanel';

const TOP = 100;
const PART = 200;
const OTHER = 300;
const structure = {
  blueprintTypeId: TOP,
  nodeActivityByBlueprint: { [PART]: MANUFACTURING_ACTIVITY, [OTHER]: MANUFACTURING_ACTIVITY },
} as unknown as BlueprintStructure;

const row = (id: string, name: string): IndustryProfileRow => ({
  id,
  name,
  revision: 1,
  document: emptyProfileDocument([{ characterId: 9001, name: 'Builder' }]),
  updatedAt: '2026-10-02T00:00:00.000Z',
});
const CAPS = row('caps', 'Capital line');

const render = () => renderToStaticMarkup(createElement(ProfilePanel, { structure }));

test('the panel hides without profiles, offers them as a choice, and shows where the build goes', () => {
  setup.value = { profiles: null, profile: null, profilePlan: null, setProfileId: vi.fn() };
  expect(render()).toBe('');
  setup.value = { ...setup.value, profiles: [] };
  expect(render()).toBe('');

  setup.value = { ...setup.value, profiles: [CAPS, row('rx', 'Reactions')] };
  const idle = render();
  expect(idle).toContain('aria-label="Production profile"');
  expect(idle).not.toContain('aria-label="Facilities"');

  const plan = profilePlan({
    facilities: [
      {
        key: 'station:60003760',
        id: '60003760',
        name: 'Jita IV - Moon 4',
        kind: 'station',
        structure: null,
        systemId: 30000142,
        security: 0.95,
        categories: ['ships'],
      },
    ],
    members: [{ characterId: 9001, categories: [], levels: null }],
    nodeActivityByBlueprint: { [TOP]: MANUFACTURING_ACTIVITY, ...structure.nodeActivityByBlueprint },
    nodeFilterIds: { [TOP]: [3], [PART]: [14], [OTHER]: [3] },
    nodeTimeSkills: {},
    topBlueprintTypeId: TOP,
  });
  setup.value = { ...setup.value, profile: CAPS, profilePlan: plan };
  const applied = render();
  expect(applied).toContain('Jita IV - Moon 4');
  expect(applied).toContain('2 jobs');
  // The component job no facility covers is called out.
  expect(applied).toContain('No facility');
  expect(applied).toContain('1 job');
  expect(applied).toContain('Builder');
  expect(applied).toContain('3 jobs');
});
