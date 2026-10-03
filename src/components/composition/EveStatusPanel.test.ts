import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { EveStatusPanel, EveStatusPanelFallback } from './EveStatusPanel';

test('EveStatusPanel lists each section under its heading, colouring only problems', () => {
  const html = renderToStaticMarkup(
    createElement(EveStatusPanel, {
      sections: [
        { heading: 'ESI', rows: [{ label: 'Error budget', value: 'Paused', level: 'red' }] },
        { heading: 'Static data', rows: [{ label: 'Build', value: '3569502', level: 'green' }] },
      ],
    }),
  );
  expect(html).toContain('ESI');
  expect(html).toContain('Static data');
  expect(html).toMatch(/class="text-tone-red">Paused/);
  expect(html).toContain('<span>3569502</span>');

  expect(renderToStaticMarkup(createElement(EveStatusPanelFallback))).toContain(
    'aria-label="Loading EVE status"',
  );
});
