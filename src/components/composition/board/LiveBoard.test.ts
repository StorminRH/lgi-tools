import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { buildDemoBoard, FIXTURE_NOW } from '@/composition/board/demo-board';
import type { useBoardLive } from './use-board-live';

const h = vi.hoisted(() => ({
  live: vi.fn(),
  retry: vi.fn(),
}));

vi.mock('./use-board-live', () => ({ useBoardLive: h.live }));

import { HomeBoardView } from './HomeBoardView';
import { LiveBoard } from './LiveBoard';

function live(overrides: Partial<ReturnType<typeof useBoardLive>>) {
  h.live.mockReturnValue({
    response: null,
    now: FIXTURE_NOW,
    loading: false,
    failed: false,
    retry: h.retry,
    ...overrides,
  } satisfies ReturnType<typeof useBoardLive>);
}

test('a failed board read offers an in-place retry, then the board shows the empty state or the pilots', () => {
  live({ loading: true });
  expect(renderToStaticMarkup(LiveBoard({ mainId: 7 }))).toContain('Loading your characters');

  live({ failed: true });
  const failure = LiveBoard({ mainId: 7 }) as ReactElement<{ onRetry: () => void }>;
  const failed = renderToStaticMarkup(failure);
  expect(failed).toContain('Your characters didn&#x27;t load');
  expect(failed).toContain('aria-label="Retry loading your characters"');
  expect(failed).not.toContain('Loading your characters');
  failure.props.onRetry();
  expect(h.retry).toHaveBeenCalledOnce();

  const board = buildDemoBoard(FIXTURE_NOW, 'full');
  live({ response: { ...board, characters: [] } });
  const empty = renderToStaticMarkup(LiveBoard({ mainId: 7 }));
  expect(empty).toContain('No characters linked.');
  expect(empty).not.toContain('Retry loading your characters');

  live({ response: board });
  const ready = LiveBoard({ mainId: 7 });
  expect(ready.type).toBe(HomeBoardView);
  expect(ready.props).toEqual({ board, now: FIXTURE_NOW, mainId: 7 });
});
