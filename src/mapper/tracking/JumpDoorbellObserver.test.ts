import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { JumpDoorbellObserver } from './JumpDoorbellObserver';

const mocks = vi.hoisted(() => ({
  liveValue: vi.fn(),
}));

vi.mock('@/data/convex/use-live-value', () => ({
  useLiveValue: (...args: unknown[]) => mocks.liveValue(...args),
}));

vi.mock('../jump-client', () => ({
  postJumpRequest: vi.fn(),
}));

describe('JumpDoorbellObserver', () => {
  it('renders nothing and joins the shared forMap tracking subscription', () => {
    mocks.liveValue.mockReturnValue(undefined);
    const markup = renderToStaticMarkup(
      createElement(JumpDoorbellObserver, { mapId: 'map-a' }),
    );
    expect(markup).toBe('');

    expect(mocks.liveValue).toHaveBeenCalledWith(
      expect.anything(),
      { mapId: 'map-a' },
    );
  });
});
