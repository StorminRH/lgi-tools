import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { ChainNode } from '../canvas/SystemNode';
import { deriveFogReveals, sameFogReveals, type FogRevealSet } from './fog-model';
import { useStableValue } from './use-stable-value';

function node(id: number, x: number): ChainNode {
  return {
    id: String(id),
    type: 'chainSystem',
    position: { x, y: 0 },
    data: { name: `S${id}`, className: null },
  };
}

// The server renderer re-runs a component after a render-phase state update
// with its hook state intact, so one static render drives a real re-render
// sequence without a DOM.
function renderSequence(sequence: readonly FogRevealSet[]): FogRevealSet[] {
  const seen = new Map<number, FogRevealSet>();
  function Harness() {
    const [step, setStep] = useState(0);
    seen.set(step, useStableValue(sequence[step]!, sameFogReveals));
    if (step < sequence.length - 1) setStep(step + 1);
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  return sequence.map((_, step) => seen.get(step)!);
}

test('keeps the first reveals reference until reveals actually change', () => {
  const first = deriveFogReveals([node(1, 0)], []);
  const equal = deriveFogReveals([node(1, 0)], []);
  const moved = deriveFogReveals([node(1, 50)], []);
  const movedAgain = deriveFogReveals([node(1, 50)], []);

  const rendered = renderSequence([first, equal, moved, movedAgain]);

  expect(rendered[0]).toBe(first);
  expect(rendered[1]).toBe(first);
  expect(rendered[2]).toBe(moved);
  expect(rendered[3]).toBe(moved);
});
