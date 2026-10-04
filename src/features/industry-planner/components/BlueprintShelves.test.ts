import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  recent: null as { typeId: number; productTypeId: number; name: string }[] | null,
  favorites: null as { typeId: number; name: string }[] | null,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, transitionTypes, ...props }: { href: string; children: ReactNode; transitionTypes?: string[] }) =>
    createElement('a', { ...props, href, 'data-transition': transitionTypes?.join(' ') }, children),
}));
vi.mock('../recent-blueprints', () => ({ useRecentBlueprints: () => h.recent }));
vi.mock('../favorite-blueprints', () => ({ useFavoriteBlueprints: () => ({ favorites: h.favorites, toggle: vi.fn() }) }));

import { BlueprintShelves } from './BlueprintShelves';

const render = () => renderToStaticMarkup(createElement(BlueprintShelves));
const shelf = (html: string, label: string) => html.split(`aria-label="${label}"`)[1]!.split('</section>')[0]!;

beforeEach(() => {
  h.recent = null;
  h.favorites = null;
});

test('recents and favorites sit side by side, each loading until read', () => {
  const html = render();
  expect(html.indexOf('>Recents<')).toBeLessThan(html.indexOf('>Favorites<'));
  expect(shelf(html, 'Recents')).toContain('aria-label="Loading recents"');
  expect(shelf(html, 'Favorites')).toContain('aria-label="Loading favorites"');
});

test('each blueprint links into the planner with the section transition', () => {
  h.recent = [{ typeId: 2047, productTypeId: 2046, name: 'Damage Control I' }];
  h.favorites = [{ typeId: 691, name: 'Rifter' }, { typeId: 2049, name: 'Damage Control II' }];
  const html = render();
  expect(shelf(html, 'Recents')).toMatch(/<a [^>]*href="\/industry\/2047" data-transition="industry-tab">.*Damage Control I</);
  const favorites = shelf(html, 'Favorites');
  expect(favorites.indexOf('/industry/691')).toBeLessThan(favorites.indexOf('/industry/2049'));
  expect(favorites).toContain('Damage Control II');
  expect(html).not.toContain('Loading');
});

test('an empty shelf says so', () => {
  h.recent = [];
  h.favorites = [];
  const html = render();
  expect(shelf(html, 'Recents')).toContain('No recent blueprints');
  expect(shelf(html, 'Favorites')).toContain('No favorite blueprints');
});
