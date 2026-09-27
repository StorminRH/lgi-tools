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

const render = (variant: 'full' | 'one' | 'reconnect', query = '', mainId?: number) => {
  search.params = new URLSearchParams(query);
  return renderToStaticMarkup(
    createElement(HomeBoardView, { board: buildDemoBoard(FIXTURE_NOW, variant), now: FIXTURE_NOW, mainId }),
  );
};

describe('HomeBoardView', () => {
  it('opens several pilots on the overview: a rail with each pilot’s state, then wealth and industry', () => {
    const html = render('full');
    for (const name of ['Aurel Vantesse', 'Kessa Draymoor', 'Torvin Hale', 'Ilyana Mirek', 'Bram Oskarsen']) {
      expect(html).toContain(name);
    }
    expect(html).toContain('aria-label="Pilot overview"');
    expect(html).not.toContain('Needs attention');
    expect(html).toContain('Wallet ISK · 3 of 5 pilots · since 28 Aug');
    expect(html).toContain('<span>Wealth</span>');
    expect(html).toContain('<span>Industry</span>');
    expect(html).toContain('ISK by pilot');
    expect(html).not.toContain('<span>Training</span>');
    expect(html).not.toContain('Whereabouts');
    expect(html).not.toContain('Skill points');
    expect(html).toContain('Caldari Cruiser');
    expect(html).toContain('Medium Drone Operation');
    expect(html).toContain('>Tama<');
    expect(html).toContain('Queue paused');
    expect(html).not.toContain('character sheet');
    expect(html).not.toContain('Attributes &amp; implants');
    expect(html).not.toContain('esi-');
  });

  it('puts the main pilot first in the rail', () => {
    const html = render('full', '', 9_900_000_003);
    expect(html.indexOf('data-pilot-id="9900000003"')).toBeLessThan(html.indexOf('data-pilot-id="9900000001"'));
  });

  it('opens the pilot named in the URL full width, with a way back and no rail', () => {
    const html = render('full', '?character=9900000001');
    expect(html).toContain('aria-label="Aurel Vantesse character sheet"');
    expect(html).toContain('Recent wallet journal');
    expect(html).toContain('Attributes &amp; implants');
    expect(html).toContain('All characters');
    expect(html).not.toContain('aria-label="Pilots"');
    expect(html).not.toContain('aria-label="Pilot overview"');
  });

  it('falls back to the overview for an unknown pilot', () => {
    expect(render('full', '?character=42')).toContain('aria-label="Pilot overview"');
  });

  it('shows a lone pilot its own sheet with no rail', () => {
    const html = render('one');
    expect(html).toContain('aria-label="Aurel Vantesse character sheet"');
    expect(html).not.toContain('aria-label="Pilots"');
    expect(html).not.toContain('All characters');
  });

  it('shows one reconnect sentence for a pilot with gaps', () => {
    const html = render('full', '?character=9900000004');
    expect(html).toContain('Reconnect Ilyana Mirek to add wallet, clones, implants and structure names.');
    expect(html).toContain('Needs a reconnect to sync.');
  });

  it('renders a pilot with nothing synced without inventing numbers', () => {
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
    expect(renderToStaticMarkup(createElement(LiveBoard, { mainId: 1 }))).toContain(
      'Loading your characters',
    );
  });
});
