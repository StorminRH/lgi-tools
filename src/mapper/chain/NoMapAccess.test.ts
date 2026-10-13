import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { NoMapAccess } from './NoMapAccess';

it('leads with no-access copy, an ISK-green salute, and the two ways back', () => {
  const markup = renderToStaticMarkup(createElement(NoMapAccess));

  expect(markup).toContain('data-chain-no-access');
  expect(markup).not.toMatch(/<button/i);
  expect(markup).not.toMatch(/loading/i);
  expect(markup).toMatch(/<h2[^>]*>\s*You don’t have access to this map/);
  const heading = /<h2[^>]*class="([^"]*)"/.exec(markup);
  expect(heading, 'the no-access heading must be an h2 with classes').not.toBeNull();
  expect(heading?.[1]?.split(/\s+/)).not.toContain('uppercase');
  expect(markup).not.toContain('O7');
  expect(markup).toMatch(/<span class="text-isk">o7<\/span>/);
  expect(markup).toContain(`map\u00a0<span class="text-isk">o7</span>`);
  expect(markup).toContain('Open another map, or ask a map admin for access.');
  expect(markup).not.toContain('Atlas · access');
  expect(markup).not.toMatch(/lost access|access lost/i);
});
