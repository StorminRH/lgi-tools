import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { NoMapAccess } from './NoMapAccess';

it('leads with lost-access copy, an ISK-green salute, and the two ways back', () => {
  const markup = renderToStaticMarkup(createElement(NoMapAccess));

  expect(markup).toContain('data-chain-no-access');
  expect(markup).not.toMatch(/<button/i);
  expect(markup).not.toMatch(/loading/i);
  expect(markup).toMatch(/<h2[^>]*>\s*You[^<]*lost access to this map/);
  const heading = /<h2[^>]*class="([^"]*)"/.exec(markup);
  expect(heading, 'the lost-access heading must be an h2 with classes').not.toBeNull();
  expect(heading?.[1]?.split(/\s+/)).not.toContain('uppercase');
  expect(markup).not.toContain('O7');
  expect(markup).toMatch(/<span class="text-isk">o7<\/span>/);
  expect(markup).toContain(`map\u00a0<span class="text-isk">o7</span>`);
  expect(markup).toContain('Another map can be opened from the atlas');
  expect(markup).toContain('access can be restored by the');
  expect(markup).not.toMatch(/access lost/i);
});
