import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { BoardSection } from '@/composition/board/api-contract';
import { SectionBody, SectionNote } from './SectionBody';

function noteClasses(html: string): string[] {
  return /^<p class="([^"]*)">/.exec(html)?.[1]?.split(' ') ?? [];
}

test('a section note is a padded faint line, ruled off after content and red when it needs attention', () => {
  expect(renderToStaticMarkup(SectionNote({ children: 'No implants plugged in.' }))).toBe(
    '<p class="px-3.5 py-3 text-ui text-faint">No implants plugged in.</p>',
  );

  const divided = noteClasses(renderToStaticMarkup(SectionNote({ divided: true, children: 'No jump clones.' })));
  expect(divided).toEqual(
    expect.arrayContaining(['border-t', 'border-border-soft', 'px-3.5', 'py-3', 'text-faint']),
  );

  const alert = noteClasses(renderToStaticMarkup(SectionNote({ tone: 'alert', children: 'Nothing is training.' })));
  expect(alert).toContain('text-dps-high');
  expect(alert).not.toContain('text-faint');
  expect(alert).not.toContain('border-t');
});

test('a section body renders its rows once ready and the shared note while pending or awaiting a reconnect', () => {
  const render = (section: BoardSection<{ name: string }>) =>
    renderToStaticMarkup(SectionBody({ section, children: (data) => createElement('ul', null, data.name) }));

  expect(render({ state: 'ready', refreshedAt: 0, data: { name: 'Jita' } })).toBe('<ul>Jita</ul>');
  expect(render({ state: 'pending' })).toBe('<p class="px-3.5 py-3 text-ui text-faint">Syncing from EVE…</p>');
  expect(render({ state: 'reconnect' })).toBe(
    '<p class="px-3.5 py-3 text-ui text-faint">Needs a reconnect to sync.</p>',
  );
});
