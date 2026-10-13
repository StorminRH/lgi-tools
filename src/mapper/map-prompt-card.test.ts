import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MapPromptCard } from './map-prompt-card';

const BODY_OPEN = '<p class="font-data text-micro text-name">';

it('renders a labelled group with its data attributes, eyebrow, body and actions in order', () => {
  const props: ComponentProps<typeof MapPromptCard> = {
    'data-test-prompt': true,
    'data-prompt-count': 3,
    ariaLabel: 'Missing signatures',
    eyebrow: 'Which character scanned this?',
    body: createElement('span', { 'data-body-part': '' }, '3 missing'),
    children: createElement('button', { 'data-prompt-action': '' }, 'Dismiss'),
  };
  const markup = renderToStaticMarkup(createElement(MapPromptCard, props));

  expect(markup.startsWith('<div ')).toBe(true);
  expect(markup).toContain('role="group"');
  expect(markup).toContain('aria-label="Missing signatures"');
  expect(markup).toContain('data-test-prompt="true"');
  expect(markup).toContain('data-prompt-count="3"');
  expect(markup).toContain('glass-dense');
  expect(markup).toContain(
    `${BODY_OPEN}<span data-body-part="">3 missing</span></p>`,
  );
  const eyebrow = markup.indexOf('Which character scanned this?');
  const body = markup.indexOf(BODY_OPEN);
  const action = markup.indexOf('data-prompt-action');
  expect(eyebrow).toBeGreaterThan(-1);
  expect(eyebrow).toBeLessThan(body);
  expect(body).toBeLessThan(action);
  expect(markup).toContain('tracking-label');
});

it('leaves the eyebrow out when the prompt has none', () => {
  const props: ComponentProps<typeof MapPromptCard> = {
    ariaLabel: 'Choose the wormhole you took',
    body: 'Which wormhole did you take?',
    children: null,
  };
  const markup = renderToStaticMarkup(createElement(MapPromptCard, props));

  expect(markup).toContain(
    'role="group" aria-label="Choose the wormhole you took"',
  );
  expect(markup).not.toContain('tracking-label');
  expect(markup).not.toContain('<span');
  expect(markup).toContain(
    `${BODY_OPEN}Which wormhole did you take?</p>`,
  );
});
