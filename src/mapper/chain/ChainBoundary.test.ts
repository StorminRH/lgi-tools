import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChainBoundary, isForbiddenError, NoMapAccess } from './ChainBoundary';

function convexStyleError(code: string): Error {
  const error = new Error(`ConvexError: ${code}`);
  return Object.assign(error, { data: { code } });
}

/** Drives the boundary's decision directly: the server renderer does not run error boundaries. */
function renderAfterCatching(error: unknown) {
  const boundary = new ChainBoundary({ children: 'chain host' });
  boundary.state = ChainBoundary.getDerivedStateFromError(error);
  return boundary.render();
}

describe('FORBIDDEN identification', () => {
  it('recognises the gate’s rejection by its data code', () => {
    expect(isForbiddenError(convexStyleError('FORBIDDEN'))).toBe(true);
  });

  it.each([
    ['a different ConvexError code', convexStyleError('UNAUTHENTICATED')],
    ['a plain error', new Error('network down')],
    ['an error with a non-object data field', Object.assign(new Error('x'), { data: 'FORBIDDEN' })],
    ['a non-error value', { data: { code: 'FORBIDDEN' } }],
    ['null', null],
  ])('does not recognise %s', (_label, value) => {
    expect(isForbiddenError(value)).toBe(false);
  });
});

// ── SC-4 · DC-4 / AC-4 — the calm state, and only for FORBIDDEN ─────────────
describe('chain boundary', () => {
  it('passes children through when nothing has failed', () => {
    const boundary = new ChainBoundary({ children: 'chain host' });

    expect(boundary.render()).toBe('chain host');
  });

  it('renders the calm no-access state for a FORBIDDEN rejection', () => {
    const rendered = renderAfterCatching(convexStyleError('FORBIDDEN'));

    expect(rendered).toEqual(createElement(NoMapAccess));
  });

  it('rethrows every other error so the map error surface handles it', () => {
    const other = convexStyleError('UNAUTHENTICATED');

    expect(() => renderAfterCatching(other)).toThrow(other);
  });

  it('rethrows a plain transport failure', () => {
    expect(() => renderAfterCatching(new Error('websocket closed'))).toThrow(
      'websocket closed',
    );
  });
});

describe('calm no-access state', () => {
  const markup = renderToStaticMarkup(createElement(NoMapAccess));

  it('explains that access is no longer held', () => {
    expect(markup).toContain('data-chain-no-access');
    expect(markup).toContain('Access to this map is no longer held');
  });

  // HC-4: no retry control anywhere on the map, including here.
  it('offers no retry, refresh, or reload control', () => {
    expect(markup).not.toMatch(/<button/i);
    expect(markup).not.toMatch(/try again|refresh|reload|retry/i);
  });

  it('shows no spinner or progress affordance', () => {
    expect(markup).not.toMatch(/progressbar|aria-busy|spinner|loading/i);
  });
});
