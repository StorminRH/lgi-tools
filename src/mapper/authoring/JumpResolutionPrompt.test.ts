import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { JumpResolutionModel } from './jump-resolution';
import {
  JumpResolutionChoices,
  JumpResolutionPrompt,
} from './JumpResolutionPrompt';

const RESOLUTION: JumpResolutionModel = {
  connectionId: 'c1' as Id<'mapConnections'>,
  candidates: [
    {
      connectionId: 'c1' as Id<'mapConnections'>,
      signatureId: 'ABC-123',
      wormholeTypeCode: 'K162',
      isCurrent: true,
    },
    {
      connectionId: 'stub-2' as Id<'mapConnections'>,
      signatureId: 'DEF-456',
      wormholeTypeCode: null,
      isCurrent: false,
    },
  ],
};

/** Depth-first search over an element tree for a props predicate. */
function findElement(
  node: unknown,
  predicate: (props: Record<string, unknown>) => boolean,
): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as Record<string, unknown>;
  if (predicate(props)) return node;
  return findElement(props['children'], predicate);
}

describe('JumpResolutionPrompt', () => {
  it('lists the current pick with every alternative and a dismiss action', () => {
    const markup = renderToStaticMarkup(
      createElement(JumpResolutionPrompt, {
        resolution: RESOLUTION,
        answers: { onConfirm: vi.fn(), onCorrect: vi.fn() },
        onDismiss: vi.fn(),
      }),
    );
    expect(markup).toContain('data-map-jump-prompt');
    expect(markup).toContain('ABC-123 · K162');
    expect(markup).toContain('data-map-jump-confirm');
    expect(markup).toContain('data-map-jump-correct="stub-2"');
    expect(markup).toContain('DEF-456 · Unidentified');
    expect(markup).toContain('data-map-jump-dismiss');
  });

  it('dispatches confirm and per-candidate correct answers', () => {
    const onConfirm = vi.fn();
    const onCorrect = vi.fn();
    // Hook-free component: inspect its element tree and press the buttons.
    const tree = JumpResolutionChoices({
      resolution: RESOLUTION,
      answers: { onConfirm, onCorrect },
    });

    const confirm = findElement(
      tree,
      (props) => props['data-map-jump-confirm'] !== undefined,
    );
    expect(confirm).not.toBeNull();
    (confirm!.props as { onClick: () => void }).onClick();
    expect(onConfirm).toHaveBeenCalledOnce();

    const correct = findElement(
      tree,
      (props) => props['data-map-jump-correct'] === 'stub-2',
    );
    expect(correct).not.toBeNull();
    (correct!.props as { onClick: () => void }).onClick();
    expect(onCorrect).toHaveBeenCalledWith('stub-2');
  });
});
