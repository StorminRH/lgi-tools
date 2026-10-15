import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { LevelRows } from './LevelRows';

test('LevelRows speaks each verdict, colours only a problem value, and draws a note only when there is one', () => {
  const html = renderToStaticMarkup(
    createElement(LevelRows, {
      lines: [
        { id: 'cron', label: 'Price cron', value: 'failing', note: 'failed 3h ago', level: 'red' },
        { id: 'queue', label: 'Held for budget', value: '0 jobs', level: 'green' },
      ],
    }),
  );
  const [failing, healthy] = html.split('</li>');

  expect(html).toMatch(/^<ul><li /);
  expect(failing).toContain('>Price cron</span>');
  expect(failing).toContain('<span class="sr-only">Critical</span>');
  expect(failing).toContain('text-tone-red">failing</span>');
  expect(failing).toContain('>failed 3h ago</span>');
  expect(healthy).toContain('>Held for budget</span>');
  expect(healthy).toContain('<span class="sr-only">Healthy</span>');
  expect(healthy).toContain('text-name">0 jobs</span>');
  expect(healthy).not.toContain('text-micro');
});
