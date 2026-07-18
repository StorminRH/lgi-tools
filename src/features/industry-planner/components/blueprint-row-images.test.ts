import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SavedPlanRow } from '../api-contract';
import type { RecentBlueprint } from '../recent-blueprints';
import { RecentBlueprintRows } from './RecentBlueprintRows';
import { SavedBuildTiles } from './SavedBuildTiles';
import { SavedPlanRowItem } from './SavedPlanRowItem';

const recent: RecentBlueprint = {
  typeId: 691,
  productTypeId: 587,
  name: 'Rifter',
};

const saved: SavedPlanRow = {
  id: 'plan-1',
  name: 'Rifter plan',
  favorite: false,
  blueprintTypeId: 691,
  productTypeId: 587,
  productName: 'Rifter',
  snapshot: { v: 1, blueprintTypeId: 691 },
  updatedAt: '2026-07-18T00:00:00Z',
};

function expectBlueprintImage(markup: string): void {
  expect(markup).toContain('/types/691/bp?size=32');
  expect(markup).not.toContain('/types/587/icon');
}

describe('blueprint-list row images', () => {
  it('renders the blueprint scroll for industry recents and saved-build tiles', () => {
    expectBlueprintImage(
      renderToStaticMarkup(createElement(RecentBlueprintRows, { recent: [recent] })),
    );
    expectBlueprintImage(
      renderToStaticMarkup(createElement(SavedBuildTiles, { plans: [saved] })),
    );
  });

  it('renders the blueprint scroll for planner saved-plan rows', () => {
    expectBlueprintImage(
      renderToStaticMarkup(
        createElement(SavedPlanRowItem, {
          row: saved,
          busy: false,
          armed: false,
          editing: false,
          onLoad: () => {},
          onFavorite: () => {},
          onStartRename: () => {},
          onCommitRename: () => {},
          onDelete: () => {},
        }),
      ),
    );
  });
});
