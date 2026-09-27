import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildDemoBoard, FIXTURE_NOW } from '@/composition/board/demo-board';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) =>
    createElement('a', { ...props, href: String(href) }, children),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
// Next serves the app its canary React, which has <ViewTransition>; the stable
// React that vitest resolves does not, so stand in a pass-through.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ViewTransition: ({ children }: { children: React.ReactNode }) => children,
}));
const search = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => search.params }));
vi.mock('@/components/eve-image', () => ({
  EveImage: ({ family, alt }: { family: string; alt: string }) =>
    createElement('span', { 'data-eve-image-family': family, 'data-alt': alt }),
}));

import { BoardEmpty } from './BoardEmpty';
import { BoardFrame } from './BoardFrame';
import { BoardSkeleton } from './BoardSkeleton';
import { HomeBoardView } from './HomeBoardView';
import { HomeSignedInBoard } from './HomeSignedInBoard';
import { LiveBoard } from './LiveBoard';

const render = (variant: 'full' | 'one' | 'reconnect', query = '') => {
  search.params = new URLSearchParams(query);
  return renderToStaticMarkup(
    createElement(HomeBoardView, { board: buildDemoBoard(FIXTURE_NOW, variant), now: FIXTURE_NOW }),
  );
};

describe('HomeBoardView', () => {
  it('opens on the roster: every pilot, the totals and no sheet', () => {
    const html = render('full');
    for (const name of ['Aurel Vantesse', 'Kessa Draymoor', 'Torvin Hale', 'Ilyana Mirek', 'Bram Oskarsen']) {
      expect(html).toContain(name);
    }
    expect(html).toContain('4.11B ISK (3 of 5)');
    expect(html).toContain('Queue ends in 9h');
    expect(html).toContain('Queue paused');
    expect(html).toContain('Skill queue is empty');
    expect(html).not.toContain('character sheet');
    expect(html).not.toContain('esi-');
  });

  it('opens the character named in the URL with every readout', () => {
    const html = render('full', '?character=9900000001');
    expect(html).toContain('aria-label="Aurel Vantesse character sheet"');
    expect(html).toContain('All characters');
    expect(html).toContain('Recent wallet journal');
    expect(html).toContain('Attributes &amp; implants');
    expect(html).not.toContain('aria-label="Characters"');
  });

  it('falls back to the roster for an unknown character', () => {
    expect(render('full', '?character=42')).toContain('aria-label="Characters"');
  });

  it('shows one reconnect sentence for a character with gaps', () => {
    const html = render('full', '?character=9900000004');
    expect(html).toContain('Reconnect Ilyana Mirek to add wallet, clones, implants and structure names.');
    expect(html).toContain('Needs a reconnect to sync.');
  });

  it('renders a character with nothing synced without inventing numbers', () => {
    const html = render('reconnect', '?character=9900000005');
    expect(html).toContain('Reconnect Bram Oskarsen to start syncing it again.');
    expect(html).not.toContain('0.00 ISK');
  });
});

describe('board chrome', () => {
  it('renders the frame, skeleton, empty state and signed-out slot', () => {
    const framed = renderToStaticMarkup(BoardFrame({ demo: true, children: createElement(BoardEmpty) }));
    expect(framed).toContain('Your characters');
    expect(framed).toContain('Sample data');
    expect(framed.match(/class="[^"]*\breveal\b/g)).toHaveLength(1);
    expect(renderToStaticMarkup(BoardFrame({ children: createElement(BoardSkeleton) }))).toContain('live');
    expect(renderToStaticMarkup(createElement(HomeSignedInBoard))).toBe('');
    expect(renderToStaticMarkup(createElement(LiveBoard))).toContain(
      'Loading your characters',
    );
  });
});
