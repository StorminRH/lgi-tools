import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildDemoBoard, FIXTURE_NOW } from '@/composition/board/demo-board';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) =>
    createElement('a', { ...props, href: String(href) }, children),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
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

const render = (variant: 'full' | 'one' | 'reconnect', sessionCharacterId?: number) =>
  renderToStaticMarkup(
    createElement(HomeBoardView, {
      board: buildDemoBoard(FIXTURE_NOW, variant),
      now: FIXTURE_NOW,
      sessionCharacterId,
    }),
  );

describe('HomeBoardView', () => {
  it('renders every tile, the roster totals and the first character sheet', () => {
    const html = render('full');
    for (const name of ['Aurel Vantesse', 'Kessa Draymoor', 'Torvin Hale', 'Ilyana Mirek', 'Bram Oskarsen']) {
      expect(html).toContain(name);
    }
    expect(html).toContain('4.11B ISK (3 of 5)');
    expect(html).toContain('aria-label="Aurel Vantesse character sheet"');
    expect(html).toContain('Queue ends in 9h');
    expect(html).toContain('Queue paused');
    expect(html).toContain('Skill queue is empty');
    expect(html).toContain('Recent wallet journal');
    expect(html).toContain('Attributes &amp; implants');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).not.toContain('esi-');
  });

  it('opens on the session character and shows one reconnect sentence for its gaps', () => {
    const ilyana = buildDemoBoard(FIXTURE_NOW, 'full').characters[3]!;
    const html = render('full', ilyana.characterId);
    expect(html).toContain('aria-label="Ilyana Mirek character sheet"');
    expect(html).toContain('Reconnect Ilyana Mirek to add wallet, clones, implants and structure names.');
    expect(html).toContain('Needs a reconnect to sync.');
  });

  it('renders a character with nothing synced without inventing numbers', () => {
    const bram = buildDemoBoard(FIXTURE_NOW, 'reconnect').characters[1]!;
    const html = render('reconnect', bram.characterId);
    expect(html).toContain('Reconnect Bram Oskarsen to start syncing it again.');
    expect(html).not.toContain('0.00 ISK');
  });
});

describe('board chrome', () => {
  it('renders the frame, skeleton, empty state and signed-out slot', () => {
    const framed = renderToStaticMarkup(createElement(BoardFrame, { demo: true, children: createElement(BoardEmpty) }));
    expect(framed).toContain('Your characters');
    expect(framed).toContain('Sample data');
    expect(framed.match(/class="[^"]*\breveal\b/g)).toHaveLength(1);
    expect(renderToStaticMarkup(createElement(BoardFrame, { children: createElement(BoardSkeleton) }))).toContain('live');
    expect(renderToStaticMarkup(createElement(HomeSignedInBoard))).toBe('');
    expect(renderToStaticMarkup(createElement(LiveBoard, { sessionCharacterId: 1 }))).toContain(
      'Loading your characters',
    );
  });
});
