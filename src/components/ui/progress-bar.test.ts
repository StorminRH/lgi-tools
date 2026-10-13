import { readFileSync } from 'node:fs';
import type { ReactElement } from 'react';
import { expect, test, vi } from 'vitest';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: <T>(callback: T) => callback,
}));

import { ProgressBar } from './progress-bar';

type Fill = ReactElement<{ readonly ref: (node: unknown) => void }>;

test('the fill takes its width as it attaches, and a newly shown bar still grows in from empty', () => {
  const track = ProgressBar({ pct: 42 }) as ReactElement<{ readonly children: Fill }>;
  const setProperty = vi.fn();
  track.props.children.props.ref({ style: { setProperty } });
  expect(setProperty.mock.calls).toEqual([['--pct', '42%']]);

  // That write lands before the first paint, so the 700ms width transition needs a starting
  // width to run from. It must follow the fill rule, which has the same specificity.
  const css = readFileSync('src/components/ui/progress-bar.css', 'utf8');
  const fillRule = css.indexOf('.progress-soft-fill {');
  const startingWidth = css.search(
    /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*@starting-style\s*\{\s*\.progress-soft-fill\s*\{\s*width:\s*0;?\s*\}/,
  );
  expect(fillRule).toBeGreaterThanOrEqual(0);
  expect(startingWidth).toBeGreaterThan(fillRule);
});
