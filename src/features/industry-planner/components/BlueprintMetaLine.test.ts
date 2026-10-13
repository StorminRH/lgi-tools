import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { BlueprintMetaLine } from './BlueprintMetaLine';

const line = (group: string, activity: string | null, perRun: number) =>
  renderToStaticMarkup(createElement(BlueprintMetaLine, { group, activity, perRun }));
const text = (html: string) => html.replace(/<[^>]+>/g, '');

test('the meta line reads group, activity and one run’s output, dropping a missing part and an activity that repeats the group', () => {
  const full = line('Frigate', 'Manufacturing', 1_500);
  expect(text(full)).toBe('Frigate·Manufacturing·1,500 per run');
  expect(full).toContain('<span class="text-tone-blue">Manufacturing</span>');

  expect(text(line('', 'Manufacturing', 1))).toBe('Manufacturing·1 per run');
  expect(text(line('Capital Component', null, 2))).toBe('Capital Component·2 per run');
  expect(text(line('Reaction', 'Reaction', 40))).toBe('Reaction·40 per run');
});
