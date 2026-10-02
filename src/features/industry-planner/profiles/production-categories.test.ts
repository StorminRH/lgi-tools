import { expect, test } from 'vitest';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from '../structure-bonus';
import { categoryName, coveringOwners, jobCategories } from './production-categories';
import type { CategoryKey } from './production-categories';

// CCP's industry target filters a job can match.
const SHIPS = 3;
const SMALL_T1 = 5;
const CAPITAL = 11;
const EQUIPMENT = 2;
const STRUCTURES = 12;
const COMPONENTS = 14;
const COMPOSITE = 18;

const owner = (name: string, categories: CategoryKey[]) => ({ name, categories });

test('a job falls under its class, then its group, then all manufacturing', () => {
  expect(jobCategories(MANUFACTURING_ACTIVITY, [SHIPS, CAPITAL])).toEqual([
    ['capital-ships'],
    ['ships'],
    ['manufacturing'],
  ]);
  // A ship no class filter names still belongs to ships.
  expect(jobCategories(MANUFACTURING_ACTIVITY, [SHIPS])).toEqual([['ships'], ['manufacturing']]);
  expect(jobCategories(MANUFACTURING_ACTIVITY, [STRUCTURES])).toEqual([['structures'], ['manufacturing']]);
  expect(jobCategories(MANUFACTURING_ACTIVITY, [])).toEqual([['manufacturing']]);
  // Reactions never fall back to manufacturing.
  expect(jobCategories(REACTION_ACTIVITY, [COMPOSITE])).toEqual([['composite-reactions'], ['reactions']]);
  expect(jobCategories(REACTION_ACTIVITY, [])).toEqual([]);
});

test('the most specific covered category decides, and owners at the same level share it', () => {
  const owners = [
    owner('Sotiyo', ['capital-ships']),
    owner('Raitaru', ['manufacturing']),
    owner('Azbel', ['ships', 'components']),
    owner('Second Azbel', ['ships']),
    owner('Tatara', ['reactions']),
  ];
  const names = (activity: number, filterIds: number[]) =>
    coveringOwners(owners, activity, filterIds).map((o) => o.name);

  expect(names(MANUFACTURING_ACTIVITY, [SHIPS, CAPITAL])).toEqual(['Sotiyo']);
  expect(names(MANUFACTURING_ACTIVITY, [SHIPS, SMALL_T1])).toEqual(['Azbel', 'Second Azbel']);
  expect(names(MANUFACTURING_ACTIVITY, [COMPONENTS])).toEqual(['Azbel']);
  expect(names(MANUFACTURING_ACTIVITY, [EQUIPMENT])).toEqual(['Raitaru']);
  expect(names(REACTION_ACTIVITY, [COMPOSITE])).toEqual(['Tatara']);
  expect(coveringOwners([owner('Raitaru', ['manufacturing'])], REACTION_ACTIVITY, [COMPOSITE])).toEqual([]);
});

test('each category reads on its own in a summary', () => {
  expect(['manufacturing', 'ships', 'small-t1-ships', 'components', 'reactions', 'hybrid-reactions'].map((k) =>
    categoryName(k as CategoryKey),
  )).toEqual(['All manufacturing', 'All ships', 'Small T1 ships', 'All components', 'All reactions', 'Hybrid reactions']);
});
