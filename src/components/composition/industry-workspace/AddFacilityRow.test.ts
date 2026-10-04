import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('@/data/eve-data/stations-search', () => ({
  loadStations: async () => [],
  matchStations: () => [],
}));

import type { AvailableStructure } from '@/features/industry-planner/types';
import { AddFacilityRow } from './AddFacilityRow';

function render(over: Partial<Parameters<typeof AddFacilityRow>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(AddFacilityRow, {
      structures: [] as AvailableStructure[],
      taken: new Set<string>(),
      describe: () => null,
      onAdd: vi.fn(),
      onNewStructure: vi.fn(),
      full: false,
      ...over,
    }),
  );
}

test('the list ends in a search across everything, then a structure picker and a station search', () => {
  const html = render();
  expect(html).toContain('placeholder="Add a facility"');
  expect(html).toContain('aria-label="Add a structure"');
  expect(html).toContain('data-structures-trigger');
  expect(html).toContain('>Structure<');
  expect(html).toContain('>Station<');
  expect(html).not.toContain('disabled=""');
});

test('a full profile takes nothing more, and nothing is offered before structures load', () => {
  const full = render({ full: true });
  expect(full).toContain('placeholder="Facility limit reached"');
  expect(full).toMatch(/<button[^>]* disabled=""[^>]*>(?:(?!<\/button>).)*Station/);

  const loading = render({ structures: null });
  expect(loading).toMatch(/<input[^>]* disabled=""/);
  expect(loading).toMatch(/<button[^>]* disabled=""[^>]*>(?:(?!<\/button>).)*Station/);
});
