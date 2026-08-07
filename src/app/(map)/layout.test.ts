import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MapLayout, { MapAccessGate } from './layout';

const mocks = vi.hoisted(() => ({
  checkAdmin: vi.fn(),
  rethrow: vi.fn(),
}));

vi.mock('@/platform/auth/route-guards', () => ({
  checkAdmin: mocks.checkAdmin,
}));

// The gate delegates framework-signal handling to next/navigation's
// unstable_rethrow: a no-op stub leaves a genuine failure to fail closed to the
// wall, a throwing stub stands in for a real PPR/redirect signal.
vi.mock('next/navigation', () => ({
  unstable_rethrow: (err: unknown) => mocks.rethrow(err),
}));

vi.mock('@/components/composition/map/MapChrome', () => ({
  MapChrome: ({
    session: value,
    contextualSection,
  }: {
    session: unknown;
    contextualSection?: React.ReactNode;
  }) =>
    createElement('div', {
      'data-map-chrome': '',
      'data-map-account-session': String(value != null),
      'data-map-contextual-section': String(contextualSection != null),
    }),
}));

const session = {
  characterId: 1,
  name: 'Mapper',
  portraitUrl: '/portrait.png',
  role: 'ADMIN',
};

describe('MapAccessGate', () => {
  beforeEach(() => {
    mocks.checkAdmin.mockReset();
    mocks.rethrow.mockReset();
  });

  // Restores the console spies unconditionally: a manual restore at the end of a
  // test body is skipped when an assertion above it throws, leaving the stub
  // active and hiding later diagnostics.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the development wall without the canvas for a non-admin', async () => {
    mocks.checkAdmin.mockResolvedValue({ ok: false, failure: { code: 'forbidden' } });

    const result = await MapAccessGate({
      children: createElement('div', { 'data-map-canvas': '' }),
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain('data-map-development-wall');
    expect(markup).toContain('under development');
    expect(markup).not.toContain('data-map-canvas');
    expect(markup).not.toContain('data-map-chrome');
  });

  it('renders floating chrome and the canvas subtree for an admin', async () => {
    mocks.checkAdmin.mockResolvedValue({ ok: true, session });

    const result = await MapAccessGate({
      children: createElement('div', { 'data-map-canvas': '' }),
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain('data-map-chrome');
    expect(markup).toContain('data-map-contextual-section="true"');
    expect(markup).toContain('data-map-canvas');
    expect(markup).not.toContain('data-map-development-wall');
  });

  it('keeps the canvas available when an authorized user has no active character', async () => {
    mocks.checkAdmin.mockResolvedValue({
      ok: true,
      session: { ...session, characterId: null },
    });

    const result = await MapAccessGate({
      children: createElement('div', { 'data-map-canvas': '' }),
    });
    const markup = renderToStaticMarkup(result);

    expect(markup).toContain('data-map-chrome');
    expect(markup).toContain('data-map-account-session="false"');
    expect(markup).toContain('data-map-canvas');
    expect(markup).not.toContain('data-map-development-wall');
  });

  it('fails closed to the wall when the authorization check itself throws', async () => {
    const err = new Error('session store unavailable');
    mocks.checkAdmin.mockRejectedValue(err);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await MapAccessGate({
      children: createElement('div', { 'data-map-canvas': '' }),
    });
    const markup = renderToStaticMarkup(result);

    // error.tsx covers a segment's children, not its own layout, so an escaping
    // throw here would leave the map without its recovery surface.
    expect(markup).toContain('data-map-development-wall');
    expect(markup).not.toContain('data-map-canvas');
    expect(markup).not.toContain('data-map-chrome');
    expect(mocks.rethrow).toHaveBeenCalledWith(err);
    expect(consoleError).toHaveBeenCalledWith(
      '[map] authorization check unavailable',
      err,
    );
  });

  it('re-throws a framework control-flow signal instead of walling it', async () => {
    const signal = new Error('NEXT_REDIRECT');
    mocks.checkAdmin.mockRejectedValue(signal);
    mocks.rethrow.mockImplementation((err: unknown) => {
      throw err;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      MapAccessGate({ children: createElement('div', { 'data-map-canvas': '' }) }),
    ).rejects.toBe(signal);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('MapLayout', () => {
  it('owns the full viewport frame and clips canvas overflow', () => {
    const frame = MapLayout({
      children: createElement('div', { 'data-map-canvas': '' }),
    });

    expect(frame.props.className).toContain('relative');
    expect(frame.props.className).toContain('h-[100dvh]');
    expect(frame.props.className).toContain('w-full');
    expect(frame.props.className).toContain('overflow-hidden');
  });
});
