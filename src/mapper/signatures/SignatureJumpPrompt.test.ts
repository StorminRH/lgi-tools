import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { JumpResolutionModel } from './jump-resolution';
import { SignatureJumpPrompt } from './SignatureJumpPrompt';

const buttonProps = vi.hoisted(() => vi.fn());

vi.mock('@/components/ui/button', async () => {
  const { createElement: element } = await import('react');
  return {
    Button: (props: Record<string, unknown>) => {
      buttonProps(props);
      return element('button', props, props['children'] as never);
    },
  };
});

const RESOLUTION: JumpResolutionModel = {
  connectionId: 'c1' as Id<'mapConnections'>,
  destination: { label: 'J123456 - C4', tone: 'text-wh-c4' },
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

beforeEach(() => buttonProps.mockClear());

it('shows ordered matcher survivors and dispatches the exact picked button', () => {
  const onPick = vi.fn();
  const markup = renderToStaticMarkup(
    createElement(SignatureJumpPrompt, {
      resolution: RESOLUTION,
      onPick,
    }),
  );

  expect(markup).toContain('data-signature-jump-prompt');
  expect(markup).toContain('data-identity-readout');
  expect(markup).toContain('J123456 - C4');
  expect(markup).toContain('Which signature did you jump through?');
  expect(markup.indexOf('ABC-123 · K162')).toBeLessThan(
    markup.indexOf('DEF-456 · Unidentified'),
  );
  expect(markup).not.toContain('Confirm');
  expect(markup).not.toContain('Dismiss');

  const alternative = buttonProps.mock.calls
    .map(([props]) => props as Record<string, unknown>)
    .find(
      (props) =>
        props['data-signature-jump-candidate'] === 'stub-2',
    );
  expect(alternative).toBeDefined();
  (alternative?.['onClick'] as () => void)();
  expect(onPick).toHaveBeenCalledWith(RESOLUTION.candidates[1]);
});
