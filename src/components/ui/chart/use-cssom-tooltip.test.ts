import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ ref: { current: null as unknown } }));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => h.ref,
  useLayoutEffect: (effect: () => void) => effect(),
}));

import { useCssomTooltip } from './use-cssom-tooltip';

function rect(width: number, height: number) {
  return { getBoundingClientRect: () => ({ width, height }) };
}

function fakeLayer(parts: { chart?: { width: number; height: number }; box?: { width: number; height: number } }) {
  const setProperty = vi.fn();
  return {
    style: { setProperty },
    parentElement: parts.chart === undefined ? null : rect(parts.chart.width, parts.chart.height),
    firstElementChild: parts.box === undefined ? null : rect(parts.box.width, parts.box.height),
  };
}

test('places the tooltip layer inside the chart, falling back to the raw point when unmeasured', () => {
  expect(useCssomTooltip(10, 10, true)).toBe(h.ref);

  // Nothing to position until the layer mounts and a point is hovered.
  const idle = fakeLayer({ chart: { width: 300, height: 200 }, box: { width: 80, height: 40 } });
  h.ref.current = idle;
  useCssomTooltip(undefined, 50, false);
  useCssomTooltip(50, undefined, false);
  expect(idle.style.setProperty).not.toHaveBeenCalled();

  // Centred above the point when it fits.
  useCssomTooltip(150, 100, true);
  expect(idle.style.setProperty.mock.calls).toEqual([['--tt-x', '110px'], ['--tt-y', '50px']]);

  // Near the right edge it flips to the left of the point.
  idle.style.setProperty.mockClear();
  useCssomTooltip(290, 100, true);
  expect(idle.style.setProperty.mock.calls).toEqual([['--tt-x', '200px'], ['--tt-y', '80px']]);

  // Without a chart or tooltip box to measure, the raw point is used.
  const detached = fakeLayer({ box: { width: 80, height: 40 } });
  h.ref.current = detached;
  useCssomTooltip(290, 100, true);
  expect(detached.style.setProperty.mock.calls).toEqual([['--tt-x', '290px'], ['--tt-y', '100px']]);

  const empty = fakeLayer({ chart: { width: 300, height: 200 } });
  h.ref.current = empty;
  useCssomTooltip(12, 34, true);
  expect(empty.style.setProperty.mock.calls).toEqual([['--tt-x', '12px'], ['--tt-y', '34px']]);

  h.ref.current = null;
  expect(() => useCssomTooltip(12, 34, true)).not.toThrow();
});
