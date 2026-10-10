import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

// Next serves the app its canary React, which has <ViewTransition>; the stable
// React that vitest resolves does not, so stand in a pass-through.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ViewTransition: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/eve-image', () => ({
  EveImage: ({ alt }: { alt: string }) => createElement('span', { 'data-alt': alt }),
}));

import { PortraitRail, RailEntry } from './focus-rail';

test('a rail entry is the tile the focus view refocuses, dimmed when its character is not linked', () => {
  const onSelect = vi.fn();
  const member = { characterId: 101, name: 'Builder', tileAttribute: 'data-member-id', onSelect } as const;
  const rail = (entry: Parameters<typeof RailEntry>[0]) =>
    renderToStaticMarkup(PortraitRail({ label: 'Profile members', children: createElement(RailEntry, entry) }));

  const linked = rail(member);
  expect(linked).toMatch(/^<nav aria-label="Profile members"[^>]*><button /);
  expect(/<button[^>]*>/.exec(linked)?.[0]).toContain('data-member-id="101"');
  expect(linked).not.toContain('grayscale');

  const unlinked = rail({ ...member, dimmed: true, ariaLabel: 'Builder: Nothing assigned, not linked' });
  const button = /<button[^>]*>/.exec(unlinked)?.[0];
  expect(button).toContain('aria-label="Builder: Nothing assigned, not linked"');
  expect(button).toContain('data-member-id="101"');
  // The portrait greys out; the name beside it stays readable.
  expect(unlinked).toMatch(/class="[^"]*\bopacity-50 grayscale"><span data-alt="Builder"><\/span>/);
  expect(unlinked.match(/grayscale/g)).toHaveLength(1);

  const pilot = rail({ characterId: 9, name: 'Aurel', tileAttribute: 'data-pilot-id', onSelect });
  expect(/<button[^>]*>/.exec(pilot)?.[0]).toContain('data-pilot-id="9"');
  expect(pilot).not.toContain('data-member-id');

  RailEntry(member).props.onClick();
  expect(onSelect).toHaveBeenCalledWith(101);
});
